import { BrowserWindow, screen } from 'electron'
import * as path from 'path'

export class PopupWindow {
  private win: BrowserWindow | null = null
  private isRecording = false

  create(): void {
    const cursor = screen.getCursorScreenPoint()
    const display = screen.getDisplayNearestPoint(cursor)
    const { x, y, width, height } = display.bounds

    this.win = new BrowserWindow({
      width: 200,
      height: 40,
      x: Math.round(x + width / 2 - 100),
      y: Math.round(y + height - 100),
      frame: false,
      transparent: true,
      resizable: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      hasShadow: false,
      show: false,
      webPreferences: {
        preload: path.join(__dirname, '../popupPreload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        devTools: true,
      },
    })

    if (process.env.NODE_ENV === 'development' || true) {
      this.win.webContents.openDevTools({ mode: 'detach' })
    }

    this.win.loadFile(path.join(__dirname, '../../renderer/popup.html'))
    this.win.on('blur', () => {
      if (!this.isRecording) this.hide()
    })
  }

  setRecording(recording: boolean): void {
    this.isRecording = recording
  }

  show(): void {
    if (!this.win) this.create()
    this.win?.show()
    this.win?.focus()
  }

  hide(): void {
    if (!this.isRecording) {
      this.win?.hide()
    }
  }

  close(): void {
    this.win?.close()
    this.win = null
  }

  getWindow(): BrowserWindow | null {
    return this.win
  }

  send(channel: string, ...args: any[]): void {
    this.win?.webContents.send(channel, ...args)
  }
}
