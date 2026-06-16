import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { X } from 'lucide-react-native';
import { SPACING, TYPOGRAPHY } from '../theme/theme';

interface TagBadgeProps {
  id: string;
  name: string;
  color: string;
  onRemove?: (id: string) => void;
  size?: 'sm' | 'md' | 'lg';
}

/**
 * Display a single tag badge
 */
export const TagBadge: React.FC<TagBadgeProps> = ({
  id,
  name,
  color,
  onRemove,
  size = 'md',
}) => {
  const sizeStyles = {
    sm: { paddingHorizontal: SPACING.xs, paddingVertical: 2, fontSize: 12 },
    md: { paddingHorizontal: SPACING.sm, paddingVertical: 4, fontSize: 14 },
    lg: { paddingHorizontal: SPACING.md, paddingVertical: 6, fontSize: 16 },
  };

  const currentSize = sizeStyles[size];

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: color + '20', // 20% opacity
        borderColor: color,
        borderWidth: 1,
        borderRadius: 16,
        paddingHorizontal: currentSize.paddingHorizontal,
        paddingVertical: currentSize.paddingVertical,
        gap: SPACING.xs,
      }}
    >
      <Text
        style={{
          color: color,
          fontSize: currentSize.fontSize,
          fontWeight: TYPOGRAPHY.weights.medium,
        }}
        numberOfLines={1}
      >
        {name}
      </Text>

      {onRemove && (
        <TouchableOpacity
          onPress={() => onRemove(id)}
          hitSlop={{ top: 4, right: 4, bottom: 4, left: 4 }}
        >
          <X size={size === 'sm' ? 12 : size === 'md' ? 14 : 16} color={color} />
        </TouchableOpacity>
      )}
    </View>
  );
};
