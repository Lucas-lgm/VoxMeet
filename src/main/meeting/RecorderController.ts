import { createLogger } from '../utils/logger'

const logger = createLogger('RecorderController')

export class RecorderController {
  private recorder: any = null

  initialize(): boolean {
    try {
      const nativeModule = require('../../../native/modules/output/recorder.node')
      const { Recorder } = nativeModule
      this.recorder = new Recorder()
      const ok = this.recorder.prepare()
      if (!ok) {
        logger.error('Failed to prepare native recorder')
        return false
      }
      logger.info('Native recorder initialized')
      return true
    } catch (e: any) {
      logger.error('Failed to load native recorder module', { error: e.message })
      return false
    }
  }

  startCapture(recordingPath: string, whisperPath: string): boolean {
    if (!this.recorder) return false
    this.recorder.setOutputFile(recordingPath)
    this.recorder.setWhisperOutputFile(whisperPath)
    return this.recorder.startCapture()
  }

  stopCapture(): void {
    if (!this.recorder) return
    this.recorder.stopCapture()
  }

  pauseCapture(): boolean {
    if (!this.recorder) return false
    try { return !!this.recorder.pauseCapture() } catch { return false }
  }

  resumeCapture(): boolean {
    if (!this.recorder) return false
    try { return !!this.recorder.resumeCapture() } catch { return false }
  }

  isCapturing(): boolean {
    try { return !!this.recorder?.isCapturing?.() } catch { return false }
  }

  destroy(): void {
    this.recorder = null
  }
}
