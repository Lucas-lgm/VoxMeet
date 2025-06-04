# 🚀 开发者指南

欢迎参与录音应用的开发！这份指南将帮助你快速上手。

## 快速开始

```bash
# 克隆项目后
npm install          # 安装依赖
npm run dev          # 启动开发模式
```

## 🔧 开发模式

开发模式提供了最佳的开发体验：

### 启动开发模式
```bash
npm run dev
```

### 开发模式特性
- ✅ **自动重启**: 代码变化时自动重新编译并重启应用
- ✅ **开发者工具**: 自动打开 Chrome DevTools
- ✅ **热重载**: 无需手动重启
- ✅ **视觉指示**: 
  - 顶部彩色渐变条
  - 右上角 "DEV MODE" 标识
  - 标题显示 "[DEV]" 后缀
- ✅ **快捷键支持**:
  - `Ctrl+R`: 重新加载页面
  - `F12`: 切换开发者工具
  - `Ctrl+Shift+R`: 强制刷新

## 📁 项目结构

```
src/
├── main.ts          # 主进程（Node.js 环境）
├── preload.ts       # Preload 脚本（安全桥接）
├── renderer.ts      # 渲染进程（浏览器环境）
├── index.html       # UI 界面
├── styles.css       # 样式文件
└── types/
    └── global.d.ts  # 类型定义

dist/                # 编译输出
├── main.js
├── preload.js
└── renderer.js
```

## 🔒 安全架构

本项目遵循 Electron 安全最佳实践：

### 主要原则
- ❌ **渲染进程禁用 Node.js 集成**
- ✅ **启用上下文隔离**
- ✅ **使用 preload 脚本安全暴露 API**
- ✅ **严格的 CSP 策略**

### 如何添加新的 API

1. **在 preload.ts 中定义**:
```typescript
const electronAPI = {
  // 现有 API
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  
  // 新 API
  newFunction: (data: any) => ipcRenderer.invoke('new-function', data),
}
```

2. **在 main.ts 中处理**:
```typescript
ipcMain.handle('new-function', (event, data) => {
  // 处理逻辑
  return result
})
```

3. **在 global.d.ts 中添加类型**:
```typescript
interface Window {
  electronAPI: {
    getAppVersion: () => Promise<string>;
    newFunction: (data: any) => Promise<any>; // 新类型
  };
}
```

## 🛠️ 常用开发命令

```bash
# 开发
npm run dev                # 启动开发模式
npm run build:watch        # 只监视编译（不启动应用）

# 构建
npm run build              # 完整构建
npm run build:main         # 只构建主进程
npm run build:renderer     # 只构建渲染进程

# 清理
npm run clean              # 清理编译输出

# 生产
npm start                  # 构建并启动
npm run package            # 打包应用
```

## 🎯 开发技巧

### 调试技巧
1. **主进程调试**: 使用 `console.log()` 在终端查看
2. **渲染进程调试**: 使用开发者工具的 Console 面板
3. **网络请求**: 在 Network 面板查看
4. **性能分析**: 使用 Performance 面板

### 代码规范
- 使用 TypeScript 严格模式
- 优先使用 `const`，必要时使用 `let`
- 函数应该有明确的返回类型注解
- 处理所有可能的错误情况

### 测试建议
- 测试不同的音频格式支持
- 验证麦克风权限处理
- 检查文件保存功能
- 测试长时间录音的性能

## 🐛 常见问题

### Q: 为什么修改代码后没有自动重启？
A: 确保使用 `npm run dev` 而不是 `npm start`。

### Q: 如何添加新的录音格式？
A: 修改 `renderer.ts` 中的 `MediaRecorder` 配置。

### Q: 如何修改界面样式？
A: 编辑 `src/styles.css` 文件，开发模式下会自动重载。

### Q: 如何访问文件系统？
A: 不能在渲染进程直接访问，需要通过 preload 脚本和主进程。

## 📚 相关文档

- [Electron 官方文档](https://www.electronjs.org/docs)
- [TypeScript 手册](https://www.typescriptlang.org/docs/)
- [Web Audio API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API)
- [MediaRecorder API](https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder)

## 🤝 贡献指南

1. Fork 项目
2. 创建功能分支 (`git checkout -b feature/amazing-feature`)
3. 提交更改 (`git commit -m 'Add some amazing feature'`)
4. 推送分支 (`git push origin feature/amazing-feature`)
5. 创建 Pull Request

---

Happy Coding! 🎉 