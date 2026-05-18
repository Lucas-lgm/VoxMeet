import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  // Meeting history
  listMeetings: () => ipcRenderer.invoke('meeting:list'),
  getMeeting: (id: string) => ipcRenderer.invoke('meeting:get', id),
  deleteMeeting: (id: string) => ipcRenderer.invoke('meeting:delete', id),
  renameMeeting: (id: string, title: string) => ipcRenderer.invoke('meeting:rename', id, title),

  // Transcription
  startTranscription: (audioPath: string, meetingDir?: string) =>
    ipcRenderer.invoke('transcription:start', audioPath, meetingDir),
  saveTranscriptionEdits: (meetingDir: string, segments: any[]) =>
    ipcRenderer.invoke('transcription:save-edits', meetingDir, segments),
  onTranscriptionProgress: (callback: (progress: any) => void) => {
    const handler = (_event: any, progress: any) => callback(progress)
    ipcRenderer.on('transcription:progress', handler)
    return () => ipcRenderer.removeListener('transcription:progress', handler)
  },

  // AI Summary
  generateSummary: (meetingDir: string, fullText: string, segments: any[]) =>
    ipcRenderer.invoke('ai:summarize', meetingDir, fullText, segments),
  saveSummary: (meetingDir: string, markdown: string) =>
    ipcRenderer.invoke('summary:save', meetingDir, markdown),

  // AI Settings
  getAISettings: () => ipcRenderer.invoke('settings:get-ai'),
  saveAISettings: (settings: any) => ipcRenderer.invoke('settings:save-ai', settings),

  // Whisper model
  getWhisperModel: () => ipcRenderer.invoke('settings:get-whisper-model'),
  setWhisperModel: (modelName: string) => ipcRenderer.invoke('settings:set-whisper-model', modelName),

  // Whisper language
  getWhisperLanguage: () => ipcRenderer.invoke('settings:get-whisper-language'),
  setWhisperLanguage: (lang: string) => ipcRenderer.invoke('settings:set-whisper-language', lang),

  // Proxy
  getProxyUrl: () => ipcRenderer.invoke('settings:get-proxy'),
  setProxyUrl: (url: string) => ipcRenderer.invoke('settings:set-proxy', url),

  // Model download
  listAvailableModels: () => ipcRenderer.invoke('model:list-available'),
  listDownloadedModels: () => ipcRenderer.invoke('model:list-downloaded'),
  checkModel: (modelName: string) => ipcRenderer.invoke('model:check', modelName),
  downloadModel: (modelName: string) => ipcRenderer.invoke('model:download', modelName),
  onModelDownloadProgress: (callback: (progress: any) => void) => {
    const handler = (_event: any, progress: any) => callback(progress)
    ipcRenderer.on('model:download-progress', handler)
    return () => ipcRenderer.removeListener('model:download-progress', handler)
  },

  // Window controls
  minimizeWindow: () => ipcRenderer.invoke('window:minimize'),
  maximizeWindow: () => ipcRenderer.invoke('window:maximize'),
  closeWindow: () => ipcRenderer.invoke('window:close'),
  isMaximized: () => ipcRenderer.invoke('window:is-maximized'),
  onMaximizeChange: (callback: (maximized: boolean) => void) => {
    ipcRenderer.on('window:maximize-change', (_event, maximized) => callback(maximized))
  },

  // Locale
  getLocale: () => ipcRenderer.invoke('settings:get-locale'),
  setLocale: (locale: string) => ipcRenderer.invoke('settings:set-locale', locale),

  // Tray locale
  setTrayLocale: (locale: string) => ipcRenderer.invoke('tray:set-locale', locale),

  // Auto record
  getAutoRecord: () => ipcRenderer.invoke('settings:get-auto-record'),
  setAutoRecord: (enabled: boolean) => ipcRenderer.invoke('settings:set-auto-record', enabled),

  // Output path
  getOutputPath: () => ipcRenderer.invoke('settings:get-output-path'),
  setOutputPath: (outputPath: string) => ipcRenderer.invoke('settings:set-output-path', outputPath),

  // Shell utilities
  openExternal: (url: string) => ipcRenderer.invoke('shell:open-external', url),
  openFolder: (folderPath: string) => ipcRenderer.invoke('shell:open-folder', folderPath),
  selectFolder: () => ipcRenderer.invoke('shell:select-folder'),
})
