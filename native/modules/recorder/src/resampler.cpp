#include "resampler.h"
#include <algorithm>
#include <cstring>
#include <samplerate.h>

Resampler::Resampler(int inputRate, int outputRate)
    : input_rate_(inputRate)
    , output_rate_(outputRate) {}

Resampler::~Resampler() {
    if (src_state_)
        src_delete(src_state_);
}

void Resampler::EnsureState() {
    if (src_state_)
        return;
    int error = 0;
    src_state_ = src_new(SRC_SINC_MEDIUM_QUALITY, 1, &error);
    if (!src_state_)
        return;
    double ratio = static_cast<double>(output_rate_) / input_rate_;
    src_set_ratio(src_state_, ratio);
}

int Resampler::GetOutputFrameCount(int inputFrames) const {
    double ratio = static_cast<double>(output_rate_) / input_rate_;
    return static_cast<int>(std::ceil(inputFrames * ratio));
}

std::vector<float> Resampler::Process(const float* input, int numFrames) {
    if (!input || numFrames <= 0) return {};
    EnsureState();
    if (!src_state_) {
        // Fallback: return a copy of the input (no SRC state available)
        return std::vector<float>(input, input + numFrames);
    }

    int outputFrames = GetOutputFrameCount(numFrames);
    std::vector<float> result(static_cast<size_t>(outputFrames), 0.0f);

    double ratio = static_cast<double>(output_rate_) / input_rate_;
    SRC_DATA data;
    data.data_in       = input;
    data.data_out      = result.data();
    data.input_frames  = numFrames;
    data.output_frames = outputFrames;
    data.end_of_input  = 0;
    data.src_ratio     = ratio;

    int err = src_process(src_state_, &data);
    if (err != 0) {
        // Fallback: copy as-is
        size_t copy = std::min<size_t>(static_cast<size_t>(numFrames), result.size());
        std::copy(input, input + copy, result.begin());
        return result;
    }

    result.resize(static_cast<size_t>(data.output_frames_gen));
    return result;
}

int Resampler::ProcessToBuffer(const float* input, int numFrames,
                                float* output, int maxOutputFrames) {
    if (!input || numFrames <= 0 || !output || maxOutputFrames <= 0)
        return 0;
    EnsureState();
    if (!src_state_) {
        int copy = std::min(numFrames, maxOutputFrames);
        std::copy(input, input + copy, output);
        return copy;
    }

    double ratio = static_cast<double>(output_rate_) / input_rate_;
    SRC_DATA data;
    data.data_in       = input;
    data.data_out      = output;
    data.input_frames  = numFrames;
    data.output_frames = maxOutputFrames;
    data.end_of_input  = 0;
    data.src_ratio     = ratio;

    int err = src_process(src_state_, &data);
    if (err != 0) {
        int copy = std::min(numFrames, maxOutputFrames);
        std::copy(input, input + copy, output);
        return copy;
    }
    return static_cast<int>(data.output_frames_gen);
}

void Resampler::SetRates(int inputRate, int outputRate) {
    input_rate_  = inputRate;
    output_rate_ = outputRate;
    if (src_state_) {
        double ratio = static_cast<double>(outputRate) / inputRate;
        src_set_ratio(src_state_, ratio);
        src_reset(src_state_);
    }
}
