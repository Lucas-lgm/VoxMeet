import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { AISettings } from '../types'

export function useAISettings() {
  const { t } = useI18n()
  const settings = ref<AISettings>({ provider: 'openai', apiBaseUrl: '', apiKey: '', model: 'gpt-4o' })
  const status = ref('')
  const statusColor = ref('#30d158')

  async function loadSettings() {
    try {
      const s = await window.electronAPI.getAISettings()
      if (s) settings.value = s
    } catch {}
  }

  async function saveSettings() {
    try {
      const result = await window.electronAPI.saveAISettings(settings.value)
      if (result?.ok) {
        status.value = t('settings.saved')
        statusColor.value = '#30d158'
      } else {
        status.value = t('settings.saveFailed', { error: result?.error || t('common.unknown') })
        statusColor.value = '#ff453a'
      }
    } catch (e: any) {
      status.value = t('settings.saveFailed', { error: e.message })
      statusColor.value = '#ff453a'
    }
    setTimeout(() => { status.value = '' }, 3000)
  }

  return { settings, status, statusColor, loadSettings, saveSettings }
}
