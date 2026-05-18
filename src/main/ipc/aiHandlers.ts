import { ipcMain, Notification, dialog, shell } from 'electron'
import * as path from 'path'
import * as fs from 'fs/promises'
import { AISummaryClient } from '../ai/AISummaryClient'
import { exportToMarkdown } from '../ai/MarkdownExport'
import { SettingsStore } from '../store/SettingsStore'
import { createLogger } from '../utils/logger'

const logger = createLogger('aiIPC')
const aiClient = new AISummaryClient()
const settingsStore = new SettingsStore()

export function setupAIHandlers() {
  ipcMain.handle('ai:summarize', async (_event, meetingDir: string, fullText: string, segments: any[]) => {
    try {
      const aiSettings = await settingsStore.getAI()
      if (!aiSettings?.apiKey) {
        return { ok: false, error: 'Configure your AI API Key in Settings first' }
      }

      const locale = await settingsStore.getLocale()
      const summary = await aiClient.generateSummary(fullText, segments || [], aiSettings, locale)
      const meetingDate = path.basename(meetingDir)

      const markdown = exportToMarkdown(summary, meetingDate, new Date().toLocaleString('zh-CN'))
      const mdPath = path.join(meetingDir || path.dirname(meetingDir || ''), 'meeting-notes.md')
      await fs.mkdir(path.dirname(mdPath), { recursive: true })
      await fs.writeFile(mdPath, markdown, 'utf-8')

      await fs.writeFile(path.join(meetingDir || '', 'summary.json'), JSON.stringify(summary, null, 2))

      new Notification({
        title: 'AI Summary Complete',
        body: 'Meeting notes ready, click to view',
      }).show()

      return { ok: true, summary, mdPath }
    } catch (e: any) {
      logger.error('AI summary failed', { error: e.message })
      return { ok: false, error: e.message }
    }
  })

  // AI settings
  ipcMain.handle('settings:get-ai', async () => {
    try {
      return await settingsStore.getAI() || null
    } catch { return null }
  })

  ipcMain.handle('settings:save-ai', async (_event, settings: any) => {
    try {
      await settingsStore.saveAI({
        provider: settings.provider || 'openai',
        apiBaseUrl: settings.apiBaseUrl,
        apiKey: settings.apiKey,
        model: settings.model || 'gpt-4o',
      })
      return { ok: true }
    } catch (e: any) {
      return { ok: false, error: e.message }
    }
  })

  // Whisper model settings
  ipcMain.handle('settings:get-whisper-model', async () => {
    try {
      const name = await settingsStore.getWhisperModelName()
      return { modelName: name }
    } catch { return { modelName: 'base' } }
  })

  ipcMain.handle('settings:set-whisper-model', async (_event, modelName: string) => {
    try {
      await settingsStore.saveWhisperModelName(modelName)
      return { ok: true }
    } catch (e: any) {
      return { ok: false, error: e.message }
    }
  })

  // Whisper language setting
  ipcMain.handle('settings:get-whisper-language', async () => {
    try {
      const lang = await settingsStore.getWhisperLanguage()
      return { language: lang }
    } catch { return { language: '' } }
  })

  ipcMain.handle('settings:set-whisper-language', async (_event, lang: string) => {
    try {
      await settingsStore.saveWhisperLanguage(lang)
      return { ok: true }
    } catch (e: any) {
      return { ok: false, error: e.message }
    }
  })

  // Proxy setting
  ipcMain.handle('settings:get-proxy', async () => {
    try {
      const url = await settingsStore.getProxyUrl()
      return { proxyUrl: url }
    } catch { return { proxyUrl: '' } }
  })

  ipcMain.handle('settings:set-proxy', async (_event, proxyUrl: string) => {
    try {
      await settingsStore.saveProxyUrl(proxyUrl)
      return { ok: true }
    } catch (e: any) {
      return { ok: false, error: e.message }
    }
  })

  // Locale setting
  ipcMain.handle('settings:get-locale', async () => {
    try {
      const locale = await settingsStore.getLocale()
      return { locale }
    } catch { return { locale: '' } }
  })

  ipcMain.handle('settings:set-locale', async (_event, locale: string) => {
    try {
      await settingsStore.saveLocale(locale)
      return { ok: true }
    } catch (e: any) {
      return { ok: false, error: e.message }
    }
  })

  // Output path settings
  ipcMain.handle('settings:get-output-path', async () => {
    try {
      const path = await settingsStore.getOutputPath()
      return { outputPath: path || '' }
    } catch { return { outputPath: '' } }
  })

  ipcMain.handle('settings:set-output-path', async (_event, outputPath: string) => {
    try {
      await settingsStore.saveOutputPath(outputPath)
      return { ok: true }
    } catch (e: any) {
      return { ok: false, error: e.message }
    }
  })

  // Shell utilities
  ipcMain.handle('shell:open-folder', async (_event, folderPath: string) => {
    try {
      await shell.openPath(folderPath)
      return { ok: true }
    } catch (e: any) {
      return { ok: false, error: e.message }
    }
  })

  ipcMain.handle('shell:select-folder', async () => {
    try {
      const result = await dialog.showOpenDialog({
        properties: ['openDirectory'],
      })
      if (result.canceled || result.filePaths.length === 0) {
        return { canceled: true, path: '' }
      }
      return { canceled: false, path: result.filePaths[0] }
    } catch (e: any) {
      return { canceled: true, path: '', error: e.message }
    }
  })

  // Summary save handler for Tiptap editor
  ipcMain.handle('summary:save', async (_event, meetingDir: string, markdown: string) => {
    try {
      const mdPath = path.join(meetingDir, 'meeting-notes.md')
      await fs.writeFile(mdPath, markdown, 'utf-8')
      logger.info('Summary saved', { meetingDir })
      return { ok: true }
    } catch (e: any) {
      logger.error('Failed to save summary', { error: e.message })
      return { ok: false, error: e.message }
    }
  })

  return () => {
    // No cleanup needed
  }
}
