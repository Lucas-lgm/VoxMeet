#include "webrtc_aec_wrapper.h"
#include "logger.h"
#include "modules/audio_processing/include/audio_processing.h"

#include <algorithm>
#include <cstring>
#include <vector>

WebRTCAECWrapper::WebRTCAECWrapper() = default;

WebRTCAECWrapper::~WebRTCAECWrapper() {
    Destroy();
}

bool WebRTCAECWrapper::Initialize(int sampleRate, int channels) {
    if (apm_) {
        Logger::warn("WebRTCAECWrapper: already initialized");
        return true;
    }

    sample_rate_ = sampleRate;
    channels_ = channels;
    frames_per_buffer_ = sampleRate / 100; // 10ms

    try {
        webrtc::AudioProcessing::Config config;
        config.pipeline.multi_channel_render = true;
        config.pipeline.multi_channel_capture = true;
        // --- 3A pipeline: AEC + AGC + ANS ---
        config.echo_canceller.enabled = true;
        config.echo_canceller.mobile_mode = false;

        // AGC2: adaptive digital gain control — normalizes mic level after AEC.
        // Temporarily disabled as it may over-attenuate voice when far-end is loud:
        // AGC2's VAD can confuse residual echo with speech, causing it to normalize
        // to the residual echo level instead of the actual voice level.
        // TODO: re-enable with tuned headroom_db and fixed_digital gain if needed.
        config.gain_controller2.enabled = false;

        // Noise suppression: disabled to isolate voice loss issue.
        // When far-end is loud, residual echo after AEC can confuse the
        // noise suppressor, causing it to remove voice components.
        config.noise_suppression.enabled = false;

        // High-pass filter: removes DC offset and low-frequency rumble.
        config.high_pass_filter.enabled = true;

        auto apm = webrtc::AudioProcessingBuilder()
            .SetConfig(config)
            .Create();

        if (!apm) {
            Logger::error("WebRTCAECWrapper: failed to create AudioProcessing");
            return false;
        }

        // Initialize with stream configuration
        webrtc::ProcessingConfig processing_config = {
            webrtc::StreamConfig(sampleRate, static_cast<size_t>(channels)),   // input
            webrtc::StreamConfig(sampleRate, static_cast<size_t>(channels)),   // output
            webrtc::StreamConfig(sampleRate, static_cast<size_t>(channels)),   // reverse input
            webrtc::StreamConfig(sampleRate, static_cast<size_t>(channels))    // reverse output
        };

        int ret = apm->Initialize(processing_config);
        if (ret != 0) {
            Logger::error("WebRTCAECWrapper: Initialize returned %d", ret);
            return false;
        }

        apm_ = static_cast<void*>(apm.release());
        Logger::info("WebRTCAECWrapper: initialized (%dHz, %dch)", sampleRate, channels);
        return true;
    } catch (const std::exception& e) {
        Logger::error("WebRTCAECWrapper: initialization exception: %s", e.what());
        return false;
    }
}

void WebRTCAECWrapper::Destroy() {
    if (apm_) {
        auto* apm = static_cast<webrtc::AudioProcessing*>(apm_);
        apm->Release();
        apm_ = nullptr;
    }
}

void WebRTCAECWrapper::Reset() {
    if (!apm_) return;
    Logger::info("WebRTCAECWrapper: resetting APM state (filter, delay estimator, AGC, NS)");
    Destroy();
    // Re-initialize with the same sample rate and channel count.
    // Initialize() skips if apm_ is already set; since we just destroyed it,
    // it will recreate the APM with a fresh internal state.
    Initialize(sample_rate_, channels_);
}

void WebRTCAECWrapper::Process(const float* near_data,
                                const float* far_data,
                                float* output,
                                int frames) {
    auto* apm = static_cast<webrtc::AudioProcessing*>(apm_);
    if (!apm || !enabled_) {
        // Passthrough: copy near to output
        if (output && near_data) {
            std::memcpy(output, near_data,
                       static_cast<size_t>(frames) * static_cast<size_t>(channels_) * sizeof(float));
        }
        return;
    }

    int total_samples = frames * channels_;
    if (total_samples <= 0) {
        return;
    }

    // Allocate deinterleaved buffers
    std::vector<float> near_buf(static_cast<size_t>(total_samples));
    std::vector<float> far_buf(static_cast<size_t>(total_samples), 0.0f);
    std::vector<float> out_buf(static_cast<size_t>(total_samples), 0.0f);

    // Build deinterleaved channel pointer arrays
    std::vector<float*> near_ptrs(static_cast<size_t>(channels_));
    std::vector<float*> far_ptrs(static_cast<size_t>(channels_));
    std::vector<float*> out_ptrs(static_cast<size_t>(channels_));

    for (int ch = 0; ch < channels_; ++ch) {
        near_ptrs[static_cast<size_t>(ch)] = &near_buf[static_cast<size_t>(ch) * static_cast<size_t>(frames)];
        far_ptrs[static_cast<size_t>(ch)] = &far_buf[static_cast<size_t>(ch) * static_cast<size_t>(frames)];
        out_ptrs[static_cast<size_t>(ch)] = &out_buf[static_cast<size_t>(ch) * static_cast<size_t>(frames)];
    }

    // Deinterleave near (microphone) input: interleaved [s0ch0, s0ch1, ..., s1ch0, s1ch1, ...]
    for (int ch = 0; ch < channels_; ++ch) {
        for (int s = 0; s < frames; ++s) {
            near_buf[static_cast<size_t>(ch) * static_cast<size_t>(frames) + static_cast<size_t>(s)] =
                near_data[static_cast<size_t>(s) * static_cast<size_t>(channels_) + static_cast<size_t>(ch)];
        }
    }

    // Deinterleave far (reference) input (if provided; otherwise stays zeroed)
    if (far_data) {
        for (int ch = 0; ch < channels_; ++ch) {
            for (int s = 0; s < frames; ++s) {
                far_buf[static_cast<size_t>(ch) * static_cast<size_t>(frames) + static_cast<size_t>(s)] =
                    far_data[static_cast<size_t>(s) * static_cast<size_t>(channels_) + static_cast<size_t>(ch)];
            }
        }
    }

    // Const-correctness: create const pointer arrays for input
    // ProcessStream and ProcessReverseStream accept const float* const* for input
    // and float* const* for output.
    std::vector<const float*> near_const_ptrs(near_ptrs.begin(), near_ptrs.end());
    std::vector<const float*> far_const_ptrs(far_ptrs.begin(), far_ptrs.end());

    webrtc::StreamConfig stream_config(sample_rate_, static_cast<size_t>(channels_));

    // Step 1: Process reverse stream (far-end / reference / system audio)
    // This feeds the AEC with the reference signal it needs to identify echo.
    apm->ProcessReverseStream(far_const_ptrs.data(), stream_config, stream_config,
                               far_ptrs.data());

    // Step 2: Set the stream delay (in ms) between playout and capture.
    // 20ms is a reasonable estimate for desktop: acoustic delay
    // (speaker → air → mic ~5ms) + audio buffer latency (~10-15ms).
    // The AEC's internal delay estimator will adjust around this value.
    apm->set_stream_delay_ms(20);

    // Step 3: Process the capture stream (near-end / microphone).
    // The AEC removes echo using the reference signal fed in step 1.
    int ret = apm->ProcessStream(near_const_ptrs.data(), stream_config, stream_config,
                                  out_ptrs.data());

    // If AEC processing failed, fall back to raw mic passthrough
    if (ret != webrtc::AudioProcessing::kNoError) {
        Logger::warn("WebRTCAECWrapper: ProcessStream returned %d, fallback to passthrough", ret);
        std::memcpy(output, near_data,
                   static_cast<size_t>(total_samples) * sizeof(float));
        return;
    }

    // Step 4: Interleave output back to planar interleaved format
    if (output) {
        for (int ch = 0; ch < channels_; ++ch) {
            for (int s = 0; s < frames; ++s) {
                output[static_cast<size_t>(s) * static_cast<size_t>(channels_) + static_cast<size_t>(ch)] =
                    out_buf[static_cast<size_t>(ch) * static_cast<size_t>(frames) + static_cast<size_t>(s)];
            }
        }
    }
}

void WebRTCAECWrapper::SetEnabled(bool enabled) {
    enabled_ = enabled;
    Logger::info("WebRTCAECWrapper: AEC %s", enabled ? "enabled" : "disabled");
}

bool WebRTCAECWrapper::IsEnabled() const {
    return enabled_;
}
