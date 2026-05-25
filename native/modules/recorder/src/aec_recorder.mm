#include "aec_recorder.h"
#include "webrtc_aec_wrapper.h"
#include "wav_file_writer.h"
#include "audio_system_capture.h"
#include "ring_buffer.h"
#include "mac_permission.h"
#include "logger.h"
#include "resampler.h"

#import <AVFoundation/AVFoundation.h>

#include <vector>
#include <algorithm>
#include <cmath>
#include <mutex>
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

// Ring buffer holds up to 10 seconds of mono float32 system audio.
static const int kRingBufferSize   = kSampleRate * 10;

// ---------------------------------------------------------------------------
// Resampling helper (linear interpolation)
// ---------------------------------------------------------------------------
static std::vector<float> ResampleToRate(const float* input,
                                          int inputFrames,
                                          int inputRate,
                                          int outputRate) {
    if (inputRate == outputRate || inputFrames <= 0) {
        return std::vector<float>(input, input + inputFrames);
    }

    double ratio = static_cast<double>(outputRate) / inputRate;
    int outputFrames = static_cast<int>(std::ceil(inputFrames * ratio));
    std::vector<float> result(static_cast<size_t>(outputFrames), 0.0f);

    for (int i = 0; i < outputFrames; ++i) {
        double srcPos = static_cast<double>(i) / ratio;
        int srcIdx = static_cast<int>(srcPos);
        double frac = srcPos - srcIdx;

        if (srcIdx >= inputFrames - 1) {
            result[static_cast<size_t>(i)] = input[inputFrames - 1];
        } else {
            result[static_cast<size_t>(i)] =
                static_cast<float>(
                    (1.0 - frac) * input[srcIdx] + frac * input[srcIdx + 1]);
        }
    }
    return result;
}

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

    // ---- Members -----------------------------------------------------------
    WebRTCAECWrapper             aec_;
    WAVFileWriter                wav_writer_;
    WAVFileWriter                whisper_wav_writer_;
    AudioSystemCapture           system_capture_;
    RingBuffer                   far_ring_buffer_;   // system audio samples
    int                          mic_sample_rate_{0};

    FILE*                        debug_mic_file_{nullptr};
    FILE*                        debug_mixed_file_{nullptr};

    AVAudioEngine* __strong      audio_engine_;
    std::string                  output_file_path_;
    std::string                  whisper_output_path_;

    AECRecorder::MixedPCMCallback mixed_pcm_callback_;
    std::unique_ptr<Resampler>   resampler_;

    std::atomic<bool>            capturing_{false};
    std::atomic<bool>            disposing_{false};

    float                        mic_gain_{1.0f};
    float                        sys_gain_{1.0f};
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
    , audio_engine_(nil) {
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
                if (!disposing_.load() && capturing_.load()) {
                    this->OnSystemAudioData(abl, frames, ch, sampleRate);
                }
            });

        Logger::info("AECRecorder: prepared (%d Hz, %d ch, %d frames/10ms)",
                      kSampleRate, kChannels, kFramesPerBuffer);
        return true;
    }
}

// ============================================================================
// Dispose – full teardown
// ============================================================================

void AECRecorder::Impl::Dispose() {
    disposing_.store(true);

    StopCapture();

    @autoreleasepool {
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
                // Non-fatal – capture can proceed without file output.
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

        // 3. Start the AVAudioEngine (mic tap begins delivering data).
        NSError* error = nil;
        [audio_engine_ startAndReturnError:&error];
        if (error) {
            Logger::error("AECRecorder: AVAudioEngine start error: %s",
                          [[error localizedDescription] UTF8String]);
            if (wav_writer_.IsOpen()) wav_writer_.Close();
            return false;
        }

        // 4. Start receiving system audio (if available).
        if (hasSystemAudio) {
            if (!system_capture_.StartRecording()) {
                Logger::warn("AECRecorder: system capture start failed, continuing mic-only");
            }
        }

        capturing_.store(true);
        Logger::info("AECRecorder: capture started (hasSystemAudio=%s)",
                     hasSystemAudio ? "yes" : "no");

        // Open debug files (disabled by default — uncomment for AEC debugging)
        // debug_mic_file_ = fopen("/tmp/aec_debug_mic.f32", "wb");
        // debug_mixed_file_ = fopen("/tmp/aec_debug_mixed.f32", "wb");

        return true;
    }
}

void AECRecorder::Impl::StopCapture() {
    if (!capturing_.load()) return;

    @autoreleasepool {
        // Stop the mic tap first – no new callbacks.
        [audio_engine_ pause];
        capturing_.store(false);         // Signal callbacks to stop immediately
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

        // Close debug files (disabled — uncomment for AEC debugging)
        // if (debug_mic_file_) { fclose(debug_mic_file_); debug_mic_file_ = nullptr; }
        // if (debug_mixed_file_) { fclose(debug_mixed_file_); debug_mixed_file_ = nullptr; }
    }
}

bool AECRecorder::Impl::PauseCapture() {
    if (!capturing_.load()) return false;

    @autoreleasepool {
        [audio_engine_ pause];
        capturing_.store(false);
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
// OnSystemAudioData – called from CoreAudio I/O thread
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

    // Convert multi-channel interleaved to mono.
    std::vector<float> mono(static_cast<size_t>(srcFrames), 0.0f);
    if (channels == 1) {
        std::memcpy(mono.data(), src,
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

    // Resample to the target rate if necessary.
    std::vector<float> out;
    if (static_cast<int>(sampleRate) != kSampleRate) {
        out = ResampleToRate(mono.data(), srcFrames,
                             static_cast<int>(sampleRate), kSampleRate);
    } else {
        out = std::move(mono);
    }

    // Push into the ring buffer.  If the buffer is full we simply drop the
    // data – the AEC will use zeros for those frames.
    if (!out.empty()) {
        far_ring_buffer_.write(out.data(), out.size());
    }
}

// ============================================================================
// OnMicData – called from AVAudioEngine tap thread
// ============================================================================

void AECRecorder::Impl::OnMicData(AVAudioPCMBuffer* buffer) {
    if (!capturing_.load()) return;

    float*       micRaw    = buffer.floatChannelData[0];
    AVAudioFrameCount frameCount = buffer.frameLength;
    int           micFrames = static_cast<int>(frameCount);
    if (micFrames <= 0) return;

    // Resample mic to the AEC target rate if necessary.
    int aecFrames = micFrames;
    std::vector<float> micAtTargetRate;
    if (mic_sample_rate_ != 0 && mic_sample_rate_ != kSampleRate) {
        micAtTargetRate = ResampleToRate(micRaw, micFrames,
                                         mic_sample_rate_, kSampleRate);
        aecFrames = static_cast<int>(micAtTargetRate.size());
        micRaw = micAtTargetRate.data();
    }
    if (aecFrames <= 0) return;

    // Write raw mic to debug file (disabled — uncomment for AEC debugging)
    // if (debug_mic_file_) {
    //     fwrite(micRaw, sizeof(float), aecFrames, debug_mic_file_);
    //     fflush(debug_mic_file_);
    // }

    // ---------- Chunked processing -----------------------------------------
    // 3A pipeline operates on 10ms blocks (kFramesPerBuffer = 480 @ 48kHz).
    // The mic tap may deliver larger blocks, so we process in chunks.
    const int chunkSize = kFramesPerBuffer;  // 480 frames = 10ms
    int numChunks = aecFrames / chunkSize;

    std::vector<float> mixed(static_cast<size_t>(aecFrames), 0.0f);
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

        // Track far-end peak
        for (int i = 0; i < chunkSize; ++i) {
            peakFar = std::max(peakFar, std::fabs(farChunk[i]));
        }

        // Process through 3A pipeline (AEC → AGC → ANS)
        std::fill(aecOut.begin(), aecOut.end(), 0.0f);
        aec_.Process(micChunk, farChunk.data(), aecOut.data(), chunkSize);

        // Track peaks after 3A processing
        for (int i = 0; i < chunkSize; ++i) {
            peakAec = std::max(peakAec, std::fabs(aecOut[i]));
        }

        // Mix: AEC output (already processed through AEC → AGC → ANS pipeline)
        // with system audio at natural level for a complete conversation recording.
        {
            for (int i = 0; i < chunkSize; ++i) {
                float v = aecOut[i] * mic_gain_ + farChunk[i] * sys_gain_;
                mixed[static_cast<size_t>(offset + i)] = v;
                peakMix = std::max(peakMix, std::fabs(v));
            }
        }
    }

    // Track mic peak (raw input, before AEC)
    for (int i = 0; i < aecFrames; ++i) {
        peakMic = std::max(peakMic, std::fabs(micRaw[i]));
    }

    // Write debug mixed file (disabled — uncomment for AEC debugging)
    // if (debug_mixed_file_) {
    //     fwrite(mixed.data(), sizeof(float), aecFrames, debug_mixed_file_);
    //     fflush(debug_mixed_file_);
    // }

    // Diagnose every 5 callbacks (~500ms)
    static int logCounter = 0;
    if (++logCounter % 5 == 0) {
        Logger::info("3A: mic=%.6f far=%.6f out=%.6f mix=%.6f chunks=%d ringAvail=%zu",
                     peakMic, peakFar, peakAec, peakMix, numChunks, far_ring_buffer_.available_read());
    }

    // ---------- 4. Convert to int16 and write WAV -------------------------
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

    // ---------- 5. Dispatch to JS callback --------------------------------
    if (mixed_pcm_callback_) {
        mixed_pcm_callback_(mixed.data(), aecFrames, kSampleRate);
    }
}
