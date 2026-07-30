import React, { useCallback, useMemo, useState, useRef, useEffect } from 'react';
import {
  StyleSheet,
  View,
  ScrollView,
  FlatList,
  TouchableOpacity,
  TouchableWithoutFeedback,
  Alert,
  KeyboardAvoidingView,
  Platform,
  PanResponder,
  Vibration,
  LayoutChangeEvent,
  ActivityIndicator,
  Animated,
  Easing,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { ScreenWrapper, PressableScale } from '../components/ScreenWrapper';
import { Heading, Body, Caption, Label } from '../components/Typography';
import { SPACING, COLORS, TYPOGRAPHY, RADIUS, SHADOWS } from '../theme/theme';
import { useSettingsStore } from '../features/settings/settingsStore';
import { useNotesStore, NoteTab } from '../features/notes/notesStore';
import {
  FileText, CheckSquare, Trash2, IndianRupee, Mic,
  Share2, Lock, Grid2X2, List, Sparkles, Loader2,
} from 'lucide-react-native';
import { triggerHaptic } from '../utils/haptics';
import { StructuredNoteService } from '../services/notes/StructuredNoteService';
import { ShareOptionsModal } from '../components/ShareOptionsModal';
import { FilterBar } from '../components/FilterBar';
import { useTagsStore } from '../features/tags/tagsStore';
import { TagBadge } from '../components/TagBadge';
import { LocalVectorIndex } from '../services/ai/LocalVectorIndex';

const COL_GAP = SPACING.sm;

const TYPE_ICONS = {
  note: FileText,
  list: CheckSquare,
  finance: IndianRupee,
} as const;

const TABS: { id: NoteTab; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'notes', label: 'Notes' },
  { id: 'lists', label: 'Lists' },
];

const formatDate = (timestamp: number) => {
  const d = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return d.toLocaleDateString([], { weekday: 'short' });
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
};

const IndexingBadge = React.memo(({ colors }: { colors: any }) => {
  const spinAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.timing(spinAnim, {
        toValue: 1,
        duration: 1200,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    animation.start();
    return () => animation.stop();
  }, [spinAnim]);

  const spin = spinAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', marginLeft: 6 }}>
      <Animated.View style={{ transform: [{ rotate: spin }] }}>
        <Loader2 size={10} color={colors.foreground} />
      </Animated.View>
      <Caption size="xs" style={{ color: colors.foreground, fontSize: 9, marginLeft: 3, fontWeight: '600' }}>
        Embedding...
      </Caption>
    </View>
  );
});

// ─── Compact List View Row ───────────────────────────────────────────────────

const NoteListItem = React.memo(({
  item, colors, onPress, onDelete, onShare, isIndexed, isIndexing,
}: {
  item: any;
  colors: any;
  onPress: () => void;
  onDelete: () => void;
  onShare: () => void;
  isIndexed?: boolean;
  isIndexing?: boolean;
}) => {
  const { parsed } = item;
  const TypeIcon = TYPE_ICONS[item.type as keyof typeof TYPE_ICONS] || FileText;
  const parsedItems = StructuredNoteService.items(parsed);
  const bodyText = StructuredNoteService.bodyText(parsed);

  let mainSubtitle = '';
  let detailSubtitle = '';

  if (item.isLocked) {
    mainSubtitle = 'Locked note';
  } else if (item.type === 'list') {
    const checkedCount = parsedItems.filter((i: any) => i.checked).length;
    const uncheckedCount = parsedItems.filter((i: any) => !i.checked).length;
    mainSubtitle = `${checkedCount} checked, ${uncheckedCount} unchecked`;
    detailSubtitle = `${formatDate(item.createdAt)}`;
  } else if (item.type === 'finance') {
    const checkedCost = parsedItems.filter((i: any) => i.checked).reduce((s: number, i: any) => s + (i.amount || 0), 0);
    const uncheckedCost = parsedItems.filter((i: any) => !i.checked).reduce((s: number, i: any) => s + (i.amount || 0), 0);
    const totalCost = checkedCost + uncheckedCost;
    mainSubtitle = `Done: ₹${Math.abs(checkedCost).toLocaleString('en-IN')} • Pending: ₹${Math.abs(uncheckedCost).toLocaleString('en-IN')}`;
    detailSubtitle = `Total: ₹${Math.abs(totalCost).toLocaleString('en-IN')} • ${formatDate(item.createdAt)}`;
  } else if (bodyText) {
    mainSubtitle = bodyText.replace(/\n/g, ' ');
    detailSubtitle = formatDate(item.createdAt);
  } else {
    mainSubtitle = formatDate(item.createdAt);
  }

  return (
    <PressableScale
      onPress={onPress}
      style={[
        styles.listItemRow,
        { backgroundColor: colors.card, borderColor: colors.border },
        SHADOWS.sm,
      ]}
      scaleValue={0.98}
    >
      <View style={[styles.listIconBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        {item.isLocked ? (
          <Lock size={16} color={colors.foreground} />
        ) : (
          <TypeIcon size={16} color={colors.foreground} />
        )}
      </View>

      <View style={styles.listTextContainer}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Body
            size="sm"
            style={{
              color: colors.foreground,
              fontWeight: TYPOGRAPHY.weights.semibold,
              flexShrink: 1,
            }}
            numberOfLines={1}
          >
            {item.title || 'Untitled'}
          </Body>
          {isIndexing ? (
            <IndexingBadge colors={colors} />
          ) : isIndexed ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', marginLeft: 6 }}>
              <Sparkles size={10} color={colors.foreground} />
              <Caption size="xs" style={{ color: colors.foreground, fontSize: 9, marginLeft: 2, fontWeight: '600' }}>AI</Caption>
            </View>
          ) : null}
        </View>
        <Caption size="xs" style={{ color: colors.foreground, marginTop: 2, opacity: 0.9 }} numberOfLines={1}>
          {mainSubtitle}
        </Caption>
        {detailSubtitle ? (
          <Caption size="xs" style={{ color: colors.muted, marginTop: 1 }} numberOfLines={1}>
            {detailSubtitle}
          </Caption>
        ) : null}
      </View>

      <View style={styles.listActions}>
        <TouchableOpacity onPress={onShare} hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}>
          <Share2 size={15} color={colors.muted} />
        </TouchableOpacity>
        <TouchableOpacity onPress={onDelete} hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}>
          <Trash2 size={15} color={colors.muted} />
        </TouchableOpacity>
      </View>
    </PressableScale>
  );
});

// ─── Tile (Grid) View Note Card ──────────────────────────────────────────────

const NoteTileCard = React.memo(({
  item, colors, onPress, onDelete, onShare, isDragging, isIndexed, isIndexing,
}: {
  item: any;
  colors: any;
  onPress: () => void;
  onDelete: () => void;
  onShare: () => void;
  isDragging?: boolean;
  isIndexed?: boolean;
  isIndexing?: boolean;
}) => {
  const { parsed } = item;
  const TypeIcon = TYPE_ICONS[item.type as keyof typeof TYPE_ICONS] || FileText;
  const parsedItems = StructuredNoteService.items(parsed);
  const bodyText = StructuredNoteService.bodyText(parsed);

  // Meta badge text
  let meta = '';
  if (!item.isLocked) {
    if (item.type === 'list' && parsedItems.length > 0) {
      const done = parsedItems.filter((i: any) => i.checked).length;
      meta = `${done}/${parsedItems.length} done`;
    } else if (item.type === 'finance' && parsedItems.length > 0) {
      const total = parsedItems.reduce((s: number, i: any) => s + (i.amount || 0), 0);
      meta = `₹${Math.abs(total).toLocaleString('en-IN')}`;
    }
  }

  // Unchecked items first then checked
  const sortedListItems = [
    ...parsedItems.filter((i: any) => !i.checked),
    ...parsedItems.filter((i: any) => i.checked),
  ];

  const financeTotal = parsedItems.reduce((s: number, i: any) => s + (i.amount || 0), 0);

  return (
    <TouchableWithoutFeedback onPress={onPress}>
      <View
        style={[
          styles.tileCard,
          {
            borderColor: isDragging ? colors.foreground : colors.border,
            backgroundColor: colors.card,
            opacity: isDragging ? 0.8 : 1,
          },
          SHADOWS.sm,
        ]}
      >
        {/* Top Header: Chip left, Actions right */}
        <View style={styles.tileHeader}>
          <View style={styles.tileTypeRow}>
            <TypeIcon size={11} color={colors.muted} />
            <Label size="xs" style={{ color: colors.muted, marginLeft: 3, textTransform: 'capitalize' }}>
              {item.type}
            </Label>
            {isIndexing ? (
              <IndexingBadge colors={colors} />
            ) : isIndexed ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', marginLeft: 6 }}>
                <Sparkles size={10} color={colors.foreground} />
                <Caption size="xs" style={{ color: colors.foreground, fontSize: 9, marginLeft: 2, fontWeight: '600' }}>AI</Caption>
              </View>
            ) : null}
          </View>
          <View style={styles.tileActionsRight}>
            <TouchableOpacity onPress={onShare} hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}>
              <Share2 size={13} color={colors.muted} />
            </TouchableOpacity>
            <TouchableOpacity onPress={onDelete} hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}>
              <Trash2 size={13} color={colors.muted} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Title */}
        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4, marginBottom: 4 }}>
          {item.isLocked && <Lock size={12} color={colors.foreground} style={{ marginRight: 4 }} />}
          <Body
            size="sm"
            style={{
              color: colors.foreground,
              fontWeight: TYPOGRAPHY.weights.semibold,
              flex: 1,
              lineHeight: 18,
            }}
            numberOfLines={3}
          >
            {item.title}
          </Body>
        </View>

        {/* Full Content Preview */}
        {item.isLocked ? (
          <Caption size="xs" style={{ color: colors.muted, fontStyle: 'italic' }}>
            Locked note — tap to unlock
          </Caption>
        ) : item.type === 'list' ? (
          <View>
            {sortedListItems.map((li: any) => (
              <View key={li.id} style={{ flexDirection: 'row', alignItems: 'flex-start', marginTop: 3 }}>
                {li.checked ? (
                  <CheckSquare size={10} color={colors.muted} style={{ marginTop: 2, flexShrink: 0 }} />
                ) : (
                  <View style={{
                    width: 9, height: 9, marginTop: 3, flexShrink: 0,
                    borderWidth: 1.2, borderColor: colors.border, borderRadius: 2,
                  }} />
                )}
                <Caption
                  size="xs"
                  style={{
                    color: li.checked ? colors.muted : colors.foreground,
                    marginLeft: 5,
                    flex: 1,
                    textDecorationLine: li.checked ? 'line-through' : 'none',
                    lineHeight: 16,
                  }}
                >
                  {li.text}
                </Caption>
              </View>
            ))}
            {parsedItems.length === 0 && bodyText ? (
              <Caption size="xs" style={{ color: colors.muted, lineHeight: 16, marginTop: 2 }}>
                {bodyText}
              </Caption>
            ) : null}
          </View>
        ) : item.type === 'finance' ? (
          <View>
            {parsedItems.map((fi: any) => (
              <View key={fi.id} style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 3 }}>
                <Caption size="xs" style={{ color: colors.foreground, flex: 1 }} numberOfLines={1}>
                  {fi.text}
                </Caption>
                {fi.amount !== undefined && (
                  <Caption size="xs" style={{ color: colors.foreground, fontWeight: '600', marginLeft: 6 }}>
                    ₹{Math.abs(fi.amount).toLocaleString('en-IN')}
                  </Caption>
                )}
              </View>
            ))}
            {parsedItems.length > 1 && (
              <View style={{
                flexDirection: 'row', justifyContent: 'space-between',
                marginTop: 6, paddingTop: 4,
                borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.border,
              }}>
                <Caption size="xs" style={{ color: colors.muted, fontWeight: '600' }}>Total</Caption>
                <Caption size="xs" style={{ color: colors.foreground, fontWeight: '700' }}>
                  ₹{Math.abs(financeTotal).toLocaleString('en-IN')}
                </Caption>
              </View>
            )}
          </View>
        ) : bodyText ? (
          <Caption size="xs" style={{ color: colors.muted, lineHeight: 17 }}>
            {bodyText}
          </Caption>
        ) : null}

        {/* Date & Meta footer */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, paddingTop: 4, borderTopWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(128,128,128,0.1)' }}>
          <Caption size="xs" style={{ color: colors.muted, opacity: 0.7 }}>
            {formatDate(item.createdAt)}
          </Caption>
          {meta ? (
            <Caption size="xs" style={{ color: colors.muted, fontWeight: '500' }}>
              {meta}
            </Caption>
          ) : null}
        </View>
      </View>
    </TouchableWithoutFeedback>
  );
});

// ─── Masonry Grid with Drag and Drop ─────────────────────────────────────────

const MasonryGrid = ({
  notes, colors, onPress, onDelete, onShare, onReorder, indexedNoteIds, pendingNoteIds,
}: {
  notes: any[];
  colors: any;
  onPress: (id: string) => void;
  onDelete: (id: string, title: string) => void;
  onShare: (note: any) => void;
  onReorder: (ids: string[]) => void;
  indexedNoteIds: Set<string>;
  pendingNoteIds: Set<string>;
}) => {
  const [orderedIds, setOrderedIds] = useState<string[]>(() => notes.map((n) => n.id));
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [hoverTargetId, setHoverTargetId] = useState<string | null>(null);
  const cardLayouts = useRef<Record<string, { x: number; y: number; w: number; h: number }>>({});
  const draggingIdRef = useRef<string | null>(null);
  const hoverRef = useRef<string | null>(null);

  useEffect(() => {
    const cur = new Set(notes.map((n) => n.id));
    setOrderedIds((prev) => {
      const kept = prev.filter((id) => cur.has(id));
      const added = notes.map((n) => n.id).filter((id) => !prev.includes(id));
      const merged = [...kept, ...added];
      if (merged.join(',') !== prev.join(',')) {
        return merged;
      }
      return prev;
    });
  }, [notes]);

  const orderedNotes = useMemo(() => {
    const map = new Map(notes.map((n) => [n.id, n]));
    return orderedIds.filter((id) => map.has(id)).map((id) => map.get(id)!);
  }, [notes, orderedIds]);

  const [leftCol, rightCol] = useMemo(() => {
    const left: any[] = [];
    const right: any[] = [];
    orderedNotes.forEach((n, i) => (i % 2 === 0 ? left.push(n) : right.push(n)));
    return [left, right];
  }, [orderedNotes]);

  const buildPanResponder = (id: string) =>
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: () => false,
      onStartShouldSetPanResponderCapture: () => false,
      onMoveShouldSetPanResponderCapture: () => false,

      onPanResponderGrant: (_e, _g) => {},
      onPanResponderMove: (_e, g) => {
        const srcLayout = cardLayouts.current[id];
        if (!srcLayout || !draggingIdRef.current) return;

        const cx = srcLayout.x + srcLayout.w / 2 + g.dx;
        const cy = srcLayout.y + srcLayout.h / 2 + g.dy;

        let closest: string | null = null;
        let minDist = Infinity;
        for (const [cid, l] of Object.entries(cardLayouts.current)) {
          if (cid === id) continue;
          const dx = cx - (l.x + l.w / 2);
          const dy = cy - (l.y + l.h / 2);
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d < minDist) { minDist = d; closest = cid; }
        }
        hoverRef.current = closest;
        setHoverTargetId(closest);
      },
      onPanResponderRelease: () => {
        const from = draggingIdRef.current;
        const to = hoverRef.current;
        if (from && to && from !== to) {
          setOrderedIds((prev) => {
            const next = [...prev];
            const fi = next.indexOf(from);
            const ti = next.indexOf(to);
            if (fi !== -1 && ti !== -1) {
              next.splice(fi, 1);
              next.splice(ti, 0, from);
            }
            onReorder(next);
            return next;
          });
        }
        draggingIdRef.current = null;
        hoverRef.current = null;
        setDraggingId(null);
        setHoverTargetId(null);
      },
      onPanResponderTerminate: () => {
        draggingIdRef.current = null;
        hoverRef.current = null;
        setDraggingId(null);
        setHoverTargetId(null);
      },
    });

  const panResponders = useMemo(() => {
    const m: Record<string, ReturnType<typeof PanResponder.create>> = {};
    orderedNotes.forEach((n) => { m[n.id] = buildPanResponder(n.id); });
    return m;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderedNotes.map((n) => n.id).join(','), hoverTargetId]);

  const renderCard = (item: any) => {
    const isDragging = draggingId === item.id;
    const isHoverTarget = hoverTargetId === item.id && draggingId !== null;

    return (
      <TouchableOpacity
        key={item.id}
        activeOpacity={1}
        style={[
          styles.masonryCardWrapper,
          isHoverTarget && { opacity: 0.45, transform: [{ scale: 0.97 }] },
        ]}
        onLayout={(e: LayoutChangeEvent) => {
          const { x, y, width, height } = e.nativeEvent.layout;
          cardLayouts.current[item.id] = { x, y, w: width, h: height };
        }}
        onLongPress={() => {
          Vibration.vibrate(40);
          draggingIdRef.current = item.id;
          setDraggingId(item.id);
        }}
        delayLongPress={400}
        {...(panResponders[item.id]?.panHandlers ?? {})}
      >
        <NoteTileCard
          item={item}
          colors={colors}
          isDragging={isDragging}
          isIndexing={pendingNoteIds.has(item.id)}
          isIndexed={indexedNoteIds.has(item.id)}
          onPress={() => { if (!draggingId) onPress(item.id); }}
          onDelete={() => onDelete(item.id, item.title)}
          onShare={() => onShare(item)}
        />
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.masonryGrid}>
      <View style={styles.masonryColumn}>{leftCol.map(renderCard)}</View>
      <View style={styles.masonryColumn}>{rightCol.map(renderCard)}</View>
    </View>
  );
};

// ─── Screen ───────────────────────────────────────────────────────────────────

export const NotesScreen: React.FC = () => {
  const themeMode = useSettingsStore((s) => s.themeMode);
  const notesLayout = useSettingsStore((s) => s.notesLayout);
  const setNotesLayout = useSettingsStore((s) => s.setNotesLayout);
  const colors = COLORS[themeMode];
  const navigation = useNavigation<any>();
  const [shareNote, setShareNote] = useState<any | null>(null);
  const [indexedNoteIds, setIndexedNoteIds] = useState<Set<string>>(new Set());
  const [pendingNoteIds, setPendingNoteIds] = useState<Set<string>>(new Set());
  const { tags, loadTags } = useTagsStore();

  const {
    notesList,
    searchQuery,
    selectedTab,
    setSearchQuery,
    setSelectedTab,
    setFilters,
    loadNotes,
    deleteNote,
    getFilteredNotes,
    setRecentOrder,
  } = useNotesStore();

  const refreshIndexStatus = useCallback(async () => {
    try {
      const [indexed, pending] = await Promise.all([
        LocalVectorIndex.getIndexedNoteIds(),
        LocalVectorIndex.getPendingNoteIds(),
      ]);
      setIndexedNoteIds(indexed);
      setPendingNoteIds(pending);

      const hasEmbeddingModel = !!useSettingsStore.getState().embeddingModelUri;
      if (hasEmbeddingModel) {
        const currentNotes = useNotesStore.getState().notesList;
        for (const note of currentNotes) {
          if (!note.isDeleted && !note.isLocked && !indexed.has(note.id) && !pending.has(note.id)) {
            LocalVectorIndex.schedule(note.id);
          }
        }
      }
    } catch {}
  }, []);

  useFocusEffect(useCallback(() => {
    loadNotes();
    loadTags();
    refreshIndexStatus();
    const interval = setInterval(refreshIndexStatus, 800);
    return () => clearInterval(interval);
  }, [loadNotes, loadTags, refreshIndexStatus]));

  const handleDelete = useCallback((id: string, title: string) => {
    triggerHaptic('impact');
    Alert.alert('Delete Capture', `Delete "${title}"?`, [
      { text: 'Keep', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteNote(id) },
    ]);
  }, [deleteNote]);

  const showExportOptions = useCallback((note: any) => {
    triggerHaptic('selection');
    setShareNote(note);
  }, []);

  const parsedAndFilteredNotes = useMemo(() => {
    const list = getFilteredNotes();
    return list.map((note) => ({ ...note, parsed: StructuredNoteService.fromNote(note) }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notesList, searchQuery, selectedTab, getFilteredNotes]);

  const renderListItem = useCallback(({ item }: { item: any }) => (
    <View style={{ marginBottom: SPACING.md }}>
      <NoteListItem
        item={item}
        colors={colors}
        isIndexing={pendingNoteIds.has(item.id)}
        isIndexed={indexedNoteIds.has(item.id)}
        onPress={() => navigation.navigate('NoteDetail', { noteId: item.id })}
        onDelete={() => handleDelete(item.id, item.title)}
        onShare={() => showExportOptions(item)}
      />
    </View>
  ), [colors, navigation, handleDelete, showExportOptions, indexedNoteIds, pendingNoteIds]);

  return (
    <ScreenWrapper style={styles.container} safeBottom={false}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerRow}>
            <View>
              <Heading size="xxl" style={{ letterSpacing: TYPOGRAPHY.tracking.tight }}>Captures</Heading>
              <Caption size="sm" style={{ color: colors.muted, marginTop: 2 }}>
                {parsedAndFilteredNotes.length} {parsedAndFilteredNotes.length === 1 ? 'note' : 'notes'}
              </Caption>
            </View>
            <View style={[styles.layoutToggle, { borderColor: colors.border, backgroundColor: colors.surface }]}>
              <TouchableOpacity
                onPress={() => setNotesLayout('list')}
                style={[styles.toggleBtn, notesLayout === 'list' && { backgroundColor: colors.card }]}
              >
                <List size={17} color={notesLayout === 'list' ? colors.foreground : colors.muted} />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setNotesLayout('grid')}
                style={[styles.toggleBtn, notesLayout === 'grid' && { backgroundColor: colors.card }]}
              >
                <Grid2X2 size={16} color={notesLayout === 'grid' ? colors.foreground : colors.muted} />
              </TouchableOpacity>
            </View>
          </View>
        </View>

        <FilterBar
          themeMode={themeMode}
          tags={tags}
          onFiltersChange={(filters) => { setFilters(filters); setSearchQuery(filters.query || ''); }}
        />

        {/* Tabs */}
        <View style={styles.tabBar}>
          {TABS.map((tab) => {
            const active = selectedTab === tab.id;
            return (
              <TouchableOpacity
                key={tab.id}
                onPress={() => { triggerHaptic('selection'); setSelectedTab(tab.id); }}
                style={[styles.tab, active && { borderBottomColor: colors.foreground, borderBottomWidth: 1.5 }]}
                activeOpacity={0.7}
              >
                <Body
                  size="sm"
                  style={{
                    color: active ? colors.foreground : colors.muted,
                    fontWeight: active ? TYPOGRAPHY.weights.semibold : TYPOGRAPHY.weights.regular,
                  }}
                >
                  {tab.label}
                </Body>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Content */}
        {parsedAndFilteredNotes.length === 0 ? (
          <EmptyState colors={colors} />
        ) : notesLayout === 'grid' ? (
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.listContent}
            keyboardShouldPersistTaps="handled"
          >
            <MasonryGrid
              notes={parsedAndFilteredNotes}
              colors={colors}
              indexedNoteIds={indexedNoteIds}
              pendingNoteIds={pendingNoteIds}
              onPress={(id) => navigation.navigate('NoteDetail', { noteId: id })}
              onDelete={handleDelete}
              onShare={showExportOptions}
              onReorder={setRecentOrder}
            />
          </ScrollView>
        ) : (
          <FlatList
            data={parsedAndFilteredNotes}
            keyExtractor={(item) => item.id}
            renderItem={renderListItem}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          />
        )}
      </KeyboardAvoidingView>

      <ShareOptionsModal
        visible={!!shareNote}
        onClose={() => setShareNote(null)}
        note={shareNote}
        themeMode={themeMode}
      />
    </ScreenWrapper>
  );
};

// ─── Empty State ─────────────────────────────────────────────────────────────

const EmptyState: React.FC<{ colors: any }> = ({ colors }) => (
  <View style={empty.container}>
    <View style={[empty.ring, { borderColor: colors.border }]}>
      <Mic size={22} color={colors.muted} />
    </View>
    <Body size="md" style={{ fontWeight: TYPOGRAPHY.weights.semibold, textAlign: 'center', color: colors.foreground, marginBottom: SPACING.sm }}>
      Nothing here yet
    </Body>
    <Caption size="sm" style={{ textAlign: 'center', color: colors.muted, lineHeight: TYPOGRAPHY.lineHeights.sm }}>
      Tap the mic on the home screen to capture your first idea.
    </Caption>
  </View>
);

const empty = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: SPACING.huge, paddingHorizontal: SPACING.xxxl },
  ring: { width: 52, height: 52, borderRadius: RADIUS.full, borderWidth: 1, alignItems: 'center', justifyContent: 'center', marginBottom: SPACING.lg },
});

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { paddingHorizontal: SPACING.xl, paddingTop: SPACING.xl },
  header: { marginBottom: SPACING.lg },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  layoutToggle: { flexDirection: 'row', borderWidth: StyleSheet.hairlineWidth, borderRadius: RADIUS.sm, padding: 2 },
  toggleBtn: { width: 34, height: 32, alignItems: 'center', justifyContent: 'center', borderRadius: RADIUS.xs },
  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(128,128,128,0.15)',
    marginBottom: SPACING.md,
  },
  tab: { paddingVertical: SPACING.sm, paddingHorizontal: SPACING.md, marginRight: SPACING.sm, paddingBottom: SPACING.sm - 1.5 },
  listContent: { paddingBottom: SPACING.huge, paddingTop: SPACING.xs },

  // List Item Row Layout
  listItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  listIconBox: {
    width: 36,
    height: 36,
    borderRadius: RADIUS.xs,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listTextContainer: {
    flex: 1,
    marginHorizontal: SPACING.md,
  },
  listActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },

  // Masonry Grid Layout
  masonryGrid: { flexDirection: 'row', alignItems: 'flex-start', gap: COL_GAP },
  masonryColumn: { flex: 1, flexDirection: 'column' },
  masonryCardWrapper: { marginBottom: COL_GAP },

  // Tile Card Layout
  tileCard: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  tileHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  tileTypeRow: { flexDirection: 'row', alignItems: 'center', flexShrink: 1 },
  tileActionsRight: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs + 2 },
});
