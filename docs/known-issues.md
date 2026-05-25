# Known Issues

## AEC Mix Strategy (FIXED)

**Status:** Resolved. See changes below.

**Original problem:** Mix ratio `0.6 * AEC + 0.4 * raw_mic + sys * sys_gain` with `mic_gain_ = 3.0` deviated from industry norms.

**Fixes applied:**

1. **40% raw mic removed** — AEC3 has good double-talk performance and doesn't need raw mic blended back. Mix is now `aecOut * mic_gain + far * sys_gain`.
2. **mic_gain_ default changed to 1.0** — AGC2 (adaptive digital) handles level normalization automatically.
3. **sys_gain_ default changed to 1.0** — System audio mixed at natural level for balanced conversation recording.
4. **Debug fwrite/fflush disabled** — Synchronous disk I/O in audio callback caused potential dropouts. Code kept as comments for debugging.
5. **AGC2 and ANS enabled** — Full 3A pipeline: AEC (echo cancellation) → AGC2 (auto gain) → ANS (noise suppression). HPF also enabled.
