import * as fs from 'fs'
import * as fsp from 'fs/promises'
import * as https from 'https'
import * as http from 'http'
import { ipcMain } from 'electron'
import { execSync } from 'child_process'
import * as path from 'path'
import {
  getWhisperModelsDir,
  getWhisperModelPath,
  getSenseVoiceModelsDir,
  getSenseVoiceModelPath,
  getSenseVoiceTokensPath,
  SettingsStore,
} from '../store/SettingsStore'
import { createLogger } from '../utils/logger'

const logger = createLogger('ModelDownloader')
const settingsStore = SettingsStore.getInstance()

async function getProxyAgent(url: string): Promise<https.Agent | http.Agent | undefined> {
  // Check settings store first (UI configured), then env vars
  let proxyUrl = ''
  try {
    proxyUrl = await settingsStore.getProxyUrl()
  } catch {}
  if (!proxyUrl) {
    proxyUrl = process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy || ''
  }
  if (!proxyUrl) return undefined
  try {
    const HttpsProxyAgent = require('https-proxy-agent').HttpsProxyAgent
    return new HttpsProxyAgent(proxyUrl)
  } catch {
    logger.warn('https-proxy-agent unavailable, skipping proxy')
    return undefined
  }
}

const MODEL_URLS: Record<string, string> = {
  'tiny':     'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.bin',
  'base':     'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin',
  'small':    'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin',
  'medium':   'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-medium.bin',
  'large-v3': 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3.bin',
}

export const MODEL_NAMES = [
  { value: 'tiny',   label: 'Tiny   (~75 MB)',   size: '~75 MB' },
  { value: 'base',   label: 'Base   (~140 MB)',  size: '~140 MB' },
  { value: 'small',  label: 'Small  (~460 MB)',  size: '~460 MB' },
  { value: 'medium', label: 'Medium (~1.5 GB)',  size: '~1.5 GB' },
  { value: 'large-v3', label: 'Large  (~3.1 GB)', size: '~3.1 GB' },
]

export async function getDownloadedModels(): Promise<string[]> {
  const dir = getWhisperModelsDir()
  try {
    await fsp.mkdir(dir, { recursive: true })
    const files = await fsp.readdir(dir)
    return files
      .filter(f => f.endsWith('.bin'))
      .map(f => f.replace(/^ggml-/, '').replace(/\.bin$/, ''))
  } catch {
    return []
  }
}

export function isModelDownloaded(modelName: string): boolean {
  return fs.existsSync(getWhisperModelPath(modelName))
}

export function setupModelDownloadIPC(): () => void {
  ipcMain.handle('model:list-available', () => {
    return MODEL_NAMES
  })

  ipcMain.handle('model:list-downloaded', async () => {
    return await getDownloadedModels()
  })

  ipcMain.handle('model:check', async (_event, modelName: string) => {
    return isModelDownloaded(modelName)
  })

  function downloadWithNodeHttp(url: string, dest: string, tmp: string, onProgress: (d: number, t: number) => void, agent?: https.Agent | http.Agent): Promise<void> {
    return new Promise((resolve, reject) => {
      const mod = url.startsWith('https') ? https : http
      const writeStream = fs.createWriteStream(tmp)
      let downloaded = 0
      let total = 0
      let aborted = false
      let responseTimer: NodeJS.Timeout | null = null

      const cleanup = () => {
        if (responseTimer) { clearTimeout(responseTimer); responseTimer = null }
        writeStream.close()
        try { fs.unlinkSync(tmp) } catch {}
      }

      // Reset activity timer on each chunk — abort if idle > 60s
      const resetActivityTimer = () => {
        if (responseTimer) clearTimeout(responseTimer)
        responseTimer = setTimeout(() => {
          if (!aborted) {
            aborted = true
            logger.warn('Response idle timeout, aborting', { downloaded, total })
            req.destroy()
            cleanup()
            reject(new Error(`Download timeout (received ${(downloaded / 1024 / 1024).toFixed(1)}MB of ${total > 0 ? (total / 1024 / 1024).toFixed(1) + 'MB' : 'unknown'}）`))
          }
        }, 60000)
      }

      writeStream.on('error', (err) => { if (!aborted) { aborted = true; cleanup(); reject(err) } })

      const req = mod.get(url, { timeout: 600000, agent }, (res) => {
        // Follow redirects
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          writeStream.close()
          const redirectUrl = new URL(res.headers.location, url).href
          logger.info('Following redirect', { from: url, to: redirectUrl })
          resolve(downloadWithNodeHttp(redirectUrl, dest, tmp, onProgress, agent))
          return
        }

        if (res.statusCode !== 200) {
          cleanup()
          logger.error('HTTP error response', { statusCode: res.statusCode, statusMessage: res.statusMessage })
          reject(new Error(`HTTP ${res.statusCode} ${res.statusMessage}`))
          return
        }

        total = parseInt(res.headers['content-length'] || '0', 10)
        logger.info('Download started', { url, total, tmp })

        resetActivityTimer()

        res.on('data', (chunk: Buffer) => {
          if (aborted) return
          downloaded += chunk.length
          writeStream.write(chunk)
          onProgress(downloaded, total)
          resetActivityTimer()
        })

        res.on('end', () => {
          if (aborted) return
          logger.info('Download response ended', { downloaded, tmp })
          if (responseTimer) clearTimeout(responseTimer)
          writeStream.end(() => {
            try {
              const stat = fs.statSync(tmp)
              logger.info('Write stream finished', { tmp, size: stat.size })
              fs.renameSync(tmp, dest)
              resolve()
            } catch (e: any) {
              cleanup()
              reject(e)
            }
          })
        })

        res.on('error', (err) => {
          logger.error('Response stream error', { error: err.message })
          if (!aborted) { aborted = true; cleanup(); reject(err) }
        })
      })

      req.on('timeout', () => {
        logger.error('Request timeout')
        aborted = true
        req.destroy()
        cleanup()
        reject(new Error('Download timeout (connection timeout)'))
      })

      req.on('error', (err) => {
        logger.error('Request error', { error: err.message })
        if (!aborted) { aborted = true; cleanup(); reject(err) }
      })
    })
  }

  ipcMain.handle('model:download', async (event, modelName: string) => {
    const url = MODEL_URLS[modelName]
    if (!url) throw new Error(`Unknown model: ${modelName}`)

    const dir = getWhisperModelsDir()
    fs.mkdirSync(dir, { recursive: true })
    const dest = getWhisperModelPath(modelName)
    const tmp = dest + '.tmp'

    // Remove partial download if any
    try { fs.unlinkSync(tmp) } catch {}

    const agent = await getProxyAgent(url)

    const MAX_RETRIES = 3
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        // Remove partial from previous attempt
        try { fs.unlinkSync(tmp) } catch {}

        let lastReport = 0
        await downloadWithNodeHttp(url, dest, tmp, (downloaded, total) => {
          if (downloaded - lastReport < 1024 * 512 && downloaded < total) return
          lastReport = downloaded
          event.sender.send('model:download-progress', {
            modelName,
            downloaded,
            total,
            percent: total > 0 ? Math.round((downloaded / total) * 100) : 0,
          })
        }, agent)

        logger.info('Model downloaded', { modelName, path: dest })
        return { ok: true }
      } catch (e: any) {
        logger.warn(`Download attempt ${attempt}/${MAX_RETRIES} failed`, { error: e.message })
        if (attempt < MAX_RETRIES) {
          // Wait a bit before retrying
          await new Promise(r => setTimeout(r, 2000 * attempt))
        } else {
          throw e
        }
      }
    }
    throw new Error(`Model download failed after ${MAX_RETRIES} retries`)
  })

  // --- SenseVoice model download ---

  const SENSEVOICE_MODEL_URL = 'https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-2024-07-17.tar.bz2'

  ipcMain.handle('sensevoice-model:check', async () => {
    try {
      await fsp.access(getSenseVoiceModelPath(), fs.constants.R_OK)
      await fsp.access(getSenseVoiceTokensPath(), fs.constants.R_OK)
      return true
    } catch {
      return false
    }
  })

  ipcMain.handle('sensevoice-model:download', async (event) => {
    const modelsDir = getSenseVoiceModelsDir()
    fs.mkdirSync(modelsDir, { recursive: true })

    const tmpArchive = path.join(modelsDir, 'sensevoice-model.tar.bz2.tmp')
    const destArchive = path.join(modelsDir, 'sensevoice-model.tar.bz2')
    try { fs.unlinkSync(tmpArchive) } catch {}

    const agent = await getProxyAgent(SENSEVOICE_MODEL_URL)

    const MAX_RETRIES = 3
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        try { fs.unlinkSync(tmpArchive) } catch {}

        let lastReport = 0
        await downloadWithNodeHttp(SENSEVOICE_MODEL_URL, destArchive, tmpArchive, (downloaded, total) => {
          if (downloaded - lastReport < 1024 * 512 && downloaded < total) return
          lastReport = downloaded
          event.sender.send('sensevoice-model:download-progress', {
            downloaded,
            total,
            percent: total > 0 ? Math.round((downloaded / total) * 100) : 0,
            phase: 'download',
          })
        }, agent)

        // Extract model.int8.onnx and tokens.txt from the tar.bz2 archive
        event.sender.send('sensevoice-model:download-progress', {
          downloaded: 0, total: 0, percent: 0, phase: 'extracting',
        })

        const modelExtracted = path.join(modelsDir, 'model.int8.onnx')
        const tokensExtracted = path.join(modelsDir, 'tokens.txt')

        // Use tar via child_process to extract specific files
        // Archive structure: sherpa-onnx-sense-voice-.../model.int8.onnx, tokens.txt
        execSync(
          `tar xjf "${destArchive}" --strip-components=1 -C "${modelsDir}" "*/model.int8.onnx" "*/tokens.txt"`,
          { stdio: 'pipe', timeout: 300000 }
        )

        // Verify extraction
        try {
          await fsp.access(modelExtracted, fs.constants.R_OK)
          await fsp.access(tokensExtracted, fs.constants.R_OK)
        } catch {
          throw new Error('Model extraction failed: model.int8.onnx or tokens.txt not found in archive')
        }

        // Clean up archive
        try { fs.unlinkSync(destArchive) } catch {}

        logger.info('SenseVoice model downloaded and extracted', { path: modelExtracted })
        return { ok: true }
      } catch (e: any) {
        logger.warn(`SenseVoice download attempt ${attempt}/${MAX_RETRIES} failed`, { error: e.message })
        if (attempt < MAX_RETRIES) {
          await new Promise(r => setTimeout(r, 2000 * attempt))
        } else {
          throw e
        }
      }
    }
    throw new Error(`SenseVoice model download failed after ${MAX_RETRIES} retries`)
  })

  return () => {
    ipcMain.removeHandler('model:list-available')
    ipcMain.removeHandler('model:list-downloaded')
    ipcMain.removeHandler('model:check')
    ipcMain.removeHandler('model:download')
    ipcMain.removeHandler('sensevoice-model:check')
    ipcMain.removeHandler('sensevoice-model:download')
  }
}
