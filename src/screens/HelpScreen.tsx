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
              create list · start checklist · make todo
            </Caption>
            <Caption size="sm" style={[styles.cmdDesc, { color: colors.muted }]}>
              Switches note to a checklist. Use "add" to separate items (e.g., "add apples add milk").
            </Caption>
          </View>

          <View style={[styles.cmdCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Body size="sm" style={[styles.cmdTitle, { color: colors.foreground }]}>Create Finance Ledger</Body>
            <Caption size="sm" style={[styles.cmdSyntax, { color: colors.accent || colors.muted }]}>
              create finance list · make ledger · budget list
            </Caption>
            <Caption size="sm" style={[styles.cmdDesc, { color: colors.muted }]}>
              Switches to an expense ledger. Use "cost" to attach amounts (e.g., "add rent cost twelve thousand").
            </Caption>
          </View>

          <View style={[styles.cmdCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Body size="sm" style={[styles.cmdTitle, { color: colors.foreground }]}>Link Another Note</Body>
            <Caption size="sm" style={[styles.cmdSyntax, { color: colors.accent || colors.muted }]}>
              add reference here · link reference
            </Caption>
            <Caption size="sm" style={[styles.cmdDesc, { color: colors.muted }]}>
              Inserts a reference slot like [1] or [2] inside your note to link related entries.
            </Caption>
          </View>

          <View style={[styles.cmdCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Body size="sm" style={[styles.cmdTitle, { color: colors.foreground }]}>Ask AI / Search Notebook (Offline)</Body>
            <Caption size="sm" style={[styles.cmdSyntax, { color: colors.accent || colors.muted }]}>
              "what was my food expense?" · "summarize meeting"
            </Caption>
            <Caption size="sm" style={[styles.cmdDesc, { color: colors.muted }]}>
              Ask natural queries in the Ask tab to search your notebook, sum expenses, or summarize notes completely offline.
            </Caption>
          </View>
        </View>

        {/* Section: Manual Usage & Features */}
        <View style={styles.section}>
          <Heading size="sm" style={[styles.sectionTitle, { color: colors.foreground }]}>
            ✏️ Key Features &amp; Workflow
          </Heading>

          <View style={[styles.helpItem, { borderBottomColor: colors.border }]}>
            <Body size="md" style={[styles.helpQuestion, { color: colors.foreground }]}>Dock-Anchored Item Editing</Body>
            <Caption size="sm" style={{ color: colors.muted, lineHeight: 18 }}>
              Tap any list item to open it directly in the floating bottom dock bar. Edit the text or amount above the keyboard and tap Save.
            </Caption>
          </View>

          <View style={[styles.helpItem, { borderBottomColor: colors.border }]}>
            <Body size="md" style={[styles.helpQuestion, { color: colors.foreground }]}>Interactive Link Slots</Body>
            <Caption size="sm" style={{ color: colors.muted, lineHeight: 18 }}>
              Type [1] or [2] inside any note body. The app parses slot tags and lets you pick target notes to link.
            </Caption>
          </View>

          <View style={[styles.helpItem, { borderBottomColor: colors.border }]}>
            <Body size="md" style={[styles.helpQuestion, { color: colors.foreground }]}>Biometric Lock</Body>
            <Caption size="sm" style={{ color: colors.muted, lineHeight: 18 }}>
              Tap the lock icon in the top header of any note to secure it behind fingerprint or face authentication.
            </Caption>
          </View>

          <View style={[styles.helpItem, { borderBottomColor: colors.border }]}>
            <Body size="md" style={[styles.helpQuestion, { color: colors.foreground }]}>Offline Speech Reader &amp; Audio</Body>
            <Caption size="sm" style={{ color: colors.muted, lineHeight: 18 }}>
              Tap the speaker icon on text notes to hear them read aloud offline. Voice recordings process locally via Whisper.
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
