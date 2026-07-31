import React from 'react';
import { StyleSheet, View, Switch, ScrollView, Alert, TouchableOpacity } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import RNFS from 'react-native-fs';
import { ScreenWrapper } from '../components/ScreenWrapper';
import { Heading, Body, Caption } from '../components/Typography';
import { SPACING, COLORS, RADIUS } from '../theme/theme';
import { useSettingsStore } from '../features/settings/settingsStore';
import { triggerHaptic } from '../utils/haptics';
import { DatabaseService } from '../services/database/DatabaseService';
import { useNotesStore } from '../features/notes/notesStore';
import { clearSnapshot } from '../services/recovery/recordingSnapshot';
import { BarChart2, Trash2 } from 'lucide-react-native';
import { WhisperService } from '../services/whisper/WhisperService';
import { RECOMMENDED_EMBEDDING_MODEL, RECOMMENDED_LLM_MODEL } from '../services/ai/OfflineAiModelService';

export const SettingsScreen: React.FC = () => {
  const {
    themeMode,
    toggleTheme,
    setEmbeddingModelUri,
    setLlmModelUri,
  } = useSettingsStore();

  const colors = COLORS[themeMode];

  // Workspace Statistics
  const { notesList, loadNotes } = useNotesStore();
  const [vectorStoreSize, setVectorStoreSize] = React.useState('0 KB');
  const [totalStorageSize, setTotalStorageSize] = React.useState('0 KB');
  // Whisper Model Download State
  const [modelExists, setModelExists] = React.useState(false);
  const [isDownloading, setIsDownloading] = React.useState(false);
  const [downloadProgress, setDownloadProgress] = React.useState(0);

  // Offline AI Model Download States
  const [embeddingModelExists, setEmbeddingModelExists] = React.useState(false);
  const [isDownloadingEmbedding, setIsDownloadingEmbedding] = React.useState(false);
  const [embeddingProgress, setEmbeddingProgress] = React.useState(0);

  const [llmModelExists, setLlmModelExists] = React.useState(false);
  const [isDownloadingLlm, setIsDownloadingLlm] = React.useState(false);
  const [llmProgress, setLlmProgress] = React.useState(0);

  const checkAiModels = React.useCallback(async () => {
    const { OfflineAiModelService } = require('../services/ai/OfflineAiModelService');
    const embExists = await OfflineAiModelService.checkModelExists('embedding');
    const llmExists = await OfflineAiModelService.checkModelExists('llm');
    setEmbeddingModelExists(embExists);
    setLlmModelExists(llmExists);
  }, []);

  const refreshWorkspaceStats = React.useCallback(async () => {
    await loadNotes();

    const notesDir = `${RNFS.DocumentDirectoryPath}/files/notes`;
    const audioDir = `${RNFS.DocumentDirectoryPath}/files/audio`;
    let noteAndAudioBytes = 0;

    try {
      const [noteFiles, audioFiles, vectorRes] = await Promise.all([
        RNFS.exists(notesDir).then((exists) => (exists ? RNFS.readDir(notesDir) : [])),
        RNFS.exists(audioDir).then((exists) => (exists ? RNFS.readDir(audioDir) : [])),
        DatabaseService.execute(`SELECT SUM(LENGTH(vectorJson)) as vectorBytes FROM note_vectors;`).catch(() => []),
      ]);

      for (const file of noteFiles) {
        if (file.isFile()) noteAndAudioBytes += file.size;
      }
      for (const file of audioFiles) {
        if (file.isFile()) noteAndAudioBytes += file.size;
      }

      let vectorBytes = 0;
      if (vectorRes && vectorRes.length > 0 && vectorRes[0]?.vectorBytes) {
        vectorBytes = Number(vectorRes[0].vectorBytes) || 0;
      }

      const totalBytes = noteAndAudioBytes + vectorBytes;

      const formatBytes = (bytes: number) => {
        if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
        if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
        if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        return `${bytes} B`;
      };

      setVectorStoreSize(formatBytes(vectorBytes));
      setTotalStorageSize(formatBytes(totalBytes));
    } catch (err) {
      console.warn('SettingsScreen: Error calculating storage stats:', err);
      setVectorStoreSize('0 B');
      setTotalStorageSize('0 B');
    }
  }, [loadNotes]);

  useFocusEffect(
    React.useCallback(() => {
      WhisperService.checkModelExists().then(setModelExists);
      checkAiModels();
      refreshWorkspaceStats();
    }, [checkAiModels, refreshWorkspaceStats])
  );

  const totalNotes = notesList.filter((n) => n.type === 'note').length;
  const checklists = notesList.filter((n) => n.type === 'list').length;
  const financeLists = notesList.filter((n) => n.type === 'finance').length;
  const totalDuration = notesList.reduce((sum, note) => sum + (note.duration || 0), 0);

  const formatCount = (num: number) => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}k`;
    return String(num);
  };

  const formatDuration = (seconds: number) => {
    if (seconds <= 0) return '0s';
    if (seconds >= 86400) {
      const days = Math.floor(seconds / 86400);
      const hrs = Math.floor((seconds % 86400) / 3600);
      return `${days}d ${hrs}h`;
    }
    if (seconds >= 3600) {
      const hrs = Math.floor(seconds / 3600);
      const mins = Math.floor((seconds % 3600) / 60);
      return `${hrs}h ${mins}m`;
    }
    if (seconds >= 60) {
      const mins = Math.floor(seconds / 60);
      const secs = seconds % 60;
      return `${mins}m ${secs}s`;
    }
    return `${seconds}s`;
  };

  const REAL_STATS = [
    { label: 'Text Notes', value: formatCount(totalNotes) },
    { label: 'Checklists', value: formatCount(checklists) },
    { label: 'Finance Ledgers', value: formatCount(financeLists) },
    { label: 'Vector Store', value: vectorStoreSize },
    { label: 'Total Storage', value: totalStorageSize },
    { label: 'Voice Audio', value: formatDuration(totalDuration) },
  ];

  React.useEffect(() => {
    WhisperService.checkModelExists().then(setModelExists);
    checkAiModels();
  }, [checkAiModels]);

  const handleDownloadAiModel = async (kind: 'embedding' | 'llm') => {
    try {
      triggerHaptic('selection');
      const { OfflineAiModelService } = require('../services/ai/OfflineAiModelService');
      if (kind === 'embedding') {
        setIsDownloadingEmbedding(true);
        setEmbeddingProgress(0);
        await OfflineAiModelService.downloadModel('embedding', (progress: number) => {
          setEmbeddingProgress(progress);
        });
        setEmbeddingModelExists(true);
        Alert.alert('Success', 'Offline embedding model downloaded! Background indexing will begin automatically.');
      } else {
        setIsDownloadingLlm(true);
        setLlmProgress(0);
        await OfflineAiModelService.downloadModel('llm', (progress: number) => {
          setLlmProgress(progress);
        });
        setLlmModelExists(true);
        Alert.alert('Success', 'Offline LLM model downloaded! You can now query your notes offline.');
      }
    } catch (err) {
      console.warn(`AI model download failed (${kind}):`, err);
      Alert.alert('Download Error', `Failed to download offline ${kind} model. Check your internet connection.`);
    } finally {
      if (kind === 'embedding') setIsDownloadingEmbedding(false);
      else setIsDownloadingLlm(false);
      checkAiModels();
    }
  };

  const handleDownloadModel = async () => {
    try {
      triggerHaptic('selection');
      setIsDownloading(true);
      setDownloadProgress(0);
      await WhisperService.downloadModel((progress) => {
        setDownloadProgress(Math.round(progress));
      });
      setModelExists(true);
      Alert.alert('Success', 'Offline Whisper model downloaded successfully!');
    } catch (err) {
      console.warn('Model download failed:', err);
      Alert.alert('Error', 'Failed to download offline model. Please check your internet connection.');
    } finally {
      setIsDownloading(false);
    }
  };

  const handleImportOfflineAiModel = async (kind: 'embedding' | 'llm') => {
    try {
      triggerHaptic('selection');
      const DocumentPicker = require('react-native-document-picker').default;
      const result = await DocumentPicker.pickSingle({
        type: [DocumentPicker.types.allFiles],
        copyTo: 'cachesDirectory',
      });
      if (!result.uri) return;
      const RNFS = require('react-native-fs');
      const modelsDir = `${RNFS.DocumentDirectoryPath}/files/models`;
      const destination = `${modelsDir}/${kind}.gguf`;
      await RNFS.mkdir(modelsDir);
      const source = (result.fileCopyUri || result.uri).replace('file://', '');
      await RNFS.copyFile(source, destination);
      if (kind === 'embedding') {
        setEmbeddingModelUri(destination);
        const { LocalVectorIndex } = require('../services/ai/LocalVectorIndex');
        await LocalVectorIndex.scheduleAll();
      } else {
        setLlmModelUri(destination);
      }
      checkAiModels();
    } catch (error) {
      const DocumentPicker = require('react-native-document-picker').default;
      if (!DocumentPicker.isCancel(error)) {
        Alert.alert('Import failed', 'The selected AI model could not be opened.');
      }
    }
  };



  const handleClearDataPress = () => {
    triggerHaptic('impact');
    Alert.alert(
      'Wipe Local Data',
      'Are you sure you want to delete all local data? This action is irreversible.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete All',
          style: 'destructive',
          onPress: () => {
            Alert.alert(
              'Permanent Deletion',
              'Absolutely sure? This will permanently delete all your voice notes, checklist items, ledgers, and audio recordings.',
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Wipe Everything',
                  style: 'destructive',
                  onPress: async () => {
                    try {
                      triggerHaptic('success');
                      await DatabaseService.clearAllData();
                      clearSnapshot();
                      const { LocalVectorIndex } = require('../services/ai/LocalVectorIndex');
                      await LocalVectorIndex.clearAll();
                      await useNotesStore.getState().loadNotes();
                      await refreshWorkspaceStats();
                      checkAiModels();
                      Alert.alert('Data Wiped', 'All local notes, audio recordings, and vector embeddings have been cleared. Your downloaded AI models remain intact.');
                    } catch {
                      Alert.alert('Error', 'Failed to clear some local data.');
                    }
                  },
                },
              ]
            );
          },
        },
      ]
    );
  };

  return (
    <ScreenWrapper safeBottom={false}>
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Heading size="xl">Settings</Heading>
        </View>

        {/* Workspace Statistics */}
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

        {/* Section: General */}
        <View style={styles.section}>
          <Heading size="sm" style={styles.sectionTitle}>
            General
          </Heading>

          {/* Theme Switch */}
          <View style={[styles.settingRow, { borderBottomColor: colors.border }]}>
            <View style={styles.settingInfo}>
              <Body size="md" style={styles.settingLabel}>
                Dark Theme
              </Body>
              <Caption size="sm">Enable minimalist dark appearance</Caption>
            </View>
            <Switch
              value={themeMode === 'dark'}
              onValueChange={() => {
                triggerHaptic('selection');
                toggleTheme();
              }}
              trackColor={{ false: colors.border, true: colors.foreground }}
              thumbColor={colors.background}
            />
          </View>
        </View>

        {/* Section: Offline Capabilities */}
        {/* Section: Offline Capabilities & Models */}
        <View style={styles.section}>
          <Heading size="sm" style={styles.sectionTitle}>
            Offline Capabilities & Models
          </Heading>

          {/* 1. Whisper Voice Model */}
          <View style={[styles.settingRow, { borderBottomColor: colors.border, flexDirection: 'column', alignItems: 'flex-start', borderBottomWidth: 0 }]}>
            <View style={[styles.settingInfo, { marginBottom: SPACING.sm }]}>
              <Body size="md" style={styles.settingLabel}>
                Speech Transcription Model (Whisper Base ~60MB)
              </Body>
              <Caption size="xs" style={{ color: colors.muted, marginTop: 2, lineHeight: 16 }}>
                {modelExists
                  ? '✓ Installed · ggerganov/whisper.cpp (base.en-q5_1)'
                  : 'Not installed. Required for speech-to-text recording.'}
              </Caption>
            </View>

            {isDownloading ? (
              <View style={{ width: '100%', paddingVertical: 4 }}>
                <Caption size="xs" style={{ color: colors.muted, marginBottom: 4 }}>Downloading Whisper Model: {downloadProgress}%</Caption>
                <View style={{ height: 3, backgroundColor: colors.border, borderRadius: 2, overflow: 'hidden' }}>
                  <View style={{ height: '100%', width: `${downloadProgress}%`, backgroundColor: colors.foreground }} />
                </View>
              </View>
            ) : modelExists ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%', marginTop: 4 }}>
                <View style={[styles.installedBadge, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <Caption size="xs" style={{ color: colors.foreground, fontWeight: '600' }}>✓ Installed · 60 MB</Caption>
                </View>
                <TouchableOpacity
                  style={[styles.deleteBtn, { borderColor: colors.border }]}
                  onPress={() => {
                    Alert.alert('Delete Whisper Model', 'Are you sure you want to delete the Whisper speech model?', [
                      { text: 'Cancel', style: 'cancel' },
                      { text: 'Delete', style: 'destructive', onPress: async () => {
                        const { OfflineAiModelService } = require('../services/ai/OfflineAiModelService');
                        await OfflineAiModelService.deleteWhisperModel();
                        WhisperService.checkModelExists().then(setModelExists);
                      }},
                    ]);
                  }}
                >
                  <Caption size="xs" style={{ color: colors.error }}>Delete Model</Caption>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity
                style={[styles.downloadBtn, { backgroundColor: colors.foreground }]}
                onPress={handleDownloadModel}
              >
                <Caption size="xs" style={{ color: colors.background, fontWeight: '600' }}>Download Whisper Model (~60MB)</Caption>
              </TouchableOpacity>
            )}
          </View>

          {/* 2. RAG & Knowledge Engine Models */}
          <View style={[styles.offlineAiCard, { borderColor: colors.border, backgroundColor: colors.surface }]}>
            <View style={{ marginBottom: SPACING.md }}>
              <Body size="sm" style={[styles.settingLabel, { marginBottom: 4 }]}>Offline Knowledge Engine (RAG)</Body>
              <Caption size="xs" style={{ color: colors.muted, lineHeight: 17 }}>
                Local embedding and LLM models enable search, summary, and Q&A entirely on your device — no internet required.
              </Caption>
            </View>

            {/* Embedding Model */}
            <View style={[styles.modelRow, { borderColor: colors.border }]}>
              <View style={styles.modelRowLeft}>
                <Caption size="sm" style={{ color: colors.foreground, fontWeight: '600' }}>
                  Vector Embedding
                </Caption>
                <Caption size="xs" style={{ color: colors.muted, marginTop: 2 }}>
                  {embeddingModelExists
                    ? `✓ Installed · ${RECOMMENDED_EMBEDDING_MODEL.name} (${RECOMMENDED_EMBEDDING_MODEL.sizeMB} MB)`
                    : `${RECOMMENDED_EMBEDDING_MODEL.name} · ~${RECOMMENDED_EMBEDDING_MODEL.sizeMB} MB`}
                </Caption>
                <Caption size="xs" style={{ color: colors.muted, marginTop: 1, fontStyle: 'italic' }}>
                  Used for semantic search & note indexing
                </Caption>
              </View>
              <View style={styles.modelRowRight}>
                {isDownloadingEmbedding ? (
                  <View style={styles.progressWrap}>
                    <View style={[styles.progressTrack, { backgroundColor: colors.border }]}>
                      <View style={[styles.progressFill, { width: `${embeddingProgress}%`, backgroundColor: colors.foreground }]} />
                    </View>
                    <Caption size="xs" style={{ color: colors.muted, marginTop: 3, textAlign: 'right' }}>{embeddingProgress}%</Caption>
                  </View>
                ) : embeddingModelExists ? (
                  <TouchableOpacity
                    style={[styles.deleteBtn, { borderColor: colors.border }]}
                    onPress={() => {
                      Alert.alert('Delete Embedding Model', 'Are you sure you want to delete the vector embedding model and indexes?', [
                        { text: 'Cancel', style: 'cancel' },
                        { text: 'Delete', style: 'destructive', onPress: async () => {
                          const { OfflineAiModelService } = require('../services/ai/OfflineAiModelService');
                          await OfflineAiModelService.deleteModel('embedding');
                          setEmbeddingModelExists(false);
                        }},
                      ]);
                    }}
                  >
                    <Caption size="xs" style={{ color: colors.error }}>Delete</Caption>
                  </TouchableOpacity>
                ) : (
                  <View style={{ gap: SPACING.xs }}>
                    <TouchableOpacity
                      onPress={() => handleDownloadAiModel('embedding')}
                      style={[styles.modelBtn, { backgroundColor: colors.foreground, borderColor: colors.border }]}
                    >
                      <Caption size="xs" style={{ color: colors.background, fontWeight: '600' }}>Download</Caption>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => handleImportOfflineAiModel('embedding')}
                      style={[styles.modelBtn, { backgroundColor: 'transparent', borderColor: colors.border }]}
                    >
                      <Caption size="xs" style={{ color: colors.foreground, fontWeight: '500' }}>Import</Caption>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            </View>

            {/* LLM Model */}
            <View style={[styles.modelRow, { borderColor: colors.border, marginBottom: 0 }]}>
              <View style={styles.modelRowLeft}>
                <Caption size="sm" style={{ color: colors.foreground, fontWeight: '600' }}>
                  Language Model (LLM)
                </Caption>
                <Caption size="xs" style={{ color: colors.muted, marginTop: 2 }}>
                  {llmModelExists
                    ? `✓ Installed · ${RECOMMENDED_LLM_MODEL.name} · ~${RECOMMENDED_LLM_MODEL.sizeMB} MB`
                    : `${RECOMMENDED_LLM_MODEL.name} · ~${RECOMMENDED_LLM_MODEL.sizeMB} MB`}
                </Caption>
                  <Caption size="xs" style={{ color: colors.muted, marginTop: 1, fontStyle: 'italic' }}>
                    Used for smartly answering the query
                </Caption>
              </View>

              <View style={[styles.modelRowRight, { gap: SPACING.xs }]}>
                {isDownloadingLlm ? (
                  <View style={styles.progressWrap}>
                    <View style={[styles.progressTrack, { backgroundColor: colors.border }]}>
                      <View style={[styles.progressFill, { width: `${llmProgress}%`, backgroundColor: colors.foreground }]} />
                    </View>
                    <Caption size="xs" style={{ color: colors.muted, marginTop: 3, textAlign: 'right' }}>{llmProgress}%</Caption>
                  </View>
                ) : llmModelExists ? (
                  <TouchableOpacity
                    style={[styles.deleteBtn, { borderColor: colors.border }]}
                    onPress={() => {
                      Alert.alert('Delete LLM Model', 'Are you sure you want to delete the offline LLM model file?', [
                        { text: 'Cancel', style: 'cancel' },
                        { text: 'Delete', style: 'destructive', onPress: async () => {
                          const { OfflineAiModelService } = require('../services/ai/OfflineAiModelService');
                          await OfflineAiModelService.deleteModel('llm');
                          setLlmModelExists(false);
                        }},
                      ]);
                    }}
                  >
                    <Caption size="xs" style={{ color: colors.error }}>Delete</Caption>
                  </TouchableOpacity>
                ) : (
                  <View style={{ gap: SPACING.xs }}>
                    <TouchableOpacity
                      onPress={() => handleDownloadAiModel('llm')}
                      style={[styles.modelBtn, { backgroundColor: colors.foreground, borderColor: colors.border }]}
                    >
                      <Caption size="xs" style={{ color: colors.background, fontWeight: '600' }}>Download</Caption>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => handleImportOfflineAiModel('llm')}
                      style={[styles.modelBtn, { backgroundColor: 'transparent', borderColor: colors.border }]}
                    >
                      <Caption size="xs" style={{ color: colors.foreground, fontWeight: '500' }}>Import</Caption>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            </View>
          </View>
        </View>

        {/* Section: Danger Zone */}
        <View style={styles.section}>
          <Heading size="sm" style={[styles.sectionTitle, { color: colors.error }]}>
            Danger Zone
          </Heading>
          <TouchableOpacity
            style={[styles.settingRow, { borderBottomColor: colors.border }]}
            onPress={handleClearDataPress}
            activeOpacity={0.7}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, flex: 1 }}>
              <Trash2 size={20} color={colors.error} />
              <View style={styles.settingInfo}>
                <Body size="md" style={[styles.settingLabel, { color: colors.error }]}>
                  Clear Local Data
                </Body>
                <Caption size="sm">Permanently wipe all notes, transcripts, and audio recordings</Caption>
              </View>
            </View>
          </TouchableOpacity>
        </View>

      </ScrollView>
    </ScreenWrapper>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: SPACING.xl,
    paddingTop: SPACING.xl,
    paddingBottom: SPACING.xxxl,
  },
  header: {
    marginBottom: SPACING.lg,
  },
  section: {
    marginBottom: SPACING.xxl,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  icon: {
    marginRight: SPACING.xs + 2,
  },
  sectionTitle: {
    fontWeight: '700',
    marginBottom: SPACING.sm,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
  },
  statCard: {
    width: '48%',
    padding: SPACING.md,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
  },
  statValue: {
    fontWeight: '700',
    marginBottom: 2,
  },
  statLabel: {
    opacity: 0.8,
  },
  sectionDesc: {
    marginBottom: SPACING.md,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: SPACING.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  settingInfo: {
    flex: 1,
    paddingRight: SPACING.md,
  },
  settingLabel: {
    fontWeight: '600',
  },
  aiConfigArea: {
    marginTop: SPACING.lg,
  },
  fieldLabel: {
    fontWeight: '600',
    marginTop: SPACING.md,
    marginBottom: SPACING.sm,
  },
  providerGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: SPACING.md,
  },
  providerButton: {
    flex: 1,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: SPACING.xs,
    borderWidth: 1,
    marginHorizontal: 4,
  },
  apiKeyInput: {
    height: 48,
    borderWidth: 1,
    borderRadius: SPACING.sm,
    paddingHorizontal: SPACING.md,
    fontSize: 15,
  },
  apiKeyHint: {
    marginTop: SPACING.xs,
  },
  helpItem: {
    paddingVertical: SPACING.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  helpQuestion: {
    fontWeight: '600',
    marginBottom: 4,
  },
  cmdCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
  },
  cmdTitle: {
    fontWeight: '600',
    marginBottom: 4,
  },
  cmdSyntax: {
    fontFamily: 'monospace',
    marginBottom: 6,
  },
  cmdDesc: {
    lineHeight: 18,
  },
  creatorCard: {
    padding: SPACING.lg,
    borderRadius: SPACING.sm,
    borderWidth: 1,
  },
  portfolioBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.xs + 3,
    paddingHorizontal: SPACING.md,
    borderRadius: RADIUS.full,
    borderWidth: StyleSheet.hairlineWidth,
    alignSelf: 'flex-start',
    marginTop: SPACING.xs,
  },
  importModelButton: {
    marginTop: SPACING.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    alignSelf: 'stretch',
    alignItems: 'center',
  },
  offlineAiCard: {
    width: '100%',
    marginTop: SPACING.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
    padding: SPACING.md,
  },
  offlineButton: {
    minHeight: 36,
    marginTop: SPACING.sm,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    borderRadius: RADIUS.full,
    borderWidth: StyleSheet.hairlineWidth,
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: SPACING.sm,
    marginBottom: SPACING.xs,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  modelRowLeft: {
    flex: 1,
    paddingRight: SPACING.sm,
  },
  modelRowRight: {
    alignItems: 'flex-end',
  },
  modelBtn: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs + 1,
    borderRadius: RADIUS.full,
    borderWidth: StyleSheet.hairlineWidth,
    minWidth: 72,
    alignItems: 'center',
  },
  progressWrap: {
    width: 100,
    alignItems: 'stretch',
  },
  progressTrack: {
    height: 3,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
  },
  installedBadge: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    borderRadius: RADIUS.full,
    borderWidth: StyleSheet.hairlineWidth,
  },
  deleteBtn: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    borderRadius: RADIUS.full,
    borderWidth: StyleSheet.hairlineWidth,
  },
  accuracyBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  downloadBtn: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs + 2,
    borderRadius: RADIUS.full,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  infoSection: {
    marginTop: SPACING.md,
    alignItems: 'center',
  },
  centerText: {
    textAlign: 'center',
    marginBottom: 4,
  },
});
