import {
  QuickReactionBar,
  ReactionDisplay,
  ReactionUsersModal,
} from "@/components/message-reactions";
import VoiceMessageBubble, {
  resetAudioMode,
} from "@/components/voice-message-bubble";
import { getAvatarColor } from "@/constants/colors";
import { useAuth } from "@/contexts/auth-context";
import { useTheme } from "@/contexts/theme-context";
import { useUserOnlineStatus } from "@/hooks/use-presence";
import { pickImageOrVideo, takePhoto, uploadMedia } from "@/lib/media-service";
import { supabase } from "@/lib/supabase";
import { GroupedReaction, Message, Profile } from "@/types/database";
import { Ionicons } from "@expo/vector-icons";
import { RealtimeChannel } from "@supabase/supabase-js";
import { decode } from "base64-arraybuffer";
import { Audio, ResizeMode, Video } from "expo-av";
import { BlurView } from "expo-blur";
import * as Clipboard from "expo-clipboard";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import * as Haptics from "expo-haptics";
import * as Location from "expo-location";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as Sharing from "expo-sharing";
import React, { useEffect, useRef, useState } from "react";
import {
  ActionSheetIOS,
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { WebView } from "react-native-webview";

interface MessageWithSender extends Message {
  sender: Profile | null;
  replied_message?: {
    id: string;
    content: string | null;
    sender: Profile | null;
    media_type: "image" | "video" | "audio" | "location" | "file" | null;
  } | null;
  reactions?: GroupedReaction[];
}

// Безопасная вибрация (не работает на веб)
const safeHaptic = (
  style: Haptics.ImpactFeedbackStyle = Haptics.ImpactFeedbackStyle.Light,
) => {
  if (Platform.OS !== "web") {
    Haptics.impactAsync(style);
  }
};

const safeNotificationHaptic = (
  type: Haptics.NotificationFeedbackType = Haptics.NotificationFeedbackType
    .Success,
) => {
  if (Platform.OS !== "web") {
    Haptics.notificationAsync(type);
  }
};

export default function ChatScreen() {
  const { id, highlightMessage } = useLocalSearchParams<{
    id: string;
    highlightMessage?: string;
  }>();
  const [messages, setMessages] = useState<MessageWithSender[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [liveMetering, setLiveMetering] = useState(0);
  const [chatName, setChatName] = useState("Чат");
  const [otherUser, setOtherUser] = useState<Profile | null>(null);
  const [isGroup, setIsGroup] = useState(false);
  const [memberCount, setMemberCount] = useState(0);
  const [chatAvatarUrl, setChatAvatarUrl] = useState<string | null>(null);
  const [showAvatarViewer, setShowAvatarViewer] = useState(false);
  const { user } = useAuth();
  const { colors, isDark } = useTheme();
  const flatListRef = useRef<FlatList>(null);
  const skipAutoScrollRef = useRef(false);
  const isNearBottomRef = useRef(true);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const router = useRouter();
  const channelRef = useRef<RealtimeChannel | null>(null);
  const blockChannelRef = useRef<RealtimeChannel | null>(null);
  const recordingRef = useRef<Audio.Recording | null>(null);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const waveformDataRef = useRef<number[]>([]);
  const [playingAudioId, setPlayingAudioId] = useState<string | null>(null);
  const soundRef = useRef<Audio.Sound | null>(null);
  const [editingMessage, setEditingMessage] =
    useState<MessageWithSender | null>(null);
  const [replyingTo, setReplyingTo] = useState<MessageWithSender | null>(null);
  const [selectedMessage, setSelectedMessage] =
    useState<MessageWithSender | null>(null);
  const [showMessageMenu, setShowMessageMenu] = useState(false);
  const menuAnimation = useRef(new Animated.Value(0)).current;
  const recordButtonScale = useRef(new Animated.Value(1)).current;
  const [showMediaPicker, setShowMediaPicker] = useState(false);
  const mediaPickerAnimation = useRef(new Animated.Value(0)).current;
  const isPickingDocumentRef = useRef(false);

  // Сброс флага при монтировании компонента
  useEffect(() => {
    isPickingDocumentRef.current = false;
  }, []);

  const [fullscreenMedia, setFullscreenMedia] = useState<{
    url: string;
    type: "image" | "video";
  } | null>(null);
  const [documentViewer, setDocumentViewer] = useState<{
    url: string;
    name: string;
  } | null>(null);
  const [documentLoading, setDocumentLoading] = useState(false);
  const [typingUsers, setTypingUsers] = useState<
    { id: string; username: string; avatar_url: string | null }[]
  >([]);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTypingSentRef = useRef<number>(0);
  const typingDot1 = useRef(new Animated.Value(0.3)).current;
  const typingDot2 = useRef(new Animated.Value(0.3)).current;
  const typingDot3 = useRef(new Animated.Value(0.3)).current;
  const [pinnedMessages, setPinnedMessages] = useState<
    { message: MessageWithSender; isPersonal: boolean }[]
  >([]);
  const [currentPinnedIndex, setCurrentPinnedIndex] = useState(0);
  const pinnedAnimation = useRef(new Animated.Value(0)).current;
  const [highlightedMessageId, setHighlightedMessageId] = useState<
    string | null
  >(null);
  const highlightAnimation = useRef(new Animated.Value(0)).current;
  const [showPinOptions, setShowPinOptions] = useState(false);
  const pinOptionsAnimation = useRef(new Animated.Value(0)).current;
  const [messageToPin, setMessageToPin] = useState<MessageWithSender | null>(
    null,
  );
  // Поиск по сообщениям
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<MessageWithSender[]>([]);
  const [currentSearchIndex, setCurrentSearchIndex] = useState(0);
  const searchAnimation = useRef(new Animated.Value(0)).current;
  const searchInputRef = useRef<TextInput>(null);

  // Реакции на сообщения
  const [showQuickReactions, setShowQuickReactions] = useState(false);
  const [quickReactionMessageId, setQuickReactionMessageId] = useState<
    string | null
  >(null);
  const quickReactionAnimation = useRef(new Animated.Value(0)).current;
  const [showReactionUsers, setShowReactionUsers] = useState(false);
  const [selectedReactionForUsers, setSelectedReactionForUsers] =
    useState<GroupedReaction | null>(null);
  const [allReactionsForModal, setAllReactionsForModal] = useState<
    GroupedReaction[]
  >([]);

  // Онлайн статус собеседника
  const { isOnline, formatLastSeen } = useUserOnlineStatus(
    otherUser?.id || null,
  );

  // Блокировка пользователя
  const [isBlocked, setIsBlocked] = useState(false); // Я заблокировал собеседника
  const [isBlockedByOther, setIsBlockedByOther] = useState(false); // Собеседник заблокировал меня

  // Анимация точек печатания
  useEffect(() => {
    if (typingUsers.length > 0) {
      const animateDot = (dot: Animated.Value, delay: number) => {
        return Animated.loop(
          Animated.sequence([
            Animated.delay(delay),
            Animated.timing(dot, {
              toValue: 1,
              duration: 300,
              useNativeDriver: true,
            }),
            Animated.timing(dot, {
              toValue: 0.3,
              duration: 300,
              useNativeDriver: true,
            }),
          ]),
        );
      };

      const animations = Animated.parallel([
        animateDot(typingDot1, 0),
        animateDot(typingDot2, 150),
        animateDot(typingDot3, 300),
      ]);

      animations.start();

      return () => {
        animations.stop();
        typingDot1.setValue(0.3);
        typingDot2.setValue(0.3);
        typingDot3.setValue(0.3);
      };
    }
  }, [typingUsers.length]);

  useEffect(() => {
    fetchChatInfo();
    fetchMessages();
    fetchPinnedMessages();
    subscribeToMessages();
    checkBlockStatus();
    subscribeToBlockStatus();

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
      }
      if (blockChannelRef.current) {
        supabase.removeChannel(blockChannelRef.current);
      }
      if (soundRef.current) {
        soundRef.current.unloadAsync();
      }
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
      }
    };
  }, [id]);

  // Подсветка сообщения из глобального поиска
  useEffect(() => {
    if (highlightMessage && messages.length > 0 && !loading) {
      skipAutoScrollRef.current = true;
      const timer = setTimeout(() => {
        const msgIndex = messages.findIndex((m) => m.id === highlightMessage);
        if (msgIndex !== -1) {
          setHighlightedMessageId(highlightMessage);

          flatListRef.current?.scrollToIndex({
            index: msgIndex,
            animated: true,
            viewPosition: 0.5,
          });

          // Анимация подсветки
          highlightAnimation.setValue(0);
          Animated.sequence([
            Animated.timing(highlightAnimation, {
              toValue: 1,
              duration: 300,
              useNativeDriver: true,
            }),
            Animated.timing(highlightAnimation, {
              toValue: 0.4,
              duration: 200,
              useNativeDriver: true,
            }),
            Animated.timing(highlightAnimation, {
              toValue: 1,
              duration: 200,
              useNativeDriver: true,
            }),
            Animated.delay(800),
            Animated.timing(highlightAnimation, {
              toValue: 0,
              duration: 400,
              useNativeDriver: true,
            }),
          ]).start(() => {
            setHighlightedMessageId(null);
            // Сбрасываем флаг через небольшую задержку после анимации
            setTimeout(() => {
              skipAutoScrollRef.current = false;
            }, 500);
          });
        }
      }, 500);

      return () => clearTimeout(timer);
    }
  }, [highlightMessage, messages.length, loading]);

  const fetchChatInfo = async () => {
    if (!id || !user) return;

    try {
      const { data: chat } = await supabase
        .from("chats")
        .select("*")
        .eq("id", id)
        .single();

      if (!chat) return;

      // Устанавливаем информацию о группе
      setIsGroup(chat.is_group);
      setChatAvatarUrl(chat.avatar_url);

      // Получаем участников
      const { data: members } = await supabase
        .from("chat_members")
        .select("user_id")
        .eq("chat_id", id);

      setMemberCount(members?.length || 0);

      if (chat.is_group) {
        // Для группы используем имя группы
        setChatName(chat.name || "Группа");
      } else {
        // Для личного чата - имя собеседника
        const otherMemberIds =
          members?.filter((m) => m.user_id !== user.id).map((m) => m.user_id) ||
          [];

        if (otherMemberIds.length > 0) {
          const { data: profiles } = await supabase
            .from("profiles")
            .select("*")
            .in("id", otherMemberIds);

          if (profiles && profiles.length > 0) {
            setOtherUser(profiles[0]);
            const name = profiles.map((p) => p.username).join(", ");
            setChatName(name);
          }
        }
      }
    } catch (error) {
      console.error("Error fetching chat info:", error);
    }
  };

  // Проверка блокировки между пользователями
  const checkBlockStatus = async () => {
    if (!user || !id || isGroup) return;

    try {
      // Получаем участников чата
      const { data: members } = await supabase
        .from("chat_members")
        .select("user_id")
        .eq("chat_id", id);

      const otherMemberIds =
        members?.filter((m) => m.user_id !== user.id).map((m) => m.user_id) ||
        [];
      if (otherMemberIds.length === 0) return;

      const otherUserId = otherMemberIds[0];

      // Проверяем заблокировал ли я его
      const { data: blockedByMe } = await supabase
        .from("blocked_users")
        .select("id")
        .eq("blocker_id", user.id)
        .eq("blocked_id", otherUserId)
        .maybeSingle();

      setIsBlocked(!!blockedByMe);

      // Проверяем заблокировал ли он меня
      const { data: blockedByOther } = await supabase
        .from("blocked_users")
        .select("id")
        .eq("blocker_id", otherUserId)
        .eq("blocked_id", user.id)
        .maybeSingle();

      setIsBlockedByOther(!!blockedByOther);
    } catch (error) {
      console.error("Error checking block status:", error);
    }
  };

  // Realtime подписка на изменения блокировки
  const subscribeToBlockStatus = () => {
    if (!user || !id || isGroup) return;

    // Подписываемся на изменения в таблице blocked_users
    blockChannelRef.current = supabase
      .channel(`block-status:${id}:${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*", // INSERT, UPDATE, DELETE
          schema: "public",
          table: "blocked_users",
        },
        async (payload) => {
          // Получаем другого участника чата
          const { data: members } = await supabase
            .from("chat_members")
            .select("user_id")
            .eq("chat_id", id);

          const otherMemberIds =
            members
              ?.filter((m) => m.user_id !== user.id)
              .map((m) => m.user_id) || [];
          if (otherMemberIds.length === 0) return;

          const otherUserId = otherMemberIds[0];

          if (payload.eventType === "INSERT") {
            const newBlock = payload.new as {
              blocker_id: string;
              blocked_id: string;
            };

            // Проверяем касается ли это нас
            if (
              newBlock.blocker_id === user.id &&
              newBlock.blocked_id === otherUserId
            ) {
              // Я заблокировал собеседника
              setIsBlocked(true);
              safeNotificationHaptic(Haptics.NotificationFeedbackType.Warning);
            } else if (
              newBlock.blocker_id === otherUserId &&
              newBlock.blocked_id === user.id
            ) {
              // Собеседник заблокировал меня
              setIsBlockedByOther(true);
              safeNotificationHaptic(Haptics.NotificationFeedbackType.Warning);
            }
          } else if (payload.eventType === "DELETE") {
            const oldBlock = payload.old as {
              blocker_id?: string;
              blocked_id?: string;
            };

            // Если старые данные пришли (REPLICA IDENTITY FULL включен)
            if (oldBlock.blocker_id && oldBlock.blocked_id) {
              // Проверяем касается ли это нас
              if (
                oldBlock.blocker_id === user.id &&
                oldBlock.blocked_id === otherUserId
              ) {
                // Я разблокировал собеседника
                setIsBlocked(false);
                safeNotificationHaptic(
                  Haptics.NotificationFeedbackType.Success,
                );
              } else if (
                oldBlock.blocker_id === otherUserId &&
                oldBlock.blocked_id === user.id
              ) {
                // Собеседник разблокировал меня
                setIsBlockedByOther(false);
                safeNotificationHaptic(
                  Haptics.NotificationFeedbackType.Success,
                );
              }
            } else {
              // Fallback: если старые данные не пришли, перепроверяем статус
              // Проверяем заблокировал ли я его
              const { data: blockedByMe } = await supabase
                .from("blocked_users")
                .select("id")
                .eq("blocker_id", user.id)
                .eq("blocked_id", otherUserId)
                .maybeSingle();

              const wasBlocked = isBlocked;
              setIsBlocked(!!blockedByMe);

              // Проверяем заблокировал ли он меня
              const { data: blockedByOther } = await supabase
                .from("blocked_users")
                .select("id")
                .eq("blocker_id", otherUserId)
                .eq("blocked_id", user.id)
                .maybeSingle();

              const wasBlockedByOther = isBlockedByOther;
              setIsBlockedByOther(!!blockedByOther);

              // Haptic если статус изменился на разблокированный
              if (
                (wasBlocked && !blockedByMe) ||
                (wasBlockedByOther && !blockedByOther)
              ) {
                safeNotificationHaptic(
                  Haptics.NotificationFeedbackType.Success,
                );
              }
            }
          }
        },
      )
      .subscribe();
  };

  const fetchMessages = async () => {
    if (!id) return;

    try {
      const { data, error } = await supabase
        .from("messages")
        .select("*")
        .eq("chat_id", id)
        .order("created_at", { ascending: true });

      if (error) throw error;

      const senderIds = [...new Set(data?.map((m) => m.sender_id) || [])];

      const { data: profiles } = await supabase
        .from("profiles")
        .select("*")
        .in("id", senderIds);

      const profileMap = new Map(profiles?.map((p) => [p.id, p]));

      // Собираем ID сообщений на которые отвечают
      const replyToIds = (
        data?.filter((m) => m.reply_to_id).map((m) => m.reply_to_id) || []
      ).filter((id): id is string => id !== null);

      // Получаем replied messages
      let repliedMessagesMap = new Map<
        string,
        {
          id: string;
          content: string | null;
          sender_id: string;
          media_type: "image" | "video" | "audio" | "location" | "file" | null;
        }
      >();
      if (replyToIds.length > 0) {
        const { data: repliedMessages } = await supabase
          .from("messages")
          .select("id, content, sender_id, media_type")
          .in("id", replyToIds);

        repliedMessagesMap = new Map(
          repliedMessages?.map((m) => [m.id, m]) || [],
        );
      }

      const messagesWithSenders: MessageWithSender[] = (data || []).map((m) => {
        const repliedMsg = m.reply_to_id
          ? repliedMessagesMap.get(m.reply_to_id)
          : null;
        return {
          ...m,
          sender: profileMap.get(m.sender_id) || null,
          replied_message: repliedMsg
            ? {
                id: repliedMsg.id,
                content: repliedMsg.content,
                sender: profileMap.get(repliedMsg.sender_id) || null,
                media_type: repliedMsg.media_type,
              }
            : null,
          reactions: [],
        };
      });

      setMessages(messagesWithSenders);

      // Загружаем реакции отдельно
      await fetchReactions(data?.map((m) => m.id) || []);
    } catch (error) {
      console.error("Error fetching messages:", error);
    } finally {
      setLoading(false);
    }
  };

  // Загрузка реакций для сообщений
  const fetchReactions = async (messageIds: string[]) => {
    if (messageIds.length === 0 || !user) return;

    try {
      const { data: reactions, error } = await (supabase as any)
        .from("message_reactions")
        .select("*")
        .in("message_id", messageIds);

      if (error) throw error;

      // Получаем профили всех пользователей, которые поставили реакции
      const userIds = [
        ...new Set((reactions as any[])?.map((r: any) => r.user_id) || []),
      ];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, username, avatar_url")
        .in("id", userIds);

      const profileMap = new Map(profiles?.map((p) => [p.id, p]) || []);

      // Группируем реакции по сообщениям
      const reactionsByMessage = new Map<string, GroupedReaction[]>();

      (reactions as any[])?.forEach((r: any) => {
        if (!reactionsByMessage.has(r.message_id)) {
          reactionsByMessage.set(r.message_id, []);
        }

        const messageReactions = reactionsByMessage.get(r.message_id)!;
        const existingReaction = messageReactions.find(
          (gr) => gr.emoji === r.emoji,
        );

        const userProfile = profileMap.get(r.user_id);
        const userInfo = {
          id: r.user_id,
          username: userProfile?.username || "Пользователь",
          avatar_url: userProfile?.avatar_url || null,
        };

        if (existingReaction) {
          existingReaction.count++;
          existingReaction.users.push(userInfo);
          if (r.user_id === user.id) {
            existingReaction.hasReacted = true;
          }
        } else {
          messageReactions.push({
            emoji: r.emoji,
            count: 1,
            users: [userInfo],
            hasReacted: r.user_id === user.id,
          });
        }
      });

      // Обновляем сообщения с реакциями
      setMessages((prev) =>
        prev.map((msg) => ({
          ...msg,
          reactions: reactionsByMessage.get(msg.id) || msg.reactions || [],
        })),
      );
    } catch (error) {
      console.error("Error fetching reactions:", error);
    }
  };

  // Добавить/изменить/удалить реакцию (только ОДНА реакция на сообщение от пользователя)
  const toggleReaction = async (messageId: string, emoji: string) => {
    if (!user) return;

    // Предотвращаем автоскролл при изменении реакций
    skipAutoScrollRef.current = true;

    try {
      const message = messages.find((m) => m.id === messageId);

      // Находим текущую реакцию пользователя (если есть)
      const myCurrentReaction = message?.reactions?.find((r) => r.hasReacted);

      // Получаем профиль текущего пользователя для локального обновления
      const { data: myProfile } = await supabase
        .from("profiles")
        .select("id, username, avatar_url")
        .eq("id", user.id)
        .single();

      const myUserInfo = {
        id: user.id,
        username: myProfile?.username || "Я",
        avatar_url: myProfile?.avatar_url || null,
      };

      if (myCurrentReaction?.emoji === emoji) {
        // Та же реакция - удаляем её
        await (supabase as any)
          .from("message_reactions")
          .delete()
          .eq("message_id", messageId)
          .eq("user_id", user.id);

        // Обновляем локально - удаляем свою реакцию
        setMessages((prev) =>
          prev.map((msg) => {
            if (msg.id !== messageId) return msg;
            const updatedReactions = (msg.reactions || [])
              .map((r) => {
                if (r.emoji !== emoji) return r;
                return {
                  ...r,
                  count: r.count - 1,
                  users: r.users.filter((u) => u.id !== user.id),
                  hasReacted: false,
                };
              })
              .filter((r) => r.count > 0);
            return { ...msg, reactions: updatedReactions };
          }),
        );
      } else {
        // Новая или другая реакция - используем upsert
        // Сначала удаляем старую реакцию (если была)
        if (myCurrentReaction) {
          await (supabase as any)
            .from("message_reactions")
            .delete()
            .eq("message_id", messageId)
            .eq("user_id", user.id);
        }

        // Добавляем новую
        await (supabase as any).from("message_reactions").insert({
          message_id: messageId,
          user_id: user.id,
          emoji,
        });

        // Обновляем локально
        setMessages((prev) =>
          prev.map((msg) => {
            if (msg.id !== messageId) return msg;

            let updatedReactions = [...(msg.reactions || [])];

            // Удаляем старую реакцию пользователя (если была)
            if (myCurrentReaction) {
              updatedReactions = updatedReactions
                .map((r) => {
                  if (r.emoji !== myCurrentReaction.emoji) return r;
                  return {
                    ...r,
                    count: r.count - 1,
                    users: r.users.filter((u) => u.id !== user.id),
                    hasReacted: false,
                  };
                })
                .filter((r) => r.count > 0);
            }

            // Добавляем новую реакцию
            const existingEmoji = updatedReactions.find(
              (r) => r.emoji === emoji,
            );
            if (existingEmoji) {
              updatedReactions = updatedReactions.map((r) =>
                r.emoji === emoji
                  ? {
                      ...r,
                      count: r.count + 1,
                      users: [...r.users, myUserInfo],
                      hasReacted: true,
                    }
                  : r,
              );
            } else {
              updatedReactions.push({
                emoji,
                count: 1,
                users: [myUserInfo],
                hasReacted: true,
              });
            }

            return { ...msg, reactions: updatedReactions };
          }),
        );
      }

      safeHaptic(Haptics.ImpactFeedbackStyle.Light);
    } catch (error) {
      console.error("Error toggling reaction:", error);
    } finally {
      // Сбрасываем флаг через небольшую задержку
      setTimeout(() => {
        skipAutoScrollRef.current = false;
      }, 300);
    }
  };

  // Показать быстрые реакции для сообщения
  const showQuickReactionPicker = (messageId: string) => {
    setQuickReactionMessageId(messageId);
    setShowQuickReactions(true);
    Animated.spring(quickReactionAnimation, {
      toValue: 1,
      tension: 100,
      friction: 8,
      useNativeDriver: true,
    }).start();
    safeHaptic(Haptics.ImpactFeedbackStyle.Medium);
  };

  // Скрыть быстрые реакции
  const hideQuickReactionPicker = () => {
    Animated.timing(quickReactionAnimation, {
      toValue: 0,
      duration: 150,
      useNativeDriver: true,
    }).start(() => {
      setShowQuickReactions(false);
      setQuickReactionMessageId(null);
    });
  };

  // Обработчик выбора реакции
  const handleQuickReactionSelect = (emoji: string) => {
    if (quickReactionMessageId) {
      toggleReaction(quickReactionMessageId, emoji);
    }
    hideQuickReactionPicker();
    closeMessageMenu(); // Закрываем меню после выбора реакции
  };

  // Показать модальное окно с пользователями, поставившими реакции
  const showReactionUsersModal = (
    reaction: GroupedReaction,
    allReactions: GroupedReaction[],
  ) => {
    setSelectedReactionForUsers(reaction);
    setAllReactionsForModal(allReactions);
    setShowReactionUsers(true);
  };

  const fetchPinnedMessages = async () => {
    if (!id || !user) return;

    try {
      const allPinned: { message: MessageWithSender; isPersonal: boolean }[] =
        [];

      // Получаем общие закреплённые сообщения чата
      const { data: chatPins } = await (supabase as any)
        .from("pinned_messages")
        .select("message_id")
        .eq("chat_id", id)
        .is("user_id", null)
        .order("created_at", { ascending: true });

      // Получаем личные закреплённые сообщения
      const { data: personalPins } = await (supabase as any)
        .from("pinned_messages")
        .select("message_id")
        .eq("chat_id", id)
        .eq("user_id", user.id)
        .order("created_at", { ascending: true });

      const allMessageIds = [
        ...((chatPins as any[])?.map((p: any) => ({
          id: p.message_id,
          isPersonal: false,
        })) || []),
        ...((personalPins as any[])?.map((p: any) => ({
          id: p.message_id,
          isPersonal: true,
        })) || []),
      ];

      if (allMessageIds.length === 0) {
        setPinnedMessages([]);
        return;
      }

      // Получаем сообщения
      const { data: messages } = await supabase
        .from("messages")
        .select("*")
        .in(
          "id",
          allMessageIds.map((m) => m.id),
        );

      if (!messages) return;

      // Получаем профили отправителей
      const senderIds = [...new Set(messages.map((m) => m.sender_id))];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("*")
        .in("id", senderIds);

      const profileMap = new Map(profiles?.map((p) => [p.id, p]));

      // Формируем массив закреплённых
      for (const pin of allMessageIds) {
        const msg = messages.find((m) => m.id === pin.id);
        if (msg) {
          allPinned.push({
            message: { ...msg, sender: profileMap.get(msg.sender_id) || null },
            isPersonal: pin.isPersonal,
          });
        }
      }

      setPinnedMessages(allPinned);
      setCurrentPinnedIndex(0);

      if (allPinned.length > 0) {
        Animated.timing(pinnedAnimation, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }).start();
      }
    } catch (error) {
      console.error("Error fetching pinned messages:", error);
    }
  };

  const showPinOptionsMenu = () => {
    setShowPinOptions(true);
    Animated.spring(pinOptionsAnimation, {
      toValue: 1,
      useNativeDriver: true,
      tension: 100,
      friction: 8,
    }).start();
  };

  const hidePinOptionsMenu = () => {
    Animated.timing(pinOptionsAnimation, {
      toValue: 0,
      duration: 150,
      useNativeDriver: true,
    }).start(() => {
      setShowPinOptions(false);
    });
  };

  const pinMessage = async (
    message: MessageWithSender,
    isPersonal: boolean,
  ) => {
    if (!id || !user) return;

    try {
      const pinData = {
        chat_id: id,
        message_id: message.id,
        user_id: isPersonal ? user.id : null,
      };

      console.log("Pinning message:", pinData);

      const { error } = await (supabase as any)
        .from("pinned_messages")
        .insert(pinData);

      if (error) {
        console.error("Pin error:", error);
        throw error;
      }

      console.log("Message pinned successfully");

      // Добавляем в локальный state
      setPinnedMessages((prev) => [...prev, { message, isPersonal }]);
      setCurrentPinnedIndex((prev) => prev);

      if (pinnedMessages.length === 0) {
        Animated.timing(pinnedAnimation, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }).start();
      }

      safeNotificationHaptic(Haptics.NotificationFeedbackType.Success);
    } catch (error) {
      console.error("Error pinning message:", error);
      Alert.alert("Ошибка", "Не удалось закрепить сообщение");
    }
  };

  const unpinMessage = async (messageId: string, isPersonal: boolean) => {
    if (!id || !user) return;

    try {
      let query = (supabase as any)
        .from("pinned_messages")
        .delete()
        .eq("chat_id", id)
        .eq("message_id", messageId);

      if (isPersonal) {
        query = query.eq("user_id", user.id);
      } else {
        query = query.is("user_id", null);
      }

      const { error } = await query;
      if (error) throw error;

      // Убираем из локального state
      setPinnedMessages((prev) => {
        const newPinned = prev.filter(
          (p) => !(p.message.id === messageId && p.isPersonal === isPersonal),
        );
        if (newPinned.length === 0) {
          Animated.timing(pinnedAnimation, {
            toValue: 0,
            duration: 200,
            useNativeDriver: true,
          }).start();
        }
        return newPinned;
      });

      // Корректируем индекс
      setCurrentPinnedIndex((prev) =>
        Math.max(0, Math.min(prev, pinnedMessages.length - 2)),
      );

      safeHaptic(Haptics.ImpactFeedbackStyle.Light);
    } catch (error) {
      console.error("Error unpinning message:", error);
      Alert.alert("Ошибка", "Не удалось открепить сообщение");
    }
  };

  const scrollToPinnedMessage = (index?: number) => {
    const pinIndex = index !== undefined ? index : currentPinnedIndex;
    const pinned = pinnedMessages[pinIndex];
    if (!pinned) return;

    const msgIndex = messages.findIndex((m) => m.id === pinned.message.id);
    if (msgIndex !== -1) {
      // Установить highlighted сообщение
      setHighlightedMessageId(pinned.message.id);

      flatListRef.current?.scrollToIndex({
        index: msgIndex,
        animated: true,
        viewPosition: 0.5,
      });

      // Анимация подсветки
      highlightAnimation.setValue(0);
      Animated.sequence([
        Animated.timing(highlightAnimation, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(highlightAnimation, {
          toValue: 0.3,
          duration: 150,
          useNativeDriver: true,
        }),
        Animated.timing(highlightAnimation, {
          toValue: 1,
          duration: 150,
          useNativeDriver: true,
        }),
        Animated.timing(highlightAnimation, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start(() => {
        setHighlightedMessageId(null);
      });

      safeHaptic(Haptics.ImpactFeedbackStyle.Light);
    }
  };

  const navigatePinnedMessage = (direction: "next" | "prev") => {
    if (pinnedMessages.length <= 1) return;

    let newIndex: number;
    if (direction === "next") {
      newIndex = (currentPinnedIndex + 1) % pinnedMessages.length;
    } else {
      newIndex =
        (currentPinnedIndex - 1 + pinnedMessages.length) %
        pinnedMessages.length;
    }

    setCurrentPinnedIndex(newIndex);
    scrollToPinnedMessage(newIndex);
  };

  const subscribeToMessages = () => {
    if (!id) return;

    channelRef.current = supabase
      .channel(`chat:${id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `chat_id=eq.${id}`,
        },
        async (payload) => {
          const newMsg = payload.new as Message;

          const { data: senderProfile } = await supabase
            .from("profiles")
            .select("*")
            .eq("id", newMsg.sender_id)
            .single();

          // Получаем replied message если есть
          let repliedMessage = null;
          if (newMsg.reply_to_id) {
            const { data: repliedData } = await supabase
              .from("messages")
              .select("id, content, sender_id, media_type")
              .eq("id", newMsg.reply_to_id)
              .single();

            if (repliedData) {
              const { data: repliedSender } = await supabase
                .from("profiles")
                .select("*")
                .eq("id", repliedData.sender_id)
                .single();

              repliedMessage = {
                id: repliedData.id,
                content: repliedData.content,
                sender: repliedSender || null,
                media_type: repliedData.media_type,
              };
            }
          }

          const messageWithSender: MessageWithSender = {
            ...newMsg,
            sender: senderProfile,
            replied_message: repliedMessage,
            reactions: [],
          };

          setMessages((prev) => [...prev, messageWithSender]);

          // Если сообщение от другого — помечаем как прочитанное
          if (newMsg.sender_id !== user?.id) {
            markMessagesAsRead();
          }

          setTimeout(() => {
            flatListRef.current?.scrollToEnd({ animated: true });
          }, 100);
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "messages",
          filter: `chat_id=eq.${id}`,
        },
        (payload) => {
          const updatedMsg = payload.new as Message;
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === updatedMsg.id ? { ...msg, ...updatedMsg } : msg,
            ),
          );
        },
      )
      .on("broadcast", { event: "typing" }, (payload) => {
        const { userId, username, avatarUrl, isTyping } = payload.payload;
        if (userId === user?.id) return;

        setTypingUsers((prev) => {
          if (isTyping) {
            // Добавляем или обновляем
            const exists = prev.find((u) => u.id === userId);
            if (exists) return prev;
            return [...prev, { id: userId, username, avatar_url: avatarUrl }];
          } else {
            // Удаляем
            return prev.filter((u) => u.id !== userId);
          }
        });

        // Автоматически убираем через 3 секунды
        setTimeout(() => {
          setTypingUsers((prev) => prev.filter((u) => u.id !== userId));
        }, 3000);
      })
      .subscribe();

    // Подписка на изменения реакций
    const reactionsChannel = supabase
      .channel(`reactions:${id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "message_reactions",
        },
        async (payload) => {
          // При любом изменении реакций перезагружаем их для затронутого сообщения
          const messageId =
            (payload.new as any)?.message_id ||
            (payload.old as any)?.message_id;
          if (messageId) {
            await fetchReactions([messageId]);
          }
        },
      )
      .subscribe();

    // Сохраняем для отписки
    return () => {
      reactionsChannel.unsubscribe();
    };
  };

  // Отправить индикатор печати
  const sendTypingIndicator = (isTyping: boolean) => {
    if (!channelRef.current || !user) return;

    // Throttle - не чаще раз в 2 секунды
    const now = Date.now();
    if (isTyping && now - lastTypingSentRef.current < 2000) return;
    lastTypingSentRef.current = now;

    channelRef.current.send({
      type: "broadcast",
      event: "typing",
      payload: {
        userId: user.id,
        username: user.user_metadata?.username || "User",
        avatarUrl: user.user_metadata?.avatar_url || null,
        isTyping,
      },
    });
  };

  // Пометить сообщения как прочитанные
  const markMessagesAsRead = async () => {
    if (!id || !user) return;

    try {
      // Помечаем все непрочитанные сообщения от других пользователей
      const { error } = await supabase
        .from("messages")
        .update({ is_read: true })
        .eq("chat_id", id)
        .neq("sender_id", user.id)
        .eq("is_read", false);

      if (error) {
        console.error("Error marking messages as read:", error);
      }
    } catch (error) {
      console.error("Error marking messages as read:", error);
    }
  };

  // Вызываем при загрузке чата и при получении новых сообщений
  useEffect(() => {
    if (id && user && !loading) {
      // Небольшая задержка чтобы сообщения успели загрузиться
      const timer = setTimeout(() => {
        markMessagesAsRead();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [id, user, loading]);

  const sendMessage = async () => {
    if (!newMessage.trim() || !user || !id || sending) return;

    // Проверка блокировки
    if (isBlocked || isBlockedByOther) {
      Alert.alert(
        "Блокировка",
        isBlocked
          ? "Вы заблокировали этого пользователя. Разблокируйте, чтобы отправить сообщение."
          : "Этот пользователь вас заблокировал.",
      );
      return;
    }

    safeHaptic(Haptics.ImpactFeedbackStyle.Light);
    setSending(true);
    const messageText = newMessage.trim();
    setNewMessage("");

    try {
      if (editingMessage) {
        // Редактирование существующего сообщения
        const { error } = await supabase
          .from("messages")
          .update({ content: messageText })
          .eq("id", editingMessage.id);

        if (error) throw error;

        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === editingMessage.id
              ? { ...msg, content: messageText }
              : msg,
          ),
        );
        setEditingMessage(null);
      } else {
        // Отправка нового сообщения
        const messageData: {
          chat_id: string;
          sender_id: string;
          content: string;
          reply_to_id?: string;
        } = {
          chat_id: id,
          sender_id: user.id,
          content: messageText,
        };

        // Добавляем reply_to_id если отвечаем на сообщение
        if (replyingTo) {
          messageData.reply_to_id = replyingTo.id;
        }

        const { error } = await supabase.from("messages").insert(messageData);

        if (error) throw error;

        setReplyingTo(null);
      }
    } catch (error) {
      console.error("Error sending message:", error);
      setNewMessage(messageText);
    } finally {
      setSending(false);
    }
  };

  const handleMessageLongPress = (message: MessageWithSender) => {
    // Показываем панель быстрых реакций и меню
    safeHaptic(Haptics.ImpactFeedbackStyle.Medium);
    setSelectedMessage(message);
    showQuickReactionPicker(message.id);
    setShowMessageMenu(true);

    Animated.spring(menuAnimation, {
      toValue: 1,
      useNativeDriver: true,
      tension: 100,
      friction: 8,
    }).start();
  };

  const closeMessageMenu = () => {
    hideQuickReactionPicker();
    Animated.timing(menuAnimation, {
      toValue: 0,
      duration: 150,
      useNativeDriver: true,
    }).start(() => {
      setShowMessageMenu(false);
      setSelectedMessage(null);
    });
  };

  const handleMenuAction = (
    action: "copy" | "edit" | "delete" | "reply" | "pin",
  ) => {
    const messageToProcess = selectedMessage;
    closeMessageMenu();

    setTimeout(() => {
      if (!messageToProcess) return;

      switch (action) {
        case "reply":
          setReplyingTo(messageToProcess);
          safeHaptic(Haptics.ImpactFeedbackStyle.Light);
          break;
        case "edit":
          if (
            messageToProcess.content &&
            messageToProcess.sender_id === user?.id
          ) {
            startEditingMessage(messageToProcess);
          }
          break;
        case "delete":
          if (messageToProcess.sender_id === user?.id) {
            confirmDeleteMessage(messageToProcess);
          }
          break;
        case "copy":
          // Копирование текста в буфер обмена
          if (messageToProcess.content) {
            Clipboard.setStringAsync(messageToProcess.content);
            safeNotificationHaptic(Haptics.NotificationFeedbackType.Success);
          }
          break;
        case "pin":
          // Проверяем, уже закреплено ли это сообщение
          const existingPin = pinnedMessages.find(
            (p) => p.message.id === messageToProcess.id,
          );
          if (existingPin) {
            // Открепить
            unpinMessage(messageToProcess.id, existingPin.isPersonal);
          } else {
            // Сохраняем сообщение для закрепления и показываем диалог
            setMessageToPin(messageToProcess);
            showPinOptionsMenu();
          }
          break;
      }
    }, 200);
  };

  const handlePinOption = (isPersonal: boolean) => {
    hidePinOptionsMenu();
    if (messageToPin) {
      setTimeout(() => {
        pinMessage(messageToPin, isPersonal);
        setMessageToPin(null);
      }, 200);
    }
  };

  // Функции поиска по сообщениям
  const openSearch = () => {
    setShowSearch(true);
    Animated.timing(searchAnimation, {
      toValue: 1,
      duration: 250,
      useNativeDriver: true,
    }).start(() => {
      searchInputRef.current?.focus();
    });
  };

  const closeSearch = () => {
    Animated.timing(searchAnimation, {
      toValue: 0,
      duration: 200,
      useNativeDriver: true,
    }).start(() => {
      setShowSearch(false);
      setSearchQuery("");
      setSearchResults([]);
      setCurrentSearchIndex(0);
      setHighlightedMessageId(null);
    });
  };

  const handleSearch = (query: string) => {
    setSearchQuery(query);

    if (query.trim().length < 2) {
      setSearchResults([]);
      setCurrentSearchIndex(0);
      return;
    }

    const lowerQuery = query.toLowerCase();
    const results = messages.filter(
      (m) => m.content && m.content.toLowerCase().includes(lowerQuery),
    );

    setSearchResults(results);
    setCurrentSearchIndex(results.length > 0 ? 0 : -1);

    // Перейти к первому результату
    if (results.length > 0) {
      scrollToSearchResult(0, results);
    }
  };

  const scrollToSearchResult = (
    index: number,
    results?: MessageWithSender[],
  ) => {
    const searchList = results || searchResults;
    if (searchList.length === 0 || index < 0 || index >= searchList.length)
      return;

    const targetMessage = searchList[index];
    const msgIndex = messages.findIndex((m) => m.id === targetMessage.id);

    if (msgIndex !== -1) {
      setHighlightedMessageId(targetMessage.id);

      flatListRef.current?.scrollToIndex({
        index: msgIndex,
        animated: true,
        viewPosition: 0.5,
      });

      // Анимация подсветки
      highlightAnimation.setValue(0);
      Animated.sequence([
        Animated.timing(highlightAnimation, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(highlightAnimation, {
          toValue: 0.3,
          duration: 150,
          useNativeDriver: true,
        }),
        Animated.timing(highlightAnimation, {
          toValue: 1,
          duration: 150,
          useNativeDriver: true,
        }),
        Animated.delay(500),
        Animated.timing(highlightAnimation, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start(() => {
        setHighlightedMessageId(null);
      });

      safeHaptic(Haptics.ImpactFeedbackStyle.Light);
    }
  };

  const navigateSearchResult = (direction: "next" | "prev") => {
    if (searchResults.length === 0) return;

    let newIndex: number;
    if (direction === "next") {
      newIndex = (currentSearchIndex + 1) % searchResults.length;
    } else {
      newIndex =
        (currentSearchIndex - 1 + searchResults.length) % searchResults.length;
    }

    setCurrentSearchIndex(newIndex);
    scrollToSearchResult(newIndex);
  };

  const startEditingMessage = (message: MessageWithSender) => {
    setEditingMessage(message);
    setNewMessage(message.content);
  };

  const cancelEditing = () => {
    setEditingMessage(null);
    setNewMessage("");
  };

  const cancelReply = () => {
    setReplyingTo(null);
  };

  const confirmDeleteMessage = (message: MessageWithSender) => {
    Alert.alert("Удалить сообщение?", "Это действие нельзя отменить", [
      { text: "Отмена", style: "cancel" },
      {
        text: "Удалить",
        style: "destructive",
        onPress: () => deleteMessage(message.id),
      },
    ]);
  };

  const deleteMessage = async (messageId: string) => {
    try {
      const { error } = await supabase
        .from("messages")
        .delete()
        .eq("id", messageId);

      if (error) throw error;

      setMessages((prev) => prev.filter((msg) => msg.id !== messageId));
      safeNotificationHaptic(Haptics.NotificationFeedbackType.Success);
    } catch (error) {
      console.error("Error deleting message:", error);
      Alert.alert("Ошибка", "Не удалось удалить сообщение");
    }
  };

  const handleAttachPress = () => {
    safeHaptic(Haptics.ImpactFeedbackStyle.Light);
    if (Platform.OS === "ios") {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: [
            "Отмена",
            "Фото из галереи",
            "Сделать фото",
            "Записать аудио",
            "Геолокация",
            "Документ",
          ],
          cancelButtonIndex: 0,
        },
        (buttonIndex) => {
          if (buttonIndex === 1) handlePickMedia();
          if (buttonIndex === 2) handleTakePhoto();
          if (buttonIndex === 3) handleRecordAudio();
          if (buttonIndex === 4) handleSendLocation();
          if (buttonIndex === 5) handlePickDocument();
        },
      );
    } else {
      setShowAttachMenu(!showAttachMenu);
    }
  };

  const handlePickMedia = async () => {
    setShowAttachMenu(false);
    if (Platform.OS === "web") {
      Alert.alert("Недоступно", "Выбор медиа недоступен в веб-версии");
      return;
    }
    const result = await pickImageOrVideo();
    if (result && !result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      await sendMediaMessage(asset.uri, asset.mimeType || "image/jpeg");
    }
  };

  const handleTakePhoto = async () => {
    setShowAttachMenu(false);
    if (Platform.OS === "web") {
      Alert.alert("Недоступно", "Камера недоступна в веб-версии");
      return;
    }
    const result = await takePhoto();
    if (result && !result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      await sendMediaMessage(asset.uri, asset.mimeType || "image/jpeg");
    }
  };

  const handleRecordAudio = async () => {
    setShowAttachMenu(false);

    if (isRecording) {
      // Остановить запись
      await stopRecording();
    } else {
      // Начать запись
      await startRecording();
    }
  };

  const startRecording = async () => {
    // Проверка блокировки
    if (isBlocked || isBlockedByOther) {
      Alert.alert(
        "Блокировка",
        isBlocked
          ? "Вы заблокировали этого пользователя. Разблокируйте, чтобы отправить сообщение."
          : "Этот пользователь вас заблокировал.",
      );
      return;
    }

    if (Platform.OS === "web") {
      Alert.alert("Недоступно", "Запись аудио недоступна в веб-версии");
      return;
    }

    try {
      const permission = await Audio.requestPermissionsAsync();
      if (!permission.granted) {
        Alert.alert("Нет доступа", "Разрешите доступ к микрофону");
        return;
      }

      // Сбрасываем кэш аудио-режима (после записи потребуется перенастройка для воспроизведения)
      resetAudioMode();

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const { recording } = await Audio.Recording.createAsync({
        ...Audio.RecordingOptionsPresets.HIGH_QUALITY,
        isMeteringEnabled: true,
      });

      // Сбрасываем waveform данные
      waveformDataRef.current = [];

      // Подписка на metering для сбора waveform
      recording.setOnRecordingStatusUpdate((status) => {
        if (status.isRecording && status.metering !== undefined) {
          // Нормализуем dB (-160...0) к 0...1
          const db = status.metering;
          const normalized = Math.max(0, Math.min(1, (db + 60) / 60));
          waveformDataRef.current.push(normalized);
          setLiveMetering(normalized);
        }
      });
      // Обновляем каждые 100мс
      recording.setProgressUpdateInterval(100);

      recordingRef.current = recording;
      setIsRecording(true);
      setRecordingDuration(0);

      // Таймер для отображения длительности
      recordingTimerRef.current = setInterval(() => {
        setRecordingDuration((prev) => prev + 1);
      }, 1000);

      safeHaptic(Haptics.ImpactFeedbackStyle.Medium);
    } catch (error) {
      console.error("Start recording error:", error);
      Alert.alert("Ошибка", "Не удалось начать запись");
    }
  };

  const stopRecording = async () => {
    try {
      if (!recordingRef.current) return;

      // Остановить таймер
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
        recordingTimerRef.current = null;
      }

      const finalDuration = recordingDuration;
      setIsRecording(false);
      setRecordingDuration(0);
      setLiveMetering(0);

      await recordingRef.current.stopAndUnloadAsync();
      const uri = recordingRef.current.getURI();
      recordingRef.current = null;

      // Сохраняем waveform данные
      const capturedWaveform = [...waveformDataRef.current];
      waveformDataRef.current = [];

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
      });

      if (uri) {
        safeHaptic(Haptics.ImpactFeedbackStyle.Light);
        await sendVoiceMessage(uri, capturedWaveform, finalDuration);
      }
    } catch (error) {
      console.error("Stop recording error:", error);
      Alert.alert("Ошибка", "Не удалось сохранить запись");
    }
  };

  // Hold-to-record handlers
  const onMicPressIn = async () => {
    if (Platform.OS === "web") return;

    Animated.spring(recordButtonScale, {
      toValue: 1.5,
      useNativeDriver: true,
    }).start();

    await startRecording();
  };

  const onMicPressOut = async () => {
    Animated.spring(recordButtonScale, {
      toValue: 1,
      useNativeDriver: true,
    }).start();

    if (isRecording && recordingDuration >= 1) {
      await stopRecording();
    } else if (isRecording) {
      await cancelRecording();
      safeHaptic(Haptics.ImpactFeedbackStyle.Light);
    }
  };

  // Media picker modal
  const openMediaPicker = () => {
    setShowMediaPicker(true);
    Animated.spring(mediaPickerAnimation, {
      toValue: 1,
      useNativeDriver: true,
      tension: 100,
      friction: 8,
    }).start();
  };

  const closeMediaPicker = () => {
    Animated.timing(mediaPickerAnimation, {
      toValue: 0,
      duration: 150,
      useNativeDriver: true,
    }).start(() => {
      setShowMediaPicker(false);
    });
  };

  const cancelRecording = async () => {
    try {
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
        recordingTimerRef.current = null;
      }

      if (recordingRef.current) {
        await recordingRef.current.stopAndUnloadAsync();
        recordingRef.current = null;
      }

      waveformDataRef.current = [];
      setIsRecording(false);
      setRecordingDuration(0);
      setLiveMetering(0);

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
      });
    } catch (error) {
      console.error("Cancel recording error:", error);
    }
  };

  // Отправка геолокации
  const handleSendLocation = async () => {
    setShowAttachMenu(false);

    // Проверка блокировки
    if (isBlocked || isBlockedByOther) {
      Alert.alert(
        "Блокировка",
        isBlocked
          ? "Вы заблокировали этого пользователя. Разблокируйте, чтобы отправить сообщение."
          : "Этот пользователь вас заблокировал.",
      );
      return;
    }

    if (Platform.OS === "web") {
      Alert.alert("Недоступно", "Геолокация недоступна в веб-версии");
      return;
    }

    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        Alert.alert(
          "Нет доступа",
          "Для отправки местоположения необходимо разрешить доступ к геолокации",
        );
        return;
      }

      setSending(true);

      // Получаем текущую позицию
      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });

      const { latitude, longitude } = location.coords;

      // Пытаемся получить адрес
      let locationName = "Местоположение";
      try {
        const [address] = await Location.reverseGeocodeAsync({
          latitude,
          longitude,
        });
        if (address) {
          const parts = [];
          if (address.street) parts.push(address.street);
          if (address.name && address.name !== address.street)
            parts.push(address.name);
          if (address.city) parts.push(address.city);
          locationName = parts.join(", ") || "Местоположение";
        }
      } catch {
        // Если не удалось получить адрес, используем дефолтное название
      }

      // Отправляем сообщение с геолокацией
      const { error } = await supabase.from("messages").insert({
        chat_id: id as string,
        sender_id: user!.id,
        content: locationName,
        media_type: "location",
        latitude,
        longitude,
        location_name: locationName,
        reply_to_id: replyingTo?.id || null,
      });

      if (error) throw error;

      setReplyingTo(null);
      safeHaptic(Haptics.ImpactFeedbackStyle.Light);
    } catch (error: any) {
      console.error("Location error:", error);
      const errorMsg = error?.message?.includes("column")
        ? "Выполните SQL миграцию в Supabase"
        : "Не удалось отправить местоположение";
      Alert.alert("Ошибка", errorMsg);
    } finally {
      setSending(false);
    }
  };

  // Выбор и отправка документа
  const handlePickDocument = async () => {
    setShowAttachMenu(false);

    // Проверка блокировки
    if (isBlocked || isBlockedByOther) {
      Alert.alert(
        "Блокировка",
        isBlocked
          ? "Вы заблокировали этого пользователя. Разблокируйте, чтобы отправить сообщение."
          : "Этот пользователь вас заблокировал.",
      );
      return;
    }

    if (Platform.OS === "web") {
      Alert.alert("Недоступно", "Отправка файлов недоступна в веб-версии");
      return;
    }

    // Предотвращаем множественные вызовы
    if (isPickingDocumentRef.current) {
      console.log("Document picker already in progress, skipping");
      return;
    }

    console.log("Opening document picker...");
    isPickingDocumentRef.current = true;

    // Небольшая задержка чтобы дать expo-document-picker освободить предыдущий пикер
    await new Promise((resolve) => setTimeout(resolve, 300));

    let pickerResult;
    try {
      pickerResult = await DocumentPicker.getDocumentAsync({
        type: "*/*",
        copyToCacheDirectory: true,
        multiple: false,
      });
    } catch (pickerError: any) {
      console.error("Document picker error:", pickerError);
      isPickingDocumentRef.current = false;

      // Если ошибка связана с уже активным пикером - пробуем ещё раз через секунду
      if (pickerError?.message?.includes("Different document picking")) {
        setTimeout(() => {
          isPickingDocumentRef.current = false;
        }, 1000);
        return;
      }

      Alert.alert("Ошибка", "Не удалось открыть выбор документов");
      return;
    }

    if (
      pickerResult.canceled ||
      !pickerResult.assets ||
      !pickerResult.assets[0]
    ) {
      console.log("Document picker canceled");
      isPickingDocumentRef.current = false;
      return;
    }

    const file = pickerResult.assets[0];
    console.log("File selected:", file.name);

    // Проверка размера файла (макс 20MB)
    const maxSize = 20 * 1024 * 1024;
    if (file.size && file.size > maxSize) {
      Alert.alert("Файл слишком большой", "Максимальный размер файла: 20 МБ");
      isPickingDocumentRef.current = false;
      return;
    }

    setSending(true);

    try {
      // Загружаем файл в Supabase Storage
      // Безопасное извлечение расширения файла
      const nameParts = file.name.split(".");
      const rawExt = nameParts.length > 1 ? nameParts.pop() : "file";
      // Очищаем расширение от небезопасных символов (только латиница и цифры)
      const fileExt =
        (rawExt || "file").replace(/[^a-zA-Z0-9]/g, "").toLowerCase() || "file";
      const fileName = `${Date.now()}.${fileExt}`;
      const filePath = `documents/${user!.id}/${fileName}`;

      // Читаем файл как base64
      const base64 = await FileSystem.readAsStringAsync(file.uri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      const { error: uploadError } = await supabase.storage
        .from("chat-media")
        .upload(filePath, decode(base64), {
          contentType: file.mimeType || "application/octet-stream",
        });

      if (uploadError) throw uploadError;

      // Получаем публичный URL
      const { data: urlData } = supabase.storage
        .from("chat-media")
        .getPublicUrl(filePath);

      // Отправляем сообщение с файлом
      const { error } = await supabase.from("messages").insert({
        chat_id: id as string,
        sender_id: user!.id,
        content: file.name,
        media_url: urlData.publicUrl,
        media_type: "file",
        file_name: file.name,
        file_size: file.size || 0,
        reply_to_id: replyingTo?.id || null,
      });

      if (error) throw error;

      setReplyingTo(null);
      safeHaptic(Haptics.ImpactFeedbackStyle.Light);
    } catch (error: any) {
      console.error("Document upload error:", error);
      const errorMsg = error?.message?.includes("column")
        ? "Выполните SQL миграцию в Supabase"
        : "Не удалось отправить документ";
      Alert.alert("Ошибка", errorMsg);
    } finally {
      setSending(false);
      isPickingDocumentRef.current = false;
    }
  };

  const sendMediaMessage = async (uri: string, mimeType: string) => {
    if (!user || !id || uploading) return;

    // Проверка блокировки
    if (isBlocked || isBlockedByOther) {
      Alert.alert(
        "Блокировка",
        isBlocked
          ? "Вы заблокировали этого пользователя. Разблокируйте, чтобы отправить сообщение."
          : "Этот пользователь вас заблокировал.",
      );
      return;
    }

    setUploading(true);
    safeHaptic(Haptics.ImpactFeedbackStyle.Medium);

    try {
      const result = await uploadMedia(uri, user.id, mimeType);

      if (!result.success) {
        Alert.alert("Ошибка", result.error || "Не удалось загрузить файл");
        return;
      }

      const { error } = await supabase.from("messages").insert({
        chat_id: id,
        sender_id: user.id,
        content: "",
        media_url: result.url,
        media_type: result.type,
      });

      if (error) throw error;
    } catch (error) {
      console.error("Error sending media:", error);
      Alert.alert("Ошибка", "Не удалось отправить сообщение");
    } finally {
      setUploading(false);
    }
  };

  // Отправка голосового сообщения с waveform данными
  const sendVoiceMessage = async (
    uri: string,
    waveformData: number[],
    durationSec: number,
  ) => {
    if (!user || !id || uploading) return;

    if (isBlocked || isBlockedByOther) {
      Alert.alert(
        "Блокировка",
        isBlocked
          ? "Вы заблокировали этого пользователя. Разблокируйте, чтобы отправить сообщение."
          : "Этот пользователь вас заблокировал.",
      );
      return;
    }

    setUploading(true);
    safeHaptic(Haptics.ImpactFeedbackStyle.Medium);

    try {
      const result = await uploadMedia(uri, user.id, "audio/m4a");

      if (!result.success) {
        Alert.alert("Ошибка", result.error || "Не удалось загрузить файл");
        return;
      }

      const { error } = await supabase.from("messages").insert({
        chat_id: id,
        sender_id: user.id,
        content: "",
        media_url: result.url,
        media_type: "audio" as const,
        audio_waveform: waveformData,
        audio_duration: durationSec,
      });

      if (error) throw error;
    } catch (error) {
      console.error("Error sending voice message:", error);
      Alert.alert("Ошибка", "Не удалось отправить голосовое сообщение");
    } finally {
      setUploading(false);
    }
  };

  // Функция для рендеринга текста с кликабельными ссылками
  const renderTextWithLinks = (text: string, isMyMessage: boolean) => {
    const urlRegex = /(https?:\/\/[^\s]+)/gi;
    const parts = text.split(urlRegex);

    if (parts.length === 1 && !urlRegex.test(text)) {
      // Нет ссылок - возвращаем простой текст
      return text;
    }

    return parts.map((part, index) => {
      if (urlRegex.test(part)) {
        // Сбрасываем lastIndex после test
        urlRegex.lastIndex = 0;
        return (
          <Text
            key={index}
            style={[
              styles.linkText,
              { color: isMyMessage ? "#90CAF9" : colors.primary },
            ]}
            onPress={() => {
              if (Platform.OS === "web") {
                window.open(part, "_blank");
              } else {
                Linking.openURL(part);
              }
            }}
          >
            {part}
          </Text>
        );
      }
      // Сбрасываем lastIndex
      urlRegex.lastIndex = 0;
      return part;
    });
  };

  // Функция подсветки найденного текста
  const highlightSearchText = (text: string, isMyMessage: boolean) => {
    const myMessageTextColor = isMyMessage
      ? isDark
        ? "#fff"
        : colors.text
      : colors.text;

    if (!searchQuery || searchQuery.trim().length < 2) {
      return (
        <Text style={[styles.messageText, { color: myMessageTextColor }]}>
          {renderTextWithLinks(text, isMyMessage)}
        </Text>
      );
    }

    const lowerText = text.toLowerCase();
    const lowerQuery = searchQuery.toLowerCase();
    const index = lowerText.indexOf(lowerQuery);

    if (index === -1) {
      return (
        <Text style={[styles.messageText, { color: myMessageTextColor }]}>
          {renderTextWithLinks(text, isMyMessage)}
        </Text>
      );
    }

    const before = text.substring(0, index);
    const match = text.substring(index, index + searchQuery.length);
    const after = text.substring(index + searchQuery.length);

    return (
      <Text style={[styles.messageText, { color: myMessageTextColor }]}>
        {renderTextWithLinks(before, isMyMessage)}
        <Text style={styles.searchHighlight}>{match}</Text>
        {renderTextWithLinks(after, isMyMessage)}
      </Text>
    );
  };

  const formatMessageTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString("ru-RU", {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const formatDateSeparator = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days === 0) return "Сегодня";
    if (days === 1) return "Вчера";
    return date.toLocaleDateString("ru-RU", {
      day: "numeric",
      month: "long",
      year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
    });
  };

  const shouldShowDateSeparator = (index: number) => {
    if (index === 0) return true;
    const currentDate = new Date(messages[index].created_at).toDateString();
    const prevDate = new Date(messages[index - 1].created_at).toDateString();
    return currentDate !== prevDate;
  };

  // Форматирование размера файла
  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return "0 Б";
    const k = 1024;
    const sizes = ["Б", "КБ", "МБ", "ГБ"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
  };

  // Получение иконки файла по расширению
  const getFileIcon = (fileName: string): keyof typeof Ionicons.glyphMap => {
    const ext = fileName.split(".").pop()?.toLowerCase() || "";
    const icons: Record<string, keyof typeof Ionicons.glyphMap> = {
      pdf: "document-text",
      doc: "document-text",
      docx: "document-text",
      xls: "grid",
      xlsx: "grid",
      ppt: "easel",
      pptx: "easel",
      zip: "archive",
      rar: "archive",
      "7z": "archive",
      txt: "document",
      mp3: "musical-notes",
      wav: "musical-notes",
      jpg: "image",
      jpeg: "image",
      png: "image",
      gif: "image",
    };
    return icons[ext] || "document-attach";
  };
  const renderMessage = ({
    item,
    index,
  }: {
    item: MessageWithSender;
    index: number;
  }) => {
    const isMyMessage = item.sender_id === user?.id;
    const showDate = shouldShowDateSeparator(index);
    const isHighlighted = highlightedMessageId === item.id;

    return (
      <>
        {showDate && (
          <View style={styles.dateSeparator}>
            <Text style={styles.dateSeparatorText}>
              {formatDateSeparator(item.created_at)}
            </Text>
          </View>
        )}
        <Animated.View
          style={[
            isHighlighted && {
              backgroundColor: highlightAnimation.interpolate({
                inputRange: [0, 1],
                outputRange: ["transparent", colors.primaryLight],
              }),
              transform: [
                {
                  scale: highlightAnimation.interpolate({
                    inputRange: [0, 0.5, 1],
                    outputRange: [1, 1.02, 1],
                  }),
                },
              ],
            },
          ]}
        >
          <TouchableOpacity
            style={[
              styles.messageContainer,
              isMyMessage
                ? styles.myMessageContainer
                : styles.otherMessageContainer,
            ]}
            onLongPress={() => handleMessageLongPress(item)}
            activeOpacity={0.8}
            delayLongPress={300}
          >
            <View
              style={[
                styles.messageBubble,
                isMyMessage
                  ? [
                      styles.myMessageBubble,
                      { backgroundColor: colors.messageMine },
                    ]
                  : [
                      styles.otherMessageBubble,
                      { backgroundColor: colors.messageOther },
                    ],
                item.media_url && styles.mediaBubble,
              ]}
            >
              {/* Sender name for group messages */}
              {isGroup && !isMyMessage && item.sender && (
                <Text
                  style={[
                    styles.senderName,
                    { color: getAvatarColor(item.sender.id) },
                  ]}
                >
                  {item.sender.username}
                </Text>
              )}
              {/* Replied message quote */}
              {item.replied_message && (
                <TouchableOpacity
                  style={[
                    styles.repliedMessageContainer,
                    {
                      backgroundColor: isMyMessage
                        ? "rgba(255,255,255,0.15)"
                        : isDark
                          ? "rgba(255,255,255,0.08)"
                          : "rgba(0,0,0,0.05)",
                      borderLeftColor: colors.primary,
                    },
                  ]}
                  activeOpacity={0.7}
                  onPress={() => {
                    // Scroll to replied message
                    const replyIndex = messages.findIndex(
                      (m) => m.id === item.replied_message?.id,
                    );
                    if (replyIndex !== -1) {
                      flatListRef.current?.scrollToIndex({
                        index: replyIndex,
                        animated: true,
                      });
                    }
                  }}
                >
                  <Text
                    style={[
                      styles.repliedMessageSender,
                      { color: colors.primary },
                    ]}
                  >
                    {item.replied_message.sender?.username || "Пользователь"}
                  </Text>
                  <Text
                    style={[
                      styles.repliedMessageText,
                      {
                        color: isMyMessage
                          ? "rgba(255,255,255,0.8)"
                          : colors.textSecondary,
                      },
                    ]}
                    numberOfLines={2}
                  >
                    {item.replied_message.content ||
                      (item.replied_message.media_type === "image"
                        ? "Фото"
                        : item.replied_message.media_type === "video"
                          ? "Видео"
                          : item.replied_message.media_type === "location"
                            ? "Геолокация"
                            : item.replied_message.media_type === "file"
                              ? "Документ"
                              : "Аудио")}
                  </Text>
                </TouchableOpacity>
              )}

              {/* Media content */}
              {item.media_url && item.media_type === "image" && (
                <TouchableOpacity
                  activeOpacity={0.9}
                  onPress={() =>
                    setFullscreenMedia({ url: item.media_url!, type: "image" })
                  }
                >
                  <Image
                    source={{ uri: item.media_url }}
                    style={styles.mediaImage}
                    resizeMode="cover"
                  />
                </TouchableOpacity>
              )}
              {item.media_url &&
                item.media_type === "video" &&
                Platform.OS !== "web" && (
                  <TouchableOpacity
                    activeOpacity={0.9}
                    onPress={() =>
                      setFullscreenMedia({
                        url: item.media_url!,
                        type: "video",
                      })
                    }
                  >
                    <Video
                      source={{ uri: item.media_url }}
                      style={styles.mediaVideo}
                      useNativeControls
                      resizeMode={ResizeMode.CONTAIN}
                      isLooping={false}
                    />
                  </TouchableOpacity>
                )}
              {item.media_url &&
                item.media_type === "video" &&
                Platform.OS === "web" && (
                  <View style={styles.mediaVideo}>
                    <Text style={{ color: colors.textMuted }}>
                      Видео (откройте в приложении)
                    </Text>
                  </View>
                )}
              {item.media_url && item.media_type === "audio" && (
                <VoiceMessageBubble
                  messageId={item.id}
                  audioUrl={item.media_url}
                  isMyMessage={isMyMessage}
                  waveform={item.audio_waveform}
                  duration={item.audio_duration}
                  playingAudioId={playingAudioId}
                  onPlayStateChange={setPlayingAudioId}
                  soundRef={soundRef}
                />
              )}

              {/* Location message */}
              {item.media_type === "location" &&
                item.latitude &&
                item.longitude && (
                  <TouchableOpacity
                    style={styles.locationContainer}
                    activeOpacity={0.8}
                    onPress={() => {
                      // Используем Google Maps URL - работает везде включая Expo Go
                      const url = `https://www.google.com/maps/search/?api=1&query=${item.latitude},${item.longitude}`;
                      if (Platform.OS === "web") {
                        window.open(url, "_blank");
                      } else {
                        Linking.openURL(url);
                      }
                    }}
                  >
                    <Image
                      source={{
                        uri: `https://static-maps.yandex.ru/1.x/?ll=${item.longitude},${item.latitude}&z=14&size=280,150&l=map&pt=${item.longitude},${item.latitude},pm2rdl`,
                      }}
                      style={styles.locationMap}
                      resizeMode="cover"
                    />
                    <View style={styles.locationInfo}>
                      <View style={styles.locationHeader}>
                        <Ionicons
                          name="location"
                          size={18}
                          color={colors.primary}
                        />
                        <Text
                          style={[styles.locationTitle, { color: colors.text }]}
                          numberOfLines={1}
                        >
                          {item.location_name || "Местоположение"}
                        </Text>
                      </View>
                      <Text
                        style={[
                          styles.locationCoords,
                          { color: colors.textSecondary },
                        ]}
                      >
                        {item.latitude.toFixed(6)}, {item.longitude.toFixed(6)}
                      </Text>
                    </View>
                  </TouchableOpacity>
                )}

              {/* File/Document message */}
              {item.media_type === "file" && item.media_url && (
                <TouchableOpacity
                  style={[
                    styles.fileContainer,
                    {
                      backgroundColor: isMyMessage
                        ? "rgba(255,255,255,0.15)"
                        : isDark
                          ? "rgba(255,255,255,0.08)"
                          : "rgba(0,0,0,0.05)",
                    },
                  ]}
                  activeOpacity={0.7}
                  onPress={() => {
                    setDocumentViewer({
                      url: item.media_url!,
                      name: item.file_name || "Документ",
                    });
                  }}
                  onLongPress={() => {
                    // Длительное нажатие - открыть в браузере / скачать
                    if (Platform.OS === "web") {
                      window.open(item.media_url!, "_blank");
                    } else {
                      Linking.openURL(item.media_url!);
                    }
                  }}
                >
                  <View
                    style={[
                      styles.fileIcon,
                      { backgroundColor: colors.primary },
                    ]}
                  >
                    <Ionicons
                      name={getFileIcon(item.file_name || "")}
                      size={24}
                      color="#fff"
                    />
                  </View>
                  <View style={styles.fileInfo}>
                    <Text
                      style={[
                        styles.fileName,
                        {
                          color: isMyMessage
                            ? isDark
                              ? "#fff"
                              : colors.text
                            : colors.text,
                        },
                      ]}
                      numberOfLines={1}
                    >
                      {item.file_name || "Документ"}
                    </Text>
                    <Text
                      style={[
                        styles.fileSize,
                        {
                          color: isMyMessage
                            ? isDark
                              ? "rgba(255,255,255,0.7)"
                              : colors.textSecondary
                            : colors.textSecondary,
                        },
                      ]}
                    >
                      {formatFileSize(item.file_size || 0)}
                    </Text>
                  </View>
                  <Ionicons
                    name="download-outline"
                    size={22}
                    color={
                      isMyMessage
                        ? isDark
                          ? "rgba(255,255,255,0.8)"
                          : colors.primary
                        : colors.primary
                    }
                  />
                </TouchableOpacity>
              )}

              {/* Text content */}
              {item.content
                ? highlightSearchText(item.content, isMyMessage)
                : null}
              <Text style={[styles.messageTime, { color: colors.messageTime }]}>
                {formatMessageTime(item.created_at)}
                {isMyMessage && (
                  <Text style={{ marginLeft: 4 }}>
                    {" "}
                    <Ionicons
                      name={item.is_read ? "checkmark-done" : "checkmark"}
                      size={14}
                      color={item.is_read ? "#4FC3F7" : colors.messageTime}
                    />
                  </Text>
                )}
              </Text>
              {item.updated_at && item.updated_at !== item.created_at && (
                <Text style={styles.editedLabel}>изменено</Text>
              )}
            </View>

            {/* Reactions display */}
            {item.reactions && item.reactions.length > 0 && (
              <ReactionDisplay
                reactions={item.reactions}
                onReactionPress={(emoji: string) =>
                  toggleReaction(item.id, emoji)
                }
                onReactionLongPress={(reaction: GroupedReaction) =>
                  showReactionUsersModal(reaction, item.reactions || [])
                }
                isMyMessage={isMyMessage}
              />
            )}
          </TouchableOpacity>
        </Animated.View>
      </>
    );
  };

  if (loading) {
    return (
      <View
        style={[
          styles.loadingContainer,
          { backgroundColor: colors.background },
        ]}
      >
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const avatarColor = otherUser ? getAvatarColor(otherUser.id) : colors.primary;
  const groupAvatarColor = id ? getAvatarColor(id) : colors.primary;

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.backgroundChat }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
    >
      {/* Custom Header */}
      <View style={[styles.header, { backgroundColor: colors.primary }]}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => {
            safeHaptic(Haptics.ImpactFeedbackStyle.Light);
            if (router.canGoBack()) {
              router.back();
            } else {
              router.replace("/(tabs)");
            }
          }}
        >
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.headerProfile}
          onPress={() => {
            safeHaptic(Haptics.ImpactFeedbackStyle.Light);
            if (isGroup) {
              router.push(`/group/${id}/settings` as any);
            } else if (otherUser?.id) {
              router.push(`/profile/${otherUser.id}` as any);
            }
          }}
          activeOpacity={0.7}
        >
          {/* Avatar - открывает просмотр */}
          <TouchableOpacity
            onPress={() => {
              safeHaptic(Haptics.ImpactFeedbackStyle.Light);
              const hasAvatar = isGroup
                ? !!chatAvatarUrl
                : !!otherUser?.avatar_url;
              if (hasAvatar || !isGroup) {
                setShowAvatarViewer(true);
              }
            }}
            activeOpacity={0.8}
          >
            {isGroup ? (
              // Аватар группы
              <View style={styles.avatarWrapper}>
                {chatAvatarUrl ? (
                  <Image
                    source={{ uri: chatAvatarUrl }}
                    style={styles.headerAvatarImage}
                  />
                ) : (
                  <View
                    style={[
                      styles.headerAvatar,
                      { backgroundColor: groupAvatarColor },
                    ]}
                  >
                    <Ionicons
                      name="people"
                      size={20}
                      color={colors.textLight}
                    />
                  </View>
                )}
              </View>
            ) : otherUser?.avatar_url ? (
              <View style={styles.avatarWrapper}>
                <Image
                  source={{ uri: otherUser.avatar_url }}
                  style={styles.headerAvatarImage}
                />
                {isOnline && <View style={styles.onlineIndicator} />}
              </View>
            ) : (
              <View style={styles.avatarWrapper}>
                <View
                  style={[
                    styles.headerAvatar,
                    { backgroundColor: avatarColor },
                  ]}
                >
                  <Text style={styles.headerAvatarText}>
                    {chatName.charAt(0).toUpperCase()}
                  </Text>
                </View>
                {isOnline && <View style={styles.onlineIndicator} />}
              </View>
            )}
          </TouchableOpacity>

          <View style={styles.headerInfo}>
            <Text style={styles.headerName}>{chatName}</Text>
            <Text
              style={[
                styles.headerStatus,
                !isGroup && isOnline && styles.headerStatusOnline,
              ]}
            >
              {isGroup
                ? `${memberCount} участник${memberCount === 1 ? "" : memberCount < 5 ? "а" : "ов"}`
                : formatLastSeen()}
            </Text>
          </View>
        </TouchableOpacity>

        {/* Кнопка поиска */}
        <TouchableOpacity
          style={styles.headerSearchButton}
          onPress={() => {
            safeHaptic(Haptics.ImpactFeedbackStyle.Light);
            openSearch();
          }}
        >
          <Ionicons name="search" size={22} color={colors.textLight} />
        </TouchableOpacity>

        {/* Кнопка меню/настроек */}
        <TouchableOpacity
          style={styles.headerSettingsButton}
          onPress={() => {
            safeHaptic(Haptics.ImpactFeedbackStyle.Light);
            if (isGroup) {
              router.push(`/group/${id}/settings` as any);
            } else {
              // Показать меню действий для личного чата
              if (Platform.OS === "ios") {
                ActionSheetIOS.showActionSheetWithOptions(
                  {
                    options: ["Очистить историю", "Открыть профиль", "Отмена"],
                    destructiveButtonIndex: 0,
                    cancelButtonIndex: 2,
                  },
                  async (buttonIndex) => {
                    if (buttonIndex === 0) {
                      Alert.alert(
                        "Очистить историю",
                        "Удалить все сообщения в этом чате? Это действие нельзя отменить.",
                        [
                          { text: "Отмена", style: "cancel" },
                          {
                            text: "Очистить",
                            style: "destructive",
                            onPress: async () => {
                              const { error } = await supabase
                                .from("messages")
                                .delete()
                                .eq("chat_id", id);
                              if (!error) {
                                setMessages([]);
                                Alert.alert("Готово", "История чата очищена");
                              }
                            },
                          },
                        ],
                      );
                    } else if (buttonIndex === 1 && otherUser?.id) {
                      router.push(`/profile/${otherUser.id}` as any);
                    }
                  },
                );
              } else {
                Alert.alert("Действия", "Выберите действие", [
                  {
                    text: "Очистить историю",
                    style: "destructive",
                    onPress: () => {
                      Alert.alert(
                        "Очистить историю",
                        "Удалить все сообщения в этом чате?",
                        [
                          { text: "Отмена", style: "cancel" },
                          {
                            text: "Очистить",
                            style: "destructive",
                            onPress: async () => {
                              const { error } = await supabase
                                .from("messages")
                                .delete()
                                .eq("chat_id", id);
                              if (!error) {
                                setMessages([]);
                                Alert.alert("Готово", "История чата очищена");
                              }
                            },
                          },
                        ],
                      );
                    },
                  },
                  {
                    text: "Открыть профиль",
                    onPress: () => {
                      if (otherUser?.id) {
                        router.push(`/profile/${otherUser.id}` as any);
                      }
                    },
                  },
                  { text: "Отмена", style: "cancel" },
                ]);
              }
            }
          }}
        >
          <Ionicons
            name={isGroup ? "settings-outline" : "ellipsis-vertical"}
            size={22}
            color={colors.textLight}
          />
        </TouchableOpacity>
      </View>

      {/* Search Bar */}
      {showSearch && (
        <Animated.View
          style={[
            styles.searchBar,
            {
              opacity: searchAnimation,
              transform: [
                {
                  translateY: searchAnimation.interpolate({
                    inputRange: [0, 1],
                    outputRange: [-50, 0],
                  }),
                },
              ],
            },
          ]}
        >
          <View style={styles.searchInputContainer}>
            <Ionicons name="search" size={20} color={colors.textSecondary} />
            <TextInput
              ref={searchInputRef}
              style={styles.searchInput}
              placeholder="Поиск по сообщениям..."
              placeholderTextColor={colors.textSecondary}
              value={searchQuery}
              onChangeText={handleSearch}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity
                onPress={() => {
                  setSearchQuery("");
                  setSearchResults([]);
                  searchInputRef.current?.focus();
                }}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons
                  name="close-circle"
                  size={20}
                  color={colors.textSecondary}
                />
              </TouchableOpacity>
            )}
          </View>

          {searchResults.length > 0 && (
            <View style={styles.searchNavigation}>
              <Text style={styles.searchResultsCount}>
                {currentSearchIndex + 1}/{searchResults.length}
              </Text>
              <TouchableOpacity
                style={styles.searchNavButton}
                onPress={() => navigateSearchResult("prev")}
              >
                <Ionicons name="chevron-up" size={22} color={colors.primary} />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.searchNavButton}
                onPress={() => navigateSearchResult("next")}
              >
                <Ionicons
                  name="chevron-down"
                  size={22}
                  color={colors.primary}
                />
              </TouchableOpacity>
            </View>
          )}

          <TouchableOpacity
            style={styles.searchCloseButton}
            onPress={closeSearch}
          >
            <Ionicons name="close" size={24} color={colors.textLight} />
          </TouchableOpacity>
        </Animated.View>
      )}

      {/* Messages */}
      <View style={styles.messagesContainer}>
        {/* Pinned Messages Bar */}
        {pinnedMessages.length > 0 && (
          <Animated.View
            style={[
              styles.pinnedBar,
              {
                opacity: pinnedAnimation,
                transform: [
                  {
                    translateY: pinnedAnimation.interpolate({
                      inputRange: [0, 1],
                      outputRange: [-60, 0],
                    }),
                  },
                ],
              },
            ]}
          >
            {/* Navigation arrows for multiple pins */}
            {pinnedMessages.length > 1 && (
              <View style={styles.pinnedNavigation}>
                <TouchableOpacity
                  style={styles.pinnedNavButton}
                  onPress={() => navigatePinnedMessage("prev")}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons
                    name="chevron-up"
                    size={18}
                    color={colors.primary}
                  />
                </TouchableOpacity>
                <Text style={styles.pinnedCounter}>
                  {currentPinnedIndex + 1}/{pinnedMessages.length}
                </Text>
                <TouchableOpacity
                  style={styles.pinnedNavButton}
                  onPress={() => navigatePinnedMessage("next")}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons
                    name="chevron-down"
                    size={18}
                    color={colors.primary}
                  />
                </TouchableOpacity>
              </View>
            )}

            <TouchableOpacity
              style={styles.pinnedContent}
              onPress={() => scrollToPinnedMessage()}
              activeOpacity={0.7}
            >
              <View
                style={[
                  styles.pinnedIconContainer,
                  pinnedMessages[currentPinnedIndex]?.isPersonal &&
                    styles.pinnedIconPersonal,
                ]}
              >
                <Ionicons
                  name="bookmark"
                  size={16}
                  color={
                    pinnedMessages[currentPinnedIndex]?.isPersonal
                      ? "#FF9500"
                      : colors.primary
                  }
                />
              </View>
              <View style={styles.pinnedTextContainer}>
                <Text style={styles.pinnedLabel}>
                  {pinnedMessages[currentPinnedIndex]?.isPersonal
                    ? "Закреплено для вас"
                    : "Закреплённое сообщение"}
                </Text>
                <Text style={styles.pinnedMessageText} numberOfLines={1}>
                  {pinnedMessages[currentPinnedIndex]?.message.content ||
                    (pinnedMessages[currentPinnedIndex]?.message.media_type ===
                    "image"
                      ? "📷 Фото"
                      : pinnedMessages[currentPinnedIndex]?.message
                            .media_type === "video"
                        ? "🎬 Видео"
                        : pinnedMessages[currentPinnedIndex]?.message
                              .media_type === "audio"
                          ? "🎵 Аудио"
                          : "Сообщение")}
                </Text>
              </View>
              {pinnedMessages[currentPinnedIndex]?.message.sender
                ?.avatar_url ? (
                <Image
                  source={{
                    uri: pinnedMessages[currentPinnedIndex]?.message.sender
                      ?.avatar_url,
                  }}
                  style={styles.pinnedAvatar}
                />
              ) : (
                <View
                  style={[
                    styles.pinnedAvatarPlaceholder,
                    {
                      backgroundColor: getAvatarColor(
                        pinnedMessages[currentPinnedIndex]?.message.sender_id ||
                          "",
                      ),
                    },
                  ]}
                >
                  <Text style={styles.pinnedAvatarText}>
                    {pinnedMessages[
                      currentPinnedIndex
                    ]?.message.sender?.username
                      ?.charAt(0)
                      .toUpperCase() || "?"}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.pinnedCloseButton}
              onPress={() => {
                const current = pinnedMessages[currentPinnedIndex];
                if (current) {
                  unpinMessage(current.message.id, current.isPersonal);
                }
              }}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons name="close" size={18} color={colors.textSecondary} />
            </TouchableOpacity>
          </Animated.View>
        )}

        <FlatList
          ref={flatListRef}
          data={messages}
          renderItem={renderMessage}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.messagesList}
          onContentSizeChange={() => {
            if (!skipAutoScrollRef.current && isNearBottomRef.current) {
              flatListRef.current?.scrollToEnd();
            }
          }}
          onScroll={(e) => {
            const { contentOffset, layoutMeasurement, contentSize } =
              e.nativeEvent;
            const distanceFromBottom =
              contentSize.height - layoutMeasurement.height - contentOffset.y;
            const nearBottom = distanceFromBottom < 150;
            isNearBottomRef.current = nearBottom;
            setShowScrollButton(!nearBottom);
          }}
          scrollEventThrottle={100}
          onScrollToIndexFailed={(info) => {
            const wait = new Promise((resolve) => setTimeout(resolve, 100));
            wait.then(() => {
              flatListRef.current?.scrollToIndex({
                index: info.index,
                animated: true,
                viewPosition: 0.5,
              });
            });
          }}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <View style={styles.emptyIcon}>
                <Ionicons
                  name="chatbubble-ellipses-outline"
                  size={36}
                  color={colors.primary}
                />
              </View>
              <Text style={styles.emptyText}>Начните диалог!</Text>
              <Text style={styles.emptySubtext}>
                Отправьте первое сообщение
              </Text>
            </View>
          }
        />

        {/* Scroll to bottom button */}
        {showScrollButton && (
          <TouchableOpacity
            style={[
              styles.scrollToBottomButton,
              {
                backgroundColor: isDark ? "#2A3942" : "#ffffff",
                shadowColor: colors.shadowColor,
              },
            ]}
            onPress={() => {
              flatListRef.current?.scrollToEnd({ animated: true });
            }}
            activeOpacity={0.8}
          >
            <Ionicons
              name="chevron-down"
              size={22}
              color={isDark ? "#e4e6eb" : "#1a1a1a"}
            />
          </TouchableOpacity>
        )}

        {/* Typing Indicator */}
        {typingUsers.length > 0 && (
          <View style={styles.typingContainer}>
            <View style={styles.typingAvatars}>
              {typingUsers.slice(0, 3).map((typingUser, index) => (
                <View
                  key={typingUser.id}
                  style={[
                    styles.typingAvatarWrapper,
                    { marginLeft: index > 0 ? -8 : 0, zIndex: 3 - index },
                  ]}
                >
                  {typingUser.avatar_url ? (
                    <Image
                      source={{ uri: typingUser.avatar_url }}
                      style={styles.typingAvatar}
                    />
                  ) : (
                    <View
                      style={[
                        styles.typingAvatarPlaceholder,
                        { backgroundColor: getAvatarColor(typingUser.id) },
                      ]}
                    >
                      <Text style={styles.typingAvatarText}>
                        {typingUser.username.charAt(0).toUpperCase()}
                      </Text>
                    </View>
                  )}
                </View>
              ))}
            </View>
            <View style={styles.typingBubble}>
              <View style={styles.typingDots}>
                <Animated.View
                  style={[styles.typingDot, { opacity: typingDot1 }]}
                />
                <Animated.View
                  style={[styles.typingDot, { opacity: typingDot2 }]}
                />
                <Animated.View
                  style={[styles.typingDot, { opacity: typingDot3 }]}
                />
              </View>
            </View>
            <Text style={styles.typingText}>
              {typingUsers.length === 1
                ? `${typingUsers[0].username} печатает...`
                : `${typingUsers.length} печатают...`}
            </Text>
          </View>
        )}
      </View>

      {/* Attach Menu - Android and Web */}
      {showAttachMenu && Platform.OS !== "ios" && (
        <View
          style={[
            styles.attachMenu,
            { backgroundColor: colors.card, borderTopColor: colors.border },
          ]}
        >
          <TouchableOpacity
            style={styles.attachMenuItem}
            onPress={handlePickMedia}
          >
            <View
              style={[styles.attachMenuIcon, { backgroundColor: "#4CAF50" }]}
            >
              <Ionicons name="image" size={20} color="#fff" />
            </View>
            <Text style={[styles.attachMenuText, { color: colors.text }]}>
              Галерея
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.attachMenuItem}
            onPress={handleTakePhoto}
          >
            <View
              style={[styles.attachMenuIcon, { backgroundColor: "#2196F3" }]}
            >
              <Ionicons name="camera" size={20} color="#fff" />
            </View>
            <Text style={[styles.attachMenuText, { color: colors.text }]}>
              Камера
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.attachMenuItem}
            onPress={handleRecordAudio}
          >
            <View
              style={[styles.attachMenuIcon, { backgroundColor: "#FF9800" }]}
            >
              <Ionicons name="mic" size={20} color="#fff" />
            </View>
            <Text style={[styles.attachMenuText, { color: colors.text }]}>
              Аудио
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.attachMenuItem}
            onPress={handleSendLocation}
          >
            <View
              style={[styles.attachMenuIcon, { backgroundColor: "#E91E63" }]}
            >
              <Ionicons name="location" size={20} color="#fff" />
            </View>
            <Text style={[styles.attachMenuText, { color: colors.text }]}>
              Локация
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.attachMenuItem}
            onPress={handlePickDocument}
          >
            <View
              style={[styles.attachMenuIcon, { backgroundColor: "#9C27B0" }]}
            >
              <Ionicons name="document-attach" size={20} color="#fff" />
            </View>
            <Text style={[styles.attachMenuText, { color: colors.text }]}>
              Файл
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Editing indicator */}
      {editingMessage && (
        <View style={styles.editingContainer}>
          <View style={styles.editingInfo}>
            <Ionicons name="pencil" size={18} color={colors.primary} />
            <Text style={styles.editingLabel}>Редактирование</Text>
            <Text style={styles.editingText} numberOfLines={1}>
              {editingMessage.content}
            </Text>
          </View>
          <TouchableOpacity
            onPress={cancelEditing}
            style={styles.editingCancel}
          >
            <Ionicons name="close" size={20} color={colors.textMuted} />
          </TouchableOpacity>
        </View>
      )}

      {/* Reply indicator */}
      {replyingTo && !editingMessage && (
        <View
          style={[
            styles.replyContainer,
            { backgroundColor: colors.card, borderTopColor: colors.border },
          ]}
        >
          <View style={[styles.replyInfo, { borderLeftColor: colors.primary }]}>
            <Text style={[styles.replyLabel, { color: colors.primary }]}>
              Ответ для {replyingTo.sender?.username || "Пользователь"}
            </Text>
            <Text
              style={[styles.replyText, { color: colors.textSecondary }]}
              numberOfLines={1}
            >
              {replyingTo.content ||
                (replyingTo.media_type === "image"
                  ? "Фото"
                  : replyingTo.media_type === "video"
                    ? "Видео"
                    : replyingTo.media_type === "location"
                      ? "Геолокация"
                      : replyingTo.media_type === "file"
                        ? "Документ"
                        : "Аудио")}
            </Text>
          </View>
          <TouchableOpacity onPress={cancelReply} style={styles.replyCancel}>
            <Ionicons name="close" size={20} color={colors.textMuted} />
          </TouchableOpacity>
        </View>
      )}

      {/* Blocked User Banner */}
      {!isGroup && (isBlocked || isBlockedByOther) ? (
        <View
          style={[
            styles.blockedBanner,
            {
              backgroundColor: colors.background,
              borderTopColor: colors.border,
            },
          ]}
        >
          <View
            style={[
              styles.blockedContent,
              { backgroundColor: isDark ? "#3D2A2A" : "#FEF2F2" },
            ]}
          >
            <Ionicons
              name="ban-outline"
              size={22}
              color={isDark ? "#F87171" : "#DC2626"}
            />
            <View style={styles.blockedTextContainer}>
              <Text
                style={[
                  styles.blockedTitle,
                  { color: isDark ? "#F87171" : "#DC2626" },
                ]}
              >
                {isBlockedByOther
                  ? "Вы заблокированы"
                  : "Пользователь заблокирован"}
              </Text>
              <Text
                style={[
                  styles.blockedSubtitle,
                  { color: colors.textSecondary },
                ]}
              >
                {isBlockedByOther
                  ? "Этот пользователь вас заблокировал"
                  : "Вы не можете отправлять сообщения"}
              </Text>
            </View>
            {isBlocked && (
              <TouchableOpacity
                style={[
                  styles.unblockButton,
                  { backgroundColor: colors.primary },
                ]}
                onPress={async () => {
                  if (!user || !otherUser) return;
                  try {
                    const { error } = await supabase
                      .from("blocked_users")
                      .delete()
                      .eq("blocker_id", user.id)
                      .eq("blocked_id", otherUser.id);

                    if (!error) {
                      setIsBlocked(false);
                      safeNotificationHaptic(
                        Haptics.NotificationFeedbackType.Success,
                      );
                    }
                  } catch (err) {
                    console.error("Error unblocking:", err);
                  }
                }}
              >
                <Text style={styles.unblockButtonText}>Разблокировать</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      ) : (
        /* Input */
        <View
          style={[
            styles.inputContainer,
            {
              backgroundColor: colors.background,
              borderTopColor: colors.border,
            },
          ]}
        >
          {isRecording ? (
            /* Recording UI - Professional design with live waveform */
            <View style={styles.recordingWrapper}>
              <TouchableOpacity
                style={styles.cancelRecordingButton}
                onPress={cancelRecording}
              >
                <Ionicons name="trash-outline" size={22} color={colors.error} />
              </TouchableOpacity>

              <View style={styles.recordingCenter}>
                {/* Live waveform visualization */}
                <View style={styles.liveWaveform}>
                  {Array.from({ length: 20 }).map((_, i) => {
                    // Разные бары реагируют с разной чувствительностью
                    const sensitivity = 1 - Math.abs(i - 10) / 12;
                    const jitter = Math.sin(Date.now() / 200 + i * 0.5) * 0.05;
                    const height =
                      3 + (liveMetering * sensitivity + jitter) * 20;
                    return (
                      <View
                        key={i}
                        style={[
                          styles.liveWaveBar,
                          {
                            height: Math.max(3, Math.min(24, height)),
                            backgroundColor: colors.primary,
                            opacity: 0.4 + liveMetering * 0.6,
                          },
                        ]}
                      />
                    );
                  })}
                </View>

                <View style={styles.recordingIndicator}>
                  <Animated.View
                    style={[
                      styles.recordingDot,
                      { transform: [{ scale: recordButtonScale }] },
                    ]}
                  />
                  <Text
                    style={[
                      styles.recordingText,
                      { color: colors.textPrimary },
                    ]}
                  >
                    {Math.floor(recordingDuration / 60)}:
                    {(recordingDuration % 60).toString().padStart(2, "0")}
                  </Text>
                </View>
              </View>

              {/* Send Recording Button */}
              <TouchableOpacity
                style={[
                  styles.sendRecordingButton,
                  { backgroundColor: colors.primary },
                ]}
                onPress={stopRecording}
              >
                <Ionicons name="send" size={20} color="#fff" />
              </TouchableOpacity>
            </View>
          ) : (
            /* Normal Input UI */
            <>
              {/* Plus/Attach Button */}
              <TouchableOpacity
                style={styles.attachButton}
                onPress={openMediaPicker}
                disabled={uploading}
              >
                {uploading ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : (
                  <Ionicons name="add" size={26} color={colors.primary} />
                )}
              </TouchableOpacity>

              <View
                style={[
                  styles.inputWrapper,
                  { backgroundColor: colors.inputBackground },
                ]}
              >
                <TextInput
                  style={[styles.input, { color: colors.text }]}
                  value={newMessage}
                  onChangeText={(text) => {
                    setNewMessage(text);
                    if (text.trim()) {
                      sendTypingIndicator(true);
                    }
                  }}
                  onBlur={() => sendTypingIndicator(false)}
                  placeholder="Сообщение..."
                  placeholderTextColor={colors.textMuted}
                  multiline
                  maxLength={1000}
                />
              </View>

              {/* Send or Mic Button */}
              {newMessage.trim() || editingMessage ? (
                <TouchableOpacity
                  style={[
                    styles.sendButton,
                    {
                      backgroundColor: editingMessage
                        ? "#4CAF50"
                        : colors.primary,
                    },
                  ]}
                  onPress={sendMessage}
                  disabled={sending}
                  activeOpacity={0.7}
                >
                  {sending ? (
                    <ActivityIndicator size="small" color={colors.textLight} />
                  ) : (
                    <Ionicons
                      name={editingMessage ? "checkmark" : "send"}
                      size={20}
                      color={colors.textLight}
                    />
                  )}
                </TouchableOpacity>
              ) : (
                <Pressable
                  onPressIn={onMicPressIn}
                  onPressOut={onMicPressOut}
                  style={[
                    styles.micButton,
                    { backgroundColor: colors.primary },
                  ]}
                >
                  <Animated.View
                    style={{ transform: [{ scale: recordButtonScale }] }}
                  >
                    <Ionicons name="mic" size={24} color={colors.textLight} />
                  </Animated.View>
                </Pressable>
              )}
            </>
          )}
        </View>
      )}

      {/* Media Picker Modal - WhatsApp Style */}
      <Modal
        visible={showMediaPicker}
        transparent
        animationType="none"
        onRequestClose={closeMediaPicker}
      >
        <Pressable style={styles.mediaPickerOverlay} onPress={closeMediaPicker}>
          <Animated.View
            style={[
              styles.mediaPickerContainer,
              {
                backgroundColor: isDark ? "#1F2C34" : "#FFFFFF",
                transform: [
                  {
                    translateY: mediaPickerAnimation.interpolate({
                      inputRange: [0, 1],
                      outputRange: [300, 0],
                    }),
                  },
                ],
                opacity: mediaPickerAnimation,
              },
            ]}
          >
            <View
              style={[
                styles.mediaPickerHandle,
                { backgroundColor: isDark ? "#3B4A54" : "#D1D5DB" },
              ]}
            />

            <View style={styles.mediaPickerGrid}>
              {/* Документ */}
              <TouchableOpacity
                style={styles.mediaPickerItem}
                onPress={() => {
                  closeMediaPicker();
                  setTimeout(handlePickDocument, 200);
                }}
              >
                <View
                  style={[
                    styles.mediaPickerIconCircle,
                    { backgroundColor: isDark ? "#2A3942" : "#F3F4F6" },
                  ]}
                >
                  <Ionicons name="document-text" size={26} color="#7C4DFF" />
                </View>
                <Text
                  style={[
                    styles.mediaPickerLabel,
                    { color: isDark ? "#8696A0" : "#667781" },
                  ]}
                >
                  Документ
                </Text>
              </TouchableOpacity>

              {/* Камера */}
              <TouchableOpacity
                style={styles.mediaPickerItem}
                onPress={() => {
                  closeMediaPicker();
                  setTimeout(handleTakePhoto, 200);
                }}
              >
                <View
                  style={[
                    styles.mediaPickerIconCircle,
                    { backgroundColor: isDark ? "#2A3942" : "#F3F4F6" },
                  ]}
                >
                  <Ionicons name="camera" size={26} color="#FF5252" />
                </View>
                <Text
                  style={[
                    styles.mediaPickerLabel,
                    { color: isDark ? "#8696A0" : "#667781" },
                  ]}
                >
                  Камера
                </Text>
              </TouchableOpacity>

              {/* Галерея */}
              <TouchableOpacity
                style={styles.mediaPickerItem}
                onPress={() => {
                  closeMediaPicker();
                  setTimeout(handlePickMedia, 200);
                }}
              >
                <View
                  style={[
                    styles.mediaPickerIconCircle,
                    { backgroundColor: isDark ? "#2A3942" : "#F3F4F6" },
                  ]}
                >
                  <Ionicons name="image" size={26} color="#FF9500" />
                </View>
                <Text
                  style={[
                    styles.mediaPickerLabel,
                    { color: isDark ? "#8696A0" : "#667781" },
                  ]}
                >
                  Галерея
                </Text>
              </TouchableOpacity>

              {/* Аудио */}
              <TouchableOpacity
                style={styles.mediaPickerItem}
                onPress={() => {
                  closeMediaPicker();
                  setTimeout(handleRecordAudio, 200);
                }}
              >
                <View
                  style={[
                    styles.mediaPickerIconCircle,
                    { backgroundColor: isDark ? "#2A3942" : "#F3F4F6" },
                  ]}
                >
                  <Ionicons name="headset" size={26} color="#FF9800" />
                </View>
                <Text
                  style={[
                    styles.mediaPickerLabel,
                    { color: isDark ? "#8696A0" : "#667781" },
                  ]}
                >
                  Аудио
                </Text>
              </TouchableOpacity>

              {/* Местоположение */}
              <TouchableOpacity
                style={styles.mediaPickerItem}
                onPress={() => {
                  closeMediaPicker();
                  setTimeout(handleSendLocation, 200);
                }}
              >
                <View
                  style={[
                    styles.mediaPickerIconCircle,
                    { backgroundColor: isDark ? "#2A3942" : "#F3F4F6" },
                  ]}
                >
                  <Ionicons name="location" size={26} color="#53BDEB" />
                </View>
                <Text
                  style={[
                    styles.mediaPickerLabel,
                    { color: isDark ? "#8696A0" : "#667781" },
                  ]}
                >
                  Локация
                </Text>
              </TouchableOpacity>

              {/* Контакт (placeholder) */}
              <TouchableOpacity
                style={styles.mediaPickerItem}
                onPress={() => {
                  closeMediaPicker();
                  Alert.alert(
                    "Скоро",
                    "Отправка контактов скоро будет доступна",
                  );
                }}
              >
                <View
                  style={[
                    styles.mediaPickerIconCircle,
                    { backgroundColor: isDark ? "#2A3942" : "#F3F4F6" },
                  ]}
                >
                  <Ionicons name="person" size={26} color="#0088CC" />
                </View>
                <Text
                  style={[
                    styles.mediaPickerLabel,
                    { color: isDark ? "#8696A0" : "#667781" },
                  ]}
                >
                  Контакт
                </Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
        </Pressable>
      </Modal>

      {/* Reaction Users Modal - кто поставил реакции */}
      <ReactionUsersModal
        visible={showReactionUsers}
        reaction={selectedReactionForUsers}
        allReactions={allReactionsForModal}
        onClose={() => setShowReactionUsers(false)}
        onReactionSelect={(emoji: string) => {
          if (selectedMessage) {
            toggleReaction(selectedMessage.id, emoji);
          }
          setShowReactionUsers(false);
        }}
      />

      {/* Message Context Menu Modal - Telegram Style */}
      <Modal
        visible={showMessageMenu}
        transparent
        animationType="fade"
        onRequestClose={closeMessageMenu}
      >
        <Pressable style={styles.blurMenuOverlay} onPress={closeMessageMenu}>
          <BlurView
            intensity={isDark ? 40 : 60}
            tint={isDark ? "dark" : "light"}
            style={StyleSheet.absoluteFill}
          />

          {selectedMessage && (
            <View style={styles.blurMenuContent}>
              {/* Quick Reactions Bar - вверху */}
              <Animated.View
                style={[
                  styles.blurReactionsBar,
                  { backgroundColor: colors.card },
                  {
                    opacity: quickReactionAnimation,
                    transform: [
                      {
                        scale: quickReactionAnimation.interpolate({
                          inputRange: [0, 1],
                          outputRange: [0.8, 1],
                        }),
                      },
                    ],
                  },
                ]}
              >
                <QuickReactionBar
                  onSelect={handleQuickReactionSelect}
                  selectedEmoji={
                    selectedMessage.reactions?.find((r) => r.hasReacted)?.emoji
                  }
                />
              </Animated.View>

              {/* Message Preview - по центру */}
              <Pressable onPress={(e) => e.stopPropagation()}>
                <View
                  style={[
                    styles.blurMessageContainer,
                    {
                      backgroundColor:
                        selectedMessage.sender_id === user?.id
                          ? colors.primary
                          : colors.card,
                      alignSelf:
                        selectedMessage.sender_id === user?.id
                          ? "flex-end"
                          : "flex-start",
                    },
                  ]}
                >
                  {/* Медиа контент */}
                  {selectedMessage.media_url && (
                    <View style={styles.blurMessageMedia}>
                      {selectedMessage.media_type === "image" && (
                        <Image
                          source={{ uri: selectedMessage.media_url }}
                          style={styles.blurMessageImage}
                          resizeMode="cover"
                        />
                      )}
                      {selectedMessage.media_type === "video" && (
                        <View style={styles.blurMessageVideoPlaceholder}>
                          <Ionicons name="play-circle" size={40} color="#fff" />
                        </View>
                      )}
                    </View>
                  )}

                  {/* Текст сообщения */}
                  {selectedMessage.content && (
                    <Text
                      style={[
                        styles.blurMessageText,
                        {
                          color:
                            selectedMessage.sender_id === user?.id
                              ? "#FFFFFF"
                              : colors.text,
                        },
                      ]}
                    >
                      {selectedMessage.content}
                    </Text>
                  )}

                  {/* Время */}
                  <Text
                    style={[
                      styles.blurMessageTime,
                      {
                        color:
                          selectedMessage.sender_id === user?.id
                            ? "rgba(255,255,255,0.7)"
                            : colors.textSecondary,
                      },
                    ]}
                  >
                    {new Date(selectedMessage.created_at).toLocaleTimeString(
                      [],
                      {
                        hour: "2-digit",
                        minute: "2-digit",
                      },
                    )}
                  </Text>
                </View>
              </Pressable>

              {/* Action Buttons - внизу */}
              <View
                style={[
                  styles.blurActionsContainer,
                  { backgroundColor: colors.card },
                ]}
              >
                {/* Ответить */}
                <TouchableOpacity
                  style={styles.blurActionItem}
                  onPress={() => handleMenuAction("reply")}
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name="arrow-undo-outline"
                    size={24}
                    color={isDark ? "#A5D6A7" : "#43A047"}
                  />
                  <Text style={[styles.blurActionText, { color: colors.text }]}>
                    Ответить
                  </Text>
                </TouchableOpacity>

                {/* Копировать */}
                {selectedMessage.content && (
                  <TouchableOpacity
                    style={styles.blurActionItem}
                    onPress={() => handleMenuAction("copy")}
                    activeOpacity={0.7}
                  >
                    <Ionicons
                      name="copy-outline"
                      size={24}
                      color={isDark ? "#90CAF9" : "#1976D2"}
                    />
                    <Text
                      style={[styles.blurActionText, { color: colors.text }]}
                    >
                      Копировать
                    </Text>
                  </TouchableOpacity>
                )}

                {/* Редактировать */}
                {selectedMessage.sender_id === user?.id &&
                  selectedMessage.content && (
                    <TouchableOpacity
                      style={styles.blurActionItem}
                      onPress={() => handleMenuAction("edit")}
                      activeOpacity={0.7}
                    >
                      <Ionicons
                        name="pencil-outline"
                        size={24}
                        color={isDark ? "#CE93D8" : "#8E24AA"}
                      />
                      <Text
                        style={[styles.blurActionText, { color: colors.text }]}
                      >
                        Изменить
                      </Text>
                    </TouchableOpacity>
                  )}

                {/* Закрепить */}
                <TouchableOpacity
                  style={styles.blurActionItem}
                  onPress={() => handleMenuAction("pin")}
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name={
                      pinnedMessages.some(
                        (p) => p.message.id === selectedMessage.id,
                      )
                        ? "bookmark"
                        : "bookmark-outline"
                    }
                    size={24}
                    color={
                      pinnedMessages.some(
                        (p) => p.message.id === selectedMessage.id,
                      )
                        ? isDark
                          ? "#FFB74D"
                          : "#F57C00"
                        : isDark
                          ? "#90CAF9"
                          : "#1976D2"
                    }
                  />
                  <Text style={[styles.blurActionText, { color: colors.text }]}>
                    {pinnedMessages.some(
                      (p) => p.message.id === selectedMessage.id,
                    )
                      ? "Открепить"
                      : "Закрепить"}
                  </Text>
                </TouchableOpacity>

                {/* Удалить */}
                {selectedMessage.sender_id === user?.id && (
                  <TouchableOpacity
                    style={styles.blurActionItem}
                    onPress={() => handleMenuAction("delete")}
                    activeOpacity={0.7}
                  >
                    <Ionicons
                      name="trash-outline"
                      size={24}
                      color={isDark ? "#EF9A9A" : "#E53935"}
                    />
                    <Text
                      style={[
                        styles.blurActionText,
                        { color: isDark ? "#EF9A9A" : "#E53935" },
                      ]}
                    >
                      Удалить
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          )}
        </Pressable>
      </Modal>

      {/* Pin Options Modal */}
      <Modal
        visible={showPinOptions}
        transparent
        animationType="none"
        onRequestClose={hidePinOptionsMenu}
      >
        <Pressable style={styles.menuOverlay} onPress={hidePinOptionsMenu}>
          <Animated.View
            style={[
              styles.pinOptionsContainer,
              {
                transform: [
                  {
                    scale: pinOptionsAnimation.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.9, 1],
                    }),
                  },
                ],
                opacity: pinOptionsAnimation,
              },
            ]}
          >
            <View style={styles.pinOptionsHeader}>
              <Ionicons name="bookmark" size={28} color={colors.primary} />
              <Text style={styles.pinOptionsTitle}>Закрепить сообщение</Text>
            </View>

            <Text style={styles.pinOptionsDescription}>
              Выберите, кто увидит закреплённое сообщение
            </Text>

            <TouchableOpacity
              style={styles.pinOptionButton}
              onPress={() => handlePinOption(false)}
              activeOpacity={0.7}
            >
              <View
                style={[
                  styles.pinOptionIcon,
                  { backgroundColor: colors.primary },
                ]}
              >
                <Ionicons name="people" size={22} color="#fff" />
              </View>
              <View style={styles.pinOptionTextContainer}>
                <Text style={styles.pinOptionTitle}>Для всех</Text>
                <Text style={styles.pinOptionSubtitle}>
                  Все участники увидят это закреплённое сообщение
                </Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.pinOptionButton}
              onPress={() => handlePinOption(true)}
              activeOpacity={0.7}
            >
              <View
                style={[styles.pinOptionIcon, { backgroundColor: "#FF9500" }]}
              >
                <Ionicons name="person" size={22} color="#fff" />
              </View>
              <View style={styles.pinOptionTextContainer}>
                <Text style={styles.pinOptionTitle}>Только для меня</Text>
                <Text style={styles.pinOptionSubtitle}>
                  Только вы увидите это закреплённое сообщение
                </Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.pinOptionCancelButton}
              onPress={hidePinOptionsMenu}
              activeOpacity={0.7}
            >
              <Text style={styles.pinOptionCancelText}>Отмена</Text>
            </TouchableOpacity>
          </Animated.View>
        </Pressable>
      </Modal>

      {/* Fullscreen Media Viewer */}
      <Modal
        visible={!!fullscreenMedia}
        transparent
        animationType="fade"
        onRequestClose={() => setFullscreenMedia(null)}
      >
        <View style={styles.fullscreenOverlay}>
          <TouchableOpacity
            style={styles.fullscreenCloseButton}
            onPress={() => setFullscreenMedia(null)}
          >
            <Ionicons name="close" size={28} color="#fff" />
          </TouchableOpacity>

          {fullscreenMedia?.type === "image" && (
            <Image
              source={{ uri: fullscreenMedia.url }}
              style={styles.fullscreenImage}
              resizeMode="contain"
            />
          )}

          {fullscreenMedia?.type === "video" && Platform.OS !== "web" && (
            <Video
              source={{ uri: fullscreenMedia.url }}
              style={styles.fullscreenVideo}
              useNativeControls
              resizeMode={ResizeMode.CONTAIN}
              shouldPlay
            />
          )}
        </View>
      </Modal>

      {/* Document Viewer Modal */}
      <Modal
        visible={!!documentViewer}
        animationType="slide"
        onRequestClose={() => setDocumentViewer(null)}
      >
        <View
          style={[
            styles.documentViewerContainer,
            { backgroundColor: isDark ? "#111B21" : "#fff" },
          ]}
        >
          {/* Header */}
          <View
            style={[
              styles.documentViewerHeader,
              { backgroundColor: isDark ? "#1F2C34" : colors.primary },
            ]}
          >
            <TouchableOpacity
              style={styles.documentViewerBackButton}
              onPress={() => setDocumentViewer(null)}
            >
              <Ionicons name="arrow-back" size={24} color="#fff" />
            </TouchableOpacity>
            <View style={styles.documentViewerTitleContainer}>
              <Text style={styles.documentViewerTitle} numberOfLines={1}>
                {documentViewer?.name}
              </Text>
            </View>
            <View style={styles.documentViewerActions}>
              <TouchableOpacity
                style={styles.documentViewerActionButton}
                onPress={async () => {
                  if (!documentViewer) return;
                  if (Platform.OS === "web") {
                    window.open(documentViewer.url, "_blank");
                  } else {
                    try {
                      // Скачать и поделиться файлом
                      const fileUri =
                        FileSystem.cacheDirectory + documentViewer.name;
                      const downloadResult = await FileSystem.downloadAsync(
                        documentViewer.url,
                        fileUri,
                      );
                      if (await Sharing.isAvailableAsync()) {
                        await Sharing.shareAsync(downloadResult.uri);
                      } else {
                        Linking.openURL(documentViewer.url);
                      }
                    } catch (e) {
                      Linking.openURL(documentViewer.url);
                    }
                  }
                }}
              >
                <Ionicons name="share-outline" size={22} color="#fff" />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.documentViewerActionButton}
                onPress={() => {
                  if (documentViewer) {
                    if (Platform.OS === "web") {
                      window.open(documentViewer.url, "_blank");
                    } else {
                      Linking.openURL(documentViewer.url);
                    }
                  }
                }}
              >
                <Ionicons name="open-outline" size={22} color="#fff" />
              </TouchableOpacity>
            </View>
          </View>

          {/* Document Content */}
          {documentLoading && (
            <View style={styles.documentViewerLoading}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text
                style={[
                  styles.documentViewerLoadingText,
                  { color: colors.textSecondary },
                ]}
              >
                Загрузка документа...
              </Text>
            </View>
          )}

          {documentViewer && Platform.OS !== "web" && (
            <WebView
              source={{
                uri: `https://docs.google.com/gview?embedded=true&url=${encodeURIComponent(documentViewer.url)}`,
              }}
              style={styles.documentViewerWebView}
              onLoadStart={() => setDocumentLoading(true)}
              onLoadEnd={() => setDocumentLoading(false)}
              onError={() => {
                setDocumentLoading(false);
                Alert.alert(
                  "Ошибка",
                  "Не удалось загрузить документ. Открыть в браузере?",
                  [
                    { text: "Отмена", style: "cancel" },
                    {
                      text: "Открыть",
                      onPress: () => {
                        Linking.openURL(documentViewer.url);
                        setDocumentViewer(null);
                      },
                    },
                  ],
                );
              }}
              startInLoadingState
              javaScriptEnabled
              domStorageEnabled
            />
          )}

          {documentViewer && Platform.OS === "web" && (
            <iframe
              src={`https://docs.google.com/gview?embedded=true&url=${encodeURIComponent(documentViewer.url)}`}
              style={{ flex: 1, border: "none", width: "100%", height: "100%" }}
              onLoad={() => setDocumentLoading(false)}
            />
          )}
        </View>
      </Modal>

      {/* Avatar Viewer Modal */}
      <Modal
        visible={showAvatarViewer}
        transparent
        animationType="fade"
        onRequestClose={() => setShowAvatarViewer(false)}
      >
        <View style={styles.avatarViewerOverlay}>
          <TouchableOpacity
            style={styles.avatarViewerCloseButton}
            onPress={() => setShowAvatarViewer(false)}
          >
            <Ionicons name="close" size={28} color="#fff" />
          </TouchableOpacity>

          {isGroup ? (
            chatAvatarUrl ? (
              <Image
                source={{ uri: chatAvatarUrl }}
                style={styles.avatarViewerImage}
                resizeMode="contain"
              />
            ) : (
              <View
                style={[
                  styles.avatarViewerPlaceholder,
                  { backgroundColor: groupAvatarColor },
                ]}
              >
                <Ionicons name="people" size={80} color={colors.textLight} />
              </View>
            )
          ) : otherUser?.avatar_url ? (
            <Image
              source={{ uri: otherUser.avatar_url }}
              style={styles.avatarViewerImage}
              resizeMode="contain"
            />
          ) : (
            <View
              style={[
                styles.avatarViewerPlaceholder,
                { backgroundColor: avatarColor },
              ]}
            >
              <Text style={styles.avatarViewerPlaceholderText}>
                {chatName.charAt(0).toUpperCase()}
              </Text>
            </View>
          )}

          <View style={styles.avatarViewerInfo}>
            <Text style={styles.avatarViewerName}>{chatName}</Text>
            {isGroup ? (
              <Text style={styles.avatarViewerSubtitle}>
                {memberCount} участник
                {memberCount === 1 ? "" : memberCount < 5 ? "а" : "ов"}
              </Text>
            ) : (
              <Text
                style={[
                  styles.avatarViewerSubtitle,
                  isOnline && { color: "#81C784" },
                ]}
              >
                {formatLastSeen()}
              </Text>
            )}
          </View>

          <TouchableOpacity
            style={styles.avatarViewerActionButton}
            onPress={() => {
              setShowAvatarViewer(false);
              if (isGroup) {
                router.push(`/group/${id}/settings` as any);
              } else if (otherUser?.id) {
                router.push(`/profile/${otherUser.id}` as any);
              }
            }}
          >
            <Ionicons
              name={isGroup ? "settings-outline" : "person-outline"}
              size={20}
              color="#fff"
            />
            <Text style={styles.avatarViewerActionText}>
              {isGroup ? "Настройки группы" : "Открыть профиль"}
            </Text>
          </TouchableOpacity>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingTop: 50,
    paddingBottom: 12,
    paddingHorizontal: 16,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 8,
  },
  headerProfile: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  avatarWrapper: {
    position: "relative",
    marginRight: 12,
  },
  headerAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    justifyContent: "center",
    alignItems: "center",
  },
  headerAvatarImage: {
    width: 42,
    height: 42,
    borderRadius: 21,
  },
  onlineIndicator: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: "#4CAF50",
    borderWidth: 2,
  },
  headerAvatarText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "600",
  },
  headerInfo: {
    flex: 1,
  },
  headerName: {
    fontSize: 18,
    fontWeight: "600",
    color: "#fff",
  },
  headerStatus: {
    fontSize: 13,
    color: "rgba(255,255,255,0.8)",
    marginTop: 2,
  },
  headerStatusOnline: {
    color: "#81C784",
    fontWeight: "500",
  },
  headerSettingsButton: {
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
    marginLeft: 8,
  },
  messagesContainer: {
    flex: 1,
  },
  messagesList: {
    padding: 16,
    flexGrow: 1,
    justifyContent: "flex-end",
  },
  scrollToBottomButton: {
    position: "absolute",
    right: 16,
    bottom: 8,
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
    zIndex: 10,
  },
  dateSeparator: {
    alignItems: "center",
    marginVertical: 16,
  },
  dateSeparatorText: {
    backgroundColor: "rgba(0,0,0,0.1)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    fontSize: 13,
  },
  messageContainer: {
    marginBottom: 4,
  },
  myMessageContainer: {
    alignItems: "flex-end",
  },
  otherMessageContainer: {
    alignItems: "flex-start",
  },
  messageBubble: {
    maxWidth: "75%",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 18,
  },
  myMessageBubble: {
    borderBottomRightRadius: 4,
  },
  otherMessageBubble: {
    borderBottomLeftRadius: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  senderName: {
    fontSize: 13,
    fontWeight: "600",
    marginBottom: 4,
  },
  messageText: {
    fontSize: 16,
    lineHeight: 22,
  },
  linkText: {
    textDecorationLine: "underline",
  },
  myMessageText: {},
  otherMessageText: {},
  messageTime: {
    fontSize: 11,
    marginTop: 4,
    alignSelf: "flex-end",
  },
  myMessageTime: {},
  otherMessageTime: {},
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingTop: 100,
  },
  emptyIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "rgba(255,255,255,0.9)",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: "600",
  },
  emptySubtext: {
    fontSize: 14,
    marginTop: 4,
  },
  inputContainer: {
    flexDirection: "row",
    padding: 8,
    paddingBottom: 24,
    alignItems: "flex-end",
    borderTopWidth: 1,
  },
  blockedBanner: {
    padding: 12,
    paddingBottom: 24,
    borderTopWidth: 1,
  },
  blockedContent: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderRadius: 12,
    gap: 12,
  },
  blockedTextContainer: {
    flex: 1,
  },
  blockedTitle: {
    fontSize: 15,
    fontWeight: "600",
  },
  blockedSubtitle: {
    fontSize: 13,
    marginTop: 2,
  },
  unblockButton: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  unblockButtonText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "600",
  },
  attachButton: {
    width: 44,
    height: 44,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 4,
  },
  inputWrapper: {
    flex: 1,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "transparent",
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginRight: 8,
  },
  input: {
    fontSize: 16,
    maxHeight: 100,
  },
  sendButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: "center",
    alignItems: "center",
  },
  sendButtonDisabled: {},
  editSendButton: {
    backgroundColor: "#4CAF50",
  },
  sendIcon: {
    color: "#fff",
    fontSize: 20,
  },
  // Media styles
  mediaBubble: {
    padding: 4,
    overflow: "hidden",
  },
  mediaImage: {
    width: Dimensions.get("window").width * 0.6,
    height: Dimensions.get("window").width * 0.6,
    borderRadius: 14,
    marginBottom: 4,
  },
  mediaVideo: {
    width: Dimensions.get("window").width * 0.6,
    height: Dimensions.get("window").width * 0.45,
    borderRadius: 14,
    marginBottom: 4,
    backgroundColor: "#000",
  },
  audioContainer: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 10,
    minWidth: 200,
  },
  myAudioContainer: {
    backgroundColor: "transparent",
  },
  otherAudioContainer: {
    backgroundColor: "transparent",
  },
  audioPlayButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 10,
  },
  audioWaveform: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    height: 30,
    gap: 2,
  },
  audioWaveBar: {
    width: 3,
    borderRadius: 1.5,
  },
  myAudioWaveBar: {
    backgroundColor: "rgba(255,255,255,0.6)",
  },
  otherAudioWaveBar: {
    opacity: 0.5,
  },
  audioWaveBarActive: {
    opacity: 1,
  },
  audioDuration: {
    fontSize: 12,
    marginLeft: 8,
  },
  myAudioDuration: {
    color: "rgba(255,255,255,0.8)",
  },
  otherAudioDuration: {},
  audioText: {
    marginLeft: 10,
    fontSize: 14,
  },
  // Location message styles
  locationContainer: {
    width: 280,
    borderRadius: 12,
    overflow: "hidden",
    marginBottom: 4,
  },
  locationMap: {
    width: "100%",
    height: 150,
  },
  locationInfo: {
    padding: 10,
  },
  locationHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  locationTitle: {
    fontSize: 15,
    fontWeight: "600",
    flex: 1,
  },
  locationCoords: {
    fontSize: 12,
    marginTop: 2,
  },
  // File/Document message styles
  fileContainer: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: 12,
    gap: 12,
    marginBottom: 4,
  },
  fileIcon: {
    width: 44,
    height: 44,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
  },
  fileInfo: {
    flex: 1,
  },
  fileName: {
    fontSize: 14,
    fontWeight: "600",
  },
  fileSize: {
    fontSize: 12,
    marginTop: 2,
  },
  // Attach menu styles
  attachMenu: {
    flexDirection: "row",
    justifyContent: "space-evenly",
    alignItems: "flex-start",
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderTopWidth: 1,
  },
  attachMenuItem: {
    alignItems: "center",
    width: 56,
  },
  attachMenuIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 4,
  },
  attachMenuText: {
    fontSize: 10,
    textAlign: "center",
  },
  // Recording styles
  recordingIndicator: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  recordingDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: "#ff3b30",
    marginRight: 10,
  },
  recordingText: {
    fontSize: 18,
    fontWeight: "600",
  },
  cancelRecordingButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: "center",
    alignItems: "center",
  },
  stopRecordingButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#ff3b30",
    justifyContent: "center",
    alignItems: "center",
  },
  // Editing styles
  editingContainer: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderLeftWidth: 3,
  },
  editingInfo: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
  },
  editingLabel: {
    fontSize: 14,
    fontWeight: "600",
    marginLeft: 8,
    marginRight: 8,
  },
  editingText: {
    flex: 1,
    fontSize: 14,
  },
  editingCancel: {
    padding: 4,
  },
  editedLabel: {
    fontSize: 11,
    fontStyle: "italic",
    marginTop: 2,
  },
  // Reply styles
  replyContainer: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderTopWidth: 1,
  },
  replyInfo: {
    flex: 1,
    borderLeftWidth: 3,
    borderLeftColor: "#FF9500",
    paddingLeft: 10,
  },
  replyLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: "#FF9500",
    marginBottom: 2,
  },
  replyText: {
    fontSize: 13,
  },
  replyCancel: {
    padding: 4,
  },
  // Replied message in bubble
  repliedMessageContainer: {
    backgroundColor: "rgba(0, 0, 0, 0.05)",
    borderRadius: 8,
    padding: 8,
    marginBottom: 6,
    borderLeftWidth: 2,
    borderLeftColor: "#FF9500",
  },
  repliedMessageContainerMy: {
    backgroundColor: "rgba(255, 255, 255, 0.15)",
  },
  repliedMessageSender: {
    fontSize: 12,
    fontWeight: "600",
    color: "#FF9500",
    marginBottom: 2,
  },
  repliedMessageText: {
    fontSize: 12,
  },
  repliedMessageTextMy: {
    color: "rgba(255, 255, 255, 0.8)",
  },
  // Message Menu styles
  menuOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "flex-end",
  },
  menuContainer: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 34,
    paddingTop: 8,
  },
  menuHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: 16,
  },
  quickReactionsContainer: {
    alignItems: "center",
    marginBottom: 12,
  },
  menuPreview: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 12,
  },
  menuPreviewText: {
    fontSize: 14,
  },
  menuActions: {
    paddingHorizontal: 16,
  },
  menuActionItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
  },
  menuActionIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 14,
  },
  menuActionText: {
    fontSize: 16,
    fontWeight: "500",
  },
  menuCancelButton: {
    marginTop: 12,
    marginHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  menuCancelText: {
    fontSize: 16,
    fontWeight: "600",
  },
  // Hold-to-record & Media picker styles
  plusButton: {
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 8,
  },
  micButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
  },
  recordingContainer: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginRight: 10,
  },
  recordingTime: {
    fontSize: 16,
    fontWeight: "500",
    marginRight: 12,
  },
  recordingHint: {
    fontSize: 13,
    flex: 1,
  },
  mediaPickerOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.4)",
    justifyContent: "flex-end",
  },
  mediaPickerContainer: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 32,
    paddingTop: 8,
    paddingHorizontal: 16,
  },
  mediaPickerHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: 20,
  },
  mediaPickerTitle: {
    fontSize: 18,
    fontWeight: "600",
    textAlign: "center",
    marginBottom: 24,
  },
  mediaPickerGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "flex-start",
    paddingHorizontal: 8,
  },
  mediaPickerItem: {
    width: "33.33%",
    alignItems: "center",
    marginBottom: 24,
  },
  mediaPickerIconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 8,
  },
  mediaPickerIcon: {
    width: 52,
    height: 52,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 6,
  },
  mediaPickerLabel: {
    fontSize: 12,
    textAlign: "center",
    fontWeight: "500",
  },
  mediaPickerCancel: {
    marginHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 8,
  },
  mediaPickerCancelText: {
    fontSize: 16,
    fontWeight: "600",
  },
  // Recording wrapper for better UI
  recordingWrapper: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 4,
  },
  recordingCenter: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    marginHorizontal: 8,
  },
  liveWaveform: {
    flexDirection: "row",
    alignItems: "center",
    height: 28,
    gap: 2,
    marginBottom: 4,
  },
  liveWaveBar: {
    width: 3,
    borderRadius: 1.5,
  },
  sendRecordingButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
  },
  // Fullscreen media viewer
  fullscreenOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.95)",
    justifyContent: "center",
    alignItems: "center",
  },
  fullscreenCloseButton: {
    position: "absolute",
    top: 50,
    right: 20,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 10,
  },
  fullscreenImage: {
    width: Dimensions.get("window").width,
    height: Dimensions.get("window").height * 0.8,
  },
  fullscreenVideo: {
    width: Dimensions.get("window").width,
    height: Dimensions.get("window").height * 0.7,
  },
  // Document Viewer
  documentViewerContainer: {
    flex: 1,
  },
  documentViewerHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingTop: Platform.OS === "ios" ? 50 : 10,
    paddingBottom: 10,
    paddingHorizontal: 8,
  },
  documentViewerBackButton: {
    width: 44,
    height: 44,
    justifyContent: "center",
    alignItems: "center",
  },
  documentViewerTitleContainer: {
    flex: 1,
    marginHorizontal: 8,
  },
  documentViewerTitle: {
    fontSize: 17,
    fontWeight: "600",
    color: "#fff",
  },
  documentViewerActions: {
    flexDirection: "row",
    alignItems: "center",
  },
  documentViewerActionButton: {
    width: 44,
    height: 44,
    justifyContent: "center",
    alignItems: "center",
  },
  documentViewerWebView: {
    flex: 1,
  },
  documentViewerLoading: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: "center",
    alignItems: "center",
    zIndex: 5,
  },
  documentViewerLoadingText: {
    marginTop: 12,
    fontSize: 14,
  },
  // Avatar Viewer
  avatarViewerOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.95)",
    justifyContent: "center",
    alignItems: "center",
  },
  avatarViewerCloseButton: {
    position: "absolute",
    top: Platform.OS === "ios" ? 60 : 20,
    right: 20,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.2)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 10,
  },
  avatarViewerImage: {
    width: "90%",
    height: "60%",
    borderRadius: 8,
  },
  avatarViewerPlaceholder: {
    width: 200,
    height: 200,
    borderRadius: 100,
    justifyContent: "center",
    alignItems: "center",
  },
  avatarViewerPlaceholderText: {
    fontSize: 72,
    fontWeight: "700",
    color: "#fff",
  },
  avatarViewerInfo: {
    marginTop: 24,
    alignItems: "center",
  },
  avatarViewerName: {
    fontSize: 22,
    fontWeight: "700",
    color: "#fff",
    marginBottom: 4,
  },
  avatarViewerSubtitle: {
    fontSize: 15,
    color: "rgba(255,255,255,0.7)",
  },
  avatarViewerActionButton: {
    position: "absolute",
    bottom: Platform.OS === "ios" ? 60 : 30,
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 20,
    backgroundColor: "rgba(255,255,255,0.2)",
    borderRadius: 24,
    gap: 8,
  },
  avatarViewerActionText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#fff",
  },
  // Typing indicator styles
  typingContainer: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 8,
  },
  typingAvatars: {
    flexDirection: "row",
    alignItems: "center",
  },
  typingAvatarWrapper: {
    marginLeft: -8,
  },
  typingAvatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
  },
  typingAvatarPlaceholder: {
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
  },
  typingAvatarText: {
    fontSize: 10,
    fontWeight: "600",
    color: "#fff",
  },
  typingBubble: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    gap: 6,
  },
  typingDots: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  typingDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  typingText: {
    fontSize: 13,
    marginLeft: 4,
  },
  // Pinned message styles
  pinnedBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    zIndex: 10,
  },
  pinnedContent: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  pinnedIconContainer: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
  },
  pinnedTextContainer: {
    flex: 1,
  },
  pinnedLabel: {
    fontSize: 12,
    fontWeight: "600",
    marginBottom: 2,
  },
  pinnedMessageText: {
    fontSize: 14,
  },
  pinnedAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  pinnedAvatarPlaceholder: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
  },
  pinnedAvatarText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#fff",
  },
  pinnedCloseButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
    marginLeft: 8,
  },
  // Pinned navigation styles
  pinnedNavigation: {
    alignItems: "center",
    marginRight: 10,
  },
  pinnedNavButton: {
    padding: 2,
  },
  pinnedCounter: {
    fontSize: 11,
    fontWeight: "600",
    marginVertical: 2,
  },
  pinnedIconPersonal: {
    backgroundColor: "rgba(255, 149, 0, 0.15)",
  },
  // Pin options modal styles
  pinOptionsContainer: {
    borderRadius: 20,
    padding: 20,
    marginHorizontal: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 10,
  },
  pinOptionsHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
    gap: 10,
  },
  pinOptionsTitle: {
    fontSize: 20,
    fontWeight: "700",
  },
  pinOptionsDescription: {
    fontSize: 14,
    textAlign: "center",
    marginBottom: 20,
  },
  pinOptionButton: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    gap: 14,
  },
  pinOptionIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
  },
  pinOptionTextContainer: {
    flex: 1,
  },
  pinOptionTitle: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 3,
  },
  pinOptionSubtitle: {
    fontSize: 13,
  },
  pinOptionCancelButton: {
    alignItems: "center",
    paddingVertical: 14,
    marginTop: 8,
  },
  pinOptionCancelText: {
    fontSize: 17,
    fontWeight: "600",
  },
  // Search styles
  headerSearchButton: {
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 4,
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 10,
  },
  searchInputContainer: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    paddingVertical: 0,
  },
  searchNavigation: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  searchResultsCount: {
    fontSize: 13,
    fontWeight: "600",
    color: "#fff",
    marginRight: 4,
  },
  searchNavButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.2)",
    justifyContent: "center",
    alignItems: "center",
  },
  searchCloseButton: {
    width: 36,
    height: 36,
    justifyContent: "center",
    alignItems: "center",
  },
  searchHighlight: {
    backgroundColor: "#FFEB3B",
    color: "#000",
    borderRadius: 2,
    fontWeight: "600",
  },
  // Telegram-style blur menu
  blurMenuOverlay: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  blurMenuContent: {
    width: "100%",
    paddingHorizontal: 20,
    alignItems: "center",
    gap: 16,
  },
  blurReactionsBar: {
    borderRadius: 24,
    paddingHorizontal: 8,
    paddingVertical: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 8,
  },
  blurMessageContainer: {
    maxWidth: "85%",
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 10,
  },
  blurMessageMedia: {
    borderRadius: 12,
    overflow: "hidden",
    marginBottom: 6,
  },
  blurMessageImage: {
    width: 220,
    height: 160,
    borderRadius: 12,
  },
  blurMessageVideoPlaceholder: {
    width: 220,
    height: 160,
    backgroundColor: "rgba(0,0,0,0.3)",
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 12,
  },
  blurMessageText: {
    fontSize: 16,
    lineHeight: 22,
  },
  blurMessageTime: {
    fontSize: 11,
    marginTop: 4,
    textAlign: "right",
  },
  blurActionsContainer: {
    borderRadius: 16,
    paddingVertical: 8,
    paddingHorizontal: 12,
    minWidth: 200,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 8,
  },
  blurActionItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 8,
    gap: 12,
  },
  blurActionText: {
    fontSize: 16,
    fontWeight: "500",
  },
});
