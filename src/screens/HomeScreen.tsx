import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import {
  StyleSheet,
  View,
  TouchableOpacity,
  FlatList,
  Animated,
  Easing,
  Platform,
} from 'react-native';
import { ScreenWrapper, PressableScale } from '../components/ScreenWrapper';
import { Heading, Body, Caption, Label } from '../components/Typography';
import { SPACING, COLORS, TYPOGRAPHY, RADIUS, SHADOWS, ANIMATION } from '../theme/theme';
import { useSettingsStore } from '../features/settings/settingsStore';
import { Mic, RotateCcw, Save, Trash2, FileText, CheckSquare, Lock, DollarSign } from 'lucide-react-native';
import { NoteRepository } from '../services/database/NoteRepository';

import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useRecordingStore } from '../features/recording/recordingStore';
import { useNotesStore } from '../features/notes/notesStore';
import { triggerHaptic } from '../utils/haptics';
import { markdownParser } from '../services/parsers/markdownParser';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from './AppNavigator';
import { RecoveryManager } from '../services/recovery/recoveryManager';
import { RecordingSnapshot } from '../services/recovery/recordingSnapshot';

const formatDate = (timestamp: number) => {
  const d = new Date(timestamp);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000);
  if (diffDays === 0) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return d.toLocaleDateString([], { weekday: 'short' });
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
};

const formatElapsed = (seconds: number) => {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s}s recorded` : `${s}s recorded`;
};

const NoteSeparator = () => <View style={{ height: SPACING.sm }} />;

// ─── HomeScreen ───────────────────────────────────────────────────────────────

export const HomeScreen: React.FC = () => {
  const themeMode = useSettingsStore((state) => state.themeMode);
  const colors = COLORS[themeMode];
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { resumeFromSnapshot } = useRecordingStore();
  const { notesList, loadNotes } = useNotesStore();

  const handleCreateManual = async (type: 'note' | 'list' | 'finance') => {
    triggerHaptic('impact');
    const noteId = Math.random().toString(36).substr(2, 9);
    const title = type === 'list' ? 'Untitled List' : type === 'finance' ? 'Untitled Finance' : 'Untitled Note';
    await NoteRepository.save({
      id: noteId,
      title,
      type,
      markdownContent: `# ${title}\n\n`,
    });
    await loadNotes();
    navigation.navigate('NoteDetail', { noteId });
  };

  // ── Recovery state ──────────────────────────────────────────────────────
  const [recoverySnapshot, setRecoverySnapshot] = useState<RecordingSnapshot | null>(null);
  const [isHandlingRecovery, setIsHandlingRecovery] = useState(false);

  // ── Mic button pulse animation ───────────────────────────────────────────
  const micPulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(micPulse, {
          toValue: 1.06,
          duration: ANIMATION.slow,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(micPulse, {
          toValue: 1,
          duration: ANIMATION.slow,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Recovery banner fade-in ──────────────────────────────────────────────
  const bannerOpacity = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (recoverySnapshot) {
      Animated.timing(bannerOpacity, {
        toValue: 1,
        duration: ANIMATION.normal,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }).start();
    } else {
      bannerOpacity.setValue(0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recoverySnapshot]);

  useFocusEffect(
    React.useCallback(() => {
      loadNotes();
      RecoveryManager.checkForOrphanedRecording().then((snapshot) => {
        setRecoverySnapshot(snapshot);
      });
    }, [loadNotes])
  );

  // ── Record button ────────────────────────────────────────────────────────
  const startRecording = useRecordingStore((state) => state.startRecording);

  const handleRecordPress = async () => {
    triggerHaptic('success');
    try {
      await startRecording('note');
      navigation.navigate('Recording');
    } catch (e: any) {
      if (e?.message === 'MODEL_NOT_FOUND') {
        navigation.navigate('Recording');
      } else {
        console.error('Failed to start recording session:', e);
      }
    }
  };

  // ── Recovery actions ─────────────────────────────────────────────────────

  const handleRecoveryResume = async () => {
    if (!recoverySnapshot || isHandlingRecovery) return;
    triggerHaptic('success');
    setIsHandlingRecovery(true);
    try {
      await resumeFromSnapshot(recoverySnapshot);
      setRecoverySnapshot(null);
      navigation.navigate('Recording');
    } catch (e) {
      console.error('RecoveryBanner: resume failed:', e);
    } finally {
      setIsHandlingRecovery(false);
    }
  };

  const handleRecoverySaveDraft = async () => {
    if (!recoverySnapshot || isHandlingRecovery) return;
    triggerHaptic('selection');
    setIsHandlingRecovery(true);
    try {
      await RecoveryManager.promoteDraftToNote(recoverySnapshot.noteId);
      setRecoverySnapshot(null);
      await loadNotes();
    } catch (e) {
      console.error('RecoveryBanner: save draft failed:', e);
    } finally {
      setIsHandlingRecovery(false);
    }
  };

  const handleRecoveryDiscard = async () => {
    if (!recoverySnapshot || isHandlingRecovery) return;
    triggerHaptic('impact');
    setIsHandlingRecovery(true);
    try {
      await RecoveryManager.discardOrphanedRecording(recoverySnapshot.noteId);
      setRecoverySnapshot(null);
      await loadNotes();
    } catch (e) {
      console.error('RecoveryBanner: discard failed:', e);
    } finally {
      setIsHandlingRecovery(false);
    }
  };

  // ── Helpers ──────────────────────────────────────────────────────────────

  const parsedRecentNotes = useMemo(() => {
    return notesList.slice(0, 5).map((note) => {
      const parsed = markdownParser.parse(note.markdownContent);
      return {
        ...note,
        parsed,
      };
    });
  }, [notesList]);

  const renderNote = useCallback(({ item }: { item: any }) => {
    const { parsed } = item;
    return (
      <PressableScale
        onPress={() => navigation.navigate('NoteDetail', { noteId: item.id })}
        style={[
          styles.noteCard,
          { backgroundColor: colors.card, borderColor: colors.border },
          SHADOWS.sm,
        ]}
        scaleValue={0.98}
      >
        <View style={styles.noteHeaderRow}>
          <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: SPACING.sm }}>
            {item.isLocked && <Lock size={14} color={colors.foreground} style={{ marginRight: 6 }} />}
            <Body
              size="md"
              numberOfLines={1}
              style={[styles.noteTitle, { color: colors.foreground, flex: 1 }]}
            >
              {item.title}
            </Body>
          </View>
          <Caption size="xs" style={{ color: colors.muted }}>
            {formatDate(item.createdAt)}
          </Caption>
        </View>
        {!item.isLocked && parsed.bodyText ? (
          <Caption
            size="sm"
            numberOfLines={1}
            style={[styles.notePreview, { color: colors.muted }]}
          >
            {parsed.bodyText}
          </Caption>
        ) : item.isLocked ? (
          <Caption
            size="sm"
            numberOfLines={1}
            style={[styles.notePreview, { color: colors.muted, fontStyle: 'italic' }]}
          >
            Locked note (tap to unlock)
          </Caption>
        ) : null}
      </PressableScale>
    );
  }, [colors, navigation]);

  return (
    <ScreenWrapper style={styles.container} safeBottom={false}>
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <View style={styles.header}>
        <Heading
          size="xxl"
          style={{
            letterSpacing: TYPOGRAPHY.tracking.tight,
            fontFamily: Platform.OS === 'ios' ? 'Chalkboard SE' : 'cursive',
            fontStyle: 'italic',
            fontWeight: 'normal',
          }}
        >
          Ideatik
        </Heading>
        <Caption size="sm" style={{ color: colors.muted, marginTop: 2 }}>
          Voice-first. Offline. Fast.
        </Caption>
      </View>

      {/* ── Recovery Banner ──────────────────────────────────────────────── */}
      {recoverySnapshot && (
        <Animated.View
          style={[
            styles.recoveryBanner,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
              opacity: bannerOpacity,
            },
          ]}
        >
          <View style={styles.recoveryTop}>
            <View style={styles.recoveryTitleRow}>
              <RotateCcw size={12} color={colors.foreground} />
              <Label size="xs" style={[{ color: colors.foreground, marginLeft: SPACING.xs }]}>
                Unfinished recording
              </Label>
            </View>
            <Caption size="xs" style={{ color: colors.muted }}>
              {new Date(recoverySnapshot.savedAt).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </Caption>
          </View>

          <Body
            size="sm"
            style={[styles.recoveryNoteTitle, { color: colors.foreground }]}
            numberOfLines={1}
          >
            {recoverySnapshot.noteTitle || 'Untitled Capture'}
          </Body>
          <Caption size="xs" style={{ color: colors.muted, marginBottom: SPACING.md }}>
            {formatElapsed(recoverySnapshot.elapsedTime)}
          </Caption>

          <View style={styles.recoveryBtns}>
            {/* Resume — primary */}
            <TouchableOpacity
              style={[styles.recoveryBtn, { backgroundColor: colors.foreground }]}
              onPress={handleRecoveryResume}
              disabled={isHandlingRecovery}
              activeOpacity={0.85}
            >
              <RotateCcw size={12} color={colors.background} />
              <Caption
                size="xs"
                style={[styles.recoveryBtnText, { color: colors.background }]}
              >
                Resume
              </Caption>
            </TouchableOpacity>

            {/* Save Draft */}
            <TouchableOpacity
              style={[
                styles.recoveryBtn,
                { borderColor: colors.border, borderWidth: StyleSheet.hairlineWidth },
              ]}
              onPress={handleRecoverySaveDraft}
              disabled={isHandlingRecovery}
              activeOpacity={0.85}
            >
              <Save size={12} color={colors.foreground} />
              <Caption
                size="xs"
                style={[styles.recoveryBtnText, { color: colors.foreground }]}
              >
                Save Draft
              </Caption>
            </TouchableOpacity>

            {/* Discard */}
            <TouchableOpacity
              style={[
                styles.recoveryBtn,
                { borderColor: colors.border, borderWidth: StyleSheet.hairlineWidth },
              ]}
              onPress={handleRecoveryDiscard}
              disabled={isHandlingRecovery}
              activeOpacity={0.85}
            >
              <Trash2 size={12} color={colors.error} />
              <Caption
                size="xs"
                style={[styles.recoveryBtnText, { color: colors.error }]}
              >
                Discard
              </Caption>
            </TouchableOpacity>
          </View>
        </Animated.View>
      )}

      {/* ── Mic Button ───────────────────────────────────────────────────── */}
      <View style={styles.micSection}>
        <View style={styles.micContainer}>
          {/* Ambient pulse ring */}
          <Animated.View
            style={[
              styles.micRing,
              {
                borderColor: colors.border,
                transform: [{ scale: micPulse }],
              },
            ]}
          />
          <TouchableOpacity
            onPress={handleRecordPress}
            style={[
              styles.micButton,
              {
                backgroundColor: colors.foreground,
              },
              SHADOWS.md,
            ]}
            activeOpacity={0.88}
          >
            <Mic size={30} color={colors.background} />
          </TouchableOpacity>
        </View>

        <Label size="xs" style={[styles.micLabel, { color: colors.muted }]}>
          tap to capture idea
        </Label>

        <View style={styles.quickActionsRow}>
          <TouchableOpacity
            onPress={() => handleCreateManual('note')}
            style={[styles.quickActionCard, { borderColor: colors.border }]}
            activeOpacity={0.7}
          >
            <FileText size={14} color={colors.foreground} />
            <Caption size="sm" style={[styles.quickActionText, { color: colors.foreground }]}>
              New Note
            </Caption>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => handleCreateManual('list')}
            style={[styles.quickActionCard, { borderColor: colors.border }]}
            activeOpacity={0.7}
          >
            <CheckSquare size={14} color={colors.foreground} />
            <Caption size="sm" style={[styles.quickActionText, { color: colors.foreground }]}>
              New List
            </Caption>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => handleCreateManual('finance')}
            style={[styles.quickActionCard, { borderColor: colors.border }]}
            activeOpacity={0.7}
          >
            <DollarSign size={14} color={colors.foreground} />
            <Caption size="sm" style={[styles.quickActionText, { color: colors.foreground }]}>
              Finance
            </Caption>
          </TouchableOpacity>
        </View>
      </View>

      {/* ── Recent Captures ───────────────────────────────────────────────── */}
      <View style={styles.recentSection}>
        <View style={styles.recentHeader}>
          <Body
            size="sm"
            style={{
              color: colors.foreground,
              fontWeight: TYPOGRAPHY.weights.semibold,
              letterSpacing: TYPOGRAPHY.tracking.tight,
            }}
          >
            Recent captures
          </Body>
          {notesList.length > 5 && (
            <TouchableOpacity activeOpacity={0.7}>
              <Caption size="xs" style={{ color: colors.muted }}>
                See all
              </Caption>
            </TouchableOpacity>
          )}
        </View>

        <FlatList
          data={parsedRecentNotes}
          keyExtractor={(item) => item.id}
          renderItem={renderNote}
          scrollEnabled={false}
          contentContainerStyle={{ paddingBottom: SPACING.xl }}
          ItemSeparatorComponent={NoteSeparator}
          ListEmptyComponent={
            <Caption
              size="sm"
              style={{ color: colors.muted, textAlign: 'center', marginTop: SPACING.lg }}
            >
              No recent captures found.
            </Caption>
          }
        />
      </View>
    </ScreenWrapper>
  );
};

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: SPACING.xl,
    paddingTop: SPACING.xl,
  },
  header: {
    marginBottom: SPACING.lg,
  },
  // ── Recovery ────────────────────────────────────────────────────────────
  recoveryBanner: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: RADIUS.md,
    padding: SPACING.lg,
    marginBottom: SPACING.lg,
  },
  recoveryTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.xs,
  },
  recoveryTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  recoveryNoteTitle: {
    fontWeight: TYPOGRAPHY.weights.semibold,
    marginBottom: 2,
  },
  recoveryBtns: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  recoveryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 7,
    paddingHorizontal: SPACING.md,
    borderRadius: RADIUS.sm,
  },
  recoveryBtnText: {
    fontWeight: TYPOGRAPHY.weights.semibold,
  },
  // ── Mic ─────────────────────────────────────────────────────────────────
  micSection: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.xxl,
  },
  micContainer: {
    width: 108,
    height: 108,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  micRing: {
    position: 'absolute',
    width: 108,
    height: 108,
    borderRadius: RADIUS.full,
    borderWidth: 1,
  },
  micButton: {
    width: 80,
    height: 80,
    borderRadius: RADIUS.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  micLabel: {
    marginTop: SPACING.xl,
  },
  // ── Recent ──────────────────────────────────────────────────────────────
  recentSection: {
    flex: 1,
  },
  recentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  noteCard: {
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  noteHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  noteTitle: {
    fontWeight: TYPOGRAPHY.weights.semibold,
    flex: 1,
    marginRight: SPACING.md,
    letterSpacing: TYPOGRAPHY.tracking.tight,
  },
  notePreview: {
    marginTop: 2,
    lineHeight: TYPOGRAPHY.lineHeights.sm,
  },
  quickActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.md,
    marginTop: SPACING.lg,
  },
  quickActionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.md,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    gap: SPACING.xs,
  },
  quickActionText: {
    fontWeight: '600',
  },
});
