import { Tray, Menu, nativeImage } from 'electron'
import { setLocale, getLocale, t } from '../utils/i18n'

export class TrayManager {
  private tray: Tray | null = null

  rebuildMenu(): void {
    if (!this.tray) return
    this.tray.setToolTip(t('tray.tooltip'))
    this.tray.setContextMenu(Menu.buildFromTemplate([
      { label: t('tray.showPopup'), click: () => this.onShowPopup() },
      { label: t('tray.openMain'), click: () => this.onOpenMainWindow() },
      { type: 'separator' },
      { label: t('tray.quit'), click: () => this.onQuit() },
    ]))
  }

  initialize(locale?: string): void {
    if (locale) setLocale(locale)

    const size = 22
    const buffer = Buffer.alloc(size * size * 4)
    // draw a gray circle as default icon
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const cx = size / 2, cy = size / 2
        const dx = x - cx, dy = y - cy
        const dist = Math.sqrt(dx * dx + dy * dy)
        const idx = (y * size + x) * 4
        if (dist < 8) {
          buffer[idx] = 100     // R
          buffer[idx + 1] = 100 // G
          buffer[idx + 2] = 100 // B
          buffer[idx + 3] = 200 // A
        } else {
          buffer[idx + 3] = 0   // transparent
        }
      }
    }
    const iconImg = nativeImage.createFromBuffer(buffer, { width: size, height: size })
    if (process.platform === 'darwin') {
      iconImg.setTemplateImage(true)
    }

    this.tray = new Tray(iconImg)
    this.rebuildMenu()
    this.tray.on('click', () => this.onShowPopup())
  }

  destroy(): void {
    this.tray?.destroy()
    this.tray = null
  }

  onShowPopup: () => void = () => {}
  onOpenMainWindow: () => void = () => {}
  onQuit: () => void = () => {}
}
