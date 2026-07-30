# Ideatik (v2.0.0)

**Ideatik** is a **100% offline, privacy-first voice capture & local AI intelligence notebook** built with React Native. It converts natural voice input into structured notes, interactive checklists, and detailed financial ledgers — operating entirely on your device with complete data privacy.

---

## What's New in v2.0.0

- **Google Keep-Style Dynamic Masonry Grid** — 2-column dynamic tile layout with content-driven height, full item previews (unchecked first, checked below), and persistent long-press drag-and-drop reordering.
- **Compact List View** — Single-row list format with checklist item counts, paid vs pending finance breakdowns (`Done: ₹3,000 • Pending: ₹1,500 • Total: ₹4,500`), and generous touch-friendly spacing.
- **Silent AI Ready Indicator** — Notes complete vector indexing silently in the background without intrusive notification popups, displaying an AI ✨ badge directly on cards when query-ready.
- **Official Qwen 2.5 1.5B AI Engine** — Upgraded on-device RAG engine featuring official Qwen 2.5 1.5B Instruct (890 MB) + BGE Small v1.5 for high-precision math calculations, percentage breakdowns, concept Q&A, and bullet-point summarization.
- **Refined Chat with Notes & Guardrails** — Dedicated "Ask" tab with warm, natural intent for notebook calculations, word definitions, and summaries, with strict domain guardrails against general AI misuse.
- **Keyboard-Aware Layouts** — KeyboardAvoidingView with safe-area insets across Android and iOS so search bars and text inputs never hide behind the keyboard.

---

## Key Features

- **100% Offline Transcription**
  - Speech-to-text runs on-device via `whisper.rn` — no audio or text ever leaves your device.
  - Sequentially transcribes long recordings in 30-second chunks with automated queue recovery.

- **Offline Knowledge Engine & RAG (Ask Tab)**
  - Natural Q&A, finance breakdowns, percentage calculations, and bullet-point summaries.
  - Hybrid search combining 384-dim BGE vector embeddings (0.65 weight) + exact keyword overlap (0.35 weight).
  - Financial calculations are computed deterministically from parsed note JSON for 100% math accuracy.

- **Voice Command NLP**
  - `add <text>` — clean checklist item creation.
  - `add <desc> cost <amount>` — finance item creation with automatic spoken numeric parsing ("twelve thousand fifty rupees" → `12050`).

- **Flexible Note Types & Dynamic Views**
  - **Notes** — Rich Markdown with backlink reference support.
  - **Checklists** — Reorderable todo items with collapsible completed sections.
  - **Finance Ledgers** — Line-item costs, auto-totals, paid vs pending status, and budget tracking.

- **Security & Privacy** — Lock sensitive notes with device biometrics (fingerprint / Face ID) or device passcode.
- **Export & Import** — Export to Markdown (`.txt`), PDF, or raw audio (`.wav`). Import `.txt` Markdown notes.
- **Granular Search & Tagging** — Full-text search across titles, transcripts, and checklist items with tag filtering.

---

## Voice Commands Reference

| Command | Syntax | Example |
|---------|--------|---------|
| Create Note | `create note` | `create note` |
| Create Checklist | `create list` / `start checklist` | `create list` |
| Create Finance Ledger | `create finance list` / `make ledger` | `create finance list` |
| Add Checklist Item | `add <text>` | `add get groceries` |
| Add Multiple Items | `add <text> add <text>` | `add milk add eggs add bread` |
| Add Finance Item | `add <desc> cost <amount>` | `add lunch cost two hundred rupees` |
| Link Reference | `add reference here` | `add reference here` |

---

## Recommended Offline AI Models

- **LLM**: Qwen 2.5 1.5B Instruct GGUF (`qwen2.5-1.5b-instruct-q3_k_m.gguf` ~890 MB)
- **Embeddings**: BGE Small EN v1.5 GGUF (`bge-small-en-v1.5-q4_k_m.gguf` ~25 MB)
- **Transcription**: Whisper Base EN GGML (`ggml-base.en-q5_1.bin` ~148 MB)

---

## Architecture

```
src/
├── components/          # Shared UI (RagResponseView, FilterBar, Typography, ScreenWrapper…)
├── features/            # Zustand stores (notes, recording, settings, tags, security)
├── screens/             # App Screens (Home, Notes, Chat, NoteDetail, Settings, Help…)
└── services/
    ├── ai/              # SmartRagService, LocalVectorIndex, OfflineAiModelService
    ├── audio/           # AudioService, AudioPlayerService
    ├── database/        # SQLite (DatabaseService, NoteRepository)
    ├── export/          # ExportService (Markdown, PDF, WAV)
    ├── notes/           # StructuredNoteService (Note ↔ JSON content model)
    ├── parsers/         # CommandParser (Voice NLP), markdownParser, noteFormatter
    └── search/          # SearchService (Full-text + Tag filter + Date sort)
```

---

## License

Created with ❤️ by **Darshan** • Privacy-first, open-source productivity utility.
