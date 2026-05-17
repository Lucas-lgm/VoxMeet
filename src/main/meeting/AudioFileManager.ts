import * as path from 'path'
import * as fs from 'fs/promises'

const MEETINGS_DIR = path.join(require('os').homedir(), 'Documents', 'MeetingNotes')

export class AudioFileManager {
  async ensureMeetingDir(meetingId: string): Promise<string> {
    const dir = path.join(MEETINGS_DIR, meetingId)
    await fs.mkdir(dir, { recursive: true })
    return dir
  }

  getRecordingPath(dir: string): string {
    return path.join(dir, 'recording.wav')
  }

  getWhisperPath(dir: string): string {
    return path.join(dir, 'whisper-input.wav')
  }

  getTranscriptionPath(dir: string): string {
    return path.join(dir, 'transcription.json')
  }

  async saveMetadata(dir: string, meta: any): Promise<void> {
    await fs.writeFile(path.join(dir, 'metadata.json'), JSON.stringify(meta, null, 2))
  }

  async loadMetadata(dir: string): Promise<any | null> {
    try {
      const data = await fs.readFile(path.join(dir, 'metadata.json'), 'utf-8')
      return JSON.parse(data)
    } catch { return null }
  }
}
