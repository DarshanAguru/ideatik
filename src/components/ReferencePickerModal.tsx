import React, { useState, useMemo } from 'react';
import {
  View,
  TouchableOpacity,
  Modal,
  Text,
  TextInput,
  ScrollView,
} from 'react-native';
import { Check, X } from 'lucide-react-native';
import { COLORS, SPACING, TYPOGRAPHY } from '../theme/theme';
import { NoteMetadata } from '../services/database/types';

interface ReferencePickerModalProps {
  visible: boolean;
  onClose: () => void;
  onSelectReferences: (references: string[]) => void;
  availableNotes: NoteMetadata[];
  suggestedReferences: string[];
  themeMode: 'light' | 'dark';
}

/**
 * Modal for selecting which notes to reference
 * Allows user to confirm and customize reference suggestions
 */
export const ReferencePickerModal: React.FC<ReferencePickerModalProps> = ({
  visible,
  onClose,
  onSelectReferences,
  availableNotes,
  suggestedReferences,
  themeMode,
}) => {
  const colors = COLORS[themeMode];
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedReferences, setSelectedReferences] = useState<string[]>(suggestedReferences);

  // Filter available notes by search query
  const filteredNotes = useMemo(() => {
    if (!searchQuery.trim()) {
      return availableNotes;
    }

    const query = searchQuery.toLowerCase();
    return availableNotes.filter((note) =>
      note.title.toLowerCase().includes(query)
    );
  }, [availableNotes, searchQuery]);

  const handleToggleReference = (title: string) => {
    setSelectedReferences((prev) =>
      prev.includes(title) ? prev.filter((t) => t !== title) : [...prev, title]
    );
  };

  const handleConfirm = () => {
    onSelectReferences(selectedReferences);
    onClose();
  };

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View
        style={{
          flex: 1,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          justifyContent: 'flex-end',
        }}
      >
        <View
          style={{
            backgroundColor: colors.background,
            borderTopLeftRadius: 16,
            borderTopRightRadius: 16,
            maxHeight: '90%',
            paddingTop: SPACING.lg,
          }}
        >
          {/* Header */}
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
              paddingHorizontal: SPACING.lg,
              paddingBottom: SPACING.lg,
            }}
          >
            <Text
              style={{
                fontSize: TYPOGRAPHY.sizes.lg,
                fontWeight: TYPOGRAPHY.weights.bold,
                color: colors.foreground,
              }}
            >
              Select References
            </Text>
            <TouchableOpacity
              onPress={onClose}
              hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
            >
              <X size={24} color={colors.foreground} />
            </TouchableOpacity>
          </View>

          {/* Search */}
          <View style={{ paddingHorizontal: SPACING.lg, marginBottom: SPACING.md }}>
            <TextInput
              style={{
                backgroundColor: colors.surface,
                borderRadius: 8,
                paddingHorizontal: SPACING.md,
                paddingVertical: SPACING.sm,
                color: colors.foreground,
                fontSize: TYPOGRAPHY.sizes.sm,
              }}
              placeholder="Search notes..."
              placeholderTextColor={colors.muted}
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
          </View>

          {/* Notes List */}
          <ScrollView
            style={{
              flex: 1,
              paddingHorizontal: SPACING.lg,
              marginBottom: SPACING.lg,
            }}
          >
            {filteredNotes.length > 0 ? (
              filteredNotes.map((note) => {
                const isSelected = selectedReferences.includes(note.title);
                return (
                  <TouchableOpacity
                    key={note.id}
                    onPress={() => handleToggleReference(note.title)}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      padding: SPACING.md,
                      marginBottom: SPACING.sm,
                      backgroundColor: isSelected
                        ? colors.foreground + '15'
                        : colors.surface,
                      borderRadius: 8,
                      borderWidth: 1,
                      borderColor: isSelected ? colors.foreground : colors.border,
                    }}
                  >
                    {/* Checkbox */}
                    <View
                      style={{
                        width: 20,
                        height: 20,
                        borderRadius: 4,
                        borderWidth: 1,
                        borderColor: isSelected ? colors.foreground : colors.border,
                        backgroundColor: isSelected ? colors.foreground : 'transparent',
                        justifyContent: 'center',
                        alignItems: 'center',
                        marginRight: SPACING.md,
                      }}
                    >
                      {isSelected && (
                        <Check size={14} color={colors.background} strokeWidth={3} />
                      )}
                    </View>

                    {/* Note Info */}
                    <View style={{ flex: 1 }}>
                      <Text
                        style={{
                          fontSize: TYPOGRAPHY.sizes.sm,
                          fontWeight: TYPOGRAPHY.weights.bold,
                          color: colors.foreground,
                          marginBottom: 2,
                        }}
                        numberOfLines={1}
                      >
                        {note.title}
                      </Text>
                      <Text
                        style={{
                          fontSize: TYPOGRAPHY.sizes.xs,
                          color: colors.muted,
                        }}
                        numberOfLines={1}
                      >
                        {new Date(note.createdAt).toLocaleDateString()} •{' '}
                        {note.type.charAt(0).toUpperCase() + note.type.slice(1)}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })
            ) : (
              <View
                style={{
                  alignItems: 'center',
                  justifyContent: 'center',
                  paddingVertical: SPACING.xl,
                }}
              >
                <Text style={{ color: colors.muted, fontSize: TYPOGRAPHY.sizes.sm }}>
                  No notes found
                </Text>
              </View>
            )}
          </ScrollView>

          {/* Action Buttons */}
          <View
            style={{
              flexDirection: 'row',
              gap: SPACING.md,
              paddingHorizontal: SPACING.lg,
              paddingVertical: SPACING.lg,
              borderTopWidth: 1,
              borderTopColor: colors.border,
            }}
          >
            <TouchableOpacity
              onPress={onClose}
              style={{
                flex: 1,
                paddingVertical: SPACING.md,
                borderRadius: 8,
                borderWidth: 1,
                borderColor: colors.border,
              }}
            >
              <Text
                style={{
                  color: colors.foreground,
                  fontSize: TYPOGRAPHY.sizes.sm,
                  fontWeight: TYPOGRAPHY.weights.bold,
                  textAlign: 'center',
                }}
              >
                Cancel
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handleConfirm}
              style={{
                flex: 1,
                paddingVertical: SPACING.md,
                borderRadius: 8,
                backgroundColor: colors.foreground,
              }}
            >
              <Text
                style={{
                  color: colors.background,
                  fontSize: TYPOGRAPHY.sizes.sm,
                  fontWeight: TYPOGRAPHY.weights.bold,
                  textAlign: 'center',
                }}
              >
                Confirm ({selectedReferences.length})
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};
