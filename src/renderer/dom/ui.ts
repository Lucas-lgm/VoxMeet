import { DOMElements } from './elements';
import { Recording, RecordMode } from '../types/audio';

interface AudioControls {
    isMicMuted: boolean;
    isSystemMuted: boolean;
    micGain: number;
    systemGain: number;
}

export class UI {
    private elements: DOMElements;
    private currentRecordMode: RecordMode = RecordMode.MICROPHONE;
    private audioControls: HTMLDivElement | null = null;

    constructor(elements: DOMElements) {
        this.elements = elements;
        this.createAudioControls();
    }

    private createAudioControls(): void {
        // Create audio controls container
        this.audioControls = document.createElement('div');
        this.audioControls.className = 'audio-controls';
        this.audioControls.style.display = 'flex';

        // Mic controls
        const micControl = document.createElement('div');
        micControl.className = 'audio-control-group';
        micControl.setAttribute('data-label', 'Mic');
        
        const micMuteBtn = document.createElement('button');
        micMuteBtn.className = 'mute-button';
        micMuteBtn.innerHTML = '🎤';
        micMuteBtn.onclick = () => {
            const event = new CustomEvent('toggleMicMute');
            document.dispatchEvent(event);
        };

        const micGainSlider = document.createElement('input');
        micGainSlider.type = 'range';
        micGainSlider.min = '0';
        micGainSlider.max = '2.0';
        micGainSlider.step = '0.1';
        micGainSlider.value = '1.0';

        const micGainValueDisplay = document.createElement('span');
        micGainValueDisplay.className = 'gain-value-display';
        micGainValueDisplay.textContent = micGainSlider.value;

        micGainSlider.oninput = (e) => {
            const value = parseFloat((e.target as HTMLInputElement).value);
            const percentage = (value / 2) * 100;
            micGainSlider.style.background = `linear-gradient(to right, var(--accent-color) 0%, var(--accent-color) ${percentage}%, var(--bg-primary) ${percentage}%, var(--bg-primary) 100%)`;
            micGainValueDisplay.textContent = value.toFixed(1);
            micGainSlider.value = value.toFixed(1);
            const event = new CustomEvent('setMicGain', { 
                detail: value
            });
            document.dispatchEvent(event);
        };
        // Initialize mic slider background color
        micGainSlider.style.background = `linear-gradient(to right, var(--accent-color) 0%, var(--accent-color) 50%, var(--bg-primary) 50%, var(--bg-primary) 100%)`;

        micControl.appendChild(micMuteBtn);
        micControl.appendChild(micGainSlider);
        micControl.appendChild(micGainValueDisplay);

        // System Audio controls
        const systemControl = document.createElement('div');
        systemControl.className = 'audio-control-group';
        systemControl.setAttribute('data-label', 'System Audio');
        
        const systemMuteBtn = document.createElement('button');
        systemMuteBtn.className = 'mute-button';
        systemMuteBtn.innerHTML = '🔊';
        systemMuteBtn.onclick = () => {
            const event = new CustomEvent('toggleSystemMute');
            document.dispatchEvent(event);
        };

        const systemGainSlider = document.createElement('input');
        systemGainSlider.type = 'range';
        systemGainSlider.min = '0';
        systemGainSlider.max = '2.0';
        systemGainSlider.step = '0.1';
        systemGainSlider.value = '1.0';

        const systemGainValueDisplay = document.createElement('span');
        systemGainValueDisplay.className = 'gain-value-display';
        systemGainValueDisplay.textContent = systemGainSlider.value;

        systemGainSlider.oninput = (e) => {
            const value = parseFloat((e.target as HTMLInputElement).value);
            const percentage = (value / 2) * 100;
            systemGainSlider.value = value.toFixed(1);
            systemGainSlider.style.background = `linear-gradient(to right, var(--accent-color) 0%, var(--accent-color) ${percentage}%, var(--bg-primary) ${percentage}%, var(--bg-primary) 100%)`;
            systemGainValueDisplay.textContent = value.toFixed(1);
            const event = new CustomEvent('setSystemGain', { 
                detail: value
            });
            document.dispatchEvent(event);
        };
        // Initialize system audio slider background color
        systemGainSlider.style.background = `linear-gradient(to right, var(--accent-color) 0%, var(--accent-color) 50%, var(--bg-primary) 50%, var(--bg-primary) 100%)`;

        systemControl.appendChild(systemMuteBtn);
        systemControl.appendChild(systemGainSlider);
        systemControl.appendChild(systemGainValueDisplay);

        // Add to container
        this.audioControls.appendChild(micControl);
        this.audioControls.appendChild(systemControl);

        // Add to recording area
        const recorderSection = document.querySelector('.recorder-section');
        if (recorderSection) {
            recorderSection.appendChild(this.audioControls);
        }
    }

    // Update audio control state
    updateAudioControls(controls: AudioControls): void {
        if (!this.audioControls) return;

        const micMuteBtn = this.audioControls.querySelector('.audio-control-group:nth-child(1) .mute-button') as HTMLButtonElement;
        const micGainSlider = this.audioControls.querySelector('.audio-control-group:nth-child(1) input[type="range"]') as HTMLInputElement;
        const systemMuteBtn = this.audioControls.querySelector('.audio-control-group:nth-child(2) .mute-button') as HTMLButtonElement;
        const systemGainSlider = this.audioControls.querySelector('.audio-control-group:nth-child(2) input[type="range"]') as HTMLInputElement;

        if (micMuteBtn) {
            micMuteBtn.innerHTML = controls.isMicMuted ? '🎤❌' : '🎤';
            micMuteBtn.style.opacity = controls.isMicMuted ? '0.5' : '1';
        }

        if (micGainSlider) {
            (micGainSlider as HTMLInputElement).value = controls.micGain.toString();
            const micGainValueDisplay = this.audioControls.querySelector('.audio-control-group:nth-child(1) .gain-value-display') as HTMLSpanElement;
            if (micGainValueDisplay) {
                micGainValueDisplay.textContent = controls.micGain.toFixed(1);
            }
        }

        if (systemMuteBtn) {
            systemMuteBtn.innerHTML = controls.isSystemMuted ? '🔊❌' : '🔊';
            systemMuteBtn.style.opacity = controls.isSystemMuted ? '0.5' : '1';
        }

        if (systemGainSlider) {
            (systemGainSlider as HTMLInputElement).value = controls.systemGain.toString();

            const systemGainValueDisplay = this.audioControls.querySelector('.audio-control-group:nth-child(2) .gain-value-display') as HTMLSpanElement;
            if (systemGainValueDisplay) {
                systemGainValueDisplay.textContent = controls.systemGain.toFixed(1);
            }
        }
    }

    // Update recording button state
    updateRecordButtonState(state: 'start' | 'pause' | 'resume'): void {
        const btn = this.elements.startRecordBtn;
        const icon = btn.querySelector('.icon');

        switch (state) {
            case 'start':
                btn.disabled = false;
                if (icon) icon.textContent = '🎤';
                btn.textContent = 'Start Recording';
                break;
            case 'pause':
                btn.disabled = false;
                if (icon) icon.textContent = '⏸️';
                btn.textContent = 'Pause';
                break;
            case 'resume':
                btn.disabled = false;
                if (icon) icon.textContent = '▶️';
                btn.textContent = 'Resume';
                break;
        }
    }

    // Update recording UI state
    updateRecordingUI(recordingState: 'stopped' | 'recording' | 'paused'): void {
        const isRecording = recordingState !== 'stopped';
        const isPaused = recordingState === 'paused';

        this.elements.stopRecordBtn.disabled = !isRecording;
        
        // Disable mode switch while recording
        if (this.elements.microphoneRadio) this.elements.microphoneRadio.disabled = isRecording;
        if (this.elements.systemRadio) this.elements.systemRadio.disabled = isRecording;
        if (this.elements.mixedRadio) this.elements.mixedRadio.disabled = isRecording;
        
        const container = document.querySelector('.recorder-section') as HTMLElement;
        if (container) {
            if (isRecording) {
                container.classList.add('recording');
            } else {
                container.classList.remove('recording');
            }
        }

        if (this.audioControls) {
            this.audioControls.style.display = 'flex';
        }

        // Update recording button state
        if (!isRecording) {
            this.updateRecordButtonState('start');
        } else if (isPaused) {
            this.updateRecordButtonState('resume');
        } else {
            this.updateRecordButtonState('pause');
        }
    }

    updateRecordTime(time: string): void {
        this.elements.recordTime.textContent = time;
    }

    // Updating status display
    updateStatus(status: string): void {
        console.log('ui updateStatus', status);
        this.elements.recordingStatus.textContent = status;
    }

    // Update recording mode UI
    updateModeUI(): void {
        const icon = this.elements.startRecordBtn.querySelector('.icon') as HTMLSpanElement;
        const text = this.elements.startRecordBtn.childNodes[2] as Text;
        
        switch (this.currentRecordMode) {
            case RecordMode.MICROPHONE:
                if (icon) icon.textContent = '🎤';
                this.elements.startRecordBtn.lastChild!.textContent = '\n        Start Recording';
                this.updateStatus('Ready - Mic Mode');
                break;
            case RecordMode.SYSTEM:
                if (icon) icon.textContent = '🔊';
                this.elements.startRecordBtn.lastChild!.textContent = '\n        Capture System Audio';
                this.updateStatus('Ready - System Audio Mode');
                break;
            case RecordMode.MIXED:
                if (icon) icon.textContent = '🎙️';
                this.elements.startRecordBtn.lastChild!.textContent = '\n        Start Mixed Recording';
                this.updateStatus('Ready - Mixed Mode');
                break;
        }
    }

    // Disable System Audio option
    disableSystemAudioOption(): void {
        if (this.elements.systemRadio) {
            this.elements.systemRadio.disabled = true;
            const label = this.elements.systemRadio.parentElement as HTMLElement;
            if (label) {
                label.style.opacity = '0.5';
                label.style.cursor = 'not-allowed';
                label.title = 'System Audio Capture Unavailable';
            }
        }
        // Also disable Mixed Recording option
        if (this.elements.mixedRadio) {
            this.elements.mixedRadio.disabled = true;
            const label = this.elements.mixedRadio.parentElement as HTMLElement;
            if (label) {
                label.style.opacity = '0.5';
                label.style.cursor = 'not-allowed';
                label.title = 'Mixed Recording Unavailable';
            }
        }
    }

    // Update recordings list
    updateRecordingsList(recordings: Recording[]): void {
        if (recordings.length === 0) {
            this.elements.recordingsList.innerHTML = '<p class="empty-message">No recordings yet</p>';
            return;
        }
        
        this.elements.recordingsList.innerHTML = recordings.map((recording: Recording): string => {
            let modeIcon, modeText;
            switch (recording.mode) {
                case RecordMode.MICROPHONE:
                    modeIcon = '🎤';
                    modeText = 'Mic';
                    break;
                case RecordMode.SYSTEM:
                    modeIcon = '🔊';
                    modeText = 'System Audio';
                    break;
                case RecordMode.MIXED:
                    modeIcon = '🎙️';
                    modeText = 'Mixed Recording';
                    break;
            }
            
            const fileExt = recording.mode === RecordMode.SYSTEM ? 'wav' : 'webm';
            
            return `
                <div class="recording-item">
                    <div class="recording-info">
                        <div class="recording-name">${modeIcon} ${recording.name}</div>
                        <div class="recording-duration">Duration: ${recording.duration} | Mode: ${modeText}</div>
                    </div>
                    <div class="recording-actions">
                        <button class="btn btn-success btn-small" data-action="play" data-id="${recording.id}">
                            <span class="icon">▶️</span>Play
                        </button>
                        <button class="btn btn-secondary btn-small" data-action="download" data-id="${recording.id}" title="Save as ${fileExt}">
                            <span class="icon">💾</span>Save
                        </button>
                        <button class="btn btn-danger btn-small" data-action="delete" data-id="${recording.id}">
                            <span class="icon">🗑️</span>Delete
                        </button>
                    </div>
                </div>
            `;
        }).join('');
    }

    // Set current Recording mode
    setRecordMode(mode: RecordMode): void {
        this.currentRecordMode = mode;
        this.updateModeUI();
    }

    // Get current Recording mode
    getRecordMode(): RecordMode {
        return this.currentRecordMode;
    }

    // Update recording mode
    updateRecordMode(mode: RecordMode): void {
        this.currentRecordMode = mode;
        // Update radio button state
        this.elements.microphoneRadio.checked = mode === RecordMode.MICROPHONE;
        this.elements.systemRadio.checked = mode === RecordMode.SYSTEM;
        this.elements.mixedRadio.checked = mode === RecordMode.MIXED;

        if (this.audioControls) {
            this.audioControls.style.display = 'flex';
        }
    }

    /**
     * Update Mic mute status
     */
    updateMicMuteState(isMuted: boolean) {
        this.elements.micMuteBtn.classList.toggle('muted', isMuted);
        this.elements.micMuteBtn.textContent = isMuted ? '🔇' : '🎤';
    }

    /**
     * Update System Audio mute status
     */
    updateSystemMuteState(isMuted: boolean) {
        this.elements.systemMuteBtn.classList.toggle('muted', isMuted);
        this.elements.systemMuteBtn.textContent = isMuted ? '🔇' : '🔊';
    }

    /**
     * Update Mic gain value
     */
    updateMicGain(value: number) {
        this.elements.micGainSlider.value = value.toString();
    }

    /**
     * Update System Audio gain value
     */
    updateSystemGain(value: number) {
        this.elements.systemGainSlider.value = value.toString();
    }

    getMicGain(): number {
        let gain = 1.0
        if (this.audioControls) {
            const micGainValueDisplay = this.audioControls.querySelector('.audio-control-group:nth-child(1) .gain-value-display') as HTMLSpanElement;
            gain = parseFloat(micGainValueDisplay.textContent || "1.0")
        }

        return gain;
    }

    getSystemGain(): number {
        let gain = 1.0;
        if (this.audioControls) {
            const systemGainValueDisplay = this.audioControls.querySelector('.audio-control-group:nth-child(2) .gain-value-display') as HTMLSpanElement;
            gain = parseFloat(systemGainValueDisplay.textContent || "1.0")
        }

        return gain;
    }

    // Update permission status
    updatePermissionStatus({ micGranted, systemAudioGranted }: { micGranted?: boolean, systemAudioGranted?: boolean }) {
        // Mic Status
        if (micGranted !== undefined) {
            const micStatus = document.getElementById('microphoneStatus');
            const micBtn = document.getElementById('requestMicrophonePermission');
            if (micStatus) {
                micStatus.textContent = micGranted ? '✅' : '⚪';
                micStatus.className = 'status-icon' + (micGranted ? ' granted' : ' denied');
            }
            if (micBtn) {
                micBtn.style.display = micGranted ? 'none' : 'inline-flex';
            }
        }

        // System Audio Status
        if (systemAudioGranted !== undefined) {
            const sysStatus = document.getElementById('systemAudioStatus');
            const sysBtn = document.getElementById('requestSystemAudioPermission');
            if (sysStatus) {
                sysStatus.textContent = systemAudioGranted ? '✅' : '⚪';
                sysStatus.className = 'status-icon' + (systemAudioGranted ? ' granted' : ' denied');
            }
            if (sysBtn) {
                sysBtn.style.display = systemAudioGranted ? 'none' : 'inline-flex';
            }
        }
    }
} 