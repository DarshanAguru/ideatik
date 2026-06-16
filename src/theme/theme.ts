// ─── Spacing ─────────────────────────────────────────────────────────────────
// Based on a 4px base unit with intentional jumps for rhythm

export const SPACING = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
  huge: 64,
  section: 28, // Between major sections
};

// ─── Typography ───────────────────────────────────────────────────────────────
// Notebook-inspired type system. Maximum clarity, minimum noise.
// System font stack — feels native and frictionless.

export const TYPOGRAPHY = {
  fonts: {
    regular: 'System',
    medium: 'System',
    bold: 'System',
    mono: 'monospace',
  },
  sizes: {
    xs: 11,
    sm: 13,
    md: 15,
    lg: 18,
    xl: 22,
    xxl: 28,
    xxxl: 38,
    display: 48,
  },
  weights: {
    light: '300' as const,
    regular: '400' as const,
    medium: '500' as const,
    semibold: '600' as const,
    bold: '700' as const,
    black: '900' as const,
  },
  // Tracking (letterSpacing) — applied per-component for precision
  tracking: {
    tight: -0.5,
    normal: 0,
    wide: 0.5,
    wider: 1,
    caps: 1.5,  // For uppercase labels
  },
  lineHeights: {
    xs: 15,
    sm: 18,
    md: 22,
    lg: 26,
    xl: 30,
    xxl: 36,
    xxxl: 46,
    display: 54,
  },
};

// ─── Colors ───────────────────────────────────────────────────────────────────
// Strictly black/white. Single accent (error). No decorative color.

export const COLORS = {
  light: {
    background: '#FAFAF8',   // Warm off-white — "aged paper" feel
    foreground: '#0D0D0D',   // Near-black — rich, not harsh
    muted: '#717171',        // 45% gray — secondary text
    border: '#E8E8E5',       // Barely-there separator
    card: '#FFFFFF',         // Pure white for elevated cards
    accent: '#0D0D0D',       // Same as foreground for active states
    placeholder: '#ADADAD',  // Input placeholder
    surface: '#F2F2EF',      // Slightly off-white container
    surfaceElevated: '#FFFFFF',
    success: '#0D0D0D',      // Monochrome — no green
    error: '#D0021B',        // Single non-neutral color: errors only
    overlay: 'rgba(13, 13, 13, 0.04)',   // Hover / pressed state
    overlayStrong: 'rgba(13, 13, 13, 0.5)', // Modal dimming
  },
  dark: {
    background: '#0D0D0D',   // Almost pure black
    foreground: '#F0F0ED',   // Warm near-white
    muted: '#888888',        // 53% gray
    border: '#252525',       // Very dark separator
    card: '#171717',         // Slightly elevated dark
    accent: '#F0F0ED',       // Same as foreground
    placeholder: '#555555',  // Dark-mode placeholder
    surface: '#161616',      // Secondary containers
    surfaceElevated: '#1F1F1F',
    success: '#F0F0ED',
    error: '#FF4444',        // Slightly lighter red for dark bg
    overlay: 'rgba(240, 240, 237, 0.04)',
    overlayStrong: 'rgba(0, 0, 0, 0.65)',
  },
};

// ─── Animation ───────────────────────────────────────────────────────────────
// Principles: fast entry, gentle exit. Nothing over 300ms.
// All values in milliseconds unless noted.

export const ANIMATION = {
  // Duration
  instant: 80,     // Icon state changes, checkbox toggles
  fast: 150,       // Tab switches, small state changes
  normal: 220,     // Screen entry components
  gentle: 300,     // Full screen transitions, modals
  slow: 450,       // Only for ambient/idle animations

  // Spring config (for Animated.spring)
  spring: {
    tap: { useNativeDriver: true, bounciness: 4, speed: 40 },      // Button press-in
    settle: { useNativeDriver: true, bounciness: 6, speed: 20 },   // Element arriving
    bounce: { useNativeDriver: true, bounciness: 12, speed: 14 },  // Playful pop
  },

  // Easing descriptions (use with Animated.timing)
  easing: {
    // Standard ease-out curve for exits
    out: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)',
    // Snappy ease for presses
    press: 'cubic-bezier(0.17, 0.67, 0.4, 1.39)',
  },
};

// ─── Border Radius ───────────────────────────────────────────────────────────

export const RADIUS = {
  xs: 4,
  sm: 6,
  md: 10,
  lg: 14,
  xl: 20,
  full: 999, // Pill shape
};

// ─── Shadows ─────────────────────────────────────────────────────────────────
// Subtle. Conveys depth without decoration.

export const SHADOWS = {
  none: {},
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 1,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.10,
    shadowRadius: 8,
    elevation: 3,
  },
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.14,
    shadowRadius: 20,
    elevation: 6,
  },
};

export type ThemeColors = typeof COLORS.light;
