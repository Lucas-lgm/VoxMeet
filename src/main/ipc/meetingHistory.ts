import { ipcMain } from 'electron'
import * as path from 'path'
import * as fs from 'fs/promises'
import { SettingsStore } from '../store/SettingsStore'

async function getMeetingsDir(): Promise<string> {
  const store = new SettingsStore()
  const customPath = await store.getOutputPath()
  return customPath || path.join(require('os').homedir(), 'Documents', 'MeetingNotes')
}

export function setupMeetingHistoryIPC() {
  ipcMain.handle('meeting:list', async () => {
    try {
      const MEETINGS_DIR = await getMeetingsDir()
      await fs.mkdir(MEETINGS_DIR, { recursive: true })
      const entries = await fs.readdir(MEETINGS_DIR, { withFileTypes: true })
      const meetings: any[] = []

      for (const entry of entries) {
        if (!entry.isDirectory()) continue
        const metaPath = path.join(MEETINGS_DIR, entry.name, 'metadata.json')
        try {
          const data = await fs.readFile(metaPath, 'utf-8')
          const meta = JSON.parse(data)
          meetings.push({ id: entry.name, ...meta })
        } catch {
          meetings.push({ id: entry.name, date: entry.name, title: entry.name, recordingPath: '', state: 'unknown' })
        }
      }

      meetings.sort((a, b) => (b.date || '').localeCompare(a.date || ''))
      return meetings
    } catch {
      return []
    }
  })

  ipcMain.handle('meeting:get', async (_event, meetingId: string) => {
    try {
      const MEETINGS_DIR = await getMeetingsDir()
      const dir = path.join(MEETINGS_DIR, meetingId)
      const metaPath = path.join(dir, 'metadata.json')
      const data = await fs.readFile(metaPath, 'utf-8')
      const meta = JSON.parse(data)

      const files: string[] = []
      for (const name of await fs.readdir(dir)) {
        if (name.endsWith('.wav') || name.endsWith('.json') || name.endsWith('.md')) {
          files.push(name)
        }
      }

      return { ...meta, id: meetingId, dir, files }
    } catch {
      return null
    }
  })

  ipcMain.handle('meeting:delete', async (_event, meetingId: string) => {
    try {
      const MEETINGS_DIR = await getMeetingsDir()
      const dir = path.join(MEETINGS_DIR, meetingId)
      await fs.rm(dir, { recursive: true, force: true })
      return { ok: true }
    } catch (e: any) {
      return { ok: false, error: e.message }
    }
  })

  ipcMain.handle('meeting:rename', async (_event, meetingId: string, title: string) => {
    try {
      const MEETINGS_DIR = await getMeetingsDir()
      const dir = path.join(MEETINGS_DIR, meetingId)
      const metaPath = path.join(dir, 'metadata.json')
      const data = await fs.readFile(metaPath, 'utf-8')
      const meta = JSON.parse(data)
      meta.title = title
      await fs.writeFile(metaPath, JSON.stringify(meta, null, 2))
      return { ok: true }
    } catch (e: any) {
      return { ok: false, error: e.message }
    }
  })

  return () => {}
}
