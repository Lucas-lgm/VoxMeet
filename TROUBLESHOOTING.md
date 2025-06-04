# 🛠️ 故障排除指南

本文档记录了开发过程中可能遇到的常见问题及其解决方案。

## 🚨 常见错误

### ❌ `process is not defined`

**错误信息**:
```
ReferenceError: process is not defined
    at isDevelopment (renderer.ts:49:5)
    at HTMLDocument.initApp (renderer.ts:99:27)
```

**问题原因**:
在渲染进程中使用了 `process` 对象，但由于安全原因已禁用 Node.js 集成。

**解决方案**:
1. ✅ **不要在渲染进程中直接使用 Node.js API**
2. ✅ **通过 preload 脚本安全暴露必要的信息**
3. ✅ **使用 contextBridge 进行安全通信**

**修复步骤**:
```typescript
// ❌ 错误方式 - 在渲染进程中直接使用 process
const isDev = process.env.NODE_ENV === 'development'

// ✅ 正确方式 - 通过 preload 脚本暴露
// preload.ts
const electronAPI = {
  isDevelopment: () => process.argv.includes('--dev')
}
contextBridge.exposeInMainWorld('electronAPI', electronAPI)

// renderer.ts
const isDev = window.electronAPI.isDevelopment()
```

### ❌ CSP 违规错误

**错误信息**:
```
Refused to execute inline script because it violates the following Content Security Policy directive
```

**解决方案**:
1. 移除内联事件处理器 (`onclick`, `onload` 等)
2. 使用事件委托
3. 将所有脚本放在外部文件中

### ❌ 麦克风权限被拒绝

**错误信息**:
```
NotAllowedError: Permission denied
```

**解决方案**:
1. 检查系统麦克风权限设置
2. 确保应用有麦克风访问权限
3. 在浏览器设置中允许麦克风访问

### ❌ 模块加载失败

**错误信息**:
```
Cannot resolve module 'electron'
```

**解决方案**:
1. 确保在正确的环境中使用 Electron API
2. 主进程和 preload 脚本可以使用 Electron API
3. 渲染进程只能通过 contextBridge 使用

## 🔧 开发模式问题

### 问题：修改代码后应用没有自动重启

**可能原因**:
1. 使用了 `npm start` 而不是 `npm run dev`
2. TypeScript 编译错误
3. 文件监视器未正常工作

**解决步骤**:
```bash
# 1. 确保使用开发模式
npm run dev

# 2. 如果仍有问题，清理并重新编译
npm run clean
npm run build
npm run dev

# 3. 检查 TypeScript 编译错误
npm run build:watch
```

### 问题：开发者工具没有自动打开

**解决方案**:
1. 确保使用 `--dev` 参数启动
2. 手动按 `F12` 打开开发者工具
3. 检查主进程代码中的 `openDevTools()` 调用

### 问题：开发模式样式没有显示

**检查项目**:
1. 确认 `isDevelopment()` 函数返回 `true`
2. 检查控制台是否有 CSS 加载错误
3. 验证开发模式检测逻辑

## 🔒 安全相关问题

### 问题：无法访问文件系统

**正确做法**:
```typescript
// ❌ 错误 - 渲染进程直接访问
const fs = require('fs')

// ✅ 正确 - 通过 IPC 通信
// preload.ts
const electronAPI = {
  readFile: (path: string) => ipcRenderer.invoke('read-file', path)
}

// main.ts
ipcMain.handle('read-file', async (event, path) => {
  return await fs.readFile(path, 'utf8')
})
```

### 问题：CSP 阻止资源加载

**解决方案**:
1. 检查 CSP 配置是否过于严格
2. 确保所有资源都从允许的来源加载
3. 避免使用内联脚本和样式

## 🎵 音频相关问题

### 问题：录音格式不支持

**解决方案**:
```typescript
const supportedTypes = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/ogg;codecs=opus',
  'audio/mp4'
]

for (const type of supportedTypes) {
  if (MediaRecorder.isTypeSupported(type)) {
    // 使用此格式
    break
  }
}
```

### 问题：音频可视化不工作

**检查项目**:
1. 确认麦克风权限已获取
2. 检查 AudioContext 是否正确创建
3. 验证 Canvas 元素是否存在

## 🚀 性能优化

### 长时间录音导致内存问题

**解决方案**:
1. 定期清理 audioChunks
2. 实现分段录音
3. 限制最大录音时长

### 音频可视化性能问题

**优化方法**:
1. 降低 fftSize
2. 使用 requestAnimationFrame 限制刷新率
3. 在不需要时停止可视化

## 📚 调试技巧

### 主进程调试
```bash
# 启动时查看主进程日志
npm run dev
```

### 渲染进程调试
1. 使用开发者工具 Console 面板
2. 在 Sources 面板设置断点
3. 使用 Network 面板查看资源加载

### IPC 通信调试
```typescript
// 在主进程中添加日志
ipcMain.handle('some-event', (event, data) => {
  console.log('收到 IPC 消息:', data)
  // 处理逻辑
})

// 在渲染进程中添加日志
const result = await window.electronAPI.someMethod(data)
console.log('IPC 响应:', result)
```

## 🤝 获取帮助

如果以上解决方案都无法解决你的问题：

1. **检查控制台**: 查看详细的错误信息
2. **查看文档**: 阅读 `DEVELOPMENT.md` 和 `README.md`
3. **搜索问题**: 在 GitHub Issues 中搜索类似问题
4. **重新初始化**: 删除 `node_modules` 和 `dist`，重新安装依赖

---

**记住**: 大多数问题都与 Electron 的安全模型相关。当遇到问题时，首先考虑是否违反了安全原则。 