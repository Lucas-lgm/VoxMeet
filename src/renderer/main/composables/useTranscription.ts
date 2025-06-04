import { ref, computed } from 'vue'
import { toPlain } from '../../utils/ipc'
import type { Segment } from '../types'

export interface CurrentMeeting {
  id: string
  dir: string
  title: string
  audioUrl: string | null
  hasTranscription: boolean
  hasSummary: boolean
}

export function useTranscription() {
  const segments = ref<Segment[]>([])
  const fullText = ref('')
  const currentMeeting = ref<CurrentMeeting | null>(null)
  const loading = ref(false)
  const dirtyIndexes = ref<Set<number>>(new Set())
  const currentSegmentIndex = ref(-1)

  const isDirty = computed(() => dirtyIndexes.value.size > 0)

  async function loadMeeting(id: string): Promise<void> {
    loading.value = true
    try {
      const meeting = await window.electronAPI.getMeeting(id)
      if (!meeting) return

      const hasTranscription = meeting.files?.some((f: string) => f === 'transcription.json') ?? false
      const audioFile = meeting.files?.find((f: string) => f === 'recording.wav') || meeting.files?.find((f: string) => f.endsWith('.wav'))

      currentMeeting.value = {
        id: meeting.id,
        dir: meeting.dir,
        title: meeting.title || id,
        audioUrl: audioFile ? `local-file://${meeting.dir}/${audioFile}` : null,
        hasTranscription,
        hasSummary: meeting.files?.some((f: string) => f === 'meeting-notes.md') ?? false,
      }

      if (hasTranscription) {
        const resp = await fetch(`local-file://${meeting.dir}/transcription.json`)
        const data = await resp.json()
        segments.value = data.withSpeakers || data.result?.segments || []
        fullText.value = data.result?.fullText || ''
      } else {
        segments.value = []
        fullText.value = ''
      }
      dirtyIndexes.value = new Set()
      currentSegmentIndex.value = -1
    } catch (e) {
      console.error('Failed to load meeting:', e)
    } finally {
      loading.value = false
    }
  }

  function updateSegmentText(index: number, text: string) {
    if (index >= 0 && index < segments.value.length) {
      segments.value[index].text = text
      dirtyIndexes.value.add(index)
    }
  }

  function updateSegmentSpeaker(index: number, speaker: string) {
    if (index >= 0 && index < segments.value.length) {
      segments.value[index].speaker = speaker
      dirtyIndexes.value.add(index)
    }
  }

  async function saveEdits(): Promise<boolean> {
    if (!currentMeeting.value || dirtyIndexes.value.size === 0) return true
    try {
      const result = await window.electronAPI.saveTranscriptionEdits(
        currentMeeting.value.dir,
        toPlain(segments.value)
      )
      if (result?.ok) {
        dirtyIndexes.value = new Set()
        return true
      }
      return false
    } catch (e) {
      console.error('Failed to save:', e)
      return false
    }
  }

  function setCurrentSegment(index: number) {
    currentSegmentIndex.value = index
  }

  function isSegmentDirty(index: number): boolean {
    return dirtyIndexes.value.has(index)
  }

  return {
    segments, fullText, currentMeeting, loading,
    dirtyIndexes, isDirty, currentSegmentIndex,
    isSegmentDirty,
    loadMeeting, updateSegmentText, updateSegmentSpeaker, saveEdits, setCurrentSegment,
  }
}
