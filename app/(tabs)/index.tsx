import { OfflineBanner } from "@/components/offline-banner";
import { getAvatarColor } from "@/constants/colors";
import { useAuth } from "@/contexts/auth-context";
import { useTheme } from "@/contexts/theme-context";
import { useNetworkStatus } from "@/hooks/use-network-status";
import { isUserReallyOnline } from "@/hooks/use-presence";
import { CachedChat, cacheService } from "@/lib/cache-service";
import { supabase } from "@/lib/supabase";
import { Chat, Message, Profile } from "@/types/database";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useRef, useState } from "react";
import {
    Alert,
    Animated,
    FlatList,
    Image,
    Modal,
    Platform,
    Pressable,
    RefreshControl,
    StatusBar,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import {
    GestureHandlerRootView,
    Swipeable,
} from "react-native-gesture-handler";

interface ChatItem extends Chat {
  members: Profile[];
  last_message: Message | null;
  unread_count: number;
  other_user_online: boolean;
  is_archived: boolean;
}

export default function ChatsScreen() {
  const [chats, setChats] = useState<ChatItem[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [isLoadingFromCache, setIsLoadingFromCache] = useState(true);
  const [showFabMenu, setShowFabMenu] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [selectedChat, setSelectedChat] = useState<ChatItem | null>(null);
  const [showChatMenu, setShowChatMenu] = useState(false);
  const [viewingAvatar, setViewingAvatar] = useState<{
    url: string | null;
    name: string;
    isGroup: boolean;
    isOnline?: boolean;
    color: string;
  } | null>(null);
  const fabRotation = useRef(new Animated.Value(0)).current;
  const menuScale = useRef(new Animated.Value(0)).current;
  const { user } = useAuth();
  const { colors } = useTheme();
  const router = useRouter();
  const { isOffline } = useNetworkStatus();

  const toggleFabMenu = () => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }

    const toValue = showFabMenu ? 0 : 1;
    Animated.parallel([
      Animated.spring(fabRotation, {
        toValue,
        useNativeDriver: true,
        tension: 100,
        friction: 10,
      }),
      Animated.spring(menuScale, {
        toValue,
        useNativeDriver: true,
        tension: 100,
        friction: 10,
      }),
    ]).start();

    setShowFabMenu(!showFabMenu);
  };

  const closeFabMenu = () => {
    Animated.parallel([
      Animated.spring(fabRotation, {
        toValue: 0,
        useNativeDriver: true,
      }),
      Animated.spring(menuScale, {
        toValue: 0,
        useNativeDriver: true,
      }),
    ]).start();
    setShowFabMenu(false);
  };

  // Архивация/разархивация чата
  const toggleArchiveChat = async (chat: ChatItem) => {
    if (!user) return;

    try {
      const newArchivedState = !chat.is_archived;

      const { error } = await supabase
        .from("chat_members")
        .update({ is_archived: newArchivedState })
        .eq("chat_id", chat.id)
        .eq("user_id", user.id);

      if (error) throw error;

      // Обновляем локальный список чатов
      setChats((prev) =>
        prev.map((c) =>
          c.id === chat.id ? { ...c, is_archived: newArchivedState } : c,
        ),
      );

      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch (error) {
      console.error("Error toggling archive:", error);
    }

    setShowChatMenu(false);
    setSelectedChat(null);
  };

  const handleChatLongPress = (chat: ChatItem) => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    setSelectedChat(chat);
    setShowChatMenu(true);
  };

  // Удаление чата (выход из чата)
  const deleteChat = async (chat: ChatItem, showConfirm = true) => {
    if (!user) return;

    const performDelete = async () => {
      try {
        // Удаляем пользователя из участников чата
        const { error } = await supabase
          .from("chat_members")
          .delete()
          .eq("chat_id", chat.id)
          .eq("user_id", user.id);

        if (error) throw error;

        // Удаляем чат из локального списка
        setChats((prev) => prev.filter((c) => c.id !== chat.id));

        if (Platform.OS !== "web") {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }
      } catch (error) {
        console.error("Error deleting chat:", error);
      }
    };

    if (showConfirm) {
      Alert.alert(
        "Удалить чат",
        "Вы уверены, что хотите удалить этот чат? Это действие нельзя отменить.",
        [
          { text: "Отмена", style: "cancel" },
          { text: "Удалить", style: "destructive", onPress: performDelete },
        ],
      );
    } else {
      await performDelete();
    }
  };

  // Отметить как непрочитанный / прочитанный
  const toggleReadStatus = async (chat: ChatItem) => {
    if (!user) return;

    try {
      if (chat.unread_count > 0) {
        // Отметить как прочитанные все сообщения
        const { error } = await supabase
          .from("messages")
          .update({ is_read: true })
          .eq("chat_id", chat.id)
          .neq("sender_id", user.id)
          .eq("is_read", false);

        if (error) throw error;

        setChats((prev) =>
          prev.map((c) => (c.id === chat.id ? { ...c, unread_count: 0 } : c)),
        );
      } else {
        // Отметить как непрочитанный - увеличиваем счетчик
        setChats((prev) =>
          prev.map((c) => (c.id === chat.id ? { ...c, unread_count: 1 } : c)),
        );
      }

      if (Platform.OS !== "web") {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
    } catch (error) {
      console.error("Error toggling read status:", error);
    }
  };

  // Refs для Swipeable
  const swipeableRefs = useRef<Map<string, Swipeable | null>>(new Map());

  const closeSwipeable = (chatId: string) => {
    const ref = swipeableRefs.current.get(chatId);
    if (ref) {
      ref.close();
    }
  };

  // Загрузка из кеша (мгновенно)
  const loadFromCache = async () => {
    const cachedChats = await cacheService.getCachedChats();
    if (cachedChats && cachedChats.length > 0) {
      // Преобразуем кешированные чаты в ChatItem формат
      const chatItems: ChatItem[] = cachedChats.map((cached) => ({
        id: cached.id,
        name: cached.name,
        is_group: cached.is_group,
        avatar_url: cached.avatar_url,
        created_at: "",
        admin_id: null,
        description: null,
        members: cached.other_user
          ? [
              {
                id: cached.other_user.id,
                username: cached.other_user.username,
                avatar_url: cached.other_user.avatar_url,
                created_at: "",
              },
            ]
          : [],
        last_message: cached.last_message
          ? ({
              content: cached.last_message.content,
              created_at: cached.last_message.created_at,
              media_type: cached.last_message.media_type as any,
            } as Message)
          : null,
        unread_count: cached.unread_count,
        other_user_online: false,
        is_archived: false, // Кеш не хранит архивный статус
      }));
      setChats(chatItems);
    }
    setIsLoadingFromCache(false);
  };

  const fetchChats = async () => {
    if (!user) return;

    // Если офлайн - не пытаемся загрузить с сервера
    if (isOffline) {
      console.log("📴 Offline mode - using cache only");
      return;
    }

    try {
      const { data: chatMembers, error: memberError } = await supabase
        .from("chat_members")
        .select("chat_id, is_archived")
        .eq("user_id", user.id);

      if (memberError) throw memberError;

      if (!chatMembers || chatMembers.length === 0) {
        setChats([]);
        return;
      }

      // Создаем Map для быстрого доступа к is_archived
      const archivedMap = new Map(
        chatMembers.map((cm) => [cm.chat_id, cm.is_archived ?? false]),
      );
      const chatIds = chatMembers.map((cm) => cm.chat_id);

      const { data: chatsData, error: chatsError } = await supabase
        .from("chats")
        .select("*")
        .in("id", chatIds);

      if (chatsError) throw chatsError;

      const chatsWithDetails = await Promise.all(
        (chatsData || []).map(async (chat) => {
          const { data: members } = await supabase
            .from("chat_members")
            .select("user_id")
            .eq("chat_id", chat.id);

          const memberIds = members?.map((m) => m.user_id) || [];

          const { data: profiles } = await supabase
            .from("profiles")
            .select("*")
            .in("id", memberIds);

          const { data: lastMessages } = await supabase
            .from("messages")
            .select("*")
            .eq("chat_id", chat.id)
            .order("created_at", { ascending: false })
            .limit(1);

          // Получаем количество непрочитанных сообщений
          const { count: unreadCount } = await supabase
            .from("messages")
            .select("*", { count: "exact", head: true })
            .eq("chat_id", chat.id)
            .neq("sender_id", user.id)
            .eq("is_read", false);

          // Получаем онлайн статус собеседника
          const otherMemberId = memberIds.find((id) => id !== user.id);
          let otherUserOnline = false;

          if (otherMemberId) {
            const { data: presence } = await supabase
              .from("user_presence")
              .select("is_online, last_seen")
              .eq("user_id", otherMemberId)
              .single();

            otherUserOnline = isUserReallyOnline(
              presence?.is_online || false,
              presence?.last_seen || null,
            );
          }

          return {
            ...chat,
            members: profiles || [],
            last_message: lastMessages?.[0] || null,
            unread_count: unreadCount || 0,
            other_user_online: otherUserOnline,
            is_archived: archivedMap.get(chat.id) || false,
          };
        }),
      );

      chatsWithDetails.sort((a, b) => {
        const timeA = a.last_message?.created_at || a.created_at;
        const timeB = b.last_message?.created_at || b.created_at;
        return new Date(timeB).getTime() - new Date(timeA).getTime();
      });

      setChats(chatsWithDetails);

      // Сохраняем в кеш для офлайн режима
      const toCache: CachedChat[] = chatsWithDetails.map((chat) => {
        const otherMember = chat.members.find((m) => m.id !== user.id);
        return {
          id: chat.id,
          name: chat.name,
          is_group: chat.is_group,
          avatar_url: chat.avatar_url,
          last_message: chat.last_message
            ? {
                content: chat.last_message.content,
                created_at: chat.last_message.created_at,
                sender_name: undefined,
                media_type: chat.last_message.media_type,
              }
            : undefined,
          unread_count: chat.unread_count,
          other_user: otherMember
            ? {
                id: otherMember.id,
                username: otherMember.username,
                avatar_url: otherMember.avatar_url,
              }
            : undefined,
        };
      });
      await cacheService.cacheChats(toCache);
      await cacheService.setLastSync();
    } catch (error) {
      console.error("Error fetching chats:", error);
    }
  };

  useFocusEffect(
    useCallback(() => {
      // Сначала загружаем из кеша (мгновенно)
      loadFromCache();
      // Потом обновляем с сервера
      fetchChats();
    }, [user, isOffline]),
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchChats();
    setRefreshing(false);
  };

  const getChatName = (chat: ChatItem) => {
    if (chat.name) return chat.name;
    const otherMembers = chat.members.filter((m) => m.id !== user?.id);
    return otherMembers.map((m) => m.username).join(", ") || "Чат";
  };

  const getOtherMember = (chat: ChatItem): Profile | undefined => {
    return chat.members.find((m) => m.id !== user?.id);
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days === 0) {
      return date.toLocaleTimeString("ru-RU", {
        hour: "2-digit",
        minute: "2-digit",
      });
    } else if (days === 1) {
      return "Вчера";
    } else if (days < 7) {
      return date.toLocaleDateString("ru-RU", { weekday: "short" });
    } else {
      return date.toLocaleDateString("ru-RU", {
        day: "numeric",
        month: "short",
      });
    }
  };

  const renderChat = ({ item }: { item: ChatItem }) => {
    const otherMember = getOtherMember(item);
    const isGroup = item.is_group;
    const avatarColor = isGroup
      ? "#FF9500"
      : otherMember
        ? getAvatarColor(otherMember.id)
        : colors.primary;

    const handlePress = () => {
      if (Platform.OS !== "web") {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
      router.push(`/chat/${item.id}` as any);
    };

    const handleAvatarPress = () => {
      if (Platform.OS !== "web") {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
      setViewingAvatar({
        url: isGroup ? item.avatar_url : otherMember?.avatar_url || null,
        name: getChatName(item),
        isGroup,
        isOnline: !isGroup && item.other_user_online,
        color: avatarColor,
      });
    };

    // Правые действия (свайп влево): Архив, Удалить
    const renderRightActions = () => (
      <View style={styles.swipeActionsRight}>
        <TouchableOpacity
          style={[styles.swipeAction, styles.swipeActionArchive]}
          onPress={() => {
            closeSwipeable(item.id);
            toggleArchiveChat(item);
          }}
          activeOpacity={0.8}
        >
          <Ionicons
            name={item.is_archived ? "arrow-undo" : "archive"}
            size={22}
            color="#fff"
          />
          <Text style={styles.swipeActionText}>
            {item.is_archived ? "Вернуть" : "Архив"}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.swipeAction, styles.swipeActionDelete]}
          onPress={() => {
            closeSwipeable(item.id);
            deleteChat(item);
          }}
          activeOpacity={0.8}
        >
          <Ionicons name="trash" size={22} color="#fff" />
          <Text style={styles.swipeActionText}>Удалить</Text>
        </TouchableOpacity>
      </View>
    );

    // Левые действия (свайп вправо): Прочитано/Непрочитано
    const renderLeftActions = () => (
      <View style={styles.swipeActionsLeft}>
        <TouchableOpacity
          style={[
            styles.swipeAction,
            item.unread_count > 0
              ? styles.swipeActionRead
              : styles.swipeActionUnread,
          ]}
          onPress={() => {
            closeSwipeable(item.id);
            toggleReadStatus(item);
          }}
          activeOpacity={0.8}
        >
          <Ionicons
            name={item.unread_count > 0 ? "checkmark-done" : "mail-unread"}
            size={22}
            color="#fff"
          />
          <Text style={styles.swipeActionText}>
            {item.unread_count > 0 ? "Прочитано" : "Не прочит."}
          </Text>
        </TouchableOpacity>
      </View>
    );

    return (
      <Swipeable
        ref={(ref) => {
          swipeableRefs.current.set(item.id, ref);
        }}
        renderRightActions={renderRightActions}
        renderLeftActions={renderLeftActions}
        rightThreshold={40}
        leftThreshold={40}
        friction={2}
        overshootLeft={false}
        overshootRight={false}
      >
        <TouchableOpacity
          style={[
            styles.chatItem,
            {
              backgroundColor: colors.background,
              borderBottomColor: colors.borderLight,
            },
          ]}
          onPress={handlePress}
          onLongPress={() => handleChatLongPress(item)}
          delayLongPress={300}
          activeOpacity={0.7}
        >
          <TouchableOpacity onPress={handleAvatarPress} activeOpacity={0.8}>
            <View style={styles.avatarWrapper}>
              {isGroup ? (
                // Group avatar
                item.avatar_url ? (
                  <Image
                    source={{ uri: item.avatar_url }}
                    style={styles.avatarImage}
                  />
                ) : (
                  <View
                    style={[styles.avatar, { backgroundColor: avatarColor }]}
                  >
                    <Ionicons name="people" size={22} color="#fff" />
                  </View>
                )
              ) : otherMember?.avatar_url ? (
                <Image
                  source={{ uri: otherMember.avatar_url }}
                  style={styles.avatarImage}
                />
              ) : (
                <View style={[styles.avatar, { backgroundColor: avatarColor }]}>
                  <Text style={styles.avatarText}>
                    {getChatName(item).charAt(0).toUpperCase()}
                  </Text>
                </View>
              )}
              {!isGroup && item.other_user_online && (
                <View style={styles.onlineIndicator} />
              )}
            </View>
          </TouchableOpacity>
          <View style={styles.chatInfo}>
            <View style={styles.chatHeader}>
              <View style={styles.chatNameRow}>
                {isGroup && (
                  <Ionicons
                    name="people"
                    size={14}
                    color={colors.textMuted}
                    style={{ marginRight: 4 }}
                  />
                )}
                <Text
                  style={[styles.chatName, { color: colors.text }]}
                  numberOfLines={1}
                >
                  {getChatName(item)}
                </Text>
              </View>
              <View style={styles.chatHeaderRight}>
                {item.last_message && (
                  <Text
                    style={[
                      styles.chatTime,
                      { color: colors.textSecondary },
                      item.unread_count > 0 && { color: colors.primary },
                    ]}
                  >
                    {formatTime(item.last_message.created_at)}
                  </Text>
                )}
              </View>
            </View>
            <View style={styles.chatFooter}>
              <Text
                style={[
                  styles.lastMessage,
                  { color: colors.textSecondary },
                  item.unread_count > 0 && {
                    color: colors.text,
                    fontWeight: "500",
                  },
                ]}
                numberOfLines={1}
              >
                {isGroup && item.last_message
                  ? `${item.members.find((m) => m.id === item.last_message?.sender_id)?.username || "Участник"}: `
                  : ""}
                {item.last_message?.media_type
                  ? item.last_message.media_type === "image"
                    ? "Фото"
                    : item.last_message.media_type === "video"
                      ? "Видео"
                      : item.last_message.media_type === "audio"
                        ? "Аудио"
                        : item.last_message.media_type === "location"
                          ? "Геолокация"
                          : item.last_message.media_type === "file"
                            ? "Документ"
                            : item.last_message?.content || "Нет сообщений"
                  : item.last_message?.content || "Нет сообщений"}
              </Text>
              {item.unread_count > 0 && (
                <View
                  style={[
                    styles.unreadBadge,
                    { backgroundColor: colors.primary },
                  ]}
                >
                  <Text style={styles.unreadBadgeText}>
                    {item.unread_count > 99 ? "99+" : item.unread_count}
                  </Text>
                </View>
              )}
            </View>
          </View>
        </TouchableOpacity>
      </Swipeable>
    );
  };

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <StatusBar
          barStyle={
            colors.text === "#1a1a1a" ? "dark-content" : "light-content"
          }
        />

        {/* Офлайн баннер */}
        <OfflineBanner />

        {/* Header */}
        <View style={[styles.header, { backgroundColor: colors.background }]}>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Чаты</Text>
          <View style={{ width: 44 }} />
        </View>

        {/* Search Bar - navigates to global search */}
        <TouchableOpacity
          style={[
            styles.searchContainer,
            { backgroundColor: colors.background },
          ]}
          onPress={() => {
            if (Platform.OS !== "web") {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            }
            router.push("/search");
          }}
          activeOpacity={0.7}
        >
          <View
            style={[
              styles.searchBar,
              { backgroundColor: colors.inputBackground },
            ]}
          >
            <Ionicons
              name="search"
              size={18}
              color={colors.textMuted}
              style={{ marginRight: 8 }}
            />
            <Text
              style={[styles.searchPlaceholder, { color: colors.textMuted }]}
            >
              Поиск по всем чатам
            </Text>
          </View>
        </TouchableOpacity>

        {/* Archived Chats Toggle */}
        {/* Archived Chats Toggle - показываем если есть архивные чаты ИЛИ если мы в режиме архива */}
        {(chats.filter((c) => c.is_archived).length > 0 || showArchived) && (
          <TouchableOpacity
            style={[
              styles.archivedToggle,
              {
                backgroundColor: showArchived
                  ? colors.primaryLight
                  : colors.inputBackground,
                borderBottomColor: colors.borderLight,
              },
            ]}
            onPress={() => {
              if (Platform.OS !== "web") {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              }
              setShowArchived(!showArchived);
            }}
            activeOpacity={0.7}
          >
            <View style={styles.archivedToggleContent}>
              <Ionicons
                name={showArchived ? "arrow-back" : "archive"}
                size={20}
                color={showArchived ? colors.primary : colors.textMuted}
              />
              <Text
                style={[
                  styles.archivedToggleText,
                  { color: showArchived ? colors.primary : colors.text },
                ]}
              >
                {showArchived ? "Назад к чатам" : "Архив"}
              </Text>
              {!showArchived &&
                chats.filter((c) => c.is_archived).length > 0 && (
                  <View
                    style={[
                      styles.archivedBadge,
                      {
                        backgroundColor: colors.textMuted,
                      },
                    ]}
                  >
                    <Text style={styles.archivedBadgeText}>
                      {chats.filter((c) => c.is_archived).length}
                    </Text>
                  </View>
                )}
            </View>
            <Ionicons
              name={showArchived ? "chevron-up" : "chevron-down"}
              size={20}
              color={colors.textMuted}
            />
          </TouchableOpacity>
        )}

        {/* Chat List */}
        {chats.filter((c) => (showArchived ? c.is_archived : !c.is_archived))
          .length === 0 ? (
          <View style={styles.emptyContainer}>
            <View
              style={[
                styles.emptyIcon,
                { backgroundColor: colors.primaryLight },
              ]}
            >
              <Ionicons
                name={showArchived ? "archive-outline" : "chatbubbles-outline"}
                size={48}
                color={colors.primary}
              />
            </View>
            <Text style={[styles.emptyTitle, { color: colors.text }]}>
              {showArchived ? "Архив пуст" : "Нет чатов"}
            </Text>
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
              {showArchived
                ? "Зажмите чат чтобы добавить в архив"
                : "Начните общение, нажав на кнопку выше"}
            </Text>
            {showArchived ? (
              <TouchableOpacity
                style={[
                  styles.startChatButton,
                  { backgroundColor: colors.primary },
                ]}
                onPress={() => {
                  if (Platform.OS !== "web") {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  }
                  setShowArchived(false);
                }}
                activeOpacity={0.8}
              >
                <Text style={styles.startChatButtonText}>Назад к чатам</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={[
                  styles.startChatButton,
                  { backgroundColor: colors.primary },
                ]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  router.push("/new-chat");
                }}
                activeOpacity={0.8}
              >
                <Text style={styles.startChatButtonText}>Новый чат</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          <FlatList
            data={chats.filter((c) =>
              showArchived ? c.is_archived : !c.is_archived,
            )}
            renderItem={renderChat}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContainer}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor={colors.primary}
              />
            }
            showsVerticalScrollIndicator={false}
          />
        )}

        {/* FAB Button */}
        <Animated.View
          style={[
            styles.fab,
            {
              transform: [
                {
                  rotate: fabRotation.interpolate({
                    inputRange: [0, 1],
                    outputRange: ["0deg", "45deg"],
                  }),
                },
              ],
            },
          ]}
        >
          <TouchableOpacity
            style={[styles.fabButton, { backgroundColor: colors.primary }]}
            onPress={toggleFabMenu}
            activeOpacity={0.85}
          >
            <Ionicons name="add" size={28} color="#fff" />
          </TouchableOpacity>
        </Animated.View>

        {/* FAB Menu */}
        <Modal visible={showFabMenu} transparent animationType="none">
          <Pressable style={styles.fabOverlay} onPress={closeFabMenu}>
            <Animated.View
              style={[
                styles.fabMenu,
                { backgroundColor: colors.card },
                {
                  transform: [{ scale: menuScale }],
                  opacity: menuScale,
                },
              ]}
            >
              <TouchableOpacity
                style={styles.fabMenuItem}
                onPress={() => {
                  closeFabMenu();
                  router.push("/new-chat");
                }}
                activeOpacity={0.7}
              >
                <View
                  style={[
                    styles.fabMenuIcon,
                    { backgroundColor: colors.primary },
                  ]}
                >
                  <Ionicons name="person" size={20} color="#fff" />
                </View>
                <Text style={[styles.fabMenuText, { color: colors.text }]}>
                  Новый чат
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.fabMenuItem}
                onPress={() => {
                  closeFabMenu();
                  router.push("/group/create");
                }}
                activeOpacity={0.7}
              >
                <View
                  style={[styles.fabMenuIcon, { backgroundColor: "#FF9500" }]}
                >
                  <Ionicons name="people" size={20} color="#fff" />
                </View>
                <Text style={[styles.fabMenuText, { color: colors.text }]}>
                  Новая группа
                </Text>
              </TouchableOpacity>
            </Animated.View>
          </Pressable>
        </Modal>

        {/* Avatar Viewer Modal */}
        <Modal
          visible={!!viewingAvatar}
          transparent
          animationType="fade"
          onRequestClose={() => setViewingAvatar(null)}
        >
          <View style={styles.avatarViewerOverlay}>
            <TouchableOpacity
              style={styles.avatarViewerCloseButton}
              onPress={() => setViewingAvatar(null)}
            >
              <Ionicons name="close" size={28} color="#fff" />
            </TouchableOpacity>

            {viewingAvatar?.url ? (
              <Image
                source={{ uri: viewingAvatar.url }}
                style={styles.avatarViewerImage}
                resizeMode="contain"
              />
            ) : (
              <View
                style={[
                  styles.avatarViewerPlaceholder,
                  { backgroundColor: viewingAvatar?.color || colors.primary },
                ]}
              >
                {viewingAvatar?.isGroup ? (
                  <Ionicons name="people" size={80} color="#fff" />
                ) : (
                  <Text style={styles.avatarViewerPlaceholderText}>
                    {viewingAvatar?.name?.charAt(0).toUpperCase()}
                  </Text>
                )}
              </View>
            )}

            <View style={styles.avatarViewerInfo}>
              <Text style={styles.avatarViewerName}>{viewingAvatar?.name}</Text>
              {viewingAvatar?.isOnline && (
                <Text style={styles.avatarViewerSubtitleOnline}>В сети</Text>
              )}
            </View>
          </View>
        </Modal>

        {/* Chat Action Menu Modal */}
        <Modal
          visible={showChatMenu}
          transparent
          animationType="fade"
          onRequestClose={() => {
            setShowChatMenu(false);
            setSelectedChat(null);
          }}
        >
          <Pressable
            style={styles.chatMenuOverlay}
            onPress={() => {
              setShowChatMenu(false);
              setSelectedChat(null);
            }}
          >
            <View
              style={[
                styles.chatMenuContainer,
                { backgroundColor: colors.card },
              ]}
            >
              <Text
                style={[styles.chatMenuTitle, { color: colors.text }]}
                numberOfLines={1}
              >
                {selectedChat && getChatName(selectedChat)}
              </Text>

              {/* Прочитано / Непрочитано */}
              <TouchableOpacity
                style={styles.chatMenuItem}
                onPress={() => {
                  if (selectedChat) {
                    toggleReadStatus(selectedChat);
                    setShowChatMenu(false);
                    setSelectedChat(null);
                  }
                }}
                activeOpacity={0.7}
              >
                <View
                  style={[
                    styles.chatMenuIconCircle,
                    { backgroundColor: "#007AFF" },
                  ]}
                >
                  <Ionicons
                    name={
                      selectedChat?.unread_count &&
                      selectedChat.unread_count > 0
                        ? "checkmark-done"
                        : "mail-unread"
                    }
                    size={18}
                    color="#fff"
                  />
                </View>
                <Text style={[styles.chatMenuItemText, { color: colors.text }]}>
                  {selectedChat?.unread_count && selectedChat.unread_count > 0
                    ? "Прочитано"
                    : "Непрочитано"}
                </Text>
              </TouchableOpacity>

              {/* Архивировать */}
              <TouchableOpacity
                style={styles.chatMenuItem}
                onPress={() => selectedChat && toggleArchiveChat(selectedChat)}
                activeOpacity={0.7}
              >
                <View
                  style={[
                    styles.chatMenuIconCircle,
                    { backgroundColor: "#FF9500" },
                  ]}
                >
                  <Ionicons
                    name={selectedChat?.is_archived ? "arrow-undo" : "archive"}
                    size={18}
                    color="#fff"
                  />
                </View>
                <Text style={[styles.chatMenuItemText, { color: colors.text }]}>
                  {selectedChat?.is_archived
                    ? "Разархивировать"
                    : "Архивировать"}
                </Text>
              </TouchableOpacity>

              {/* Удалить */}
              <TouchableOpacity
                style={styles.chatMenuItem}
                onPress={() => {
                  if (selectedChat) {
                    setShowChatMenu(false);
                    setSelectedChat(null);
                    deleteChat(selectedChat, true);
                  }
                }}
                activeOpacity={0.7}
              >
                <View
                  style={[
                    styles.chatMenuIconCircle,
                    { backgroundColor: "#FF3B30" },
                  ]}
                >
                  <Ionicons name="trash" size={18} color="#fff" />
                </View>
                <Text style={[styles.chatMenuItemText, { color: "#FF3B30" }]}>
                  Удалить чат
                </Text>
              </TouchableOpacity>

              {/* Отмена */}
              <TouchableOpacity
                style={[styles.chatMenuItem, styles.chatMenuItemCancel]}
                onPress={() => {
                  setShowChatMenu(false);
                  setSelectedChat(null);
                }}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.chatMenuItemText,
                    { color: colors.textMuted, textAlign: "center" },
                  ]}
                >
                  Отмена
                </Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Modal>
      </View>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 16,
  },
  headerTitle: {
    fontSize: 34,
    fontWeight: "bold",
  },
  newChatButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
  },
  searchContainer: {
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  searchPlaceholder: {
    fontSize: 16,
  },
  listContainer: {
    paddingBottom: 20,
  },
  chatItem: {
    flexDirection: "row",
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  avatarWrapper: {
    position: "relative",
    marginRight: 14,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: "center",
    alignItems: "center",
  },
  avatarImage: {
    width: 56,
    height: 56,
    borderRadius: 28,
  },
  onlineIndicator: {
    position: "absolute",
    bottom: 2,
    right: 2,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: "#4CAF50",
    borderWidth: 2,
  },
  avatarText: {
    color: "#fff",
    fontSize: 22,
    fontWeight: "600",
  },
  chatInfo: {
    flex: 1,
    justifyContent: "center",
    borderBottomWidth: 0.5,
    paddingBottom: 14,
  },
  chatHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  chatNameRow: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  chatName: {
    fontSize: 17,
    fontWeight: "600",
    flex: 1,
    marginRight: 8,
  },
  chatTime: {
    fontSize: 14,
  },
  chatTimeUnread: {
    fontWeight: "500",
  },
  chatFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  chatHeaderRight: {
    flexDirection: "row",
    alignItems: "center",
  },
  lastMessage: {
    fontSize: 15,
    flex: 1,
    marginRight: 8,
  },
  lastMessageUnread: {
    fontWeight: "500",
  },
  unreadBadge: {
    borderRadius: 12,
    minWidth: 24,
    height: 24,
    paddingHorizontal: 8,
    justifyContent: "center",
    alignItems: "center",
  },
  unreadBadgeText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "bold",
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 40,
  },
  emptyIcon: {
    width: 100,
    height: 100,
    borderRadius: 50,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 24,
  },
  emptyTitle: {
    fontSize: 22,
    fontWeight: "bold",
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 16,
    textAlign: "center",
    marginBottom: 24,
  },
  startChatButton: {
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 25,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  startChatButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  // FAB styles
  fab: {
    position: "absolute",
    bottom: 24,
    right: 20,
    zIndex: 100,
  },
  fabButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: "center",
    alignItems: "center",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 8,
  },
  fabOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.3)",
    justifyContent: "flex-end",
    alignItems: "flex-end",
    paddingBottom: 90,
    paddingRight: 20,
  },
  fabMenu: {
    borderRadius: 16,
    paddingVertical: 8,
    minWidth: 180,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  fabMenuItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 16,
    gap: 12,
  },
  fabMenuIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: "center",
    alignItems: "center",
  },
  fabMenuText: {
    fontSize: 16,
    fontWeight: "500",
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
  avatarViewerSubtitleOnline: {
    fontSize: 15,
    color: "#81C784",
    fontWeight: "500",
  },
  // Archived Toggle
  archivedToggle: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    marginHorizontal: 16,
    borderRadius: 12,
    marginBottom: 8,
  },
  archivedToggleContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  archivedToggleText: {
    fontSize: 16,
    fontWeight: "600",
  },
  archivedBadge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 6,
  },
  archivedBadgeText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#fff",
  },
  // Chat Menu Modal
  chatMenuOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 40,
  },
  chatMenuContainer: {
    width: "100%",
    borderRadius: 16,
    padding: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 8,
  },
  chatMenuTitle: {
    fontSize: 17,
    fontWeight: "600",
    marginBottom: 16,
    textAlign: "center",
  },
  chatMenuItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    gap: 14,
  },
  chatMenuItemText: {
    fontSize: 16,
    fontWeight: "500",
  },
  chatMenuIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: "center",
    alignItems: "center",
  },
  chatMenuItemCancel: {
    marginTop: 8,
    paddingTop: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(0,0,0,0.1)",
    justifyContent: "center",
  },
  // Swipe Actions
  swipeActionsRight: {
    flexDirection: "row",
    alignItems: "stretch",
  },
  swipeActionsLeft: {
    flexDirection: "row",
    alignItems: "stretch",
  },
  swipeAction: {
    width: 80,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 8,
  },
  swipeActionArchive: {
    backgroundColor: "#FF9500",
  },
  swipeActionDelete: {
    backgroundColor: "#FF3B30",
  },
  swipeActionRead: {
    backgroundColor: "#007AFF",
  },
  swipeActionUnread: {
    backgroundColor: "#34C759",
  },
  swipeActionText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "600",
    marginTop: 4,
  },
});
