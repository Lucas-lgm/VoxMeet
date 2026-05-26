import { ipcMain, Notification } from 'electron'
import { WhisperClient } from '../transcription/WhisperClient'
import { SenseVoiceClient } from '../transcription/SenseVoiceClient'
import { SettingsStore } from '../store/SettingsStore'
import { createLogger } from '../utils/logger'
import * as fs from 'fs/promises'
import * as path from 'path'

const logger = createLogger('transcriptionIPC')
const whisperClient = new WhisperClient()
const senseVoiceClient = new SenseVoiceClient()
const settingsStore = SettingsStore.getInstance()

export function setupTranscriptionIPC() {
  ipcMain.handle('transcription:start', async (event, audioPath: string, meetingDir?: string) => {
    try {
      const engine = await settingsStore.getTranscriptionEngine()
      const language = await settingsStore.getWhisperLanguage()
      logger.info('Starting transcription', { engine, audioPath, language: language || 'auto' })

      let result
      let withSpeakers
      if (engine === 'sensevoice') {
        result = await senseVoiceClient.transcribe(audioPath, language, (progress) => {
          event.sender.send('transcription:progress', progress)
        })
        withSpeakers = senseVoiceClient.segmentBySpeakers(result)
      } else {
        result = await whisperClient.transcribe(audioPath, language, (progress) => {
          event.sender.send('transcription:progress', progress)
        })
        withSpeakers = whisperClient.segmentBySpeakers(result)
      }

      // Save transcription result
      const transcriptionPath = meetingDir
        ? path.join(meetingDir, 'transcription.json')
        : path.join(path.dirname(audioPath), 'transcription.json')

      await fs.writeFile(transcriptionPath, JSON.stringify({ result, withSpeakers }, null, 2))

      new Notification({
        title: 'Transcription Complete',
        body: 'Transcription complete, generating AI summary...',
      }).show()

      return { ok: true, result, withSpeakers, transcriptionPath }
    } catch (e: any) {
      logger.error('Transcription failed', { error: e.message })
      return { ok: false, error: e.message }
    }
  })

  ipcMain.handle('transcription:save-edits', async (_event, meetingDir: string, segments: any[]) => {
    try {
      const jsonPath = path.join(meetingDir, 'transcription.json')
      const content = await fs.readFile(jsonPath, 'utf-8')
      const data = JSON.parse(content)

      // Merge edited segments back into the data structure
      if (data.withSpeakers) {
        data.withSpeakers = segments
      } else if (data.result?.segments) {
        data.result.segments = segments
      } else {
        data.segments = segments
      }

      // Rebuild fullText from segments
      if (data.result) {
        data.result.fullText = segments.map((s: any) => s.text).join(' ')
      }

      await fs.writeFile(jsonPath, JSON.stringify(data, null, 2), 'utf-8')
      logger.info('Transcription edits saved', { meetingDir, segmentCount: segments.length })
      return { ok: true }
    } catch (e: any) {
      logger.error('Failed to save transcription edits', { error: e.message })
      return { ok: false, error: e.message }
    }
  })

  return () => {
    // No cleanup needed for whisper client (no persistent state)
  }
}
