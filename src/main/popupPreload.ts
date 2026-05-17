import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  startRecording: () => ipcRenderer.invoke('recording:start'),
  stopRecording: () => ipcRenderer.invoke('recording:stop'),
  pauseRecording: () => ipcRenderer.invoke('recording:pause'),
  resumeRecording: () => ipcRenderer.invoke('recording:resume'),
  openMainWindow: () => ipcRenderer.invoke('window:open-main'),
  quitApp: () => ipcRenderer.invoke('app:quit'),
  setRecordingState: (recording: boolean) => ipcRenderer.send('recording:state', recording),
  dragWindow: (dx: number, dy: number) => ipcRenderer.send('window:drag', dx, dy),
})
