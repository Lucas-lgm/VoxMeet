#pragma once

#ifdef __OBJC__
#import <Foundation/Foundation.h>
#import <AVFoundation/AVFoundation.h>
#endif

#include "audio_system_capture.h"
#include "audio_device_manager.h"

#ifdef __OBJC__
@class MacSystemAudioNode;
@class AVAudioEngine;
@class AVAudioMixerNode;
@class AVAudioFormat;
@class NSError;
#endif

// Forward declaration
class AudioRecorder;

// macOS platform implementation class
class MacRecorder {
public:
    MacRecorder();
    explicit MacRecorder(AudioRecorder* recorder);
    ~MacRecorder();

    bool Prepare();
    bool Start();
    void Stop();
    bool IsRecording() const;
    
    void Pause();
    void Resume();
    
    bool IsRunning() const;
    
    void SetOutputPath(const std::string& path);
    std::string GetCurrentMicrophoneApp() const;
    
    // Set System Audio volume
    void SetSystemAudioVolume(float volume);
    // Set Mic volume
    void SetMicrophoneVolume(float volume);
    
    // Setting audio callback
    void SetAudioCallback(void (*callback)(const void* buffer, size_t size, UInt32 frames, UInt32 channels, const AudioTimeStamp* timestamp, Float64 sampleRate, void* userData), void* userData);

    // Starting system audio capture
    bool StartSystemCapture();
    
    // Stopping system audio capture
    void StopSystemCapture();

private:
    AudioRecorder* recorder_;
    std::string outputPath_;
    std::atomic<bool> running_;
    std::atomic<bool> paused_;
    std::mutex audioMutex_;
    
    float systemAudioVolume_;
    float microphoneVolume_;
    std::string currentMicApp_;
    
    AudioSystemCapture* systemCapture_;
    AudioDeviceManager* deviceManager_;
    bool isRecording_;

#ifdef __OBJC__
    AVAudioEngine* audioEngine_;
#else
    void* audioEngine_;
#endif
}; 