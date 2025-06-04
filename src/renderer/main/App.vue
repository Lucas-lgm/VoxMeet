<template>
  <div id="app">
    <header id="title-bar" @dblclick="toggleMaximize">
      <div id="title-bar-controls">
        <button class="mac-btn mac-close" @click="closeWindow" :title="$t('titleBar.close')"><span>✕</span></button>
        <button class="mac-btn mac-minimize" @click="minimizeWindow" :title="$t('titleBar.minimize')"><span>─</span></button>
        <button class="mac-btn mac-zoom" @click="toggleMaximize" :title="isMaximized ? $t('titleBar.restore') : $t('titleBar.maximize')"><span>{{ isMaximized ? '❐' : '＋' }}</span></button>
      </div>
      <span id="title-bar-text">{{ $t('app.title') }}</span>
    </header>

    <div id="app-body">
      <aside id="sidebar">
        <Sidebar @meeting-selected="showSettings = false" />
      </aside>
      <main id="content">
        <nav id="tabs" v-if="!showSettings">
          <button
            class="tab"
            :class="{ active: activeTab === 'transcription' }"
            @click="activeTab = 'transcription'"
          >{{ $t('app.tab.transcription') }}</button>
          <button
            class="tab"
            :class="{ active: activeTab === 'summary' }"
            @click="activeTab = 'summary'"
          >{{ $t('app.tab.summary') }}</button>
        </nav>

        <template v-if="showSettings">
          <SettingsPanel />
        </template>
        <template v-else>
          <section v-show="activeTab === 'transcription'" class="tab-content" style="display:block">
            <TranscriptionPanel />
          </section>
          <section v-show="activeTab === 'summary'" class="tab-content" style="display:block">
            <SummaryPanel />
          </section>
        </template>
      </main>
    </div>

    <footer id="status-bar">
      <div id="status-bar-tasks">
        <span v-if="!taskManagerActiveTasks.length" id="status-text">{{ $t('status.ready') }}</span>
        <span
          v-for="t in taskManagerActiveTasks.slice(0, 3)"
          :key="t.id"
          class="status-task"
          :class="'status-task-' + t.type"
        >
          <span class="status-task-icon">{{ taskIcon(t.type) }}</span>
          <span class="status-task-label">{{ t.label }}</span>
          <span v-if="t.progress > 0" class="status-task-pct">{{ t.progress }}%</span>
        </span>
        <span v-if="taskManagerActiveTasks.length > 3" class="status-task-more">
          {{ $t('status.moreTasks', { count: taskManagerActiveTasks.length - 3 }) }}
        </span>
      </div>
      <div id="status-bar-right">
        <button id="status-settings-btn" :title="$t('status.settings')" @click="showSettings = !showSettings">⚙</button>
      </div>
    </footer>
  </div>
</template>

<script setup lang="ts">
import { ref, provide, onMounted } from 'vue'
import Sidebar from './components/Sidebar.vue'
import TranscriptionPanel from './components/TranscriptionPanel.vue'
import SummaryPanel from './components/SummaryPanel.vue'
import SettingsPanel from './components/SettingsPanel.vue'
import { useMeetings } from './composables/useMeetings'
import { useTranscription } from './composables/useTranscription'
import { useModelDownload } from './composables/useModelDownload'
import { useTaskManager, type TaskItem } from './composables/useTaskManager'

const activeTab = ref('transcription')
const showSettings = ref(false)
const isMaximized = ref(false)

async function minimizeWindow() {
  await window.electronAPI.minimizeWindow()
}

async function toggleMaximize() {
  await window.electronAPI.maximizeWindow()
}

async function closeWindow() {
  await window.electronAPI.closeWindow()
}

onMounted(async () => {
  isMaximized.value = await window.electronAPI.isMaximized()
  window.electronAPI.onMaximizeChange((maximized) => {
    isMaximized.value = maximized
  })
})

function taskIcon(type: TaskItem['type']) {
  return type === 'download' ? '⬇' : type === 'transcription' ? '◉' : '⏳'
}

const { meetings, currentMeetingId, loading: meetingsLoading, loadMeetings, selectMeeting, deleteMeeting, renameMeeting } = useMeetings()
const t = useTranscription()
const modelDownload = useModelDownload()
const { activeTasks: taskManagerActiveTasks, tasks: taskManagerTasks, addTask, updateTask, completeTask, failTask } = useTaskManager()

provide('taskManager', {
  get tasks() { return taskManagerTasks.value },
  get activeTasks() { return taskManagerActiveTasks.value },
  addTask,
  updateTask,
  completeTask,
  failTask,
})

provide('meetings', {
  get meetings() { return meetings.value },
  get currentMeetingId() { return currentMeetingId.value },
  get meetingsLoading() { return meetingsLoading.value },
  loadMeetings,
  selectMeeting,
  deleteMeeting,
  renameMeeting,
})
provide('transcription', {
  get segments() { return t.segments.value },
  get fullText() { return t.fullText.value },
  get currentMeeting() { return t.currentMeeting.value },
  get loading() { return t.loading.value },
  get currentSegmentIndex() { return t.currentSegmentIndex.value },
  get isDirty() { return t.isDirty.value },
  isSegmentDirty: t.isSegmentDirty,
  loadMeeting: t.loadMeeting,
  updateSegmentText: t.updateSegmentText,
  updateSegmentSpeaker: t.updateSegmentSpeaker,
  saveEdits: t.saveEdits,
  setCurrentSegment: t.setCurrentSegment,
})
provide('activeTab', activeTab)
provide('modelDownload', {
  get modelListStamp() { return modelDownload.modelListStamp.value },
  startDownload: modelDownload.startDownload,
})

loadMeetings()
</script>
