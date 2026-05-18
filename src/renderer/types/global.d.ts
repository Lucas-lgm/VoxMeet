export interface MicStatus {
  timestamp: string
  status: 'ON' | 'OFF'
  appName: string
  bundleId: string
  processName: string
  pid: string
  path: string
}

export interface SystemAudioData {
  buffer: Buffer
  sampleRate: number
  channels: number
  size: number
  frames: number
  timestamp: number
  duration: number
}

export enum PermissionStatus {
  GRANTED = 0,
  DENIED = 1,
  NOT_REQUESTED = 2,
}

export interface Logger {
  error: (message: string, ...meta: any[]) => void
  warn: (message: string, ...meta: any[]) => void
  info: (message: string, ...meta: any[]) => void
  debug: (message: string, ...meta: any[]) => void
}

export interface Permissions {
  requestAll: () => Promise<{ microphone: PermissionStatus, systemAudio: PermissionStatus }>
  getAll: () => Promise<{
    microphone: PermissionStatus
    systemAudio: PermissionStatus
  }>
  openSystemPreferences: () => Promise<void>
  openMicrophonePreferences: () => Promise<void>
  openScreenRecordingPreferences: () => Promise<void>
  requestMicrophone: () => Promise<boolean>
  requestSystemAudio: () => Promise<boolean>
  resetAll: () => Promise<void>
  resetSystemAudioPermission: () => Promise<void>
  resetScreenRecordingPermission: () => Promise<void>
  resetMicrophonePermission: () => Promise<void>
  checkMicrophonePermission: () => Promise<PermissionStatus>
  checkScreenRecordingPermission: () => Promise<PermissionStatus>
  checkSystemAudioPermission: () => Promise<PermissionStatus>
}

export interface MicMonitor {
  getActiveApps: () => Promise<MicStatus[]>
  clearActiveApps: () => Promise<void>
  onStatusChange: (callback: (status: MicStatus) => void) => void
  removeStatusListener: () => void
}

export interface MixedPCMData {
  data: Buffer
  frames: number
  sampleRate: number
}

export interface SystemAudio {
  initialize: () => Promise<boolean>
  isAvailable: () => Promise<boolean>
  startCapture: (outputPath: string) => Promise<boolean>
  stopCapture: () => Promise<{ wavPath: string | null; duration: number }>
  isCapturing: () => Promise<boolean>
  onMixedPCM: (callback: (data: MixedPCMData) => void) => void
  setMicGain: (gain: number) => Promise<void>
  setSystemGain: (gain: number) => Promise<void>
}

export interface ElectronAPI {
  // Meeting management
  listMeetings: () => Promise<any[]>
  getMeeting: (id: string) => Promise<any>
  deleteMeeting: (id: string) => Promise<{ ok: boolean; error?: string }>
  renameMeeting: (id: string, title: string) => Promise<{ ok: boolean; error?: string }>

  // Proxy
  getProxyUrl: () => Promise<{ proxyUrl: string }>
  setProxyUrl: (url: string) => Promise<{ ok: boolean }>

  // Transcription
  startTranscription: (audioPath: string, meetingDir?: string) => Promise<{ ok: boolean; error?: string }>
  saveTranscriptionEdits: (meetingDir: string, segments: any[]) => Promise<{ ok: boolean; error?: string }>
  onTranscriptionProgress: (callback: (progress: { segments: number; lastTime: number; text: string }) => void) => () => void

  // AI Summary
  generateSummary: (meetingDir: string, fullText: string, segments: any[]) => Promise<{ ok: boolean; error?: string }>
  saveSummary: (meetingDir: string, markdown: string) => Promise<{ ok: boolean; error?: string }>

  // AI Settings
  getAISettings: () => Promise<any>
  saveAISettings: (settings: any) => Promise<{ ok: boolean; error?: string }>

  // Whisper model
  getWhisperModel: () => Promise<{ modelName: string }>
  setWhisperModel: (name: string) => Promise<{ ok: boolean }>

  // Whisper language
  getWhisperLanguage: () => Promise<{ language: string }>
  setWhisperLanguage: (lang: string) => Promise<{ ok: boolean }>

  // Model download
  listAvailableModels: () => Promise<any[]>
  listDownloadedModels: () => Promise<string[]>
  downloadModel: (name: string) => Promise<void>
  onModelDownloadProgress: (callback: (progress: any) => void) => () => void

  // Window controls
  minimizeWindow: () => Promise<void>
  maximizeWindow: () => Promise<void>
  closeWindow: () => Promise<void>
  isMaximized: () => Promise<boolean>
  onMaximizeChange: (callback: (maximized: boolean) => void) => void

  // Legacy (may be removed)
  micMonitor: MicMonitor
  permissions: Permissions
  systemAudio: SystemAudio
  logger: Logger
  isDevelopment: () => Promise<boolean>
  getAppVersion: () => Promise<string>
  audioConverter: {
    convertPcmToWebm: (pcmData: Uint8Array, sampleRate: number, channels: number) => Promise<Uint8Array>
    convertPcmToMp3: (pcmData: Uint8Array, sampleRate: number, channels: number) => Promise<Uint8Array>
    convertWavToMp3: (wavPath: string) => Promise<Uint8Array>
    getSupportedFormats: () => Promise<string[]>
  }

  // Locale
  getLocale: () => Promise<{ locale: string }>
  setLocale: (locale: string) => Promise<{ ok: boolean; error?: string }>

  // Tray locale
  setTrayLocale: (locale: string) => Promise<{ ok: boolean }>

  // Auto record
  getAutoRecord: () => Promise<{ enabled: boolean }>
  setAutoRecord: (enabled: boolean) => Promise<{ ok: boolean; error?: string }>

  // Output path
  getOutputPath: () => Promise<{ outputPath: string }>
  setOutputPath: (outputPath: string) => Promise<{ ok: boolean; error?: string }>

  // Shell utilities
  openFolder: (folderPath: string) => Promise<{ ok: boolean; error?: string }>
  selectFolder: () => Promise<{ canceled: boolean; path: string }>
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
    __DEV__: boolean
  }
}

interface UI {
  updateSystemAudioStatus: (enabled: boolean) => void
  updateRecordingStatus: (isRecording: boolean) => void
}

// MediaStreamTrackGenerator type definition
interface MediaStreamTrackGenerator<T> extends MediaStreamTrack {
  writable: WritableStream<T>
}

declare global {
  interface MediaStreamTrackGenerator<T> extends MediaStreamTrack {
    writable: WritableStream<T>
  }
} 