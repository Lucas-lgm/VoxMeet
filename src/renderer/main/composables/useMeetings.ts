import { ref } from 'vue'
import type { Meeting } from '../types'

export function useMeetings() {
  const meetings = ref<Meeting[]>([])
  const currentMeetingId = ref<string | null>(null)
  const loading = ref(false)

  async function loadMeetings() {
    loading.value = true
    try {
      meetings.value = await window.electronAPI.listMeetings() || []
    } catch (e) {
      console.error('Failed to load meetings:', e)
      meetings.value = []
    } finally {
      loading.value = false
    }
  }

  function selectMeeting(id: string) {
    currentMeetingId.value = id
  }

  async function deleteMeeting(id: string): Promise<boolean> {
    const result = await window.electronAPI.deleteMeeting(id)
    if (result.ok) {
      if (currentMeetingId.value === id) {
        currentMeetingId.value = null
      }
      await loadMeetings()
      return true
    }
    return false
  }

  async function renameMeeting(id: string, title: string): Promise<boolean> {
    const result = await window.electronAPI.renameMeeting(id, title)
    if (result.ok) {
      await loadMeetings()
      return true
    }
    return false
  }

  return { meetings, currentMeetingId, loading, loadMeetings, selectMeeting, deleteMeeting, renameMeeting }
}
