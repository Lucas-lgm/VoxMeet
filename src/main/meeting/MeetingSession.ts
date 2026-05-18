import { RecorderController } from './RecorderController'
import { AudioFileManager } from './AudioFileManager'

export class MeetingSession {
  private controller: RecorderController
  private fileManager: AudioFileManager
  private currentDir: string = ''
  private startTime: number = 0

  constructor(controller: RecorderController, fileManager: AudioFileManager) {
    this.controller = controller
    this.fileManager = fileManager
  }

  async startRecording(): Promise<boolean> {
    const now = new Date()
    const id = now.toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19)
    const title = `Meeting_${now.toLocaleDateString('en-US')}`
    this.currentDir = await this.fileManager.ensureMeetingDir(id)
    const recordingPath = this.fileManager.getRecordingPath(this.currentDir)
    const whisperPath = this.fileManager.getWhisperPath(this.currentDir)

    const ok = this.controller.startCapture(recordingPath, whisperPath)
    if (ok) {
      this.startTime = Date.now()
      const metadata = {
        id, title, date: now.toISOString(),
        duration: 0, recordingPath, whisperPath,
        state: 'recording',
      }
      await this.fileManager.saveMetadata(this.currentDir, metadata)
    }
    return ok
  }

  async stopRecording(): Promise<any> {
    this.controller.stopCapture()
    const duration = Math.floor((Date.now() - this.startTime) / 1000)
    const existing = await this.fileManager.loadMetadata(this.currentDir) || {}
    await this.fileManager.saveMetadata(this.currentDir, {
      ...existing,
      state: 'processing',
      duration,
    })
    return { meetingDir: this.currentDir, duration, whisperPath: this.fileManager.getWhisperPath(this.currentDir) }
  }

  getCurrentDir(): string { return this.currentDir }
}
