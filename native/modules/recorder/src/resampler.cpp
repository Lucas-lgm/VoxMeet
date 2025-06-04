#include "resampler.h"
#include <cmath>
#include <cstring>
#include <algorithm>

Resampler::Resampler(int inputRate, int outputRate, int numChannels)
    : input_rate_(inputRate)
    , output_rate_(outputRate)
    , channels_(numChannels) {}

int Resampler::GetOutputFrameCount(int inputFrames) const {
    double ratio = static_cast<double>(output_rate_) / input_rate_;
    return static_cast<int>(std::ceil(inputFrames * ratio));
}

std::vector<float> Resampler::Process(const float* input, int numFrames) {
    if (!input || numFrames <= 0) return {};
    double ratio = static_cast<double>(output_rate_) / input_rate_;
    int outputFrames = GetOutputFrameCount(numFrames);
    std::vector<float> result(static_cast<size_t>(outputFrames * channels_), 0.0f);

    for (int ch = 0; ch < channels_; ++ch) {
        for (size_t i = 0; i < static_cast<size_t>(outputFrames); ++i) {
            double srcPos = static_cast<double>(i) / ratio;
            int srcIdx = static_cast<int>(srcPos) * channels_ + ch;
            double frac = srcPos - std::floor(srcPos);

            if (srcIdx / channels_ >= numFrames - 1) {
                result[static_cast<size_t>(i * channels_ + ch)] =
                    input[static_cast<size_t>((numFrames - 1) * channels_ + ch)];
            } else {
                double a = input[static_cast<size_t>(srcIdx)];
                double b = input[static_cast<size_t>(srcIdx + channels_)];
                result[static_cast<size_t>(i * channels_ + ch)] =
                    static_cast<float>(a + frac * (b - a));
            }
        }
    }
    return result;
}
