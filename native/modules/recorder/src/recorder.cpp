#include "recorder.h"
#include "logger.h"
#include "mac_recorder.h"
#include "mac_permission.h"

// Base implementation, platform-specific logic to follow
AudioRecorder::AudioRecorder() 
    : isRecording_(false), 
      isPaused_(false),
      platformImpl_(nullptr) {
    Logger::info("AudioRecorder init");
    
    // Create platform-specific implementation
#ifdef __APPLE__
    platformImpl_ = new MacRecorder(this);
    Logger::info("Using macOS recorder implementation");
#else
    Logger::warn("Current platform does not support recording");
#endif
}

AudioRecorder::~AudioRecorder() {
    Logger::info("AudioRecorder destroying");
    if (isRecording_) {
        Stop();
    }
    
    // Clean up platform-specific resources
    if (platformImpl_) {
#ifdef __APPLE__
        delete platformImpl_;
#endif
        platformImpl_ = nullptr;
    }
}

bool AudioRecorder::Start() {
    Logger::info("Start recording request");
    if (isRecording_ && !isPaused_) {
        Logger::warn("Already recording, ignoring start request");
        return false;
    }
    
    // Use platform implementation
    bool success = false;
    if (platformImpl_) {
#ifdef __APPLE__
        success = platformImpl_->Start();
#endif
    } else {
        Logger::error("Null platform impl, cannot start recording");
        return false;
    }
    
    if (success) {
        isRecording_ = true;
        isPaused_ = false;
        Logger::info("Recording state: Recording");
    } else {
        Logger::error("Platform recording start failed");
    }
    
    return success;
}

void AudioRecorder::Stop() {
    Logger::info("Stop recording request");
    if (!isRecording_) {
        Logger::warn("Not recording, ignoring stop request");
        return;
    }
    
    // Use platform implementation
    if (platformImpl_) {
#ifdef __APPLE__
        platformImpl_->Stop();
#endif
    }
    
    isRecording_ = false;
    isPaused_ = false;
    Logger::info("Recording state: Stopped");
}

void AudioRecorder::Pause() {
    Logger::info("Pause recording request");
    if (!isRecording_ || isPaused_) {
        Logger::warn("Not recording or paused, ignoring pause request");
        return;
    }
    
    // Use platform implementation
    if (platformImpl_) {
#ifdef __APPLE__
        platformImpl_->Pause();
#endif
    }
    
    isPaused_ = true;
    Logger::info("Recording state: Paused");
}

void AudioRecorder::Resume() {
    Logger::info("Resume recording request");
    if (!isRecording_ || !isPaused_) {
        Logger::warn("Not recording or not paused, ignoring resume request");
        return;
    }
    
    // Use platform implementation
    if (platformImpl_) {
#ifdef __APPLE__
        platformImpl_->Resume();
#endif
    }
    
    isPaused_ = false;
    Logger::info("Recording state: Recording (Resumed)");
}

bool AudioRecorder::IsRecording() const {
    bool status = isRecording_ && !isPaused_;
    Logger::debug("Query recording state: %s", status ? "Recording" : "Not recording");
    return status;
}

void AudioRecorder::SetOutputPath(const std::string& path) {
    Logger::info("Setting output path: %s", path.c_str());
    outputPath_ = path;
    
    // Set output path on platform implementation
    if (platformImpl_) {
#ifdef __APPLE__
        platformImpl_->SetOutputPath(path);
#endif
    }
}

std::string AudioRecorder::GetCurrentMicrophoneApp() {
    Logger::info("Getting apps currently using microphone");
    
    if (platformImpl_) {
#ifdef __APPLE__
        return platformImpl_->GetCurrentMicrophoneApp();
#endif
    }
    
    return "Unknown Application";
}

bool AudioRecorder::Prepare() {
    Logger::info("Preparing recording (creating aggregate device)");
    
    // Use platform implementation
    if (platformImpl_) {
#ifdef __APPLE__
        return platformImpl_->Prepare();
#endif
    }
    
    Logger::error("Null platform impl, cannot prepare recording");
    return false;
}

void AudioRecorder::SetAudioCallback(void (*callback)(const void* buffer, size_t size, UInt32 frames, UInt32 channels, const AudioTimeStamp* timestamp, Float64 sampleRate, void* userData), void* userData) {
    Logger::info("Setting audio callback");
    
    // Use platform implementation
    if (platformImpl_) {
#ifdef __APPLE__
        platformImpl_->SetAudioCallback(callback, userData);
#endif
    } else {
        Logger::error("Null platform impl, cannot set audio callback");
    }
}

bool AudioRecorder::StartSystemCapture() {
    Logger::info("Starting system audio capture");
    
    // Use platform implementation
    if (platformImpl_) {
#ifdef __APPLE__
        return platformImpl_->StartSystemCapture();
#endif
    }
    
    Logger::error("Null platform impl, cannot start system audio capture");
    return false;
}

void AudioRecorder::StopSystemCapture() {
    Logger::info("Stopping system audio capture");
    
    // Use platform implementation
    if (platformImpl_) {
#ifdef __APPLE__
        platformImpl_->StopSystemCapture();
#endif
    } else {
        Logger::error("Null platform impl, cannot stop system audio capture");
    }
}

int AudioRecorder::CheckSystemAudioPermission() {
#ifdef __APPLE__
    return ::CheckSystemAudioPermission();
#else
    return true; // Other platforms default to true
#endif
}

bool AudioRecorder::RequestSystemAudioPermission() {
#ifdef __APPLE__
    ::RequestSystemAudioPermission();
#endif
}
