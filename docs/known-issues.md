# Known Issues

## AEC Mix Strategy

**Problem:** Current mix ratio `0.6 * AEC + 0.4 * raw_mic + sys * sys_gain` with `mic_gain_ = 3.0` deviates from industry norms.

**Specific issues:**

1. **40% raw mic contains echo**: `kRawBlend = 0.4` means echo is not fully cancelled, AEC effectiveness is diluted. Best practice is near 0%, with a tunable parameter for debugging.
2. **mic_gain_ = 3.0 is too high**: Normal mic input doesn't need 3x amplification, prone to clipping. Industry practice is 1.0 or rely on frontend hardware gain / backend normalization.
3. **debug fwrite/fflush runs synchronously in audio callback**: Slow disk I/O may cause audio dropouts. Should be gated by condition or written asynchronously.
