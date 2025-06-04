<template>
  <div class="settings-page">
    <h3 id="settings-title">{{ $t('settings.title') }}</h3>

    <h3>{{ $t('settings.language.title') }}</h3>
    <div class="settings-form">
      <label>
        <span>{{ $t('settings.language.label') }}</span>
        <select v-model="localeValue" @change="onLocaleChange">
          <option value="zh">{{ $t('settings.language.zh') }}</option>
          <option value="en">{{ $t('settings.language.en') }}</option>
        </select>
      </label>
    </div>

    <hr class="settings-divider">

    <h3>{{ $t('settings.ai.title') }}</h3>
    <div class="settings-form">
      <label>
        <span>{{ $t('settings.ai.provider') }}</span>
        <select v-model="ai.settings.provider">
          <option value="openai">OpenAI</option>
          <option value="claude">Claude</option>
          <option value="custom">{{ $t('settings.ai.providerCustom') }}</option>
        </select>
      </label>
      <label>
        <span>{{ $t('settings.ai.apiBaseUrl') }}</span>
        <input type="text" v-model="ai.settings.apiBaseUrl" placeholder="https://api.openai.com/v1">
      </label>
      <label>
        <span>{{ $t('settings.ai.apiKey') }}</span>
        <input type="password" v-model="ai.settings.apiKey" placeholder="sk-...">
      </label>
      <label>
        <span>{{ $t('settings.ai.model') }}</span>
        <input type="text" v-model="ai.settings.model" placeholder="gpt-4o">
      </label>
      <button id="save-settings-btn" @click="ai.saveSettings()">{{ $t('settings.save') }}</button>
      <p id="settings-status" :style="{ color: ai.statusColor }">{{ ai.status }}</p>
    </div>

    <hr class="settings-divider">

    <h3>{{ $t('settings.transcription.title') }}</h3>
    <div class="settings-form">
      <label>
        <span>{{ $t('settings.transcription.language') }}</span>
        <select v-model="whisper.language">
          <option value="">{{ $t('settings.transcription.autoDetect') }}</option>
          <option value="zh">Chinese</option>
          <option value="en">English</option>
          <option value="ja">Japanese</option>
          <option value="ko">한국어</option>
          <option value="fr">Français</option>
          <option value="de">Deutsch</option>
        </select>
      </label>
      <p class="settings-hint">{{ $t('settings.transcription.languageHint') }}</p>
      <button class="action-btn" @click="whisper.saveLanguage()">{{ $t('settings.transcription.saveLanguage') }}</button>
      <p id="lang-status">{{ whisper.languageStatus }}</p>
    </div>

    <hr class="settings-divider">

    <h3>{{ $t('settings.model.title') }}</h3>
    <div class="settings-form">
      <label>
        <span>{{ $t('settings.model.select') }}</span>
        <select v-model="whisper.modelName" @change="whisper.saveModel()">
          <option v-for="m in whisper.availableModels" :key="m.value" :value="m.value">
            {{ m.label }} {{ whisper.isDownloaded(m.value) ? '✅' : '' }}
          </option>
        </select>
      </label>
      <div id="model-status">
        <p v-if="currentModel" :class="whisper.isDownloaded(whisper.modelName) ? 'settings-hint' : 'settings-hint'">
          {{ whisper.isDownloaded(whisper.modelName)
            ? $t('settings.model.downloaded', { label: currentModel.label })
            : $t('settings.model.notDownloaded', { label: currentModel.label, size: currentModel.size }) }}
        </p>
      </div>
      <button
        id="save-model-btn"
        v-if="!whisper.isDownloaded(whisper.modelName)"
        :disabled="currentModelDownloading"
        @click="modelDownload.startDownload(whisper.modelName)"
      >{{ $t('settings.model.download', { label: currentModel?.label || '' }) }}</button>
    </div>

    <hr class="settings-divider">

    <h3>{{ $t('settings.proxy.title') }}</h3>
    <div class="settings-form">
      <label>
        <span>{{ $t('settings.proxy.httpProxy') }}</span>
        <input type="text" v-model="whisper.proxyUrl" :placeholder="$t('settings.proxy.placeholder')">
      </label>
      <p class="settings-hint" v-html="$t('settings.proxy.hint')"></p>
      <button class="action-btn" @click="whisper.saveProxy()">{{ $t('settings.proxy.save') }}</button>
      <p id="proxy-status" :style="{ color: '#30d158' }">{{ whisper.proxyStatus }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, inject, onMounted, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAISettings } from '../composables/useAISettings'
import { useWhisperSettings } from '../composables/useWhisperSettings'

const { locale } = useI18n()
const ai = reactive(useAISettings())
const whisper = reactive(useWhisperSettings())
const modelDownload = inject<any>('modelDownload')!
const taskManager = inject<any>('taskManager')!

const localeValue = ref(locale.value)

async function onLocaleChange() {
  locale.value = localeValue.value
  localStorage.setItem('locale', localeValue.value)
  try {
    await window.electronAPI.setLocale(localeValue.value)
    await window.electronAPI.setTrayLocale(localeValue.value)
  } catch {}
}

const currentModel = computed(() =>
  whisper.availableModels.find((m: any) => m.value === whisper.modelName)
)

// Per-model: disable download button only if this specific model is downloading
const currentModelDownloading = computed(() =>
  taskManager.tasks.some(
    (t: any) => t.type === 'download' && t.status === 'running' && t.label.includes(whisper.modelName)
  )
)

// Reload model list when a download completes in the background
watch(() => modelDownload.modelListStamp, () => {
  whisper.loadModelSettings()
})

onMounted(async () => {
  ai.loadSettings()
  whisper.loadLanguage()
  whisper.loadModelSettings()
  whisper.loadProxy()
  // Load persisted locale
  try {
    const saved = await window.electronAPI.getLocale()
    if (saved.locale && saved.locale !== locale.value) {
      locale.value = saved.locale
      localeValue.value = saved.locale
      localStorage.setItem('locale', saved.locale)
    }
  } catch {}
})
</script>
