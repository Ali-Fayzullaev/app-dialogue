import { OfflineBanner } from "@/components/offline-banner";
import { getAvatarColor } from "@/constants/colors";
import { useAuth } from "@/contexts/auth-context";
import { useTheme } from "@/contexts/theme-context";
import { useNetworkStatus } from "@/hooks/use-network-status";
import { CachedChat, cacheService } from "@/lib/cache-service";
import { supabase } from "@/lib/supabase";
import { Chat, Message, Profile } from "@/types/database";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useRef, useState } from "react";
import {
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

interface ChatItem extends Chat {
  members: Profile[];
  last_message: Message | null;
  unread_count: number;
  other_user_online: boolean;
}

export default function ChatsScreen() {
  const [chats, setChats] = useState<ChatItem[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [isLoadingFromCache, setIsLoadingFromCache] = useState(true);
  const [showFabMenu, setShowFabMenu] = useState(false);
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
        .select("chat_id")
        .eq("user_id", user.id);

      if (memberError) throw memberError;

      if (!chatMembers || chatMembers.length === 0) {
        setChats([]);
        return;
      }

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
              .select("is_online")
              .eq("user_id", otherMemberId)
              .single();

            otherUserOnline = presence?.is_online || false;
          }

          return {
            ...chat,
            members: profiles || [],
            last_message: lastMessages?.[0] || null,
            unread_count: unreadCount || 0,
            other_user_online: otherUserOnline,
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

    return (
      <TouchableOpacity
        style={[styles.chatItem, { borderBottomColor: colors.borderLight }]}
        onPress={handlePress}
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
                <View style={[styles.avatar, { backgroundColor: avatarColor }]}>
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
                  ? "📷 Фото"
                  : item.last_message.media_type === "video"
                    ? "🎬 Видео"
                    : "🎵 Аудио"
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
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar
        barStyle={colors.text === "#1a1a1a" ? "dark-content" : "light-content"}
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
        style={[styles.searchContainer, { backgroundColor: colors.background }]}
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
          <Text style={[styles.searchPlaceholder, { color: colors.textMuted }]}>
            Поиск по всем чатам
          </Text>
        </View>
      </TouchableOpacity>

      {/* Chat List */}
      {chats.length === 0 ? (
        <View style={styles.emptyContainer}>
          <View
            style={[styles.emptyIcon, { backgroundColor: colors.primaryLight }]}
          >
            <Ionicons
              name="chatbubbles-outline"
              size={48}
              color={colors.primary}
            />
          </View>
          <Text style={[styles.emptyTitle, { color: colors.text }]}>
            Нет чатов
          </Text>
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
            Начните общение, нажав на кнопку выше
          </Text>
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
        </View>
      ) : (
        <FlatList
          data={chats}
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
    </View>
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
});
