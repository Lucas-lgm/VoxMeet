import { BrowserWindow } from 'electron'
import * as path from 'path'

export class MainWindow {
  private static win: BrowserWindow | null = null

  static create(): void {
    this.win = new BrowserWindow({
      width: 900,
      height: 700,
      title: 'VoxMeet',
      frame: false,
      webPreferences: {
        preload: path.join(__dirname, '../mainPreload.js'),
        contextIsolation: true,
        nodeIntegration: false,
      },
      show: false,
    })
    this.win.loadFile(path.join(__dirname, '../../renderer/main/index.html'))
    this.win.once('ready-to-show', () => this.win?.show())

    this.win.on('maximize', () => {
      this.win?.webContents.send('window:maximize-change', true)
    })
    this.win.on('unmaximize', () => {
      this.win?.webContents.send('window:maximize-change', false)
    })

    this.win.on('closed', () => { this.win = null })
  }

  static show(): void {
    if (!this.win) this.create()
    this.win?.show()
    this.win?.focus()
  }

  static minimize(): void {
    this.win?.minimize()
  }

  static maximize(): void {
    if (this.win?.isMaximized()) {
      this.win.unmaximize()
    } else {
      this.win?.maximize()
    }
  }

  static close(): void {
    this.win?.close()
  }

  static isMaximized(): boolean {
    return this.win?.isMaximized() ?? false
  }
}
