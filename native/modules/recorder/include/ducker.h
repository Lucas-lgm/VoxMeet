#pragma once

#include <cstddef>

// Sidechain ducker: attenuates a signal based on another signal's energy.
// Industry-standard design: RMS detection → hold timer → attack/release smoothing.
//
// Usage:
//   Ducker ducker;
//   // each ~10ms chunk:
//   float gain = ducker.Process(aecOutput, frames);
//   for (int i = 0; i < frames; ++i)
//       mixed[i] = near[i] + far[i] * gain;
class Ducker {
public:
    Ducker();

    // Feed the sidechain signal (near-end after AEC/AGC/NS).
    // Returns the current ducking gain in [kDepth, 1.0].
    float Process(const float* sidechain, int frames);

    // Reset state for a new recording session.
    void Reset();

private:
    float gain_ = 1.0f;
    int   hold_ = 0;
};
