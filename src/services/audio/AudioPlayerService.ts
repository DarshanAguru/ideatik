import Sound from 'react-native-sound';

class AudioPlayerServiceClass {
  private sound: Sound | null = null;
  private isSoundAvailable = false;

  // Mock player states
  private mockInterval: any = null;
  private mockDuration = 0;
  private mockCurrentTime = 0;
  private mockIsPlaying = false;
  private mockOnComplete: (() => void) | null = null;

  constructor() {
    try {
      Sound.setCategory('Playback');
      this.isSoundAvailable = true;
    } catch {
      console.warn('AudioPlayerService: react-native-sound is not available. Using simulator mode.');
      this.isSoundAvailable = false;
    }
  }

  /**
   * Loads a local audio file and returns its total duration in seconds.
   */
  load(uri: string): Promise<number> {
    return new Promise((resolve, reject) => {
      if (this.isSoundAvailable) {
        if (this.sound) {
          this.sound.release();
        }
        
        this.sound = new Sound(uri, '', (error) => {
          if (error) {
            console.error('AudioPlayerService: Failed to load sound:', error);
            reject(error);
          } else {
            resolve(this.sound ? this.sound.getDuration() : 0);
          }
        });
      } else {
        this.mockDuration = 30; // mock duration fallback
        this.mockCurrentTime = 0;
        this.mockIsPlaying = false;
        resolve(this.mockDuration);
      }
    });
  }

  /**
   * Starts playing the loaded audio track.
   */
  play(onComplete: () => void): Promise<void> {
    return new Promise((resolve) => {
      if (this.isSoundAvailable && this.sound) {
        this.sound.play((success) => {
          if (success) {
            onComplete();
          }
        });
        resolve();
      } else {
        this.mockOnComplete = onComplete;
        this.mockIsPlaying = true;
        if (this.mockInterval) clearInterval(this.mockInterval);
        
        this.mockInterval = setInterval(() => {
          if (this.mockIsPlaying) {
            this.mockCurrentTime += 0.25;
            if (this.mockCurrentTime >= this.mockDuration) {
              this.mockCurrentTime = this.mockDuration;
              this.mockIsPlaying = false;
              clearInterval(this.mockInterval);
              if (this.mockOnComplete) {
                this.mockOnComplete();
              }
            }
          }
        }, 250);
        resolve();
      }
    });
  }

  /**
   * Pauses the audio playback.
   */
  async pause(): Promise<void> {
    if (this.isSoundAvailable && this.sound) {
      this.sound.pause();
    } else {
      this.mockIsPlaying = false;
      if (this.mockInterval) clearInterval(this.mockInterval);
    }
  }

  /**
   * Seeks to a specific position (in seconds) in the audio track.
   */
  async seek(seconds: number): Promise<void> {
    if (this.isSoundAvailable && this.sound) {
      this.sound.setCurrentTime(seconds);
    } else {
      this.mockCurrentTime = Math.max(0, Math.min(seconds, this.mockDuration));
    }
  }

  /**
   * Gets the current playback progress time in seconds.
   */
  async getCurrentTime(): Promise<number> {
    return new Promise((resolve) => {
      if (this.isSoundAvailable && this.sound) {
        this.sound.getCurrentTime((sec) => resolve(sec));
      } else {
        resolve(this.mockCurrentTime);
      }
    });
  }

  /**
   * Releases resources associated with the sound player.
   */
  release(): void {
    if (this.isSoundAvailable && this.sound) {
      this.sound.release();
      this.sound = null;
    } else {
      this.mockIsPlaying = false;
      if (this.mockInterval) clearInterval(this.mockInterval);
    }
  }
}

export const AudioPlayerService = new AudioPlayerServiceClass();
