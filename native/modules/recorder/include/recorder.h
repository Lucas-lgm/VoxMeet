#pragma once

#include <string>
#include <functional>

#ifdef __APPLE__
#include <CoreAudio/CoreAudio.h>
#include <AudioToolbox/AudioToolbox.h>
#endif

typedef void (*AudioCallback)(const void* buffer, size_t size, UInt32 frames, UInt32 channels, const AudioTimeStamp* timestamp, Float64 sampleRate, void* userData);

// Forward declaration
class MacRecorder;

class AudioRecorder {
public:
    AudioRecorder();
    ~AudioRecorder();

    // Preparing recording (creating aggregate device)
    bool Prepare();

    // Setting audio callback
    void SetAudioCallback(AudioCallback callback, void* userData);

    // Starting system audio capture
    bool StartSystemCapture();
    
    // Stopping system audio capture
    void StopSystemCapture();

    // Start Recording
    bool Start();
    
    // Stop Recording
    void Stop();
    
    // Pause recording
    void Pause();
    
    // Resume recording
    void Resume();
    
    // Whether recording
    bool IsRecording() const;
    
    // Set output file path
    void SetOutputPath(const std::string& path);
    
    // Getting apps currently using microphone
    std::string GetCurrentMicrophoneApp();

    static int CheckSystemAudioPermission();
    static bool RequestSystemAudioPermission();

private:
#ifdef __APPLE__
    AudioUnit audioUnit_;
    AudioStreamBasicDescription format_;
    AudioBufferList* bufferList_;
    UInt32 bufferSize_;
    UInt32 channels_;
    Float64 sampleRate_;
#endif

    AudioCallback callback_;
    void* userData_;
    bool isRecording_;
    bool isPaused_;
    std::string outputPath_;
    
    // Platform-specific implementation
    MacRecorder* platformImpl_;
}; 