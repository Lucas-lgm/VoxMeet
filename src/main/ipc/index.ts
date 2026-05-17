import { BrowserWindow } from 'electron'
import { setupPermissionsIPC } from './permissions'
import { setupSystemAudioIPC } from './systemAudio'
import { setupAppInfoIPC } from './appInfo'
import { setupAudioConverterIPC } from './audioConverter'
import { setupLoggerIPC } from './logger'
import { setupRecordingIPC } from './recordingHandlers'
import { setupTranscriptionIPC } from './transcriptionHandlers'
import { setupAIHandlers } from './aiHandlers'
import { setupMeetingHistoryIPC } from './meetingHistory'
import { setupModelDownloadIPC } from '../transcription/ModelDownloader'

export function setupAllIPC(mainWindow: BrowserWindow | null) {
  const disposes: Array<() => void> = [];

  disposes.push(setupPermissionsIPC())
  disposes.push(setupSystemAudioIPC(mainWindow))
  disposes.push(setupAppInfoIPC())
  disposes.push(setupAudioConverterIPC())
  disposes.push(setupLoggerIPC())
  disposes.push(setupRecordingIPC())
  disposes.push(setupTranscriptionIPC())
  disposes.push(setupAIHandlers())
  disposes.push(setupMeetingHistoryIPC())
  disposes.push(setupModelDownloadIPC())

  return disposes;
} 