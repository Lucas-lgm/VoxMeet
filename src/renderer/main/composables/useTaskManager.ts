import { ref, computed } from 'vue'

export interface TaskItem {
  id: string
  type: 'download' | 'transcription' | 'summary'
  label: string
  status: 'running' | 'completed' | 'failed'
  progress: number
  error?: string
  createdAt: number
  completedAt?: number
}

// Module-level singleton state — shared across all callers
const tasks = ref<TaskItem[]>([])
const cleanupTimers: Record<string, ReturnType<typeof setTimeout>> = {}

export function useTaskManager() {
  function addTask(type: TaskItem['type'], label: string): string {
    const id = `${type}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    tasks.value.push({ id, type, label, status: 'running', progress: 0, createdAt: Date.now() })
    return id
  }

  function updateTask(id: string, updates: Partial<TaskItem>) {
    const t = tasks.value.find(t => t.id === id)
    if (t) Object.assign(t, updates)
  }

  function removeTask(id: string) {
    tasks.value = tasks.value.filter(t => t.id !== id)
    if (cleanupTimers[id]) {
      clearTimeout(cleanupTimers[id])
      delete cleanupTimers[id]
    }
  }

  function completeTask(id: string) {
    updateTask(id, { status: 'completed', progress: 100, completedAt: Date.now() })
    cleanupTimers[id] = setTimeout(() => removeTask(id), 4000)
  }

  function failTask(id: string, error: string) {
    updateTask(id, { status: 'failed', error, completedAt: Date.now() })
    cleanupTimers[id] = setTimeout(() => removeTask(id), 8000)
  }

  const activeTasks = computed(() => tasks.value.filter(t => t.status === 'running'))

  return { tasks, activeTasks, addTask, updateTask, removeTask, completeTask, failTask }
}
