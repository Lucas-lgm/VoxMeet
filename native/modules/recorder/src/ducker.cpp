#include "ducker.h"
#include <cmath>

// ---------------------------------------------------------------------------
// Ducking parameters
// ---------------------------------------------------------------------------
static constexpr float kThreshold   = 0.05f;   // RMS threshold for near-end speech (~-26dBFS)
static constexpr float kDepth       = 0.20f;   // gain when ducked (~14dB reduction)
static constexpr float kAttackCoef  = 0.632f;  // 1 - exp(-0.01/0.01)
static constexpr float kReleaseCoef = 0.020f;  // 1 - exp(-0.01/0.50)
static constexpr int   kHoldFrames  = 3840;    // 80ms @ 48kHz (8 chunks × 480)

Ducker::Ducker() = default;

float Ducker::Process(const float* sidechain, int frames) {
    // RMS of the sidechain (3A-processed near-end)
    float sumSq = 0.0f;
    for (int i = 0; i < frames; ++i) {
        sumSq += sidechain[i] * sidechain[i];
    }
    float rms = std::sqrt(sumSq / static_cast<float>(frames));

    // Hold timer: reset when active, count down when silent
    if (rms > kThreshold) {
        hold_ = kHoldFrames;
    } else if (hold_ > 0) {
        hold_ -= frames;
    }
    bool shouldDuck = (hold_ > 0);

    // Attack/release smoothing
    float target = shouldDuck ? kDepth : 1.0f;
    float coeff  = shouldDuck ? kAttackCoef : kReleaseCoef;
    gain_ += coeff * (target - gain_);

    return gain_;
}

void Ducker::Reset() {
    gain_ = 1.0f;
    hold_ = 0;
}
