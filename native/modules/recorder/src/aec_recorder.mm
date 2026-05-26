#include "aec_recorder.h"
#include "webrtc_aec_wrapper.h"
#include "wav_file_writer.h"
#include "audio_system_capture.h"
#include "ring_buffer.h"
#include "mac_permission.h"
#include "logger.h"
#include "resampler.h"
#include "ducker.h"

#import <AVFoundation/AVFoundation.h>

#include <vector>
#include <algorithm>
#include <cmath>
#include <atomic>
#include <cstring>
#include <cstdio>
#include <memory>

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
static const int kSampleRate       = 48000;
static const int kChannels         = 1;   // mono
static const int kFramesPerBuffer  = 480; // 10 ms @ 48 kHz

// Ring buffer holds up to 4 seconds of mono float32 system audio.
// Lock-free SPSC allows a smaller buffer vs the old mutex-based design.
static const int kRingBufferSize   = kSampleRate * 4;

// ---------------------------------------------------------------------------
// AECRecorder::Impl  (defined entirely in .mm – can use ObjC ivars)
// ---------------------------------------------------------------------------
class AECRecorder::Impl {
public:
    Impl();
    ~Impl();

    bool    Prepare();
    void    Dispose();

    bool    StartCapture();
    void    StopCapture();
    bool    PauseCapture();
    bool    ResumeCapture();

    void    SetMixedPCMCallback(AECRecorder::MixedPCMCallback cb);

    bool    SetOutputFile(const std::string& path);
    bool    SetWhisperOutputFile(const std::string& path);
    std::string GetOutputFilePath() const;
    int64_t GetOutputFileSize() const;

    void    SetMicGain(float g);
    void    SetSystemGain(float g);
    void    SetAECEnabled(bool en);

    bool    IsCapturing() const;

private:
    // ---- Callbacks (called from the audio realtime threads) ----------------
    void OnMicData(AVAudioPCMBuffer* buffer);
    void OnSystemAudioData(const AudioBufferList* bufferList,
                           UInt32 frames,
                           UInt32 channels,
                           Float64 sampleRate);

    // Called when audio hardware changes (e.g. headset plugged in).
    void HandleConfigurationChange();

    // ---- Members -----------------------------------------------------------
    WebRTCAECWrapper             aec_;
    WAVFileWriter                wav_writer_;
    WAVFileWriter                whisper_wav_writer_;
    WAVFileWriter                debug_aec_writer_;    // AEC output only (echo-cancelled voice)
    WAVFileWriter                debug_far_writer_;    // far-end reference (system audio tap)
    AudioSystemCapture           system_capture_;
    RingBuffer                   far_ring_buffer_;   // system audio samples
    int                          mic_sample_rate_{0};

    FILE*                        debug_mic_file_{nullptr};
    FILE*                        debug_mixed_file_{nullptr};

    AVAudioEngine* __strong      audio_engine_;
    id __strong                  config_change_obs_;    // AVAudioEngineConfigurationChange observer
    std::string                  output_file_path_;
    std::string                  whisper_output_path_;

    AECRecorder::MixedPCMCallback mixed_pcm_callback_;
    std::unique_ptr<Resampler>   resampler_;         // 48k → 16k for Whisper
    std::unique_ptr<Resampler>   sys_resampler_;     // system rate → 48k for AEC
    std::unique_ptr<Resampler>   mic_resampler_;     // mic rate → 48k (if needed)

    // Pre-allocated buffers for real-time audio threads
    std::vector<float>           mono_buffer_;
    std::vector<float>           resample_buffer_;

    std::atomic<bool>            capturing_{false};
    std::atomic<bool>            disposing_{false};
    std::atomic<bool>            warmup_{false};       // AEC pre-convergence, output discarded

    float                        mic_gain_{1.0f};
    float                        sys_gain_{1.0f};
    Ducker                       ducker_;
    float                        far_level_smooth_{0.0f};  // slow far-end peak for mix balance
    // Far-end reference level calibration (locked after warmup)
    double                       far_energy_acc_{0.0};     // sum of squares during warmup
    double                       mic_energy_acc_{0.0};
    int64_t                      calib_samples_{0};
    float                        far_ref_gain_{1.0f};      // mic/far RMS ratio, locked after warmup
};

// ============================================================================
// Public AECRecorder (delegates to Impl)
// ============================================================================

AECRecorder::AECRecorder()
    : impl_(std::make_unique<Impl>()) {}

AECRecorder::~AECRecorder() = default;

bool AECRecorder::Prepare()                    { return impl_->Prepare(); }
void AECRecorder::Dispose()                    { impl_->Dispose(); }

bool AECRecorder::StartCapture()               { return impl_->StartCapture(); }
void AECRecorder::StopCapture()                { impl_->StopCapture(); }
bool AECRecorder::PauseCapture()               { return impl_->PauseCapture(); }
bool AECRecorder::ResumeCapture()              { return impl_->ResumeCapture(); }

void AECRecorder::SetMixedPCMCallback(MixedPCMCallback cb) { impl_->SetMixedPCMCallback(std::move(cb)); }

bool AECRecorder::SetOutputFile(const std::string& p)      { return impl_->SetOutputFile(p); }
bool AECRecorder::SetWhisperOutputFile(const std::string& p) { return impl_->SetWhisperOutputFile(p); }
std::string AECRecorder::GetOutputFilePath() const          { return impl_->GetOutputFilePath(); }
int64_t AECRecorder::GetOutputFileSize() const              { return impl_->GetOutputFileSize(); }

void AECRecorder::SetMicGain(float g)          { impl_->SetMicGain(g); }
void AECRecorder::SetSystemGain(float g)       { impl_->SetSystemGain(g); }
void AECRecorder::SetAECEnabled(bool en)       { impl_->SetAECEnabled(en); }

bool AECRecorder::IsCapturing() const          { return impl_->IsCapturing(); }

int AECRecorder::CheckSystemAudioPermission()  { return ::CheckSystemAudioPermission(); }
bool AECRecorder::RequestSystemAudioPermission() { return ::RequestSystemAudioPermission(); }

// ============================================================================
// Impl – construction / destruction
// ============================================================================

AECRecorder::Impl::Impl()
    : far_ring_buffer_(kRingBufferSize)
    , audio_engine_(nil)
    , config_change_obs_(nil) {
}

AECRecorder::Impl::~Impl() {
    Dispose();
}

// ============================================================================
// Prepare – one-time setup of audio graph and AEC
// ============================================================================

bool AECRecorder::Impl::Prepare() {
    @autoreleasepool {
        // 1. Create AVAudioEngine
        audio_engine_ = [[AVAudioEngine alloc] init];
        if (!audio_engine_) {
            Logger::error("AECRecorder: failed to create AVAudioEngine");
            return false;
        }

        // 2. Get the microphone's actual format and use it for the tap.
        //    The tap format MUST match the hardware input format.
        AVAudioInputNode* inputNode = audio_engine_.inputNode;
        AVAudioFormat* micFormat = [inputNode inputFormatForBus:0];
        mic_sample_rate_ = static_cast<int>(micFormat.sampleRate);
        Logger::info("AECRecorder: mic format - sampleRate: %f, channels: %d",
                     micFormat.sampleRate, micFormat.channelCount);

        // 3. Install the mic tap block on the input node
        // Capture `this` directly.  The disposing_ atomic flag is checked
        // at the top of OnMicData, and Dispose() stops the engine before
        // the Impl object is destroyed, so the captured pointer is safe.
        AECRecorder::Impl* impl = this;
        @try {
            [inputNode installTapOnBus:0
                            bufferSize:(AVAudioFrameCount)kFramesPerBuffer
                                format:micFormat
                                 block:^(AVAudioPCMBuffer* _Nonnull buf,
                                         AVAudioTime* _Nonnull when) {
                if (!impl->disposing_.load()) {
                    impl->OnMicData(buf);
                }
            }];
        } @catch (NSException *exception) {
            Logger::error("AECRecorder: mic tap failed (no permission?): %s",
                          [[exception description] UTF8String]);
            return false;
        }

        // 4. Initialize the AEC wrapper
        if (!aec_.Initialize(kSampleRate, kChannels)) {
            Logger::error("AECRecorder: WebRTCAECWrapper init failed");
            return false;
        }

        // 5. Register the system audio callback
        system_capture_.SetAudioDataCallback(
            [this](const AudioBufferList* abl,
                   UInt32 frames,
                   UInt32 ch,
                   const AudioTimeStamp* ts,
                   Float64 sampleRate) {
                if (!disposing_.load() && (capturing_.load() || warmup_.load())) {
                    this->OnSystemAudioData(abl, frames, ch, sampleRate);
                }
            });

        // 6. Listen for audio hardware changes (headset plug/unplug, etc.)
        //    AVAudioEngine invalidates taps on config change; we must re-install.
        //    Safe: observer is removed in Dispose() before audio_engine_ is released.
        AECRecorder::Impl* implForObs = this;
        config_change_obs_ = [[NSNotificationCenter defaultCenter]
            addObserverForName:AVAudioEngineConfigurationChangeNotification
                        object:audio_engine_
                         queue:nil
                    usingBlock:^(NSNotification* _Nonnull note) {
            if (!implForObs->disposing_.load()) {
                implForObs->HandleConfigurationChange();
            }
        }];

        Logger::info("AECRecorder: prepared (%d Hz, %d ch, %d frames/10ms)",
                      kSampleRate, kChannels, kFramesPerBuffer);
        return true;
    }
}

// ============================================================================
// HandleConfigurationChange – re-install mic tap after hardware change
// ============================================================================

void AECRecorder::Impl::HandleConfigurationChange() {
    @autoreleasepool {
        // Bail if Dispose() was called before this handler ran.
        if (disposing_.load()) return;

        Logger::info("AECRecorder: audio engine config changed, re-installing tap");

        // 1. Re-install the mic tap. The existing tap was invalidated by the config
        //    change; the input node may also have a new hardware format.
        AVAudioInputNode* inputNode = audio_engine_.inputNode;
        [inputNode removeTapOnBus:0];

        AVAudioFormat* micFormat = [inputNode inputFormatForBus:0];
        mic_sample_rate_ = static_cast<int>(micFormat.sampleRate);
        mic_resampler_.reset();

        AECRecorder::Impl* impl = this;
        [inputNode installTapOnBus:0
                        bufferSize:(AVAudioFrameCount)kFramesPerBuffer
                            format:micFormat
                             block:^(AVAudioPCMBuffer* _Nonnull buf,
                                     AVAudioTime* _Nonnull when) {
            if (!impl->disposing_.load()) {
                impl->OnMicData(buf);
            }
        }];

        // 2. Reset the AEC, flush the ring buffer, and re-calibrate the
        //    far-end reference gain. After a device switch the echo path and
        //    level ratios change dramatically. Resetting everything forces
        //    re-convergence from scratch.
        aec_.Reset();
        ducker_.Reset();
        far_ring_buffer_.clear();
        far_energy_acc_ = 0.0;
        mic_energy_acc_ = 0.0;
        calib_samples_ = 0;
        far_ref_gain_ = 1.0f;

        // 3. Restart the engine. AVAudioEngine auto-pauses on configuration changes
        //    (e.g. headset plug/unplug). Without this call the tap is installed but
        //    no callbacks fire — the recording silently produces zero data.
        NSError* error = nil;
        [audio_engine_ startAndReturnError:&error];
        if (error) {
            Logger::error("AECRecorder: failed to restart engine after config change: %s",
                          [[error localizedDescription] UTF8String]);
        }

        // 4. Recreate the system audio capture tap device on the main thread.
        //    The old aggregate device was tied to the previous output hardware;
        //    after a device switch (headphones ↔ speakers) its sub-device list
        //    is stale and the tap may not capture the current output correctly.
        //    Deferring to the main thread avoids calling CoreAudio device-creation
        //    APIs from the AVAudioEngine notification queue.
        dispatch_async(dispatch_get_main_queue(), ^{
            if (!impl->disposing_.load()) {
                Logger::info("AECRecorder: recreating system capture after config change");
                system_capture_.StopRecording();
                if (system_capture_.CreateTapDevice()) {
                    [NSThread sleepForTimeInterval:0.1];
                    system_capture_.StartRecording();
                    Logger::info("AECRecorder: system capture recreated successfully");
                } else {
                    Logger::warn("AECRecorder: failed to recreate system capture after config change, continuing mic-only");
                }
            }
        });

        Logger::info("AECRecorder: tap re-installed and engine restarted, sampleRate=%d",
                     mic_sample_rate_);
    }
}

// ============================================================================
// Dispose – full teardown
// ============================================================================

void AECRecorder::Impl::Dispose() {
    disposing_.store(true);

    StopCapture();

    @autoreleasepool {
        if (config_change_obs_) {
            [[NSNotificationCenter defaultCenter] removeObserver:config_change_obs_];
            config_change_obs_ = nil;
        }
        if (audio_engine_) {
            // Remove the tap before releasing the engine
            AVAudioInputNode* inputNode = audio_engine_.inputNode;
            [inputNode removeTapOnBus:0];
            audio_engine_ = nil;
        }
    }

    aec_.Destroy();

    if (wav_writer_.IsOpen()) {
        wav_writer_.Close();
    }
    if (whisper_wav_writer_.IsOpen()) {
        whisper_wav_writer_.Close();
    }
    // resampler_ is destroyed automatically by unique_ptr
    output_file_path_.clear();
    whisper_output_path_.clear();

    Logger::info("AECRecorder: disposed");
}

// ============================================================================
// StartCapture / StopCapture
// ============================================================================

bool AECRecorder::Impl::StartCapture() {
    if (capturing_.load()) return true;

    @autoreleasepool {
        // 1. Try to create the system audio tap device (optional - mic-only
        //    mode works without it; AEC simply gets no far-end reference).
        bool hasSystemAudio = false;
        if (system_capture_.CreateTapDevice()) {
            [NSThread sleepForTimeInterval:0.1];
            hasSystemAudio = true;
        } else {
            Logger::warn("AECRecorder: CreateTapDevice failed, continuing mic-only");
        }

        // 2. Open WAV file if a path has been configured
        if (!output_file_path_.empty()) {
            if (!wav_writer_.Open(output_file_path_, kSampleRate, kChannels, 16)) {
                Logger::error("AECRecorder: failed to open WAV: %s",
                              output_file_path_.c_str());
            }
        }

        // Open whisper WAV file (16kHz mono)
        if (!whisper_output_path_.empty()) {
            if (!whisper_wav_writer_.Open(whisper_output_path_, 16000, 1, 16)) {
                Logger::warn("AECRecorder: failed to open whisper WAV (non-fatal)");
            }
        }
        if (!resampler_) {
            resampler_ = std::make_unique<Resampler>(48000, 16000);
        }

        // 3. Start system capture + mic ENGINE FIRST, then let AEC
        //    pre-converge before we begin writing any output.
        if (hasSystemAudio) {
            if (!system_capture_.StartRecording()) {
                Logger::warn("AECRecorder: system capture start failed, continuing mic-only");
            }
            [NSThread sleepForTimeInterval:0.5];
        }

        NSError* error = nil;
        [audio_engine_ startAndReturnError:&error];
        if (error) {
            Logger::error("AECRecorder: AVAudioEngine start error: %s",
                          [[error localizedDescription] UTF8String]);
            if (wav_writer_.IsOpen()) wav_writer_.Close();
            if (hasSystemAudio) system_capture_.StopRecording();
            return false;
        }

        // 4. Brief settling: let the audio callbacks fire briefly so that
        //    ring buffers and Core Audio aggregate device stabilize.
        //    WebRTC AEC3 converges rapidly on its own and does not need
        //    a dedicated warmup phase — the echo suppressor handles initial
        //    convergence within the first few frames.
        warmup_.store(true);
        [NSThread sleepForTimeInterval:0.2];
        warmup_.store(false);
        Logger::info("AECRecorder: settling complete, capture starting");

        // 5. Reset dynamic state.
        ducker_.Reset();
        far_level_smooth_ = 0.0f;
        capturing_.store(true);
        Logger::info("AECRecorder: capture started (hasSystemAudio=%s)",
                     hasSystemAudio ? "yes" : "no");

        // Debug: AEC analysis WAVs — set DEBUG_AEC=1 to enable.
        // Writes to /tmp/debug_{mic,aec,mixed}.wav (48kHz mono float).
        // Open in Audacity to compare timing alignment and AEC convergence.
        if (const char* e = getenv("DEBUG_AEC"); e && strcmp(e, "1") == 0) {
            debug_mic_file_ = fopen("/tmp/debug_mic.f32", "wb");
            debug_mixed_file_ = fopen("/tmp/debug_mixed.f32", "wb");
            debug_aec_writer_.Open("/tmp/debug_aec.wav", kSampleRate, 1, 16);
            debug_far_writer_.Open("/tmp/debug_far.wav", kSampleRate, 1, 16);
            Logger::info("AECRecorder: debug files enabled (/tmp/debug_*)");
        }

        return true;
    }
}

void AECRecorder::Impl::StopCapture() {
    if (!capturing_.load()) return;

    @autoreleasepool {
        // Stop the mic tap first – no new callbacks.
        [audio_engine_ pause];
        capturing_.store(false);
        warmup_.store(false);           // Signal callbacks to stop immediately
        [NSThread sleepForTimeInterval:0.02]; // Let in-flight callbacks drain

        // Then stop system audio capture.
        system_capture_.StopRecording();

        // Finalize WAV file.
        if (wav_writer_.IsOpen()) {
            wav_writer_.Close();
        }
        if (whisper_wav_writer_.IsOpen()) {
            whisper_wav_writer_.Close();
        }
        // resampler_ is owned by unique_ptr; will be destroyed on Dispose()

        Logger::info("AECRecorder: capture stopped");

        // Close debug files
        if (debug_mic_file_)    { fclose(debug_mic_file_);    debug_mic_file_    = nullptr; }
        if (debug_mixed_file_)  { fclose(debug_mixed_file_);  debug_mixed_file_  = nullptr; }
        if (debug_aec_writer_.IsOpen()) { debug_aec_writer_.Close(); }
        if (debug_far_writer_.IsOpen())  { debug_far_writer_.Close(); }
    }
}

bool AECRecorder::Impl::PauseCapture() {
    if (!capturing_.load()) return false;

    @autoreleasepool {
        [audio_engine_ pause];
        capturing_.store(false);
        warmup_.store(false);
        [NSThread sleepForTimeInterval:0.02];
        system_capture_.StopRecording();
        Logger::info("AECRecorder: capture paused");
        return true;
    }
}

bool AECRecorder::Impl::ResumeCapture() {
    if (capturing_.load()) return false;

    @autoreleasepool {
        NSError* error = nil;
        [audio_engine_ startAndReturnError:&error];
        if (error) {
            Logger::error("AECRecorder: resume error: %s",
                          [[error localizedDescription] UTF8String]);
            return false;
        }
        system_capture_.StartRecording();
        capturing_.store(true);
        Logger::info("AECRecorder: capture resumed");
        return true;
    }
}

// ============================================================================
// Setters / getters
// ============================================================================

void AECRecorder::Impl::SetMixedPCMCallback(AECRecorder::MixedPCMCallback cb) {
    mixed_pcm_callback_ = std::move(cb);
}

bool AECRecorder::Impl::SetOutputFile(const std::string& path) {
    // Close any previously opened file.
    if (wav_writer_.IsOpen()) {
        wav_writer_.Close();
    }
    output_file_path_ = path;
    Logger::info("AECRecorder: output file set to %s",
                 path.empty() ? "(none)" : path.c_str());
    return true;  // actual open happens on StartCapture
}

bool AECRecorder::Impl::SetWhisperOutputFile(const std::string& path) {
    if (whisper_wav_writer_.IsOpen()) {
        whisper_wav_writer_.Close();
    }
    whisper_output_path_ = path;
    Logger::info("AECRecorder: whisper output file set to %s",
                 path.empty() ? "(none)" : path.c_str());
    return true;
}

std::string AECRecorder::Impl::GetOutputFilePath() const {
    return wav_writer_.GetFilePath();
}

int64_t AECRecorder::Impl::GetOutputFileSize() const {
    return wav_writer_.GetBytesWritten();
}

void AECRecorder::Impl::SetMicGain(float g)    { mic_gain_ = g; }
void AECRecorder::Impl::SetSystemGain(float g)  { sys_gain_ = g; }
void AECRecorder::Impl::SetAECEnabled(bool en)  { aec_.SetEnabled(en); }
bool AECRecorder::Impl::IsCapturing() const     { return capturing_.load(); }

// ============================================================================
// OnSystemAudioData – called from CoreAudio I/O thread (REAL-TIME SAFE)
// ============================================================================

void AECRecorder::Impl::OnSystemAudioData(const AudioBufferList* bufferList,
                                           UInt32 frames,
                                           UInt32 channels,
                                           Float64 sampleRate) {
    if (!bufferList || bufferList->mNumberBuffers == 0) return;

    const AudioBuffer& buf = bufferList->mBuffers[0];
    if (!buf.mData || buf.mDataByteSize == 0) return;

    const float* src      = static_cast<const float*>(buf.mData);
    int          srcFrames = static_cast<int>(frames);

    // Pre-allocated downmix buffer (no heap alloc after initial resize).
    mono_buffer_.resize(static_cast<size_t>(srcFrames));
    float* mono = mono_buffer_.data();

    if (channels == 1) {
        std::memcpy(mono, src,
                    static_cast<size_t>(srcFrames) * sizeof(float));
    } else {
        for (int i = 0; i < srcFrames; ++i) {
            float sum = 0.0f;
            for (UInt32 c = 0; c < channels; ++c) {
                sum += src[static_cast<size_t>(i) * channels + c];
            }
            mono[static_cast<size_t>(i)] = sum / static_cast<float>(channels);
        }
    }

    // Resample to AEC target rate using the quality SRC resampler.
    if (static_cast<int>(sampleRate) != kSampleRate) {
        if (!sys_resampler_ ||
            sys_resampler_->input_rate() != static_cast<int>(sampleRate)) {
            sys_resampler_ = std::make_unique<Resampler>(
                static_cast<int>(sampleRate), kSampleRate);
        }
        int outFrames = sys_resampler_->GetOutputFrameCount(srcFrames);
        resample_buffer_.resize(static_cast<size_t>(outFrames));
        int actual = sys_resampler_->ProcessToBuffer(
            mono, srcFrames, resample_buffer_.data(), outFrames);
        if (actual > 0) {
            far_ring_buffer_.write(resample_buffer_.data(),
                                    static_cast<size_t>(actual));
        }
    } else {
        far_ring_buffer_.write(mono, static_cast<size_t>(srcFrames));
    }
}

// ============================================================================
// OnMicData – called from AVAudioEngine tap thread
// ============================================================================

void AECRecorder::Impl::OnMicData(AVAudioPCMBuffer* buffer) {
    if (!capturing_.load() && !warmup_.load()) return;
    bool isWarmup = warmup_.load();

    float*       micRaw    = buffer.floatChannelData[0];
    AVAudioFrameCount frameCount = buffer.frameLength;
    int           micFrames = static_cast<int>(frameCount);
    if (micFrames <= 0) return;

    // Detect mic sample rate changes (device plug/unplug during recording).
    int bufferSampleRate = static_cast<int>(buffer.format.sampleRate);
    if (bufferSampleRate > 0 && bufferSampleRate != mic_sample_rate_) {
        Logger::info("AECRecorder: mic sample rate changed: %d → %d",
                     mic_sample_rate_, bufferSampleRate);
        mic_sample_rate_ = bufferSampleRate;
        mic_resampler_.reset();
    }

    // Resample mic to the AEC target rate if necessary.
    int aecFrames = micFrames;
    std::vector<float> micAtTargetRate;
    if (mic_sample_rate_ != 0 && mic_sample_rate_ != kSampleRate) {
        if (!mic_resampler_) {
            mic_resampler_ = std::make_unique<Resampler>(mic_sample_rate_,
                                                          kSampleRate);
        }
        micAtTargetRate = mic_resampler_->Process(micRaw, micFrames);
        aecFrames = static_cast<int>(micAtTargetRate.size());
        micRaw = micAtTargetRate.data();
    }
    if (aecFrames <= 0) return;

    // Write raw mic to debug file (only on main thread after AEC processed)
    if (debug_mic_file_) {
        fwrite(micRaw, sizeof(float), static_cast<size_t>(aecFrames), debug_mic_file_);
    }

    // ---------- Chunked processing -----------------------------------------
    // 3A pipeline operates on 10ms blocks (kFramesPerBuffer = 480 @ 48kHz).
    // The mic tap may deliver larger blocks, so we process in chunks.
    // Ceiling-divide so we never drop remainder frames.
    const int chunkSize = kFramesPerBuffer;  // 480 frames = 10ms
    int numChunks = (aecFrames + chunkSize - 1) / chunkSize;
    int paddedFrames = numChunks * chunkSize;

    // Zero-pad the mic input so the last chunk always has full 480 frames.
    // The AEC requires fixed-size frames; padded silence at the tail is harmless.
    std::vector<float> micPadded;
    if (paddedFrames > aecFrames) {
        micPadded.resize(static_cast<size_t>(paddedFrames), 0.0f);
        std::memcpy(micPadded.data(), micRaw,
                    static_cast<size_t>(aecFrames) * sizeof(float));
        micRaw = micPadded.data();
    }

    std::vector<float> mixed(static_cast<size_t>(paddedFrames), 0.0f);
    std::vector<float> aecOut(static_cast<size_t>(chunkSize), 0.0f);
    std::vector<float> farChunk(static_cast<size_t>(chunkSize), 0.0f);

    // Track peak values across all chunks for diagnostic
    float peakMic = 0.0f, peakFar = 0.0f, peakAec = 0.0f, peakMix = 0.0f;

    for (int ch = 0; ch < numChunks; ++ch) {
        int offset = ch * chunkSize;
        float* micChunk = micRaw + offset;

        // Read corresponding far-end chunk from ring buffer
        if (far_ring_buffer_.available_read() >= static_cast<size_t>(chunkSize)) {
            far_ring_buffer_.read(farChunk.data(), static_cast<size_t>(chunkSize));
        } else {
            std::fill(farChunk.begin(), farChunk.end(), 0.0f);
        }

        // Track far-end peak (single pass)
        float chunkFarPeak = 0.0f;
        for (int i = 0; i < chunkSize; ++i) {
            float af = std::fabs(farChunk[i]);
            chunkFarPeak = std::max(chunkFarPeak, af);
            peakFar = std::max(peakFar, af);
        }

        // ---- Far-end reference level calibration (diagnostic only) ------------
        // Accumulate mic + far energy during warmup to log the gain ratio.
        // NOT applied to the signal — AEC3 internally normalizes both streams;
        // external level manipulation causes clipping distortion.
        constexpr int64_t kMaxCalibSamples = 48000 * 5; // 5s @ 48kHz
        if (calib_samples_ < kMaxCalibSamples) {
            for (int i = 0; i < chunkSize; ++i) {
                double fs = static_cast<double>(farChunk[i]);
                double ms = static_cast<double>(micChunk[i]);
                far_energy_acc_ += fs * fs;
                mic_energy_acc_ += ms * ms;
            }
            calib_samples_ += chunkSize;
            if (calib_samples_ > 4800 && far_energy_acc_ > 1e-10) {
                float gain = static_cast<float>(
                    std::sqrt(mic_energy_acc_ / far_energy_acc_));
                far_ref_gain_ = gain;
            }
        }

        // Process through 3A pipeline (AEC + AGC2 + ANS).
        aec_.Process(micChunk, farChunk.data(), aecOut.data(), chunkSize);

        // Track peaks after 3A processing
        for (int i = 0; i < chunkSize; ++i) {
            peakAec = std::max(peakAec, std::fabs(aecOut[i]));
        }

        // Write AEC output to debug WAV (echo-cancelled voice, no mix)
        if (debug_aec_writer_.IsOpen()) {
            std::vector<int16_t> aecI16(static_cast<size_t>(chunkSize));
            for (int i = 0; i < chunkSize; ++i) {
                float s = aecOut[i];
                if (s < -1.0f) s = -1.0f;
                if (s >  1.0f) s =  1.0f;
                aecI16[static_cast<size_t>(i)] = static_cast<int16_t>(s * 32767.0f);
            }
            debug_aec_writer_.Write(aecI16.data(), static_cast<size_t>(chunkSize));
        }

        // Write far-end reference to debug WAV (raw system audio tap)
        if (debug_far_writer_.IsOpen()) {
            std::vector<int16_t> farI16(static_cast<size_t>(chunkSize));
            for (int i = 0; i < chunkSize; ++i) {
                float s = farChunk[i];
                if (s < -1.0f) s = -1.0f;
                if (s >  1.0f) s =  1.0f;
                farI16[static_cast<size_t>(i)] = static_cast<int16_t>(s * 32767.0f);
            }
            debug_far_writer_.Write(farI16.data(), static_cast<size_t>(chunkSize));
        }

        // Ducking: dB-domain compressor on aecOut sidechain.
        float duckGain = ducker_.Process(aecOut.data(), chunkSize);

        // Slow far-end level normalization for transcription quality.
        // Smoothed peak of system audio with ~5s time constant.
        // Attenuates loud system audio to ~-12dBFS, matching AGC2 voice level.
        // Quiet system audio is left unchanged (gain ≤ 1.0, no boost).
        far_level_smooth_ += 0.002f * (chunkFarPeak - far_level_smooth_);
        constexpr float kFarMixTarget = 0.25f;  // -12dBFS
        float farMixNorm = 1.0f;
        if (far_level_smooth_ > 0.001f) {
            farMixNorm = std::min(kFarMixTarget / far_level_smooth_, 1.0f);
        }

        // Mix: AEC-processed voice + level-balanced system audio.
        // effSysGain = sys_gain × duckGain × normalization — the ducker
        // provides per-chunk attenuation on top of the slow level balance.
        {
            float effSysGain = sys_gain_ * duckGain * farMixNorm;
            for (int i = 0; i < chunkSize; ++i) {
                float v = aecOut[i] * mic_gain_ + farChunk[i] * effSysGain;
                mixed[static_cast<size_t>(offset + i)] = v;
                peakMix = std::max(peakMix, std::fabs(v));
            }
        }
    }

    // Track mic peak (raw input, before AEC)
    for (int i = 0; i < aecFrames; ++i) {
        peakMic = std::max(peakMic, std::fabs(micRaw[i]));
    }

    // Write debug mixed file
    if (debug_mixed_file_) {
        fwrite(mixed.data(), sizeof(float), static_cast<size_t>(aecFrames), debug_mixed_file_);
    }

    // Diagnose every 5 callbacks (~500ms)
    static int logCounter = 0;
    if (++logCounter % 5 == 0) {
        Logger::info("3A: mic=%.6f far=%.6f out=%.6f mix=%.6f chunks=%d ringAvail=%zu",
                     peakMic, peakFar, peakAec, peakMix, numChunks, far_ring_buffer_.available_read());
    }

    // During warmup, everything below is skipped — AEC converges but no output
    if (!isWarmup) {
        // ---------- 4. Apply limiter to prevent clipping --------------------
        if (peakMix > 1.0f) {
            float scale = 1.0f / peakMix;
            for (int i = 0; i < aecFrames; ++i) {
                mixed[static_cast<size_t>(i)] *= scale;
            }
        }

        // ---------- 5. Convert to int16 and write WAV -----------------------
        std::vector<int16_t> wavSamples(static_cast<size_t>(aecFrames));
        for (int i = 0; i < aecFrames; ++i) {
            float s = mixed[static_cast<size_t>(i)];
            if (s < -1.0f) s = -1.0f;
            if (s >  1.0f) s =  1.0f;
            wavSamples[static_cast<size_t>(i)] =
                static_cast<int16_t>(s * 32767.0f);
        }

        if (wav_writer_.IsOpen()) {
            wav_writer_.Write(wavSamples.data(),
                              static_cast<size_t>(aecFrames));
        }

        // Write 16kHz mono for Whisper
        if (whisper_wav_writer_.IsOpen()) {
            int whisperFrames = resampler_->GetOutputFrameCount(aecFrames);
            auto whisperSamples = resampler_->Process(mixed.data(), aecFrames);
            std::vector<int16_t> wav16(static_cast<size_t>(whisperFrames));
            for (int i = 0; i < whisperFrames; ++i) {
                float s = whisperSamples[static_cast<size_t>(i)];
                if (s < -1.0f) s = -1.0f;
                if (s >  1.0f) s =  1.0f;
                wav16[static_cast<size_t>(i)] = static_cast<int16_t>(s * 32767.0f);
            }
            whisper_wav_writer_.Write(wav16.data(), static_cast<size_t>(whisperFrames));
        }

        // ---------- 6. Dispatch to JS callback ------------------------------
        if (mixed_pcm_callback_) {
            mixed_pcm_callback_(mixed.data(), aecFrames, kSampleRate);
        }
    }
}
