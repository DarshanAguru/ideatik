import React from 'react';
import { StyleSheet, View, ScrollView, TouchableOpacity } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { ScreenWrapper } from '../components/ScreenWrapper';
import { Heading, Body, Caption } from '../components/Typography';
import { SPACING, COLORS, TYPOGRAPHY } from '../theme/theme';
import { useSettingsStore } from '../features/settings/settingsStore';
import { ChevronLeft } from 'lucide-react-native';
import { triggerHaptic } from '../utils/haptics';

export const HelpScreen: React.FC = () => {
  const navigation = useNavigation();
  const themeMode = useSettingsStore((state) => state.themeMode);
  const colors = COLORS[themeMode];

  const handleBack = () => {
    triggerHaptic('selection');
    navigation.goBack();
  };

  return (
    <ScreenWrapper>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={handleBack} style={styles.backBtn}>
          <ChevronLeft size={24} color={colors.foreground} />
        </TouchableOpacity>
        <Heading size="lg" style={{ color: colors.foreground }}>
          Voice & App Guide
        </Heading>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Section: Voice Commands */}
        <View style={styles.section}>
          <Heading size="sm" style={[styles.sectionTitle, { color: colors.foreground }]}>
            🎤 Voice Commands
          </Heading>

          <View style={[styles.cmdCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Body size="sm" style={[styles.cmdTitle, { color: colors.foreground }]}>Create Checklist</Body>
            <Caption size="sm" style={[styles.cmdSyntax, { color: colors.accent || colors.muted }]}>
              create list · start checklist · make todo · checklist
            </Caption>
            <Caption size="sm" style={[styles.cmdDesc, { color: colors.muted }]}>
              Switches note to a checklist. Supports conversational words and mispronunciations.
            </Caption>
          </View>

          <View style={[styles.cmdCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Body size="sm" style={[styles.cmdTitle, { color: colors.foreground }]}>Create Finance Ledger</Body>
            <Caption size="sm" style={[styles.cmdSyntax, { color: colors.accent || colors.muted }]}>
              create finance list · make ledger · budget list · ledger
            </Caption>
            <Caption size="sm" style={[styles.cmdDesc, { color: colors.muted }]}>
              Switches to a ledger for tracking expenses/amounts.
            </Caption>
          </View>

          <View style={[styles.cmdCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Body size="sm" style={[styles.cmdTitle, { color: colors.foreground }]}>Add Checklist Items</Body>
            <Caption size="sm" style={[styles.cmdSyntax, { color: colors.accent || colors.muted }]}>
              add {"<item>"} · add {"<item A>"} add {"<item B>"}
            </Caption>
            <Caption size="sm" style={[styles.cmdDesc, { color: colors.muted }]}>
              "add" is the only item splitter. Everything after "add" until the next "add" becomes one list entry — words like "and", "also", "then" are preserved as part of the item name (e.g. "add apple juice and mango" stays as one item).
            </Caption>
          </View>

          <View style={[styles.cmdCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Body size="sm" style={[styles.cmdTitle, { color: colors.foreground }]}>Add Finance / Ledger Items</Body>
            <Caption size="sm" style={[styles.cmdSyntax, { color: colors.accent || colors.muted }]}>
              add {"<desc>"} cost {"<amount>"} · add rent cost twelve thousand
            </Caption>
            <Caption size="sm" style={[styles.cmdDesc, { color: colors.muted }]}>
              Use "add" to start each entry. The word "cost" separates the description from the amount. Amounts can be spoken as digits or English words (e.g. "twelve thousand fifty rupees" → ₹12,050). Repeat "add" to add the next entry.
            </Caption>
          </View>

          <View style={[styles.cmdCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Body size="sm" style={[styles.cmdTitle, { color: colors.foreground }]}>Link / Reference another Note</Body>
            <Caption size="sm" style={[styles.cmdSyntax, { color: colors.accent || colors.muted }]}>
              add reference here · link reference · insert citation
            </Caption>
            <Caption size="sm" style={[styles.cmdDesc, { color: colors.muted }]}>
              Inserts a sequential reference slot like [1], [2] to link another note. Extremely tolerant to misspellings/pronunciations (e.g. "add refrence hear", "difference hear").
            </Caption>
          </View>

          <View style={[styles.cmdCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Body size="sm" style={[styles.cmdTitle, { color: colors.foreground }]}>Ask AI / Chat with Notes (Offline RAG)</Body>
            <Caption size="sm" style={[styles.cmdSyntax, { color: colors.accent || colors.muted }]}>
              "what was my goa trip food expense?" · "summarize meeting" · "what is the meaning of API?"
            </Caption>
            <Caption size="sm" style={[styles.cmdDesc, { color: colors.muted }]}>
              Ask natural language queries in the Chat tab. Calculate expense totals, budget percentages, summaries, or word definitions from your notebook — completely offline.
            </Caption>
          </View>

        </View>


        {/* Section: Manual Usage */}
        <View style={styles.section}>
          <Heading size="sm" style={[styles.sectionTitle, { color: colors.foreground }]}>
            ✏️ Manual Usage & Features
          </Heading>

          <View style={[styles.helpItem, { borderBottomColor: colors.border }]}>
            <Body size="md" style={[styles.helpQuestion, { color: colors.foreground }]}>Note, List & Finance</Body>
            <Caption size="sm" style={{ color: colors.muted, lineHeight: 18 }}>
              Tap "New Note", "New List", or "Finance" on the home screen to create manually. Lists and Finance support adding items and amounts directly from the detail view.
            </Caption>
          </View>

          <View style={[styles.helpItem, { borderBottomColor: colors.border }]}>
            <Body size="md" style={[styles.helpQuestion, { color: colors.foreground }]}>Interactive Link Slots</Body>
            <Caption size="sm" style={{ color: colors.muted, lineHeight: 18 }}>
              You can manually type [1] or [2] inside any note body. The app will automatically parse them and prompt you to establish links to other notes.
            </Caption>
          </View>

          <View style={[styles.helpItem, { borderBottomColor: colors.border }]}>
            <Body size="md" style={[styles.helpQuestion, { color: colors.foreground }]}>Text-To-Speech Reader</Body>
            <Caption size="sm" style={{ color: colors.muted, lineHeight: 18 }}>
              For written or text-only notes with no voice recording, a "Read Note" speaker icon is displayed. Tap it to hear the note read aloud offline.
            </Caption>
          </View>

          <View style={[styles.helpItem, { borderBottomColor: colors.border }]}>
            <Body size="md" style={[styles.helpQuestion, { color: colors.foreground }]}>Tags</Body>
            <Caption size="sm" style={{ color: colors.muted, lineHeight: 18 }}>
              Open any note → type a tag name in the tag bar → tap Add. Tags are shared across all notes and can be used to filter in the Notes search screen.
            </Caption>
          </View>

          <View style={[styles.helpItem, { borderBottomColor: colors.border }]}>
            <Body size="md" style={[styles.helpQuestion, { color: colors.foreground }]}>Lock a Note</Body>
            <Caption size="sm" style={{ color: colors.muted, lineHeight: 18 }}>
              Tap the lock icon in the top-right of any note to require biometric / passcode authentication before it can be opened.
            </Caption>
          </View>

          <View style={[styles.helpItem, { borderBottomColor: colors.border }]}>
            <Body size="md" style={[styles.helpQuestion, { color: colors.foreground }]}>Offline Transcription</Body>
            <Caption size="sm" style={{ color: colors.muted, lineHeight: 18 }}>
              After recording stops, transcription runs in the background using an on-device Whisper model. Voice commands are parsed from the transcript automatically.
            </Caption>
          </View>
        </View>
      </ScrollView>
    </ScreenWrapper>
  );
};

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: {
    marginRight: SPACING.md,
    padding: 4,
  },
  scrollContent: {
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.lg,
  },
  section: {
    marginBottom: SPACING.xl,
  },
  sectionTitle: {
    marginBottom: SPACING.md,
    letterSpacing: TYPOGRAPHY.tracking.wide,
    textTransform: 'uppercase',
    fontWeight: '700',
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
  helpItem: {
    paddingVertical: SPACING.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  helpQuestion: {
    fontWeight: '600',
    marginBottom: 4,
  },
});
