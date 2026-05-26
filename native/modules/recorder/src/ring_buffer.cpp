#include "ring_buffer.h"
#include <algorithm>

static size_t RoundUpPower2(size_t n) {
    if (n == 0) return 1024;
    size_t p = 1;
    while (p < n) p <<= 1;
    return p;
}

RingBuffer::RingBuffer(size_t size)
    : capacity_(RoundUpPower2(size))
    , mask_(capacity_ - 1)
    , buffer_(capacity_, 0.0f) {}

bool RingBuffer::write(const float* data, size_t count) {
    const auto w = write_pos_.load(std::memory_order_relaxed);
    const auto r = read_pos_.load(std::memory_order_acquire);

    if (w - r + count > capacity_)
        return false;

    for (size_t i = 0; i < count; ++i)
        buffer_[(w + i) & mask_] = data[i];

    write_pos_.store(w + count, std::memory_order_release);
    return true;
}

size_t RingBuffer::read(float* data, size_t count) {
    const auto r = read_pos_.load(std::memory_order_relaxed);
    const auto w = write_pos_.load(std::memory_order_acquire);

    const size_t avail = w - r;
    const size_t toRead = std::min(count, avail);

    for (size_t i = 0; i < toRead; ++i)
        data[i] = buffer_[(r + i) & mask_];

    if (toRead > 0)
        read_pos_.store(r + toRead, std::memory_order_release);

    return toRead;
}

size_t RingBuffer::available_read() const {
    const auto w = write_pos_.load(std::memory_order_acquire);
    const auto r = read_pos_.load(std::memory_order_relaxed);
    return w - r;
}

size_t RingBuffer::available_write() const {
    const auto w = write_pos_.load(std::memory_order_relaxed);
    const auto r = read_pos_.load(std::memory_order_acquire);
    return capacity_ - (w - r) - 1;
}

void RingBuffer::clear() {
    write_pos_.store(0, std::memory_order_relaxed);
    read_pos_.store(0, std::memory_order_relaxed);
}
