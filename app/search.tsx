import { getAvatarColor } from "@/constants/colors";
import { useAuth } from "@/contexts/auth-context";
import { useTheme } from "@/contexts/theme-context";
import { supabase } from "@/lib/supabase";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React, { useRef, useState } from "react";
import {
    ActivityIndicator,
    FlatList,
    Image,
    Platform,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";

interface SearchResult {
  id: string;
  content: string;
  created_at: string;
  chat_id: string;
  sender_id: string;
  sender: {
    id: string;
    username: string;
    avatar_url: string | null;
  } | null;
  chat: {
    id: string;
    name: string | null;
    is_group: boolean;
    avatar_url: string | null;
  } | null;
  other_user?: {
    id: string;
    username: string;
    avatar_url: string | null;
  } | null;
}

const safeHaptic = (
  style: Haptics.ImpactFeedbackStyle = Haptics.ImpactFeedbackStyle.Light,
) => {
  if (Platform.OS !== "web") {
    Haptics.impactAsync(style);
  }
};

export default function SearchScreen() {
  const { user } = useAuth();
  const { colors } = useTheme();
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const searchInputRef = useRef<TextInput>(null);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSearch = async (query: string) => {
    setSearchQuery(query);

    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    if (query.trim().length < 2) {
      setResults([]);
      setSearched(false);
      return;
    }

    searchTimeoutRef.current = setTimeout(async () => {
      if (!user?.id) return;

      setLoading(true);
      setSearched(true);

      try {
        // Получаем чаты пользователя
        const { data: memberChats } = await supabase
          .from("chat_members")
          .select("chat_id")
          .eq("user_id", user.id);

        const chatIds = memberChats?.map((m) => m.chat_id) || [];

        if (chatIds.length === 0) {
          setResults([]);
          setLoading(false);
          return;
        }

        // Ищем сообщения
        const { data: messages, error } = await supabase
          .from("messages")
          .select("id, content, created_at, chat_id, sender_id")
          .in("chat_id", chatIds)
          .ilike("content", `%${query}%`)
          .order("created_at", { ascending: false })
          .limit(50);

        if (error) throw error;

        if (!messages || messages.length === 0) {
          setResults([]);
          setLoading(false);
          return;
        }

        // Получаем уникальные chat_id и sender_id
        const uniqueChatIds = [...new Set(messages.map((m) => m.chat_id))];
        const uniqueSenderIds = [...new Set(messages.map((m) => m.sender_id))];

        // Получаем информацию о чатах
        const { data: chats } = await supabase
          .from("chats")
          .select("id, name, is_group, avatar_url")
          .in("id", uniqueChatIds);

        // Получаем профили отправителей
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, username, avatar_url")
          .in("id", uniqueSenderIds);

        // Для личных чатов получаем собеседников
        const personalChatIds =
          chats?.filter((c) => !c.is_group).map((c) => c.id) || [];

        let otherUsersMap = new Map<string, any>();

        if (personalChatIds.length > 0) {
          const { data: chatMembers } = await supabase
            .from("chat_members")
            .select("chat_id, user_id")
            .in("chat_id", personalChatIds)
            .neq("user_id", user.id);

          const otherUserIds = [
            ...new Set(chatMembers?.map((m) => m.user_id) || []),
          ];

          if (otherUserIds.length > 0) {
            const { data: otherProfiles } = await supabase
              .from("profiles")
              .select("id, username, avatar_url")
              .in("id", otherUserIds);

            chatMembers?.forEach((member) => {
              const profile = otherProfiles?.find(
                (p) => p.id === member.user_id,
              );
              if (profile) {
                otherUsersMap.set(member.chat_id, profile);
              }
            });
          }
        }

        const chatMap = new Map(chats?.map((c) => [c.id, c]));
        const profileMap = new Map(profiles?.map((p) => [p.id, p]));

        const enrichedResults: SearchResult[] = messages.map((msg) => ({
          ...msg,
          sender: profileMap.get(msg.sender_id) || null,
          chat: chatMap.get(msg.chat_id) || null,
          other_user: otherUsersMap.get(msg.chat_id) || null,
        }));

        setResults(enrichedResults);
      } catch (error) {
        console.error("Search error:", error);
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 300);
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffDays = Math.floor(
      (now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24),
    );

    if (diffDays === 0) {
      return date.toLocaleTimeString("ru-RU", {
        hour: "2-digit",
        minute: "2-digit",
      });
    } else if (diffDays === 1) {
      return "Вчера";
    } else if (diffDays < 7) {
      return date.toLocaleDateString("ru-RU", { weekday: "short" });
    } else {
      return date.toLocaleDateString("ru-RU", {
        day: "numeric",
        month: "short",
      });
    }
  };

  const getChatDisplayInfo = (result: SearchResult) => {
    if (result.chat?.is_group) {
      return {
        name: result.chat.name || "Группа",
        avatar: result.chat.avatar_url,
        isGroup: true,
        id: result.chat.id,
      };
    } else if (result.other_user) {
      return {
        name: result.other_user.username,
        avatar: result.other_user.avatar_url,
        isGroup: false,
        id: result.other_user.id,
      };
    }
    return {
      name: "Чат",
      avatar: null,
      isGroup: false,
      id: result.chat_id,
    };
  };

  const highlightText = (text: string) => {
    if (!searchQuery || searchQuery.trim().length < 2) {
      return (
        <Text style={[styles.resultContent, { color: colors.textSecondary }]}>
          {text}
        </Text>
      );
    }

    const lowerText = text.toLowerCase();
    const lowerQuery = searchQuery.toLowerCase();
    const index = lowerText.indexOf(lowerQuery);

    if (index === -1) {
      return (
        <Text style={[styles.resultContent, { color: colors.textSecondary }]}>
          {text}
        </Text>
      );
    }

    // Показываем контекст вокруг найденного текста
    const start = Math.max(0, index - 30);
    const end = Math.min(text.length, index + searchQuery.length + 30);

    let displayText = text.substring(start, end);
    if (start > 0) displayText = "..." + displayText;
    if (end < text.length) displayText = displayText + "...";

    const displayIndex = start > 0 ? index - start + 3 : index;
    const before = displayText.substring(0, displayIndex);
    const match = displayText.substring(
      displayIndex,
      displayIndex + searchQuery.length,
    );
    const after = displayText.substring(displayIndex + searchQuery.length);

    return (
      <Text style={[styles.resultContent, { color: colors.textSecondary }]}>
        {before}
        <Text style={[styles.highlight, { color: colors.text }]}>{match}</Text>
        {after}
      </Text>
    );
  };

  const navigateToChat = (result: SearchResult) => {
    safeHaptic(Haptics.ImpactFeedbackStyle.Light);
    router.push({
      pathname: `/chat/${result.chat_id}`,
      params: { highlightMessage: result.id },
    } as any);
  };

  const renderResult = ({ item }: { item: SearchResult }) => {
    const chatInfo = getChatDisplayInfo(item);
    const avatarColor = getAvatarColor(chatInfo.id);

    return (
      <TouchableOpacity
        style={[
          styles.resultItem,
          { backgroundColor: colors.surface, borderBottomColor: colors.border },
        ]}
        onPress={() => navigateToChat(item)}
        activeOpacity={0.7}
      >
        {/* Chat Avatar */}
        <View style={styles.resultAvatar}>
          {chatInfo.avatar ? (
            <Image
              source={{ uri: chatInfo.avatar }}
              style={styles.avatarImage}
            />
          ) : (
            <View
              style={[
                styles.avatarPlaceholder,
                { backgroundColor: avatarColor },
              ]}
            >
              {chatInfo.isGroup ? (
                <Ionicons name="people" size={20} color="#fff" />
              ) : (
                <Text style={[styles.avatarText, { color: "#fff" }]}>
                  {chatInfo.name.charAt(0).toUpperCase()}
                </Text>
              )}
            </View>
          )}
        </View>

        {/* Result Content */}
        <View style={styles.resultInfo}>
          <View style={styles.resultHeader}>
            <Text
              style={[styles.chatName, { color: colors.text }]}
              numberOfLines={1}
            >
              {chatInfo.name}
            </Text>
            <Text style={[styles.resultDate, { color: colors.textSecondary }]}>
              {formatDate(item.created_at)}
            </Text>
          </View>

          <View style={styles.resultBody}>
            <Text style={[styles.senderName, { color: colors.primary }]}>
              {item.sender?.username || "Пользователь"}:{" "}
            </Text>
            {highlightText(item.content)}
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.primary }]}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => {
            safeHaptic(Haptics.ImpactFeedbackStyle.Light);
            router.back();
          }}
        >
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>

        <View
          style={[styles.searchContainer, { backgroundColor: colors.surface }]}
        >
          <Ionicons name="search" size={20} color={colors.textSecondary} />
          <TextInput
            ref={searchInputRef}
            style={[styles.searchInput, { color: colors.text }]}
            placeholder="Поиск по всем чатам..."
            placeholderTextColor={colors.textSecondary}
            value={searchQuery}
            onChangeText={handleSearch}
            autoCapitalize="none"
            autoCorrect={false}
            autoFocus
            returnKeyType="search"
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity
              onPress={() => {
                setSearchQuery("");
                setResults([]);
                setSearched(false);
                searchInputRef.current?.focus();
              }}
            >
              <Ionicons
                name="close-circle"
                size={20}
                color={colors.textSecondary}
              />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Results */}
      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: colors.textSecondary }]}>
            Поиск...
          </Text>
        </View>
      ) : results.length > 0 ? (
        <FlatList
          data={results}
          renderItem={renderResult}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.resultsList}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            <Text
              style={[
                styles.resultsHeader,
                {
                  color: colors.textSecondary,
                  backgroundColor: colors.background,
                },
              ]}
            >
              Найдено: {results.length}{" "}
              {results.length === 1
                ? "сообщение"
                : results.length < 5
                  ? "сообщения"
                  : "сообщений"}
            </Text>
          }
        />
      ) : searched ? (
        <View style={styles.centerContainer}>
          <View style={[styles.emptyIcon, { backgroundColor: colors.surface }]}>
            <Ionicons
              name="search-outline"
              size={48}
              color={colors.textSecondary}
            />
          </View>
          <Text style={[styles.emptyTitle, { color: colors.text }]}>
            Ничего не найдено
          </Text>
          <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
            Попробуйте изменить поисковый запрос
          </Text>
        </View>
      ) : (
        <View style={styles.centerContainer}>
          <View style={[styles.emptyIcon, { backgroundColor: colors.surface }]}>
            <Ionicons
              name="chatbubbles-outline"
              size={48}
              color={colors.primary}
            />
          </View>
          <Text style={[styles.emptyTitle, { color: colors.text }]}>
            Поиск по чатам
          </Text>
          <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
            Введите текст для поиска сообщений{"\n"}во всех ваших чатах
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingTop: Platform.OS === "ios" ? 60 : 40,
    paddingBottom: 12,
    paddingHorizontal: 12,
    gap: 12,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
  },
  searchContainer: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    paddingVertical: 0,
  },
  centerContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
  },
  emptyIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: "600",
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 15,
    textAlign: "center",
    lineHeight: 22,
  },
  resultsList: {
    paddingVertical: 8,
  },
  resultsHeader: {
    fontSize: 14,
    fontWeight: "600",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  resultItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  resultAvatar: {
    marginRight: 12,
  },
  avatarImage: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  avatarPlaceholder: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: "center",
    alignItems: "center",
  },
  avatarText: {
    fontSize: 18,
    fontWeight: "600",
  },
  resultInfo: {
    flex: 1,
  },
  resultHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  chatName: {
    fontSize: 16,
    fontWeight: "600",
    flex: 1,
    marginRight: 8,
  },
  resultDate: {
    fontSize: 13,
  },
  resultBody: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  senderName: {
    fontSize: 14,
    fontWeight: "500",
  },
  resultContent: {
    fontSize: 14,
    flex: 1,
  },
  highlight: {
    backgroundColor: "#FFEB3B",
    fontWeight: "600",
  },
});
