import React, { useCallback, useMemo, useState } from 'react';
import {
  StyleSheet,
  View,
  FlatList,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { ScreenWrapper, PressableScale } from '../components/ScreenWrapper';
import { Heading, Body, Caption, Label } from '../components/Typography';
import { SPACING, COLORS, TYPOGRAPHY, RADIUS, SHADOWS } from '../theme/theme';
import { useSettingsStore } from '../features/settings/settingsStore';
import { useNotesStore, NoteTab } from '../features/notes/notesStore';
import { FileText, CheckSquare, Trash2, DollarSign, Mic, Share2, Lock } from 'lucide-react-native';
import { triggerHaptic } from '../utils/haptics';
import { StructuredNoteService } from '../services/notes/StructuredNoteService';
import { ShareOptionsModal } from '../components/ShareOptionsModal';
import { FilterBar } from '../components/FilterBar';
import { useTagsStore } from '../features/tags/tagsStore';
import { TagBadge } from '../components/TagBadge';

const TYPE_ICONS = {
  note: FileText,
  list: CheckSquare,
  finance: DollarSign,
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

  if (diffDays === 0) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } else if (diffDays === 1) {
    return 'Yesterday';
  } else if (diffDays < 7) {
    return d.toLocaleDateString([], { weekday: 'short' });
  }
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
};

export const NotesScreen: React.FC = () => {
  const themeMode = useSettingsStore((state) => state.themeMode);
  const colors = COLORS[themeMode];
  const navigation = useNavigation<any>();
  const [shareNote, setShareNote] = useState<any | null>(null);
  const { tags, loadTags, getTagsByIds } = useTagsStore();

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
  } = useNotesStore();

  useFocusEffect(
    useCallback(() => {
      loadNotes();
      loadTags();
    }, [loadNotes, loadTags])
  );

  const handleDelete = useCallback((id: string, title: string) => {
    triggerHaptic('impact');
    Alert.alert(
      'Delete Capture',
      `Are you sure you want to delete "${title}"? This will permanently delete all note contents and audio recordings to free up space.`,
      [
        { text: 'Keep', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => deleteNote(id),
        },
      ]
    );
  }, [deleteNote]);

  const showExportOptions = useCallback((note: any) => {
    triggerHaptic('selection');
    setShareNote(note);
  }, []);

  // Deleted formatDate inline definition

  const parsedAndFilteredNotes = useMemo(() => {
    // Reference variables explicitly so eslint understands they are dependencies
    if (notesList || searchQuery || selectedTab) {}
      const list = getFilteredNotes();
      return list.map((note) => {
      const parsed = StructuredNoteService.fromNote(note);
      return {
        ...note,
        parsed,
      };
    });
  }, [notesList, searchQuery, selectedTab, getFilteredNotes]);

  const renderNoteItem = useCallback(({ item }: { item: any }) => {
    const { parsed } = item;
    const TypeIcon = TYPE_ICONS[item.type as keyof typeof TYPE_ICONS] || FileText;

    let meta = '';
    if (!item.isLocked) {
      const parsedItems = StructuredNoteService.items(parsed);
      if (item.type === 'list' && parsedItems.length > 0) {
        const done = parsedItems.filter((i: any) => i.checked).length;
        meta = `${done}/${parsedItems.length} done`;
      } else if (item.type === 'finance' && parsedItems.length > 0) {
        const total = parsedItems.reduce((s: number, i: any) => s + (i.amount || 0), 0);
        meta = `₹${Math.abs(total).toFixed(2)} total`;
      } else if (
        item.transcriptionStatus === 'queued' ||
        item.transcriptionStatus === 'processing' ||
        item.transcriptionStatus === 'processing_offline'
      ) {
        if (item.transcriptionStatus === 'processing_offline') {
          meta = 'transcribing...';
        } else if (item.transcriptionStatus === 'queued') {
          meta = 'queued (model loading...)';
        } else {
          meta = 'transcribing...';
        }
      } else if (item.transcriptionStatus === 'failed') {
        meta = 'needs retry';
      } else if (item.duration > 0) {
        const mins = Math.floor(item.duration / 60);
        const secs = item.duration % 60;
        meta = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
      }
    }

    return (
      <PressableScale
        onPress={() => navigation.navigate('NoteDetail', { noteId: item.id })}
        style={[
          styles.noteCard,
          { borderColor: colors.border, backgroundColor: colors.card },
          SHADOWS.sm,
        ]}
        scaleValue={0.98}
      >
        {/* Header row */}
        <View style={styles.noteHeader}>
          <View style={styles.noteTypeRow}>
            <TypeIcon size={11} color={colors.muted} />
            <Label
              size="xs"
              style={[styles.noteTypeLabel, { color: colors.muted }]}
            >
              {item.type}
            </Label>
          </View>

          <View style={styles.noteMetaRight}>
            {meta ? (
              <Caption size="xs" style={[styles.noteMeta, { color: colors.muted }]}>
                {meta}
              </Caption>
            ) : null}
            <Caption size="xs" style={{ color: colors.muted }}>
              {formatDate(item.createdAt)}
            </Caption>
            <TouchableOpacity
              onPress={() => showExportOptions(item)}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              style={styles.shareBtn}
            >
              <Share2 size={13} color={colors.muted} />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => handleDelete(item.id, item.title)}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              style={styles.deleteBtn}
            >
              <Trash2 size={13} color={colors.muted} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Title */}
        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: SPACING.xs }}>
          {item.isLocked && <Lock size={14} color={colors.foreground} style={{ marginRight: 6 }} />}
          <Body
            size="md"
            style={[styles.noteTitle, { color: colors.foreground, flex: 1 }]}
            numberOfLines={1}
          >
            {item.title}
          </Body>
        </View>

        {!item.isLocked && item.tags?.length > 0 ? (
          <View style={styles.tagRow}>
            {getTagsByIds(item.tags).slice(0, 3).map((tag) => (
              <TagBadge key={tag.id} id={tag.id} name={tag.name} color={tag.color} size="sm" />
            ))}
          </View>
        ) : null}

        {/* Preview text */}
        {!item.isLocked && StructuredNoteService.bodyText(parsed) ? (
          <Caption
            size="sm"
            numberOfLines={2}
            style={[styles.notePreview, { color: colors.muted }]}
          >
            {StructuredNoteService.bodyText(parsed)}
          </Caption>
        ) : item.isLocked ? (
          <Caption
            size="sm"
            numberOfLines={2}
            style={[styles.notePreview, { color: colors.muted, fontStyle: 'italic' }]}
          >
            Locked note (tap to unlock)
          </Caption>
        ) : null}
      </PressableScale>
    );
  }, [colors, navigation, handleDelete, showExportOptions, getTagsByIds]);

  return (
    <ScreenWrapper style={styles.container} safeBottom={false}>
      {/* Header */}
      <View style={styles.header}>
        <Heading
          size="xxl"
          style={{ letterSpacing: TYPOGRAPHY.tracking.tight }}
        >
          Captures
        </Heading>
        <Caption size="sm" style={{ color: colors.muted, marginTop: 2 }}>
          {parsedAndFilteredNotes.length} {parsedAndFilteredNotes.length === 1 ? 'note' : 'notes'}
        </Caption>
      </View>

      <FilterBar
        themeMode={themeMode}
        tags={tags}
        onFiltersChange={(filters) => {
          setFilters(filters);
          setSearchQuery(filters.query || '');
        }}
      />

      {/* Tab bar */}
      <View style={styles.tabBar}>
        {TABS.map((tab) => {
          const active = selectedTab === tab.id;
          return (
            <TouchableOpacity
              key={tab.id}
              onPress={() => {
                triggerHaptic('selection');
                setSelectedTab(tab.id);
              }}
              style={[
                styles.tab,
                active && { borderBottomColor: colors.foreground, borderBottomWidth: 1.5 },
              ]}
              activeOpacity={0.7}
            >
              <Body
                size="sm"
                style={{
                  color: active ? colors.foreground : colors.muted,
                  fontWeight: active ? TYPOGRAPHY.weights.semibold : TYPOGRAPHY.weights.regular,
                  letterSpacing: TYPOGRAPHY.tracking.normal,
                }}
              >
                {tab.label}
              </Body>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Notes list */}
      <FlatList
        data={parsedAndFilteredNotes}
        keyExtractor={(item) => item.id}
        renderItem={renderNoteItem}
        contentContainerStyle={[
          styles.listContent,
          parsedAndFilteredNotes.length === 0 && styles.listContentEmpty,
        ]}
        showsVerticalScrollIndicator={false}
        ItemSeparatorComponent={NoteSeparator}
        ListEmptyComponent={<EmptyState colors={colors} />}
      />
      <ShareOptionsModal
        visible={!!shareNote}
        onClose={() => setShareNote(null)}
        note={shareNote}
        themeMode={themeMode}
      />
    </ScreenWrapper>
  );
};

// ─── Premium Empty State ──────────────────────────────────────────────────────

const NoteSeparator = () => <View style={{ height: SPACING.sm }} />;

const EmptyState: React.FC<{ colors: any }> = ({ colors }) => (
  <View style={emptyStyles.container}>
    <View style={[emptyStyles.iconRing, { borderColor: colors.border }]}>
      <Mic size={22} color={colors.muted} />
    </View>
    <Body size="md" style={[emptyStyles.title, { color: colors.foreground }]}>
      Nothing here yet
    </Body>
    <Caption size="sm" style={[emptyStyles.subtitle, { color: colors.muted }]}>
      Tap the mic on the home screen to capture your first idea.
    </Caption>
  </View>
);

const emptyStyles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: SPACING.huge,
    paddingHorizontal: SPACING.xxxl,
  },
  iconRing: {
    width: 52,
    height: 52,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.lg,
  },
  title: {
    fontWeight: TYPOGRAPHY.weights.semibold,
    textAlign: 'center',
    marginBottom: SPACING.sm,
  },
  subtitle: {
    textAlign: 'center',
    lineHeight: TYPOGRAPHY.lineHeights.sm,
  },
});

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: SPACING.xl,
    paddingTop: SPACING.xl,
  },
  header: {
    marginBottom: SPACING.lg,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: RADIUS.sm,
    paddingHorizontal: SPACING.md,
    height: 44,
    marginBottom: SPACING.md,
  },
  searchInput: {
    flex: 1,
    fontSize: TYPOGRAPHY.sizes.sm,
    padding: 0,
    height: '100%',
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.xs,
    marginTop: SPACING.sm,
  },
  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(128,128,128,0.15)',
    marginBottom: SPACING.md,
  },
  tab: {
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    marginRight: SPACING.sm,
    paddingBottom: SPACING.sm - 1.5, // compensate active border
  },
  listContent: {
    paddingBottom: SPACING.huge,
    paddingTop: SPACING.xs,
  },
  listContentEmpty: {
    flex: 1,
  },
  // ── Card ──────────────────────────────────────────────────────────────────
  noteCard: {
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  noteHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.xs,
  },
  noteTypeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  noteTypeLabel: {
    marginLeft: 4,
  },
  noteMetaRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  noteMeta: {
    marginRight: 2,
  },
  shareBtn: {
    padding: 2,
    marginLeft: SPACING.xs,
  },
  deleteBtn: {
    padding: 2,
    marginLeft: SPACING.xs,
  },
  noteTitle: {
    fontWeight: TYPOGRAPHY.weights.semibold,
    marginBottom: SPACING.xs,
    letterSpacing: TYPOGRAPHY.tracking.tight,
  },
  notePreview: {
    lineHeight: TYPOGRAPHY.lineHeights.sm,
  },
});
