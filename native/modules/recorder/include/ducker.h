#pragma once

// dB-domain sidechain ducker — behaves like a broadcast compressor.
//
// When the sidechain RMS exceeds the threshold, gain reduction is applied
// proportionally: reduction_dB = overshoot_dB × ratio, clamped to range.
// Attack/release smoothing prevents audible pumping.
//
// Usage:
//   Ducker ducker;
//   // per 10ms chunk:
//   float gain = ducker.Process(aecOutput, frames);
//   // gain is in (10^(-range/20), 1.0] — apply to system audio in mix
class Ducker {
public:
    Ducker();

    // Returns linear gain for the target signal (system audio in mix).
    // 1.0 = no reduction, kRangeLin = max reduction.
    float Process(const float* sidechain, int frames);

    void Reset();

private:
    // -- dB-domain parameters ------------------------------------------------
    static constexpr float kThresholdDB = -18.0f; // RMS threshold (dBFS)
    static constexpr float kRatio       =  3.0f;  // compression ratio
    static constexpr float kRangeDB     = 24.0f;  // max attenuation (dB)

    // -- smoothing -----------------------------------------------------------
    static constexpr float kAttackMs    =  2.0f;  // attack time
    static constexpr float kReleaseMs   = 150.0f; // release time
    static constexpr float kHoldMs      =  80.0f; // hold after sidechain drops

    // -- state ---------------------------------------------------------------
    float    reduction_db_      = 0.0f;  // current smoothed gain reduction (dB)
    int      hold_samples_      = 0;     // remaining hold in samples
    float    last_overshoot_db_ = 0.0f;  // sustained during hold
    int      sample_rate_       = 0;     // cached for coeff calculation
    float    attack_coef_       = 0.0f;
    float    release_coef_      = 0.0f;
};
