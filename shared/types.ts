export type RecordingState = 'idle' | 'recording' | 'processing' | 'completed' | 'error'

export interface MeetingMetadata {
  id: string
  title: string
  date: string
  duration: number
  recordingPath: string
  whisperPath: string
  transcriptionPath?: string
  summaryPath?: string
  state: RecordingState
}

export interface WhisperResult {
  segments: Array<{ start: number; end: number; text: string }>
  fullText: string
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
  actionItems: Array<{ task: string; assignee?: string; deadline?: string }>
  decisions: string[]
  keyMoments: Array<{ time: string; description: string }>
}

export interface AISettings {
  provider: string
  apiBaseUrl: string
  apiKey: string
  model: string
}
