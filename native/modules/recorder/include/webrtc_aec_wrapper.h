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

    void SetEnabled(bool enabled);
    bool IsEnabled() const;

private:
    void* apm_ = nullptr;      // webrtc::AudioProcessing*
    bool enabled_ = true;
    int sample_rate_ = 0;
    int channels_ = 0;
    int frames_per_buffer_ = 0;
};
