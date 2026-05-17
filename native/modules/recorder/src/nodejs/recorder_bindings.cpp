#include <napi.h>
#include "aec_recorder.h"
#include "logger.h"
#include <iostream>

class LoggerWrapper : public Napi::ObjectWrap<LoggerWrapper> {
public:
    static Napi::Object Init(Napi::Env env, Napi::Object exports) {
        Napi::Function func = DefineClass(env, "Logger", {
            StaticMethod("setJsLogger", &LoggerWrapper::SetJsLogger),
            StaticMethod("debug", &LoggerWrapper::Debug),
            StaticMethod("info", &LoggerWrapper::Info),
            StaticMethod("warn", &LoggerWrapper::Warn),
            StaticMethod("error", &LoggerWrapper::Error)
        });

        exports.Set("Logger", func);
        return exports;
    }

    LoggerWrapper(const Napi::CallbackInfo& info) : Napi::ObjectWrap<LoggerWrapper>(info) {}

    ~LoggerWrapper() {
        if (jsLoggerIsSet_) {
            jsLogger_.Release();
            jsLoggerIsSet_ = false;
        }
    }
    static void CallJsLogger(const std::string& level, const std::string& message) {
        if (!jsLoggerIsSet_) return;

        jsLogger_.BlockingCall([level, message](Napi::Env env, Napi::Function jsCallback) {
            if (!jsCallback) {
                return;
            }
            try {
                Napi::HandleScope scope(env);
                jsCallback.Call({
                    Napi::String::New(env, level),
                    Napi::String::New(env, message)
                });
            } catch (const std::exception& e) {
                std::cerr << "JS Logger callback error: " << e.what() << std::endl;
            }
        });
    }

private:
    static Napi::ThreadSafeFunction jsLogger_;
    static bool jsLoggerIsSet_;

    static void SetJsLogger(const Napi::CallbackInfo& info) {
        Napi::Env env = info.Env();

        if (info.Length() < 1 || !info[0].IsFunction()) {
            Napi::TypeError::New(env, "Function expected").ThrowAsJavaScriptException();
            return;
        }

        try {
            if (jsLoggerIsSet_) {
                jsLogger_.Release();
                jsLoggerIsSet_ = false;
            }

            Napi::Function jsCallback = info[0].As<Napi::Function>();
            jsLogger_ = Napi::ThreadSafeFunction::New(
                env,
                jsCallback,
                "JsLogger",
                0,
                1
            );
            jsLoggerIsSet_ = true;
        } catch (const std::exception& e) {
            Napi::Error::New(env, e.what()).ThrowAsJavaScriptException();
        }
    }

    static Napi::Value Debug(const Napi::CallbackInfo& info) {
        if (info.Length() < 1) return info.Env().Undefined();
        CallJsLogger("debug", info[0].As<Napi::String>().Utf8Value());
        return info.Env().Undefined();
    }

    static Napi::Value Info(const Napi::CallbackInfo& info) {
        if (info.Length() < 1) return info.Env().Undefined();
        CallJsLogger("info", info[0].As<Napi::String>().Utf8Value());
        return info.Env().Undefined();
    }

    static Napi::Value Warn(const Napi::CallbackInfo& info) {
        if (info.Length() < 1) return info.Env().Undefined();
        CallJsLogger("warn", info[0].As<Napi::String>().Utf8Value());
        return info.Env().Undefined();
    }

    static Napi::Value Error(const Napi::CallbackInfo& info) {
        if (info.Length() < 1) return info.Env().Undefined();
        CallJsLogger("error", info[0].As<Napi::String>().Utf8Value());
        return info.Env().Undefined();
    }
};

Napi::ThreadSafeFunction LoggerWrapper::jsLogger_;
bool LoggerWrapper::jsLoggerIsSet_ = false;

// Global function for C++ code to call
extern "C" {
    void log_debug(const char* message) {
        LoggerWrapper::CallJsLogger("debug", message);
    }

    void log_info(const char* message) {
        LoggerWrapper::CallJsLogger("info", message);
    }

    void log_warn(const char* message) {
        LoggerWrapper::CallJsLogger("warn", message);
    }

    void log_error(const char* message) {
        LoggerWrapper::CallJsLogger("error", message);
    }
}

class RecorderWrapper : public Napi::ObjectWrap<RecorderWrapper> {
public:
    static Napi::Object Init(Napi::Env env, Napi::Object exports) {
        Napi::Function func = DefineClass(env, "Recorder", {
            InstanceMethod("prepare", &RecorderWrapper::Prepare),
            InstanceMethod("startCapture", &RecorderWrapper::StartCapture),
            InstanceMethod("stopCapture", &RecorderWrapper::StopCapture),
            InstanceMethod("pauseCapture", &RecorderWrapper::PauseCapture),
            InstanceMethod("resumeCapture", &RecorderWrapper::ResumeCapture),
            InstanceMethod("setMixedPCMCallback", &RecorderWrapper::SetMixedPCMCallback),
            InstanceMethod("setOutputFile", &RecorderWrapper::SetOutputFile),
            InstanceMethod("setWhisperOutputFile", &RecorderWrapper::SetWhisperOutputFile),
            InstanceMethod("setMicGain", &RecorderWrapper::SetMicGain),
            InstanceMethod("setSystemGain", &RecorderWrapper::SetSystemGain),
            InstanceMethod("setAECEnabled", &RecorderWrapper::SetAECEnabled),
            StaticMethod("checkSystemAudioPermission", &RecorderWrapper::CheckSystemAudioPermission),
            StaticMethod("requestSystemAudioPermission", &RecorderWrapper::RequestSystemAudioPermission),
        });

        exports.Set("Recorder", func);
        return exports;
    }

    RecorderWrapper(const Napi::CallbackInfo& info) : Napi::ObjectWrap<RecorderWrapper>(info) {
        try {
            recorder_ = new AECRecorder();
            if (!recorder_) {
                throw std::runtime_error("Failed to create AECRecorder");
            }
        } catch (const std::exception& e) {
            Napi::Error::New(info.Env(), e.what()).ThrowAsJavaScriptException();
        }
    }

    ~RecorderWrapper() {
        if (recorder_) {
            try {
                recorder_->StopCapture();
            } catch (...) {
                // Ignore stop errors to avoid exceptions in destructor
            }
            try {
                recorder_->Dispose();
            } catch (...) {
                // Ignore release errors to avoid exceptions in destructor
            }
            try {
                delete recorder_;
                recorder_ = nullptr;
            } catch (...) {
                // Ignore delete errors to avoid exceptions in destructor
            }
        }
        if (tsfnIsSet_) {
            try {
                tsfn_.Release();
                tsfnIsSet_ = false;
            } catch (...) {
                // Ignore release errors to avoid exceptions in destructor
            }
        }
    }

private:
    Napi::Value Prepare(const Napi::CallbackInfo& info) {
        if (!recorder_) {
            Napi::Error::New(info.Env(), "AECRecorder is not initialized").ThrowAsJavaScriptException();
            return info.Env().Undefined();
        }
        bool ok = recorder_->Prepare();
        return Napi::Boolean::New(info.Env(), ok);
    }

    Napi::Value StartCapture(const Napi::CallbackInfo& info) {
        if (!recorder_) {
            Napi::Error::New(info.Env(), "AECRecorder is not initialized").ThrowAsJavaScriptException();
            return info.Env().Undefined();
        }
        bool ok = recorder_->StartCapture();
        return Napi::Boolean::New(info.Env(), ok);
    }

    void StopCapture(const Napi::CallbackInfo& info) {
        if (!recorder_) {
            Napi::Error::New(info.Env(), "AECRecorder is not initialized").ThrowAsJavaScriptException();
            return;
        }
        recorder_->StopCapture();
    }

    Napi::Value PauseCapture(const Napi::CallbackInfo& info) {
        if (!recorder_) {
            Napi::Error::New(info.Env(), "AECRecorder is not initialized").ThrowAsJavaScriptException();
            return info.Env().Undefined();
        }
        return Napi::Boolean::New(info.Env(), recorder_->PauseCapture());
    }

    Napi::Value ResumeCapture(const Napi::CallbackInfo& info) {
        if (!recorder_) {
            Napi::Error::New(info.Env(), "AECRecorder is not initialized").ThrowAsJavaScriptException();
            return info.Env().Undefined();
        }
        return Napi::Boolean::New(info.Env(), recorder_->ResumeCapture());
    }

    void SetMixedPCMCallback(const Napi::CallbackInfo& info) {
        Napi::Env env = info.Env();
        if (info.Length() < 1 || !info[0].IsFunction()) {
            Napi::TypeError::New(env, "Function expected").ThrowAsJavaScriptException();
            return;
        }
        if (!recorder_) {
            Napi::Error::New(env, "AECRecorder is not initialized").ThrowAsJavaScriptException();
            return;
        }

        try {
            // If ThreadSafeFunction exists, release it first
            if (tsfnIsSet_) {
                tsfn_.Release();
                tsfnIsSet_ = false;
            }

            Napi::Function jsCallback = info[0].As<Napi::Function>();
            tsfn_ = Napi::ThreadSafeFunction::New(env, jsCallback, "MixedPCMCallback", 0, 1, this);
            tsfnIsSet_ = true;

            recorder_->SetMixedPCMCallback(
                [this](const float* data, int32_t frames, int32_t sampleRate) {
                    if (!tsfnIsSet_) return;

                    int byteSize = frames * sizeof(float);
                    auto* copy = new uint8_t[byteSize];
                    memcpy(copy, data, byteSize);

                    tsfn_.BlockingCall([copy, byteSize, frames, sampleRate](
                        Napi::Env env, Napi::Function jsCallback) {
                        try {
                            auto buffer = Napi::Buffer<uint8_t>::Copy(env, copy, byteSize);
                            delete[] copy;
                            auto obj = Napi::Object::New(env);
                            obj.Set("data", buffer);
                            obj.Set("frames", Napi::Number::New(env, frames));
                            obj.Set("sampleRate", Napi::Number::New(env, sampleRate));
                            jsCallback.Call({obj});
                        } catch (const std::exception& e) {
                            std::cerr << "MixedPCM callback exception: " << e.what() << std::endl;
                            delete[] copy;
                        } catch (...) {
                            std::cerr << "MixedPCM callback unknown exception" << std::endl;
                            delete[] copy;
                        }
                    });
                });
        } catch (const std::exception& e) {
            Napi::Error::New(env, e.what()).ThrowAsJavaScriptException();
        }
    }

    void SetOutputFile(const Napi::CallbackInfo& info) {
        Napi::Env env = info.Env();
        if (!recorder_) {
            Napi::Error::New(env, "AECRecorder is not initialized").ThrowAsJavaScriptException();
            return;
        }
        if (info.Length() < 1 || !info[0].IsString()) {
            Napi::TypeError::New(env, "String expected").ThrowAsJavaScriptException();
            return;
        }

        try {
            std::string path = info[0].As<Napi::String>().Utf8Value();
            bool ok = recorder_->SetOutputFile(path);
            if (!ok) {
                Napi::Error::New(env, "Failed to set output file").ThrowAsJavaScriptException();
            }
        } catch (const std::exception& e) {
            Napi::Error::New(env, e.what()).ThrowAsJavaScriptException();
        }
    }

    void SetWhisperOutputFile(const Napi::CallbackInfo& info) {
        Napi::Env env = info.Env();
        if (!recorder_) {
            Napi::Error::New(env, "AECRecorder is not initialized").ThrowAsJavaScriptException();
            return;
        }
        if (info.Length() < 1 || !info[0].IsString()) {
            Napi::TypeError::New(env, "String expected").ThrowAsJavaScriptException();
            return;
        }
        try {
            std::string path = info[0].As<Napi::String>().Utf8Value();
            bool ok = recorder_->SetWhisperOutputFile(path);
            if (!ok) {
                Napi::Error::New(env, "Failed to set whisper output file").ThrowAsJavaScriptException();
            }
        } catch (const std::exception& e) {
            Napi::Error::New(env, e.what()).ThrowAsJavaScriptException();
        }
    }

    void SetMicGain(const Napi::CallbackInfo& info) {
        Napi::Env env = info.Env();
        if (!recorder_) {
            Napi::Error::New(env, "AECRecorder is not initialized").ThrowAsJavaScriptException();
            return;
        }
        if (info.Length() < 1 || !info[0].IsNumber()) {
            Napi::TypeError::New(env, "Number expected").ThrowAsJavaScriptException();
            return;
        }

        try {
            float gain = info[0].As<Napi::Number>().FloatValue();
            recorder_->SetMicGain(gain);
        } catch (const std::exception& e) {
            Napi::Error::New(env, e.what()).ThrowAsJavaScriptException();
        }
    }

    void SetSystemGain(const Napi::CallbackInfo& info) {
        Napi::Env env = info.Env();
        if (!recorder_) {
            Napi::Error::New(env, "AECRecorder is not initialized").ThrowAsJavaScriptException();
            return;
        }
        if (info.Length() < 1 || !info[0].IsNumber()) {
            Napi::TypeError::New(env, "Number expected").ThrowAsJavaScriptException();
            return;
        }

        try {
            float gain = info[0].As<Napi::Number>().FloatValue();
            recorder_->SetSystemGain(gain);
        } catch (const std::exception& e) {
            Napi::Error::New(env, e.what()).ThrowAsJavaScriptException();
        }
    }

    void SetAECEnabled(const Napi::CallbackInfo& info) {
        Napi::Env env = info.Env();
        if (!recorder_) {
            Napi::Error::New(env, "AECRecorder is not initialized").ThrowAsJavaScriptException();
            return;
        }
        if (info.Length() < 1 || !info[0].IsBoolean()) {
            Napi::TypeError::New(env, "Boolean expected").ThrowAsJavaScriptException();
            return;
        }

        try {
            bool enabled = info[0].As<Napi::Boolean>().Value();
            recorder_->SetAECEnabled(enabled);
        } catch (const std::exception& e) {
            Napi::Error::New(env, e.what()).ThrowAsJavaScriptException();
        }
    }

    static Napi::Value CheckSystemAudioPermission(const Napi::CallbackInfo& info) {
        Napi::Env env = info.Env();
        try {
            int result = AECRecorder::CheckSystemAudioPermission();
            return Napi::Number::New(env, result);
        } catch (const std::exception& e) {
            Napi::Error::New(env, e.what()).ThrowAsJavaScriptException();
            return env.Undefined();
        }
    }

    static Napi::Value RequestSystemAudioPermission(const Napi::CallbackInfo& info) {
        Napi::Env env = info.Env();
        try {
            bool granted = AECRecorder::RequestSystemAudioPermission();
            return Napi::Boolean::New(env, granted);
        } catch (const std::exception& e) {
            Napi::Error::New(env, e.what()).ThrowAsJavaScriptException();
            return env.Undefined();
        }
    }

    AECRecorder* recorder_ = nullptr;
    Napi::ThreadSafeFunction tsfn_;
    bool tsfnIsSet_ = false;
};

Napi::Object Init(Napi::Env env, Napi::Object exports) {
    LoggerWrapper::Init(env, exports);
    return RecorderWrapper::Init(env, exports);
}

NODE_API_MODULE(recorder, Init)
