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
  transcriptionEngine?: 'whisper' | 'sensevoice'
  proxyUrl?: string
  locale?: string
  outputPath?: string
  autoRecord?: boolean
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

export function getSenseVoiceBinaryPath(): string {
  const baseDir = app.isPackaged
    ? path.join(process.resourcesPath, 'sensevoice')
    : path.join(process.cwd(), 'whisper', 'sensevoice')
  return path.join(baseDir, 'bin', 'sherpa-onnx-offline')
}

export function getSenseVoiceLibDir(): string {
  const baseDir = app.isPackaged
    ? path.join(process.resourcesPath, 'sensevoice')
    : path.join(process.cwd(), 'whisper', 'sensevoice')
  return path.join(baseDir, 'lib')
}

export function getSenseVoiceModelPath(): string {
  const userData = app.getPath('userData')
  return path.join(userData, 'sensevoice-models', 'model.int8.onnx')
}

export function getSenseVoiceTokensPath(): string {
  const userData = app.getPath('userData')
  return path.join(userData, 'sensevoice-models', 'tokens.txt')
}

export function getSenseVoiceModelsDir(): string {
  const userData = app.getPath('userData')
  return path.join(userData, 'sensevoice-models')
}

export class SettingsStore {
  private static instance: SettingsStore

  static getInstance(): SettingsStore {
    if (!SettingsStore.instance) {
      SettingsStore.instance = new SettingsStore()
    }
    return SettingsStore.instance
  }

  private settings: AppSettings = {}
  private loaded = false

  private constructor() {}

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

  async getOutputPath(): Promise<string | undefined> {
    await this.load()
    return this.settings.outputPath
  }

  async saveOutputPath(outputPath: string): Promise<void> {
    await this.load()
    this.settings.outputPath = outputPath
    await this.save()
  }

  async getAutoRecord(): Promise<boolean> {
    await this.load()
    return this.settings.autoRecord ?? false
  }

  async saveAutoRecord(enabled: boolean): Promise<void> {
    await this.load()
    this.settings.autoRecord = enabled
    await this.save()
  }

  async getTranscriptionEngine(): Promise<'whisper' | 'sensevoice'> {
    await this.load()
    return this.settings.transcriptionEngine || 'whisper'
  }

  async saveTranscriptionEngine(engine: 'whisper' | 'sensevoice'): Promise<void> {
    await this.load()
    this.settings.transcriptionEngine = engine
    await this.save()
  }
}
