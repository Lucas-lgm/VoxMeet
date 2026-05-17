import * as fs from 'fs/promises'
import * as path from 'path'
import { app } from 'electron'

export interface AISettings {
  provider: string
  apiBaseUrl: string
  apiKey: string
  model: string
}

interface AppSettings {
  ai?: AISettings
  whisperModelName?: string
  whisperLanguage?: string
  proxyUrl?: string
  locale?: string
}

const SETTINGS_PATH = path.join(app.getPath('userData'), 'settings.json')
const MODELS_DIR = path.join(app.getPath('userData'), 'whisper-models')

export function getWhisperBinaryPath(): string {
  if (!app.isPackaged) {
    return path.join(process.cwd(), 'whisper', 'whisper-cli')
  }
  return path.join(process.resourcesPath, 'whisper', 'whisper-cli')
}

export function getWhisperModelsDir(): string {
  return MODELS_DIR
}

export function getWhisperModelPath(modelName: string): string {
  return path.join(MODELS_DIR, `ggml-${modelName}.bin`)
}

export class SettingsStore {
  private settings: AppSettings = {}
  private loaded = false

  async load(): Promise<void> {
    if (this.loaded) return
    try {
      const data = await fs.readFile(SETTINGS_PATH, 'utf-8')
      this.settings = JSON.parse(data)
    } catch {
      this.settings = {}
    }
    this.loaded = true
  }

  async save(): Promise<void> {
    await fs.writeFile(SETTINGS_PATH, JSON.stringify(this.settings, null, 2))
  }

  async saveAI(ai: AISettings): Promise<void> {
    await this.load()
    this.settings.ai = ai
    await this.save()
  }

  async getAI(): Promise<AISettings | undefined> {
    await this.load()
    return this.settings.ai
  }

  async getWhisperModelName(): Promise<string> {
    await this.load()
    return this.settings.whisperModelName || 'base'
  }

  async saveWhisperModelName(name: string): Promise<void> {
    await this.load()
    this.settings.whisperModelName = name
    await this.save()
  }

  async getWhisperLanguage(): Promise<string> {
    await this.load()
    return this.settings.whisperLanguage || ''
  }

  async saveWhisperLanguage(lang: string): Promise<void> {
    await this.load()
    this.settings.whisperLanguage = lang
    await this.save()
  }

  async getProxyUrl(): Promise<string> {
    await this.load()
    return this.settings.proxyUrl || ''
  }

  async saveProxyUrl(url: string): Promise<void> {
    await this.load()
    this.settings.proxyUrl = url
    await this.save()
  }

  async getLocale(): Promise<string> {
    await this.load()
    return this.settings.locale || ''
  }

  async saveLocale(locale: string): Promise<void> {
    await this.load()
    this.settings.locale = locale
    await this.save()
  }
}
