#ifdef __APPLE__

#import <Foundation/Foundation.h>
#import <dlfcn.h>
#include "logger.h"

int CheckSystemAudioPermission() {
    Logger::info("Checking system audio permission");
    
    void *handle = dlopen("/System/Library/PrivateFrameworks/TCC.framework/Versions/A/TCC", RTLD_NOW);
    if (!handle) {
        Logger::error("Failed to load TCC framework");
        return false;
    }

    typedef int (*TCCAccessPreflightFn)(CFStringRef service, CFDictionaryRef options);
    TCCAccessPreflightFn preflight = (TCCAccessPreflightFn)dlsym(handle, "TCCAccessPreflight");
    if (!preflight) {
        Logger::error("Failed to get TCCAccessPreflight function");
        dlclose(handle);
        return false;
    }

    int result = preflight(CFSTR("kTCCServiceAudioCapture"), nullptr);
    Logger::info("System audio permission check result: %d", result);
    
    bool granted = (result == 0); // 0 means Granted
    Logger::info("System audio permission status: %s", granted ? "Granted" : "Denied");
    
    dlclose(handle);
    return result;
}

bool RequestSystemAudioPermission() {
    Logger::info("Requesting system audio permission");
    
    void *handle = dlopen("/System/Library/PrivateFrameworks/TCC.framework/Versions/A/TCC", RTLD_NOW);
    if (!handle) {
        Logger::error("Failed to load TCC framework");
        return false;
    }

    typedef void (*TCCAccessRequestFn)(CFStringRef service, CFDictionaryRef options, void (^callback)(bool granted));
    TCCAccessRequestFn request = (TCCAccessRequestFn)dlsym(handle, "TCCAccessRequest");
    if (!request) {
        Logger::error("Failed to get TCCAccessRequest function");
        dlclose(handle);
        return false;
    }

    // Create a semaphore to wait for callback
    dispatch_semaphore_t semaphore = dispatch_semaphore_create(0);
    __block bool permissionGranted = false;

    // Create a strongly-referenced block that receives bool parameter
    void (^callback)(bool) = ^(bool granted) {
        Logger::info("System audio permission request result: %s", granted ? "Granted" : "Denied");
        permissionGranted = granted;
        dispatch_semaphore_signal(semaphore);
    };

    Logger::info("Sending permission request");
    // Call request function with nullptr options
    request(CFSTR("kTCCServiceAudioCapture"), nullptr, callback);

    // Wait for user response
    dispatch_semaphore_wait(semaphore, DISPATCH_TIME_FOREVER);
    
    dlclose(handle);
    Logger::info("Permission request complete");
    
    return permissionGranted;
}

#endif 