#include "wav_file_writer.h"
#include "logger.h"
#include <cstring>

WAVFileWriter::WAVFileWriter() = default;

WAVFileWriter::~WAVFileWriter() {
    if (is_open_) {
        Close();
    }
}

bool WAVFileWriter::Open(const std::string& path, int sampleRate, int channels, int bitsPerSample) {
    if (is_open_) {
        Logger::warn("WAVFileWriter: already open, closing existing file first");
        Close();
    }

    file_ = fopen(path.c_str(), "wb");
    if (!file_) {
        Logger::error("WAVFileWriter: failed to open file: %s", path.c_str());
        return false;
    }

    file_path_ = path;
    sample_rate_ = sampleRate;
    channels_ = channels;
    bits_per_sample_ = bitsPerSample;
    data_bytes_written_ = 0;
    is_open_ = true;

    WriteHeader();
    Logger::info("WAVFileWriter: opened %s", path.c_str());
    return true;
}

void WAVFileWriter::WriteHeader() {
    struct WAVHeader {
        char     riff_id[4];        // "RIFF"
        uint32_t riff_size;         // file size - 8
        char     wave_id[4];        // "WAVE"
        char     fmt_id[4];         // "fmt "
        uint32_t fmt_size;          // 16 for PCM
        uint16_t audio_format;      // 1 = PCM
        uint16_t num_channels;
        uint32_t sample_rate;
        uint32_t byte_rate;
        uint16_t block_align;
        uint16_t bits_per_sample;
        char     data_id[4];        // "data"
        uint32_t data_size;
    } header;

    memcpy(header.riff_id, "RIFF", 4);
    memcpy(header.wave_id, "WAVE", 4);
    memcpy(header.fmt_id, "fmt ", 4);
    memcpy(header.data_id, "data", 4);

    header.fmt_size = 16;
    header.audio_format = 1; // PCM
    header.num_channels = static_cast<uint16_t>(channels_);
    header.sample_rate = static_cast<uint32_t>(sample_rate_);
    header.bits_per_sample = static_cast<uint16_t>(bits_per_sample_);
    header.byte_rate = sample_rate_ * channels_ * (bits_per_sample_ / 8);
    header.block_align = channels_ * (bits_per_sample_ / 8);
    header.data_size = 0;
    header.riff_size = 36;

    fseek(file_, 0, SEEK_SET);
    fwrite(&header, sizeof(header), 1, file_);
    fflush(file_);
}

bool WAVFileWriter::Write(const int16_t* data, size_t frames) {
    if (!is_open_ || !file_) {
        return false;
    }

    size_t bytes = frames * channels_ * (bits_per_sample_ / 8);
    size_t written = fwrite(data, 1, bytes, file_);
    if (written != bytes) {
        Logger::error("WAVFileWriter: write failed");
        return false;
    }

    data_bytes_written_ += static_cast<int64_t>(bytes);
    return true;
}

bool WAVFileWriter::Close() {
    if (!is_open_) return false;

    FinalizeHeader();
    fclose(file_);
    file_ = nullptr;
    is_open_ = false;

    Logger::info("WAVFileWriter: closed %s (%lld bytes)", file_path_.c_str(),
                 static_cast<long long>(data_bytes_written_));
    return true;
}

void WAVFileWriter::FinalizeHeader() {
    if (!file_) return;

    uint32_t riffSize = static_cast<uint32_t>(data_bytes_written_ + 36);
    uint32_t dataSize = static_cast<uint32_t>(data_bytes_written_);

    fseek(file_, 4, SEEK_SET);
    fwrite(&riffSize, sizeof(uint32_t), 1, file_);

    fseek(file_, 40, SEEK_SET);
    fwrite(&dataSize, sizeof(uint32_t), 1, file_);

    fflush(file_);
}

std::string WAVFileWriter::GetFilePath() const { return file_path_; }
int64_t WAVFileWriter::GetBytesWritten() const { return data_bytes_written_; }
bool WAVFileWriter::IsOpen() const { return is_open_; }
