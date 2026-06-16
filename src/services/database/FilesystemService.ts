import RNFS from 'react-native-fs';

class FilesystemServiceClass {
  private baseDir = `${RNFS.DocumentDirectoryPath}/files`;
  private notesDir = `${RNFS.DocumentDirectoryPath}/files/notes`;
  private audioDir = `${RNFS.DocumentDirectoryPath}/files/audio`;

  /**
   * Builds the note and audio directory paths recursively if they do not exist.
   */
  async ensureDirectories(): Promise<void> {
    try {
      const existsNotes = await RNFS.exists(this.notesDir);
      if (!existsNotes) {
        await RNFS.mkdir(this.notesDir);
      }
      const existsAudio = await RNFS.exists(this.audioDir);
      if (!existsAudio) {
        await RNFS.mkdir(this.audioDir);
      }
    } catch (e) {
      console.error('FilesystemService: Error initializing directories:', e);
      throw e;
    }
  }

  getMarkdownPath(noteId: string): string {
    return `${this.notesDir}/${noteId}.md`;
  }

  getAudioPath(noteId: string): string {
    return `${this.audioDir}/${noteId}.wav`;
  }

  /**
   * Saves raw Markdown string to device disk storage.
   */
  async writeMarkdown(noteId: string, content: string): Promise<string> {
    await this.ensureDirectories();
    const filePath = this.getMarkdownPath(noteId);
    await RNFS.writeFile(filePath, content, 'utf8');
    return filePath;
  }

  /**
   * Reads raw Markdown string from device disk storage.
   */
  async readMarkdown(noteId: string): Promise<string> {
    const filePath = this.getMarkdownPath(noteId);
    const exists = await RNFS.exists(filePath);
    if (!exists) {
      throw new Error(`File not found: ${filePath}`);
    }
    return await RNFS.readFile(filePath, 'utf8');
  }

  /**
   * Moves temporary session audio file to permanent note audio directory.
   */
  async saveAudio(noteId: string, tempAudioPath: string): Promise<string> {
    await this.ensureDirectories();
    if (!tempAudioPath) return '';

    const targetPath = this.getAudioPath(noteId);
    const existsTemp = await RNFS.exists(tempAudioPath);
    if (!existsTemp) {
      // If temporary file was already moved or doesn't exist, return target path directly
      const existsTarget = await RNFS.exists(targetPath);
      return existsTarget ? targetPath : '';
    }

    // Move to permanent audio assets path
    await RNFS.moveFile(tempAudioPath, targetPath);
    return targetPath;
  }

  /**
   * Unlinks markdown note and audio file from storage.
   */
  async deleteAssets(noteId: string): Promise<void> {
    const mdPath = this.getMarkdownPath(noteId);
    const wavPath = this.getAudioPath(noteId);

    if (await RNFS.exists(mdPath)) {
      await RNFS.unlink(mdPath);
    }
    if (await RNFS.exists(wavPath)) {
      await RNFS.unlink(wavPath);
    }
  }

  /**
   * Lists all note files on disk.
   */
  async listMarkdownNotes(): Promise<string[]> {
    await this.ensureDirectories();
    const files = await RNFS.readDir(this.notesDir);
    return files
      .filter((file) => file.isFile() && file.name.endsWith('.md'))
      .map((file) => file.name.replace('.md', ''));
  }
}

export const FilesystemService = new FilesystemServiceClass();
