#pragma once

#include <string>
#include <cstdio>
#include <cstdint>

class WAVFileWriter {
public:
    WAVFileWriter();
    ~WAVFileWriter();

    bool Open(const std::string& path, int sampleRate, int channels, int bitsPerSample);
    bool Write(const int16_t* data, size_t frames);
    bool Close();

    std::string GetFilePath() const;
    int64_t GetBytesWritten() const;
    bool IsOpen() const;

private:
    void WriteHeader();
    void FinalizeHeader();

    FILE* file_ = nullptr;
    std::string file_path_;
    int sample_rate_ = 0;
    int channels_ = 0;
    int bits_per_sample_ = 0;
    int64_t data_bytes_written_ = 0;
    bool is_open_ = false;
};
