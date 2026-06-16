import { AppState, AppStateStatus } from 'react-native';
import { saveSnapshot, RecordingSnapshot } from './recordingSnapshot';

// ─── Types ───────────────────────────────────────────────────────────────────

/**
 * A function that the AutosaveManager calls to obtain the current recording
 * state at the time of a save. Avoids coupling AutosaveManager directly to the
 * Zustand store so it stays testable and portable.
 */
type StateProvider = () => RecordingSnapshot | null;

// ─── AutosaveManager ─────────────────────────────────────────────────────────

class AutosaveManagerClass {
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private appStateSubscription: ReturnType<typeof AppState.addEventListener> | null = null;
  private stateProvider: StateProvider | null = null;
  private readonly DEFAULT_INTERVAL_MS = 5000; // autosave every 5 seconds

  /**
   * Starts the autosave loop.
   *
   * @param getState  Callback that returns a fresh RecordingSnapshot from the
   *                  current store state. Returning null skips the save.
   * @param intervalMs  How often to autosave (default 5000ms).
   */
  start(getState: StateProvider, intervalMs?: number): void {
    // Guard: prevent double-start
    if (this.intervalId !== null) {
      console.warn('AutosaveManager: already running, ignoring duplicate start()');
      return;
    }

    this.stateProvider = getState;
    const ms = intervalMs ?? this.DEFAULT_INTERVAL_MS;

    // ── Periodic interval autosave ────────────────────────────────────────
    this.intervalId = setInterval(() => {
      this.saveImmediately();
    }, ms);

    // ── AppState listener: save immediately when app moves to background ──
    this.appStateSubscription = AppState.addEventListener(
      'change',
      (nextState: AppStateStatus) => {
        if (nextState === 'background' || nextState === 'inactive') {
          // Phone call, task switch, battery optimisation kill, etc.
          this.saveImmediately();
        }
      }
    );

    // Write an initial snapshot the moment recording starts
    this.saveImmediately();
  }

  /**
   * Stops the autosave loop and removes the AppState listener.
   * Call this when recording ends successfully, is discarded, or is reset.
   */
  stop(): void {
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    if (this.appStateSubscription !== null) {
      this.appStateSubscription.remove();
      this.appStateSubscription = null;
    }

    this.stateProvider = null;
  }

  /**
   * Triggers an immediate snapshot write outside the normal interval cycle.
   * Safe to call even if start() has not been called yet (no-op).
   */
  saveImmediately(): void {
    if (!this.stateProvider) return;
    try {
      const snapshot = this.stateProvider();
      if (snapshot && snapshot.noteId) {
        saveSnapshot(snapshot);
      }
    } catch (e) {
      console.error('AutosaveManager: Error during immediate save:', e);
    }
  }

  /** Returns true if the autosave loop is currently active. */
  get isRunning(): boolean {
    return this.intervalId !== null;
  }
}

export const AutosaveManager = new AutosaveManagerClass();
