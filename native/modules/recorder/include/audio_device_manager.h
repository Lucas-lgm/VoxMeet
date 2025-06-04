#ifndef AUDIO_DEVICE_MANAGER_H
#define AUDIO_DEVICE_MANAGER_H

#include <CoreAudio/CoreAudio.h>
#include <CoreFoundation/CoreFoundation.h>
#include <vector>
#include <string>

class AudioDeviceManager {
public:
    // Get all aggregate devices
    std::vector<AudioObjectID> GetAggregateDevices();
    
    // Get aggregate device by name
    std::vector<AudioObjectID> GetAggregateDevicesByName(const std::string& deviceName);
    
    // Create aggregate device
    AudioObjectID CreateAggregateDevice(const char* deviceName);
    
    // Delete aggregate device
    bool RemoveAggregateDevice(AudioObjectID deviceID);
    
    // Create tap
    AudioObjectID CreateTap(const char* name);
    
    // Delete tap
    bool RemoveTap(AudioObjectID tapID);
    
    // Add tap to aggregate device
    bool AddTapToDevice(AudioObjectID tapID, AudioObjectID deviceID);
    
    // Remove tap from aggregate device
    bool RemoveTapFromDevice(AudioObjectID tapID, AudioObjectID deviceID);
    
    // Get all taps for device
    std::vector<AudioObjectID> GetDeviceTaps(AudioObjectID deviceID);
};

#endif // AUDIO_DEVICE_MANAGER_H 