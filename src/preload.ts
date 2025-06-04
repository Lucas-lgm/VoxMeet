import { contextBridge, ipcRenderer } from 'electron'

// 检测开发模式
const isDevelopment = process.argv.includes('--dev') || process.env.NODE_ENV === 'development'

// 定义暴露给渲染进程的 API
const electronAPI = {
  // 获取应用版本
  getAppVersion: (): Promise<string> => ipcRenderer.invoke('get-app-version'),
  
  // 获取开发模式状态
  isDevelopment: (): boolean => isDevelopment,
  
  // 可以在这里添加更多安全的 API
  // 例如：文件操作、系统信息等
}

// 暴露类型定义
declare global {
  interface Window {
    electronAPI: typeof electronAPI
  }
}

// 通过 contextBridge 安全地暴露 API
contextBridge.exposeInMainWorld('electronAPI', electronAPI)

// 为开发模式设置全局标识
if (isDevelopment) {
  contextBridge.exposeInMainWorld('__DEV_MODE__', true)
} 