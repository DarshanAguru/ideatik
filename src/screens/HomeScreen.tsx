import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import {
  StyleSheet,
  View,
  TouchableOpacity,
  ScrollView,
  Animated,
  Easing,
  Platform,
  PanResponder,
  LayoutAnimation,
  UIManager,
} from 'react-native';
import { ScreenWrapper, PressableScale } from '../components/ScreenWrapper';
import { Heading, Body, Caption, Label } from '../components/Typography';
import { SPACING, COLORS, TYPOGRAPHY, RADIUS, SHADOWS, ANIMATION } from '../theme/theme';
import { useSettingsStore } from '../features/settings/settingsStore';
import { Mic, RotateCcw, Save, Trash2, FileText, CheckSquare, Lock, DollarSign, Pin, ChevronUp, ChevronDown } from 'lucide-react-native';
import { NoteRepository } from '../services/database/NoteRepository';
import { StructuredNoteService } from '../services/notes/StructuredNoteService';

import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useRecordingStore } from '../features/recording/recordingStore';
import { useNotesStore } from '../features/notes/notesStore';
import { triggerHaptic } from '../utils/haptics';
import { markdownParser } from '../services/parsers/markdownParser';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from './AppNavigator';
import { RecoveryManager } from '../services/recovery/recoveryManager';
import { RecordingSnapshot } from '../services/recovery/recordingSnapshot';

if (Platform.OS === 'android') {
  if (UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
  }
}

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
  const { 
    notesList, 
    loadNotes, 
    pinnedOrder, 
    recentOrder, 
    setPinnedOrder, 
    setRecentOrder 
  } = useNotesStore();

  const pinnedNotes = useMemo(() => {
    const list = notesList.filter((n) => n.isPinned && !n.isDeleted);
    const sorted = [...list].sort((a, b) => {
      const idxA = pinnedOrder.indexOf(a.id);
      const idxB = pinnedOrder.indexOf(b.id);
      if (idxA === -1 && idxB === -1) return 0;
      if (idxA === -1) return 1;
      if (idxB === -1) return -1;
      return idxA - idxB;
    });
    return sorted.slice(0, 5).map((note) => {
      const parsed = markdownParser.parse(note.markdownContent);
      return { ...note, parsed };
    });
  }, [notesList, pinnedOrder]);

  const recentNotes = useMemo(() => {
    const pinnedIds = new Set(pinnedNotes.map((n) => n.id));
    const list = notesList.filter((n) => !pinnedIds.has(n.id) && !n.isDeleted);
    const sorted = [...list].sort((a, b) => {
      const idxA = recentOrder.indexOf(a.id);
      const idxB = recentOrder.indexOf(b.id);
      if (idxA === -1 && idxB === -1) return 0;
      if (idxA === -1) return 1;
      if (idxB === -1) return -1;
      return idxA - idxB;
    });
    return sorted.map((note) => {
      const parsed = markdownParser.parse(note.markdownContent);
      return { ...note, parsed };
    });
  }, [notesList, pinnedNotes, recentOrder]);

  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const activeDragIdRef = useRef<string | null>(null);
  const dragPan = useRef(new Animated.ValueXY()).current;

  const cardLayouts = useRef<{ [id: string]: { x: number; y: number; w: number; h: number; isPinned: boolean } }>({});
  const leftColumnX = useRef(0);
  const rightColumnX = useRef(0);

  const wiggleAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let animation: Animated.CompositeAnimation | null = null;
    if (activeDragId !== null) {
      animation = Animated.loop(
        Animated.sequence([
          Animated.timing(wiggleAnim, {
            toValue: 1,
            duration: 90,
            useNativeDriver: true,
          }),
          Animated.timing(wiggleAnim, {
            toValue: -1,
            duration: 90,
            useNativeDriver: true,
          }),
        ])
      );
      animation.start();
    } else {
      wiggleAnim.setValue(0);
    }
    return () => {
      if (animation) {
        animation.stop();
      }
    };
  }, [activeDragId, wiggleAnim]);

  const handleCardLongPress = (id: string) => {
    triggerHaptic('success');
    activeDragIdRef.current = id;
    setActiveDragId(id);
    dragPan.setValue({ x: 0, y: 0 });
  };

  const panRespondersRef = useRef<{ [id: string]: any }>({});
  const getPanResponder = (id: string, isPinned: boolean) => {
    if (!panRespondersRef.current[id]) {
      panRespondersRef.current[id] = PanResponder.create({
        onStartShouldSetPanResponder: () => activeDragIdRef.current === id,
        onMoveShouldSetPanResponder: () => activeDragIdRef.current === id,
        onPanResponderGrant: () => {
          triggerHaptic('impact');
        },
        onPanResponderMove: (evt, gestureState) => {
          dragPan.setValue({ x: gestureState.dx, y: gestureState.dy });
        },
        onPanResponderRelease: async (evt, gestureState) => {
          const draggingId = activeDragIdRef.current;
          if (draggingId !== id) return;

          const startLayout = cardLayouts.current[draggingId];
          if (startLayout) {
            const touchX = startLayout.x + gestureState.dx + startLayout.w / 2;
            const touchY = startLayout.y + gestureState.dy + startLayout.h / 2;

            let closestId = null;
            let minDistance = Infinity;
            for (const [cardId, layout] of Object.entries(cardLayouts.current)) {
              if (cardId === draggingId) continue;
              if (layout.isPinned !== isPinned) continue;

              const centerX = layout.x + layout.w / 2;
              const centerY = layout.y + layout.h / 2;
              const dist = Math.hypot(touchX - centerX, touchY - centerY);
              if (dist < minDistance) {
                minDistance = dist;
                closestId = cardId;
              }
            }

            if (closestId) {
              const list = isPinned ? pinnedNotes : recentNotes;
              const currentIds = list.map((n) => n.id);
              const fromIndex = currentIds.indexOf(draggingId);
              const toIndex = currentIds.indexOf(closestId);

              if (fromIndex !== -1 && toIndex !== -1) {
                const newOrder = [...currentIds];
                newOrder.splice(fromIndex, 1);
                newOrder.splice(toIndex, 0, draggingId);

                if (Platform.OS === 'ios' || Platform.OS === 'android') {
                  LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                }

                if (isPinned) {
                  await setPinnedOrder(newOrder);
                } else {
                  await setRecentOrder(newOrder);
                }
              }
            }
          }

          activeDragIdRef.current = null;
          setActiveDragId(null);
          dragPan.setValue({ x: 0, y: 0 });
          triggerHaptic('selection');
        },
        onPanResponderTerminate: () => {
          activeDragIdRef.current = null;
          setActiveDragId(null);
          dragPan.setValue({ x: 0, y: 0 });
        }
      });
    }
    return panRespondersRef.current[id];
  };

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

  const leftPinnedData = useMemo(() => {
    return pinnedNotes.filter((_, idx) => idx % 2 === 0);
  }, [pinnedNotes]);

  const rightPinnedData = useMemo(() => {
    return pinnedNotes.filter((_, idx) => idx % 2 === 1);
  }, [pinnedNotes]);

  const leftColumnData = useMemo(() => {
    return recentNotes.filter((_, idx) => idx % 2 === 0);
  }, [recentNotes]);

  const rightColumnData = useMemo(() => {
    return recentNotes.filter((_, idx) => idx % 2 === 1);
  }, [recentNotes]);

  const renderNoteCard = (item: any) => {
    const isPinned = item.isPinned;
    const structured = StructuredNoteService.fromNote(item);
    
    // Select correct icon based on note type
    let TypeIcon = FileText;
    if (item.type === 'list') TypeIcon = CheckSquare;
    if (item.type === 'finance') TypeIcon = DollarSign;

    const listForIndex = isPinned ? pinnedNotes : recentNotes;
    const idx = listForIndex.findIndex((n) => n.id === item.id);

    const isDraggingThisCard = activeDragId === item.id;
    const isAnyCardDragging = activeDragId !== null;

    const rotate = wiggleAnim.interpolate({
      inputRange: [-1, 1],
      outputRange: ['-1deg', '1deg'],
    });

    const animatedStyle = [
      (isAnyCardDragging && !isDraggingThisCard) && {
        transform: [{ rotate }],
      },
      isDraggingThisCard && {
        transform: [
          { translateX: dragPan.x },
          { translateY: dragPan.y },
          { scale: 1.05 },
          { rotate },
        ],
        zIndex: 999,
        opacity: 0.9,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.25,
        shadowRadius: 10,
        elevation: 8,
      }
    ];

    const responder = getPanResponder(item.id, isPinned);

    return (
      <Animated.View 
        key={item.id} 
        style={animatedStyle}
        {...responder.panHandlers}
        onLayout={(e) => {
          const { x, y, width, height } = e.nativeEvent.layout;
          const colX = idx % 2 === 0 ? leftColumnX.current : rightColumnX.current;
          cardLayouts.current[item.id] = {
            x: colX,
            y,
            w: width,
            h: height,
            isPinned,
          };
        }}
      >
        <PressableScale
          onPress={() => {
            if (isAnyCardDragging) return;
            navigation.navigate('NoteDetail', { noteId: item.id });
          }}
          onLongPress={() => handleCardLongPress(item.id)}
          delayLongPress={500}
          style={[
            styles.noteCard,
            { backgroundColor: colors.card, borderColor: colors.border },
            SHADOWS.sm,
            isDraggingThisCard && { borderColor: colors.accent, borderWidth: 1.5 },
          ]}
          scaleValue={0.98}
        >
          <View style={styles.noteHeaderRow}>
            <View style={styles.iconTitleRow}>
              {item.isLocked ? (
                <Lock size={12} color={colors.foreground} style={{ marginRight: 4 }} />
              ) : (
                <TypeIcon size={12} color={colors.muted} style={{ marginRight: 4 }} />
              )}
              <Body
                size="sm"
                numberOfLines={2}
                style={[styles.noteTitle, { color: colors.foreground }]}
              >
                {item.title || 'Untitled'}
              </Body>
            </View>
            {isPinned && (
              <Pin size={11} color={colors.foreground} fill={colors.foreground} style={{ transform: [{ rotate: '45deg' }], marginLeft: 4 }} />
            )}
          </View>

          <View style={styles.cardContentContainer}>
            {item.isLocked ? (
              <Caption
                size="xs"
                style={[styles.notePreview, { color: colors.muted, fontStyle: 'italic' }]}
              >
                Locked note (tap to unlock)
              </Caption>
            ) : item.type === 'list' ? (
              <View style={styles.listPreviewContainer}>
                {structured.listItems.slice(0, 3).map((listItem: any) => (
                  <View style={styles.miniListItem} key={listItem.id}>
                    {listItem.checked ? (
                      <CheckSquare size={11} color={colors.muted} />
                    ) : (
                      <View style={[styles.miniSquare, { borderColor: colors.border }]} />
                    )}
                    <Caption
                      size="xs"
                      numberOfLines={1}
                      style={{
                        color: colors.muted,
                        marginLeft: 4,
                        flex: 1,
                        textDecorationLine: listItem.checked ? 'line-through' : 'none',
                      }}
                    >
                      {listItem.text}
                    </Caption>
                  </View>
                ))}
                {structured.listItems.length > 3 && (
                  <Caption size="xs" style={{ color: colors.muted, fontStyle: 'italic', marginTop: 2 }}>
                    +{structured.listItems.length - 3} more items
                  </Caption>
                )}
              </View>
            ) : item.type === 'finance' ? (
              <View style={styles.financePreviewContainer}>
                {(() => {
                  const total = structured.financeItems.reduce(
                    (acc: number, current: any) => acc + (current.amount || 0),
                    0
                  );
                  return (
                    <View style={{ marginBottom: 4 }}>
                      <Caption
                        size="xs"
                        style={{
                          color: total >= 0 ? colors.foreground : colors.error,
                          fontWeight: '700',
                        }}
                      >
                        Net: {total >= 0 ? '+' : '-'}₹{Math.abs(total).toFixed(0)}
                      </Caption>
                    </View>
                  );
                })()}
                {structured.financeItems.slice(0, 2).map((financeItem: any) => (
                  <View style={styles.miniListItem} key={financeItem.id}>
                    <Caption
                      size="xs"
                      numberOfLines={1}
                      style={{ color: colors.muted, flex: 1 }}
                    >
                      {financeItem.text}
                    </Caption>
                    <Caption
                      size="xs"
                      style={{
                        color:
                          financeItem.amount && financeItem.amount >= 0
                            ? colors.foreground
                            : colors.error,
                        fontWeight: '500',
                        marginLeft: 4,
                      }}
                    >
                      {financeItem.amount && financeItem.amount >= 0 ? '+₹' : '-₹'}
                      {financeItem.amount !== undefined ? Math.abs(financeItem.amount).toFixed(0) : ''}
                    </Caption>
                  </View>
                ))}
                {structured.financeItems.length > 2 && (
                  <Caption size="xs" style={{ color: colors.muted, fontStyle: 'italic', marginTop: 2 }}>
                    +{structured.financeItems.length - 2} more items
                  </Caption>
                )}
              </View>
            ) : (
              // Default note type
              structured.bodyBlocks && structured.bodyBlocks.length > 0 ? (
                <Caption
                  size="xs"
                  numberOfLines={3}
                  style={[styles.notePreview, { color: colors.muted }]}
                >
                  {structured.bodyBlocks.join('\n\n')}
                </Caption>
              ) : item.parsed.bodyText ? (
                <Caption
                  size="xs"
                  numberOfLines={3}
                  style={[styles.notePreview, { color: colors.muted }]}
                >
                  {item.parsed.bodyText}
                </Caption>
              ) : (
                <Caption
                  size="xs"
                  style={[styles.notePreview, { color: colors.muted, fontStyle: 'italic' }]}
                >
                  Empty note
                </Caption>
              )
            )}
          </View>

          <View style={styles.cardFooter}>
            <Caption size="xs" style={{ color: colors.muted }}>
              {formatDate(item.createdAt)}
            </Caption>
          </View>
        </PressableScale>
      </Animated.View>
    );
  };

  return (
    <ScreenWrapper style={{ flex: 1 }} safeBottom={false}>
      <ScrollView scrollEnabled={activeDragId === null} showsVerticalScrollIndicator={false} contentContainerStyle={styles.container}>
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

        {/* ── Pinned Section ────────────────────────────────────────────────── */}
        {pinnedNotes.length > 0 && (
          <View style={styles.pinnedSection}>
            <View style={styles.sectionHeader}>
              <Body
                size="sm"
                style={{
                  color: colors.foreground,
                  fontWeight: TYPOGRAPHY.weights.semibold,
                  letterSpacing: TYPOGRAPHY.tracking.tight,
                }}
              >
                Pinned
              </Body>
            </View>
            <View style={styles.masonryGrid}>
              <View 
                style={styles.masonryColumn}
                onLayout={(e) => {
                  leftColumnX.current = e.nativeEvent.layout.x;
                }}
              >
                {leftPinnedData.map((item) => renderNoteCard(item))}
              </View>
              <View 
                style={styles.masonryColumn}
                onLayout={(e) => {
                  rightColumnX.current = e.nativeEvent.layout.x;
                }}
              >
                {rightPinnedData.map((item) => renderNoteCard(item))}
              </View>
            </View>
          </View>
        )}

        {/* ── Recent Captures ───────────────────────────────────────────────── */}
        <View style={styles.recentSection}>
          <View style={styles.sectionHeader}>
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
          </View>

          {recentNotes.length === 0 ? (
            <Caption
              size="sm"
              style={{ color: colors.muted, textAlign: 'center', marginTop: SPACING.lg }}
            >
              No recent captures found.
            </Caption>
          ) : (
            <View style={styles.masonryGrid}>
              <View 
                style={styles.masonryColumn}
                onLayout={(e) => {
                  leftColumnX.current = e.nativeEvent.layout.x;
                }}
              >
                {leftColumnData.map((item) => renderNoteCard(item))}
              </View>
              <View 
                style={styles.masonryColumn}
                onLayout={(e) => {
                  rightColumnX.current = e.nativeEvent.layout.x;
                }}
              >
                {rightColumnData.map((item) => renderNoteCard(item))}
              </View>
            </View>
          )}
        </View>
      </ScrollView>
    </ScreenWrapper>
  );
};

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: SPACING.xl,
    paddingTop: SPACING.xl,
    paddingBottom: SPACING.xxl,
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
    paddingVertical: SPACING.lg,
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
  // ── Pinned & Recent Grid ────────────────────────────────────────────────
  pinnedSection: {
    marginBottom: SPACING.xl,
  },
  recentSection: {
    flex: 1,
    marginBottom: SPACING.xl,
  },
  sectionHeader: {
    marginBottom: SPACING.md,
  },
  masonryGrid: {
    flexDirection: 'row',
    gap: SPACING.md,
  },
  masonryColumn: {
    flex: 1,
    flexDirection: 'column',
    gap: SPACING.md,
  },
  noteCard: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.md,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'column',
    alignSelf: 'stretch',
  },
  noteHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: SPACING.xs,
  },
  iconTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  noteTitle: {
    fontWeight: TYPOGRAPHY.weights.semibold,
    flex: 1,
    fontSize: 13,
    lineHeight: 16,
  },
  cardContentContainer: {
    marginTop: 4,
    marginBottom: SPACING.xs,
  },
  listPreviewContainer: {
    marginTop: 2,
  },
  financePreviewContainer: {
    marginTop: 2,
  },
  miniListItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  miniSquare: {
    width: 8,
    height: 8,
    borderWidth: 1,
    borderRadius: 1.5,
  },
  notePreview: {
    fontSize: 11,
    lineHeight: 14,
  },
  cardFooter: {
    marginTop: SPACING.xs,
    alignItems: 'flex-end',
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
  doneButton: {
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.md,
    borderRadius: RADIUS.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reorderBar: {
    position: 'absolute',
    right: SPACING.xs,
    bottom: SPACING.xs,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: RADIUS.full,
    paddingHorizontal: 4,
    paddingVertical: 2,
    zIndex: 10,
  },
  reorderBtn: {
    padding: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  reorderDivider: {
    width: 1,
    height: 12,
    marginHorizontal: 2,
  },
});
