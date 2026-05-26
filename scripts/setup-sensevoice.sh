#!/usr/bin/env bash
set -euo pipefail

# Convenience variables
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
WHISPER_DIR="$ROOT_DIR/whisper"
SENSEVOICE_DIR="$WHISPER_DIR/sensevoice"
MODELS_DIR="$SENSEVOICE_DIR/models"

SHERPA_VERSION="v1.13.2"
SHERPA_ARCHIVE="sherpa-onnx-${SHERPA_VERSION}-osx-arm64-shared-no-tts.tar.bz2"
SHERPA_URL="https://github.com/k2-fsa/sherpa-onnx/releases/download/${SHERPA_VERSION}/${SHERPA_ARCHIVE}"

MODEL_ARCHIVE="sherpa-onnx-sense-voice-zh-en-ja-ko-yue-2024-07-17.tar.bz2"
MODEL_URL="https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/${MODEL_ARCHIVE}"

# Colors for output
RED='\033[0;31m'; GREEN='\033[0;32m'; NC='\033[0m'
info()  { printf "${GREEN}[sensevoice]${NC} %s\n" "$1"; }
err()   { printf "${RED}[sensevoice]${NC} %s\n" "$1"; }

cleanup() {
  rm -f /tmp/sherpa-onnx-*.tar.bz2 /tmp/sense-voice-model.tar.bz2 2>/dev/null || true
  rm -rf /tmp/sherpa-onnx-*-osx-arm64-shared-no-tts /tmp/sherpa-onnx-sense-voice-*-*-*-* 2>/dev/null || true
}
trap cleanup EXIT

mkdir -p "$SENSEVOICE_DIR" "$MODELS_DIR"

# --- Step 1: Download and extract sherpa-onnx-offline binary + onnxruntime ---
info "Downloading sherpa-onnx ${SHERPA_VERSION} (macOS arm64)..."
if [ ! -f "$SENSEVOICE_DIR/bin/sherpa-onnx-offline" ]; then
  curl -#L -o "/tmp/${SHERPA_ARCHIVE}" "$SHERPA_URL"
  info "Extracting sherpa-onnx-offline and libonnxruntime..."
  tar xjf "/tmp/${SHERPA_ARCHIVE}" -C /tmp
  EXTRACTED_DIR="/tmp/sherpa-onnx-${SHERPA_VERSION}-osx-arm64-shared-no-tts"
  mkdir -p "$SENSEVOICE_DIR/bin" "$SENSEVOICE_DIR/lib"
  cp "$EXTRACTED_DIR/bin/sherpa-onnx-offline" "$SENSEVOICE_DIR/bin/"
  cp "$EXTRACTED_DIR/lib/libonnxruntime.1.24.4.dylib" "$SENSEVOICE_DIR/lib/"
  chmod +x "$SENSEVOICE_DIR/bin/sherpa-onnx-offline"
  info "sherpa-onnx-offline binary installed"
else
  info "sherpa-onnx-offline already exists, skipping"
fi

# --- Step 2: Download and extract SenseVoice model ---
info "Downloading SenseVoice model (int8, ~228MB)..."
if [ ! -f "$MODELS_DIR/model.int8.onnx" ]; then
  curl -#L -o "/tmp/${MODEL_ARCHIVE}" "$MODEL_URL"
  info "Extracting SenseVoice model..."
  tar xjf "/tmp/${MODEL_ARCHIVE}" -C /tmp
  MODEL_EXTRACTED_DIR="/tmp/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-2024-07-17"
  cp "$MODEL_EXTRACTED_DIR/model.int8.onnx" "$MODELS_DIR/"
  cp "$MODEL_EXTRACTED_DIR/tokens.txt" "$MODELS_DIR/"
  info "SenseVoice model installed"
else
  info "SenseVoice model already exists, skipping"
fi

# --- Verify ---
info "Verifying installation..."
DYLD_LIBRARY_PATH="$SENSEVOICE_DIR/lib" "$SENSEVOICE_DIR/bin/sherpa-onnx-offline" --help 2>&1 | grep -c "sherpa-onnx" || true
echo "---"

# Quick test
if [ -f "/tmp/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-2024-07-17/test_wavs/zh.wav" ]; then
  DYLD_LIBRARY_PATH="$SENSEVOICE_DIR/lib" "$SENSEVOICE_DIR/bin/sherpa-onnx-offline" \
    --sense-voice-model="$MODELS_DIR/model.int8.onnx" \
    --tokens="$MODELS_DIR/tokens.txt" \
    --num-threads=4 --debug=false --print-args=false \
    "/tmp/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-2024-07-17/test_wavs/zh.wav" 2>/dev/null | head -1 | python3 -c "import json,sys; d=json.load(sys.stdin); print(f'OK: {d[\"text\"]}')"
fi

info "Setup complete!"
echo "  sherpa-onnx-offline: $SENSEVOICE_DIR/bin/sherpa-onnx-offline"
echo "  model:              $MODELS_DIR/model.int8.onnx"
echo "  tokens:             $MODELS_DIR/tokens.txt"
