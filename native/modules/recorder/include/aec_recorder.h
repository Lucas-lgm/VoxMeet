#pragma once

#include <functional>
#include <memory>
#include <string>
#include <cstdint>

class AECRecorder {
public:
    using MixedPCMCallback = std::function<void(
        const float* data,
        int32_t frames,
        int32_t sampleRate
    )>;

    AECRecorder();
    ~AECRecorder();

    bool Prepare();
    void Dispose();

    bool StartCapture();
    void StopCapture();
    bool PauseCapture();
    bool ResumeCapture();

    void SetMixedPCMCallback(MixedPCMCallback callback);

    bool SetOutputFile(const std::string& path);
    bool SetWhisperOutputFile(const std::string& path);
    std::string GetOutputFilePath() const;
    int64_t GetOutputFileSize() const;

    void SetMicGain(float gain);
    void SetSystemGain(float gain);
    void SetAECEnabled(bool enabled);

    bool IsCapturing() const;

    static int CheckSystemAudioPermission();
    static bool RequestSystemAudioPermission();

private:
    class Impl;
    std::unique_ptr<Impl> impl_;
};
