#!/bin/bash
# whisper.cpp build script
# Usage: bash scripts/setup-whisper.sh
# Download and compile whisper.cpp, copy binary to whisper/ directory

set -e

WHISPER_DIR="whisper"

echo "=== Downloading whisper.cpp ==="
if [ ! -d "${WHISPER_DIR}/whisper.cpp" ]; then
  git clone --depth 1 https://github.com/ggerganov/whisper.cpp.git "${WHISPER_DIR}/whisper.cpp"
else
  echo "whisper.cpp already exists, skipping download"
fi

echo "=== Building whisper-cli ==="
cd "${WHISPER_DIR}/whisper.cpp"
cmake -B build -DCMAKE_BUILD_TYPE=Release
cmake --build build --config Release -j4
cd ../..

# Copy compiled binary to expected location
cp "${WHISPER_DIR}/whisper.cpp/build/bin/whisper-cli" "${WHISPER_DIR}/whisper-cli" 2>/dev/null || \
cp "${WHISPER_DIR}/whisper.cpp/build/Release/whisper-cli" "${WHISPER_DIR}/whisper-cli" 2>/dev/null || {
  echo "❌ Could not find compiled whisper-cli binary"
  echo "Check ${WHISPER_DIR}/whisper.cpp/build/bin/ directory"
  exit 1
}

echo ""
echo "=== Build complete ==="
echo ""
echo "whisper binary: $(pwd)/${WHISPER_DIR}/whisper-cli"
echo ""
echo "Models can be downloaded from the app settings."
echo ""
echo "Packaged binary path: \${resourcesPath}/whisper/whisper-cli"