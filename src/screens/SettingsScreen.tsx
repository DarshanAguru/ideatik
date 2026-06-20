import React from 'react';
import { StyleSheet, View, Switch, ScrollView, Alert, TouchableOpacity } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { ScreenWrapper } from '../components/ScreenWrapper';
import { Heading, Body, Caption } from '../components/Typography';
import { SPACING, COLORS } from '../theme/theme';
import { useSettingsStore } from '../features/settings/settingsStore';
import { triggerHaptic } from '../utils/haptics';
import { DatabaseService } from '../services/database/DatabaseService';
import { useNotesStore } from '../features/notes/notesStore';
import { clearSnapshot } from '../services/recovery/recordingSnapshot';
import { ChevronRight, HelpCircle } from 'lucide-react-native';
import { WhisperService } from '../services/whisper/WhisperService';

export const SettingsScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const {
    themeMode,
    toggleTheme,
  } = useSettingsStore();

  const colors = COLORS[themeMode];

  const [modelExists, setModelExists] = React.useState(false);
  const [isDownloading, setIsDownloading] = React.useState(false);
  const [downloadProgress, setDownloadProgress] = React.useState(0);

  React.useEffect(() => {
    WhisperService.checkModelExists().then(setModelExists);
  }, []);

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
                      await useNotesStore.getState().loadNotes();
                      Alert.alert('Data Wiped', 'All local data has been successfully cleared.');
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
        <View style={styles.section}>
          <Heading size="sm" style={styles.sectionTitle}>
            Offline Capabilities
          </Heading>
          <View style={[styles.settingRow, { borderBottomColor: colors.border, flexDirection: 'column', alignItems: 'flex-start', borderBottomWidth: 0 }]}>
            <View style={[styles.settingInfo, { marginBottom: SPACING.md }]}>
              <Body size="md" style={styles.settingLabel}>
                Offline Transcription Model (base.en-q5_1, ~60MB)
              </Body>
              <Caption size="sm" style={{ marginTop: 4, lineHeight: 18 }}>
                {modelExists
                  ? '✓ Downloaded. All transcriptions are processed privately on your device.'
                  : 'Not downloaded. The model is required to transcribe voice recordings.'}
              </Caption>
            </View>

            {isDownloading ? (
              <View style={{ width: '100%', paddingVertical: SPACING.sm }}>
                <Body size="sm" style={{ fontWeight: '600', marginBottom: 4 }}>
                  Downloading: {downloadProgress}%
                </Body>
                <View style={{ height: 4, backgroundColor: colors.border, borderRadius: 2, overflow: 'hidden' }}>
                  <View style={{ height: '100%', width: `${downloadProgress}%`, backgroundColor: colors.foreground }} />
                </View>
              </View>
            ) : modelExists ? (
              <View
                style={{
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                  borderWidth: 1,
                  paddingHorizontal: SPACING.md,
                  paddingVertical: SPACING.sm,
                  borderRadius: 8,
                  alignSelf: 'stretch',
                  alignItems: 'center',
                }}
              >
                <Body size="sm" style={{ color: colors.muted || colors.foreground, fontWeight: '600' }}>
                  ✓ Offline Model Installed & Ready
                </Body>
              </View>
            ) : (
              <TouchableOpacity
                style={{
                  backgroundColor: colors.foreground,
                  paddingHorizontal: SPACING.md,
                  paddingVertical: SPACING.sm,
                  borderRadius: 8,
                  alignSelf: 'stretch',
                  alignItems: 'center',
                }}
                onPress={handleDownloadModel}
              >
                <Body size="sm" style={{ color: colors.background, fontWeight: '700' }}>
                  Download Offline Model (~60MB)
                </Body>
              </TouchableOpacity>
            )}
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
            Ideatik v1.0.5 • open-source
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
  infoSection: {
    marginTop: SPACING.md,
    alignItems: 'center',
  },
  centerText: {
    textAlign: 'center',
    marginBottom: 4,
  },
});
