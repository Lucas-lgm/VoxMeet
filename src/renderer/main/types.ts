export interface Meeting {
  id: string
  title?: string
  date: string
  duration?: number
  state: string
  dir: string
  files: string[]
}

export interface Segment {
  start: number
  end: number
  text: string
  speaker?: string
}

export interface TranscriptionData {
  segments: Segment[]
  fullText: string
}

export interface AISettings {
  provider: string
  apiBaseUrl: string
  apiKey: string
  model: string
}

export interface WhisperModel {
  value: string
  label: string
  size: string
}

export interface DownloadProgress {
  downloaded: number
  total: number
  percent: number
}
