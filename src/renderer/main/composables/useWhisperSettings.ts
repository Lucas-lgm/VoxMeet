import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { WhisperModel } from '../types'

export function useWhisperSettings() {
  const { t } = useI18n()
  const language = ref('')
  const languageStatus = ref('')
  const modelName = ref('base')
  const availableModels = ref<WhisperModel[]>([])
  const downloadedModels = ref<string[]>([])
  const proxyUrl = ref('')
  const proxyStatus = ref('')

  async function loadLanguage() {
    try {
      const result = await window.electronAPI.getWhisperLanguage()
      if (result) language.value = result.language
    } catch {}
  }

  async function saveLanguage() {
    try {
      const result = await window.electronAPI.setWhisperLanguage(language.value)
      if (result?.ok) {
        languageStatus.value = t('settings.transcription.languageSaved')
        setTimeout(() => { languageStatus.value = '' }, 2000)
      }
    } catch {}
  }

  async function loadModelSettings() {
    try {
      availableModels.value = await window.electronAPI.listAvailableModels() || []
      downloadedModels.value = await window.electronAPI.listDownloadedModels() || []
      const current = await window.electronAPI.getWhisperModel()
      modelName.value = current?.modelName || 'base'
      const proxyResult = await window.electronAPI.getProxyUrl()
      proxyUrl.value = proxyResult?.proxyUrl || ''
    } catch {}
  }

  function isDownloaded(name: string): boolean {
    return downloadedModels.value.includes(name)
  }

  async function saveModel() {
    try {
      await window.electronAPI.setWhisperModel(modelName.value)
    } catch {}
  }

  async function saveProxy() {
    try {
      const result = await window.electronAPI.setProxyUrl(proxyUrl.value)
      if (result?.ok) {
        proxyStatus.value = t('settings.proxy.saved')
        setTimeout(() => { proxyStatus.value = '' }, 2000)
      }
    } catch {}
  }

  async function loadProxy() {
    try {
      const result = await window.electronAPI.getProxyUrl()
      if (result) proxyUrl.value = result.proxyUrl
    } catch {}
  }

  return {
    language, languageStatus,
    modelName, availableModels, downloadedModels,
    proxyUrl, proxyStatus,
    loadLanguage, saveLanguage,
    loadModelSettings, isDownloaded, saveModel,
    loadProxy, saveProxy,
  }
}
