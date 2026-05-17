import { ipcMain } from 'electron'
import { PermissionManager } from '../permissions/PermissionManager'
import { createLogger } from '../utils/logger'
import { permission } from 'process'

const logger = createLogger('permissions-ipc')

export function setupPermissionsIPC() {
  // Requesting all permissions
  ipcMain.handle('permissions:requestAll', async () => {
    logger.debug('Requesting all permissions')
    return await PermissionManager.requestAllPermissions()
  })

  // Getting all permission statuses
  ipcMain.handle('permissions:getAll', async () => {
    logger.debug('Getting all permission statuses')
    return await PermissionManager.getAllPermissions()
  })

  // Requesting microphone permission
  ipcMain.handle('permissions:requestMicrophone', async () => {
    logger.debug('Requesting microphone permission')
    return await PermissionManager.requestMicrophonePermission()
  })

  ipcMain.handle('permissions:requestSystemAudio', async () => {
    logger.debug('Requesting system audio permission')
    return PermissionManager.requestSystemRecordingPermission()
  })

  // Opening System Preferences
  ipcMain.handle('permissions:openSystemPreferences', async () => {
    logger.debug('Opening System Preferences')
    PermissionManager.openSystemPreferences()
  })

  // Opening Microphone permission settings
  ipcMain.handle('permissions:openMicrophonePreferences', async () => {
    logger.debug('Opening Microphone permission settings')
    PermissionManager.openMicrophonePreferences()
  })

  // Opening System Audio permission settings
  ipcMain.handle('permissions:openScreenRecordingPreferences', async () => {
    logger.debug('Opening System Audio permission settings')
    PermissionManager.openScreenRecordingPreferences()
  })

  ipcMain.handle('permissions:resetSystemAudioPermission', async () => {
    logger.debug('Resetting system audio permission')
    PermissionManager.resetSystemAudioPermission()
  })

  ipcMain.handle('permissions:resetScreenRecordingPermission', async () => {
    logger.debug('Resetting screen recording permission')
    PermissionManager.resetScreenRecordingPermission()
  })

  ipcMain.handle('permissions:resetMicrophonePermission', async () => {
    logger.debug('Resetting microphone permission')
    PermissionManager.resetMicrophonePermission()
  })

  // Resetting all permissions
  ipcMain.handle('permissions:resetAll', async () => {
    logger.debug('Resetting all permissions')
    PermissionManager.resetAllPermissions()
  })

  ipcMain.handle('permissions:checkMicrophonePermission', async () => {
    logger.debug('Checking microphone permission')
    return await PermissionManager.checkMicrophonePermission()
  })

  ipcMain.handle('permissions:checkScreenRecordingPermission', async () => {
    logger.debug('Checking screen recording permission')
    return await PermissionManager.checkScreenRecordingPermission()
  })

  ipcMain.handle('permissions:checkSystemAudioPermission', async () => {
    logger.debug('Checking system audio permission')
    return await PermissionManager.checkSystemAudioPermission()
  })

  return () => {}
} 