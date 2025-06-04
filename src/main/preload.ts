import { contextBridge, ipcRenderer } from 'electron'
import { PermissionStatus } from './audio/SystemAudioManager';

// Detect dev mode
const isDevelopment = process.argv.includes('--dev') || process.env.NODE_ENV === 'development'

const LoggerLevel = isDevelopment ? 'debug' : 'info';

// System Audio data type definition
interface SystemAudioData {
  buffer: Buffer;
  sampleRate: number;
  channels: number;
  size: number;
  frames: number;
  timestamp: number;
  duration: number;
}

interface MicStatus {
  timestamp: string;
  status: 'ON' | 'OFF';
  appName: string;
  bundleId: string;
  processName: string;
  pid: string;
  path: string;
}

interface Permissions {
  requestAll: () => Promise<void>;
  getAll: () => Promise<{
    microphone: string;
    platform: string;
  }>;
  openSystemPreferences: () => Promise<void>;
  openMicrophonePreferences: () => Promise<void>;
  openScreenRecordingPreferences: () => Promise<void>;
  requestMicrophone: () => Promise<boolean>;
  requestSystemAudio: () => Promise<boolean>;
  resetSystemAudioPermission: () => Promise<void>;
  resetScreenRecordingPermission: () => Promise<void>;
  resetMicrophonePermission: () => Promise<void>;
  resetAll: () => Promise<void>;
  checkMicrophonePermission: () => Promise<PermissionStatus>;
  checkScreenRecordingPermission: () => Promise<PermissionStatus>;
  checkSystemAudioPermission: () => Promise<PermissionStatus>;
}

interface MixedPCMData {
  data: Buffer;
  frames: number;
  sampleRate: number;
}

interface SystemAudio {
  initialize: () => Promise<boolean>;
  isAvailable: () => Promise<boolean>;
  startCapture: (outputPath: string) => Promise<boolean>;
  stopCapture: () => Promise<{ wavPath: string | null; duration: number }>;
  isCapturing: () => Promise<boolean>;
  onMixedPCM: (callback: (data: MixedPCMData) => void) => void;
  setMicGain: (gain: number) => Promise<void>;
  setSystemGain: (gain: number) => Promise<void>;
}

interface Logger {
  error: (message: string, ...meta: any[]) => void;
  warn: (message: string, ...meta: any[]) => void;
  info: (message: string, ...meta: any[]) => void;
  debug: (message: string, ...meta: any[]) => void;
}

interface MicMonitor {
  getActiveApps: () => Promise<MicStatus[]>;
  clearActiveApps: () => Promise<void>;
  onStatusChange: (callback: (status: MicStatus) => void) => void;
  removeStatusListener: () => void;
}

interface ElectronAPI {
  micMonitor: MicMonitor;
  permissions: Permissions;
  systemAudio: SystemAudio;
  logger: Logger;
  getAppVersion: () => Promise<string>;
  isDevelopment: () => Promise<boolean>;
  audioConverter: {
    convertPcmToWebm: (pcmData: Uint8Array, sampleRate: number, channels: number) => Promise<Uint8Array>;
    convertPcmToMp3: (pcmData: Uint8Array, sampleRate: number, channels: number) => Promise<Uint8Array>;
    convertWavToMp3: (wavPath: string) => Promise<Uint8Array>;
    getSupportedFormats: () => Promise<string[]>;
  };
}

// API exposed to renderer process
const api: ElectronAPI = {
  micMonitor: {
    getActiveApps: () => ipcRenderer.invoke('mic-monitor:get-active-apps'),
    clearActiveApps: () => ipcRenderer.invoke('mic-monitor:clear-active-apps'),
    onStatusChange: (callback: (status: MicStatus) => void) => {
      ipcRenderer.on('mic-status-change', (_, status) => callback(status));
    },
    removeStatusListener: () => {
      ipcRenderer.removeAllListeners('mic-status-change');
    }
  },
  logger: {
    error: (message: string, ...meta: any[]) => {
      return ipcRenderer.invoke('logger:error', message, ...meta)
    },
    warn: (message: string, ...meta: any[]) => {
      return ipcRenderer.invoke('logger:warn', message, ...meta)
    },
    info: (message: string, ...meta: any[]) => {
      return ipcRenderer.invoke('logger:info', message, ...meta)
    },
    debug: (message: string, ...meta: any[]) => {
      if (LoggerLevel !== 'debug') return;
      return ipcRenderer.invoke('logger:debug', message, ...meta)
    },
  },
  // Permission related
  permissions: {
    requestAll: () => ipcRenderer.invoke('permissions:requestAll'),
    getAll: () => ipcRenderer.invoke('permissions:getAll'),
    requestSystemAudio: () => ipcRenderer.invoke('permissions:requestSystemAudio'),
    requestMicrophone: () => ipcRenderer.invoke('permissions:requestMicrophone'),
    openSystemPreferences: () => ipcRenderer.invoke('permissions:openSystemPreferences'),
    openMicrophonePreferences: () => ipcRenderer.invoke('permissions:openMicrophonePreferences'),
    openScreenRecordingPreferences: () => ipcRenderer.invoke('permissions:openScreenRecordingPreferences'),
    resetAll: () => ipcRenderer.invoke('permissions:resetAll'),
    resetSystemAudioPermission: () => ipcRenderer.invoke('permissions:resetSystemAudioPermission'),
    resetScreenRecordingPermission: () => ipcRenderer.invoke('permissions:resetScreenRecordingPermission'),
    resetMicrophonePermission: () => ipcRenderer.invoke('permissions:resetMicrophonePermission'),
    checkMicrophonePermission: () => ipcRenderer.invoke('permissions:checkMicrophonePermission'),
    checkScreenRecordingPermission: () => ipcRenderer.invoke('permissions:checkScreenRecordingPermission'),
    checkSystemAudioPermission: () => ipcRenderer.invoke('permissions:checkSystemAudioPermission'),
  },

  // System Audio related
  systemAudio: {
    initialize: () => ipcRenderer.invoke('systemAudio:initialize'),
    isAvailable: () => ipcRenderer.invoke('systemAudio:isAvailable'),
    startCapture: (outputPath: string) =>
      ipcRenderer.invoke('systemAudio:startCapture', outputPath),
    stopCapture: () => ipcRenderer.invoke('systemAudio:stopCapture'),
    isCapturing: () => ipcRenderer.invoke('systemAudio:isCapturing'),
    onMixedPCM: (callback: (data: MixedPCMData) => void) => {
      ipcRenderer.removeAllListeners('system-audio:mixed-pcm')
      ipcRenderer.on('system-audio:mixed-pcm', (_event, data) => callback(data))
    },
    setMicGain: (gain: number) => ipcRenderer.invoke('systemAudio:setMicGain', gain),
    setSystemGain: (gain: number) => ipcRenderer.invoke('systemAudio:setSystemGain', gain),
  },

  // App info related
  getAppVersion: () => ipcRenderer.invoke('appInfo:getVersion'),
  isDevelopment: () => ipcRenderer.invoke('appInfo:isDevelopment'),

  // Audio conversion interface
  audioConverter: {
    convertPcmToWebm: (pcmData: Uint8Array, sampleRate: number, channels: number) => 
      ipcRenderer.invoke('audio-converter:convert-pcm-to-webm', pcmData, sampleRate, channels),
    
    convertPcmToMp3: (pcmData: Uint8Array, sampleRate: number, channels: number) => 
      ipcRenderer.invoke('audio-converter:convert-pcm-to-mp3', pcmData, sampleRate, channels),
    
    convertWavToMp3: (wavPath: string) =>
      ipcRenderer.invoke('audio-converter:convert-wav-to-mp3', wavPath),

    getSupportedFormats: () =>
      ipcRenderer.invoke('audio-converter:get-supported-formats')
  }
}

// API exposed to renderer process
contextBridge.exposeInMainWorld('electronAPI', api)

// Expose type definitions
declare global {
  interface Window {
    // electronAPI: ElectronAPI;
    __DEV__: boolean;
  }
}

// Set global flag for dev mode
if (isDevelopment) {
  contextBridge.exposeInMainWorld('__DEV__', true);
  window.__DEV__ = true;
}

// Add mic status listener
contextBridge.exposeInMainWorld('micMonitor', {
  onStatusChange: (callback: (status: any) => void) => {
    ipcRenderer.on('mic-status-change', (_, status) => callback(status));
  },
  onError: (callback: (error: string) => void) => {
    ipcRenderer.on('mic-monitor-error', (_, error) => callback(error));
  },
  removeStatusListener: () => {
    ipcRenderer.removeAllListeners('mic-status-change');
    ipcRenderer.removeAllListeners('mic-monitor-error');
  },
  getActiveApps: () => ipcRenderer.invoke('mic-monitor:get-active-apps'),
  clearActiveApps: () => ipcRenderer.invoke('mic-monitor:clear-active-apps')
}); 