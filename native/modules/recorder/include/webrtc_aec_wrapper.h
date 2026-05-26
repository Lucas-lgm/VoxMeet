#pragma once

#include <cstdint>

class WebRTCAECWrapper {
public:
    WebRTCAECWrapper();
    ~WebRTCAECWrapper();

    bool Initialize(int sampleRate, int channels);
    void Destroy();

    // near: microphone input (with echo)
    // far:  system audio reference signal
    // output: AEC-processed clean audio
    void Process(const float* near_data,
                 const float* far_data,
                 float* output,
                 int frames);

    // Destroy and re-create the APM instance, resetting all internal state
    // (adaptive filter coefficients, delay estimator, AGC, NS, HPF).
    // Call this after a device change to force re-convergence.
    void Reset();

    void SetEnabled(bool enabled);
    bool IsEnabled() const;

private:
    void* apm_ = nullptr;      // webrtc::AudioProcessing*
    bool enabled_ = true;
    int sample_rate_ = 0;
    int channels_ = 0;
    int frames_per_buffer_ = 0;
};
