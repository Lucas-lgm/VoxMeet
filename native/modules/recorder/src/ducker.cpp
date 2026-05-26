#include "ducker.h"
#include <algorithm>
#include <cmath>

// ---------------------------------------------------------------------------
// dB-domain sidechain ducker — broadcast-compressor model
// ---------------------------------------------------------------------------
// kThresholdDB = -18 dBFS  →  10^(-18/20) ≈ 0.126  linear RMS
// kRangeDB     =  24 dB    →  max attenuation factor ≈ 0.063
// kRatio       =   3:1     →  3 dB reduction per 1 dB overshoot
// ---------------------------------------------------------------------------

static constexpr float kThresholdLin = 0.126f;  // 10^(-18/20)

Ducker::Ducker() = default;

float Ducker::Process(const float* sidechain, int frames) {
    // ---- lazy-init smoothing coefficients once we know the frame rate ------
    if (sample_rate_ == 0) {
        sample_rate_ = frames * 100;           // 480 frames → 48 kHz
        float chunkSec = static_cast<float>(frames) / static_cast<float>(sample_rate_);
        attack_coef_  = 1.0f - std::exp(-chunkSec / (kAttackMs  / 1000.0f));
        release_coef_ = 1.0f - std::exp(-chunkSec / (kReleaseMs / 1000.0f));
    }

    // ---- RMS envelope detection --------------------------------------------
    float sumSq = 0.0f;
    for (int i = 0; i < frames; ++i) {
        float s = sidechain[i];
        sumSq += s * s;
    }
    float rms    = std::sqrt(sumSq / static_cast<float>(frames));
    float rms_db = 20.0f * std::log10(rms + 1e-10f);

    // ---- overshoot & hold --------------------------------------------------
    float overshoot_db = 0.0f;
    if (rms_db > kThresholdDB) {
        overshoot_db       = rms_db - kThresholdDB;
        hold_samples_      = static_cast<int>(kHoldMs * sample_rate_ / 1000.0f);
        last_overshoot_db_ = overshoot_db;
    } else if (hold_samples_ > 0) {
        hold_samples_ -= frames;
        overshoot_db   = last_overshoot_db_;   // sustain during hold
    }

    // ---- target reduction (linear in dB) -----------------------------------
    float target_db = 0.0f;
    if (hold_samples_ > 0) {
        target_db = overshoot_db * kRatio;
        if (target_db > kRangeDB) target_db = kRangeDB;
    }

    // ---- attack / release smoothing ----------------------------------------
    float coeff = (target_db > reduction_db_) ? attack_coef_ : release_coef_;
    reduction_db_ += coeff * (target_db - reduction_db_);

    // ---- return linear gain ------------------------------------------------
    return std::pow(10.0f, -reduction_db_ / 20.0f);
}

void Ducker::Reset() {
    reduction_db_     = 0.0f;
    hold_samples_     = 0;
    last_overshoot_db_= 0.0f;
}
