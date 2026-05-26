#pragma once

#include <atomic>
#include <cstddef>
#include <vector>

// Lock-free single-producer single-consumer ring buffer.
//
// The producer thread (CoreAudio IOProc) calls write().
// The consumer thread (AVAudioEngine tap) calls read() and available_read().
//
// Positions are monotonically increasing counters (never wrap).
// Buffer index is obtained via bitmask: pos & (size-1).
// Size must be a power of 2 (enforced in constructor).
class RingBuffer {
public:
    explicit RingBuffer(size_t size);
    ~RingBuffer() = default;

    // Producer (IOProc thread): copy count frames into the buffer.
    // Returns false if insufficient space (non-blocking).
    bool write(const float* data, size_t count);

    // Consumer (tap thread): copy up to count frames out of the buffer.
    // Returns the number of frames actually read (non-blocking).
    size_t read(float* data, size_t count);

    size_t available_read() const;
    size_t available_write() const;

    void clear();

private:
    size_t             capacity_;     // power of 2
    size_t             mask_;         // capacity_ - 1
    std::vector<float> buffer_;

    std::atomic<size_t> write_pos_{0};
    std::atomic<size_t> read_pos_{0};
};
