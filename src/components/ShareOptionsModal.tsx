import React, { useState } from 'react';
import { View, TouchableOpacity, Modal, Text, ActivityIndicator, Alert } from 'react-native';
import Clipboard from '@react-native-clipboard/clipboard';
import {
  FileText,
  File,
  Music,
  X,
  Copy,
} from 'lucide-react-native';
import { COLORS, SPACING, TYPOGRAPHY } from '../theme/theme';
import { ExportService, ExportedFile } from '../services/export/ExportService';
import { StructuredNoteService } from '../services/notes/StructuredNoteService';

interface ShareOptionsModalProps {
  visible: boolean;
  onClose: () => void;
  note: any;
  themeMode: 'light' | 'dark';
}

interface ExportOption {
  id: string;
  label: string;
  icon: any;
  format: 'txt' | 'md' | 'pdf' | 'audio' | 'copy';
}

/**
 * Modal for selecting export format and sharing
 */
export const ShareOptionsModal: React.FC<ShareOptionsModalProps> = ({
  visible,
  onClose,
  note,
  themeMode,
}) => {
  const colors = COLORS[themeMode];
  const [isExporting, setIsExporting] = useState(false);

  const exportOptions: ExportOption[] = [
    { id: '1', label: 'Text (.txt)', icon: FileText, format: 'txt' },
    { id: '2', label: 'Markdown (.md)', icon: File, format: 'md' },
    { id: '3', label: 'PDF (.pdf)', icon: File, format: 'pdf' },
    { id: '5', label: 'Copy as Markdown', icon: Copy, format: 'copy' },
  ];

  // Add audio option only if note has recording
  if (note?.audioUri) {
    exportOptions.push({
      id: '4',
      label: 'Audio Recording (.wav)',
      icon: Music,
      format: 'audio',
    });
  }

  const handleExport = async (format: ExportOption['format']) => {
    setIsExporting(true);
    try {
      if (format === 'copy') {
        const markdown = StructuredNoteService.toMarkdown(StructuredNoteService.fromNote(note));
        Clipboard.setString(markdown);
        Alert.alert('Copied', 'Note/List copied to clipboard in Markdown format.');
        setIsExporting(false);
        onClose();
        return;
      }

      let exportedFile: ExportedFile;

      switch (format) {
        case 'txt':
          exportedFile = await ExportService.exportToTxt(note);
          break;
        case 'md':
          exportedFile = await ExportService.exportToMd(note);
          break;
        case 'pdf':
          exportedFile = await ExportService.exportToPdf(note);
          break;
        case 'audio':
          exportedFile = await ExportService.exportAudio(note, 'wav');
          break;
        default:
          throw new Error('Unknown format');
      }

      // Open share sheet
      await ExportService.shareFile(exportedFile);
      
      // Close modal on success
      setIsExporting(false);
      onClose();
    } catch (error) {
      setIsExporting(false);
      const errorMsg = error instanceof Error ? error.message : 'Export failed';
      Alert.alert('Export Error', errorMsg);
    }
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
            backgroundColor: colors.card,
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            borderWidth: 1,
            borderColor: colors.border,
            paddingTop: SPACING.lg,
            paddingHorizontal: SPACING.lg,
            paddingBottom: SPACING.xl,
            maxHeight: '80%',
          }}
        >
          {/* Header */}
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: SPACING.sm,
            }}
          >
            <Text
              style={{
                fontSize: TYPOGRAPHY.sizes.lg,
                fontWeight: TYPOGRAPHY.weights.bold,
                color: colors.foreground,
              }}
            >
              Export & Share
            </Text>
            <TouchableOpacity
              onPress={onClose}
              disabled={isExporting}
              hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
            >
              <X size={20} color={colors.foreground} />
            </TouchableOpacity>
          </View>

          {/* Note Title */}
          <Text
            style={{
              fontSize: TYPOGRAPHY.sizes.xs,
              color: colors.muted,
              marginBottom: SPACING.lg,
            }}
          >
            {note?.title || 'Untitled'}
          </Text>

          {/* Export Options Grid */}
          <View
            style={{
              gap: SPACING.md,
              marginBottom: SPACING.lg,
            }}
          >
            {exportOptions.map((option) => {
              const Icon = option.icon;
              return (
                <TouchableOpacity
                  key={option.id}
                  onPress={() => handleExport(option.format)}
                  disabled={isExporting}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    padding: SPACING.md,
                    backgroundColor: colors.surface,
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: colors.border,
                    gap: SPACING.md,
                  }}
                >
                  {isExporting ? (
                    <ActivityIndicator size="small" color={colors.foreground} />
                  ) : (
                    <Icon size={20} color={colors.foreground} />
                  )}

                  <View style={{ flex: 1 }}>
                    <Text
                      style={{
                        fontSize: TYPOGRAPHY.sizes.sm,
                        fontWeight: TYPOGRAPHY.weights.bold,
                        color: colors.foreground,
                      }}
                    >
                      {option.label}
                    </Text>
                    <Text
                      style={{
                        fontSize: TYPOGRAPHY.sizes.xs,
                        color: colors.muted,
                        marginTop: 2,
                      }}
                    >
                      {option.format === 'audio'
                        ? 'Share your voice memo'
                        : option.format === 'copy'
                        ? 'Copy note content to clipboard'
                        : `Share as ${option.label.split('(')[1]?.slice(0, -1) || 'file'}`}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Cancel Button */}
          <TouchableOpacity
            onPress={onClose}
            disabled={isExporting}
            style={{
              padding: SPACING.md,
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: 12,
              alignItems: 'center',
              backgroundColor: colors.surface,
            }}
          >
            <Text
              style={{
                fontSize: TYPOGRAPHY.sizes.sm,
                fontWeight: TYPOGRAPHY.weights.bold,
                color: colors.foreground,
                textAlign: 'center',
              }}
            >
              {isExporting ? 'Exporting...' : 'Cancel'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};
