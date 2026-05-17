<template>
  <div id="audio-player-container" v-if="transcription.currentMeeting?.audioUrl">
    <audio
      :key="transcription.currentMeeting?.id"
      ref="audioEl"
      id="audio-player"
      :src="transcription.currentMeeting.audioUrl"
      controls
      @timeupdate="onTimeUpdate"
    ></audio>
  </div>
</template>

<script setup lang="ts">
import { ref, inject } from 'vue'

const props = defineProps<{ segments: any[] }>()
const transcription = inject<any>('transcription')!
const audioEl = ref<HTMLAudioElement | null>(null)
const emit = defineEmits(['segment-change'])

function onTimeUpdate() {
  if (!audioEl.value || !props.segments.length) return
  const ct = audioEl.value.currentTime
  const idx = props.segments.findIndex((s: any) => ct >= s.start && ct < s.end)
  if (idx >= 0) {
    emit('segment-change', idx)
  }
}

function seekTo(time: number) {
  if (audioEl.value) {
    audioEl.value.currentTime = time
    audioEl.value.play()
  }
}

defineExpose({ seekTo })
</script>
