# 录音应用

一个基于 Electron 构建的现代化录音应用，具有美观的界面和强大的功能。

## ✨ 功能特性

- 🎤 **高质量录音**: 支持高质量音频录制
- 🎵 **实时音频可视化**: 录音时的实时频谱显示
- ⏱️ **录音计时**: 实时显示录音时长
- 📱 **现代化界面**: 美观的渐变设计和响应式布局
- 💾 **录音管理**: 播放、保存和删除录音文件
- 🔊 **音频播放**: 内置音频播放器
- 📋 **录音列表**: 管理所有录音文件
- 🛡️ **类型安全**: 使用 TypeScript 提供完整的类型检查
- 🔍 **智能提示**: 完整的 IDE 支持和代码提示
- 🔒 **安全架构**: 
  - 禁用渲染进程中的 Node.js 集成
  - 启用上下文隔离 (Context Isolation)
  - 使用 preload 脚本安全暴露 API
  - 配置严格的内容安全策略 (CSP)

## 🚀 快速开始

### 环境要求

- Node.js 16.0 或更高版本
- npm 或 yarn 包管理器

### 安装步骤

1. **克隆项目**（如果从 Git 仓库克隆）
   ```bash
   git clone <repository-url>
   cd recorder-app
   ```

2. **安装依赖**
   ```bash
   npm install
   ```

3. **开发模式（推荐）**
   ```bash
   npm run dev
   ```
   
   这是开发时推荐的方式，支持热重载和自动重启。

4. **生产模式构建和运行**
   ```bash
   npm run build    # 编译 TypeScript
   npm start        # 启动应用
   ```

### 🚀 开发模式

应用提供了友好的开发体验，支持热重载和自动重启：

**启动开发模式**:
```bash
npm run dev
```

这将：
1. 编译 TypeScript 代码
2. 启动文件监视器
3. 启动 Electron 应用（开发模式）
4. 当文件改变时自动重新编译并重启应用

**开发模式特性**:
- 🔄 **热重载**: 代码变化时自动重启应用
- 🛠️ **开发者工具**: 自动打开 DevTools
- 🎨 **视觉指示**: 顶部彩色渐变条表示开发模式
- ⌨️ **快捷键支持**: 
  - `Ctrl+R`: 重新加载页面
  - `F12`: 切换开发者工具
  - `Ctrl+Shift+R`: 强制刷新
- 📊 **开发信息**: 右上角显示 "🔧 DEV MODE" 标识

### TypeScript 开发

应用使用了双配置文件的 TypeScript 设置：
- `tsconfig.json` - 主进程 (CommonJS 模块)
- `tsconfig.renderer.json` - 渲染进程 (ES6 模块)

**分别编译**:
```bash
npm run build:main      # 编译主进程
npm run build:renderer  # 编译渲染进程
npm run build          # 编译所有文件
```

**实时编译监视**:
```bash
npm run build:watch
```

**清理编译文件**:
```bash
npm run clean
```

### 📝 可用脚本

| 脚本 | 描述 |
|------|------|
| `npm run dev` | 开发模式 - 热重载，自动重启 |
| `npm run build` | 编译所有 TypeScript 文件 |
| `npm run build:main` | 只编译主进程 |
| `npm run build:renderer` | 只编译渲染进程 |
| `npm run build:watch` | 监视模式编译 |
| `npm start` | 构建并启动应用（生产模式） |
| `npm run start:prod` | 直接启动应用（需要先构建） |
| `npm run clean` | 清理编译输出目录 |
| `npm run package` | 构建可分发的应用程序 |

### 构建应用

要构建可分发的应用程序：

```bash
npm run package
```

构建完成后，可执行文件将在 `dist-packages` 目录中生成。

## 🎯 使用说明

### 基本操作

1. **开始录音**: 点击"开始录音"按钮，应用会请求麦克风权限
2. **停止录音**: 点击"停止录音"按钮结束录制
3. **播放录音**: 点击"播放录音"按钮播放最近的录音
4. **管理录音**: 在录音列表中可以播放、保存或删除具体的录音文件

### 界面说明

- **头部区域**: 显示应用标题和版本信息
- **录音控制区**: 录音、停止、播放按钮
- **状态显示区**: 显示当前状态和录音时间
- **音频可视化**: 实时显示音频频谱
- **录音列表**: 显示所有录音文件及操作按钮

### 快捷键

- `空格键`: 开始/停止录音（计划中的功能）

## 🛠️ 技术栈

- **Electron**: 跨平台桌面应用框架
- **TypeScript**: 类型安全的 JavaScript 超集
- **Web Audio API**: 音频处理和可视化
- **MediaRecorder API**: 音频录制
- **HTML5 Canvas**: 音频频谱可视化
- **CSS3**: 现代化样式和动画效果

## 🔒 安全架构

本应用遵循 Electron 安全最佳实践：

### 主要安全特性

1. **Context Isolation（上下文隔离）**: 启用以防止渲染进程访问主进程 API
2. **Node Integration 禁用**: 渲染进程中禁用 Node.js 集成
3. **Preload 脚本**: 通过 `contextBridge` 安全暴露必要的 API
4. **Content Security Policy**: 严格的 CSP 防止 XSS 攻击
5. **Web Security**: 启用 Web 安全特性

### CSP 配置详解

```html
<meta http-equiv="Content-Security-Policy" content="
    default-src 'self';          <!-- 默认只允许同源资源 -->
    script-src 'self';           <!-- 只允许同源脚本 -->
    style-src 'self' 'unsafe-inline'; <!-- 允许内联样式 -->
    img-src 'self' data: blob:;  <!-- 允许图片和 blob URL -->
    media-src 'self' blob:;      <!-- 允许媒体和 blob URL -->
    connect-src 'self';          <!-- 只允许同源连接 -->
    font-src 'self';             <!-- 只允许同源字体 -->
    object-src 'none';           <!-- 禁止 object/embed -->
    base-uri 'self';             <!-- 限制 base URI -->
    form-action 'none';          <!-- 禁止表单提交 -->
">
```

## 📁 项目结构

```
recorder-app/
├── src/
│   ├── main.ts          # Electron 主进程 (TypeScript)
│   ├── preload.ts       # Preload 脚本 (TypeScript)
│   ├── renderer.ts      # 渲染进程逻辑 (TypeScript)
│   ├── index.html       # 应用主界面
│   ├── styles.css       # 样式文件
│   └── types/
│       └── global.d.ts  # 全局类型定义
├── dist/                # TypeScript 编译输出
│   ├── main.js          # 编译后的主进程
│   ├── preload.js       # 编译后的 preload 脚本
│   └── renderer.js      # 编译后的渲染进程
├── tsconfig.json        # 主进程 TypeScript 配置
├── tsconfig.renderer.json # 渲染进程 TypeScript 配置
├── package.json         # 项目配置
└── README.md           # 项目说明
```

## 🔧 配置说明

### 录音设置

应用默认使用以下音频设置：

- 采样率: 44100 Hz
- 编码格式: WebM/Opus
- 回声消除: 启用
- 噪声抑制: 启用

### 自定义配置

您可以在 `src/renderer.js` 中修改录音参数：

```javascript
const audioConstraints = {
    audio: {
        echoCancellation: true,
        noiseSuppression: true,
        sampleRate: 44100
    }
}
```

## 🐛 故障排除

### 常见问题

1. **麦克风权限被拒绝**
   - 确保在浏览器或系统设置中允许麦克风访问
   - 重启应用后重新授权

2. **录音无声音**
   - 检查麦克风是否正常工作
   - 确认系统音频设置
   - 尝试更换不同的音频输入设备

3. **应用启动失败**
   - 确认 Node.js 版本满足要求
   - 重新安装依赖: `npm install`
   - 检查是否有端口冲突

4. **TypeScript 编译错误**
   - 确保所有类型定义文件存在
   - 重新编译: `npm run build`
   - 清理并重新编译: `rm -rf dist && npm run build`

5. **模块加载错误**
   - 确保 webPreferences 配置正确
   - 检查 Node.js 集成是否启用
   - 验证编译输出文件路径

### 调试模式

启动开发模式时会自动打开开发者工具：
```bash
npm run dev
```

## 📚 项目文档

- 📖 **[开发者指南](DEVELOPMENT.md)** - 详细的开发环境设置和 API 说明
- 🛠️ **[故障排除指南](TROUBLESHOOTING.md)** - 常见问题和解决方案，包括今天解决的 `process is not defined` 错误

## 📄 许可证

ISC License

## 🤝 贡献指南

欢迎提交 Issue 和 Pull Request！

---

**注意**: 首次运行时，应用会请求麦克风权限，请确保允许访问以正常使用录音功能。 