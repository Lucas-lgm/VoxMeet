import { ipcMain, Notification } from 'electron'
import { RecorderController } from '../meeting/RecorderController'
import { AudioFileManager } from '../meeting/AudioFileManager'
import { MeetingSession } from '../meeting/MeetingSession'
import { WhisperClient } from '../transcription/WhisperClient'
import { SettingsStore } from '../store/SettingsStore'
import { createLogger } from '../utils/logger'
import { writeFile } from 'fs/promises'

const logger = createLogger('recordingIPC')
const whisperClient = new WhisperClient()
const settingsStore = new SettingsStore()

let session: MeetingSession | null = null
let controller: RecorderController | null = null

async function runTranscription(meetingDir: string, whisperPath: string) {
  try {
    const language = await settingsStore.getWhisperLanguage()
    logger.info('Starting transcription', { whisperPath, language: language || 'auto' })
    const result = await whisperClient.transcribe(whisperPath, language)
    const withSpeakers = whisperClient.segmentBySpeakers(result)

    const fileManager = new AudioFileManager()
    const transcriptionPath = fileManager.getTranscriptionPath(meetingDir)
    await writeFile(transcriptionPath, JSON.stringify({ result, withSpeakers }, null, 2))

    // Update metadata to indicate transcription is done
    const metadata = (await fileManager.loadMetadata(meetingDir)) || {}
    metadata.state = 'transcribed'
    metadata.transcriptionPath = transcriptionPath
    await fileManager.saveMetadata(meetingDir, metadata)

    new Notification({
      title: 'Transcription Complete',
      body: 'Transcription complete',
    }).show()

    logger.info('Transcription completed', { meetingDir })
  } catch (e: any) {
    logger.error('Transcription failed after recording', { error: e.message })
    // Don't fail the recording flow — transcription is best-effort
    new Notification({
      title: 'Transcription Failed',
      body: `Transcription failed: ${e.message}`,
    }).show()
  }
}

export function setupRecordingIPC() {
  controller = new RecorderController()

  ipcMain.handle('recording:start', async () => {
    try {
      if (!controller?.initialize()) {
        return { ok: false, error: 'Failed to initialize recorder' }
      }
      const fileManager = new AudioFileManager()
      session = new MeetingSession(controller, fileManager)
      const ok = await session.startRecording()
      if (ok) {
        logger.info('Recording started')
      }
      return { ok }
    } catch (e: any) {
      logger.error('recording:start error', { error: e.message })
      return { ok: false, error: e.message }
    }
  })

  ipcMain.handle('recording:stop', async () => {
    try {
      if (!session) return { ok: false, error: 'No active session' }
      const result = await session.stopRecording()
      const meetingDir = result.meetingDir
      const whisperPath = result.whisperPath
      session = null

      new Notification({
        title: 'Recording Complete',
        body: 'Recording complete, preparing transcription...',
      }).show()

      // Start transcription asynchronously (non-blocking)
      runTranscription(meetingDir, whisperPath)

      return { ok: true, ...result }
    } catch (e: any) {
      logger.error('recording:stop error', { error: e.message })
      return { ok: false, error: e.message }
    }
  })

  ipcMain.handle('recording:pause', () => {
    try {
      const ok = controller?.pauseCapture() ?? false
      return { ok }
    } catch (e: any) {
      return { ok: false, error: e.message }
    }
  })

  ipcMain.handle('recording:resume', () => {
    try {
      const ok = controller?.resumeCapture() ?? false
      return { ok }
    } catch (e: any) {
      return { ok: false, error: e.message }
    }
  })

  return () => {
    if (controller) {
      controller.destroy()
      controller = null
    }
    session = null
  }
}
