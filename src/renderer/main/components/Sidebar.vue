<template>
  <div id="sidebar-header">
    <h2>{{ $t('sidebar.title') }}</h2>
    <div id="sidebar-actions">
      <button id="refresh-btn" :title="$t('sidebar.refresh')" @click="meetings.loadMeetings()">↻</button>
    </div>
  </div>
  <div id="history-list">
    <p v-if="!meetings.meetings.length" class="empty-hint">{{ meetings.loading ? $t('common.loading') : $t('sidebar.noMeetings') }}</p>
    <div
      v-for="m in meetings.meetings"
      :key="m.id"
      class="history-item"
      :class="{ selected: m.id === meetings.currentMeetingId }"
      @click="selectMeeting(m.id)"
      @contextmenu.prevent="openContextMenu($event, m)"
    >
      <div class="history-item-title">
        <input
          v-if="renamingId === m.id"
          ref="renameInput"
          class="rename-input"
          :value="m.title || m.id"
          @blur="finishRename(m, ($event.target as HTMLInputElement).value)"
          @keydown.enter="finishRename(m, ($event.target as HTMLInputElement).value)"
          @keydown.escape="renamingId = ''"
          @click.stop
        />
        <template v-else>{{ m.title || m.id }}</template>
      </div>
      <div class="history-item-meta">
        {{ formatDate(m.date) }} · {{ m.duration ? formatDuration(m.duration) : '--:--' }}
        <span class="status-badge" :class="'status-' + (m.state || 'unknown')">{{ m.state || $t('common.unknown') }}</span>
      </div>
    </div>
  </div>

  <Teleport to="body">
    <div
      v-if="contextMenu.show"
      class="context-menu"
      :style="{ left: contextMenu.x + 'px', top: contextMenu.y + 'px' }"
    >
      <div class="context-menu-item" @click.stop="renameMeeting">{{ $t('sidebar.rename') }}</div>
      <div class="context-menu-item danger" @click.stop="deleteMeeting">{{ $t('sidebar.delete') }}</div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { inject, reactive, ref, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { useI18n } from 'vue-i18n'

const { t, locale } = useI18n()
const meetings = inject<any>('meetings')!
const transcription = inject<any>('transcription')!

const emit = defineEmits<{
  (e: 'meeting-selected'): void
}>()

const contextMenu = reactive<{ show: boolean; x: number; y: number; meeting: any }>({
  show: false, x: 0, y: 0, meeting: null,
})
const renamingId = ref('')
const renameInput = ref<HTMLInputElement | null>(null)

function selectMeeting(id: string) {
  contextMenu.show = false
  meetings.selectMeeting(id)
  transcription.loadMeeting(id)
  emit('meeting-selected')
}

function openContextMenu(e: MouseEvent, m: any) {
  contextMenu.show = true
  contextMenu.x = e.clientX
  contextMenu.y = e.clientY
  contextMenu.meeting = m
}

async function renameMeeting() {
  const m = contextMenu.meeting
  contextMenu.show = false
  if (!m) return
  renamingId.value = m.id
  await nextTick()
  renameInput.value?.focus()
  renameInput.value?.select()
}

async function finishRename(m: any, newTitle: string) {
  renamingId.value = ''
  const trimmed = newTitle.trim()
  if (!trimmed || trimmed === (m.title || m.id)) return
  const ok = await meetings.renameMeeting(m.id, trimmed)
  if (!ok) alert(t('sidebar.renameFailed'))
}

async function deleteMeeting() {
  const m = contextMenu.meeting
  contextMenu.show = false
  if (!m) return
  if (!confirm(t('sidebar.confirmDelete', { title: m.title || m.id }))) return
  const ok = await meetings.deleteMeeting(m.id)
  if (!ok) alert(t('sidebar.deleteFailed'))
}

function closeMenu() { contextMenu.show = false }
onMounted(() => document.addEventListener('click', closeMenu))
onBeforeUnmount(() => document.removeEventListener('click', closeMenu))

function formatDate(iso: string): string {
  if (!iso) return ''
  try { return new Date(iso).toLocaleDateString(locale.value === 'zh' ? 'zh-CN' : 'en') } catch { return iso.slice(0, 10) }
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}
</script>

<style scoped>
.context-menu {
  position: fixed;
  background: #2c2c2e;
  border: 1px solid #3a3a3c;
  border-radius: 6px;
  padding: 4px 0;
  min-width: 120px;
  z-index: 9999;
  box-shadow: 0 4px 12px rgba(0,0,0,0.4);
}
.context-menu-item {
  padding: 8px 16px;
  cursor: pointer;
  font-size: 13px;
  color: #f5f5f7;
}
.context-menu-item:hover {
  background: #3a3a3c;
}
.context-menu-item.danger {
  color: #ff453a;
}
.context-menu-item.danger:hover {
  background: #ff453a20;
}
.rename-input {
  width: 100%;
  padding: 2px 4px;
  border: 1px solid #0a84ff;
  border-radius: 4px;
  background: #1c1c1e;
  color: #f5f5f7;
  font-size: 14px;
  font-weight: 500;
  outline: none;
}
</style>
