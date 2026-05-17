import { BrowserWindow, ipcMain } from 'electron'
import { SystemAudioManager } from '../audio/SystemAudioManager'

export function setupSystemAudioIPC(mainWindow: BrowserWindow | null) {
  const systemAudioManager = new SystemAudioManager(mainWindow!)

  const registerMixedPCMForwarding = () => {
    systemAudioManager.onMixedPCM((data) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('system-audio:mixed-pcm', data)
      }
    })
  }

  ipcMain.handle('systemAudio:initialize', async () => {
    const ok = systemAudioManager.isAvailable()
      ? true
      : await systemAudioManager.initialize()
    if (ok) {
      registerMixedPCMForwarding()
    }
    return ok
  })

  ipcMain.handle('systemAudio:isAvailable', () => {
    return systemAudioManager.isAvailable()
  })

  ipcMain.handle('systemAudio:startCapture', (_event, outputPath: string) => {
    return systemAudioManager.startCapture(outputPath)
  })

  ipcMain.handle('systemAudio:stopCapture', () => {
    return systemAudioManager.stopCapture()
  })

  ipcMain.handle('systemAudio:isCapturing', () => {
    return systemAudioManager.isCaptureActive()
  })

  ipcMain.handle('systemAudio:setMicGain', (_event, gain: number) => {
    systemAudioManager.setMicGain(gain)
  })

  ipcMain.handle('systemAudio:setSystemGain', (_event, gain: number) => {
    systemAudioManager.setSystemGain(gain)
  })

  return () => systemAudioManager.dispose()
}
