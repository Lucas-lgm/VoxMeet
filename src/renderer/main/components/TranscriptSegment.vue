<template>
  <div
    class="segment"
    :class="{
      'segment-highlight': isCurrent,
      'segment-dirty': isDirty,
    }"
    :ref="(el: any) => { if (el) elRef = el }"
  >
    <span class="segment-time" @click="seekTo(segment.start)">{{ formatTime(segment.start) }}</span>
    <span class="segment-speaker" @click="startEditSpeaker">{{ segment.speaker || $t('transcript.unknownSpeaker') }}</span>
    <span
      ref="textEl"
      class="segment-text"
      :contenteditable="isEditing"
      @click="startEdit"
      @blur="finishEdit"
      @keydown.escape="cancelEdit"
      @keydown.enter.ctrl="finishEdit"
    >{{ segment.text }}</span>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const props = defineProps<{
  segment: any
  index: number
  isCurrent: boolean
  isDirty: boolean
}>()

const emit = defineEmits(['update-text', 'update-speaker', 'seek'])
const editingIndex = ref(-1)
const isEditing = computed(() => editingIndex.value === props.index)
const textEl = ref<HTMLElement | null>(null)
const elRef = ref<HTMLElement | null>(null)

function startEdit(e: MouseEvent) {
  const x = e.clientX
  const y = e.clientY
  editingIndex.value = props.index
  nextTick(() => {
    const sel = window.getSelection()
    sel?.removeAllRanges()
    const range = document.caretRangeFromPoint(x, y)
    if (range) {
      sel?.addRange(range)
    } else {
      const r = document.createRange()
      r.selectNodeContents(textEl.value!)
      r.collapse(false)
      sel?.addRange(r)
    }
  })
}

function finishEdit() {
  if (editingIndex.value !== props.index) return
  const text = textEl.value?.textContent?.trim() ?? ''
  if (text !== props.segment.text) {
    emit('update-text', props.index, text)
  }
  editingIndex.value = -1
}

function cancelEdit() {
  editingIndex.value = -1
}

function startEditSpeaker() {
  const name = prompt(t('transcript.editSpeaker'), props.segment.speaker || '')
  if (name && name !== props.segment.speaker) {
    emit('update-speaker', props.index, name)
  }
}

function seekTo(time: number) {
  emit('seek', time)
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function scrollIntoView() {
  elRef.value?.scrollIntoView({ behavior: 'smooth', block: 'center' })
}

defineExpose({ scrollIntoView })
</script>

<style scoped>
.segment-highlight {
  background: #0a84ff20 !important;
  border-left: 3px solid #0a84ff;
}
.segment-dirty::after {
  content: '•';
  color: #ff9f0a;
  margin-left: 4px;
}
.segment-text[contenteditable="true"] {
  outline: none;
  border-bottom: 1px solid #0a84ff;
  background: #1c1c1e;
  border-radius: 2px;
  padding: 0 2px;
}
</style>
