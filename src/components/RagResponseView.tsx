import React, { useState, useEffect } from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Body, Caption, Heading } from './Typography';
import { COLORS, SPACING, RADIUS } from '../theme/theme';
import { useSettingsStore } from '../features/settings/settingsStore';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../screens/AppNavigator';
import { RagResult } from '../services/ai/SmartRagService';
import { RetrievedChunk } from '../services/ai/LocalVectorIndex';
import { NoteRepository } from '../services/database/NoteRepository';
import { StructuredNoteService } from '../services/notes/StructuredNoteService';
import { AlertCircle, FileText, IndianRupee, CheckSquare, ChevronDown, ChevronUp, ExternalLink } from 'lucide-react-native';

// ─── Inline Markdown & Table Parser Component ─────────────────────────────────

const MarkdownText: React.FC<{ content: string; colors: any }> = ({ content, colors }) => {
  const lines = content.split('\n');
  const elements: React.ReactNode[] = [];

  let tableRows: string[][] = [];
  let inTable = false;

  const flushTable = (key: string) => {
    if (tableRows.length === 0) return;
    const headers = tableRows[0];
    const rows = tableRows.slice(1).filter((r) => !r.every((c) => c.match(/^:?-+:?$/)));

    elements.push(
      <View key={key} style={[styles.tableContainer, { borderColor: colors.border, backgroundColor: colors.card }]}>
        <View style={[styles.tableHeaderRow, { borderBottomColor: colors.border, backgroundColor: colors.surface }]}>
          {headers.map((h, i) => (
            <View key={i} style={styles.tableCellBox}>
              <Caption size="xs" style={{ color: colors.foreground, fontWeight: '700' }}>
                {renderFormattedInline(h, colors)}
              </Caption>
            </View>
          ))}
        </View>
        {rows.map((row, rIdx) => (
          <View key={rIdx} style={[styles.tableDataRow, rIdx < rows.length - 1 && { borderBottomColor: colors.border }]}>
            {row.map((cell, cIdx) => (
              <View key={cIdx} style={styles.tableCellBox}>
                <Caption size="xs" style={{ color: colors.foreground }}>
                  {renderFormattedInline(cell, colors)}
                </Caption>
              </View>
            ))}
          </View>
        ))}
      </View>
    );
    tableRows = [];
    inTable = false;
  };

  lines.forEach((line, index) => {
    const trimmed = line.trim();

    if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
      inTable = true;
      const cells = trimmed.split('|').slice(1, -1).map((c) => c.trim());
      tableRows.push(cells);
      return;
    } else if (inTable) {
      flushTable(`table-${index}`);
    }

    if (!trimmed) {
      elements.push(<View key={`sp-${index}`} style={{ height: 4 }} />);
      return;
    }

    if (trimmed.startsWith('# ')) {
      elements.push(
        <Heading key={index} size="md" style={{ color: colors.foreground, marginTop: 6, marginBottom: 2 }}>
          {renderFormattedInline(trimmed.replace(/^#\s+/, ''), colors)}
        </Heading>
      );
      return;
    }
    if (trimmed.startsWith('## ') || trimmed.startsWith('### ')) {
      elements.push(
        <Heading key={index} size="sm" style={{ color: colors.foreground, marginTop: 4, marginBottom: 2 }}>
          {renderFormattedInline(trimmed.replace(/^#{2,3}\s+/, ''), colors)}
        </Heading>
      );
      return;
    }

    if (trimmed.startsWith('• ') || trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      const bulletText = trimmed.replace(/^[•\-*]\s+/, '');
      elements.push(
        <View key={index} style={styles.bulletRow}>
          <View style={[styles.bulletDot, { backgroundColor: colors.foreground }]} />
          <Body size="sm" style={{ color: colors.foreground, flex: 1, lineHeight: 21 }}>
            {renderFormattedInline(bulletText, colors)}
          </Body>
        </View>
      );
      return;
    }

    elements.push(
      <Body key={index} size="sm" style={{ color: colors.foreground, lineHeight: 22 }}>
        {renderFormattedInline(line, colors)}
      </Body>
    );
  });

  if (inTable) {
    flushTable('table-end');
  }

  return <View style={{ gap: 2 }}>{elements}</View>;
};

function renderFormattedInline(text: string, colors: any): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const regex = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g;
  let lastIdx = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIdx) {
      parts.push(text.substring(lastIdx, match.index));
    }
    const token = match[0];
    if (token.startsWith('**') && token.endsWith('**')) {
      parts.push(
        <Body key={match.index} size="sm" style={{ fontWeight: '700', color: colors.foreground }}>
          {token.slice(2, -2)}
        </Body>
      );
    } else if (token.startsWith('*') && token.endsWith('*')) {
      parts.push(
        <Body key={match.index} size="sm" style={{ fontStyle: 'italic', color: colors.foreground }}>
          {token.slice(1, -1)}
        </Body>
      );
    } else if (token.startsWith('`') && token.endsWith('`')) {
      parts.push(
        <Caption key={match.index} size="xs" style={{ fontFamily: 'monospace', backgroundColor: colors.surface, paddingHorizontal: 3, borderRadius: 3, color: colors.foreground }}>
          {token.slice(1, -1)}
        </Caption>
      );
    }
    lastIdx = match.index + token.length;
  }

  if (lastIdx < text.length) {
    parts.push(text.substring(lastIdx));
  }

  return parts;
}

// ─── Collapsible Source Dropdown Card ─────────────────────────────────────────

const SourceCard: React.FC<{ chunk: RetrievedChunk; index: number; total: number }> = ({ chunk, index }) => {
  const themeMode = useSettingsStore((state) => state.themeMode);
  const colors = COLORS[themeMode];
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [expanded, setExpanded] = useState(false);
  const [noteDetails, setNoteDetails] = useState<any | null>(null);

  useEffect(() => {
    if (expanded && chunk.noteId && !noteDetails) {
      NoteRepository.findById(chunk.noteId).then((n) => {
        if (n) {
          const structured = StructuredNoteService.fromNote(n);
          setNoteDetails({ note: n, structured });
        }
      }).catch(() => {});
    }
  }, [expanded, chunk.noteId, noteDetails]);

  const title = chunk.title || (noteDetails ? noteDetails.note.title : `Source ${index + 1}`);
  const noteType = chunk.type || (noteDetails ? noteDetails.note.type : 'note');

  const TypeIcon =
    noteType === 'finance' ? IndianRupee :
    noteType === 'list' ? CheckSquare :
    FileText;

  const typeLabel =
    noteType === 'finance' ? 'Finance' :
    noteType === 'list' ? 'List' :
    'Note';

  return (
    <View style={[styles.sourceCardContainer, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <TouchableOpacity
        style={styles.sourceCardHeader}
        onPress={() => setExpanded(!expanded)}
        activeOpacity={0.7}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 8 }}>
          <TypeIcon size={12} color={colors.foreground} style={{ marginRight: 6 }} />
          <Caption
            size="xs"
            style={{ color: colors.foreground, fontWeight: '600', flexShrink: 1 }}
            numberOfLines={1}
            ellipsizeMode="tail"
          >
            {title}
          </Caption>
          <View style={[styles.typeBadge, { borderColor: colors.border, marginLeft: 6 }]}>
            <Caption size="xs" style={{ color: colors.muted, fontSize: 8, textTransform: 'uppercase' }}>
              {typeLabel}
            </Caption>
          </View>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Caption size="xs" style={{ color: colors.muted, fontSize: 10, marginRight: 4 }}>
            {expanded ? 'Hide' : 'View'}
          </Caption>
          {expanded ? (
            <ChevronUp size={12} color={colors.muted} />
          ) : (
            <ChevronDown size={12} color={colors.muted} />
          )}
        </View>
      </TouchableOpacity>

      {expanded && (
        <View style={[styles.sourceExcerptBody, { borderTopColor: colors.border }]}>
          {chunk.text ? (
            <View style={{ gap: 4 }}>
              {chunk.text.split('\n').map((l) => l.trim()).filter(Boolean).map((line, i) => {
                const isBullet = line.startsWith('•') || line.startsWith('-') || line.startsWith('*');
                const cleanLine = line.replace(/^[•\-*]\s*/, '');
                return (
                  <View key={i} style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
                    <Caption size="xs" style={{ color: colors.foreground, lineHeight: 18, flex: 1 }}>
                      {isBullet ? `• ${cleanLine}` : cleanLine}
                    </Caption>
                  </View>
                );
              })}
            </View>
          ) : noteDetails ? (
            <Caption size="xs" style={{ color: colors.foreground, fontStyle: 'italic', lineHeight: 18 }}>
              "{StructuredNoteService.bodyText(noteDetails.structured)}"
            </Caption>
          ) : (
            <Caption size="xs" style={{ color: colors.foreground, fontStyle: 'italic', lineHeight: 18 }}>
              "Referenced note excerpt."
            </Caption>
          )}

          <TouchableOpacity
            style={[styles.openNoteBtn, { borderColor: colors.border }]}
            onPress={() => navigation.navigate('NoteDetail', { noteId: chunk.noteId })}
            activeOpacity={0.8}
          >
            <Caption size="xs" style={{ color: colors.foreground, fontWeight: '600', marginRight: 4 }}>
              Open Full Note
            </Caption>
            <ExternalLink size={11} color={colors.foreground} />
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
};

// ─── RagResponseView ──────────────────────────────────────────────────────────

interface RagResponseViewProps {
  result: RagResult;
}

export const RagResponseView: React.FC<RagResponseViewProps> = ({ result }) => {
  const themeMode = useSettingsStore((state) => state.themeMode);
  const colors = COLORS[themeMode];

  if (result.kind === 'empty') {
    return (
      <View style={styles.emptyContainer}>
        <AlertCircle size={18} color={colors.muted} />
        <Body size="sm" style={{ color: colors.muted, marginTop: SPACING.xs, textAlign: 'center' }}>
          {result.message}
        </Body>
      </View>
    );
  }

  let textContent = '';
  let rawSources: RetrievedChunk[] = [];

  if (result.kind === 'finance') {
    textContent = result.data.explanation;
    rawSources = result.data.sources || [];
  } else if (result.kind === 'summary') {
    textContent = result.data.bullets.join('\n');
    rawSources = result.data.sources || [];
  } else if (result.kind === 'qa') {
    textContent = result.data.answer;
    rawSources = result.data.sources || [];
  }

  // Deduplicate sources by unique noteId so each note is listed at most once
  const uniqueSources: RetrievedChunk[] = [];
  const seenNoteIds = new Set<string>();

  for (const chunk of rawSources) {
    const key = chunk.noteId || chunk.text.trim();
    if (key && !seenNoteIds.has(key)) {
      seenNoteIds.add(key);
      uniqueSources.push(chunk);
    }
  }

  return (
    <View style={styles.container}>
      <MarkdownText content={textContent} colors={colors} />
      {uniqueSources.length > 0 && (
        <View style={styles.sourcesColumn}>
          {uniqueSources.slice(0, 3).map((chunk, idx) => (
            <SourceCard key={chunk.noteId || idx} chunk={chunk} index={idx} total={uniqueSources.length} />
          ))}
        </View>
      )}
    </View>
  );
};

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    gap: SPACING.sm,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: SPACING.md,
    gap: SPACING.xs,
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.sm,
    paddingVertical: 2,
  },
  bulletDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    marginTop: 8,
  },
  sourcesColumn: {
    gap: SPACING.xs,
    marginTop: SPACING.xs,
  },
  sourceCardContainer: {
    borderRadius: RADIUS.sm,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  sourceCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING.sm,
    paddingVertical: 6,
  },
  typeBadge: {
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 3,
    borderWidth: StyleSheet.hairlineWidth,
  },
  sourceExcerptBody: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    gap: SPACING.xs,
  },
  openNoteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-end',
    paddingHorizontal: SPACING.xs,
    paddingVertical: 3,
    borderRadius: RADIUS.xs,
    borderWidth: StyleSheet.hairlineWidth,
    marginTop: 2,
  },
  tableContainer: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: RADIUS.sm,
    marginVertical: SPACING.xs,
    overflow: 'hidden',
  },
  tableHeaderRow: {
    flexDirection: 'row',
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: 4,
    paddingHorizontal: SPACING.xs,
  },
  tableDataRow: {
    flexDirection: 'row',
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: 4,
    paddingHorizontal: SPACING.xs,
  },
  tableCellBox: {
    flex: 1,
    paddingHorizontal: 4,
  },
});
