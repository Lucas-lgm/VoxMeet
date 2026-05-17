import { systemPreferences, shell, app } from 'electron'
import { createLogger } from '../utils/logger'
import { PermissionStatus, Recorder } from '../audio/SystemAudioManager'
import { execSync } from 'child_process'

const logger = createLogger('permissions')

const bundleId = "com.voxmeet.app";

export class PermissionManager {
  private static readonly MICROPHONE_PERMISSION = 'microphone'
  private static readonly SCREEN_RECORDING_PERMISSION = 'screen'

  static async requestAllPermissions(): Promise<{ microphone: boolean, systemAudio: boolean }> {
    const microphone = await PermissionManager.requestMicrophonePermission()
    const systemAudio = PermissionManager.requestSystemRecordingPermission()
    return { microphone, systemAudio }
  }

  /**
   * Getting all permission statuses
   */
  static async getAllPermissions(): Promise<Record<string, PermissionStatus>> {
    try {
      const microphone = await PermissionManager.checkMicrophonePermission()
      const screenRecording = await PermissionManager.checkScreenRecordingPermission()
      const systemAudio = PermissionManager.checkSystemAudioPermission()
      logger.debug('Getting permission status', { microphone, screenRecording, systemAudio })

      return {
        microphone,
        screenRecording,
        systemAudio
      }
    } catch (error) {
      logger.error('Failed to get permission status', { error })
      throw error
    }
  }

  /**
   * Checking microphone permission
   */
  static async checkMicrophonePermission(): Promise<PermissionStatus> {
    try {
      const status = systemPreferences.getMediaAccessStatus(PermissionManager.MICROPHONE_PERMISSION)
      logger.debug('Microphone permission status', { status })
      let sta = PermissionStatus.DENIED;
      if (status === 'granted') {
        sta = PermissionStatus.GRANTED;
      } else if (status === 'not-determined') {
        sta = PermissionStatus.NOT_REQUESTED;
      }
      return sta
    } catch (error) {
      logger.error('Failed to check microphone permission', { error })
      return PermissionStatus.DENIED
    }
  }

  /**
   * Checking screen recording permission
   */
  static async checkScreenRecordingPermission(): Promise<PermissionStatus> {
    try {
      const status = systemPreferences.getMediaAccessStatus(this.SCREEN_RECORDING_PERMISSION)
      logger.debug('Screen recording permission status', { status })
      let sta = PermissionStatus.DENIED;
      if (status === 'granted') {
        sta = PermissionStatus.GRANTED;
      } else if (status === 'not-determined') {
        sta = PermissionStatus.NOT_REQUESTED;
      }
      return sta
    } catch (error) {
      logger.error('Failed to check screen recording permission', { error })
      return PermissionStatus.DENIED
    }
  }

  /**
   * Checking system audio permission
   */
  static checkSystemAudioPermission(): PermissionStatus {
    return Recorder.checkSystemAudioPermission()
  }

  static requestSystemRecordingPermission(): boolean {
    return Recorder.requestSystemAudioPermission();
  }

  /**
   * Requesting microphone permission
   */
  static async requestMicrophonePermission(): Promise<boolean> {
    try {
      logger.info('Requesting microphone permission')
      const granted = await systemPreferences.askForMediaAccess(PermissionManager.MICROPHONE_PERMISSION)
      logger.info('Microphone permission request result', { granted })
      return granted
    } catch (error) {
      logger.error('Failed to request microphone permission', { error })
      return false
    }
  }

  /**
   * Opening System Preferences
   */
  static openSystemPreferences(): void {
    try {
      logger.info('Opening System Preferences')
      shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture')
    } catch (error) {
      logger.error('Failed to open System Preferences', { error })
    }
  }

  /**
   * Opening Microphone permission settings
   */
  static openMicrophonePreferences(): void {
    try {
      logger.info('Opening Microphone permission settings')
      shell.openExternal(`x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone`)
    } catch (error) {
      logger.error('Failed to open Microphone permission settings', { error })
    }
  }

  /**
   * Opening System Audio permission settings
   */
  static openScreenRecordingPreferences(): void {
    try {
      logger.info('Opening System Audio permission settings')
      shell.openExternal(`x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture`)
    } catch (error) {
      logger.error('Failed to open System Audio permission settings', { error })
    }
  }

  static resetSystemAudioPermission(): void {
    execSync(`tccutil reset AudioCapture ${bundleId}`)
  }

  static resetScreenRecordingPermission(): void {
    execSync(`tccutil reset ScreenCapture ${bundleId}`)
  }

  static resetMicrophonePermission(): void {
    execSync(`tccutil reset Microphone ${bundleId}`)
  }

  static resetAllPermissions(): void {
    execSync(`tccutil reset all ${bundleId}`)
  }
} 