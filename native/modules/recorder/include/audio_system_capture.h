#pragma once

#include <AudioToolbox/AudioToolbox.h>
#include <CoreAudio/CoreAudio.h>
#include "logger.h"
#include <vector>
#include <memory>
#include <functional>

class AudioSystemCapture {
public:
    AudioSystemCapture();
    ~AudioSystemCapture();
    
    // Set device ID
    void SetDeviceID(AudioObjectID deviceID);
    
    // Start Recording
    bool StartRecording();
    
    // Stop Recording
    void StopRecording();
    
    // Start loop playback
    bool StartLoopback();
    
    // Stop loop playback
    void StopLoopback();
    
    // Set audio data callback
    void SetAudioDataCallback(std::function<void(const AudioBufferList*, UInt32, UInt32, const AudioTimeStamp*, Float64)> callback);
    
    bool CreateTapDevice();
    bool ReadAudioData(float* buffer, size_t count);
    
    // Get device ID
    AudioObjectID GetDeviceID() const { return deviceID_; }
    
    // Clean up ring buffer
    void ClearRingBuffer();
    
    // Get audio format
    bool GetAudioFormat(AudioStreamBasicDescription& format) {
        if (deviceID_ == kAudioObjectUnknown) {
            return false;
        }
        
        CatalogDeviceStreams();
        if (inputStreamList_->empty()) {
            return false;
        }
        
        format = inputStreamList_->front();
        return true;
    }
    
private:
    class Impl;
    std::unique_ptr<Impl> impl_;
    
    // Device property listener callback
    static OSStatus DeviceChangedListener(
        AudioObjectID inObjectID,
        UInt32 inNumberAddresses,
        const AudioObjectPropertyAddress* inAddresses,
        void* inClientData);
    
    // IO processing callback
    static OSStatus IOProc(
        AudioObjectID inDevice,
        const AudioTimeStamp* inNow,
        const AudioBufferList* inInputData,
        const AudioTimeStamp* inInputTime,
        AudioBufferList* outOutputData,
        const AudioTimeStamp* inOutputTime,
        void* inClientData);
    
    // Adopt device
    bool AdaptToDevice(AudioObjectID deviceID);
    
    // Register listeners
    void RegisterListeners();
    
    // Unregister listeners
    void UnregisterListeners();
    
    // Start IO
    bool StartIO();
    
    // Stop IO
    void StopIO();
    
    // Get device stream info
    void CatalogDeviceStreams();
    
private:
    AudioObjectID deviceID_;
    std::shared_ptr<std::vector<AudioStreamBasicDescription>> inputStreamList_;
    std::shared_ptr<std::vector<AudioStreamBasicDescription>> outputStreamList_;
    bool recordingEnabled_;
    bool loopbackEnabled_;
    AudioDeviceIOProcID ioProcID_;
    std::function<void(const AudioBufferList*, UInt32, UInt32, const AudioTimeStamp*, Float64)> audioDataCallback_;
}; 