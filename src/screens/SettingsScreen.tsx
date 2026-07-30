import React from 'react';
import { StyleSheet, View, Switch, ScrollView, Alert, TouchableOpacity } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { ScreenWrapper } from '../components/ScreenWrapper';
import { Heading, Body, Caption } from '../components/Typography';
import { SPACING, COLORS, RADIUS } from '../theme/theme';
import { useSettingsStore } from '../features/settings/settingsStore';
import { triggerHaptic } from '../utils/haptics';
import { DatabaseService } from '../services/database/DatabaseService';
import { useNotesStore } from '../features/notes/notesStore';
import { clearSnapshot } from '../services/recovery/recordingSnapshot';
import { ChevronRight, HelpCircle } from 'lucide-react-native';
import { WhisperService } from '../services/whisper/WhisperService';
import { RECOMMENDED_EMBEDDING_MODEL, RECOMMENDED_LLM_MODEL } from '../services/ai/OfflineAiModelService';

export const SettingsScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const {
    themeMode,
    toggleTheme,
    embeddingModelUri,
    llmModelUri,
    setEmbeddingModelUri,
    setLlmModelUri,
  } = useSettingsStore();

  const colors = COLORS[themeMode];

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

        {/* Section: Security & Privacy */}
        <View style={styles.section}>
          <Heading size="sm" style={styles.sectionTitle}>
            Security & Privacy
          </Heading>

          <View style={[styles.settingRow, { borderBottomColor: colors.border, borderBottomWidth: 0 }]}>
            <View style={styles.settingInfo}>
              <Body size="md" style={styles.settingLabel}>
                Granular Security
              </Body>
              <Caption size="sm" style={{ marginTop: 4, lineHeight: 18 }}>
                Secure individual sensitive notes or lists by tapping the lock icon in the top header of any note.
                Locked items require device biometrics (fingerprint/face recognition) or device passcode to unlock.
              </Caption>
            </View>
          </View>
        </View>

        {/* Section: Help & Guides */}
        <View style={styles.section}>
          <Heading size="sm" style={styles.sectionTitle}>
            Help & Guides
          </Heading>
          <TouchableOpacity
            style={[
              styles.settingRow,
              {
                backgroundColor: colors.surface,
                borderColor: colors.border,
                borderWidth: StyleSheet.hairlineWidth,
                borderRadius: 8,
                padding: SPACING.md,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
              },
            ]}
            onPress={() => {
              triggerHaptic('selection');
              navigation.navigate('Help');
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING.sm }}>
              <HelpCircle size={20} color={colors.foreground} />
              <Body size="md" style={{ color: colors.foreground, fontWeight: '600' }}>
                Voice Commands & User Guide
              </Body>
            </View>
            <ChevronRight size={20} color={colors.muted} />
          </TouchableOpacity>
        </View>

        {/* Section: About Creator */}
        <View style={styles.section}>
          <Heading size="sm" style={styles.sectionTitle}>
            About Creator
          </Heading>
          <View
            style={[
              styles.creatorCard,
              {
                borderColor: colors.border,
                backgroundColor: colors.surface,
              },
            ]}
          >
            <Body size="md" style={{ fontWeight: '700', marginBottom: 4 }}>
              Darshan
            </Body>
            <Caption size="sm" style={{ lineHeight: 18 }}>
              Lead Architect & Designer. Focused on building high-performance, local-first, offline-first minimalist developer and productivity utilities that respect user security.
            </Caption>
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
            <View style={styles.settingInfo}>
              <Body size="md" style={[styles.settingLabel, { color: colors.error }]}>
                Clear Local Data
              </Body>
              <Caption size="sm">Permanently wipe all notes, transcripts, and audio recordings</Caption>
            </View>
          </TouchableOpacity>
        </View>

        {/* Section: Application Info */}
        <View style={styles.infoSection}>
          <Caption size="xs" style={[styles.centerText, { color: colors.muted }]}>
            Ideatik v2.0.0 • privacy-first open-source
          </Caption>
          <Caption size="xs" style={[styles.centerText, { color: colors.muted }]}>
            Made with ❤️ by Darshan
          </Caption>
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
  sectionTitle: {
    fontWeight: '700',
    marginBottom: SPACING.sm,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
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
