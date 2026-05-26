#pragma once
#include <samplerate.h>
#include <vector>

// Quality sample-rate converter using libsamplerate (SRC_SINC_MEDIUM_QUALITY).
class Resampler {
public:
    Resampler(int inputRate, int outputRate);
    ~Resampler();

    Resampler(const Resampler&) = delete;
    Resampler& operator=(const Resampler&) = delete;
    Resampler(Resampler&&) = delete;
    Resampler& operator=(Resampler&&) = delete;

    std::vector<float> Process(const float* input, int numFrames);

    // Real-time safe variant: writes into pre-allocated output buffer.
    // Returns number of frames actually written (<= maxOutputFrames).
    int ProcessToBuffer(const float* input, int numFrames,
                        float* output, int maxOutputFrames);
    int GetOutputFrameCount(int inputFrames) const;

    int input_rate() const { return input_rate_; }
    void SetRates(int inputRate, int outputRate);

private:
    void EnsureState();

    SRC_STATE* src_state_{nullptr};
    int input_rate_;
    int output_rate_;
};
