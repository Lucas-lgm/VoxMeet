// Create WAV file buffer
export function createWavBuffer(pcmData: Int16Array, sampleRate: number, channels: number): ArrayBuffer {
    // Create WAV file header
    const wavHeader = new ArrayBuffer(44);
    const view = new DataView(wavHeader);
    
    // RIFF identifier
    const riffStr = 'RIFF';
    for (let i = 0; i < 4; i++) {
        view.setUint8(i, riffStr.charCodeAt(i));
    }
    
    // File size
    view.setUint32(4, 36 + pcmData.length * 2, true);
    
    // WAVE identifier
    const waveStr = 'WAVE';
    for (let i = 0; i < 4; i++) {
        view.setUint8(8 + i, waveStr.charCodeAt(i));
    }
    
    // fmt identifier
    const fmtStr = 'fmt ';
    for (let i = 0; i < 4; i++) {
        view.setUint8(12 + i, fmtStr.charCodeAt(i));
    }
    
    // fmt chunk size
    view.setUint32(16, 16, true);
    // Audio format (1 = PCM)
    view.setUint16(20, 1, true);
    // Number of channels
    view.setUint16(22, channels, true);
    // Sample rate
    view.setUint32(24, sampleRate, true);
    // Byte rate
    view.setUint32(28, sampleRate * channels * 2, true);
    // Block align
    view.setUint16(32, channels * 2, true);
    // Bit depth
    view.setUint16(34, 16, true);
    
    // data identifier
    const dataStr = 'data';
    for (let i = 0; i < 4; i++) {
        view.setUint8(36 + i, dataStr.charCodeAt(i));
    }
    
    // Data size
    view.setUint32(40, pcmData.length * 2, true);
    
    // Create full audio buffer
    const fullBuffer = new ArrayBuffer(44 + pcmData.length * 2);
    const fullView = new Uint8Array(fullBuffer);
    
    // Copy header
    fullView.set(new Uint8Array(wavHeader), 0);
    
    // Copy PCM data (little-endian)
    const pcmView = new DataView(fullBuffer, 44);
    for (let i = 0; i < pcmData.length; i++) {
        pcmView.setInt16(i * 2, pcmData[i], true);
    }
    
    return fullBuffer;
}

// Convert Float32Array to Int16Array
export function float32ToInt16(float32Array: Float32Array): Int16Array {
    const int16Array = new Int16Array(float32Array.length);
    for (let i = 0; i < float32Array.length; i++) {
        // Convert float32 to int16
        const s = Math.max(-1, Math.min(1, float32Array[i]));
        int16Array[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    return int16Array;
} 