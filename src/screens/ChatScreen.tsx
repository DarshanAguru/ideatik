import React, { useState, useRef, useCallback, useEffect } from 'react';
import { createMMKV } from 'react-native-mmkv';
import {
  View,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Animated,
  Easing,
  Keyboard,
  Alert,
} from 'react-native';
import { ScreenWrapper } from '../components/ScreenWrapper';
import { Heading, Body, Caption, Label } from '../components/Typography';
import { RagResponseView } from '../components/RagResponseView';
import { COLORS, SPACING, RADIUS, TYPOGRAPHY, ANIMATION } from '../theme/theme';
import { useSettingsStore } from '../features/settings/settingsStore';
import {
  BrainCircuit,
  Send,
  Sparkles,
  Download,
  MessageCircleMore,
  ChevronRight,
  Trash2,
} from 'lucide-react-native';
import { RagResult } from '../services/ai/SmartRagService';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from './AppNavigator';

const chatStorage = createMMKV();
const CHAT_HISTORY_KEY = 'ideatik_chat_history_v1';

function loadChatHistory(): ChatMessage[] {
  try {
    const json = chatStorage.getString(CHAT_HISTORY_KEY);
    return json ? JSON.parse(json) : [];
  } catch {
    return [];
  }
}

function saveChatHistory(messages: ChatMessage[]) {
  try {
    // Keep last 50 messages for high performance & light memory footprint
    const recent = messages.slice(-50);
    chatStorage.set(CHAT_HISTORY_KEY, JSON.stringify(recent));
  } catch (err) {
    console.warn('Failed to save chat history:', err);
  }
}

function clearChatHistory() {
  try {
    chatStorage.remove(CHAT_HISTORY_KEY);
  } catch {}
}

// ─── Message Type ─────────────────────────────────────────────────────────────

type MessageRole = 'user' | 'assistant';

interface ChatMessage {
  id: string;
  role: MessageRole;
  text?: string;
  result?: RagResult;
  intent?: string;
  timestamp: number;
}

// ─── Typing Dots ──────────────────────────────────────────────────────────────

const TypingDots: React.FC<{ color: string }> = ({ color }) => {
  const dot1 = useRef(new Animated.Value(0)).current;
  const dot2 = useRef(new Animated.Value(0)).current;
  const dot3 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animate = (val: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(val, { toValue: -4, duration: 260, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
          Animated.timing(val, { toValue: 0, duration: 260, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
          Animated.delay(380),
        ])
      );
    const a1 = animate(dot1, 0);
    const a2 = animate(dot2, 160);
    const a3 = animate(dot3, 320);
    a1.start(); a2.start(); a3.start();
    return () => { a1.stop(); a2.stop(); a3.stop(); };
  }, [dot1, dot2, dot3]);

  return (
    <View style={styles.typingDots}>
      {[dot1, dot2, dot3].map((d, i) => (
        <Animated.View
          key={i}
          style={[styles.dot, { backgroundColor: color, transform: [{ translateY: d }] }]}
        />
      ))}
    </View>
  );
};

// ─── User Bubble ──────────────────────────────────────────────────────────────

const UserBubble: React.FC<{ message: ChatMessage; colors: any }> = ({ message, colors }) => (
  <View style={styles.userBubbleContainer}>
    <View style={[styles.userBubble, { backgroundColor: colors.foreground }]}>
      <Body size="sm" style={{ color: colors.background, lineHeight: 20 }}>
        {message.text}
      </Body>
    </View>
    <Caption size="xs" style={{ color: colors.muted, marginTop: 4, marginRight: 4, textAlign: 'right' }}>
      {formatTime(message.timestamp)}
    </Caption>
  </View>
);

// ─── AI Bubble ────────────────────────────────────────────────────────────────

const IntentBadge: React.FC<{ intent: string; colors: any }> = ({ intent, colors }) => {
  const label =
    intent === 'finance' ? '₹ Finance'
    : intent === 'summary' ? '✦ Summary'
    : '? Q&A';
  return (
    <View style={[styles.intentBadge, { borderColor: colors.border }]}>
      <Caption size="xs" style={{ color: colors.muted, letterSpacing: 0.4 }}>
        {label}
      </Caption>
    </View>
  );
};

const AiBubble: React.FC<{ message: ChatMessage; colors: any; isLoading?: boolean }> = ({
  message,
  colors,
  isLoading = false,
}) => (
  <View style={styles.aiBubbleContainer}>
    {/* Avatar icon */}
    <View style={[styles.aiAvatar, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <BrainCircuit size={14} color={colors.foreground} />
    </View>

    <View style={{ flex: 1 }}>
      {isLoading ? (
        <View style={[styles.aiBubble, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <TypingDots color={colors.muted} />
        </View>
      ) : (
        <>
          {message.intent && <IntentBadge intent={message.intent} colors={colors} />}
          <View style={[styles.aiBubble, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            {message.result ? (
              <RagResponseView result={message.result} />
            ) : (
              <Body size="sm" style={{ color: colors.foreground, lineHeight: 22 }}>
                {message.text}
              </Body>
            )}
          </View>
          <Caption size="xs" style={{ color: colors.muted, marginTop: 4, marginLeft: 4 }}>
            {formatTime(message.timestamp)}
          </Caption>
        </>
      )}
    </View>
  </View>
);

// ─── No Model Card ────────────────────────────────────────────────────────────

const NoModelCard: React.FC<{ colors: any; onGoSettings: () => void }> = ({ colors, onGoSettings }) => (
  <View style={[styles.noModelCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
    <Download size={28} color={colors.foreground} style={{ marginBottom: SPACING.sm }} />
    <Heading size="sm" style={{ color: colors.foreground, textAlign: 'center', marginBottom: SPACING.xs }}>
      Offline AI not ready
    </Heading>
    <Body size="sm" style={{ color: colors.muted, textAlign: 'center', lineHeight: 20 }}>
      Download the offline AI models from Settings to enable note-level Q&A, summaries, and finance insights — all on your device.
    </Body>
    <TouchableOpacity
      style={[styles.goSettingsBtn, { backgroundColor: colors.foreground }]}
      onPress={onGoSettings}
      activeOpacity={0.8}
    >
      <Label size="sm" style={{ color: colors.background, fontWeight: TYPOGRAPHY.weights.semibold }}>
        Go to Settings
      </Label>
      <ChevronRight size={14} color={colors.background} />
    </TouchableOpacity>
  </View>
);

// ─── Empty State ──────────────────────────────────────────────────────────────

const EmptyState: React.FC<{ colors: any }> = ({ colors }) => (
  <View style={styles.emptyState}>
    <MessageCircleMore size={40} color={colors.muted} style={{ marginBottom: SPACING.md }} />
    <Heading size="sm" style={{ color: colors.foreground, marginBottom: SPACING.xs, textAlign: 'center' }}>
      Ask anything about your notes
    </Heading>
    <Body size="sm" style={{ color: colors.muted, textAlign: 'center', lineHeight: 20 }}>
      Ask expense questions, get summaries, or search for specific details captured in your notebooks.
    </Body>

    <View style={styles.suggestionList}>
      {SUGGESTIONS.map((s, i) => (
        <View key={i} style={[styles.suggestion, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Caption size="sm" style={{ color: colors.muted }}>{s}</Caption>
        </View>
      ))}
    </View>
  </View>
);

const SUGGESTIONS = [
  '"What was my Goa trip food expense?"',
  '"Summarize my meeting notes"',
  '"When did I note the dentist appointment?"',
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

const formatTime = (ts: number) =>
  new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

const uid = () => Math.random().toString(36).substr(2, 9);

// ─── ChatScreen ───────────────────────────────────────────────────────────────

export const ChatScreen: React.FC = () => {
  const themeMode = useSettingsStore((state) => state.themeMode);
  const embeddingModelUri = useSettingsStore((state) => state.embeddingModelUri);
  const llmModelUri = useSettingsStore((state) => state.llmModelUri);
  const colors = COLORS[themeMode];
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();

  const [messages, setMessages] = useState<ChatMessage[]>(() => loadChatHistory());
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [hasModels, setHasModels] = useState<boolean | null>(null);

  const listRef = useRef<FlatList<ChatMessage>>(null);

  const [keyboardVisible, setKeyboardVisible] = useState(false);

  // Automatically save chat history whenever messages change
  useEffect(() => {
    saveChatHistory(messages);
  }, [messages]);

  // Keyboard scroll & visibility handling
  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const subShow = Keyboard.addListener(showEvent, () => {
      setKeyboardVisible(true);
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
    });
    const subHide = Keyboard.addListener(hideEvent, () => {
      setKeyboardVisible(false);
    });

    return () => {
      subShow.remove();
      subHide.remove();
    };
  }, []);

  // Check model availability on focus
  useFocusEffect(
    useCallback(() => {
      const check = async () => {
        try {
          const { OfflineAiModelService } = require('../services/ai/OfflineAiModelService');
          const [emb, llm] = await Promise.all([
            OfflineAiModelService.checkModelExists('embedding'),
            OfflineAiModelService.checkModelExists('llm'),
          ]);
          setHasModels(emb && llm);
        } catch {
          // If OfflineAiModelService unavailable, check store URIs as fallback
          setHasModels(Boolean(embeddingModelUri && llmModelUri));
        }
      };
      check();
    }, [embeddingModelUri, llmModelUri])
  );

  const scrollToBottom = useCallback(() => {
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 120);
  }, []);

  const sendMessage = useCallback(async () => {
    const query = inputText.trim();
    if (!query || isLoading) return;

    Keyboard.dismiss();
    setInputText('');

    const userMsg: ChatMessage = {
      id: uid(),
      role: 'user',
      text: query,
      timestamp: Date.now(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setIsLoading(true);
    scrollToBottom();

    try {
      const { SmartRagService } = require('../services/ai/SmartRagService');
      const intent: string = SmartRagService.classifyIntent(query);
      const result: RagResult = await SmartRagService.answer(query);

      const aiMsg: ChatMessage = {
        id: uid(),
        role: 'assistant',
        result,
        intent,
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, aiMsg]);
    } catch (err: any) {
      const errMsg = err?.message === 'LLM_MODEL_NOT_CONFIGURED' || err?.message === 'EMBEDDING_MODEL_NOT_CONFIGURED'
        ? 'Offline AI models are not configured. Go to Settings → Offline AI to download them.'
        : "Something went wrong while searching your notes. Please try again.";

      const aiMsg: ChatMessage = {
        id: uid(),
        role: 'assistant',
        text: errMsg,
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, aiMsg]);
    } finally {
      setIsLoading(false);
      scrollToBottom();
    }
  }, [inputText, isLoading, scrollToBottom]);

  const renderItem = ({ item }: { item: ChatMessage }) => {
    if (item.role === 'user') {
      return <UserBubble message={item} colors={colors} />;
    }
    return <AiBubble message={item} colors={colors} />;
  };

  return (
    <ScreenWrapper safeBottom={false}>
      {/* ── Header ────────────────────────────────────────────────────────── */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <View style={styles.headerLeft}>
          <BrainCircuit size={20} color={colors.foreground} />
          <Heading
            size="sm"
            style={{ color: colors.foreground, marginLeft: SPACING.sm }}
          >
            Chat with Notes
          </Heading>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING.md }}>
          {messages.length > 0 && (
            <TouchableOpacity
              onPress={() => {
                Alert.alert('Clear Chat History', 'Are you sure you want to clear your chat history?', [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Clear History',
                    style: 'destructive',
                    onPress: () => {
                      setMessages([]);
                      clearChatHistory();
                    },
                  },
                ]);
              }}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Trash2 size={16} color={colors.muted} />
            </TouchableOpacity>
          )}
          <Sparkles size={16} color={colors.muted} />
        </View>
      </View>

      {/* ── Body ──────────────────────────────────────────────────────────── */}
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior="padding"
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 80}
      >
        {/* No-model gate */}
        {hasModels === false ? (
          <View style={styles.noModelWrapper}>
            <NoModelCard
              colors={colors}
              onGoSettings={() => {
                // Navigate to Settings tab
                (navigation as any).navigate('SettingsTab');
              }}
            />
          </View>
        ) : (
          <>
            <FlatList
              ref={listRef}
              data={messages}
              keyExtractor={(item) => item.id}
              renderItem={renderItem}
              contentContainerStyle={styles.listContent}
              ListEmptyComponent={<EmptyState colors={colors} />}
              ListFooterComponent={
                isLoading
                  ? <AiBubble
                      message={{ id: '__loading', role: 'assistant', timestamp: Date.now() }}
                      colors={colors}
                      isLoading
                    />
                  : null
              }
              onContentSizeChange={scrollToBottom}
              keyboardShouldPersistTaps="handled"
            />

            {/* ── Input bar ──────────────────────────────────────────────── */}
            <View style={[
              styles.inputBar,
              {
                backgroundColor: colors.background,
                borderTopColor: colors.border,
                paddingBottom: keyboardVisible ? SPACING.xs : Math.max(insets.bottom, SPACING.xs),
              },
            ]}>
              <View style={[styles.inputWrap, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <TextInput
                  value={inputText}
                  onChangeText={setInputText}
                  placeholder="Ask your notes anything…"
                  placeholderTextColor={colors.placeholder}
                  style={[styles.textInput, { color: colors.foreground }]}
                  returnKeyType="send"
                  onSubmitEditing={sendMessage}
                  multiline
                  maxLength={500}
                  editable={!isLoading}
                />
              </View>
              <TouchableOpacity
                style={[
                  styles.sendBtn,
                  { backgroundColor: colors.foreground, opacity: isLoading || !inputText.trim() ? 0.4 : 1 },
                ]}
                onPress={sendMessage}
                disabled={isLoading || !inputText.trim()}
                activeOpacity={0.8}
              >
                {isLoading
                  ? <ActivityIndicator size="small" color={colors.background} />
                  : <Send size={16} color={colors.background} />
                }
              </TouchableOpacity>
            </View>
          </>
        )}
      </KeyboardAvoidingView>
    </ScreenWrapper>
  );
};

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  listContent: {
    padding: SPACING.lg,
    paddingBottom: SPACING.xl,
    gap: SPACING.md,
    flexGrow: 1,
  },
  userBubbleContainer: {
    alignItems: 'flex-end',
    marginVertical: 2,
  },
  userBubble: {
    maxWidth: '80%',
    borderRadius: RADIUS.lg,
    borderBottomRightRadius: RADIUS.xs,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  aiBubbleContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.sm,
    marginVertical: 2,
  },
  aiAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  aiBubble: {
    maxWidth: '90%',
    borderRadius: RADIUS.lg,
    borderTopLeftRadius: RADIUS.xs,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
  },
  intentBadge: {
    alignSelf: 'flex-start',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: RADIUS.full,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
    marginBottom: SPACING.xs,
  },
  typingDots: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 4,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: SPACING.sm,
    paddingBottom: Platform.OS === 'android' ? SPACING.md : SPACING.sm,
  },
  inputWrap: {
    flex: 1,
    borderRadius: RADIUS.xl,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: SPACING.md,
    paddingVertical: Platform.OS === 'ios' ? SPACING.sm : 6,
    maxHeight: 120,
  },
  textInput: {
    fontSize: TYPOGRAPHY.sizes.sm,
    lineHeight: 20,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.xxxl,
  },
  suggestionList: {
    marginTop: SPACING.xl,
    gap: SPACING.sm,
    width: '100%',
  },
  suggestion: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.md,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
  },
  noModelWrapper: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACING.xl,
  },
  noModelCard: {
    borderRadius: RADIUS.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: SPACING.xl,
    alignItems: 'center',
    width: '100%',
  },
  goSettingsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    marginTop: SPACING.lg,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.full,
  },
});
