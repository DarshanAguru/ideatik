import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { StyleSheet, View, TextInput, ScrollView, TouchableOpacity, Alert, Dimensions, ActivityIndicator, Modal, Text, KeyboardAvoidingView, Platform } from 'react-native';
import Tts from 'react-native-tts';
import { useRoute, useNavigation } from '@react-navigation/native';
import { ScreenWrapper } from '../components/ScreenWrapper';
import { Heading, Body, Caption, Label } from '../components/Typography';
import { SPACING, COLORS, TYPOGRAPHY, RADIUS } from '../theme/theme';
import { useSettingsStore } from '../features/settings/settingsStore';
import { useNotesStore } from '../features/notes/notesStore';
import { NoteRepository } from '../services/database/NoteRepository';
import { AudioPlayerService } from '../services/audio/AudioPlayerService';
import { WhisperService } from '../services/whisper/WhisperService';
import { BackgroundTaskManager } from '../services/background/BackgroundTaskManager';
// Deleted unused types import
import { Play, Pause, ChevronLeft, Edit3, Check, CheckSquare, Square, ExternalLink, Share2, Trash2, Plus, ChevronDown, ChevronUp, Lock, Unlock, Settings, X } from 'lucide-react-native';
import { triggerHaptic } from '../utils/haptics';
import { authenticate } from '../utils/localAuth';
import { StructuredNoteService } from '../services/notes/StructuredNoteService';
import { ShareOptionsModal } from '../components/ShareOptionsModal';
import { TagBadge } from '../components/TagBadge';
import { useTagsStore } from '../features/tags/tagsStore';
const { width } = Dimensions.get('window');

const ChecklistItemRow = ({ item, colors, onToggle, onDelete, onUpdate, isFinance, onAddNext, onFocus }: any) => {
  const [localText, setLocalText] = useState(item.text);
  const [localAmount, setLocalAmount] = useState(item.amount !== undefined ? String(item.amount) : '');

  useEffect(() => {
    setLocalText(item.text);
  }, [item.text]);

  useEffect(() => {
    setLocalAmount(item.amount !== undefined ? String(item.amount) : '');
  }, [item.amount]);

  const handleBlur = () => {
    const nextAmount = isFinance ? parseFloat(localAmount) || 0 : undefined;
    const currentAmount = item.amount || 0;
    if (localText.trim() !== item.text || (isFinance && nextAmount !== currentAmount)) {
      onUpdate(item.id, localText.trim(), nextAmount);
    }
  };

  return (
    <View style={styles.keepRow}>
      <TouchableOpacity onPress={() => onToggle(item.id, item.checked)} style={styles.keepCheck}>
        {item.checked ? (
          <CheckSquare size={18} color={colors.foreground} />
        ) : (
          <Square size={18} color={colors.muted} />
        )}
      </TouchableOpacity>

      <TextInput
        style={[
          styles.keepInput,
          { color: item.checked ? colors.muted : colors.foreground },
          item.checked ? { textDecorationLine: 'line-through' } : undefined,
        ]}
        value={localText}
        onChangeText={setLocalText}
        onBlur={handleBlur}
        onFocus={onFocus}
        placeholder="List item"
        placeholderTextColor={colors.placeholder}
        returnKeyType="next"
        blurOnSubmit={false}
        onSubmitEditing={() => {
          handleBlur();
          onAddNext?.();
        }}
      />

      {isFinance && (
        <TextInput
          style={[styles.keepAmountInput, { color: colors.foreground }]}
          value={localAmount}
          onChangeText={setLocalAmount}
          onBlur={handleBlur}
          onFocus={onFocus}
          keyboardType="numeric"
          placeholder="₹0.00"
          placeholderTextColor={colors.placeholder}
        />
      )}

      <TouchableOpacity onPress={() => onDelete(item.id)} style={styles.keepDelete}>
        <Trash2 size={16} color={colors.muted} />
      </TouchableOpacity>
    </View>
  );
};

export const NoteDetailScreen: React.FC = () => {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const { noteId } = route.params;

  const themeMode = useSettingsStore((state) => state.themeMode);
  const colors = COLORS[themeMode];

  const { toggleChecklistItem, loadNotes } = useNotesStore();
  const { tags, loadTags, createTag, deleteTag, getTagsByIds } = useTagsStore();

  const [note, setNote] = useState<any>(null);
  const [noteTitle, setNoteTitle] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [bodyText, setBodyText] = useState('');
  const [newTagName, setNewTagName] = useState('');
  const [showManageTagsModal, setShowManageTagsModal] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [detailTab, setDetailTab] = useState<'preview' | 'transcript'>('preview');
  const [backlinks, setBacklinks] = useState<any[]>([]);
  const [availableReferenceNotes, setAvailableReferenceNotes] = useState<any[]>([]);
  const [newItemText, setNewItemText] = useState('');
  const [newItemAmount, setNewItemAmount] = useState('');
  const [isCompletedCollapsed, setIsCompletedCollapsed] = useState(false);
  const [currentPendingRef, setCurrentPendingRef] = useState<string | null>(null);
  const [pendingRefSearch, setPendingRefSearch] = useState('');
  const [ignoredPendingRefs, setIgnoredPendingRefs] = useState<string[]>([]);
  const [processedPendingRefs, setProcessedPendingRefs] = useState<string[]>([]);

  // Audio player state
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioDuration, setAudioDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [audioLoaded, setAudioLoaded] = useState(false);
  
  // TTS player state
  const [isTtsSpeaking, setIsTtsSpeaking] = useState(false);

  // Memoize structured note parsing — avoids re-parsing JSON on every render
  const structuredNote = useMemo(
    () => (note ? StructuredNoteService.fromNote(note) : null),
    [note]
  );

  useEffect(() => {
    const startListener = Tts.addEventListener('tts-start', () => setIsTtsSpeaking(true)) as any;
    const finishListener = Tts.addEventListener('tts-finish', () => setIsTtsSpeaking(false)) as any;
    const cancelListener = Tts.addEventListener('tts-cancel', () => setIsTtsSpeaking(false)) as any;

    return () => {
      Tts.stop();
      if (startListener && typeof startListener.remove === 'function') {
        startListener.remove();
      }
      if (finishListener && typeof finishListener.remove === 'function') {
        finishListener.remove();
      }
      if (cancelListener && typeof cancelListener.remove === 'function') {
        cancelListener.remove();
      }
    };
  }, []);
  
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  
  const progressInterval = useRef<any>(null);

  const noteRef = useRef<any>(null);
  const addItemInputRef = useRef<any>(null);
  const scrollViewRef = useRef<ScrollView>(null);

  // Keep noteRef in sync without causing re-renders
  useEffect(() => {
    noteRef.current = note;
  }, [note]);

  useEffect(() => {
    fetchNoteDetails();
    loadTags();
    setIgnoredPendingRefs([]);
    setProcessedPendingRefs([]);
    return () => {
      AudioPlayerService.release();
      if (progressInterval.current) clearInterval(progressInterval.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noteId]);

  useEffect(() => {
    const unsubscribe = useNotesStore.subscribe((state) => {
      const updatedNote = state.notesList.find((n: any) => n.id === noteId);
      const current = noteRef.current;
      if (updatedNote && current) {
        if (
          current.transcriptionStatus !== updatedNote.transcriptionStatus ||
          current.markdownContent !== updatedNote.markdownContent
        ) {
          fetchNoteDetails();
        }
      }
    });
    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noteId]);

  useEffect(() => {
    if (structuredNote) {
      const activePending = structuredNote.pendingReferenceCommands.filter(
        (ref) => !ignoredPendingRefs.includes(ref) && !processedPendingRefs.includes(ref)
      );
      if (activePending.length > 0 && !currentPendingRef) {
        setCurrentPendingRef(activePending[0]);
        setPendingRefSearch('');
      }
    }
  }, [structuredNote, currentPendingRef, ignoredPendingRefs, processedPendingRefs]);

  const authenticateNote = async (): Promise<boolean> => {
    try {
      const success = await authenticate(
        'Unlock Note',
        'Verify your identity to read this note.'
      );
      if (success) {
        setIsAuthenticated(true);
        setIsCheckingAuth(false);
        return true;
      } else {
        navigation.goBack();
        return false;
      }
    } catch (e) {
      console.error('Note authentication failed:', e);
      navigation.goBack();
      return false;
    }
  };

  const fetchNoteDetails = async () => {
    const data = await NoteRepository.findById(noteId);
    if (data) {
      if (data.isLocked && !isAuthenticated) {
        setIsCheckingAuth(true);
        const success = await authenticateNote();
        if (!success) return;
      } else {
        setIsCheckingAuth(false);
      }

      setNote(data);
      setNoteTitle(data.title);
      setBodyText(StructuredNoteService.bodyText(StructuredNoteService.fromNote(data)));

      // Fetch backlinks
      NoteRepository.findAll().then((allNotes) => {
        setAvailableReferenceNotes(allNotes.filter((n) => n.id !== data.id));
        const links = allNotes.filter((n) => {
          const structured = StructuredNoteService.fromNote(n);
          return n.id !== data.id && structured.referenceIds.some((ref) =>
            ref.noteId === data.id || ref.title.toLowerCase() === data.title.toLowerCase()
          );
        });
        setBacklinks(links);
      });
      
      // Load audio if it exists
      if (data.audioUri) {
        try {
          const dur = await AudioPlayerService.load(data.audioUri);
          setAudioDuration(dur);
          setAudioLoaded(true);
        } catch (e) {
          console.warn('NoteDetail: Audio load failed:', e);
          setAudioLoaded(false);
        }
      }
    } else {
      Alert.alert('Error', 'Note not found.');
      navigation.goBack();
    }
  };



  const handleRetryTranscription = async () => {
    if (!note || !note.audioUri) {
      Alert.alert('No Audio', 'No audio recording is available to re-transcribe.');
      return;
    }
    triggerHaptic('impact');
    try {
      await NoteRepository.save({
        id: note.id,
        transcriptionStatus: 'queued' as any,
        transcriptionError: undefined,
      });
      await BackgroundTaskManager.initialize();
      await BackgroundTaskManager.queueForTranscription(
        note.id,
        note.audioUri,
        note.title || 'Untitled Capture',
        note.type,
        note.duration || 0
      );
      BackgroundTaskManager.startProcessing();
      await fetchNoteDetails();
    } catch (err) {
      console.warn('Retry transcription failed:', err);
      Alert.alert('Error', 'Failed to queue note for transcription.');
    }
  };

  // TTS Playback Actions
  const handleTtsPlayPause = () => {
    if (isTtsSpeaking) {
      Tts.stop();
      setIsTtsSpeaking(false);
      triggerHaptic('impact');
    } else {
      if (!note) return;
      triggerHaptic('selection');

      let speechText = '';
      const structured = StructuredNoteService.fromNote(note);

      if (structured.type === 'list' || structured.type === 'finance') {
        const titleText = note.title || 'Untitled List';
        speechText = `${titleText}. `;
        const structuredNote = StructuredNoteService.toStructuredNote(structured);

        if (structuredNote.items && structuredNote.items.length > 0) {
          structuredNote.items.forEach((item, index) => {
            const itemNum = index + 1;
            const itemName = item.text;
            if (structured.type === 'finance' && item.amount !== undefined) {
              speechText += `item ${itemNum}: ${itemName}, ${item.amount} rupees. `;
            } else {
              speechText += `item ${itemNum}: ${itemName}. `;
            }
          });
        } else {
          speechText += 'No items in this list.';
        }
      } else {
        if (!bodyText) return;
        speechText = bodyText.replace(/\[\d+\]/g, '').trim();
      }

      if (speechText.trim()) {
        Tts.speak(speechText.trim());
      }
    }
  };

  // Audio Playback Actions
  const handlePlayPause = async () => {
    if (!audioLoaded || !note?.audioUri) return;

    if (isPlaying) {
      await AudioPlayerService.pause();
      setIsPlaying(false);
      if (progressInterval.current) clearInterval(progressInterval.current);
    } else {
      setIsPlaying(true);
      await AudioPlayerService.play(() => {
        // Completion callback
        setIsPlaying(false);
        setCurrentTime(0);
        if (progressInterval.current) clearInterval(progressInterval.current);
      });

      // Track progress timer
      progressInterval.current = setInterval(async () => {
        const time = await AudioPlayerService.getCurrentTime();
        setCurrentTime(time);
      }, 250);
    }
  };

  const handleTimelinePress = async (event: any) => {
    if (!audioDuration) return;
    const clickX = event.nativeEvent.locationX;
    const timelineWidth = width - SPACING.xl * 2;
    const percentage = Math.max(0, Math.min(clickX / timelineWidth, 1));
    const targetSeconds = percentage * audioDuration;

    await AudioPlayerService.seek(targetSeconds);
    setCurrentTime(targetSeconds);
  };

  // Note Lifecycle Saves
  const handleSaveContent = async () => {
    if (!note) return;

    const title = noteTitle ? noteTitle.trim() : '';
    const isDefault = title === '' || 
      title.toLowerCase() === 'untitled' ||
      title.toLowerCase() === 'untitled note' || 
      title.toLowerCase() === 'untitled capture' || 
      title.toLowerCase() === 'voice capture' || 
      /^(note|list|finance-list)-\d+$/i.test(title);

    if (note.type === 'note' && bodyText.trim() === '' && isDefault) {
      console.log('Ideatik: Deleting empty untitled note. Purging note and navigating back.');
      await NoteRepository.purge(note.id);
      await loadNotes();
      navigation.goBack();
      return;
    }

    const structured = StructuredNoteService.fromNote(note);
    
    // Scan bodyText for [1], [2], etc.
    const bracketRegex = /\[\d+\]/g;
    const foundSlots = bodyText.match(bracketRegex) || [];
    const uniqueSlots = Array.from(new Set(foundSlots));

    // Keep only referenceLinks that match one of the foundSlots
    const nextReferences = structured.referenceIds.filter((ref) => uniqueSlots.includes(ref.title));

    // Any slot that is in uniqueSlots but not in nextReferences is pending!
    const resolvedTitles = nextReferences.map((ref) => ref.title);
    const newPending = uniqueSlots.filter((slot) => !resolvedTitles.includes(slot));

    const nextStructured = StructuredNoteService.normalize({
      ...structured,
      title: title || 'Untitled',
      bodyBlocks: [bodyText],
      referenceIds: nextReferences,
      pendingReferenceCommands: newPending,
    });

    await NoteRepository.save({
      id: note.id,
      title: nextStructured.title,
      type: nextStructured.type,
      structuredContentJson: StructuredNoteService.toJson(nextStructured),
      transcript: StructuredNoteService.bodyText(nextStructured),
      referenceLinks: nextStructured.referenceIds,
      references: nextStructured.referenceIds.map((ref) => ref.title),
      pendingReferenceCommands: nextStructured.pendingReferenceCommands,
    });

    setIsEditing(false);
    await fetchNoteDetails();
    await loadNotes();
  };

  const handleUpdateTitle = (newTitle: string) => {
    setNoteTitle(newTitle);
    if (!note) return;

    const structured = StructuredNoteService.fromNote(note);
    const nextStructured = {
      ...structured,
      title: newTitle || 'Untitled',
    };

    const updatedNote = {
      ...note,
      title: newTitle || 'Untitled',
      structuredContentJson: StructuredNoteService.toJson(nextStructured),
      markdownContent: StructuredNoteService.toMarkdown(nextStructured),
    };
    
    setNote(updatedNote);
  };

  const handleSaveTitle = async () => {
    if (!note) return;
    const titleToSave = noteTitle.trim() || 'Untitled';

    const structured = StructuredNoteService.fromNote(note);
    const nextStructured = StructuredNoteService.normalize({
      ...structured,
      title: titleToSave,
    });

    const updatedNote = {
      ...note,
      title: titleToSave,
      structuredContentJson: StructuredNoteService.toJson(nextStructured),
      markdownContent: StructuredNoteService.toMarkdown(nextStructured),
    };

    await NoteRepository.save(updatedNote);
    await loadNotes();
  };

  const renderStatsBanner = () => {
    if (!note) return null;
    const structured = StructuredNoteService.fromNote(note);
    const items = StructuredNoteService.items(structured);
    const totalItems = items.length;
    const checkedItems = items.filter(i => i.checked).length;
    const remainingItems = totalItems - checkedItems;

    if (note.type === 'finance') {
      let totalAmount = 0;
      let checkedAmount = 0;
      items.forEach(i => {
        if (i.amount !== undefined) {
          totalAmount += i.amount;
          if (i.checked) {
            checkedAmount += i.amount;
          }
        }
      });
      const remainingAmount = totalAmount - checkedAmount;

      return (
        <View style={[styles.statsBanner, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.statsCol}>
            <Label size="xs" style={{ color: colors.muted }}>{`Total (${totalItems})`}</Label>
            <Body size="sm" style={{ color: colors.foreground, fontWeight: 'bold' }}>
              {`₹${totalAmount.toFixed(2)}`}
            </Body>
          </View>
          <View style={[styles.statsDivider, { backgroundColor: colors.border }]} />
          <View style={styles.statsCol}>
            <Label size="xs" style={{ color: colors.muted }}>{`Spent (${checkedItems})`}</Label>
            <Body size="sm" style={{ color: colors.foreground, fontWeight: 'bold' }}>
              {`₹${checkedAmount.toFixed(2)}`}
            </Body>
          </View>
          <View style={[styles.statsDivider, { backgroundColor: colors.border }]} />
          <View style={styles.statsCol}>
            <Label size="xs" style={{ color: colors.muted }}>Remaining</Label>
            <Body size="sm" style={{ color: colors.foreground, fontWeight: 'bold' }}>
              {`₹${remainingAmount.toFixed(2)}`}
            </Body>
          </View>
        </View>
      );
    } else {
      return (
        <View style={[styles.statsBanner, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.statsCol}>
            <Label size="xs" style={{ color: colors.muted }}>Items</Label>
            <Body size="sm" style={{ color: colors.foreground, fontWeight: 'bold' }}>
              {totalItems}
            </Body>
          </View>
          <View style={[styles.statsDivider, { backgroundColor: colors.border }]} />
          <View style={styles.statsCol}>
            <Label size="xs" style={{ color: colors.muted }}>Completed</Label>
            <Body size="sm" style={{ color: colors.foreground, fontWeight: 'bold' }}>
              {checkedItems}
            </Body>
          </View>
          <View style={[styles.statsDivider, { backgroundColor: colors.border }]} />
          <View style={styles.statsCol}>
            <Label size="xs" style={{ color: colors.muted }}>Remaining</Label>
            <Body size="sm" style={{ color: colors.foreground, fontWeight: 'bold' }}>
              {remainingItems}
            </Body>
          </View>
        </View>
      );
    }
  };

  const handleToggleCheckItem = async (itemId: string, currentChecked: boolean) => {
    if (!note) return;
    triggerHaptic('selection');
    await toggleChecklistItem(note.id, itemId, !currentChecked);
    await fetchNoteDetails();
  };



  const handleWikiLinkPress = async (targetTitle: string) => {
    await NoteRepository.initialize();
    const allNotes = await NoteRepository.findAll();
    
    // Find note matching title case-insensitively
    const match = allNotes.find((n) => n.title.toLowerCase() === targetTitle.toLowerCase());
    
    if (match) {
      // Navigate to details screen for target note ID
      navigation.push('NoteDetail', { noteId: match.id });
    } else {
      Alert.alert(
        'Reference Link',
        `Linked note "${targetTitle}" was not found.`
      );
    }
  };

  const handleAddChecklistItem = async (text: string, amount?: number) => {
    if (!text.trim() || !note) return;
    const structured = StructuredNoteService.fromNote(note);
    const items = StructuredNoteService.items(structured);
    const newItems = [
      ...items,
      {
        id: Math.random().toString(36).substr(2, 9),
        text: text.trim(),
        checked: false,
        amount: amount,
        isChecklist: true,
      }
    ];
    const nextStructured = StructuredNoteService.normalize({
      ...structured,
      // Route to the correct list — finance type uses financeItems, list type uses listItems
      listItems: structured.type === 'finance' ? structured.listItems : newItems,
      financeItems: structured.type === 'finance' ? newItems : structured.financeItems,
    });
    await NoteRepository.save({
      ...note,
      structuredContentJson: StructuredNoteService.toJson(nextStructured),
      markdownContent: StructuredNoteService.toMarkdown(nextStructured),
      transcript: StructuredNoteService.bodyText(nextStructured),
    });
    await fetchNoteDetails();
    await loadNotes();
  };

  const handleDeleteChecklistItem = async (itemId: string) => {
    if (!note) return;
    const structured = StructuredNoteService.fromNote(note);
    const newItems = StructuredNoteService.items(structured).filter((item) => item.id !== itemId);
    
    const title = note.title ? note.title.trim() : '';
    const isDefault = title === '' || 
      title.toLowerCase() === 'untitled capture' || 
      title.toLowerCase() === 'voice capture' || 
      /^(note|list|finance-list)-\d+$/i.test(title);

    if (newItems.length === 0 && isDefault) {
      console.log('Ideatik: Deleting last checklist item of untitled list. Purging note and navigating back.');
      await NoteRepository.purge(note.id);
      await loadNotes();
      navigation.goBack();
      return;
    }

    const nextStructured = StructuredNoteService.normalize({
      ...structured,
      // Route to the correct list — finance type uses financeItems, list type uses listItems
      listItems: structured.type === 'finance' ? structured.listItems : newItems,
      financeItems: structured.type === 'finance' ? newItems : structured.financeItems,
    });
    await NoteRepository.save({
      ...note,
      structuredContentJson: StructuredNoteService.toJson(nextStructured),
      markdownContent: StructuredNoteService.toMarkdown(nextStructured),
      transcript: StructuredNoteService.bodyText(nextStructured),
    });
    await fetchNoteDetails();
    await loadNotes();
  };

  const handleUpdateChecklistItem = async (itemId: string, newText: string, amount?: number) => {
    if (!note) return;
    const structured = StructuredNoteService.fromNote(note);
    const newItems = StructuredNoteService.items(structured).map((item) =>
      item.id === itemId ? { ...item, text: newText, amount: amount } : item
    );
    const nextStructured = StructuredNoteService.normalize({
      ...structured,
      // Route to the correct list — finance type uses financeItems, list type uses listItems
      listItems: structured.type === 'finance' ? structured.listItems : newItems,
      financeItems: structured.type === 'finance' ? newItems : structured.financeItems,
    });
    await NoteRepository.save({
      ...note,
      structuredContentJson: StructuredNoteService.toJson(nextStructured),
      markdownContent: StructuredNoteService.toMarkdown(nextStructured),
      transcript: StructuredNoteService.bodyText(nextStructured),
    });
    await fetchNoteDetails();
    await loadNotes();
  };

  const renderFormattedBodyText = () => {
    if (!bodyText) {
      return (
        <TouchableOpacity onPress={() => setIsEditing(true)}>
          <Body size="md" style={{ color: colors.placeholder, fontStyle: 'italic', paddingVertical: SPACING.md }}>
            No content yet. Tap here or the edit button to start writing...
          </Body>
        </TouchableOpacity>
      );
    }

    const parts = bodyText.split(/(\[\d+\])/g);
    return (
      <View style={[styles.bodyTextContainer, { borderColor: colors.border, backgroundColor: colors.surface }]}>
        <Body size="md" style={{ color: colors.foreground, lineHeight: 24 }}>
          {parts.map((part, index) => {
            const isBracket = /^\[\d+\]$/.test(part);
            if (!isBracket) {
              return <Text key={index} style={{ color: colors.foreground }}>{part}</Text>;
            }

            const resolvedLink = note?.referenceLinks?.find((r: any) => r.title === part && r.noteId);
            if (resolvedLink) {
              const targetNote = availableReferenceNotes.find((n) => n.id === resolvedLink.noteId);
              const displayTitle = targetNote ? `${part} ${targetNote.title}` : part;
              return (
                <Text
                  key={index}
                  onPress={() => {
                    triggerHaptic('selection');
                    navigation.push('NoteDetail', { noteId: resolvedLink.noteId });
                  }}
                  style={{
                    color: colors.accent || '#3b82f6',
                    fontWeight: '700',
                    textDecorationLine: 'underline',
                  }}
                >
                  {displayTitle}
                </Text>
              );
            } else {
              return (
                <Text
                  key={index}
                  onPress={() => {
                    triggerHaptic('selection');
                    setCurrentPendingRef(part);
                    setPendingRefSearch('');
                  }}
                  style={{
                    color: '#f59e0b',
                    fontWeight: '700',
                    textDecorationLine: 'underline',
                  }}
                >
                  {part} ❓
                </Text>
              );
            }
          })}
        </Body>
      </View>
    );
  };

  const renderKeepListEditor = () => {
    if (!note) return null;
    const structured = StructuredNoteService.fromNote(note);
    const items = StructuredNoteService.items(structured);
    const activeItems = items.filter(item => !item.checked);
    const completedItems = items.filter(item => item.checked);

    return (
      <View style={{ flex: 1 }}>
        {/* Active Checklist Items */}
        {activeItems.map((item) => (
          <ChecklistItemRow
            key={item.id}
            item={item}
            colors={colors}
            onToggle={handleToggleCheckItem}
            onDelete={handleDeleteChecklistItem}
            onUpdate={handleUpdateChecklistItem}
            isFinance={note.type === 'finance'}
            onAddNext={() => addItemInputRef.current?.focus()}
            onFocus={() => {
              // KeyboardAvoidingView will resize, let's do a tiny delay scroll
              setTimeout(() => {
                // If it's near the bottom, scrollToEnd. Otherwise, the keyboard avoiding view will handle layout adjustment.
              }, 100);
            }}
          />
        ))}

        {/* Add item row */}
        <View style={[styles.keepAddRow, { borderColor: colors.border }]}>
          <Plus size={18} color={colors.muted} style={{ marginRight: SPACING.sm }} />
          <TextInput
            ref={addItemInputRef}
            style={[styles.keepAddInput, { color: colors.foreground }]}
            placeholder={note.type === 'finance' ? "Add expense..." : "Add item..."}
            placeholderTextColor={colors.placeholder}
            value={newItemText}
            onChangeText={setNewItemText}
            returnKeyType="done"
            blurOnSubmit={false}
            onFocus={() => {
              setTimeout(() => {
                scrollViewRef.current?.scrollToEnd({ animated: true });
              }, 100);
            }}
            onSubmitEditing={() => {
              if (newItemText.trim()) {
                handleAddChecklistItem(newItemText, note.type === 'finance' ? parseFloat(newItemAmount) || 0 : undefined);
                setNewItemText('');
                setNewItemAmount('');
                // Keep focus so user can add another item
                setTimeout(() => addItemInputRef.current?.focus(), 50);
              }
            }}
          />
          {note.type === 'finance' && (
            <TextInput
              style={[styles.keepAddAmountInput, { color: colors.foreground }]}
              placeholder="₹0.00"
              placeholderTextColor={colors.placeholder}
              value={newItemAmount}
              onChangeText={setNewItemAmount}
              keyboardType="numeric"
              returnKeyType="done"
              onFocus={() => {
                setTimeout(() => {
                  scrollViewRef.current?.scrollToEnd({ animated: true });
                }, 100);
              }}
              onSubmitEditing={() => {
                if (newItemText.trim()) {
                  handleAddChecklistItem(newItemText, parseFloat(newItemAmount) || 0);
                  setNewItemText('');
                  setNewItemAmount('');
                }
              }}
            />
          )}
          <TouchableOpacity
            onPress={() => {
              if (newItemText.trim()) {
                handleAddChecklistItem(newItemText, note.type === 'finance' ? parseFloat(newItemAmount) || 0 : undefined);
                setNewItemText('');
                setNewItemAmount('');
              }
            }}
            style={styles.keepAddBtn}
          >
            <Caption size="sm" style={{ color: colors.foreground, fontWeight: '600' }}>Add</Caption>
          </TouchableOpacity>
        </View>

        {/* Completed Items Collapsible Section */}
        {completedItems.length > 0 && (
          <View style={styles.completedSection}>
            <TouchableOpacity
              onPress={() => setIsCompletedCollapsed(!isCompletedCollapsed)}
              style={styles.completedHeader}
            >
              {isCompletedCollapsed ? (
                <ChevronDown size={16} color={colors.muted} />
              ) : (
                <ChevronUp size={16} color={colors.muted} />
              )}
              <Caption size="sm" style={{ color: colors.muted, marginLeft: SPACING.xs, fontWeight: '600' }}>
                {`${completedItems.length} Completed ${completedItems.length === 1 ? 'item' : 'items'}`}
              </Caption>
            </TouchableOpacity>

            {!isCompletedCollapsed && (
              <View style={styles.completedList}>
                {completedItems.map((item) => (
                  <ChecklistItemRow
                    key={item.id}
                    item={item}
                    colors={colors}
                    onToggle={handleToggleCheckItem}
                    onDelete={handleDeleteChecklistItem}
                    onUpdate={handleUpdateChecklistItem}
                    isFinance={note.type === 'finance'}
                    onFocus={() => {
                      setTimeout(() => {
                        // KeyboardAvoidingView will resize
                      }, 100);
                    }}
                  />
                ))}
              </View>
            )}
          </View>
        )}
      </View>
    );
  };

  const showExportOptions = () => {
    if (!note) return;
    triggerHaptic('selection');
    setShowShareModal(true);
  };

  // Helpers
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  const handleToggleLock = async () => {
    if (!note) return;
    triggerHaptic('impact');
    
    if (note.isLocked) {
      // Prompt biometrics to unlock
      try {
        const success = await authenticate(
          'Unlock Note',
          'Verify identity to remove the lock from this note.'
        );
        if (success) {
          const updatedNote = { ...note, isLocked: false };
          await NoteRepository.save(updatedNote);
          setNote(updatedNote);
          await loadNotes();
          Alert.alert('Unlocked', 'Lock removed from this note.');
        }
      } catch (e) {
        console.error('Unlock authentication failed:', e);
      }
    } else {
      // Just lock it and notify user
      const updatedNote = { ...note, isLocked: true };
      await NoteRepository.save(updatedNote);
      setNote(updatedNote);
      setIsAuthenticated(true); // they are already in it
      await loadNotes();
      Alert.alert('Locked', 'This note is now locked. Authentication will be required to open it next time.');
    }
  };

  const saveNoteTags = async (nextTags: string[]) => {
    if (!note) return;
    const updated = { ...note, tags: nextTags };
    setNote(updated);
    await NoteRepository.save(updated);
    await loadNotes();
  };

  const handleCreateTag = async () => {
    const name = newTagName.trim();
    if (!name || !note) return;
    const tag = await createTag(name);
    const nextTags = note.tags?.includes(tag.id) ? note.tags : [...(note.tags || []), tag.id];
    setNewTagName('');
    await saveNoteTags(nextTags);
  };

  const renderTagControls = () => {
    if (!note) return null;
    const selectedTags = getTagsByIds(note.tags || []);
    const availableTags = tags.filter((tag) => !(note.tags || []).includes(tag.id));

    return (
      <View style={styles.tagsPanel}>
        <View style={styles.tagBadgeRow}>
          {selectedTags.map((tag) => (
            <TagBadge
              key={tag.id}
              id={tag.id}
              name={tag.name}
              color={tag.color}
              size="sm"
              onRemove={(id) => saveNoteTags((note.tags || []).filter((tagId: string) => tagId !== id))}
            />
          ))}
          {selectedTags.length === 0 ? (
            <Caption size="sm" style={{ color: colors.muted }}>No tags</Caption>
          ) : null}
        </View>

        <View style={styles.newTagRow}>
          <TextInput
            style={[styles.newTagInput, { color: colors.foreground, borderColor: colors.border }]}
            value={newTagName}
            onChangeText={setNewTagName}
            placeholder="Create tag"
            placeholderTextColor={colors.placeholder}
            onSubmitEditing={handleCreateTag}
          />
          <TouchableOpacity onPress={handleCreateTag} style={[styles.smallPillButton, { borderColor: colors.border }]}>
            <Caption size="sm" style={{ color: colors.foreground, fontWeight: '600' }}>Add</Caption>
          </TouchableOpacity>
          <TouchableOpacity 
            onPress={() => setShowManageTagsModal(true)} 
            style={[
              styles.smallPillButton, 
              { borderColor: colors.border, paddingHorizontal: SPACING.sm, width: 38, height: 38 }
            ]}
          >
            <Settings size={16} color={colors.foreground} />
          </TouchableOpacity>
        </View>

        {availableTags.length > 0 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: SPACING.sm }}>
            <View style={styles.tagBadgeRow}>
              {availableTags.map((tag) => (
                <TouchableOpacity key={tag.id} onPress={() => saveNoteTags([...(note.tags || []), tag.id])}>
                  <TagBadge id={tag.id} name={tag.name} color={tag.color} size="sm" />
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
        ) : null}
      </View>
    );
  };

  const resolvePendingReference = async (targetNote: any, specificRef?: string) => {
    if (!note) return;
    const structured = StructuredNoteService.fromNote(note);
    const pending = [...structured.pendingReferenceCommands];
    
    const refToResolve = specificRef || pending[0];
    if (refToResolve) {
      setProcessedPendingRefs((prev) => [...prev, refToResolve]);
      const idx = pending.indexOf(refToResolve);
      if (idx > -1) {
        pending.splice(idx, 1);
      }
    } else {
      const shifted = pending.shift();
      if (shifted) {
        setProcessedPendingRefs((prev) => [...prev, shifted]);
      }
    }
    
    const nextReferences = [
      ...structured.referenceIds.filter((ref) => ref.title !== refToResolve),
      { noteId: targetNote.id, title: refToResolve },
    ];
    const nextStructured = StructuredNoteService.normalize({
      ...structured,
      referenceIds: nextReferences,
      pendingReferenceCommands: pending,
    });
    await NoteRepository.save({
      id: note.id,
      structuredContentJson: StructuredNoteService.toJson(nextStructured),
      referenceLinks: nextStructured.referenceIds,
      references: nextStructured.referenceIds.map((ref) => ref.title),
      pendingReferenceCommands: nextStructured.pendingReferenceCommands,
    });
    
    setCurrentPendingRef(null);
    await fetchNoteDetails();
    await loadNotes();
  };

  const handleSkipPendingReference = async () => {
    if (!note || !currentPendingRef) return;
    setProcessedPendingRefs((prev) => [...prev, currentPendingRef]);
    const structured = StructuredNoteService.fromNote(note);
    const pending = [...structured.pendingReferenceCommands];
    
    const index = pending.indexOf(currentPendingRef);
    if (index > -1) {
      pending.splice(index, 1);
    }
    
    const nextStructured = StructuredNoteService.normalize({
      ...structured,
      pendingReferenceCommands: pending,
    });
    
    await NoteRepository.save({
      id: note.id,
      structuredContentJson: StructuredNoteService.toJson(nextStructured),
      pendingReferenceCommands: nextStructured.pendingReferenceCommands,
    });
    
    setCurrentPendingRef(null);
    await fetchNoteDetails();
    await loadNotes();
  };

  const handleSkipAllPendingReferences = async () => {
    if (!note) return;
    const structured = StructuredNoteService.fromNote(note);
    setProcessedPendingRefs((prev) => [...prev, ...structured.pendingReferenceCommands]);
    const nextStructured = StructuredNoteService.normalize({
      ...structured,
      pendingReferenceCommands: [],
    });
    
    await NoteRepository.save({
      id: note.id,
      structuredContentJson: StructuredNoteService.toJson(nextStructured),
      pendingReferenceCommands: [],
    });
    
    setCurrentPendingRef(null);
    await fetchNoteDetails();
    await loadNotes();
  };

  const handleIgnorePendingReference = () => {
    if (currentPendingRef) {
      setIgnoredPendingRefs((prev) => [...prev, currentPendingRef]);
      setCurrentPendingRef(null);
    }
  };

  if (isCheckingAuth) {
    return (
      <ScreenWrapper style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={colors.foreground} />
      </ScreenWrapper>
    );
  }

  if (!note) {
    return (
      <ScreenWrapper style={styles.loaderContainer}>
        <Body size="md" style={{ color: colors.muted }}>Loading...</Body>
      </ScreenWrapper>
    );
  }

  return (
    <ScreenWrapper style={styles.container}>
      {/* Top Header Controls */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          style={styles.backButton}
        >
          <ChevronLeft size={22} color={colors.foreground} />
        </TouchableOpacity>

        <Heading size="md" style={{ flex: 1, textAlign: 'center', color: colors.foreground }} numberOfLines={1}>
          {note.type === 'finance' ? 'Finance Ledger' : note.type === 'list' ? 'Checklist' : 'Note'}
        </Heading>

        {isEditing ? (
          <TouchableOpacity onPress={handleSaveContent} style={styles.actionButton}>
            <Check size={20} color={colors.foreground} />
          </TouchableOpacity>
        ) : (
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <TouchableOpacity onPress={handleToggleLock} style={styles.actionButton} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              {note?.isLocked ? (
                <Lock size={18} color={colors.foreground} />
              ) : (
                <Unlock size={18} color={colors.foreground} />
              )}
            </TouchableOpacity>
            <TouchableOpacity onPress={showExportOptions} style={styles.actionButton} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Share2 size={18} color={colors.foreground} />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setIsEditing(true)} style={styles.actionButton} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Edit3 size={18} color={colors.foreground} />
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Audio Player Component Panel */}
      {audioLoaded && (
        <View style={styles.playerContainer}>
          <TouchableOpacity onPress={handlePlayPause} style={[styles.playButton, { backgroundColor: colors.foreground }]}>
            {isPlaying ? (
              <Pause size={18} color={colors.background} fill={colors.background} />
            ) : (
              <Play size={18} color={colors.background} fill={colors.background} style={{ marginLeft: 2 }} />
            )}
          </TouchableOpacity>

          {/* Custom Slider / Timeline bar */}
          <TouchableOpacity
            activeOpacity={1}
            onPress={handleTimelinePress}
            style={styles.timelineWrapper}
          >
            <View style={[styles.timelineTrack, { backgroundColor: colors.border }]}>
              <View
                style={[
                  styles.timelineProgress,
                  {
                    backgroundColor: colors.foreground,
                    width: `${audioDuration ? (currentTime / audioDuration) * 100 : 0}%`,
                  },
                ]}
              />
            </View>
            <View style={styles.timeLabelRow}>
              <Caption size="xs" style={{ color: colors.muted }}>{formatTime(currentTime)}</Caption>
              <Caption size="xs" style={{ color: colors.muted }}>{formatTime(audioDuration)}</Caption>
            </View>
          </TouchableOpacity>
        </View>
      )}

      {/* TTS Reader Panel */}
      {(!note.audioUri) && (
        <View style={styles.playerContainer}>
          <TouchableOpacity
            onPress={handleTtsPlayPause}
            style={[styles.playButton, { backgroundColor: colors.foreground }]}
          >
            {isTtsSpeaking ? (
              <Pause size={18} color={colors.background} fill={colors.background} />
            ) : (
              <Play size={18} color={colors.background} fill={colors.background} style={{ marginLeft: 2 }} />
            )}
          </TouchableOpacity>
          <View style={{ flex: 1, justifyContent: 'center' }}>
            <Body size="sm" style={{ color: colors.foreground, fontWeight: '600' }}>
              {isTtsSpeaking ? 'Reading note content...' : 'Read Note Aloud (TTS)'}
            </Body>
            <Caption size="xs" style={{ color: colors.muted }}>
              Offline Text-to-Speech reader
            </Caption>
          </View>
        </View>
      )}

      {/* Main content viewport — wrapped in KeyboardAvoidingView so input stays visible */}
      {isEditing ? (
        <KeyboardAvoidingView
          style={styles.editorContainer}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
        >
          <TextInput
            style={[styles.contentEditor, { color: colors.foreground, borderColor: colors.border }]}
            multiline
            autoFocus
            value={bodyText}
            onChangeText={setBodyText}
            textAlignVertical="top"
            placeholder="Write your note..."
            placeholderTextColor={colors.placeholder}
          />
        </KeyboardAvoidingView>
      ) : (
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 80}
        >
          {/* Segment Selector Tabs */}
          <View style={styles.tabsContainer}>
            <TouchableOpacity
              onPress={() => {
                triggerHaptic('selection');
                setDetailTab('preview');
              }}
              style={[
                styles.tabItem,
                detailTab === 'preview' ? { borderBottomColor: colors.foreground, borderBottomWidth: 2 } : undefined,
              ]}
            >
              <Body size="sm" style={{ color: detailTab === 'preview' ? colors.foreground : colors.muted, fontWeight: '600' }}>
                Note
              </Body>
            </TouchableOpacity>

            {/* Only show Transcript tab if the note has an audio recording */}
            {note.audioUri ? (
              <TouchableOpacity
                onPress={() => {
                  triggerHaptic('selection');
                  setDetailTab('transcript');
                }}
                style={[
                  styles.tabItem,
                  detailTab === 'transcript' ? { borderBottomColor: colors.foreground, borderBottomWidth: 2 } : undefined,
                ]}
              >
                <Body size="sm" style={{ color: detailTab === 'transcript' ? colors.foreground : colors.muted, fontWeight: '600' }}>
                  Transcript
                </Body>
              </TouchableOpacity>
            ) : null}
          </View>

          <ScrollView
            ref={scrollViewRef}
            style={styles.scrollView}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <TextInput
              style={[
                styles.detailTitleInput,
                {
                  color: colors.foreground,
                }
              ]}
              value={noteTitle}
              onChangeText={handleUpdateTitle}
              onBlur={handleSaveTitle}
              placeholder="Capturing Elegance..."
              placeholderTextColor={colors.placeholder}
            />
            {renderTagControls()}

            {(note.transcriptionStatus === 'queued' ||
              note.transcriptionStatus === 'processing' ||
              note.transcriptionStatus === 'processing_offline') && (
              <View style={[styles.statusPanel, { borderColor: colors.border, backgroundColor: colors.surface }]}>
                <Caption size="sm" style={{ color: colors.muted }}>
                  {note.transcriptionStatus === 'queued'
                    ? 'Transcription queued (model downloading...)'
                    : 'Transcribing...'}
                </Caption>
              </View>
            )}

            {note.transcriptionStatus === 'failed' && (
              <View
                style={[
                  styles.statusPanel,
                  {
                    borderColor: colors.error,
                    backgroundColor: colors.surface,
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    paddingVertical: SPACING.sm,
                    paddingHorizontal: SPACING.md,
                  },
                ]}
              >
                <Caption size="sm" style={{ color: colors.error, flex: 1, marginRight: SPACING.sm }}>
                  Transcription failed. Audio is preserved.
                </Caption>
                {note.audioUri ? (
                  <TouchableOpacity
                    style={{
                      backgroundColor: colors.foreground,
                      paddingHorizontal: SPACING.md,
                      paddingVertical: SPACING.xs,
                      borderRadius: 8,
                    }}
                    onPress={handleRetryTranscription}
                  >
                    <Body size="sm" style={{ color: colors.background, fontWeight: '700' }}>
                      Retry
                    </Body>
                  </TouchableOpacity>
                ) : null}
              </View>
            )}

            {/* Transcribe button for audio-only notes with no transcript yet */}
            {note.type === 'note' &&
              !!note.audioUri &&
              (!note.transcript || note.transcript.trim().length === 0) &&
              note.transcriptionStatus !== 'queued' &&
              note.transcriptionStatus !== 'processing' &&
              note.transcriptionStatus !== 'processing_offline' &&
              note.transcriptionStatus !== 'failed' && (
              <View
                style={[
                  styles.statusPanel,
                  {
                    borderColor: colors.border,
                    backgroundColor: colors.surface,
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    paddingVertical: SPACING.sm,
                    paddingHorizontal: SPACING.md,
                  },
                ]}
              >
                <Caption size="sm" style={{ color: colors.muted, flex: 1, marginRight: SPACING.sm }}>
                  Audio recorded. Tap to transcribe.
                </Caption>
                <TouchableOpacity
                  style={{
                    backgroundColor: colors.foreground,
                    paddingHorizontal: SPACING.md,
                    paddingVertical: SPACING.xs,
                    borderRadius: 8,
                  }}
                  onPress={handleRetryTranscription}
                >
                  <Body size="sm" style={{ color: colors.background, fontWeight: '700' }}>
                    Transcribe
                  </Body>
                </TouchableOpacity>
              </View>
            )}

            {detailTab === 'preview' ? (
              <View style={styles.renderViewport}>
                {(note.type === 'list' || note.type === 'finance') && renderStatsBanner()}
                {note.type === 'list' || note.type === 'finance' ? (
                  renderKeepListEditor()
                ) : (
                  renderFormattedBodyText()
                )}

                {structuredNote && structuredNote.referenceIds.length > 0 && (
                  <View style={[styles.referencesPanel, { borderColor: colors.border }]}>
                    <Heading size="sm" style={{ color: colors.muted, marginBottom: SPACING.sm }}>
                      References
                    </Heading>
                    {structuredNote.referenceIds.map((ref, index) => (
                      <TouchableOpacity
                        key={`${ref.noteId || ref.title}-${index}`}
                        style={[styles.wikiLinkButton, { borderColor: colors.border }]}
                        onPress={() => ref.noteId ? navigation.push('NoteDetail', { noteId: ref.noteId }) : handleWikiLinkPress(ref.title)}
                      >
                        <ExternalLink size={14} color={colors.foreground} style={{ marginRight: SPACING.xs }} />
                        <Body size="sm" style={[styles.wikiLinkText, { color: colors.foreground }]}>
                          {ref.title || 'Unresolved reference'}
                        </Body>
                      </TouchableOpacity>
                    ))}
                    {structuredNote && structuredNote.pendingReferenceCommands.length > 0 && (
                      <View style={[styles.pendingReferenceBox, { borderColor: colors.border, backgroundColor: colors.surface }]}>
                        <Caption size="sm" style={{ color: colors.muted, marginBottom: SPACING.sm }}>
                         {`${structuredNote!.pendingReferenceCommands.length} reference ${structuredNote!.pendingReferenceCommands.length === 1 ? 'mention needs' : 'mentions need'} a note selected.`}
                        </Caption>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                          <View style={styles.referenceChoiceRow}>
                            {availableReferenceNotes.slice(0, 12).map((candidate) => (
                              <TouchableOpacity
                                key={candidate.id}
                                style={[styles.referenceChoice, { borderColor: colors.border, backgroundColor: colors.card }]}
                                onPress={() => resolvePendingReference(candidate)}
                              >
                                <Caption size="sm" style={{ color: colors.foreground }} numberOfLines={1}>
                                  {candidate.title}
                                </Caption>
                              </TouchableOpacity>
                            ))}
                          </View>
                        </ScrollView>
                      </View>
                    )}
                  </View>
                )}

                {/* Backlinks Section */}
                {backlinks.length > 0 && (
                  <View style={[styles.backlinksContainer, { borderColor: colors.border }]}>
                    <Heading size="sm" style={[styles.backlinksHeading, { color: colors.muted }]}>
                      Backlinks
                    </Heading>
                    <View style={styles.backlinksRow}>
                      {backlinks.map((link) => (
                        <TouchableOpacity
                          key={link.id}
                          style={[styles.backlinkBadge, { backgroundColor: colors.surface, borderColor: colors.border }]}
                          onPress={() => navigation.push('NoteDetail', { noteId: link.id })}
                        >
                          <Caption size="sm" style={{ color: colors.foreground }}>
                            {link.title}
                          </Caption>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                )}
              </View>
            ) : (
              <View style={styles.transcriptViewport}>
                <Body size="sm" style={[styles.transcriptText, { color: colors.foreground }]}>
                  {note.transcript || 'No transcript text available.'}
                </Body>
              </View>
            )}
            <View style={{ height: SPACING.huge }} />
          </ScrollView>
        </KeyboardAvoidingView>
      )}
      <ShareOptionsModal
        visible={showShareModal}
        onClose={() => setShowShareModal(false)}
        note={note}
        themeMode={themeMode}
      />
      <Modal
        visible={!!currentPendingRef}
        transparent
        animationType="slide"
        onRequestClose={handleIgnorePendingReference}
      >
        <View style={styles.modalOverlay}>
          <View
            style={[
              styles.modalSheet,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <View style={styles.modalHandle} />
            <Heading size="md" style={{ color: colors.foreground, marginBottom: SPACING.xs }}>
              Resolve Voice Reference
            </Heading>
            <Body size="sm" style={{ color: colors.foreground, marginBottom: SPACING.md }}>
              Choose a note to link for the command:{' '}
              <Body size="sm" style={{ fontWeight: 'bold', fontStyle: 'italic', color: colors.accent }}>
                "{currentPendingRef}"
              </Body>
            </Body>

            <TextInput
              style={[
                styles.modalSearch,
                {
                  color: colors.foreground,
                  borderColor: colors.border,
                  backgroundColor: colors.surface,
                },
              ]}
              placeholder="Search notes to link..."
              placeholderTextColor={colors.placeholder}
              value={pendingRefSearch}
              onChangeText={setPendingRefSearch}
            />

            <ScrollView style={styles.modalList} showsVerticalScrollIndicator={false}>
              {availableReferenceNotes
                .filter((n) =>
                  n.title.toLowerCase().includes(pendingRefSearch.toLowerCase())
                )
                .map((candidate) => (
                  <TouchableOpacity
                    key={candidate.id}
                    style={[styles.modalItem, { borderColor: colors.border }]}
                    onPress={() => {
                      triggerHaptic('selection');
                      resolvePendingReference(candidate, currentPendingRef || undefined);
                    }}
                    activeOpacity={0.8}
                  >
                    <Body size="sm" style={{ color: colors.foreground, fontWeight: TYPOGRAPHY.weights.medium }}>
                      {candidate.title}
                    </Body>
                    <Caption size="xs" style={{ color: colors.muted, marginTop: 2 }}>
                      {candidate.type.toUpperCase()} ·{' '}
                      {new Date(candidate.createdAt).toLocaleDateString([], {
                        month: 'short',
                        day: 'numeric',
                      })}
                    </Caption>
                  </TouchableOpacity>
                ))}
              {availableReferenceNotes.filter((n) =>
                n.title.toLowerCase().includes(pendingRefSearch.toLowerCase())
              ).length === 0 && (
                <Caption
                  size="sm"
                  style={{ color: colors.muted, textAlign: 'center', marginTop: SPACING.xl }}
                >
                  No notes found.
                </Caption>
              )}
            </ScrollView>

            <View style={{ gap: SPACING.sm }}>
              <TouchableOpacity
                style={[styles.modalClose, { borderColor: colors.border }]}
                onPress={handleSkipPendingReference}
                activeOpacity={0.8}
              >
                <Body size="sm" style={{ color: colors.foreground, fontWeight: TYPOGRAPHY.weights.semibold }}>
                  Remove Reference Command
                </Body>
              </TouchableOpacity>

              <View style={{ flexDirection: 'row', gap: SPACING.sm }}>
                <TouchableOpacity
                  style={[styles.modalClose, { flex: 1, borderColor: colors.border }]}
                  onPress={handleSkipAllPendingReferences}
                  activeOpacity={0.8}
                >
                  <Body size="sm" style={{ color: colors.error, fontWeight: TYPOGRAPHY.weights.semibold }}>
                    Clear All
                  </Body>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.modalClose, { flex: 1, borderColor: colors.border }]}
                  onPress={handleIgnorePendingReference}
                  activeOpacity={0.8}
                >
                  <Body size="sm" style={{ color: colors.foreground, fontWeight: TYPOGRAPHY.weights.semibold }}>
                    Decide Later
                  </Body>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={showManageTagsModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowManageTagsModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View
            style={[
              styles.modalSheet,
              { backgroundColor: colors.card, borderColor: colors.border, maxHeight: '80%' },
            ]}
          >
            <View style={styles.modalHandle} />
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.md }}>
              <Heading size="md" style={{ color: colors.foreground }}>
                Manage Tags
              </Heading>
              <TouchableOpacity onPress={() => setShowManageTagsModal(false)}>
                <X size={20} color={colors.foreground} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalList} showsVerticalScrollIndicator={false}>
              {tags.map((tag) => (
                <View
                  key={tag.id}
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    paddingVertical: SPACING.md,
                    borderBottomWidth: StyleSheet.hairlineWidth,
                    borderBottomColor: colors.border,
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING.sm }}>
                    <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: tag.color }} />
                    <Body size="sm" style={{ color: colors.foreground, fontWeight: TYPOGRAPHY.weights.medium }}>
                      {tag.name}
                    </Body>
                  </View>
                  <TouchableOpacity
                    onPress={() => {
                      triggerHaptic('selection');
                      Alert.alert(
                        'Delete Tag',
                        `Are you sure you want to delete the tag "${tag.name}"? It will be removed from all notes.`,
                        [
                          { text: 'Cancel', style: 'cancel' },
                          {
                            text: 'Delete',
                            style: 'destructive',
                            onPress: async () => {
                              triggerHaptic('success');
                              await deleteTag(tag.id);
                              await fetchNoteDetails();
                            },
                          },
                        ]
                      );
                    }}
                    style={{ padding: SPACING.xs }}
                  >
                    <Trash2 size={16} color={colors.error} />
                  </TouchableOpacity>
                </View>
              ))}

              {tags.length === 0 ? (
                <Caption
                  size="sm"
                  style={{ color: colors.muted, textAlign: 'center', marginTop: SPACING.xl }}
                >
                  No tags created yet.
                </Caption>
              ) : null}
            </ScrollView>

            <TouchableOpacity
              style={[styles.modalClose, { borderColor: colors.border, marginTop: SPACING.md }]}
              onPress={() => setShowManageTagsModal(false)}
              activeOpacity={0.8}
            >
              <Body size="sm" style={{ color: colors.foreground, fontWeight: TYPOGRAPHY.weights.semibold }}>
                Close
              </Body>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </ScreenWrapper>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: SPACING.xl,
    paddingTop: SPACING.md,
  },
  bodyTextContainer: {
    minHeight: 180,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
    padding: SPACING.md,
    marginBottom: SPACING.md,
  },
  detailTitleInput: {
    fontSize: 24,
    fontWeight: 'bold',
    marginVertical: SPACING.md,
    paddingHorizontal: SPACING.xs,
    borderBottomWidth: 1,
    borderBottomColor: 'transparent',
  },
  tagsPanel: {
    marginBottom: SPACING.md,
  },
  tagBadgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.xs,
    alignItems: 'center',
  },
  newTagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginTop: SPACING.sm,
  },
  newTagInput: {
    flex: 1,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
    paddingHorizontal: SPACING.md,
    height: 38,
    fontSize: 14,
  },
  smallPillButton: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
    paddingHorizontal: SPACING.md,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bodyEditor: {
    minHeight: 220,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
    padding: SPACING.md,
    fontSize: 16,
    lineHeight: 24,
  },
  statusPanel: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
    padding: SPACING.md,
    marginBottom: SPACING.md,
  },
  referencesPanel: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: SPACING.md,
    marginTop: SPACING.lg,
  },
  pendingReferenceBox: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
    padding: SPACING.md,
    marginTop: SPACING.md,
  },
  referenceChoiceRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  referenceChoice: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    maxWidth: 180,
  },
  statsBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    borderWidth: 1,
    borderRadius: SPACING.sm,
    paddingVertical: SPACING.sm,
    marginBottom: SPACING.lg,
  },
  statsCol: {
    alignItems: 'center',
    flex: 1,
    gap: 2,
  },
  statsDivider: {
    width: 1,
    height: 24,
  },
  loaderContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.md,
    height: 40,
  },
  backButton: {
    paddingRight: SPACING.md,
  },
  actionButton: {
    paddingLeft: SPACING.md,
  },
  playerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.lg,
    padding: SPACING.md,
    borderRadius: SPACING.sm,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.05)',
  },
  playButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING.md,
  },
  timelineWrapper: {
    flex: 1,
  },
  timelineTrack: {
    height: 4,
    borderRadius: 2,
    position: 'relative',
    width: '100%',
    marginBottom: SPACING.xs,
  },
  timelineProgress: {
    height: '100%',
    borderRadius: 2,
  },
  timeLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  editorContainer: {
    flex: 1,
    marginBottom: SPACING.xl,
  },
  contentEditor: {
    flex: 1,
    borderWidth: 1,
    borderRadius: SPACING.sm,
    padding: SPACING.md,
    fontFamily: 'monospace',
    fontSize: 14,
    lineHeight: 20,
  },
  tabsContainer: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.05)',
    marginBottom: SPACING.md,
  },
  tabItem: {
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.md,
    marginRight: SPACING.sm,
  },
  scrollView: {
    flex: 1,
  },
  renderViewport: {
    paddingVertical: SPACING.sm,
  },
  transcriptViewport: {
    paddingVertical: SPACING.sm,
  },
  paragraphSpacing: {
    height: SPACING.sm,
  },
  heading1: {
    fontWeight: '700',
    marginTop: SPACING.md,
    marginBottom: SPACING.sm,
  },
  paragraphText: {
    lineHeight: 20,
    marginBottom: SPACING.sm,
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: SPACING.xs,
  },
  bulletDot: {
    marginRight: SPACING.sm,
    fontSize: 14,
  },
  bulletText: {
    flex: 1,
    lineHeight: 20,
  },
  checklistRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  checkboxIcon: {
    marginRight: SPACING.sm,
  },
  checklistText: {
    flex: 1,
    lineHeight: 20,
  },
  wikiLinkButton: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: SPACING.sm,
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.md,
    marginVertical: SPACING.xs,
  },
  wikiLinkText: {
    fontWeight: '600',
  },
  statsBlock: {
    borderLeftWidth: 3,
    padding: SPACING.md,
    borderRadius: SPACING.xs,
    marginVertical: SPACING.md,
  },
  transcriptText: {
    lineHeight: 22,
    fontStyle: 'italic',
  },
  backlinksContainer: {
    marginTop: SPACING.huge,
    borderTopWidth: 1,
    paddingTop: SPACING.lg,
  },
  backlinksHeading: {
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: SPACING.sm,
  },
  backlinksRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  backlinkBadge: {
    borderWidth: 1,
    borderRadius: SPACING.xs,
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.sm,
    marginRight: SPACING.xs,
    marginBottom: SPACING.xs,
  },
  aiViewport: {
    paddingVertical: SPACING.sm,
  },
  aiTitle: {
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: SPACING.md,
  },
  aiButtonGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: SPACING.sm,
  },
  aiActionButton: {
    flex: 1,
    height: 44,
    borderWidth: 1,
    borderRadius: SPACING.xs,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 4,
  },
  aiActionText: {
    fontWeight: '600',
  },
  aiLoader: {
    alignItems: 'center',
    marginVertical: SPACING.md,
  },
  aiErrorBox: {
    borderWidth: 1,
    borderRadius: SPACING.xs,
    padding: SPACING.md,
    marginVertical: SPACING.md,
  },
  aiResultContainer: {
    marginTop: SPACING.lg,
  },
  resultTitle: {
    fontWeight: '700',
  },
  suggestedTitleRow: {
    borderWidth: 1,
    borderRadius: SPACING.xs,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  aiPreviewBox: {
    borderWidth: 1,
    borderRadius: SPACING.sm,
    padding: SPACING.md,
    marginBottom: SPACING.md,
  },
  applyButton: {
    height: 48,
    borderRadius: SPACING.sm,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: SPACING.xs,
  },
  keepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.xs,
    gap: SPACING.sm,
  },
  keepCheck: {
    padding: 4,
  },
  keepInput: {
    flex: 1,
    fontSize: 15,
    paddingVertical: 4,
    paddingHorizontal: 0,
  },
  keepAmountInput: {
    width: 65,
    fontSize: 15,
    textAlign: 'right',
    paddingVertical: 4,
  },
  keepDelete: {
    padding: 6,
  },
  keepAddRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: SPACING.md,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: SPACING.md,
    height: 48,
  },
  keepAddInput: {
    flex: 1,
    fontSize: 15,
    height: '100%',
    padding: 0,
  },
  keepAddAmountInput: {
    width: 65,
    fontSize: 15,
    textAlign: 'right',
    height: '100%',
    padding: 0,
    marginRight: SPACING.sm,
  },
  keepAddBtn: {
    paddingVertical: 6,
    paddingHorizontal: SPACING.md,
  },
  completedSection: {
    marginTop: SPACING.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(128,128,128,0.2)',
    paddingTop: SPACING.md,
  },
  completedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.sm,
    paddingVertical: 4,
  },
  completedList: {
    opacity: 0.75,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  modalSheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    paddingTop: SPACING.lg,
    paddingHorizontal: SPACING.xl,
    paddingBottom: SPACING.xxl,
    maxHeight: '80%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 24,
  },
  modalHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(128,128,128,0.25)',
    alignSelf: 'center',
    marginBottom: SPACING.md,
  },
  modalSearch: {
    height: 46,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: SPACING.md,
    fontSize: 15,
    marginBottom: SPACING.lg,
  },
  modalList: {
    maxHeight: 240,
    marginBottom: SPACING.md,
  },
  modalItem: {
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.md,
    borderBottomWidth: 1,
    borderRadius: 8,
    marginBottom: 4,
  },
  modalClose: {
    paddingVertical: SPACING.md,
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    marginTop: SPACING.sm,
  },
});
