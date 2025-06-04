#include "mac_recorder.h"
#include "logger.h"

MacRecorder::MacRecorder()
    : recorder_(nullptr)
    , systemCapture_(nullptr)
    , deviceManager_(nullptr)
    , isRecording_(false)
    , systemAudioVolume_(1.0f)
    , microphoneVolume_(1.0f) {
}

MacRecorder::MacRecorder(AudioRecorder* recorder)
    : recorder_(recorder)
    , systemCapture_(nullptr)
    , deviceManager_(nullptr)
    , isRecording_(false)
    , systemAudioVolume_(1.0f)
    , microphoneVolume_(1.0f) {
}

MacRecorder::~MacRecorder() {
    if (systemCapture_) {
        delete systemCapture_;
        systemCapture_ = nullptr;
    }
}

bool MacRecorder::Start() {
    return true;
}

void MacRecorder::Stop() {
}

bool MacRecorder::IsRecording() const {
    return true;
}

void MacRecorder::Pause() {
}

void MacRecorder::Resume() {
}

bool MacRecorder::IsRunning() const {
    return true;
}

void MacRecorder::SetOutputPath(const std::string& path) {
    outputPath_ = path;
}

std::string MacRecorder::GetCurrentMicrophoneApp() const {
    return currentMicApp_;
}

void MacRecorder::SetSystemAudioVolume(float volume) {
    systemAudioVolume_ = volume;
}

void MacRecorder::SetMicrophoneVolume(float volume) {
    microphoneVolume_ = volume;
}

bool MacRecorder::Prepare() {
    Logger::info("Preparing macOS recording (creating aggregate device)");
    
    // Creating System Audio capture
    systemCapture_ = new AudioSystemCapture();
    if (!systemCapture_) {
        Logger::error("Failed to create System Audio capture");
        return false;
    }

    // Create device and set device ID
    if (!systemCapture_->CreateTapDevice()) {
        Logger::error("Failed to create tap device");
        delete systemCapture_;
        systemCapture_ = nullptr;
        return false;
    }

    return true;
}

void MacRecorder::SetAudioCallback(void (*callback)(const void* buffer, size_t size, UInt32 frames, UInt32 channels, const AudioTimeStamp* timestamp, Float64 sampleRate, void* userData), void* userData) {
    Logger::info("Setting macOS audio callback");
    
    if (!systemCapture_) {
        Logger::error("System audio capture not initialized");
        return;
    }
    
    // Set System Audio capture callback
    systemCapture_->SetAudioDataCallback([callback, userData](const AudioBufferList* bufferList, UInt32 frames, UInt32 channels, const AudioTimeStamp* timestamp, Float64 sampleRate) {
        if (callback && bufferList && bufferList->mNumberBuffers > 0) {
            const AudioBuffer& buffer = bufferList->mBuffers[0];
            if (buffer.mData && buffer.mDataByteSize > 0) {
                callback(buffer.mData, buffer.mDataByteSize, frames, channels, timestamp, sampleRate, userData);
            }
        }
    });
    
    Logger::info("Audio callback set");
}

bool MacRecorder::StartSystemCapture() {
    Logger::info("Starting macOS system audio capture");

    if (!systemCapture_) {
        Logger::error("System audio capture not initialized");
        return false;
    }

    bool success = systemCapture_->StartRecording();
    if (!success) {
        Logger::error("Failed to start system audio capture");
        return false;
    }

    Logger::info("System audio capture started");
    return true;
}

void MacRecorder::StopSystemCapture() {
    Logger::info("Stopping macOS system audio capture");
    
    if (!systemCapture_) {
        Logger::error("System audio capture not initialized");
        return;
    }
    
    systemCapture_->StopRecording();
    Logger::info("System audio capture stopped");
}
