import { globalShortcut } from 'electron'

export class ShortcutManager {
  register(): void {
    globalShortcut.register('CommandOrControl+Shift+R', () => {
      this.onToggleRecording()
    })
  }

  unregister(): void {
    globalShortcut.unregisterAll()
  }

  onToggleRecording: () => void = () => {}
}
