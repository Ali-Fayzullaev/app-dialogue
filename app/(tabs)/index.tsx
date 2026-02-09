import { colors, getAvatarColor } from "@/constants/colors";
import { useAuth } from "@/contexts/auth-context";
import { supabase } from "@/lib/supabase";
import { Chat, Message, Profile } from "@/types/database";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  FlatList,
  Image,
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
  const { user } = useAuth();
  const router = useRouter();

  const fetchChats = async () => {
    if (!user) return;

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
    } catch (error) {
      console.error("Error fetching chats:", error);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchChats();
    }, [user]),
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
    const avatarColor = otherMember
      ? getAvatarColor(otherMember.id)
      : colors.primary;

    const handlePress = () => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      router.push(`/chat/${item.id}` as any);
    };

    return (
      <TouchableOpacity
        style={styles.chatItem}
        onPress={handlePress}
        activeOpacity={0.7}
      >
        <View style={styles.avatarWrapper}>
          {otherMember?.avatar_url ? (
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
          {item.other_user_online && <View style={styles.onlineIndicator} />}
        </View>
        <View style={styles.chatInfo}>
          <View style={styles.chatHeader}>
            <Text style={styles.chatName} numberOfLines={1}>
              {getChatName(item)}
            </Text>
            <View style={styles.chatHeaderRight}>
              {item.last_message && (
                <Text
                  style={[
                    styles.chatTime,
                    item.unread_count > 0 && styles.chatTimeUnread,
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
                item.unread_count > 0 && styles.lastMessageUnread,
              ]}
              numberOfLines={1}
            >
              {item.last_message?.media_type
                ? item.last_message.media_type === "image"
                  ? "📷 Фото"
                  : item.last_message.media_type === "video"
                    ? "🎬 Видео"
                    : "🎵 Аудио"
                : item.last_message?.content || "Нет сообщений"}
            </Text>
            {item.unread_count > 0 && (
              <View style={styles.unreadBadge}>
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
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Чаты</Text>
        <TouchableOpacity
          style={styles.newChatButton}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.push("/new-chat");
          }}
          activeOpacity={0.7}
        >
          <Ionicons name="create-outline" size={22} color={colors.primary} />
        </TouchableOpacity>
      </View>

      {/* Search Bar (visual) */}
      <View style={styles.searchContainer}>
        <View style={styles.searchBar}>
          <Ionicons
            name="search"
            size={18}
            color={colors.textMuted}
            style={{ marginRight: 8 }}
          />
          <Text style={styles.searchPlaceholder}>Поиск</Text>
        </View>
      </View>

      {/* Chat List */}
      {chats.length === 0 ? (
        <View style={styles.emptyContainer}>
          <View style={styles.emptyIcon}>
            <Ionicons
              name="chatbubbles-outline"
              size={48}
              color={colors.primary}
            />
          </View>
          <Text style={styles.emptyTitle}>Нет чатов</Text>
          <Text style={styles.emptyText}>
            Начните общение, нажав на кнопку выше
          </Text>
          <TouchableOpacity
            style={styles.startChatButton}
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 16,
    backgroundColor: colors.background,
  },
  headerTitle: {
    fontSize: 34,
    fontWeight: "bold",
    color: colors.textPrimary,
  },
  newChatButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primaryLight,
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
    backgroundColor: colors.inputBackground,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  searchPlaceholder: {
    fontSize: 16,
    color: colors.textMuted,
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
    backgroundColor: colors.border,
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
    borderColor: colors.background,
  },
  avatarText: {
    color: colors.textLight,
    fontSize: 22,
    fontWeight: "600",
  },
  chatInfo: {
    flex: 1,
    justifyContent: "center",
    borderBottomWidth: 0.5,
    borderBottomColor: colors.borderLight,
    paddingBottom: 14,
  },
  chatHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  chatName: {
    fontSize: 17,
    fontWeight: "600",
    color: colors.textPrimary,
    flex: 1,
    marginRight: 8,
  },
  chatTime: {
    fontSize: 14,
    color: colors.textMuted,
  },
  chatTimeUnread: {
    color: colors.primary,
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
    color: colors.textSecondary,
    flex: 1,
    marginRight: 8,
  },
  lastMessageUnread: {
    color: colors.textPrimary,
    fontWeight: "500",
  },
  unreadBadge: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    minWidth: 24,
    height: 24,
    paddingHorizontal: 8,
    justifyContent: "center",
    alignItems: "center",
  },
  unreadBadgeText: {
    color: colors.textLight,
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
    backgroundColor: colors.primaryLight,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 24,
  },
  emptyTitle: {
    fontSize: 22,
    fontWeight: "bold",
    color: colors.textPrimary,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 16,
    color: colors.textSecondary,
    textAlign: "center",
    marginBottom: 24,
  },
  startChatButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 25,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  startChatButtonText: {
    color: colors.textLight,
    fontSize: 16,
    fontWeight: "600",
  },
});
