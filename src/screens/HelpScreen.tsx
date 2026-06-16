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
            <Body size="sm" style={[styles.cmdTitle, { color: colors.foreground }]}>Set Title</Body>
            <Caption size="sm" style={[styles.cmdSyntax, { color: colors.accent || colors.muted }]}>
              title start {'<your title>'} end
            </Caption>
            <Caption size="sm" style={[styles.cmdDesc, { color: colors.muted }]}>
              Say "title start" followed by your desired title, and end with "end". This is the exclusive title command.
              {'\n'}Example: "title start My Grocery List end"
            </Caption>
          </View>

          <View style={[styles.cmdCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Body size="sm" style={[styles.cmdTitle, { color: colors.foreground }]}>Create Checklist</Body>
            <Caption size="sm" style={[styles.cmdSyntax, { color: colors.accent || colors.muted }]}>
              create list · make a list · start checklist
            </Caption>
            <Caption size="sm" style={[styles.cmdDesc, { color: colors.muted }]}>
              Switches the note type to a checklist.{'\n'}
              Example: "create list"
            </Caption>
          </View>

          <View style={[styles.cmdCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Body size="sm" style={[styles.cmdTitle, { color: colors.foreground }]}>Create Finance Ledger</Body>
            <Caption size="sm" style={[styles.cmdSyntax, { color: colors.accent || colors.muted }]}>
              create finance list · make ledger · start financial list
            </Caption>
            <Caption size="sm" style={[styles.cmdDesc, { color: colors.muted }]}>
              Switches to a finance tracking list with amounts.{'\n'}
              Example: "create finance list"
            </Caption>
          </View>

          <View style={[styles.cmdCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Body size="sm" style={[styles.cmdTitle, { color: colors.foreground }]}>Add Item to List</Body>
            <Caption size="sm" style={[styles.cmdSyntax, { color: colors.accent || colors.muted }]}>
              add item {'<text>'} · add {'<text>'} to list
            </Caption>
            <Caption size="sm" style={[styles.cmdDesc, { color: colors.muted }]}>
              Adds a checklist item.{'\n'}
              Examples:{'\n'}
              • "add item milk"{'\n'}
              • "add eggs to list"
            </Caption>
          </View>

          <View style={[styles.cmdCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Body size="sm" style={[styles.cmdTitle, { color: colors.foreground }]}>Add Finance Item with Amount</Body>
            <Caption size="sm" style={[styles.cmdSyntax, { color: colors.accent || colors.muted }]}>
              add item {'<text>'} amount {'<number>'}
            </Caption>
            <Caption size="sm" style={[styles.cmdDesc, { color: colors.muted }]}>
              Adds a finance item with a numeric amount.{'\n'}
              Example: "add item groceries amount 45.50"
            </Caption>
          </View>

          <View style={[styles.cmdCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Body size="sm" style={[styles.cmdTitle, { color: colors.foreground }]}>Link / Reference another Note</Body>
            <Caption size="sm" style={[styles.cmdSyntax, { color: colors.accent || colors.muted }]}>
              add reference here
            </Caption>
            <Caption size="sm" style={[styles.cmdDesc, { color: colors.muted }]}>
              Inserts a sequential reference slot token like [1], [2] at the current point of dictation. You will be prompted to choose which note to link once the recording finishes.{'\n'}
              Example: "Today I need to prepare for the party. add reference here. call the team."
            </Caption>
          </View>

          <View style={[styles.cmdCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Body size="sm" style={[styles.cmdTitle, { color: colors.foreground }]}>Save / Finish Recording</Body>
            <Caption size="sm" style={[styles.cmdSyntax, { color: colors.accent || colors.muted }]}>
              end note · finish note · save note · stop recording
            </Caption>
            <Caption size="sm" style={[styles.cmdDesc, { color: colors.muted }]}>
              Triggers auto-save and ends the recording session.{'\n'}
              Example: "end note" or "save note"
            </Caption>
          </View>
        </View>

        {/* Section: Typical Usage Flows */}
        <View style={styles.section}>
          <Heading size="sm" style={[styles.sectionTitle, { color: colors.foreground }]}>
            💡 Usage Examples
          </Heading>

          <View style={[styles.cmdCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Body size="sm" style={[styles.cmdTitle, { color: colors.foreground }]}>Full Voice Note</Body>
            <Caption size="sm" style={[styles.cmdDesc, { color: colors.muted }]}>
              "title start Meeting Notes end. Today we discussed the product roadmap. Key actions are to finalize the design and ship by Friday."
            </Caption>
          </View>

          <View style={[styles.cmdCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Body size="sm" style={[styles.cmdTitle, { color: colors.foreground }]}>Voice Checklist</Body>
            <Caption size="sm" style={[styles.cmdDesc, { color: colors.muted }]}>
              "title start Grocery Run end. create list. add item milk. add item eggs. add item bread. end note."
            </Caption>
          </View>

          <View style={[styles.cmdCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Body size="sm" style={[styles.cmdTitle, { color: colors.foreground }]}>Voice Finance Ledger</Body>
            <Caption size="sm" style={[styles.cmdDesc, { color: colors.muted }]}>
              "title start Monthly Expenses end. create finance list. add item rent amount 1200. add item groceries amount 150. add item electricity amount 60. end note."
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
