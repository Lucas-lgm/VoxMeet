'use strict';

const { Recorder } = require('./recorder');
const fs = require('fs');

async function testRecorder() {
    console.log('Starting recording test...');
    
    const recorder = new Recorder();
    const audioChunks = [];
    let sampleRate = 0;
    let channels = 0;
    
    try {
        recorder.prepare();

        recorder.setAudioCallback((audioData) => {
            // Save sample rate and channel count
            if (sampleRate === 0) {
                sampleRate = audioData.sampleRate;
                channels = audioData.channels;
            }
            
            // Convert audio data to Float32Array
            const buffer = Buffer.from(audioData.buffer);
            const floatArray = new Float32Array(buffer.buffer, buffer.byteOffset, buffer.byteLength / 4);
            audioChunks.push(floatArray);
            
            console.log(`Received ${floatArray.length} samples`);
        });

        recorder.startSystemCapture();

        // Record for 10 seconds
        await new Promise(resolve => setTimeout(resolve, 10000));
        
        recorder.stopSystemCapture();
        
        // Merge all audio data
        const totalSamples = audioChunks.reduce((acc, chunk) => acc + chunk.length, 0);
        const mergedData = new Float32Array(totalSamples);
        let offset = 0;
        for (const chunk of audioChunks) {
            mergedData.set(chunk, offset);
            offset += chunk.length;
        }
        
        // Convert to 16-bit PCM
        const pcmData = new Int16Array(mergedData.length);
        for (let i = 0; i < mergedData.length; i++) {
            // Convert float32 to int16
            const s = Math.max(-1, Math.min(1, mergedData[i]));
            pcmData[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
        }
        
        // Create WAV file header
        const wavHeader = Buffer.alloc(44);
        // RIFF identifier
        wavHeader.write('RIFF', 0);
        // File size
        wavHeader.writeUInt32LE(36 + pcmData.length * 2, 4);
        // WAVE identifier
        wavHeader.write('WAVE', 8);
        // fmt identifier
        wavHeader.write('fmt ', 12);
        // fmt chunk size
        wavHeader.writeUInt32LE(16, 16);
        // Audio format (1 = PCM)
        wavHeader.writeUInt16LE(1, 20);
        // Number of channels
        wavHeader.writeUInt16LE(channels, 22);
        // Sample rate
        wavHeader.writeUInt32LE(sampleRate, 24);
        // Byte rate
        wavHeader.writeUInt32LE(sampleRate * channels * 2, 28);
        // Block align
        wavHeader.writeUInt16LE(channels * 2, 32);
        // Bit depth
        wavHeader.writeUInt16LE(16, 34);
        // data identifier
        wavHeader.write('data', 36);
        // Data size
        wavHeader.writeUInt32LE(pcmData.length * 2, 40);
        
        // Create little-endian PCM data buffer
        const pcmBuffer = Buffer.alloc(pcmData.length * 2);
        for (let i = 0; i < pcmData.length; i++) {
            pcmBuffer.writeInt16LE(pcmData[i], i * 2);
        }
        
        // Write data to file (sync to ensure completion)
        const outputPath = 'output.wav';
        const fileBuffer = Buffer.concat([wavHeader, pcmBuffer]);
        fs.writeFileSync(outputPath, fileBuffer);
        
        console.log('Recording saved as output.wav');
        console.log(`Sample rate: ${sampleRate}Hz`);
        console.log(`Channels: ${channels}`);
        console.log(`Total samples: ${totalSamples}`);
        console.log(`Duration: ${totalSamples / sampleRate / channels}s`);
        console.log(`File size: ${fileBuffer.length} bytes`);
        
    } catch (error) {
        console.error('Test error:', error);
    }
}

testRecorder().catch(console.error);