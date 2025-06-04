#pragma once
#include <vector>

// Simple linear interpolation resampler for 48kHz → 16kHz (ratio = 1/3).
// Also handles other input/output rate combinations.
class Resampler {
public:
    Resampler(int inputRate, int outputRate, int numChannels = 1);
    std::vector<float> Process(const float* input, int numFrames);
    int GetOutputFrameCount(int inputFrames) const;
private:
    int input_rate_;
    int output_rate_;
    int channels_;
};
