/// <reference path="../types/global.d.ts" />
import { RecordMode, Recording, SystemAudioData } from '../types/audio';
import { UI } from '../dom/ui';
import { AudioVisualizer } from './visualizer';
import { formatTime } from '../utils/time';
import { checkPermissions } from '../utils/permissions';
import { throttle, debounce } from '../utils/throttle';
import { AudioStorage } from '../utils/audioStorage';
import { createLogger } from '../logger';
import { MicStatus } from '../types/global';
import { TaskQueue } from '../utils/TaskQueue';

const logger = createLogger('recorder');

export class AudioRecorder {
    private taskQueue = TaskQueue.getInstance("recorder");
    private ui: UI;
    private visualizer: AudioVisualizer;
    private audioStorage: AudioStorage;
    private recordingState: 'stopped' | 'recording' | 'paused' = 'stopped';
    private currentAudio: HTMLAudioElement | null = null;
    private recordings: Recording[] = [];
    private currentRecordMode: RecordMode = RecordMode.MICROPHONE;
    private sampleRate: number = 48000;
    private channels: number = 1;
    private isSystemAudioInitialized: boolean = false;
    private isMicMuted: boolean = false;
    private isSystemMuted: boolean = false;
    private micGain = 1.0;
    private systemGain = 1.0;
    private totalTime: number = 0;
    private currentRecordingId: number | null = null;
    private currentWavPath: string | null = null;

    // Visualization related
    private visualizerAudioContext: AudioContext | null = null;
    private visualizerTrackGenerator: MediaStreamTrackGenerator<AudioData> | null = null;
    private visualizerWriter: WritableStreamDefaultWriter<AudioData> | null = null;

    private throttledUpdateTime: (time: string) => void;
    private debouncedUpdateStatus: (status: string) => void;

    constructor(ui: UI, visualizer: AudioVisualizer) {
        this.ui = ui;
        this.visualizer = visualizer;
        this.audioStorage = new AudioStorage();

        this.throttledUpdateTime = throttle((time: string) => {
            this.ui.updateRecordTime(time);
        }, 1000);

        this.debouncedUpdateStatus = debounce((status: string) => {
            this.ui.updateStatus(status);
        }, 300);

        this.initializeSystemAudio();
        this.initializeStorage();
    }

    private async initializeStorage(): Promise<void> {
        try {
            await this.audioStorage.initialize();
            const recordingsMetadatas = await this.audioStorage.getAllRecordings();

            this.recordings = await Promise.all(recordingsMetadatas.map(async (metadata) => {
                const chunks = await this.audioStorage.getAudioChunks(metadata.id);
                const mergedData = this.mergeAudioChunks(chunks);
                if (mergedData.byteLength === 0) {
                    await this.audioStorage.deleteRecording(metadata.id);
                    return {
                        id: metadata.id,
                        name: metadata.name,
                        duration: formatTime(Math.floor(metadata.duration)),
                        url: '',
                        blob: new Blob(),
                        timestamp: new Date(),
                        mode: metadata.mode as RecordMode
                    }
                }
                const mp3Data = await window.electronAPI.audioConverter.convertPcmToMp3(
                    new Uint8Array(mergedData.buffer), metadata.sampleRate || 48000, metadata.channels || 1
                );
                const blob = new Blob([mp3Data], { type: 'audio/mp3' });
                return {
                    id: metadata.id,
                    name: metadata.name,
                    duration: formatTime(Math.floor(metadata.duration)),
                    url: URL.createObjectURL(blob),
                    blob: blob,
                    timestamp: new Date(),
                    mode: metadata.mode as RecordMode
                }
            }));

            this.recordings = this.recordings.filter(recording => recording.blob.size > 0);
            this.recordings.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

            this.ui.updateRecordingsList(this.recordings);
        } catch (error) {}
    }

    // Initializing system audio (native layer)
    async initializeSystemAudio(): Promise<void> {
        if (this.isSystemAudioInitialized) {
            return;
        }

        logger.info('Initializing system audio');

        try {
            const success = await window.electronAPI.systemAudio.initialize();

            if (!success) {
                throw new Error('System audio init failed');
            }

            this.isSystemAudioInitialized = true;
            logger.info('System Audio capture initialization complete');
        } catch (error) {
            logger.error(`System audio capture init failed: ${error}`);
            this.ui.disableSystemAudioOption();
        }
    }

    async startRecording(): Promise<void> {
        return this.taskQueue.enqueue(() => this._startRecording());
    }

    private async _startRecording(): Promise<void> {
        if (this.isCurrentlyRecording()) {
            this.updateStatus('Already Recording');
            return;
        }

        const [micGranted, systemAudioGranted] = await checkPermissions();
        this.ui.updatePermissionStatus({ micGranted, systemAudioGranted });

        if (this.currentRecordMode === RecordMode.MIXED && (!micGranted || !systemAudioGranted)) {
            this.updateStatus('Mic and System Audio Permission Required'); return;
        }

        this.recordingState = 'recording';
        this.totalTime = 0;

        try {
            const text = this.currentRecordMode === RecordMode.MICROPHONE ? 'Mic Recording'
                : this.currentRecordMode === RecordMode.SYSTEM ? 'System Recording' : 'Mixed Recording';
            const recordingName = `${text}_${new Date().toLocaleString('zh-CN')}`;

            this.currentRecordingId = (await this.audioStorage.saveRecordingMetadata(
                recordingName, 0, this.currentRecordMode,
                this.sampleRate, this.channels
            ).catch(() => null)) || null;

            // Prepare visualization
            this.setupVisualizationContext();

            // Register real-time PCM callback (for visualization + timing)
            window.electronAPI.systemAudio.onMixedPCM((pcm) => {
                if (this.recordingState !== 'recording') return;
                this.feedVisualizer(pcm.data, pcm.frames);
                this.totalTime += pcm.frames / pcm.sampleRate;
                this.throttledUpdateTime(formatTime(Math.floor(this.totalTime)));
            });

            // Start native capture + direct WAV write
            const wavPath = this.getDefaultWavPath();
            const ok = await window.electronAPI.systemAudio.startCapture(wavPath);
            if (!ok) {
                throw new Error('Failed to start capture');
            }
            this.currentWavPath = wavPath;

            this.ui.updateRecordingUI('recording');
            this.updateStatus('Recording...');

        } catch (error) {
            console.error('Failed to start recording:', error);
            this.stopRecording();
        }
    }

    async stopRecording(): Promise<void> {
        return this.taskQueue.enqueue(() => this._stopRecording());
    }

    private async _stopRecording(): Promise<void> {
        if (this.recordingState === 'stopped') return;

        logger.info('Stop Recording');

        this.recordingState = 'stopped';

        // Stop native capture
        const { wavPath } = await window.electronAPI.systemAudio.stopCapture();

        // Stop visualization
        this.visualizer.stop();
        this.cleanupVisualizationContext();

        this.ui.updateRecordingUI('stopped');

        const totalDuration = Math.floor(this.totalTime);

        if (wavPath) {
            try {
                const mp3Data = await window.electronAPI.audioConverter.convertWavToMp3(wavPath);
                const blob = new Blob([mp3Data], { type: 'audio/mp3' });
                const url = URL.createObjectURL(blob);

                const text = this.currentRecordMode === RecordMode.MICROPHONE ? 'Mic Recording'
                    : this.currentRecordMode === RecordMode.SYSTEM ? 'System Recording' : 'Mixed Recording';

                const recording: Recording = {
                    id: this.currentRecordingId!,
                    name: `${text}_${new Date().toLocaleString('zh-CN')}`,
                    url, blob,
                    duration: formatTime(totalDuration),
                    timestamp: new Date(),
                    mode: this.currentRecordMode
                };

                this.recordings.push(recording);
                this.recordings.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
                this.ui.updateRecordingsList(this.recordings);
            } catch (error) {
                console.error('Conversion failed:', error);
                this.updateStatus('Audio Conversion Failed');
            }
        }

        this.ui.updateRecordTime(formatTime(totalDuration));
        this.totalTime = 0;
        this.currentRecordingId = null;
        this.currentWavPath = null;
    }

    async pauseRecording(): Promise<void> {
        if (this.recordingState !== 'recording') return;
        this.recordingState = 'paused';
        this.ui.updateRecordingUI("paused");
        this.updateStatus('Recording Paused');
    }

    async resumeRecording(): Promise<void> {
        if (this.recordingState !== 'paused') return;
        this.recordingState = 'recording';
        this.ui.updateRecordingUI("recording");
        this.updateStatus('Recording Resumed');
    }

    private mergeAudioChunks(chunks: Int16Array[]): Int16Array {
        const totalSamples = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
        const mergedData = new Int16Array(totalSamples);
        let offset = 0;
        for (const chunk of chunks) {
            mergedData.set(chunk, offset);
            offset += chunk.length;
        }
        return mergedData;
    }

    // ===== Visualization (feed PCM via MediaStreamTrackGenerator) =====

    private setupVisualizationContext(): void {
        try {
            this.visualizerAudioContext = new AudioContext();

            this.visualizerTrackGenerator = new (window as any).MediaStreamTrackGenerator({
                kind: 'audio',
                sampleRate: this.sampleRate,
                channelCount: this.channels
            });
            if (!this.visualizerTrackGenerator) return;
            const stream = new MediaStream([this.visualizerTrackGenerator]);
            this.visualizerWriter = this.visualizerTrackGenerator.writable.getWriter();
            this.visualizer.setupVisualizer(stream);
        } catch (error) {
            logger.error('Failed to create visualization context:', error);
        }
    }

    private feedVisualizer(float32Data: Buffer, frames: number): void {
        if (!this.visualizerWriter) return;
        try {
            const audioData = new AudioData({
                format: 'f32',
                sampleRate: this.sampleRate,
                numberOfFrames: frames,
                numberOfChannels: this.channels,
                timestamp: performance.now(),
                data: float32Data.buffer
            });
            this.visualizerWriter.write(audioData).catch(() => {});
        } catch (error) {
            // Ignore visualization write errors
        }
    }

    private cleanupVisualizationContext(): void {
        if (this.visualizerWriter) {
            try { this.visualizerWriter.close(); } catch {}
            this.visualizerWriter = null;
        }
        if (this.visualizerTrackGenerator) {
            this.visualizerTrackGenerator.stop();
            this.visualizerTrackGenerator = null;
        }
        if (this.visualizerAudioContext) {
            this.visualizerAudioContext.close();
            this.visualizerAudioContext = null;
        }
    }

    // ===== Play =====

    playRecording(recording: Recording): void {
        if (this.currentAudio) {
            this.currentAudio.pause();
            this.currentAudio = null;
        }

        this.currentAudio = new Audio(recording.url);
        this.currentAudio.play().catch((error: Error) => {
            console.error('Playback failed:', error);
            this.updateStatus('Playback Failed');
        });

        const modeText = recording.mode === RecordMode.MICROPHONE ? 'Mic'
            : recording.mode === RecordMode.SYSTEM ? 'System Audio' : 'Mixed Recording';
        this.updateStatus(`Playing: ${recording.name} (${modeText})`);

        this.currentAudio.onended = (): void => {
            this.updateStatus('Ready');
            this.currentAudio = null;
        };

        this.currentAudio.onerror = (): void => {
            this.updateStatus('Playback Error');
            this.currentAudio = null;
        };
    }

    downloadRecording(recordingId: number): void {
        const recording = this.recordings.find((r: Recording): boolean => r.id === recordingId);
        if (recording) {
            const a = document.createElement('a');
            a.href = recording.url;
            a.download = `${recording.name}.mp3`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            this.updateStatus(`Saved: ${recording.name}`);
        }
    }

    async deleteRecording(recordingId: number): Promise<void> {
        const index = this.recordings.findIndex((r: Recording): boolean => r.id === recordingId);
        if (index !== -1) {
            const recording = this.recordings[index];
            URL.revokeObjectURL(recording.url);
            this.recordings.splice(index, 1);
            this.ui.updateRecordingsList(this.recordings);

            try {
                await this.audioStorage.deleteRecording(recordingId);
                this.updateStatus(`Deleted: ${recording.name}`);
            } catch (error) {
                console.error('Failed to delete recording data:', error);
                this.updateStatus('Failed to Delete Recording Data');
            }
        }
    }

    setRecordMode(mode: RecordMode): void {
        this.currentRecordMode = mode;
        this.ui.setRecordMode(mode);
    }

    getRecordMode(): RecordMode {
        return this.currentRecordMode;
    }

    getRecordings(): Recording[] {
        return this.recordings;
    }

    async cleanup(): Promise<void> {
        if (this.recordingState === 'recording') {
            await this.stopRecording();
        }

        this.visualizer.stop();
        this.cleanupVisualizationContext();

        this.recordings.forEach((recording: Recording): void => {
            URL.revokeObjectURL(recording.url);
        });
    }

    async stopSystemAudioCapture(): Promise<void> {
        try {
            await window.electronAPI.systemAudio.stopCapture();
            this.ui.updateRecordingUI("stopped");
            this.updateStatus('System Audio Recording Stopped');
        } catch (error) {
            console.error('Failed to stop system audio recording:', error);
            this.updateStatus('Failed to Stop System Audio Recording');
            throw error;
        }
    }

    toggleMicMute(): void {
        this.isMicMuted = !this.isMicMuted;
        this.ui.updateAudioControls({
            systemGain: this.systemGain,
            micGain: this.micGain,
            isMicMuted: this.isMicMuted,
            isSystemMuted: this.isSystemMuted
        });
        // Control gain through native layer
        window.electronAPI.systemAudio.setMicGain(this.isMicMuted ? 0 : this.micGain);
    }

    toggleSystemMute(): void {
        this.isSystemMuted = !this.isSystemMuted;
        this.ui.updateAudioControls({
            systemGain: this.systemGain,
            micGain: this.micGain,
            isMicMuted: this.isMicMuted,
            isSystemMuted: this.isSystemMuted
        });
        window.electronAPI.systemAudio.setSystemGain(this.isSystemMuted ? 0 : this.systemGain);
    }

    setMicGain(gain: number): void {
        this.micGain = gain;
        this.ui.updateAudioControls({
            systemGain: this.systemGain,
            micGain: this.micGain,
            isMicMuted: this.isMicMuted,
            isSystemMuted: this.isSystemMuted
        });
        if (this.isMicMuted) return;
        window.electronAPI.systemAudio.setMicGain(gain);
    }

    setSystemGain(gain: number): void {
        this.systemGain = gain;
        this.ui.updateAudioControls({
            systemGain: this.systemGain,
            micGain: this.micGain,
            isMicMuted: this.isMicMuted,
            isSystemMuted: this.isSystemMuted
        });
        if (this.isSystemMuted) return;
        window.electronAPI.systemAudio.setSystemGain(gain);
    }

    isCurrentlyRecording(): boolean {
        return this.recordingState === 'recording';
    }

    isCurrentlyPaused(): boolean {
        return this.recordingState === 'paused';
    }

    getRecordingState(): 'stopped' | 'recording' | 'paused' {
        return this.recordingState;
    }

    private getDefaultWavPath(): string {
        return `/tmp/recorder-${Date.now()}.wav`;
    }

    private updateStatus(status: string): void {
        this.debouncedUpdateStatus(status);
    }
}
