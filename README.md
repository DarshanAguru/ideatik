# Ideatik

**Ideatik** is a **100% offline, privacy-first voice capture app** built in React Native. It converts natural voice input into structured notes, interactive checklists, and detailed financial ledgers — entirely on your device, with no internet required.

---

## Key Features

- **Fully Offline Transcription Engine**:
  - All speech-to-text runs **on-device** using `whisper.rn` — no data ever leaves your phone.
  - Powered by **`ggml-large-v3-turbo-q5_0`** (~547MB) — the best quantized Whisper model for mobile, delivering near-server-level accuracy offline.
  - **Automatic WAV Chunking**: Long recordings (>30s) are split into 30-second segments, transcribed sequentially, and merged — preventing memory issues and improving reliability on large files.
  - **Retry on Failure**: If transcription fails (e.g. model not yet loaded), the note's audio is preserved and a **Retry** button is shown to re-queue it instantly.

- **Voice Command Parser**: Spoken commands auto-structure your recording into notes, checklists, or finance ledgers.
- **Flexible Note Types**:
  - **Notes**: Standard rich-text with wiki-link backlink support.
  - **Checklists**: Dynamic todo lists with collapsible completed sections.
  - **Finance Ledgers**: Items with amounts, auto-totals, spent/remaining summaries in ₹.
- **Indian Rupee (₹) Localization**: Fully localized for Indian Rupees (₹). Supports voice commands like `add coffee 50 rupees`.
- **Manual Creation**: Create Notes, Lists, or Finance ledgers from the home screen — no voice required.
- **Granular Biometric Security**: Lock individual notes with device fingerprint / face recognition.
- **Background Queue Processing**: Audio is queued and transcribed by a background worker after recording. Shows `queued`, `transcribing...`, and completion states.
- **Deduplicated Incremental Titles**: Notes are named sequentially (`note-1`, `list-1`, `finance-list-1`). During recording a placeholder title is shown.
- **Live Search & Filters**: Instant full-text search across titles, transcripts, and checklist items. Filter by type, tags, and date range.
- **Tags**: Create color-coded tags, assign them to any note, and filter by them.
- **Adaptive Dark / Light Theme**: Minimalist design with smooth system-respecting palettes.

---

## Voice Commands Reference

All commands are parsed from the transcribed speech after recording ends using a robust clause-by-clause NLP sequence processor. The parser automatically splits speech using punctuation or transitions (like `and` or `then`), allowing fluid run-on dictation.

| Command | Syntax | Example |
|---------|--------|---------|
| **Create Checklist** | `create list` / `make a list` / `start checklist` / `create checklist` | `create checklist` |
| **Create Finance Ledger** | `create finance list` / `make ledger` / `create financial list` | `create finance list` |
| **Add Item** | `add item <text>` / `add <text>` / `add <text> to list` | `add milk` |
| **Add Finance Item** | `add <text> <number>` / `add <text> amount <number>` / `add <text> cost <number>` | `add rent 1200 rupees` / `add groceries cost 150` |
| **Link Note / Reference** | `add reference here` | `add reference here` |
| **Save & Finish** | `end note` / `finish note` / `save note` / `stop recording` | `end note` |

> [!NOTE]
> Titles are manually named by the user. If not provided, Ideatik names automatically (`note-1`, `list-1`, `finance-list-1`).

### Full Voice Flow Examples

**Voice Note:**
> "Today we discussed the roadmap. Key action is to ship by Friday. add reference here"

**Voice Checklist:**
> "create list. add milk then add eggs and add bread. end note."

**Finance Ledger:**
> "create finance list. add rent 1200 rupees. add groceries 150. end note."

---

## Architecture

```
src/
├── components/          # Shared UI (FilterBar, Typography, ScreenWrapper, TagBadge…)
├── features/            # State stores (recording, notes, settings, tags, security)
├── screens/             # Full screens (Home, Notes, NoteDetail, Recording, Settings…)
└── services/
    ├── audio/           # AudioService (record/pause/stop), AudioPlayerService
    ├── background/      # BackgroundTaskManager (queue-based offline transcription)
    ├── database/        # SQLite (DatabaseService, NoteRepository)
    ├── formatters/      # CustomNoteFormatter (export)
    ├── notes/           # StructuredNoteService (note ↔ JSON content model)
    ├── parsers/         # CommandParser (voice NLP), markdownParser, noteFormatter, types
    ├── queue/           # TranscriptionQueue
    ├── recovery/        # AutosaveManager, RecoveryManager, recordingSnapshot
    ├── search/          # SearchService (full-text + filter + sort)
    └── whisper/         # WhisperService (model download, context, chunking, transcription)
```

---

## Offline Model

| Model | Size | Speed | Accuracy |
|---|---|---|---|
| `ggml-small.en-q5_1` | ~190MB | ⚡ Fast | ⭐⭐⭐⭐ Great for mobile |

The model is downloaded once from Hugging Face via **Settings → Download Offline Model** and stored permanently on-device. No internet is required after download. The model cannot be deleted to ensure transcription always works.

---

## Standalone Installation Guide

### Android (Standalone APK)

Ensure **USB Debugging** is enabled and your device is connected.

1. **Clean previous build artifacts:**
   ```bash
   cd android && ./gradlew clean && cd ..
   ```

2. **Build the Release APK:**
   ```bash
   cd android && ./gradlew assembleRelease && cd ..
   ```
   Output: `android/app/build/outputs/apk/release/app-release.apk`

3. **Install on device:**
   ```bash
   adb install android/app/build/outputs/apk/release/app-release.apk
   ```

> Alternatively: `npx react-native run-android --mode=release`

---

## Development Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Start Metro:**
   ```bash
   npm start
   ```

3. **Run on device:**
   - Android: `npm run android`
   - iOS: `cd ios && pod install && cd .. && npm run ios`

4. **Reset Metro cache** (if you see stale bundle errors):
   ```bash
   npm start -- --reset-cache
   ```
