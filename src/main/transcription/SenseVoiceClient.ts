import { spawn } from 'child_process'
import * as path from 'path'
import * as fs from 'fs/promises'
import { createLogger } from '../utils/logger'
import { WhisperResult, WhisperProgressCallback } from '../types'
import {
  SettingsStore,
  getSenseVoiceBinaryPath,
  getSenseVoiceLibDir,
  getSenseVoiceModelPath,
  getSenseVoiceTokensPath,
} from '../store/SettingsStore'

const logger = createLogger('SenseVoiceClient')
const settingsStore = SettingsStore.getInstance()

// SenseVoice output is one JSON line per file on stdout:
// {"lang":"<|zh|>","emotion":"<|NEUTRAL|>","event":"<|Speech|>","text":"...","timestamps":[0.72,...],"tokens":["开","饭",...],"words":[]}
interface SenseVoiceOutput {
  text: string
  timestamps: number[]
  tokens: string[]
  words: string[]
  lang?: string
  emotion?: string
  event?: string
}

/** Pattern for sentence-ending punctuation in CJK and Latin text */
const SENTENCE_BOUNDARY_RE = /[。！？；.!?;]\s*/g

export class SenseVoiceClient {
  private binaryPath: string = ''
  private modelPath: string = ''
  private tokensPath: string = ''

  async ensureConfigured(): Promise<void> {
    this.binaryPath = getSenseVoiceBinaryPath()
    this.modelPath = getSenseVoiceModelPath()
    this.tokensPath = getSenseVoiceTokensPath()

    logger.info('SenseVoiceClient ensureConfigured', { binary: this.binaryPath })

    try {
      await fs.access(this.binaryPath, fs.constants.X_OK)
    } catch {
      throw new Error(`sherpa-onnx-offline binary not found at ${this.binaryPath}. Run "npm run setup:sensevoice" first.`)
    }

    try {
      await fs.access(this.modelPath, fs.constants.R_OK)
    } catch {
      throw new Error(`SenseVoice model not found at ${this.modelPath}. Download in Settings first.`)
    }

    try {
      await fs.access(this.tokensPath, fs.constants.R_OK)
    } catch {
      throw new Error(`SenseVoice tokens not found at ${this.tokensPath}. Re-download model.`)
    }
  }

  async transcribe(audioPath: string, _language?: string, onProgress?: WhisperProgressCallback): Promise<WhisperResult> {
    await this.ensureConfigured()

    const args = [
      `--sense-voice-model=${this.modelPath}`,
      `--tokens=${this.tokensPath}`,
      '--num-threads=4',
      '--debug=false',
      '--print-args=false',
      audioPath,
    ]

    logger.info('Running sherpa-onnx-offline (SenseVoice)', {
      binary: this.binaryPath,
      model: this.modelPath,
      input: audioPath,
    })

    // Helper to read lib dir for DYLD_LIBRARY_PATH
    const libDir = getSenseVoiceLibDir()

    return new Promise((resolve, reject) => {
      const proc = spawn(this.binaryPath, args, {
        stdio: ['ignore', 'pipe', 'pipe'],
        env: {
          ...process.env,
          DYLD_LIBRARY_PATH: libDir,
        },
      })

      let stdout = ''
      let stderr = ''

      proc.stdout?.on('data', (data: Buffer) => { stdout += data.toString() })

      proc.stderr?.on('data', (data: Buffer) => {
        stderr += data.toString()
      })

      proc.on('error', (err) => {
        logger.error('sherpa-onnx-offline process error', { error: err.message })
        reject(err)
      })

      proc.on('close', async (code) => {
        logger.info('sherpa-onnx-offline exited', { code, stdoutSize: stdout.length, stderrSize: stderr.length })

        if (code !== 0) {
          logger.error('sherpa-onnx-offline exited with error', { code, stderr: stderr.slice(-500) })
          reject(new Error(`sherpa-onnx-offline exited with code ${code}: ${stderr.slice(-200)}`))
          return
        }

        try {
          const result = this.parseOutput(stdout, onProgress)
          resolve(result)
        } catch (e: any) {
          reject(new Error(`Failed to parse SenseVoice output: ${e.message}`))
        }
      })
    })
  }

  /**
   * Parse the stdout JSON output from sherpa-onnx-offline.
   * Each input file produces one JSON line.
   */
  private parseOutput(stdout: string, onProgress?: WhisperProgressCallback): WhisperResult {
    const lines = stdout.trim().split('\n').filter(l => l.trim().startsWith('{'))
    if (lines.length === 0) {
      throw new Error('No JSON output found from sherpa-onnx-offline')
    }

    const allSegments: Array<{ start: number; end: number; text: string }> = []

    for (const line of lines) {
      let parsed: SenseVoiceOutput
      try {
        parsed = JSON.parse(line)
      } catch {
        logger.warn('Failed to parse output line, skipping', { line: line.slice(0, 200) })
        continue
      }

      if (!parsed.tokens || !parsed.timestamps) {
        logger.warn('Missing tokens/timestamps in output', { text: parsed.text?.slice(0, 100) })
        // Fallback: create a single segment from text only
        allSegments.push({ start: 0, end: 0, text: parsed.text || '' })
        continue
      }

      // Group tokens into segments based on sentence boundaries and timing gaps
      const segments = this.groupIntoSegments(parsed.tokens, parsed.timestamps)
      allSegments.push(...segments)
    }

    const fullText = allSegments.map(s => s.text).join(' ')

    // Report progress
    if (onProgress) {
      onProgress({ segments: allSegments.length, lastTime: allSegments[allSegments.length - 1]?.end || 0, text: fullText })
    }

    return { segments: allSegments, fullText }
  }

  /**
   * Group per-token timestamps into sentence-level segments.
   *
   * Splits on sentence-ending punctuation (。！？；.!?;),
   * and on timing gaps > 1.5s between consecutive tokens.
   */
  private groupIntoSegments(tokens: string[], timestamps: number[]): Array<{ start: number; end: number; text: string }> {
    if (tokens.length === 0) return []

    const segments: Array<{ start: number; end: number; text: string }> = []
    let segStart = timestamps[0]
    let segTokens: string[] = []

    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i]
      segTokens.push(token)

      const isLast = i === tokens.length - 1
      const gap = isLast ? 0 : (timestamps[i + 1] - timestamps[i])
      const endsSentence = SENTENCE_BOUNDARY_RE.test(token)

      // Reset lastIndex because we use the global regex
      SENTENCE_BOUNDARY_RE.lastIndex = 0

      if (endsSentence || gap > 1.5 || isLast) {
        const segEnd = timestamps[i]
        const text = segTokens.join('').replace(SENTENCE_BOUNDARY_RE, (m) => m.trim()).trim()

        // Only include non-empty segments
        if (text) {
          segments.push({ start: segStart, end: segEnd, text })
        }

        // Start next segment
        segStart = isLast ? segEnd : timestamps[i + 1]
        segTokens = []
      }
    }

    return segments
  }

  // Simple VAD-based speaker segmentation (same approach as WhisperClient)
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
