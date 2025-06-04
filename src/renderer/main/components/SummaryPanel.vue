<template>
  <div v-if="!currentMeeting" class="empty-hint">{{ $t('summary.selectMeeting') }}</div>
  <div v-else>
    <div v-if="!summaryText">
      <p class="empty-hint">{{ $t('summary.noSummary') }}</p>
      <div style="text-align:center; margin-top: 24px;">
        <button class="action-btn" :disabled="isGenerating" @click="generateSummary">
          {{ isGenerating ? $t('summary.generating') : $t('summary.generate') }}
        </button>
      </div>
    </div>
    <div v-else>
      <div class="editor-toolbar" v-if="editor">
        <span style="flex:1"></span>
        <button @click="saveSummary" :disabled="saving" style="margin-right:4px;">{{ $t('common.save') }}</button>
        <button @click="generateSummary" :disabled="isGenerating">{{ isGenerating ? $t('summary.generating') : $t('summary.regenerate') }}</button>
      </div>

      <editor-content :editor="editor" class="editor-content" />
      <input type="file" ref="fileInput" accept="image/*" style="display:none" @change="onImageSelected" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, inject, watch, onBeforeUnmount } from 'vue'
import { useI18n } from 'vue-i18n'
import { useEditor, EditorContent } from '@tiptap/vue-3'
import StarterKit from '@tiptap/starter-kit'
import Image from '@tiptap/extension-image'
import DragHandle from '@tiptap/extension-drag-handle'
import BubbleMenu from '@tiptap/extension-bubble-menu'
import { SlashCommand } from '../extensions/SlashCommand'
import { marked } from 'marked'
import TurndownService from 'turndown'

const { t } = useI18n()
const transcription = inject<any>('transcription')!
const activeTab = inject<any>('activeTab')!
const taskManager = inject<any>('taskManager')!

const currentMeeting = ref<any>(null)
const summaryText = ref('')
const generatingIds = ref<Record<string, true>>({})
const saving = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)
const turndownService = new TurndownService()
const summaryDir = ref('')

const isGenerating = computed(() =>
  !!(currentMeeting.value && generatingIds.value[currentMeeting.value.id])
)

function createBubbleMenu(): HTMLDivElement {
  const el = document.createElement('div')
  el.className = 'bubble-menu'

  const btns = [
    { label: '<b>B</b>', cmd: 'toggleBold', tag: ['bold'] },
    { label: 'H1', cmd: 'toggleHeading', attrs: { level: 1 }, tag: ['heading', { level: 1 }] },
    { label: 'H2', cmd: 'toggleHeading', attrs: { level: 2 }, tag: ['heading', { level: 2 }] },
    { label: 'List', cmd: 'toggleBulletList', tag: ['bulletList'] },
    { label: 'Numbered List', cmd: 'toggleOrderedList', tag: ['orderedList'] },
    { label: 'Blockquote', cmd: 'toggleBlockquote', tag: ['blockquote'] },
  ]

  btns.forEach(b => {
    const btn = document.createElement('button')
    btn.innerHTML = b.label
    btn.dataset.tag = JSON.stringify(b.tag)
    btn.onmousedown = (e: MouseEvent) => {
      e.preventDefault()
      // @ts-ignore
      const ed = window._editor
      if (!ed) return
      const chain = ed.chain().focus()
      if (b.attrs) {
        chain[b.cmd](b.attrs).run()
      } else {
        chain[b.cmd]().run()
      }
      updateActive(el, ed)
    }
    el.appendChild(btn)
  })

  return el
}

function updateActive(el: HTMLDivElement, ed: any) {
  el.querySelectorAll('button').forEach(btn => {
    const tag = JSON.parse(btn.dataset.tag || '[]')
    btn.classList.toggle('active', ed.isActive(...tag))
  })
}

const editor = useEditor({
  onCreate: ({ editor: ed }) => {
    // Store editor globally for bubble menu callbacks
    ;(window as any)._editor = ed
  },
  extensions: [
    StarterKit.configure({
      heading: { levels: [1, 2] },
    }),
    Image,
    DragHandle.configure({
      render: () => {
        const el = document.createElement('div')
        el.className = 'drag-handle'
        el.innerHTML = '⋮⋮'
        return el
      },
    }),
    BubbleMenu.configure({
      element: createBubbleMenu(),
    }),
    SlashCommand,
  ],
  editorProps: {
    attributes: {
      class: 'prose prose-invert max-w-none',
    },
  },
})

watch(() => transcription.currentMeeting, async (m: any) => {
  currentMeeting.value = m
  if (m?.dir) {
    summaryDir.value = m.dir
    await loadSummary(m.dir)
  }
})

async function loadSummary(dir: string) {
  try {
    const resp = await fetch(`local-file://${dir}/meeting-notes.md`)
    const md = await resp.text()
    summaryText.value = md
    if (editor.value) {
      const html = await marked(md)
      editor.value.commands.setContent(html)
    }
  } catch {
    summaryText.value = ''
    editor.value?.commands.setContent('')
  }
}

async function generateSummary() {
  const meeting = currentMeeting.value
  if (!meeting) return
  if (generatingIds.value[meeting.id]) return

  generatingIds.value = { ...generatingIds.value, [meeting.id]: true }
  const taskId = taskManager.addTask('summary', t('summary.taskLabel', { title: meeting.title || meeting.id }))
  try {
    const resp = await fetch(`local-file://${meeting.dir}/transcription.json`)
    const data = await resp.json()
    const fullText = data.result?.fullText || data.withSpeakers?.map((s: any) => s.text).join(' ') || ''
    const segments = data.withSpeakers || data.result?.segments || []

    const result = await window.electronAPI.generateSummary(meeting.dir, fullText, segments)
    if (result?.ok) {
      taskManager.completeTask(taskId)
      await loadSummary(meeting.dir)
      activeTab.value = 'summary'
    } else {
      const errMsg = result?.error || t('common.unknown')
      taskManager.failTask(taskId, errMsg)
      alert(t('summary.generateFailed', { error: errMsg }))
    }
  } catch (e: any) {
    taskManager.failTask(taskId, e.message)
    alert(t('summary.generateFailed', { error: e.message }))
  } finally {
    const { [meeting.id]: _, ...rest } = generatingIds.value
    generatingIds.value = rest
  }
}

async function saveSummary() {
  if (!editor.value || !summaryDir.value) return
  saving.value = true
  try {
    const html = editor.value.getHTML()
    const md = turndownService.turndown(html)

    const result = await window.electronAPI.saveSummary(summaryDir.value, md)
    if (!result?.ok) {
      console.error('Save summary failed:', result?.error)
    }
  } catch (e: any) {
    console.error('Save failed:', e)
  } finally {
    saving.value = false
  }
}

function addImage() {
  fileInput.value?.click()
}

function onImageSelected(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file || !editor.value) return
  const reader = new FileReader()
  reader.onload = () => {
    const url = reader.result as string
    editor.value!.chain().focus().setImage({ src: url }).run()
  }
  reader.readAsDataURL(file)
  ;(e.target as HTMLInputElement).value = ''
}

onBeforeUnmount(() => {
  editor.value?.destroy()
})
</script>

<style scoped>
.editor-toolbar {
  display: flex;
  gap: 4px;
  padding: 8px;
  background: #2c2c2e;
  border-radius: 8px 8px 0 0;
  border: 1px solid #3a3a3c;
  flex-wrap: wrap;
  align-items: center;
}
.editor-toolbar button {
  padding: 4px 10px;
  border: 1px solid transparent;
  border-radius: 4px;
  background: transparent;
  color: #f5f5f7;
  cursor: pointer;
  font-size: 13px;
  transition: background 0.15s;
}
.editor-toolbar button:hover { background: #3a3a3c; }
.editor-toolbar button.active { background: #0a84ff; color: white; }

.editor-content {
  border: 1px solid #3a3a3c;
  border-top: none;
  border-radius: 0 0 8px 8px;
  padding: 16px;
  min-height: 300px;
  background: #1c1c1e;
  color: #f5f5f7;
}
.editor-content :deep(.ProseMirror) {
  outline: none;
  min-height: 280px;
}
.editor-content :deep(.ProseMirror h1) { font-size: 22px; margin: 16px 0 8px; }
.editor-content :deep(.ProseMirror h2) { font-size: 18px; margin: 12px 0 6px; }
.editor-content :deep(.ProseMirror p) { margin: 4px 0; line-height: 1.6; }
.editor-content :deep(.ProseMirror img) { max-width: 100%; border-radius: 4px; margin: 8px 0; }
.editor-content :deep(.ProseMirror ul),
.editor-content :deep(.ProseMirror ol) { padding-left: 20px; }
.editor-content :deep(.drag-handle) {
  position: absolute;
  left: -20px;
  top: 0;
  width: 20px;
  height: 1.5em;
  cursor: grab;
  opacity: 0;
  transition: opacity 0.15s;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #8e8e93;
  font-size: 12px;
}
.editor-content :deep(.ProseMirror) .drag-handle:hover,
.editor-content :deep(.ProseMirror) .drag-handle:active {
  opacity: 1;
}
</style>

<style>
.slash-menu {
  position: fixed;
  z-index: 10000;
  background: #2c2c2e;
  border: 1px solid #3a3a3c;
  border-radius: 8px;
  padding: 4px 0;
  min-width: 180px;
  max-height: 280px;
  overflow-y: auto;
  box-shadow: 0 8px 24px rgba(0,0,0,0.5);
}
.slash-menu-item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 8px 14px;
  border: none;
  background: transparent;
  color: #f5f5f7;
  font-size: 14px;
  cursor: pointer;
  text-align: left;
}
.slash-menu-item:hover,
.slash-menu-item.active {
  background: #3a3a3c;
}
.slash-menu-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 4px;
  background: #3a3a3c;
  font-weight: 600;
  font-size: 13px;
  color: #0a84ff;
}

/* Floating bubble menu */
.bubble-menu {
  display: flex;
  gap: 2px;
  padding: 4px 6px;
  background: #2c2c2e;
  border: 1px solid #3a3a3c;
  border-radius: 8px;
  box-shadow: 0 4px 16px rgba(0,0,0,0.4);
}
.bubble-menu button {
  padding: 4px 8px;
  border: 1px solid transparent;
  border-radius: 4px;
  background: transparent;
  color: #f5f5f7;
  cursor: pointer;
  font-size: 13px;
  transition: background 0.15s;
}
.bubble-menu button:hover {
  background: #3a3a3c;
}
.bubble-menu button.active {
  background: #0a84ff;
  color: white;
}
</style>
