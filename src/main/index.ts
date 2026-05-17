import { app, ipcMain, protocol, Notification, shell } from 'electron'
import * as fs from 'fs/promises'
import * as path from 'path'
import { setupAllIPC } from './ipc'

// Register custom protocol scheme before app ready
protocol.registerSchemesAsPrivileged([
  { scheme: 'local-file', privileges: { bypassCSP: true, stream: true, supportFetchAPI: true } }
])
import { TrayManager } from './menu/TrayManager'
import { ShortcutManager } from './menu/ShortcutManager'
import { PopupWindow } from './windows/PopupWindow'
import { MainWindow } from './windows/MainWindow'

import { createLogger } from './utils/logger'
import { setLocale } from './utils/i18n'
import micMonitorDaemon from './mic-monitor/mic-monitor-daemon'
import { PermissionManager } from './permissions/PermissionManager'
import { SettingsStore } from './store/SettingsStore'

const logger = createLogger('main')

// Force handle N-API exceptions to avoid affecting usage
process.env.NODE_OPTIONS = '--force-node-api-uncaught-exceptions-policy=true'

// Global exception handling - prevent app crash
process.on('uncaughtException', (error) => {
  logger.error('Caught global exception', { error: error.message, stack: error.stack })
  // Do not exit process, ensure app continues running
})

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Caught unhandled Promise rejection', { reason, promise })
  // Do not exit process, ensure app continues running
})

// Handle N-API warnings specifically
process.on('warning', (warning) => {
  if (warning.name === 'DeprecationWarning' && 
      warning.message.includes('N-API callback exception')) {
    // Silently handle N-API warnings, do not print to console
    return
  }
  logger.warn('Process warning', { name: warning.name, message: warning.message, stack: warning.stack })
})

let disposes: Array<() => void> = [];

let popupWindow: PopupWindow
let trayManager: TrayManager
let shortcutManager: ShortcutManager

// Initialize mic monitor
logger.info('Initializing mic monitor daemon')

// Register IPC handlers early to avoid race with renderer
ipcMain.handle('mic-monitor:get-active-apps', () => {
  return micMonitorDaemon.getActiveApps()
})

ipcMain.handle('mic-monitor:clear-active-apps', () => {
  micMonitorDaemon.clearActiveApps()
})

ipcMain.handle('window:open-main', () => {
  MainWindow.show()
})

ipcMain.handle('window:minimize', () => MainWindow.minimize())
ipcMain.handle('window:maximize', () => MainWindow.maximize())
ipcMain.handle('window:close', () => MainWindow.close())
ipcMain.handle('window:is-maximized', () => MainWindow.isMaximized())

ipcMain.handle('app:quit', () => {
  app.quit()
})

ipcMain.handle('shell:open-external', (_event, url: string) => {
  shell.openExternal(url)
})

ipcMain.on('recording:state', (_event, recording: boolean) => {
  popupWindow.setRecording(recording)
})

ipcMain.on('window:drag', (_event, dx: number, dy: number) => {
  const win = popupWindow.getWindow()
  if (win) {
    const [x, y] = win.getPosition()
    win.setPosition(x + dx, y + dy)
  }
})

// Start mic monitor when app is ready
app.whenReady().then(async () => {
  await PermissionManager.requestAllPermissions()

  // Register custom protocol for playing local audio files
  protocol.handle('local-file', async (request) => {
    try {
      const filePath = decodeURIComponent(request.url.slice('local-file://'.length))
      const data = await fs.readFile(filePath)
      const ext = path.extname(filePath).toLowerCase()
      const mime: Record<string, string> = {
        '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4',
        '.json': 'application/json', '.md': 'text/markdown', '.txt': 'text/plain',
      }
      return new Response(data, {
        status: 200,
        headers: { 'Content-Type': mime[ext] || 'application/octet-stream' }
      })
    } catch {
      return new Response('Not found', { status: 404 })
    }
  })

  // Initialize IPC handlers
  disposes = setupAllIPC(null as any);

  // Initialize Tray, shortcuts, and popup (no main window, enter from tray)
  popupWindow = new PopupWindow()
  trayManager = new TrayManager()
  shortcutManager = new ShortcutManager()

  trayManager.onShowPopup = () => popupWindow.show()
  trayManager.onOpenMainWindow = () => MainWindow.show()
  trayManager.onQuit = () => app.quit()

  shortcutManager.onToggleRecording = () => {
    popupWindow.show()
  }

  // Read persisted locale for tray menu
  const settingsStore = new SettingsStore()
  const savedLocale = await settingsStore.getLocale()
  trayManager.initialize(savedLocale || undefined)
  shortcutManager.register()

  // Allow renderer to update tray locale dynamically
  ipcMain.handle('tray:set-locale', (_event, locale: string) => {
    setLocale(locale)
    trayManager.rebuildMenu()
    return { ok: true }
  })

  // Start mic monitor daemon
  micMonitorDaemon.start()

  logger.info('App started (tray mode)')
})

// Stop mic monitor when app is quitting
app.on('before-quit', () => {
  logger.info('Stopping mic monitor daemon before app quit')
  micMonitorDaemon.stop()
  shortcutManager?.unregister()
  trayManager?.destroy()
  disposes.forEach(cb => cb());
})

// Quit app when all windows are closed
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  MainWindow.show()
})
