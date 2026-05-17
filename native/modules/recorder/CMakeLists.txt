cmake_minimum_required(VERSION 3.10)
project(recorder VERSION 1.0.0)

# Set C++ standard
set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Set Objective-C compiler
set(CMAKE_OBJC_COMPILER "/usr/bin/clang")
set(CMAKE_OBJCXX_COMPILER "/usr/bin/clang++")

# Set SDK path
set(CMAKE_OSX_SYSROOT "/Library/Developer/CommandLineTools/SDKs/MacOSX15.4.sdk")
set(CMAKE_OSX_DEPLOYMENT_TARGET "14.2")

# Find required frameworks
find_library(AVFoundation AVFoundation REQUIRED)
find_library(Foundation Foundation REQUIRED)
find_library(CoreAudio CoreAudio REQUIRED)
find_library(AudioToolbox AudioToolbox REQUIRED)
find_library(AudioUnit AudioUnit REQUIRED)
find_library(CoreFoundation CoreFoundation REQUIRED)
find_library(CoreServices CoreServices REQUIRED)

# Get webrtc-audio-processing and its dependencies via FetchContent
include(FetchContent)

# Get abseil-cpp (header dependency for webrtc-audio-processing)
FetchContent_Declare(
    abseil_cpp
    GIT_REPOSITORY https://github.com/abseil/abseil-cpp.git
    GIT_TAG        20240116.2
    GIT_SHALLOW    TRUE
)
set(FETCHCONTENT_QUIET OFF)
FetchContent_MakeAvailable(abseil_cpp)

# Get webrtc-audio-processing headers (freedesktop.org v2.1)
# Note: The library uses Meson build system, only fetching source for header includes
# Point FETCHCONTENT_SOURCE_DIR to cloned third_party dir to avoid re-download
set(FETCHCONTENT_SOURCE_DIR_WEBRTC_AUDIO_PROCESSING
    ${CMAKE_CURRENT_SOURCE_DIR}/third_party/webrtc-audio-processing)
FetchContent_Declare(
    webrtc_audio_processing
    GIT_REPOSITORY https://gitlab.freedesktop.org/pulseaudio/webrtc-audio-processing.git
    GIT_TAG        v2.1
    GIT_SHALLOW    TRUE
)
FetchContent_MakeAvailable(webrtc_audio_processing)

# Create interface library for webrtc header dependencies
add_library(webrtc_audio_processing INTERFACE)
target_include_directories(webrtc_audio_processing INTERFACE
    ${webrtc_audio_processing_SOURCE_DIR}/webrtc
    ${webrtc_audio_processing_BINARY_DIR}/webrtc
)

# Add source files
add_executable(recorder
    # src/test_microphone.cpp
    src/main.cpp
    src/recorder.cpp
    src/mac_recorder.cpp
    src/microphone_capture.cpp
    src/ring_buffer.cpp
    src/logger.cpp
    src/mic_recorder.mm
    src/mic_recorder_main.mm
    src/system_capture_recorder_main.mm
    src/audio_device_manager.mm
    src/audio_system_capture.mm
    src/webrtc_aec_wrapper.cpp
    src/wav_file_writer.cpp
    src/aec_recorder.mm
)

# Set Objective-C++ compile options
set_target_properties(recorder PROPERTIES
    COMPILE_FLAGS "-x objective-c++ -fobjc-arc -fmodules -DABSL_NULLABILITY_COMPATIBLE="
    OUTPUT_NAME "recorder"
)

# Get abseil include directory
FetchContent_GetProperties(abseil_cpp)
if(abseil_cpp_POPULATED)
    set(ABSEIL_INCLUDE_DIR "${abseil_cpp_SOURCE_DIR}")
else()
    set(ABSEIL_INCLUDE_DIR "")
endif()

# Add include directories
target_include_directories(recorder PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}/include
    ${webrtc_audio_processing_SOURCE_DIR}/webrtc
    ${webrtc_audio_processing_BINARY_DIR}/webrtc
    ${ABSEIL_INCLUDE_DIR}
)

# Link libraries
target_link_libraries(recorder PRIVATE
    webrtc_audio_processing
    ${AVFoundation}
    ${Foundation}
    ${CoreAudio}
    ${AudioToolbox}
    ${AudioUnit}
    ${CoreFoundation}
    ${CoreServices}
)

# Set output directory
set_target_properties(recorder PROPERTIES
    RUNTIME_OUTPUT_DIRECTORY "${CMAKE_BINARY_DIR}/bin"
)

# Install target
install(TARGETS recorder
    RUNTIME DESTINATION bin
)

# Add entitlements file
set_target_properties(recorder PROPERTIES
    XCODE_ATTRIBUTE_CODE_SIGN_ENTITLEMENTS "${CMAKE_CURRENT_SOURCE_DIR}/src/recorder.entitlements"
)

# Create entitlements file
file(WRITE ${CMAKE_CURRENT_SOURCE_DIR}/src/recorder.entitlements
    "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n"
    "<!DOCTYPE plist PUBLIC \"-//Apple//DTD PLIST 1.0//EN\" \"http://www.apple.com/DTDs/PropertyList-1.0.dtd\">\n"
    "<plist version=\"1.0\">\n"
    "<dict>\n"
    "    <key>com.apple.security.app-sandbox</key>\n"
    "    <true/>\n"
    "    <key>com.apple.security.assets.music.read-write</key>\n"
    "    <true/>\n"
    "    <key>com.apple.security.device.audio-input</key>\n"
    "    <true/>\n"
    "    <key>com.apple.security.files.user-selected.read-write</key>\n"
    "    <true/>\n"
    "</dict>\n"
    "</plist>\n"
)
