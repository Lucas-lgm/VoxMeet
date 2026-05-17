// Type definitions shared within the main process
// Duplicated from shared/types.ts to stay under rootDir in tsconfig.main.json

export interface WhisperResult {
  segments: Array<{ start: number; end: number; text: string }>
  fullText: string
}

export type WhisperProgressCallback = (progress: {
  segments: number
  lastTime: number
  text: string
}) => void

export interface AISettings {
  provider: string
  apiBaseUrl: string
  apiKey: string
  model: string
}

export interface AISummary {
  title: string
  summary: string
  topics: Array<{
    title: string
    discussion: string
    conclusion: string
    timeRange: string
  }>
  actionItems: Array<{
    task: string
    assignee: string
    deadline: string
  }>
  decisions: string[]
  keyMoments: Array<{
    time: string
    description: string
  }>
}
