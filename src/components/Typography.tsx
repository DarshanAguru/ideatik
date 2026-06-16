import React from 'react';
import { Text as RNText, StyleSheet, TextStyle, StyleProp } from 'react-native';
import { COLORS, TYPOGRAPHY } from '../theme/theme';
import { useSettingsStore } from '../features/settings/settingsStore';

interface TypographyProps {
  children: React.ReactNode;
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
}

// ─── Heading ─────────────────────────────────────────────────────────────────

export const Heading: React.FC<
  TypographyProps & { size?: 'sm' | 'md' | 'lg' | 'xl' | 'xxl' | 'xxxl' | 'display' }
> = ({ children, style, size = 'xl', numberOfLines }) => {
  const themeMode = useSettingsStore((state) => state.themeMode);
  const colors = COLORS[themeMode];

  const fontSize = TYPOGRAPHY.sizes[size];
  const lineHeight = TYPOGRAPHY.lineHeights[size];

  return (
    <RNText
      numberOfLines={numberOfLines}
      style={[
        styles.heading,
        {
          color: colors.foreground,
          fontSize,
          lineHeight,
          letterSpacing: fontSize >= TYPOGRAPHY.sizes.xxl
            ? TYPOGRAPHY.tracking.tight
            : TYPOGRAPHY.tracking.normal,
        },
        style,
      ]}
    >
      {children}
    </RNText>
  );
};

// ─── Subheading ───────────────────────────────────────────────────────────────

export const Subheading: React.FC<TypographyProps & { size?: 'sm' | 'md' | 'lg' }> = ({
  children,
  style,
  size = 'md',
  numberOfLines,
}) => {
  const themeMode = useSettingsStore((state) => state.themeMode);
  const colors = COLORS[themeMode];

  const fontSize = TYPOGRAPHY.sizes[size];
  const lineHeight = TYPOGRAPHY.lineHeights[size];

  return (
    <RNText
      numberOfLines={numberOfLines}
      style={[
        styles.subheading,
        {
          color: colors.muted,
          fontSize,
          lineHeight,
          letterSpacing: TYPOGRAPHY.tracking.normal,
        },
        style,
      ]}
    >
      {children}
    </RNText>
  );
};

// ─── Body ─────────────────────────────────────────────────────────────────────

export const Body: React.FC<TypographyProps & { size?: 'sm' | 'md' | 'lg' }> = ({
  children,
  style,
  size = 'md',
  numberOfLines,
}) => {
  const themeMode = useSettingsStore((state) => state.themeMode);
  const colors = COLORS[themeMode];

  const fontSize = TYPOGRAPHY.sizes[size];
  const lineHeight = TYPOGRAPHY.lineHeights[size];

  return (
    <RNText
      numberOfLines={numberOfLines}
      style={[
        styles.body,
        {
          color: colors.foreground,
          fontSize,
          lineHeight,
        },
        style,
      ]}
    >
      {children}
    </RNText>
  );
};

// ─── Caption ──────────────────────────────────────────────────────────────────

export const Caption: React.FC<TypographyProps & { size?: 'xs' | 'sm' }> = ({
  children,
  style,
  size = 'sm',
  numberOfLines,
}) => {
  const themeMode = useSettingsStore((state) => state.themeMode);
  const colors = COLORS[themeMode];

  const fontSize = TYPOGRAPHY.sizes[size];
  const lineHeight = TYPOGRAPHY.lineHeights[size];

  return (
    <RNText
      numberOfLines={numberOfLines}
      style={[
        styles.caption,
        {
          color: colors.muted,
          fontSize,
          lineHeight,
        },
        style,
      ]}
    >
      {children}
    </RNText>
  );
};

// ─── Label ────────────────────────────────────────────────────────────────────
// For uppercase section headers, tab labels, status chips

export const Label: React.FC<TypographyProps & { size?: 'xs' | 'sm' }> = ({
  children,
  style,
  size = 'xs',
  numberOfLines,
}) => {
  const themeMode = useSettingsStore((state) => state.themeMode);
  const colors = COLORS[themeMode];

  const fontSize = TYPOGRAPHY.sizes[size];

  return (
    <RNText
      numberOfLines={numberOfLines}
      style={[
        styles.label,
        {
          color: colors.muted,
          fontSize,
        },
        style,
      ]}
    >
      {children}
    </RNText>
  );
};

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  heading: {
    fontFamily: TYPOGRAPHY.fonts.bold,
    fontWeight: TYPOGRAPHY.weights.bold,
    letterSpacing: TYPOGRAPHY.tracking.tight,
  },
  subheading: {
    fontFamily: TYPOGRAPHY.fonts.medium,
    fontWeight: TYPOGRAPHY.weights.medium,
  },
  body: {
    fontFamily: TYPOGRAPHY.fonts.regular,
    fontWeight: TYPOGRAPHY.weights.regular,
  },
  caption: {
    fontFamily: TYPOGRAPHY.fonts.regular,
    fontWeight: TYPOGRAPHY.weights.regular,
  },
  label: {
    fontFamily: TYPOGRAPHY.fonts.bold,
    fontWeight: TYPOGRAPHY.weights.bold,
    textTransform: 'uppercase',
    letterSpacing: TYPOGRAPHY.tracking.caps,
  },
});
