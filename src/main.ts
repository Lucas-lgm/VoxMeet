import { app, BrowserWindow, Menu, ipcMain } from 'electron'
import * as path from 'path'

// 保持对窗口对象的全局引用，如果不这么做的话，当JavaScript对象被垃圾回收的时候，窗口会被自动地关闭
let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  // 创建浏览器窗口
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 700,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      webSecurity: true
    },
    icon: path.join(__dirname, 'assets/icon.png'), // 可选：应用图标
    show: false // 先不显示，等加载完成后再显示
  })

  // 加载应用的 index.html
  mainWindow.loadFile(path.join(__dirname, '../src/index.html'))

  // 当窗口加载完成后显示
  mainWindow.once('ready-to-show', (): void => {
    if (mainWindow) {
      mainWindow.show()
    }
  })

  // 当窗口被关闭时触发
  mainWindow.on('closed', (): void => {
    // 取消引用 window 对象，如果你的应用支持多窗口的话，
    // 通常会把多个 window 对象存放在一个数组里面，
    // 与此同时，你应该删除相应的元素。
    mainWindow = null
  })

  // 开发模式配置
  const isDev = process.argv.includes('--dev') || process.env.NODE_ENV === 'development'
  
  if (isDev) {
    // 打开开发者工具
    mainWindow.webContents.openDevTools()
    
    // 开发模式下启用实时重载
    mainWindow.webContents.on('before-input-event', (event, input) => {
      if (input.control && input.key.toLowerCase() === 'r') {
        mainWindow?.reload()
      }
      if (input.key === 'F12') {
        mainWindow?.webContents.toggleDevTools()
      }
    })
    
    // 开发模式下的错误处理
    mainWindow.webContents.on('crashed', () => {
      console.log('渲染进程崩溃，重新加载...')
      mainWindow?.reload()
    })
    
    console.log('🚀 开发模式已启动')
    console.log('快捷键: Ctrl+R 重新加载, F12 切换开发者工具')
  }
}

// Electron 会在初始化后并准备创建浏览器窗口时，调用这个函数。
// 部分 API 在 ready 事件触发后才能使用。
app.whenReady().then(() => {
  createWindow()
})

// 当全部窗口关闭时退出
app.on('window-all-closed', (): void => {
  // 在 macOS 上，除非用户用 Cmd + Q 确定地退出，
  // 否则绝大部分应用及其菜单栏会保持激活。
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', (): void => {
  // 在macOS上，当单击dock图标并且没有其他窗口打开时，
  // 通常在应用程序中重新创建一个窗口。
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

// 在这个文件中，你可以续写应用剩下主进程代码。
// 也可以拆分成几个文件，然后用 import 导入。

// IPC 通信示例
ipcMain.handle('get-app-version', (): string => {
  return app.getVersion()
}) 