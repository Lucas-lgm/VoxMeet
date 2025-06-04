import { ref } from 'vue'
import { useTaskManager } from './useTaskManager'

export interface DownloadProgress {
  modelName: string
  downloaded: number
  total: number
  percent: number
}

const modelListStamp = ref(0)

export function useModelDownload() {
  const taskManager = useTaskManager()

  async function startDownload(modelName: string) {
    const taskId = taskManager.addTask('download', `Downloading ${modelName} model`)

    const cleanup = window.electronAPI.onModelDownloadProgress((progress: DownloadProgress) => {
      if (progress.modelName === modelName) {
        taskManager.updateTask(taskId, {
          progress: progress.percent,
          label: `Downloading ${modelName} model ${progress.percent}%`,
        })
      }
    })

    try {
      await window.electronAPI.downloadModel(modelName)
      await window.electronAPI.setWhisperModel(modelName)
      modelListStamp.value++
      taskManager.completeTask(taskId)
    } catch (e: any) {
      taskManager.failTask(taskId, e.message || String(e))
    } finally {
      cleanup()
    }
  }

  return { modelListStamp, startDownload }
}
