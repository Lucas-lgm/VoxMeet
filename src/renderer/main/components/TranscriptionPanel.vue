<template>
  <div v-if="!transcription.currentMeeting" class="empty-hint">{{ $t('transcription.selectMeeting') }}</div>
  <template v-else>
    <div id="transcription-header">
      <h3 id="transcription-title">{{ transcription.currentMeeting.title }}</h3>
      <div id="recording-info">{{ recordingInfo }}</div>
    </div>

    <AudioPlayer
      ref="audioPlayerRef"
      :segments="transcription.segments"
      @segment-change="onSegmentChange"
    />

    <div v-if="transcription.isDirty" class="save-bar">
      <span class="save-hint">{{ $t('transcription.unsavedChanges') }}</span>
      <button class="action-btn" @click="saveEdits">{{ $t('transcription.save') }}</button>
    </div>

    <div id="transcription-text">
      <div id="transcription-content">
        <p v-if="!transcription.segments.length && !transcription.loading" class="empty-hint">{{ $t('transcription.noResults') }}</p>
        <p v-else-if="transcription.loading" class="empty-hint">{{ $t('common.loading') }}</p>
        <TranscriptSegment
          v-for="(seg, i) in transcription.segments"
          :key="i"
          :segment="seg"
          :index="i"
          :is-current="i === transcription.currentSegmentIndex"
          :is-dirty="transcription.isSegmentDirty(i)"
          @update-text="transcription.updateSegmentText"
          @update-speaker="transcription.updateSegmentSpeaker"
          @seek="onSeek"
          :ref="(el: any) => { if (el) segmentRefs[i] = el }"
        />
      </div>

      <div id="transcription-actions" style="display:flex; justify-content:center; gap:8px; margin-top:24px;">
        <button
          class="action-btn"
          id="transcribe-btn"
          v-if="!transcription.currentMeeting.hasTranscription"
          :disabled="isCurrentMeetingTranscribing"
          @click="doTranscribe"
        >{{ isCurrentMeetingTranscribing ? $t('transcription.transcribing') : $t('transcription.start') }}</button>
        <button
          class="action-btn"
          id="retranscribe-btn"
          v-if="transcription.currentMeeting.hasTranscription"
          :disabled="isCurrentMeetingTranscribing"
          @click="doTranscribe"
        >{{ $t('transcription.retranscribe') }}</button>
      </div>
    </div>
  </template>
</template>

<script setup lang="ts">
import { ref, computed, inject } from 'vue'
import { useI18n } from 'vue-i18n'
import AudioPlayer from './AudioPlayer.vue'
import TranscriptSegment from './TranscriptSegment.vue'

const { t } = useI18n()
const transcription = inject<any>('transcription')!
const meetings = inject<any>('meetings')!
const taskManager = inject<any>('taskManager')!

const audioPlayerRef = ref<InstanceType<typeof AudioPlayer> | null>(null)
const segmentRefs = ref<any[]>([])
const transcribingIds = ref<Record<string, true>>({})

function onSegmentChange(idx: number) {
  transcription.setCurrentSegment(idx)
  segmentRefs.value[idx]?.scrollIntoView()
}

function onSeek(time: number) {
  audioPlayerRef.value?.seekTo(time)
}

const recordingInfo = computed(() => {
  const m = transcription.currentMeeting
  if (!m) return ''
  return m.title ? `${m.title}` : ''
})

const isCurrentMeetingTranscribing = computed(() =>
  !!(transcription.currentMeeting && transcribingIds.value[transcription.currentMeeting.id])
)

async function doTranscribe() {
  const meeting = transcription.currentMeeting
  if (!meeting) return
  if (transcribingIds.value[meeting.id]) return

  transcribingIds.value = { ...transcribingIds.value, [meeting.id]: true }
  const taskId = taskManager.addTask('transcription', t('transcription.taskLabel', { title: meeting.title || meeting.id }))

  const cleanup = window.electronAPI.onTranscriptionProgress((p) => {
    taskManager.updateTask(taskId, {
      progress: Math.min(Math.round((p.lastTime / 120) * 100), 95),
      label: t('transcription.transcribing') + ` ${Math.round(p.lastTime)}s`,
    })
  })
  try {
    const dir = meeting.dir
    const result = await window.electronAPI.startTranscription(`${dir}/whisper-input.wav`, dir)
    if (result?.ok) {
      taskManager.completeTask(taskId)
      if (meetings.currentMeetingId) {
        await transcription.loadMeeting(meetings.currentMeetingId)
      }
    } else {
      const errMsg = result?.error || t('common.unknown')
      taskManager.failTask(taskId, errMsg)
      alert(t('transcription.failed', { error: errMsg }))
    }
  } catch (e: any) {
    taskManager.failTask(taskId, e.message)
    alert(t('transcription.failed', { error: e.message }))
  } finally {
    cleanup()
    const { [meeting.id]: _, ...rest } = transcribingIds.value
    transcribingIds.value = rest
  }
}

async function saveEdits() {
  const ok = await transcription.saveEdits()
  if (!ok) alert(t('transcription.saveFailed'))
}
</script>

<style scoped>
.save-bar {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 8px;
  background: #ff9f0a20;
  border-radius: 6px;
  margin-bottom: 12px;
}
.save-hint {
  font-size: 13px;
  color: #ff9f0a;
}

</style>
