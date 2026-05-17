import { BrowserWindow } from 'electron'
import { createLogger } from '../utils/logger'

const logger = createLogger('system-audio-manager')

export interface MixedPCMData {
  data: Buffer
  frames: number
  sampleRate: number
}

export enum PermissionStatus {
  GRANTED = 0,
  DENIED = 1,
  NOT_REQUESTED = 2,
}

interface RecorderModule {
  prepare(): boolean
  startCapture(): boolean
  stopCapture(): void
  setMixedPCMCallback(callback: (data: MixedPCMData) => void): void
  setOutputFile(path: string): void
  setMicGain(gain: number): void
  setSystemGain(gain: number): void
  setAECEnabled(enabled: boolean): void
}

interface RecorderConstructor {
  new(): RecorderModule
  checkSystemAudioPermission(): PermissionStatus
  requestSystemAudioPermission(): boolean
}

export const { Recorder }: { Recorder: RecorderConstructor } =
  require('../../../native/modules/output/recorder');

// Connect native Logger to JS logging system
const recorderModule = require('../../../native/modules/output/recorder');
const nativeLogger = createLogger('native');
if (recorderModule.Logger && recorderModule.Logger.setJsLogger) {
  recorderModule.Logger.setJsLogger((level: string, message: string) => {
    if (level === 'error') nativeLogger.error(message);
    else if (level === 'warn') nativeLogger.warn(message);
    else if (level === 'info') nativeLogger.info(message);
    else if (level === 'debug') nativeLogger.debug(message);
  });
}

logger.debug('Native recorder module loaded')

export class SystemAudioManager {
  private recorder: RecorderModule | null = null
  private isCapturing: boolean = false
  private mainWindow: BrowserWindow | null = null
  private isInitialized: boolean = false
  private outputFilePath: string | null = null

  constructor(window: BrowserWindow) {
    this.mainWindow = window
  }

  static checkPermission(): PermissionStatus {
    try {
      return Recorder.checkSystemAudioPermission()
    } catch (error) {
      logger.error('Failed to check system audio permission', { error })
      return PermissionStatus.NOT_REQUESTED
    }
  }

  async initialize(): Promise<boolean> {
    if (this.isInitialized) return true

    try {
      this.recorder = new Recorder()
      if (!this.recorder.prepare()) {
        logger.error('Native Recorder prepare failed')
        return false
      }
      this.isInitialized = true
      logger.info('System audio manager initialized')
      return true
    } catch (error) {
      logger.error('System audio init failed', { error })
      return false
    }
  }

  startCapture(outputPath: string): boolean {
    if (!this.recorder) {
      logger.error('System recorder not initialized')
      return false
    }
    try {
      this.outputFilePath = outputPath
      this.recorder.setOutputFile(outputPath)
      if (!this.recorder.startCapture()) {
        return false
      }
      this.isCapturing = true
      logger.info('Starting system audio capture, output=' + outputPath)
      return true
    } catch (error) {
      logger.error('System audio capture start failed', { error })
      return false
    }
  }

  stopCapture(): { wavPath: string | null; duration: number } {
    if (!this.recorder) {
      return { wavPath: null, duration: 0 }
    }
    try {
      this.recorder.stopCapture()
      this.isCapturing = false
      logger.info('Stopping system audio capture')
      return { wavPath: this.outputFilePath, duration: 0 }
    } catch (error) {
      logger.error('System audio capture stop failed', { error })
      return { wavPath: null, duration: 0 }
    }
  }

  onMixedPCM(callback: (data: MixedPCMData) => void): void {
    if (!this.recorder) {
      logger.error('System recorder not initialized, cannot set callback')
      return
    }
    this.recorder.setMixedPCMCallback(callback)
    logger.info('Mixed PCM callback set')
  }

  setMicGain(gain: number): void {
    this.recorder?.setMicGain(gain)
  }

  setSystemGain(gain: number): void {
    this.recorder?.setSystemGain(gain)
  }

  isAvailable(): boolean {
    return this.recorder !== null
  }

  isCaptureActive(): boolean {
    return this.isCapturing
  }

  dispose() {
    this.recorder?.stopCapture()
    this.recorder = null
  }
}
