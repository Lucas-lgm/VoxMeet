import { ipcMain } from 'electron'
import { createLogger } from '../utils/logger'

const logger = createLogger('renderer')

export function setupLoggerIPC() {
  ipcMain.handle('logger:error', (_, message: string, ...meta: any[]) => {
    logger.error(message, ...meta)
  })

  ipcMain.handle('logger:warn', (_, message: string, ...meta: any[]) => {
    logger.warn(message, ...meta)
  })

  ipcMain.handle('logger:info', (_, message: string, ...meta: any[]) => {
    logger.info(message, ...meta)
  })

  ipcMain.handle('logger:debug', (_, message: string, ...meta: any[]) => {
    logger.debug(message, ...meta)
  })

  return () => {}
} 