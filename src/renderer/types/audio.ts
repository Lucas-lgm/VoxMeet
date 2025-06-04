// System Audio related type definitions
export interface SystemAudioData {
    buffer: ArrayBuffer;
    sampleRate: number;
    channels: number;
    size?: number;
    frames?: number;
    timestamp?: number;
    duration?: number;
}

export interface SystemRecorderModule {
    prepare(): void;
    setAudioCallback(callback: (audioData: SystemAudioData) => void): void;
    startSystemCapture(): void;
    stopSystemCapture(): void;
}

// Recording mode enum
export enum RecordMode {
    MICROPHONE = 'microphone',
    SYSTEM = 'system',
    MIXED = 'mixed'
}

// Recording record type
export interface Recording {
    id: number;
    name: string;
    url: string;
    blob: Blob;
    duration: string;
    timestamp: Date;
    mode: RecordMode;
}

// Audio constraint type
export interface AudioConstraints {
    audio: {
        echoCancellation: boolean;
        noiseSuppression: boolean;
        sampleRate: number;
    };
} 