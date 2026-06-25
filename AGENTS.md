# AGENTS.md

This file provides guidance to AI coding assistants working with code in this repository.

## Development Commands

**Prerequisites:**

- [Rust](https://rustup.rs/) (latest stable)
- [Bun](https://bun.sh/) package manager

**Core Development:**

```bash
# Install dependencies
bun install

# Run in development mode
bun run tauri dev
# If cmake error on macOS:
CMAKE_POLICY_VERSION_MINIMUM=3.5 bun run tauri dev

# Build for production
bun run tauri build

# Frontend only development
bun run dev        # Start Vite dev server
bun run build      # Build frontend (TypeScript + Vite)
bun run preview    # Preview built frontend
```

**Linting, Formatting, and Testing (run before committing):**

```bash
bun run lint              # ESLint for frontend
bun run lint:fix          # ESLint with auto-fix
bun run format            # Prettier + cargo fmt
bun run format:check      # Check formatting without changes
bun run format:frontend   # Prettier only
bun run format:backend    # cargo fmt only
bun run test:playwright   # Playwright E2E tests
bun run test:playwright:ui # Playwright UI mode
bun run check:translations # Validate i18n translation keys
```

**Model Setup (Required for Development):**

```bash
mkdir -p src-tauri/resources/models
curl -o src-tauri/resources/models/silero_vad_v4.onnx https://blob.handy.computer/silero_vad_v4.onnx
```

For detailed platform-specific build setup, see [BUILD.md](BUILD.md).

## Architecture Overview

Handy is a cross-platform desktop speech-to-text application built with Tauri 2.x (Rust backend + React/TypeScript frontend).

### Backend Structure (src-tauri/src/)

- `lib.rs` - Main entry point, Tauri setup, manager initialization
- `main.rs` - CLI parsing and app startup
- `managers/` - Core business logic:
  - `mod.rs` - Module entry (exports audio, history, model, transcription)
  - `audio.rs` - Audio recording and device management
  - `model.rs` - Model downloading and management
  - `transcription.rs` - Speech-to-text processing pipeline
  - `transcription_mock.rs` - CI-only mock TranscriptionManager
  - `history.rs` - Transcription history storage
- `audio_toolkit/` - Low-level audio processing:
  - `mod.rs` - Module entry (exposes audio, constants, text, utils, vad)
  - `constants.rs` - Audio constants
  - `text.rs` - Text processing (custom words, output filtering)
  - `utils.rs` - CPAL host utilities
  - `audio/` - Device enumeration, recording, resampling, decoding, visualization
  - `vad/` - Voice Activity Detection (Silero VAD, smoothed VAD)
- `commands/` - Tauri command handlers for frontend communication:
  - `mod.rs` - Module entry (audio, audio_upload, history, models, transcription + core)
  - `audio.rs` - Audio commands (mic, output device, permission status, clamshell mic)
  - `audio_upload.rs` - Audio file upload command
  - `history.rs` - History commands (entries, saved toggle, delete, retry, retention)
  - `models.rs` - Model commands (available, download, delete, switch, status)
  - `transcription.rs` - Transcription commands (model unload, summarize, test connection)
- `cli.rs` - CLI argument definitions (clap derive)
- `shortcut/` - Global keyboard shortcut handling:
  - `mod.rs` - Module entry
  - `handler.rs` - Shortcut event handler
  - `tauri_impl.rs` - Tauri-specific shortcut implementation
  - `handy_keys.rs` - HandyKeys recording integration
- `transcription_coordinator.rs` - Serializes all transcription lifecycle events
- `actions.rs` - Main transcription action pipeline (orchestrates recording, VAD, paste)
- `llm_client.rs` - LLM client for post-processing (OpenAI-compatible API)
- `apple_intelligence.rs` - Apple Intelligence bridge (macOS aarch64 FFI to Swift)
- `clipboard.rs` - Clipboard paste handling with Wayland support
- `input.rs` - Enigo wrapper, cursor position, paste key codes
- `audio_feedback.rs` - Audio feedback sound playback (start/stop sounds, themes)
- `portable.rs` - Portable mode support (marker file detection, data dir)
- `tray.rs` - System tray icon management, menu, theme-aware icons
- `tray_i18n.rs` - Tray menu internationalization (auto-generated from locale files)
- `settings.rs` - Application settings management
- `overlay.rs` - Recording overlay window (platform-specific)
- `signal_handle.rs` - `send_transcription_input()` reusable function
- `helpers/` - Utility helpers:
  - `mod.rs` - Module entry
  - `clamshell.rs` - MacBook clamshell mode detection
- `utils.rs` - Platform detection helpers

### macOS Swift Bridge (src-tauri/swift/)

- `apple_intelligence.swift` - Apple Intelligence Swift bridge
- `apple_intelligence_stub.swift` - Stub for systems without FoundationModels
- `apple_intelligence_bridge.h` - C bridge header for Swift-Rust FFI

### Build Script (src-tauri/build.rs)

Generates tray menu translations from frontend locale files, builds Apple Intelligence Swift bridge (macOS aarch64 only), handles FoundationModels framework detection.

### Resources (src-tauri/resources/)

- Tray icons: `tray_idle.png`, `tray_recording.png`, `tray_transcribing.png` (+ `_dark.png` variants)
- Overlay icons: `recording.png`, `transcribing.png`
- Sounds: `pop_start.wav`, `pop_stop.wav`, `marimba_start.wav`, `marimba_stop.wav`
- VAD model: `models/silero_vad_v4.onnx`
- Model vocab: `models/gigaam_vocab.txt`
- Default settings: `default_settings.json`

### Frontend Structure (src/)

- `App.tsx` - Main component with sidebar navigation and onboarding flow
- `components/` - React UI components:
  - `Sidebar.tsx` - Sidebar navigation with sections (general, summary, history, post-processing, models, advanced, debug, about)
  - `AccessibilityPermissions.tsx` - macOS accessibility permission UI
  - `settings/` - Settings UI (45+ components organized by section):
    - `general/` - General settings, model settings
    - `history/` - History settings
    - `summary/` - Transcription summarization settings
    - `post-processing/` - Post-processing settings
    - `PostProcessingSettingsApi/` - Post-processing API config
    - `models/` - Model settings
    - `advanced/` - Advanced settings
    - `debug/` - Debug settings (log viewer, log level, paste delay, etc.)
  - `model-selector/` - Model management interface
  - `onboarding/` - First-run experience
  - `update-checker/` - App update notifications
  - `shared/`, `ui/`, `icons/`, `footer/` - Shared components
- `hooks/useSettings.ts` - Settings state management hook
- `hooks/useOsType.ts` - OS type hook for keyboard handling
- `stores/settingsStore.ts` - Zustand store for settings
- `stores/modelStore.ts` - Zustand store for model management (download progress, state)
- `bindings.ts` - Auto-generated Tauri type bindings (via tauri-specta)
- `overlay/` - Recording overlay window entry point
- `lib/types/events.ts` - Event type definitions
- `lib/utils/` - Utilities (format, keyboard, modelTranslation, rtl)
- `lib/constants/languages.ts` - Language constants
- `utils/dateFormat.ts` - Date formatting utilities

### Key Architecture Patterns

**Manager Pattern:** Core functionality organized into managers (Audio, Model, Transcription) initialized at startup and managed via Tauri state.

**Command-Event Architecture:** Frontend → Backend via Tauri commands; Backend → Frontend via events.

**Pipeline Processing:** Audio → VAD → Whisper/Parakeet → Text output → Clipboard/Paste

**State Flow:** Zustand → Tauri Command → Rust State → Persistence (tauri-plugin-store)

**TranscriptionCoordinator:** Single-threaded coordinator that serializes all transcription lifecycle events, eliminating race conditions between keyboard shortcuts, signals, and the async pipeline.

**Post-Processing/LLM Pipeline:** Optional post-processing of transcriptions using OpenAI-compatible LLM APIs for summarization and enhancement.

**Apple Intelligence Integration:** macOS aarch64-only integration via Swift FFI bridge (compiled at build time via build.rs) for system prompt processing.

**Portable Mode:** Support for running Handy from a portable directory alongside the executable with marker file detection.

### Technology Stack

**Core Libraries:**

- `transcribe-rs` - Local Whisper inference with GPU acceleration (onnx, vulkan, metal)
- `cpal` - Cross-platform audio I/O
- `vad-rs` - Voice Activity Detection (custom fork)
- `rdev` - Global keyboard shortcuts
- `enigo` - Keyboard/mouse simulation for paste
- `rubato` - Audio resampling
- `rodio` - Audio playback for feedback sounds
- `handy-keys` - HandyKeys push-to-talk integration
- `ferrous-opencc` - Traditional Chinese conversion
- `rusqlite` - SQLite database for history storage
- `reqwest` - HTTP client for LLM API calls

### Application Flow

1. **Initialization:** App starts minimized to tray, loads settings, initializes managers
2. **Model Setup:** First-run downloads preferred Whisper model (Small/Medium/Turbo/Large)
3. **Recording:** Global shortcut triggers audio recording with VAD filtering
4. **Processing:** Audio sent to Whisper model for transcription
5. **Output:** Text pasted to active application via system clipboard

### Settings System

Settings are stored using Tauri's store plugin with reactive updates:

- Keyboard shortcuts (configurable, supports push-to-talk)
- Audio devices (microphone/output selection)
- Model preferences (Small/Medium/Turbo/Large Whisper variants)
- Audio feedback and translation options
- Post-processing (LLM API config, custom prompts)
- Debug settings (log level, paste delay, recording buffer, word correction threshold)
- Advanced options (custom words, typing tools, sound themes, experimental features)

### Single Instance Architecture

The app enforces single instance behavior — launching when already running brings the settings window to front rather than creating a new process. Remote control flags (`--toggle-transcription`, etc.) work by launching a second instance that sends args to the running instance via `tauri_plugin_single_instance`, then exits.

## Internationalization (i18n)

All user-facing strings must use i18next translations. ESLint enforces this (no hardcoded strings in JSX).

**Adding new text:**

1. Add key to `src/i18n/locales/en/translation.json`
2. Use in component: `const { t } = useTranslation(); t('key.path')`

**File structure:**

```
src/i18n/
├── index.ts           # i18n setup
├── languages.ts       # Language metadata
└── locales/
    ├── en/translation.json  # English (source)
    ├── ar, bg, cs, de, es, fr, he, it, ja, ko, pl, pt, ru, sv, tr, uk, vi, zh-TW, zh
    └── ...
```

For translation contribution guidelines, see [CONTRIBUTING_TRANSLATIONS.md](CONTRIBUTING_TRANSLATIONS.md).

## Code Style

**Rust:**

- Run `cargo fmt` and `cargo clippy` before committing
- Handle errors explicitly (avoid unwrap in production)
- Use descriptive names, add doc comments for public APIs

**TypeScript/React:**

- Strict TypeScript, avoid `any` types
- Functional components with hooks
- Tailwind CSS for styling
- Path aliases: `@/` → `./src/`

## CLI Parameters

Handy supports command-line parameters on all platforms for integration with scripts, window managers, and autostart configurations.

**Implementation:** `cli.rs` (definitions), `main.rs` (parsing), `lib.rs` (applying), `signal_handle.rs` (shared logic)

| Flag                     | Description                                                |
| ------------------------ | ---------------------------------------------------------- |
| `--toggle-transcription` | Toggle recording on/off on a running instance              |
| `--toggle-post-process`  | Toggle recording with post-processing on/off               |
| `--cancel`               | Cancel the current operation on a running instance         |
| `--start-hidden`         | Launch without showing the main window (tray icon visible) |
| `--no-tray`              | Launch without system tray (closing window quits the app)  |
| `--debug`                | Enable debug mode with verbose (Trace) logging             |

**Key design decisions:**

- CLI flags are runtime-only overrides — they do NOT modify persisted settings
- Remote control flags work via `tauri_plugin_single_instance`: second instance sends args, then exits
- `send_transcription_input()` in `signal_handle.rs` is shared between signal handlers and CLI

## Debug Mode

Access debug features: `Cmd+Shift+D` (macOS) or `Ctrl+Shift+D` (Windows/Linux)

## Platform Notes

- **macOS**: Metal acceleration, accessibility permissions required for keyboard shortcuts
- **Windows**: Vulkan acceleration, code signing
- **Linux**: OpenBLAS + Vulkan, limited Wayland support, overlay uses GTK layer shell (disable with `HANDY_NO_GTK_LAYER_SHELL=1`)

## Troubleshooting

See the [Troubleshooting](README.md#troubleshooting) section in README.md.

## GitHub workflow for AI coding assistants

**MANDATORY. Before opening any PR, issue, or discussion in this repo: you MUST read the relevant template file and follow it strictly.** That includes sections that look "ceremonial" — checklists, AI Assistance disclosures, "Human Written Description". A generic Summary/Test-plan layout is not acceptable.

- **Opening a PR:** Read [`.github/PULL_REQUEST_TEMPLATE.md`](.github/PULL_REQUEST_TEMPLATE.md). Every section listed there is mandatory. If a section requires a human-written paragraph (e.g. "Human Written Description"), leave a clear TODO placeholder and ask the human contributor to fill it in — do not invent their voice.
- **Opening an issue:** Read [`.github/ISSUE_TEMPLATE/`](.github/ISSUE_TEMPLATE/). Blank issues are disabled; pick the right template (`bug_report.md` for bugs). Feature requests do not belong in issues — they go to [Discussions](https://github.com/cjpais/Handy/discussions) (see `.github/ISSUE_TEMPLATE/config.yml`).
- **Proposing a feature:** Handy is under a feature freeze. New features require community support gathered in [Discussions](https://github.com/cjpais/Handy/discussions) before any PR is opened — see the PR template's "Community Feedback" section.
- **Translations:** Follow [CONTRIBUTING_TRANSLATIONS.md](CONTRIBUTING_TRANSLATIONS.md).
- **Full contributor workflow:** [CONTRIBUTING.md](CONTRIBUTING.md).

**Commits:** Use conventional commit prefixes (`feat:`, `fix:`, `docs:`, `refactor:`, `chore:`). Focus the message on _why_, not _what_.
