/// <reference path="./types/global.d.ts" />

import './styles.css';
import { DOMElements, getDOMElements } from './dom/elements';
import { UI } from './dom/ui';
import { AudioRecorder } from './audio/recorder';
import { AudioVisualizer } from './audio/visualizer';
import { requestAllPermissions, checkPermissions, PermissionStatus } from './utils/permissions';
import { RecordMode } from './types/audio';
import { createLogger } from './logger';

const logger = createLogger('app');

interface MicStatus {
  timestamp: string;
  status: 'ON' | 'OFF';
  appName: string;
  bundleId: string;
  processName: string;
  pid: string;
  path: string;
  category?: string;
  outputStatus?: string;
}

class MicStatusDisplay {
  private container: HTMLElement;
  private activeApps: Map<string, MicStatus> = new Map();
  private recorder: AudioRecorder;
  constructor(recorder: AudioRecorder) {
    this.container = document.createElement('div');
    this.container.className = 'mic-status-container';
    this.recorder = recorder;
    this.init();
  }

  private init() {
    // Create title and clear button
    const header = document.createElement('div');
    header.className = 'mic-status-header';
    
    const title = document.createElement('h2');
    title.textContent = 'Auto Record';
    
    // const clearButton = document.createElement('button');
    // clearButton.textContent = 'Clear List';
    // clearButton.onclick = () => this.clearApps();
    
    header.appendChild(title);
    // header.appendChild(clearButton);
    this.container.appendChild(header);

    // Create app list container
    const listContainer = document.createElement('div');
    listContainer.className = 'mic-status-list';
    this.container.appendChild(listContainer);

    // Add to page
    document.body.appendChild(this.container);

    // Set styles
    this.setupStyles();

    // Initialize listeners
    this.setupListeners();
  }

  private setupStyles() {
    const style = document.createElement('style');
    style.textContent = `
      .mic-status-container {
        padding: 20px;
        background: #fff;
        border-radius: 8px;
        box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        margin: 20px;
      }

      .mic-status-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 20px;
      }

      .mic-status-header h2 {
        margin: 0;
        color: #333;
      }

      .mic-status-header button {
        padding: 8px 16px;
        background: #f5f5f5;
        border: 1px solid #d9d9d9;
        border-radius: 4px;
        cursor: pointer;
      }

      .mic-status-header button:hover {
        background: #e6e6e6;
      }

      .mic-status-list {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }

      .mic-status-item {
        padding: 8px 12px;
        border: 1px solid #e8e8e8;
        border-radius: 4px;
        background: #fafafa;
      }

      .mic-status-item.active {
        border-color: #ff4d4f;
        background: #fff1f0;
      }

      .app-name {
        font-weight: bold;
        color: #333;
      }
    `;
    document.head.appendChild(style);
  }

  private async setupListeners() {
    // Listen for Mic Status changes
    window.electronAPI.micMonitor.onStatusChange((status: MicStatus) => {
      if (status.status === 'ON') {
        this.activeApps.set(status.bundleId, status);
        if (this.recorder.getRecordingState() === 'stopped') {
          this.recorder.startRecording();
        }
      } else {
        this.activeApps.delete(status.bundleId);
        if (this.activeApps.size === 0 && this.recorder.getRecordingState() !== 'stopped') {
          this.recorder.stopRecording();
        }
      }
      this.updateDisplay();
    });

    // Get current active app
    const currentApps = await window.electronAPI.micMonitor.getActiveApps();
    currentApps.forEach(app => {
      this.activeApps.set(app.bundleId, app);
    });
    this.updateDisplay();
  }

  private updateDisplay() {
    const listContainer = this.container.querySelector('.mic-status-list');
    if (!listContainer) return;

    listContainer.innerHTML = '';
    
    this.activeApps.forEach(app => {
      const item = document.createElement('div');
      item.className = `mic-status-item ${app.status === 'ON' ? 'active' : ''}`;
      
      const appName = document.createElement('span');
      appName.className = 'app-name';
      appName.textContent = app.appName;
      
      item.appendChild(appName);
      listContainer.appendChild(item);
    });
  }

  private clearApps() {
    window.electronAPI.micMonitor.clearActiveApps();
    this.activeApps.clear();
    this.updateDisplay();
  }
}

// Initialize app
async function initApp(): Promise<void> {
    try {
        logger.info('Initializing app...');
        
        // Wait for DOM to load
        if (document.readyState === 'loading') {
            console.log('Waiting for DOM...');
            await new Promise(resolve => {
                document.addEventListener('DOMContentLoaded', resolve);
            });
        }
        console.log('DOM loaded');

        // Get DOM elements
        await new Promise(resolve => setTimeout(resolve, 100)); // Give DOM some time to fully render
        const elements = getDOMElements();

        // Get version info
        const version = await window.electronAPI.getAppVersion();
        const isDevMode = await window.electronAPI.isDevelopment();
        elements.versionElement.textContent = `Version ${version}${isDevMode ? ' (Dev)' : ''}`;

        logger.info('Initializing UI and recorder');
        const ui = new UI(elements);
        const visualizer = new AudioVisualizer(elements.visualizer);
        const recorder = new AudioRecorder(ui, visualizer);
        // Initializing UI and recorder
        const micStatusDisplay = new MicStatusDisplay(recorder);

        logger.info('Binding event listeners');
        // Binding event listeners
        bindEventListeners(elements, recorder, ui);

        logger.info('Requesting all permissions');

        await requestAllPermissions();

        // // Check and show permission status
        const [micGranted, systemAudioGranted] = await checkPermissions();
        ui.updatePermissionStatus({ micGranted, systemAudioGranted });

        ui.updateStatus('Ready');
        logger.info('App initialized');
    } catch (error) {
        logger.error(`App init failed: ${error}`);
    }
}

// Binding event listeners
function bindEventListeners(elements: DOMElements, recorder: AudioRecorder, ui: UI): void {
    // Recording mode switching
    elements.microphoneRadio.addEventListener('change', () => {
        if (elements.microphoneRadio.checked) {
            ui.updateRecordMode(RecordMode.MICROPHONE);
            recorder.setRecordMode(RecordMode.MICROPHONE);
        }
    });

    elements.systemRadio.addEventListener('change', () => {
        if (elements.systemRadio.checked) {
            ui.updateRecordMode(RecordMode.SYSTEM);
            recorder.setRecordMode(RecordMode.SYSTEM);
        }
    });

    elements.mixedRadio.addEventListener('change', () => {
        if (elements.mixedRadio.checked) {
            ui.updateRecordMode(RecordMode.MIXED);
            recorder.setRecordMode(RecordMode.MIXED);
        }
    });

    // Permission button
    elements.requestMicrophonePermissionBtn.addEventListener('click', async () => {
        const status = await window.electronAPI.permissions.checkMicrophonePermission();
        if (status === PermissionStatus.GRANTED) {
            ui.updatePermissionStatus({ micGranted: true });
            return;
        } else if (status === PermissionStatus.NOT_REQUESTED) {
            const isTrue = await window.electronAPI.permissions.requestMicrophone();
            ui.updatePermissionStatus({ micGranted: isTrue });
        } else {
            await window.electronAPI.permissions.openMicrophonePreferences();
            ui.updatePermissionStatus({ micGranted: false });
        }
    });

    elements.requestSystemAudioPermissionBtn.addEventListener('click', async () => {
        const status = await window.electronAPI.permissions.checkSystemAudioPermission();
        if (status === PermissionStatus.GRANTED) {
            ui.updatePermissionStatus({ systemAudioGranted: true });
            return;
        } else if (status === PermissionStatus.NOT_REQUESTED) {
            const isTrue = await window.electronAPI.permissions.requestSystemAudio();
            ui.updatePermissionStatus({ systemAudioGranted: isTrue });
        } else {
            await window.electronAPI.permissions.openSystemPreferences();
            ui.updatePermissionStatus({ systemAudioGranted: false });
        }
    });

    // Start Recording button click event
    elements.startRecordBtn.addEventListener('click', async () => {
        const currentState = recorder.getRecordingState();
        switch (currentState) {
            case 'stopped':
                await recorder.startRecording();
                break;
            case 'paused':
                recorder.resumeRecording();
                break;
            case 'recording':
                recorder.pauseRecording();
                break;
        }
    });

    elements.stopRecordBtn.addEventListener('click', async () => {
        try {
            await recorder.stopRecording();
            ui.updateRecordingUI('stopped');
        } catch (error) {
            console.error('Failed to stop recording:', error);
        }
    });

    document.addEventListener("toggleMicMute", (event) => {
        recorder.toggleMicMute();
    });

    document.addEventListener("setMicGain", (ev: any) => {
        recorder.setMicGain(ev.detail);
    });

    document.addEventListener("toggleSystemMute", (event) => {
        recorder.toggleSystemMute();
    });

    document.addEventListener("setSystemGain", (ev: any) => {
        recorder.setSystemGain(ev.detail);
    });

    // Recordings list event delegation
    elements.recordingsList.addEventListener('click', (event: Event) => {
        const target = event.target as HTMLElement;
        const button = target.closest('button[data-action]') as HTMLButtonElement;
        
        if (!button) return;
        
        const action = button.getAttribute('data-action');
        const recordingId = parseInt(button.getAttribute('data-id') || '0');
        
        if (!recordingId) return;
        
        switch (action) {
            case 'play':
                const recording = recorder.getRecordings().find(r => r.id === recordingId);
                if (recording) {
                    recorder.playRecording(recording);
                }
                break;
            case 'download':
                recorder.downloadRecording(recordingId);
                break;
            case 'delete':
                recorder.deleteRecording(recordingId);
                break;
        }
    });
}

// Initialize app after page load
document.addEventListener('DOMContentLoaded', initApp);

// Clean up resources
window.addEventListener('beforeunload', (): void => {
    logger.info('App shutting down');
}); 