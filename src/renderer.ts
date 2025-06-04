/// <reference path="./types/global.d.ts" />

// 类型定义
interface Recording {
  id: number
  name: string
  url: string
  blob: Blob
  duration: string
  timestamp: Date
}

interface AudioConstraints {
  audio: {
    echoCancellation: boolean
    noiseSuppression: boolean
    sampleRate: number
  }
}

// DOM 元素类型定义
const startRecordBtn = document.getElementById('startRecord') as HTMLButtonElement
const stopRecordBtn = document.getElementById('stopRecord') as HTMLButtonElement
const playRecordBtn = document.getElementById('playRecord') as HTMLButtonElement
const recordingStatus = document.getElementById('recordingStatus') as HTMLSpanElement
const recordTime = document.getElementById('recordTime') as HTMLSpanElement
const versionElement = document.getElementById('version') as HTMLSpanElement
const recordingsList = document.getElementById('recordingsList') as HTMLDivElement
const visualizer = document.getElementById('visualizer') as HTMLCanvasElement

// 录音相关变量
let mediaRecorder: MediaRecorder | null = null
let audioStream: MediaStream | null = null
let isRecording: boolean = false
let recordingStartTime: number | null = null
let recordingTimer: NodeJS.Timeout | null = null
let audioChunks: Blob[] = []
let currentAudio: HTMLAudioElement | null = null
let recordings: Recording[] = []

// 可视化相关变量
let audioContext: AudioContext | null = null
let analyser: AnalyserNode | null = null
let dataArray: Uint8Array | null = null
let animationId: number | null = null

// 检测开发模式（通过 preload 脚本安全获取）
const isDevelopment = (): boolean => {
    // 优先使用 electronAPI 提供的开发模式检测
    if (window.electronAPI && typeof window.electronAPI.isDevelopment === 'function') {
        return window.electronAPI.isDevelopment()
    }
    
    // 备用检测方法：检查全局变量
    const hasDevFlag = (window as any).__DEV_MODE__ === true
    
    // 备用检测方法：检查 URL 特征
    const isLocalhost = window.location.href.includes('localhost')
    const isFileProtocol = window.location.protocol === 'file:'
    
    return hasDevFlag || isLocalhost || isFileProtocol
}

// 开发模式辅助功能
function setupDevelopmentHelpers(): void {
    // 添加开发模式样式类
    document.body.classList.add('development')
    
    // 全局快捷键
    document.addEventListener('keydown', (event: KeyboardEvent): void => {
        // Ctrl+Shift+I 切换开发者工具
        if (event.ctrlKey && event.shiftKey && event.key === 'I') {
            console.log('开发者工具快捷键被触发')
        }
        
        // Ctrl+Shift+R 强制刷新
        if (event.ctrlKey && event.shiftKey && event.key === 'R') {
            window.location.reload()
        }
    })
    
    // 开发模式信息显示
    const devInfo = document.createElement('div')
    devInfo.id = 'dev-info'
    devInfo.style.cssText = `
        position: fixed;
        top: 10px;
        right: 10px;
        background: rgba(0, 0, 0, 0.8);
        color: #00ff00;
        padding: 5px 10px;
        border-radius: 5px;
        font-size: 12px;
        font-family: monospace;
        z-index: 10000;
        pointer-events: none;
    `
    devInfo.textContent = '🔧 DEV MODE'
    document.body.appendChild(devInfo)
    
    console.log('🔧 开发模式辅助功能已启用')
    console.log('快捷键: Ctrl+Shift+R 强制刷新')
}

// 初始化应用
async function initApp(): Promise<void> {
    try {
        // 检测开发模式
        const isDevMode = isDevelopment()
        
        // 获取应用版本
        const version: string = await window.electronAPI.getAppVersion()
        versionElement.textContent = `版本 ${version}${isDevMode ? ' (开发版)' : ''}`
        
        // 初始化录音功能
        await initAudioRecording()
        
        // 绑定事件监听器
        bindEventListeners()
        
        // 开发模式下的额外功能
        if (isDevMode) {
            setupDevelopmentHelpers()
            console.log('🚀 开发模式已启用 - 文件变化时应用会自动重启')
        }
        
        console.log('✅ 应用初始化完成')
    } catch (error) {
        console.error('❌ 应用初始化失败:', error)
        updateStatus('初始化失败')
    }
}

// 初始化音频录制
async function initAudioRecording(): Promise<void> {
    try {
        // 请求麦克风权限
        const constraints: AudioConstraints = {
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                sampleRate: 44100
            }
        }
        
        audioStream = await navigator.mediaDevices.getUserMedia(constraints)
        
        // 创建音频上下文用于可视化
        audioContext = new (window.AudioContext || (window as any).webkitAudioContext)()
        analyser = audioContext.createAnalyser()
        const source: MediaStreamAudioSourceNode = audioContext.createMediaStreamSource(audioStream)
        source.connect(analyser)
        
        analyser.fftSize = 256
        const bufferLength: number = analyser.frequencyBinCount
        dataArray = new Uint8Array(bufferLength)
        
        updateStatus('准备就绪')
        
        // 开始可视化
        visualizeAudio()
        
    } catch (error) {
        console.error('无法访问麦克风:', error)
        updateStatus('麦克风访问被拒绝')
        startRecordBtn.disabled = true
    }
}

// 绑定事件监听器
function bindEventListeners(): void {
    startRecordBtn.addEventListener('click', startRecording)
    stopRecordBtn.addEventListener('click', stopRecording)
    playRecordBtn.addEventListener('click', playLastRecording)
}

// 开始录音
async function startRecording(): Promise<void> {
    try {
        if (!audioStream) {
            throw new Error('音频流未初始化')
        }
        
        audioChunks = []
        
        // 创建 MediaRecorder
        const mimeType = 'audio/webm;codecs=opus'
        if (!MediaRecorder.isTypeSupported(mimeType)) {
            throw new Error('不支持的音频格式')
        }
        
        mediaRecorder = new MediaRecorder(audioStream, { mimeType })
        
        mediaRecorder.ondataavailable = (event: BlobEvent): void => {
            if (event.data.size > 0) {
                audioChunks.push(event.data)
            }
        }
        
        mediaRecorder.onstop = handleRecordingStop
        
        // 开始录音
        mediaRecorder.start()
        isRecording = true
        recordingStartTime = Date.now()
        
        // 更新 UI
        updateRecordingUI(true)
        updateStatus('正在录音...')
        
        // 启动计时器
        startTimer()
        
        console.log('开始录音')
        
    } catch (error) {
        console.error('录音启动失败:', error)
        updateStatus('录音启动失败')
    }
}

// 停止录音
function stopRecording(): void {
    if (mediaRecorder && isRecording) {
        mediaRecorder.stop()
        isRecording = false
        stopTimer()
        
        // 更新 UI
        updateRecordingUI(false)
        updateStatus('录音完成')
        
        console.log('停止录音')
    }
}

// 处理录音停止
function handleRecordingStop(): void {
    if (!recordingStartTime) return
    
    const recordingBlob = new Blob(audioChunks, { type: 'audio/webm' })
    const recordingUrl = URL.createObjectURL(recordingBlob)
    
    // 创建录音记录
    const recording: Recording = {
        id: Date.now(),
        name: `录音_${new Date().toLocaleString('zh-CN')}`,
        url: recordingUrl,
        blob: recordingBlob,
        duration: formatTime(Math.floor((Date.now() - recordingStartTime) / 1000)),
        timestamp: new Date()
    }
    
    recordings.push(recording)
    updateRecordingsList()
    
    // 启用播放按钮
    playRecordBtn.disabled = false
    
    console.log('录音保存完成:', recording.name)
}

// 播放最后一次录音
function playLastRecording(): void {
    if (recordings.length > 0) {
        const lastRecording = recordings[recordings.length - 1]
        playRecording(lastRecording)
    }
}

// 播放录音
function playRecording(recording: Recording): void {
    // 停止当前播放的音频
    if (currentAudio) {
        currentAudio.pause()
        currentAudio = null
    }
    
    // 创建新的音频对象
    currentAudio = new Audio(recording.url)
    currentAudio.play().catch((error: Error) => {
        console.error('播放失败:', error)
        updateStatus('播放失败')
    })
    
    updateStatus(`正在播放: ${recording.name}`)
    
    currentAudio.onended = (): void => {
        updateStatus('准备就绪')
        currentAudio = null
    }
    
    currentAudio.onerror = (): void => {
        updateStatus('播放出错')
        currentAudio = null
    }
}

// 更新录音界面状态
function updateRecordingUI(recording: boolean): void {
    startRecordBtn.disabled = recording
    stopRecordBtn.disabled = !recording
    
    const container = document.querySelector('.recorder-section') as HTMLElement
    if (container) {
        if (recording) {
            container.classList.add('recording')
        } else {
            container.classList.remove('recording')
        }
    }
}

// 更新状态显示
function updateStatus(status: string): void {
    recordingStatus.textContent = status
}

// 启动计时器
function startTimer(): void {
    if (!recordingStartTime) return
    
    recordingTimer = setInterval((): void => {
        if (recordingStartTime) {
            const elapsed = Math.floor((Date.now() - recordingStartTime) / 1000)
            recordTime.textContent = formatTime(elapsed)
        }
    }, 1000)
}

// 停止计时器
function stopTimer(): void {
    if (recordingTimer) {
        clearInterval(recordingTimer)
        recordingTimer = null
    }
    recordTime.textContent = '00:00'
}

// 格式化时间
function formatTime(seconds: number): string {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
}

// 为录音列表添加事件委托
function addRecordingListEventListeners(): void {
    recordingsList.addEventListener('click', (event: Event): void => {
        const target = event.target as HTMLElement
        const button = target.closest('button[data-action]') as HTMLButtonElement
        
        if (!button) return
        
        const action = button.getAttribute('data-action')
        const recordingId = parseInt(button.getAttribute('data-id') || '0')
        
        if (!recordingId) return
        
        switch (action) {
            case 'play':
                playRecordingById(recordingId)
                break
            case 'download':
                downloadRecording(recordingId)
                break
            case 'delete':
                deleteRecording(recordingId)
                break
        }
    })
}

// 更新录音列表
function updateRecordingsList(): void {
    if (recordings.length === 0) {
        recordingsList.innerHTML = '<p class="empty-message">暂无录音文件</p>'
        return
    }
    
    recordingsList.innerHTML = recordings.map((recording: Recording): string => `
        <div class="recording-item">
            <div class="recording-info">
                <div class="recording-name">${recording.name}</div>
                <div class="recording-duration">时长: ${recording.duration}</div>
            </div>
            <div class="recording-actions">
                <button class="btn btn-success btn-small" data-action="play" data-id="${recording.id}">
                    <span class="icon">▶️</span>播放
                </button>
                <button class="btn btn-secondary btn-small" data-action="download" data-id="${recording.id}">
                    <span class="icon">💾</span>保存
                </button>
                <button class="btn btn-danger btn-small" data-action="delete" data-id="${recording.id}">
                    <span class="icon">🗑️</span>删除
                </button>
            </div>
        </div>
    `).join('')
    
    // 为录音列表添加事件委托
    addRecordingListEventListeners()
}

// 通过 ID 播放录音（用于 onclick 事件）
function playRecordingById(recordingId: number): void {
    const recording = recordings.find((r: Recording): boolean => r.id === recordingId)
    if (recording) {
        playRecording(recording)
    }
}

// 下载录音文件
function downloadRecording(recordingId: number): void {
    const recording = recordings.find((r: Recording): boolean => r.id === recordingId)
    if (recording) {
        const a = document.createElement('a')
        a.href = recording.url
        a.download = `${recording.name}.webm`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        
        updateStatus(`已保存: ${recording.name}`)
    }
}

// 删除录音文件
function deleteRecording(recordingId: number): void {
    const index = recordings.findIndex((r: Recording): boolean => r.id === recordingId)
    if (index !== -1) {
        const recording = recordings[index]
        URL.revokeObjectURL(recording.url)
        recordings.splice(index, 1)
        updateRecordingsList()
        
        updateStatus(`已删除: ${recording.name}`)
        
        // 如果删除的是最后一个录音，禁用播放按钮
        if (recordings.length === 0) {
            playRecordBtn.disabled = true
        }
    }
}

// 音频可视化
function visualizeAudio(): void {
    if (!analyser || !dataArray) return
    
    const canvas = visualizer
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    
    const width = canvas.width
    const height = canvas.height
    
    function draw(): void {
        if (!analyser || !dataArray || !ctx) return
        
        animationId = requestAnimationFrame(draw)
        
        analyser.getByteFrequencyData(dataArray)
        
        // 清空画布
        ctx.fillStyle = '#f8f9fa'
        ctx.fillRect(0, 0, width, height)
        
        // 绘制频谱
        const barWidth = width / dataArray.length * 2.5
        let x = 0
        
        for (let i = 0; i < dataArray.length; i++) {
            const barHeight = (dataArray[i] / 255) * height * 0.8
            
            // 创建渐变色
            const gradient = ctx.createLinearGradient(0, height - barHeight, 0, height)
            gradient.addColorStop(0, '#667eea')
            gradient.addColorStop(1, '#764ba2')
            
            ctx.fillStyle = gradient
            ctx.fillRect(x, height - barHeight, barWidth, barHeight)
            
            x += barWidth + 1
            
            if (x >= width) break
        }
    }
    
    draw()
}

// 不再需要全局函数，使用事件委托处理

// 页面加载完成后初始化应用
document.addEventListener('DOMContentLoaded', initApp)

// 清理资源
window.addEventListener('beforeunload', (): void => {
    if (audioStream) {
        audioStream.getTracks().forEach((track: MediaStreamTrack): void => track.stop())
    }
    if (audioContext && audioContext.state !== 'closed') {
        audioContext.close().catch(console.error)
    }
    if (animationId) {
        cancelAnimationFrame(animationId)
    }
    
    // 清理所有录音 URL
    recordings.forEach((recording: Recording): void => {
        URL.revokeObjectURL(recording.url)
    })
}) 