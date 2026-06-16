import React, { useState, useCallback } from 'react';
import { StyleSheet, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import RNFS from 'react-native-fs';
import { ScreenWrapper } from '../components/ScreenWrapper';
import { Heading, Body, Caption } from '../components/Typography';
import { SPACING, COLORS } from '../theme/theme';
import { useSettingsStore } from '../features/settings/settingsStore';
import { useNotesStore } from '../features/notes/notesStore';
import { Shield, BarChart2 } from 'lucide-react-native';

export const ProfileScreen: React.FC = () => {
  const themeMode = useSettingsStore((state) => state.themeMode);
  const colors = COLORS[themeMode];
  
  const { notesList, loadNotes } = useNotesStore();
  const [localStorageSize, setLocalStorageSize] = useState('0 KB');

  useFocusEffect(
    useCallback(() => {
      // Reload notes list from database to ensure fresh metadata
      loadNotes();

      // Read audio and notes directory sizes asynchronously
      const notesDir = `${RNFS.DocumentDirectoryPath}/files/notes`;
      const audioDir = `${RNFS.DocumentDirectoryPath}/files/audio`;
      let totalBytes = 0;

      Promise.all([
        RNFS.exists(notesDir).then((exists) => (exists ? RNFS.readDir(notesDir) : [])),
        RNFS.exists(audioDir).then((exists) => (exists ? RNFS.readDir(audioDir) : [])),
      ])
        .then(([noteFiles, audioFiles]) => {
          for (const file of noteFiles) {
            if (file.isFile()) totalBytes += file.size;
          }
          for (const file of audioFiles) {
            if (file.isFile()) totalBytes += file.size;
          }

          if (totalBytes >= 1024 * 1024) {
            setLocalStorageSize(`${(totalBytes / (1024 * 1024)).toFixed(2)} MB`);
          } else {
            setLocalStorageSize(`${(totalBytes / 1024).toFixed(0)} KB`);
          }
        })
        .catch((err) => {
          console.warn('ProfileScreen: Error calculating folder size:', err);
        });
    }, [loadNotes])
  );

  const totalNotes = notesList.filter((n) => n.type === 'note').length;
  const checklists = notesList.filter((n) => n.type === 'list' || n.type === 'finance').length;
  const totalDuration = notesList.reduce((sum, note) => sum + (note.duration || 0), 0);

  const formatDuration = (seconds: number) => {
    if (seconds <= 0) return '0s';
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hrs > 0) {
      return `${hrs}h ${mins}m`;
    }
    if (mins > 0) {
      return `${mins}m ${secs}s`;
    }
    return `${secs}s`;
  };

  const REAL_STATS = [
    { label: 'Total Notes', value: String(totalNotes) },
    { label: 'Checklists', value: String(checklists) },
    { label: 'Voice Captured', value: formatDuration(totalDuration) },
    { label: 'Local Storage', value: localStorageSize },
  ];

  return (
    <ScreenWrapper style={styles.container} safeBottom={false}>
      <View style={styles.header}>
        <Heading size="xl">Local Workspace</Heading>
        <Caption size="sm">Your ideas are secure and on-device only.</Caption>
      </View>

      {/* Stats Section */}
      <View style={styles.section}>
        <View style={styles.sectionTitleRow}>
          <BarChart2 size={18} color={colors.foreground} style={styles.icon} />
          <Heading size="sm" style={styles.sectionTitle}>
            Statistics
          </Heading>
        </View>
        <View style={styles.statsGrid}>
          {REAL_STATS.map((stat, index) => (
            <View
              key={index}
              style={[
                styles.statCard,
                {
                  borderColor: colors.border,
                  backgroundColor: colors.surface,
                },
              ]}
            >
              <Heading size="lg" style={styles.statValue}>
                {stat.value}
              </Heading>
              <Caption size="sm" style={styles.statLabel}>
                {stat.label}
              </Caption>
            </View>
          ))}
        </View>
      </View>

      {/* Privacy & Architecture */}
      <View style={styles.section}>
        <View style={styles.sectionTitleRow}>
          <Shield size={18} color={colors.foreground} style={styles.icon} />
          <Heading size="sm" style={styles.sectionTitle}>
            Privacy &amp; Architecture
          </Heading>
        </View>
        <View
          style={[
            styles.infoCard,
            {
              borderColor: colors.border,
              backgroundColor: colors.surface,
            },
          ]}
        >
          <Body size="sm" style={styles.infoText}>
            🔒 <Body size="sm" style={{ fontWeight: '700' }}>100% Offline · No Cloud · No Accounts</Body>
          </Body>
          <Body size="sm" style={styles.infoText}>
            All speech-to-text runs entirely on this device using a quantized Whisper model (ggml-small.en-q5_1). Your audio and transcripts never leave your phone — not even during model download (model only).
          </Body>
          <Body size="sm" style={styles.infoText}>
            🧩 <Body size="sm" style={{ fontWeight: '600' }}>Local-First Storage</Body> — Notes are saved as standard Markdown (.md) files and audio as WAV on your internal storage. Back up by copying files directly from your device.
          </Body>
          <Body size="sm" style={styles.infoText}>
            ⚡ <Body size="sm" style={{ fontWeight: '600' }}>WAV Chunking</Body> — Long recordings are split into 30-second segments processed sequentially to keep memory usage low on mobile.
          </Body>
          <Body size="sm" style={{ lineHeight: 20, color: colors.muted }}>
            No analytics, no telemetry, no sync servers, no crash reporters. Zero third-party data sharing.
          </Body>
        </View>
      </View>

    </ScreenWrapper>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: SPACING.xl,
    paddingTop: SPACING.xl,
  },
  header: {
    marginBottom: SPACING.xl,
  },
  section: {
    marginBottom: SPACING.xl,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  icon: {
    marginRight: SPACING.sm,
  },
  sectionTitle: {
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginHorizontal: -4,
  },
  statCard: {
    width: '48%',
    padding: SPACING.md,
    borderRadius: SPACING.sm,
    borderWidth: 1,
    marginVertical: 4,
    marginHorizontal: 2,
    alignItems: 'center',
  },
  statValue: {
    fontWeight: '700',
    marginBottom: 2,
  },
  statLabel: {
    textAlign: 'center',
  },
  infoCard: {
    padding: SPACING.lg,
    borderRadius: SPACING.sm,
    borderWidth: 1,
  },
  infoText: {
    marginBottom: SPACING.sm,
    lineHeight: 20,
  },
  pathList: {
    paddingLeft: SPACING.xs,
  },
  pathRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: SPACING.xs,
  },
  pathLabel: {
    fontWeight: '500',
  },
  pathValue: {
    fontFamily: 'monospace',
  },
});
