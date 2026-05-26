{
  "targets": [
    {
      "target_name": "recorder",
      "product_dir": "../../output",
      "cflags!": [ "-fno-exceptions" ],
      "cflags_cc!": [ "-fno-exceptions" ],
      "sources": [ 
        "src/recorder.cpp",
        "src/mac_recorder.cpp",
        "src/audio_system_capture.mm",
        "src/audio_system_capture.h",
        "src/audio_device_manager.mm",
        "src/logger.cpp",
        "src/ring_buffer.cpp",
        "src/nodejs/recorder_bindings.cpp",
        "src/mac_permission.mm",
        "src/webrtc_aec_wrapper.cpp",
        "src/wav_file_writer.cpp",
        "src/aec_recorder.mm",
        "src/resampler.cpp",
        "src/ducker.cpp"
      ],
      "include_dirs": [
        "<!@(node -p \"require('node-addon-api').include\")",
        "<!@(node -p \"require('node-addon-api').include_dir\")",
        "<!@(node -p \"require('node-addon-api').node_root_dir\")",
        "./include",
        "./src",
        "./src/nodejs",
        "third_party/webrtc-audio-processing/webrtc",
        "third_party/webrtc-audio-processing/subprojects/abseil-cpp-20240722.0",
        "third_party/libsamplerate"
      ],
      "defines": [
        "NAPI_DISABLE_CPP_EXCEPTIONS",
        "SPDLOG_HEADER_ONLY"
      ],
      "conditions": [
        ["OS=='mac'", {
          "xcode_settings": {
            "GCC_ENABLE_CPP_EXCEPTIONS": "YES",
            "CLANG_CXX_LIBRARY": "libc++",
            "MACOSX_DEPLOYMENT_TARGET": "14.2",
            "OTHER_CPLUSPLUSFLAGS": [ "-std=c++17", "-stdlib=libc++" ],
            "OTHER_CFLAGS": [ "-x", "objective-c++", "-ObjC++" ]
          },
          "link_settings": {
            "library_dirs": [
              "<(module_root_dir)/third_party/webrtc-audio-processing/_build/webrtc/modules/audio_processing"
            ],
            "libraries": [
              "-framework CoreAudio",
              "-framework AudioToolbox",
              "-framework CoreFoundation",
              "-framework AVFoundation",
              "-framework Foundation",
              "-lwebrtc-audio-processing-2",
              "<(module_root_dir)/third_party/libsamplerate/lib/libsamplerate.a"
            ]
          }
        }]
      ],
      "dependencies": [
        "<!@(node -p \"require('node-addon-api').gyp\")"
      ],
      "cflags_cc": ["-std=c++17"],
      "xcode_settings": {
        "OTHER_CPLUSPLUSFLAGS": ["-std=c++17"],
        "CLANG_CXX_LANGUAGE_STANDARD": "c++17",
        "CLANG_CXX_LIBRARY": "libc++",
        "MACOSX_DEPLOYMENT_TARGET": "14.2",
        "GCC_ENABLE_CPP_EXCEPTIONS": "YES",
        "CLANG_ENABLE_OBJC_ARC": "YES",
        "OTHER_CFLAGS": [
          "-ObjC++"
        ]
      }
    }
  ]
} 