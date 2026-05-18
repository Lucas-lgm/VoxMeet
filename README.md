# VoxMeet

[![License: ISC](https://img.shields.io/badge/License-ISC-blue.svg)](LICENSE)
[![macOS](https://img.shields.io/badge/macOS-14+-brightgreen)](https://www.apple.com/macos)
[![Electron](https://img.shields.io/badge/Electron-28+-blueviolet)](https://www.electronjs.org/)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen)](https://github.com/Lucas-lgm/VoxMeet/pulls)
[![Website](https://img.shields.io/badge/Website-VoxMeet-0a84ff)](https://lucas-lgm.github.io/VoxMeet/)

Record meetings and voice conversations on macOS, get instant transcripts powered by local Whisper, and generate AI summaries with your own API provider.

> 🌐 [lucas-lgm.github.io/VoxMeet](https://lucas-lgm.github.io/VoxMeet/) — project landing page

## Why this tool

Voice meetings are everywhere — work calls, interviews, lectures, voice memos. Manually taking notes is slow, and cloud transcription services add up fast.

This app records **both system audio and microphone** with echo cancellation, transcribes locally via Whisper.cpp (no usage fees, private, offline), and sends the transcript to any LLM provider you configure for summaries.

## Demo

<video src="https://github.com/Lucas-lgm/VoxMeet/raw/main/docs/demo.mp4" controls style="width:100%;max-width:800px;border-radius:12px"></video>

## Features

- **macOS System Audio Capture** — Records system output and microphone simultaneously via Core Audio Aggregate Device + Audio Tap. No virtual audio drivers needed.
- **Acoustic Echo Cancellation** — WebRTC AEC removes echo from the mic channel during calls, so far-end speech doesn't bleed into your recording.
- **Local Whisper Transcription** — Runs entirely on-device via Whisper.cpp. No API calls, no per-minute fees, no data leaving your machine.
- **Custom AI Summary Provider** — Bring your own LLM key (OpenAI, Claude, or any OpenAI-compatible API). No vendor lock-in, no bundled subscription.
- **Rich Text Editor** — Tiptap-based WYSIWYG with headings, lists, images, and markdown export.
- **Meeting History** — Local file-based storage with playback and editing.

## Quick Start

```bash
npm install
npm run rebuild:native       # Build C++ native module
npm run dev                  # Compile TS + C++, launch Electron with DevTools
```

Requires macOS 14+, Node.js 18+, Python 3, and Xcode Command Line Tools.

## Usage

1. Launch the app — the tray icon appears in the menu bar
2. Click the tray icon or press the global shortcut to open the recording popup
3. Start/pause/stop recording — saved to `~/Documents/MeetingNotes/`
4. Open the main window from the tray menu to view transcripts and summaries
5. Configure AI provider, Whisper models, and language in Settings

## Architecture

### Data Flow

```
Microphone ──→ Core Audio IOProc ──→ AEC ──→ echo-cancelled mic ─┐
                                        ↑                        ├→ Mixer ─→ 48kHz WAV (archive)
                                        │                        │         │
System audio ──────────────────────────┘ (far-end reference) ────┘         └→ Resampler → 16kHz WAV
                                                                               (48kHz → 16kHz)

Post-recording:
  16kHz WAV → whisper.cpp → transcription → AI API → meeting summary
```

### Stack

- **Native:** C++ (node-gyp), Core Audio, WebRTC Audio Processing v2.1
- **Main process:** Electron 28+, TypeScript
- **Renderer:** Vue 3 (Composition API + `<script setup>`), vue-i18n, Tiptap
- **Transcription:** Whisper.cpp (local, offline)
- **Build:** Webpack (renderer), tsc (main), node-gyp (native)

## Build

```bash
npm run build          # Everything
npm run build:native   # C++ module only
npm run build:main     # TypeScript only
npm run build:renderer # Webpack only
npm run clean:native   # Clean native build artifacts
```

## Internationalization

English and Simplified Chinese supported. Auto-detected from system locale; change in **Settings → Language**. Add a new language by creating a locale JSON file and registering it in `i18n.ts`.
