import React from 'react';
import { StyleSheet, View, ScrollView, TouchableOpacity, Linking, Animated, Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { ScreenWrapper } from '../components/ScreenWrapper';
import { Heading, Body, Caption } from '../components/Typography';
import { SPACING, COLORS, RADIUS } from '../theme/theme';
import { useSettingsStore } from '../features/settings/settingsStore';
import { triggerHaptic } from '../utils/haptics';
import { Shield, ChevronRight, HelpCircle, Globe, ExternalLink, Info } from 'lucide-react-native';

const PulsatingHeart: React.FC = () => {
  const scale = React.useRef(new Animated.Value(1)).current;

  React.useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(scale, {
          toValue: 1.25,
          duration: 500,
          useNativeDriver: true,
        }),
        Animated.timing(scale, {
          toValue: 1.0,
          duration: 500,
          useNativeDriver: true,
        }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, [scale]);

  return (
    <Animated.Text style={{ transform: [{ scale }], fontSize: 12, marginHorizontal: 3 }}>
      ❤️
    </Animated.Text>
  );
};

export const ProfileScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const themeMode = useSettingsStore((state) => state.themeMode);
  const colors = COLORS[themeMode];

  return (
    <ScreenWrapper safeBottom={false}>
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Heading size="xl">About Ideatik</Heading>
          <Caption size="sm">Local-first, offline-first private productivity assistant.</Caption>
        </View>

        {/* Section: About App */}
        <View style={styles.section}>
          <View style={styles.sectionTitleRow}>
            <Info size={18} color={colors.foreground} style={styles.icon} />
            <Heading size="sm" style={styles.sectionTitle}>
              About App
            </Heading>
          </View>
          <View
            style={[
              styles.infoCard,
              {
                borderColor: colors.border,
                backgroundColor: colors.surface,
              },
            ]}
          >
            <Caption size="sm" style={{ lineHeight: 20, color: colors.foreground }}>
              This app is designed with a local-first philosophy—combining offline AI, voice-first note-taking, and a minimalist experience to keep your ideas private, searchable, and always accessible.
            </Caption>
          </View>
        </View>

        {/* Section: Privacy & Architecture */}
        <View style={styles.section}>
          <View style={styles.sectionTitleRow}>
            <Shield size={18} color={colors.foreground} style={styles.icon} />
            <Heading size="sm" style={styles.sectionTitle}>
              Privacy &amp; Architecture
            </Heading>
          </View>
          <View
            style={[
              styles.infoCard,
              {
                borderColor: colors.border,
                backgroundColor: colors.surface,
              },
            ]}
          >
            <Body size="sm" style={styles.infoText}>
              🔒 <Body size="sm" style={{ fontWeight: '700' }}>100% Offline · No Cloud · No Accounts</Body>
            </Body>
            <Body size="sm" style={styles.infoText}>
              All speech-to-text runs entirely on this device using a quantized Whisper model. Your audio and transcripts never leave your phone.
            </Body>
            <Body size="sm" style={styles.infoText}>
              🤖 <Body size="sm" style={{ fontWeight: '600' }}>Local RAG & On-Device AI</Body> — Vector embedding indexing, semantic search, and offline LLM intelligence execute 100% on-device. Zero notes, vector indexes, or AI queries are ever sent to external cloud servers.
            </Body>
            <Body size="sm" style={styles.infoText}>
              🧩 <Body size="sm" style={{ fontWeight: '600' }}>Local-First Storage</Body> — Notes are saved as standard Markdown (.md) files and audio as WAV on your internal storage. Back up by copying files directly from your device.
            </Body>
            <Body size="sm" style={styles.infoText}>
              ⚡ <Body size="sm" style={{ fontWeight: '600' }}>WAV Chunking</Body> — Long recordings are split into 30-second segments processed sequentially to keep memory usage low on mobile.
            </Body>
            <Body size="sm" style={{ lineHeight: 20, color: colors.muted }}>
              No analytics, no telemetry, no sync servers, no crash reporters. Zero third-party data sharing.
            </Body>
          </View>
        </View>

        {/* Section: Help & Guides */}
        <View style={styles.section}>
          <Heading size="sm" style={styles.sectionTitle}>
            Help &amp; Guides
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
              Aguru Darshan
            </Body>
            <Caption size="sm" style={{ lineHeight: 18, marginBottom: SPACING.md }}>
              A software engineer passionate about developer tooling, distributed systems, and privacy-first applications, focused on creating fast, practical software that solves real problems.
            </Caption>

            <TouchableOpacity
              style={[
                styles.portfolioBtn,
                {
                  backgroundColor: colors.foreground,
                  borderColor: colors.border,
                },
              ]}
              onPress={() => {
                triggerHaptic('impact');
                Linking.openURL('https://thisdarshiii.in').catch(() => {
                  Alert.alert('Unable to open URL', 'https://thisdarshiii.in');
                });
              }}
              activeOpacity={0.8}
            >
              <Globe size={14} color={colors.background} style={{ marginRight: 6 }} />
              <Body size="sm" style={{ color: colors.background, fontWeight: '600' }}>
                Visit Portfolio
              </Body>
              <ExternalLink size={13} color={colors.background} style={{ marginLeft: 6, opacity: 0.85 }} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Section: Application Info */}
        <View style={styles.infoSection}>
          <Caption size="xs" style={[styles.centerText, { color: colors.muted }]}>
            Ideatik v2.0.0 • privacy-first open-source
          </Caption>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 2 }}>
            <Caption size="xs" style={{ color: colors.muted }}>Made with</Caption>
            <PulsatingHeart />
            <Caption size="xs" style={{ color: colors.muted }}>by Darshan</Caption>
          </View>
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
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  icon: {
    marginRight: SPACING.xs + 2,
  },
  sectionTitle: {
    fontWeight: '700',
    marginBottom: SPACING.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  infoCard: {
    padding: SPACING.lg,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
  },
  infoText: {
    marginBottom: SPACING.md,
    lineHeight: 20,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: SPACING.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  creatorCard: {
    padding: SPACING.lg,
    borderRadius: SPACING.sm,
    borderWidth: 1,
  },
  portfolioBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.xs + 3,
    paddingHorizontal: SPACING.md,
    borderRadius: RADIUS.full,
    borderWidth: StyleSheet.hairlineWidth,
    alignSelf: 'flex-start',
    marginTop: SPACING.xs,
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
