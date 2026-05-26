import { spawn } from 'child_process'
import * as path from 'path'
import * as fs from 'fs/promises'
import { createLogger } from '../utils/logger'
import { WhisperResult, WhisperProgressCallback } from '../types'
import { getWhisperBinaryPath, getWhisperModelPath } from '../store/SettingsStore'
import { SettingsStore } from '../store/SettingsStore'

const logger = createLogger('WhisperClient')
const settingsStore = SettingsStore.getInstance()

const SEGMENT_RE = /^\s*(\d+\.\d+)s\s*-\s*(\d+\.\d+)s\s*-\s*"/ // matches " 1.23s -  4.56s - \"text\""

export class WhisperClient {
  private whisperPath: string = ''
  private modelPath: string = ''

  async ensureConfigured(): Promise<void> {
    this.whisperPath = getWhisperBinaryPath()
    const modelName = await settingsStore.getWhisperModelName()
    this.modelPath = getWhisperModelPath(modelName)

    logger.info('WhisperClient ensureConfigured', { path: this.whisperPath, model: this.modelPath })

    try {
      await fs.access(this.whisperPath, fs.constants.X_OK)
    } catch {
      throw new Error(`Whisper binary not found: ${this.whisperPath}`)
    }

    try {
      await fs.access(this.modelPath, fs.constants.R_OK)
    } catch {
      throw new Error(`Model not found at ${this.modelPath}. Download it in Settings first.`)
    }
  }

  async transcribe(audioPath: string, language?: string, onProgress?: WhisperProgressCallback): Promise<WhisperResult> {
    await this.ensureConfigured()

    const outputDir = path.dirname(audioPath)
    const inputExt = path.extname(audioPath)
    const inputBase = path.basename(audioPath, inputExt)

    // Use explicit output file prefix to avoid filename guessing issues
    const outputPrefix = path.join(outputDir, inputBase)
    const expectedJsonPath = `${outputPrefix}.json`

    const args = [
      '-f', audioPath,
      '-m', this.modelPath,
      '--output-json',
      '--output-file', outputPrefix,
      '--beam-size', '5',
      '--no-speech-thold', '1.0',
    ]
    if (language) {
      args.push('-l', language)
      if (language === 'zh') {
        args.push('--prompt', 'The following is the transcript in Simplified Chinese.')
      }
    }

    logger.info('Running whisper', {
      binary: this.whisperPath,
      model: this.modelPath,
      input: audioPath,
      language: language || 'auto',
      outputPrefix,
    })

    return new Promise((resolve, reject) => {
      logger.info('Spawning whisper process', { cwd: process.cwd() })
      const proc = spawn(this.whisperPath, args, { stdio: ['ignore', 'pipe', 'pipe'] })

      let stderr = ''
      let stdout = ''
      proc.stdout?.on('data', (data: Buffer) => { stdout += data.toString() })
      proc.stderr?.on('data', (data: Buffer) => {
        const text = data.toString()
        stderr += text
        // Parse segment progress lines from stderr (e.g. " 1.23s -  4.56s - \"hello\"")
        const lines = text.split('\n')
        if (onProgress) {
          for (const line of lines) {
            const match = line.match(SEGMENT_RE)
            if (match) {
              const start = parseFloat(match[1])
              const end = parseFloat(match[2])
              onProgress({ segments: 0, lastTime: end, text: line.replace(/.*-\s*"/, '').replace(/"\s*$/, '') })
            }
          }
        }
        // Log progress lines (whisper outputs timing info on stderr)
        const logLines = lines.filter(l => l.includes(']') || l.includes('whisper_') || l.includes('system_info') || l.includes('main:'))
        if (logLines.length > 0) {
          logger.info('Whisper stderr progress', { lines: logLines.map(l => l.trim().slice(0, 150)) })
        }
      })

      proc.on('error', (err) => {
        logger.error('Whisper process error', { error: err.message, binary: this.whisperPath })
        reject(err)
      })

      proc.on('close', async (code) => {
        logger.info('Whisper process exited', { code, stderrSize: stderr.length })
        if (code !== 0) {
          logger.error('Whisper exited with error', { code, stderr: stderr.slice(-500) })
          reject(new Error(`Whisper exited with code ${code}: ${stderr.slice(-200)}`))
          return
        }

        logger.info('Whisper completed, reading JSON output', { path: expectedJsonPath })

        try {
          // Try the expected path first
          let content: string
          try {
            content = await fs.readFile(expectedJsonPath, 'utf-8')
          } catch {
            logger.warn('Expected whisper output not found, scanning directory', { dir: outputDir })
            // Fallback: scan output directory for any recently created .json files
            const files = await fs.readdir(outputDir)
            const jsonFiles = files
              .filter(f => f.endsWith('.json'))
              .map(f => ({ name: f, time: 0 }))
            // Get mtime for each
            const withTimes = await Promise.all(
              jsonFiles.map(async (f) => {
                try {
                  const stat = await fs.stat(path.join(outputDir, f.name))
                  return { ...f, time: stat.mtimeMs }
                } catch { return { ...f, time: 0 } }
              })
            )
            // Sort by most recent
            withTimes.sort((a, b) => b.time - a.time)
            const newest = withTimes[0]
            if (!newest) {
              throw new Error(`Whisper output not found (expected: ${expectedJsonPath})`)
            }
            logger.info('Found whisper output via fallback scan', { file: newest.name })
            content = await fs.readFile(path.join(outputDir, newest.name), 'utf-8')

            // Remove the fallback file to avoid duplicates next time
            if (newest.name !== path.basename(expectedJsonPath)) {
              await fs.unlink(path.join(outputDir, newest.name)).catch(() => {})
            }
          }

          // Delete raw whisper output, only keep transcription.json
          fs.unlink(expectedJsonPath).catch(() => {})

          const parsed = JSON.parse(content)

          // whisper.cpp JSON format: transcription is an array of segments directly
          //   { "transcription": [{ "offsets": { "from": ms, "to": ms }, "text": "..." }] }
          // Also supports alternative formats for compatibility
          let rawSegments: any[] = []
          if (Array.isArray(parsed.transcription)) {
            rawSegments = parsed.transcription
          } else if (parsed.transcription?.segments) {
            rawSegments = parsed.transcription.segments
          } else if (parsed.segments) {
            rawSegments = parsed.segments
          } else if (parsed.result?.segments) {
            rawSegments = parsed.result.segments
          }

          const segments = rawSegments.map((seg: any) => ({
            start: (seg.start ?? (seg.offsets?.from ?? 0)) / 1000,
            end: (seg.end ?? (seg.offsets?.to ?? 0)) / 1000,
            text: (seg.text || '').trim(),
          }))

          resolve({
            segments,
            fullText: segments.map((s: any) => s.text).join(' '),
          })
        } catch (e: any) {
          reject(new Error(`Failed to parse whisper output: ${e.message}`))
        }
      })
    })
  }

  // Simple VAD-based speaker segmentation (Phase 1)
  segmentBySpeakers(result: WhisperResult, silenceThreshold = 1.5): Array<{ start: number; end: number; text: string; speaker: string }> {
    const out: Array<{ start: number; end: number; text: string; speaker: string }> = []
    let speakerIdx = 1
    for (let i = 0; i < result.segments.length; i++) {
      const seg = result.segments[i]
      if (i > 0) {
        const gap = seg.start - result.segments[i - 1].end
        if (gap > silenceThreshold) speakerIdx++
      }
      out.push({ ...seg, speaker: `Speaker ${speakerIdx}` })
    }
    return out
  }
}
