import React from 'react';
import { View, Text, ScrollView } from 'react-native';
import { COLORS, SPACING, TYPOGRAPHY } from '../theme/theme';
import { NoteChecklistItem } from '../services/parsers/types';
import { Body, Caption, Heading } from './Typography';

interface FormattedNoteProps {
  title: string;
  bodyText: string;
  items?: NoteChecklistItem[];
  type: 'note' | 'list' | 'finance';
  themeMode: 'light' | 'dark';
}

/**
 * Display a formatted note without markdown
 */
export const FormattedNote: React.FC<FormattedNoteProps> = ({
  title,
  bodyText,
  items = [],
  type,
  themeMode,
}) => {
  const colors = COLORS[themeMode];

  return (
    <ScrollView
      style={{
        flex: 1,
        backgroundColor: colors.background,
        paddingVertical: SPACING.md,
        paddingHorizontal: SPACING.lg,
      }}
      scrollEnabled={false}
    >
      {/* Title */}
      {title && (
        <Heading
          size="lg"
          style={{
            color: colors.foreground,
            marginBottom: SPACING.lg,
            fontWeight: TYPOGRAPHY.weights.bold,
          }}
        >
          {title}
        </Heading>
      )}

      {/* Body Text */}
      {bodyText && type === 'note' && (
        <Body
          style={{
            color: colors.foreground,
            marginBottom: SPACING.lg,
            lineHeight: 24,
          }}
        >
          {bodyText}
        </Body>
      )}

      {/* List Items */}
      {items.length > 0 && (
        <View style={{ gap: SPACING.sm, marginTop: SPACING.md }}>
          {items.map((item) => (
            <View
              key={item.id}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                paddingVertical: SPACING.sm,
                paddingHorizontal: SPACING.md,
                backgroundColor: colors.surface,
                borderRadius: 8,
              }}
            >
              {/* Checkbox or bullet */}
              <View
                style={{
                  width: 20,
                  height: 20,
                  borderRadius: 4,
                  borderWidth: 1,
                  borderColor: item.checked ? colors.foreground : colors.border,
                  backgroundColor: item.checked ? colors.foreground : 'transparent',
                  marginRight: SPACING.md,
                  justifyContent: 'center',
                  alignItems: 'center',
                }}
              >
                {item.checked && <Text style={{ color: colors.background }}>✓</Text>}
              </View>

              {/* Text and Amount */}
              <View style={{ flex: 1 }}>
                <Body
                  style={{
                    color: item.checked ? colors.muted : colors.foreground,
                    textDecorationLine: item.checked ? 'line-through' : 'none',
                  }}
                >
                  {item.text}
                </Body>
              </View>

              {/* Amount (for finance) */}
              {item.amount !== undefined && (
                <Caption
                  style={{
                    color: colors.foreground,
                    fontWeight: TYPOGRAPHY.weights.bold,
                    marginLeft: SPACING.md,
                  }}
                >
                  ${item.amount.toFixed(2)}
                </Caption>
              )}
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
};
