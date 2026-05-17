import { ipcMain, app } from 'electron'

export function setupAppInfoIPC() {
  // Getting app version
  ipcMain.handle('appInfo:getVersion', async (): Promise<string> => {
    return app.getVersion()
  })

  // Check if in dev mode
  ipcMain.handle('appInfo:isDevelopment', (): boolean => {
    return process.env.NODE_ENV === 'development'
  })

  return () => {};
} 