import React, { useState } from 'react';
import { StyleSheet, View, TouchableOpacity } from 'react-native';
import { ScreenWrapper } from '../components/ScreenWrapper';
import { Heading, Body } from '../components/Typography';
import { SPACING, COLORS, RADIUS } from '../theme/theme';
import { useSecurityStore } from '../features/security/securityStore';
import { useSettingsStore } from '../features/settings/settingsStore';
import { triggerHaptic } from '../utils/haptics';
import { ArrowRight, Check, Mic, Lock, Shield } from 'lucide-react-native';

export const OnboardingScreen: React.FC = () => {
  const themeMode = useSettingsStore((state) => state.themeMode);
  const colors = COLORS[themeMode];

  const { setOnboarded } = useSecurityStore();
  const [step, setStep] = useState(1);

  const handleNext = () => {
    triggerHaptic('selection');
    if (step < 3) {
      setStep(prev => prev + 1);
    } else {
      triggerHaptic('success');
      setOnboarded(true);
    }
  };

  const renderStepContent = () => {
    switch (step) {
      case 1:
        return (
          <View style={styles.stepContent}>
            <Shield size={64} color={colors.foreground} style={styles.icon} />
            <Heading size="xl" style={[styles.title, { color: colors.foreground }]}>
              Welcome to Ideatik
            </Heading>
            <Body size="md" style={[styles.subtitle, { color: colors.muted }]}>
              A high-performance, private-first, offline-only note-taking vault.
            </Body>
            <View style={styles.bullets}>
              <View style={styles.bulletRow}>
                <Check size={16} color={colors.foreground} />
                <Body size="sm" style={[styles.bulletText, { color: colors.foreground }]}>
                  Zero cloud servers. All data stays local.
                </Body>
              </View>
              <View style={styles.bulletRow}>
                <Check size={16} color={colors.foreground} />
                <Body size="sm" style={[styles.bulletText, { color: colors.foreground }]}>
                  High-fidelity local voice dictation.
                </Body>
              </View>
            </View>
          </View>
        );
      case 2:
        return (
          <View style={styles.stepContent}>
            <Mic size={64} color={colors.foreground} style={styles.icon} />
            <Heading size="xl" style={[styles.title, { color: colors.foreground }]}>
              Offline Dictation
            </Heading>
            <Body size="md" style={[styles.subtitle, { color: colors.muted }]}>
              Ideatik uses an on-device transcription engine to transcribe speech natively.
            </Body>
            <View style={styles.bullets}>
              <View style={styles.bulletRow}>
                <Check size={16} color={colors.foreground} />
                <Body size="sm" style={[styles.bulletText, { color: colors.foreground }]}>
                  Works in airplane mode with no latency.
                </Body>
              </View>
              <View style={styles.bulletRow}>
                <Check size={16} color={colors.foreground} />
                <Body size="sm" style={[styles.bulletText, { color: colors.foreground }]}>
                  Supports checklist & finance structure triggers.
                </Body>
              </View>
            </View>
          </View>
        );
      case 3:
        return (
          <View style={styles.stepContent}>
            <Lock size={64} color={colors.foreground} style={styles.icon} />
            <Heading size="xl" style={[styles.title, { color: colors.foreground }]}>
              Secure Your Notes
            </Heading>
            <Body size="md" style={[styles.subtitle, { color: colors.muted }]}>
              Protect individual sensitive notes and lists from unauthorized eyes.
            </Body>

            <View style={styles.bullets}>
              <View style={styles.bulletRow}>
                <Check size={16} color={colors.foreground} />
                <Body size="sm" style={[styles.bulletText, { color: colors.foreground }]}>
                  Lock specific items with the header lock button.
                </Body>
              </View>
              <View style={styles.bulletRow}>
                <Check size={16} color={colors.foreground} />
                <Body size="sm" style={[styles.bulletText, { color: colors.foreground }]}>
                  Requires native fingerprint or device passcode to unlock.
                </Body>
              </View>
            </View>
          </View>
        );
      default:
        return null;
    }
  };

  return (
    <ScreenWrapper safeBottom={true}>
      <View style={styles.container}>
        {/* Progress Bar Indicators */}
        <View style={styles.progressRow}>
          {[1, 2, 3].map(i => (
            <View
              key={i}
              style={[
                styles.progressBar,
                {
                  backgroundColor: step === i ? colors.foreground : colors.border,
                },
              ]}
            />
          ))}
        </View>

        {/* Dynamic step slide */}
        <View style={styles.slideArea}>{renderStepContent()}</View>

        {/* Next / Finish Button */}
        <TouchableOpacity
          onPress={handleNext}
          style={[styles.nextButton, { backgroundColor: colors.foreground }]}
          activeOpacity={0.85}
        >
          <Body size="sm" style={{ color: colors.background, fontWeight: '700', marginRight: SPACING.xs }}>
            {step === 3 ? 'Get Started' : 'Next'}
          </Body>
          <ArrowRight size={16} color={colors.background} />
        </TouchableOpacity>
      </View>
    </ScreenWrapper>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: SPACING.xl,
    justifyContent: 'space-between',
    paddingBottom: SPACING.xl,
  },
  progressRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginTop: SPACING.lg,
  },
  progressBar: {
    flex: 1,
    height: 4,
    borderRadius: RADIUS.full,
  },
  slideArea: {
    flex: 1,
    justifyContent: 'center',
  },
  stepContent: {
    alignItems: 'center',
  },
  icon: {
    marginBottom: SPACING.xl,
  },
  title: {
    fontWeight: '900',
    marginBottom: SPACING.md,
    textAlign: 'center',
  },
  subtitle: {
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: SPACING.xxl,
  },
  bullets: {
    width: '100%',
    gap: SPACING.md,
    marginTop: SPACING.md,
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },
  bulletText: {
    fontWeight: '500',
  },
  lockToggleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    padding: SPACING.md,
    borderWidth: 1,
    borderRadius: RADIUS.md,
    marginTop: SPACING.lg,
  },
  nextButton: {
    width: '100%',
    height: 52,
    borderRadius: RADIUS.full,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
