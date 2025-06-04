// 全局类型定义

// 扩展 Window 接口以支持 webkit 前缀的 AudioContext 和 Electron API
declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
    playRecordingById?: (id: number) => void;
    downloadRecording?: (id: number) => void;
    deleteRecording?: (id: number) => void;
    electronAPI: {
      getAppVersion: () => Promise<string>;
      isDevelopment: () => boolean;
    };
  }

  // MediaRecorder 类型增强
  interface MediaRecorderOptions {
    mimeType?: string;
    audioBitsPerSecond?: number;
    videoBitsPerSecond?: number;
    bitsPerSecond?: number;
  }

  // BlobEvent 类型定义
  interface BlobEvent extends Event {
    data: Blob;
    timecode?: number;
  }
}

// Electron 相关类型
export interface ElectronAPI {
  ipcRenderer: {
    invoke: (channel: string, ...args: any[]) => Promise<any>;
    on: (channel: string, listener: (...args: any[]) => void) => void;
    removeAllListeners: (channel: string) => void;
  };
}

// 录音相关类型
export interface AudioRecorderConfig {
  sampleRate: number;
  echoCancellation: boolean;
  noiseSuppression: boolean;
  autoGainControl?: boolean;
}

export interface RecordingMetadata {
  duration: number;
  size: number;
  format: string;
  timestamp: Date;
  quality?: 'low' | 'medium' | 'high';
}

// 音频可视化相关类型
export interface VisualizerConfig {
  fftSize: number;
  smoothingTimeConstant: number;
  minDecibels: number;
  maxDecibels: number;
}

// 应用状态类型
export type AppStatus = 
  | '准备就绪'
  | '正在录音...'
  | '录音完成'
  | '初始化失败'
  | '麦克风访问被拒绝'
  | '录音启动失败'
  | '播放失败'
  | '播放出错';

// 错误类型
export interface AudioError extends Error {
  code?: string;
  constraint?: string;
} 