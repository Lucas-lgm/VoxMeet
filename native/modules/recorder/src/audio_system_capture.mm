#include "audio_system_capture.h"
#import <CoreAudio/CoreAudio.h>
#import <AudioToolbox/AudioToolbox.h>
#import <CoreAudio/CATapDescription.h>
#import <Foundation/Foundation.h>
#include <vector>
#include <mutex>
#include <condition_variable>
#include "audio_device_manager.h"
#include "logger.h"

constexpr AudioObjectPropertyAddress PropertyAddress(AudioObjectPropertySelector selector,
                                                     AudioObjectPropertyScope scope = kAudioObjectPropertyScopeGlobal,
                                                     AudioObjectPropertyElement element = kAudioObjectPropertyElementMain) noexcept {
    return {selector, scope, element};
}

enum class StreamDirection : UInt32 {
    output,
    input
};

class RingBuffer {
public:
    RingBuffer(size_t size) 
        : buffer_(size)
        , read_pos_(0)
        , write_pos_(0)
        , size_(size)
        , overflow_count_(0)
        , underflow_count_(0)
        , max_used_size_(0) {
    }
    
    bool write(const float* data, size_t count) {
        std::unique_lock<std::mutex> lock(mutex_);
        
        // If buffer is full, return false
        if (available_write() < count) {
            overflow_count_++;
            if (overflow_count_ % 100 == 0) {
            }
            return false;
        }
        
        // Write data
        for (size_t i = 0; i < count; ++i) {
            buffer_[write_pos_] = data[i];
            write_pos_ = (write_pos_ + 1) % size_;
        }
        
        // Update max usage
        size_t used_size = available_read();
        if (used_size > max_used_size_) {
            max_used_size_ = used_size;
        }
        
        cv_.notify_one();
        return true;
    }
    
    bool read(float* data, size_t count) {
        std::unique_lock<std::mutex> lock(mutex_);
        
        // If insufficient data, wait a while
        if (available_read() < count) {
            if (cv_.wait_for(lock, std::chrono::milliseconds(10), 
                           [this, count] { return available_read() >= count; })) {
                // Still insufficient data after timeout, return false
                underflow_count_++;
                if (underflow_count_ % 100 == 0) {
                }
                return false;
            }
        }
        
        // Read data
        for (size_t i = 0; i < count; ++i) {
            data[i] = buffer_[read_pos_];
            read_pos_ = (read_pos_ + 1) % size_;
        }
        return true;
    }
    
    size_t available_read() const {
        if (write_pos_ >= read_pos_) {
            return write_pos_ - read_pos_;
        }
        return size_ - read_pos_ + write_pos_;
    }
    
    size_t available_write() const {
        return size_ - available_read() - 1;
    }
    
    // Get statistics
    struct Stats {
        size_t overflow_count;
        size_t underflow_count;
        size_t max_used_size;
        size_t current_size;
    };
    
    Stats get_stats() const {
        std::unique_lock<std::mutex> lock(mutex_);
        return {
            overflow_count_,
            underflow_count_,
            max_used_size_,
            size_
        };
    }
    
    void clear() {
        std::unique_lock<std::mutex> lock(mutex_);
        read_pos_ = 0;
        write_pos_ = 0;
        overflow_count_ = 0;
        underflow_count_ = 0;
        max_used_size_ = 0;
    }
    
private:
    std::vector<float> buffer_;
    size_t read_pos_;
    size_t write_pos_;
    size_t size_;
    mutable std::mutex mutex_;
    std::condition_variable cv_;
    
    // Statistics
    size_t overflow_count_;    // Overflow count
    size_t underflow_count_;   // Underflow count
    size_t max_used_size_;     // Max used size
};

class AudioSystemCapture::Impl {
public:
    Impl() : ring_buffer_(352800) {} // 8-second buffer
    
    RingBuffer ring_buffer_;
    AudioDeviceManager device_manager_;
};

AudioSystemCapture::AudioSystemCapture() 
    : deviceID_(kAudioObjectUnknown)
    , inputStreamList_(std::make_shared<std::vector<AudioStreamBasicDescription>>())
    , outputStreamList_(std::make_shared<std::vector<AudioStreamBasicDescription>>())
    , recordingEnabled_(false)
    , loopbackEnabled_(false)
    , ioProcID_(nullptr)
    , impl_(std::make_unique<Impl>()) {
}

AudioSystemCapture::~AudioSystemCapture() {
    // Stop all activities
    StopRecording();
    StopLoopback();
    StopIO();
    
    // Unregister all listeners
    UnregisterListeners();
    
    // Clean up device
    if (deviceID_ != kAudioObjectUnknown) {
        // Get and clean up all taps
        auto taps = impl_->device_manager_.GetDeviceTaps(deviceID_);
        for (const auto& tap : taps) {
            impl_->device_manager_.RemoveTap(tap);
        }
        
        // Remove aggregate device
        impl_->device_manager_.RemoveAggregateDevice(deviceID_);
        deviceID_ = kAudioObjectUnknown;
    }
    
    // Clean up callback
    audioDataCallback_ = nullptr;
    
    // Clean up ring buffer
    ClearRingBuffer();
    
    // Clean up impl object
    impl_.reset();
    
    Logger::info("AudioSystemCapture destroyed");
}

void AudioSystemCapture::SetDeviceID(AudioObjectID deviceID) {
    if (deviceID_ == deviceID) {
        return;
    }
    AdaptToDevice(deviceID);
}

void AudioSystemCapture::SetAudioDataCallback(std::function<void(const AudioBufferList*, UInt32, UInt32, const AudioTimeStamp*, Float64)> callback) {
    audioDataCallback_ = std::move(callback);
}

bool AudioSystemCapture::StartRecording() {
    if (recordingEnabled_) {
        return true;
    }
    
    recordingEnabled_ = true;
    if (loopbackEnabled_) {
        StopIO();
    }
    
    if (!StartIO()) {
        recordingEnabled_ = false;
        return false;
    }
    
    return true;
}

void AudioSystemCapture::StopRecording() {
    if (!recordingEnabled_) {
        return;
    }
    
    recordingEnabled_ = false;
    if (!loopbackEnabled_) {
        StopIO();
    }
}

bool AudioSystemCapture::StartLoopback() {
    if (loopbackEnabled_) {
        return true;
    }
    
    loopbackEnabled_ = true;
    if (recordingEnabled_) {
        return true;
    }
    
    if (!StartIO()) {
        loopbackEnabled_ = false;
        return false;
    }
    
    return true;
}

void AudioSystemCapture::StopLoopback() {
    if (!loopbackEnabled_) {
        return;
    }
    
    loopbackEnabled_ = false;
    StopIO();
}

bool AudioSystemCapture::AdaptToDevice(AudioObjectID deviceID) {
    StopIO();
    UnregisterListeners();
    
    deviceID_ = deviceID;
//    CatalogDeviceStreams();
    RegisterListeners();
    
    bool success = true;
    if (success && (deviceID_ != kAudioObjectUnknown)) {
        if (recordingEnabled_) {
            success = StartRecording();
        } else if (loopbackEnabled_) {
            success = StartIO();
        }
    }
    return success;
}

void AudioSystemCapture::CatalogDeviceStreams() {
    inputStreamList_->clear();
    outputStreamList_->clear();
    
    if (deviceID_ == kAudioObjectUnknown) {
        Logger::error("Invalid device ID");
        return;
    }
    
    // Get device stream list
    UInt32 size = 0;
    AudioObjectPropertyAddress address = PropertyAddress(kAudioDevicePropertyStreams);
    OSStatus error = AudioObjectGetPropertyDataSize(deviceID_, &address, 0, nullptr, &size);
    auto streamCount = size / sizeof(AudioObjectID);
    if (error != kAudioHardwareNoError || streamCount == 0) {
        Logger::error("CatalogDeviceStreams failed: %d, stream count: %zu", (int)error, streamCount);
        return;
    }
    
    std::vector<AudioObjectID> streamList(streamCount);
    error = AudioObjectGetPropertyData(deviceID_, &address, 0, nullptr, &size, streamList.data());
    if (error != kAudioHardwareNoError) {
        Logger::error("Failed to get device stream data: %d", (int)error);
        return;
    }
    
    streamList.resize(size / sizeof(AudioObjectID));
    for (auto streamID : streamList) {
        // Get format of each stream
        address = PropertyAddress(kAudioStreamPropertyVirtualFormat);
        AudioStreamBasicDescription format;
        size = sizeof(AudioStreamBasicDescription);
        memset(&format, 0, size);
        error = AudioObjectGetPropertyData(streamID, &address, 0, nullptr, &size, &format);
        if (error == kAudioHardwareNoError) {
            address = PropertyAddress(kAudioStreamPropertyDirection);
            StreamDirection direction = StreamDirection::output;
            size = sizeof(UInt32);
            AudioObjectGetPropertyData(streamID, &address, 0, nullptr, &size, &direction);
            if (direction == StreamDirection::output) {
                outputStreamList_->push_back(format);
            } else {
                inputStreamList_->push_back(format);
            }
        } else {
            Logger::error("Failed to get stream %u format: %d", (unsigned int)streamID, (int)error);
        }
    }
}

bool AudioSystemCapture::StartIO() {
    AudioDeviceIOProcID ioProcID = nullptr;
    auto error = AudioDeviceCreateIOProcID(deviceID_, IOProc, this, &ioProcID);
    if (error != kAudioHardwareNoError) {
        Logger::error("Failed to create IO proc: %d", (int)error);
        return false;
    }
    ioProcID_ = ioProcID;
    
    error = AudioDeviceStart(deviceID_, ioProcID_);
    if (error != kAudioHardwareNoError) {
        Logger::error("Failed to start IO proc: %d", (int)error);
        AudioDeviceDestroyIOProcID(deviceID_, ioProcID_);
        ioProcID_ = nullptr;
        return false;
    }
    
    Logger::info("IO proc started: deviceID=%u, ioProcID=%p", (unsigned int)deviceID_, (void*)ioProcID_);
    return true;
}

void AudioSystemCapture::StopIO() {
    static bool isStopping = false;
    if (isStopping) {
        return;
    }
    isStopping = true;
    
    if (ioProcID_) {
        AudioDeviceStop(deviceID_, ioProcID_);
        AudioDeviceDestroyIOProcID(deviceID_, ioProcID_);
        ioProcID_ = nullptr;
    }
    
    isStopping = false;
}

void AudioSystemCapture::RegisterListeners() {
    if (deviceID_ != 0) {
        auto address = PropertyAddress(kAudioDevicePropertyDeviceIsAlive);
        AudioObjectAddPropertyListener(deviceID_, &address, DeviceChangedListener, this);
        address = PropertyAddress(kAudioAggregateDevicePropertyFullSubDeviceList);
        AudioObjectAddPropertyListener(deviceID_, &address, DeviceChangedListener, this);
        address = PropertyAddress(kAudioAggregateDevicePropertyTapList);
        AudioObjectAddPropertyListener(deviceID_, &address, DeviceChangedListener, this);
    }
}

void AudioSystemCapture::UnregisterListeners() {
    if (deviceID_ != 0) {
        auto address = PropertyAddress(kAudioDevicePropertyDeviceIsAlive);
        AudioObjectRemovePropertyListener(deviceID_, &address, DeviceChangedListener, this);
        address = PropertyAddress(kAudioAggregateDevicePropertyFullSubDeviceList);
        AudioObjectRemovePropertyListener(deviceID_, &address, DeviceChangedListener, this);
        address = PropertyAddress(kAudioAggregateDevicePropertyTapList);
        AudioObjectRemovePropertyListener(deviceID_, &address, DeviceChangedListener, this);
    }
}

OSStatus AudioSystemCapture::DeviceChangedListener(
    AudioObjectID inObjectID,
    UInt32 inNumberAddresses,
    const AudioObjectPropertyAddress* inAddresses,
    void* inClientData) {
    auto* capture = static_cast<AudioSystemCapture*>(inClientData);
    if (capture != nullptr) {
        for (unsigned index = 0; index < inNumberAddresses; ++index) {
            auto address = inAddresses[index];
            switch (address.mSelector) {
                case kAudioDevicePropertyDeviceIsAlive:
                    capture->AdaptToDevice(kAudioObjectUnknown);
                    break;
                case kAudioAggregateDevicePropertyFullSubDeviceList:
                case kAudioAggregateDevicePropertyTapList:
                    capture->AdaptToDevice(capture->deviceID_);
                    break;
            }
        }
    }
    return kAudioHardwareNoError;
}

OSStatus AudioSystemCapture::IOProc(
    AudioObjectID inDevice,
    const AudioTimeStamp* inNow,
    const AudioBufferList* inInputData,
    const AudioTimeStamp* inInputTime,
    AudioBufferList* outOutputData,
    const AudioTimeStamp* inOutputTime,
    void* inClientData) {
    auto* capture = static_cast<AudioSystemCapture*>(inClientData);
    
    if (inInputData != nullptr && inInputData->mNumberBuffers > 0) {
        const AudioBuffer& inputBuffer = inInputData->mBuffers[0];
        
        // Check if input data is valid
        if (inputBuffer.mData == nullptr || inputBuffer.mDataByteSize == 0) {
            return kAudioHardwareNoError;
        }
        
        // Calculate frame count
        UInt32 bytesPerFrame = inputBuffer.mNumberChannels * sizeof(Float32);
        UInt32 numberFrames = inputBuffer.mDataByteSize / bytesPerFrame;
        
        if (numberFrames == 0) {
            return kAudioHardwareNoError;
        }
        
        // Get sample rate
        AudioObjectPropertyAddress address = PropertyAddress(kAudioDevicePropertyNominalSampleRate);
        Float64 sampleRate = 0;
        UInt32 size = sizeof(Float64);
        OSStatus error = AudioObjectGetPropertyData(inDevice, &address, 0, nullptr, &size, &sampleRate);
        if (error != kAudioHardwareNoError) {
            return error;
        }
        
        // If callback is set, invoke it
        if (capture->audioDataCallback_) {
            capture->audioDataCallback_(inInputData, numberFrames, inputBuffer.mNumberChannels, inInputTime, sampleRate);
        }
    }
    
    return kAudioHardwareNoError;
}

// Add new method to read data from ring buffer
bool AudioSystemCapture::ReadAudioData(float* buffer, size_t count) {
    return impl_->ring_buffer_.read(buffer, count);
}

void AudioSystemCapture::ClearRingBuffer() {
    impl_->ring_buffer_.clear();
}

bool AudioSystemCapture::CreateTapDevice() {
    // Find and delete device by name
    auto devicesToRemove = impl_->device_manager_.GetAggregateDevicesByName("plaud.ai Aggregate Audio Device");
    for (const auto& deviceID : devicesToRemove) {
        auto taps = impl_->device_manager_.GetDeviceTaps(deviceID);
        for (const auto& tap : taps) {
            impl_->device_manager_.RemoveTap(tap);
        }
        impl_->device_manager_.RemoveAggregateDevice(deviceID);
    }
    
    // Verify device has been deleted
    auto remainingDevices = impl_->device_manager_.GetAggregateDevicesByName("plaud.ai Aggregate Audio Device");
    
    // Create new aggregate device
    AudioObjectID newDeviceID = impl_->device_manager_.CreateAggregateDevice("plaud.ai Aggregate Audio Device");
    if (newDeviceID == kAudioObjectUnknown) {
        Logger::error("Failed to create aggregate device");
        return false;
    }
    
    // Create tap
    AudioObjectID tapID = impl_->device_manager_.CreateTap("plaud.ai tap");
    if (tapID == kAudioObjectUnknown) {
        Logger::error("Failed to create tap");
        return false;
    }
    
    // Add tap to device
    if (!impl_->device_manager_.AddTapToDevice(tapID, newDeviceID)) {
        Logger::error("Failed to add tap to device");
        return false;
    }
    
    // Set device ID
    SetDeviceID(newDeviceID);
    
    // Wait for device initialization
    usleep(100000); // 100ms
    
    // Get device stream list
    AudioObjectPropertyAddress address = PropertyAddress(kAudioDevicePropertyStreams);
    UInt32 size = 0;
    OSStatus error = AudioObjectGetPropertyDataSize(newDeviceID, &address, 0, nullptr, &size);
    if (error != kAudioHardwareNoError) {
        Logger::error("Failed to get device stream list size: %d", (int)error);
        return false;
    }
    
    std::vector<AudioObjectID> streamList(size / sizeof(AudioObjectID));
    error = AudioObjectGetPropertyData(newDeviceID, &address, 0, nullptr, &size, streamList.data());
    if (error != kAudioHardwareNoError) {
        Logger::error("Failed to get device stream list: %d", (int)error);
        return false;
    }
    
    // Set format for each stream
    AudioStreamBasicDescription format;
    memset(&format, 0, sizeof(format));
    format.mSampleRate = 44100;
    format.mFormatID = kAudioFormatLinearPCM;
    format.mFormatFlags = kAudioFormatFlagIsFloat | kAudioFormatFlagIsPacked;
    format.mBitsPerChannel = 32;
    format.mChannelsPerFrame = 2;
    format.mFramesPerPacket = 1;
    format.mBytesPerFrame = format.mChannelsPerFrame * format.mBitsPerChannel / 8;
    format.mBytesPerPacket = format.mBytesPerFrame;
    
    address = PropertyAddress(kAudioStreamPropertyVirtualFormat);
    for (auto streamID : streamList) {
        error = AudioObjectSetPropertyData(streamID, &address, 0, nullptr, sizeof(format), &format);
        if (error != kAudioHardwareNoError) {
            Logger::error("Failed to set stream %u format: %d", (unsigned int)streamID, (int)error);
            continue;
        }
    }
    
    return true;
} 