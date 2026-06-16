import React, { useEffect, useRef, useState } from 'react';
import {
  StyleSheet,
  View,
  TouchableOpacity,
  ScrollView,
  Alert,
  Modal,
  TextInput,
  Animated,
  Easing,
  ActivityIndicator,
} from 'react-native';
import { ScreenWrapper } from '../components/ScreenWrapper';
import { Heading, Body, Caption, Label } from '../components/Typography';
import { SPACING, COLORS, TYPOGRAPHY, RADIUS, SHADOWS, ANIMATION } from '../theme/theme';
import { useRecordingStore } from '../features/recording/recordingStore';
import { Play, Pause, Check, X, FileText, CheckSquare, IndianRupee, Edit, MessageSquare } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import { useSettingsStore } from '../features/settings/settingsStore';
import { noteFormatter } from '../services/parsers/noteFormatter';
import { NoteRepository } from '../services/database/NoteRepository';
import { triggerHaptic } from '../utils/haptics';

// ─── RecordingScreen ──────────────────────────────────────────────────────────

export const RecordingScreen: React.FC = () => {
  const navigation = useNavigation();
  const themeMode = useSettingsStore((state) => state.themeMode);
  const colors = COLORS[themeMode];

  const {
    recordingState,
    noteType,
    elapsedTime,
    waveform,
    partialTranscript,
    isDownloadingModel,
    modelDownloadProgress,
    checklistItems,
    noteTitle,
    markdown,
    showReferenceModal,
    autoSaved,
    references,
    pauseRecording,
    resumeRecording,
    stopRecording,
    resetRecording,
    startRecording,
    downloadModel,
    setShowReferenceModal,
    syncFromMarkdown,
    insertReference,
  } = useRecordingStore();

  const [isEditingMarkdown, setIsEditingMarkdown] = useState(false);
  const [modalSearchQuery, setModalSearchQuery] = useState('');
  const [dbNotes, setDbNotes] = useState<any[]>([]);
  const scrollViewRef = useRef<ScrollView>(null);

  // ── Animated recording indicator dot ─────────────────────────────────────
  const recDotOpacity = useRef(new Animated.Value(1)).current;
  const recDotAnim = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    if (recordingState === 'recording') {
      recDotAnim.current = Animated.loop(
        Animated.sequence([
          Animated.timing(recDotOpacity, {
            toValue: 0.2,
            duration: 600,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(recDotOpacity, {
            toValue: 1,
            duration: 600,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ])
      );
      recDotAnim.current.start();
    } else {
      recDotAnim.current?.stop();
      recDotOpacity.setValue(recordingState === 'paused' ? 0.3 : 0);
    }
    return () => recDotAnim.current?.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recordingState]);

  // ── Waveform bar animations ───────────────────────────────────────────────
  // Each bar gets its own Animated.Value for organic movement
  const barAnimValues = useRef(
    Array.from({ length: 30 }, () => new Animated.Value(0.1))
  ).current;

  useEffect(() => {
    if (recordingState !== 'recording') return;

    const anims = barAnimValues.map((val, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.timing(val, {
            toValue: 0.3 + (waveform[i] || 0) * 0.7,
            duration: ANIMATION.fast + Math.random() * 200,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: false,
          }),
          Animated.timing(val, {
            toValue: 0.1 + Math.random() * 0.15,
            duration: ANIMATION.fast + Math.random() * 180,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: false,
          }),
        ])
      )
    );
    Animated.parallel(anims).start();
    return () => anims.forEach((a) => a.stop());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recordingState, waveform]);

  useEffect(() => {
    if (showReferenceModal) {
      setModalSearchQuery('');
      NoteRepository.initialize().then(() => {
        NoteRepository.findAll().then((list) => {
          const currentNoteId = useRecordingStore.getState().noteId;
          setDbNotes(list.filter((n) => n.id !== currentNoteId));
        });
      });
    }
  }, [showReferenceModal]);

  useEffect(() => {
    if (scrollViewRef.current && !isEditingMarkdown) {
      scrollViewRef.current.scrollToEnd({ animated: true });
    }
  }, [partialTranscript, checklistItems, isEditingMarkdown]);

  useEffect(() => {
    const initRecording = async () => {
      if (recordingState !== 'idle') return;
      try {
        await startRecording(noteType);
      } catch (err: any) {
        if (err.message === 'MODEL_NOT_FOUND') {
          try {
            await downloadModel();
            await startRecording(noteType);
          } catch {
            Alert.alert('Download Failed', 'Could not download the offline transcription model.');
            navigation.goBack();
          }
        } else {
          Alert.alert('Error', 'Failed to start voice capture session.');
          navigation.goBack();
        }
      }
    };
    initRecording();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (autoSaved) {
      Alert.alert(
        'Saved via voice command',
        `Recording saved automatically.\n\n"${noteTitle}"`,
        [
          {
            text: 'Done',
            onPress: () => {
              resetRecording();
              navigation.goBack();
            },
          },
        ]
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoSaved]);

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handlePauseResume = () => {
    if (recordingState === 'transcribing') return;
    triggerHaptic('selection');
    if (recordingState === 'recording') pauseRecording();
    else if (recordingState === 'paused') resumeRecording();
  };

  const handleFinish = async () => {
    if (recordingState === 'transcribing') return;
    triggerHaptic('success');
    try {
      await stopRecording();
      resetRecording();
      navigation.goBack();
    } catch {
      Alert.alert('Error', 'Failed to save recording.');
    }
  };

  const handleCancel = () => {
    if (recordingState === 'transcribing') return;
    triggerHaptic('impact');
    Alert.alert(
      'Discard recording?',
      'The current capture and transcript will be deleted.',
      [
        { text: 'Keep recording', style: 'cancel' },
        {
          text: 'Discard',
          style: 'destructive',
          onPress: () => {
            resetRecording(true);
            navigation.goBack();
          },
        },
      ]
    );
  };

  const formatTime = (seconds: number): string => {
    const m = Math.floor(seconds / 60)
      .toString()
      .padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const { total, checkedTotal } = noteFormatter.calculateFinancialTotals(checklistItems);
  const remainingTotal = total - checkedTotal;
  const totalCount = checklistItems.length;
  const checkedCount = checklistItems.filter(item => item.checked).length;

  // ── Model Download Overlay ────────────────────────────────────────────────
  if (isDownloadingModel) {
    return (
      <ScreenWrapper style={styles.downloadScreen}>
        <View style={styles.downloadCard}>
          <Label size="xs" style={{ color: colors.muted, marginBottom: SPACING.lg }}>
            Downloading model
          </Label>
          <Heading size="xl" style={{ color: colors.foreground, marginBottom: SPACING.xs }}>
            {modelDownloadProgress}%
          </Heading>
          <Caption size="sm" style={{ color: colors.muted, textAlign: 'center', marginBottom: SPACING.xl }}>
            The on-device transcription model only needs to download once. ~140 MB.
          </Caption>
          <View style={[styles.progressTrack, { backgroundColor: colors.border }]}>
            <View
              style={[
                styles.progressFill,
                {
                  width: `${modelDownloadProgress}%`,
                  backgroundColor: colors.foreground,
                },
              ]}
            />
          </View>
        </View>
      </ScreenWrapper>
    );
  }

  // ── Main Recording UI ─────────────────────────────────────────────────────

  return (
    <ScreenWrapper style={styles.container}>
      {/* ── Top bar ─────────────────────────────────────────────────────── */}
      <View style={styles.topBar}>
        {/* Type selector */}
        {recordingState !== 'recording' && recordingState !== 'paused' && (
          <View style={[styles.typeSelector, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            {(
              [
                { id: 'note', label: 'Note', icon: FileText },
                { id: 'list', label: 'List', icon: CheckSquare },
                { id: 'finance', label: '₹', icon: IndianRupee },
              ] as const
            ).map((t) => {
              const active = noteType === t.id;
              const Icon = t.icon;
              return (
                <TouchableOpacity
                  key={t.id}
                  style={[
                    styles.typeChip,
                    active && { backgroundColor: colors.foreground },
                  ]}
                  disabled={recordingState === 'stopped'}
                  onPress={() => useRecordingStore.setState({ noteType: t.id })}
                  activeOpacity={0.8}
                >
                  <Icon size={12} color={active ? colors.background : colors.muted} />
                  <Caption
                    size="xs"
                    style={[
                      { color: active ? colors.background : colors.muted, marginLeft: 4 },
                      active && { fontWeight: TYPOGRAPHY.weights.bold },
                    ]}
                  >
                    {t.label}
                  </Caption>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* Recording status indicator */}
        <View style={styles.statusRow}>
          <Animated.View
            style={[
              styles.recDot,
              { backgroundColor: colors.error, opacity: recDotOpacity },
            ]}
          />
          <Label
            size="xs"
            style={{ color: colors.muted, marginLeft: SPACING.xs }}
          >
            {recordingState === 'recording'
              ? 'recording'
              : recordingState === 'paused'
              ? 'paused'
              : 'stopped'}
          </Label>
        </View>
      </View>

      {/* ── Note title ──────────────────────────────────────────────────── */}
      <TextInput
        style={[
          styles.noteTitleInput,
          {
            color: colors.foreground,
            fontSize: 24,
            fontWeight: 'bold',
            textAlign: 'center',
            marginBottom: SPACING.lg,
            borderBottomWidth: 1,
            borderBottomColor: 'transparent',
            paddingVertical: SPACING.xs,
          }
        ]}
        value={noteTitle === 'Untitled Capture' ? '' : noteTitle}
        onChangeText={(txt) => {
          useRecordingStore.setState({ noteTitle: txt });
        }}
        placeholder="Capturing Elegance..."
        placeholderTextColor={colors.placeholder}
      />

      {/* ── Finance totals ───────────────────────────────────────────────── */}
      {noteType === 'finance' && checklistItems.length > 0 && (
        <View
          style={[
            styles.financeBanner,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
        >
          <View style={styles.financeCol}>
            <Label size="xs" style={{ color: colors.muted }}>{`Total (${totalCount})`}</Label>
            <Body size="sm" style={{ color: colors.foreground, fontWeight: TYPOGRAPHY.weights.bold }}>
              {`₹${total.toFixed(2)}`}
            </Body>
          </View>
          <View style={[styles.financeDivider, { backgroundColor: colors.border }]} />
          <View style={styles.financeCol}>
            <Label size="xs" style={{ color: colors.muted }}>{`Spent (${checkedCount})`}</Label>
            <Body size="sm" style={{ color: colors.foreground, fontWeight: TYPOGRAPHY.weights.bold }}>
              {`₹${checkedTotal.toFixed(2)}`}
            </Body>
          </View>
          <View style={[styles.financeDivider, { backgroundColor: colors.border }]} />
          <View style={styles.financeCol}>
            <Label size="xs" style={{ color: colors.muted }}>Remaining</Label>
            <Body size="sm" style={{ color: colors.foreground, fontWeight: TYPOGRAPHY.weights.bold }}>
              {`₹${remainingTotal.toFixed(2)}`}
            </Body>
          </View>
        </View>
      )}

      {/* ── Timer ───────────────────────────────────────────────────────── */}
      <View style={styles.timerContainer}>
        <Heading
          size="display"
          style={[styles.timerText, { color: colors.foreground }]}
        >
          {formatTime(elapsedTime)}
        </Heading>
      </View>

      {/* ── Animated waveform ─────────────────────────────────────────────── */}
      <View style={styles.waveformContainer}>
        <View style={styles.waveformRow}>
          {barAnimValues.map((val, idx) => (
            <Animated.View
              key={idx}
              style={[
                styles.waveBar,
                {
                  backgroundColor:
                    recordingState === 'recording' ? colors.foreground : colors.border,
                  height: val.interpolate({
                    inputRange: [0, 1],
                    outputRange: [4, 80],
                  }),
                  opacity: recordingState === 'recording' ? 1 : 0.4,
                },
              ]}
            />
          ))}
        </View>
      </View>

      {/* ── Voice commands helper guide ───────────────────────────────────── */}
      <View style={styles.guideContainer}>
        <View
          style={[
            styles.guideCard,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
        >
          <Label size="xs" style={{ color: colors.muted, marginBottom: SPACING.md, letterSpacing: 1.5, textTransform: 'uppercase', textAlign: 'center' }}>
            Voice Command Guide
          </Label>
          
          <View style={styles.guideRow}>
            <Caption size="sm" style={{ color: colors.foreground, fontWeight: 'bold', width: 90 }}>
              Lists:
            </Caption>
            <Caption size="sm" style={{ color: colors.muted, flex: 1 }}>
              "add item Buy coffee"
            </Caption>
          </View>

          <View style={styles.guideRow}>
            <Caption size="sm" style={{ color: colors.foreground, fontWeight: 'bold', width: 90 }}>
              Finance:
            </Caption>
            <Caption size="sm" style={{ color: colors.muted, flex: 1 }}>
              "add Rent cost 1200" or "add groceries 50"
            </Caption>
          </View>

          <View style={styles.guideRow}>
            <Caption size="sm" style={{ color: colors.foreground, fontWeight: 'bold', width: 90 }}>
              References:
            </Caption>
            <Caption size="sm" style={{ color: colors.muted, flex: 1 }}>
              "add reference here" to link other notes
            </Caption>
          </View>
        </View>
      </View>

      {/* ── Bottom controls ──────────────────────────────────────────────── */}
      <View style={styles.controls}>
        {/* Cancel */}
        <TouchableOpacity
          style={[styles.controlBtnSm, { borderColor: colors.border }]}
          onPress={handleCancel}
          activeOpacity={0.8}
        >
          <X size={18} color={colors.foreground} />
        </TouchableOpacity>

        {/* Play / Pause — main CTA */}
        <TouchableOpacity
          style={[
            styles.controlBtnLg,
            { backgroundColor: colors.foreground },
            SHADOWS.md,
          ]}
          onPress={handlePauseResume}
          activeOpacity={0.88}
        >
          {recordingState === 'recording' ? (
            <Pause size={26} color={colors.background} fill={colors.background} />
          ) : (
            <Play
              size={26}
              color={colors.background}
              fill={colors.background}
              style={{ marginLeft: 3 }}
            />
          )}
        </TouchableOpacity>

        {/* Finish / Save */}
        <TouchableOpacity
          style={[styles.controlBtnSm, { borderColor: colors.border }]}
          onPress={handleFinish}
          activeOpacity={0.8}
        >
          <Check size={18} color={colors.foreground} />
        </TouchableOpacity>
      </View>

      {/* ── Reference picker modal ───────────────────────────────────────── */}
      <Modal
        visible={showReferenceModal}
        transparent
        animationType="slide"
        onRequestClose={() => {
          setShowReferenceModal(false);
          resumeRecording();
        }}
      >
        <View style={styles.modalOverlay}>
          <View
            style={[
              styles.modalSheet,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <View style={styles.modalHandle} />
            <Heading size="md" style={{ color: colors.foreground, marginBottom: SPACING.xs }}>
              Link note
            </Heading>
            <Caption size="sm" style={{ color: colors.muted, marginBottom: SPACING.lg }}>
              Select a note to link. Recording resumes after.
            </Caption>

            <TextInput
              style={[
                styles.modalSearch,
                {
                  color: colors.foreground,
                  borderColor: colors.border,
                  backgroundColor: colors.surface,
                },
              ]}
              placeholder="Search notes…"
              placeholderTextColor={colors.placeholder}
              value={modalSearchQuery}
              onChangeText={setModalSearchQuery}
            />

            <ScrollView style={styles.modalList} showsVerticalScrollIndicator={false}>
              {dbNotes
                .filter((n) =>
                  n.title.toLowerCase().includes(modalSearchQuery.toLowerCase())
                )
                .map((note) => (
                  <TouchableOpacity
                    key={note.id}
                    style={[styles.modalItem, { borderColor: colors.border }]}
                    onPress={() => {
                      triggerHaptic('selection');
                      insertReference(note.title);
                    }}
                    activeOpacity={0.8}
                  >
                    <Body size="sm" style={{ color: colors.foreground, fontWeight: TYPOGRAPHY.weights.medium }}>
                      {note.title}
                    </Body>
                    <Caption size="xs" style={{ color: colors.muted, marginTop: 2 }}>
                      {note.type.toUpperCase()} ·{' '}
                      {new Date(note.createdAt).toLocaleDateString([], {
                        month: 'short',
                        day: 'numeric',
                      })}
                    </Caption>
                  </TouchableOpacity>
                ))}
              {dbNotes.filter((n) =>
                n.title.toLowerCase().includes(modalSearchQuery.toLowerCase())
              ).length === 0 && (
                <Caption
                  size="sm"
                  style={{ color: colors.muted, textAlign: 'center', marginTop: SPACING.xl }}
                >
                  No notes found.
                </Caption>
              )}
            </ScrollView>

            <TouchableOpacity
              style={[styles.modalClose, { borderColor: colors.border }]}
              onPress={() => {
                setShowReferenceModal(false);
                resumeRecording();
              }}
              activeOpacity={0.8}
            >
              <Body size="sm" style={{ color: colors.foreground, fontWeight: TYPOGRAPHY.weights.semibold }}>
                Cancel
              </Body>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {recordingState === 'transcribing' && (
        <View style={[StyleSheet.absoluteFill, styles.transcribingOverlay, { backgroundColor: colors.overlayStrong }]}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Heading size="md" style={{ color: '#FFFFFF', marginTop: SPACING.lg }}>
            Transcribing audio...
          </Heading>
          <Caption size="sm" style={{ color: colors.muted, marginTop: SPACING.xs, textAlign: 'center', paddingHorizontal: SPACING.xl }}>
            Structuring your speech and commands
          </Caption>
        </View>
      )}
    </ScreenWrapper>
  );
};

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: SPACING.xl,
    paddingTop: SPACING.lg,
    paddingBottom: SPACING.xxl,
    justifyContent: 'space-between',
  },
  // ── Download screen ───────────────────────────────────────────────────────
  downloadScreen: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: SPACING.xxl,
  },
  downloadCard: {
    width: '100%',
    alignItems: 'center',
  },
  progressTrack: {
    width: '100%',
    height: 2,
    borderRadius: 1,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 1,
  },
  // ── Top bar ───────────────────────────────────────────────────────────────
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  typeSelector: {
    flexDirection: 'row',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: RADIUS.sm,
    padding: 2,
    gap: 2,
  },
  typeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: RADIUS.xs,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  recDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  // ── Note title ────────────────────────────────────────────────────────────
  noteTitle: {
    marginBottom: SPACING.xs,
    letterSpacing: TYPOGRAPHY.tracking.tight,
  },
  noteTitleInput: {
    marginBottom: SPACING.xs,
    letterSpacing: TYPOGRAPHY.tracking.tight,
    paddingHorizontal: SPACING.md,
  },
  // ── Finance ───────────────────────────────────────────────────────────────
  financeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: RADIUS.sm,
    paddingVertical: SPACING.md,
    marginBottom: SPACING.sm,
  },
  financeCol: {
    alignItems: 'center',
    flex: 1,
    gap: 3,
  },
  financeDivider: {
    width: StyleSheet.hairlineWidth,
    height: 30,
  },
  // ── Timer ─────────────────────────────────────────────────────────────────
  timerContainer: {
    alignItems: 'center',
    paddingVertical: SPACING.xs,
  },
  timerText: {
    fontFamily: 'monospace',
    letterSpacing: 2,
  },
  // ── Waveform ──────────────────────────────────────────────────────────────
  waveformContainer: {
    height: 90,
    alignItems: 'center',
    justifyContent: 'center',
  },
  waveformRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    paddingHorizontal: SPACING.sm,
  },
  waveBar: {
    width: 5,
    borderRadius: 2.5,
    marginHorizontal: 1,
  },
  // ── Voice Command Guide ───────────────────────────────────────────────────
  guideContainer: {
    flex: 1,
    justifyContent: 'center',
    marginVertical: SPACING.xl,
  },
  guideCard: {
    borderWidth: 1,
    borderRadius: 16,
    padding: SPACING.lg,
    gap: SPACING.sm,
  },
  guideRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 2,
  },
  // ── Controls ──────────────────────────────────────────────────────────────
  controls: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingTop: SPACING.md,
  },
  controlBtnSm: {
    width: 48,
    height: 48,
    borderRadius: RADIUS.full,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  controlBtnLg: {
    width: 72,
    height: 72,
    borderRadius: RADIUS.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // ── Modal ─────────────────────────────────────────────────────────────────
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  modalSheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    paddingTop: SPACING.lg,
    paddingHorizontal: SPACING.xl,
    paddingBottom: SPACING.xxl,
    maxHeight: '80%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 24,
  },
  modalHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(128,128,128,0.25)',
    alignSelf: 'center',
    marginBottom: SPACING.md,
  },
  modalSearch: {
    height: 46,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: SPACING.md,
    fontSize: 15,
    marginBottom: SPACING.lg,
  },
  modalList: {
    maxHeight: 240,
    marginBottom: SPACING.md,
  },
  modalItem: {
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.md,
    borderBottomWidth: 1,
    borderRadius: 8,
    marginBottom: 4,
  },
  modalClose: {
    paddingVertical: SPACING.md,
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    marginTop: SPACING.sm,
  },
  transcribingOverlay: {
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 9999,
  },
});
