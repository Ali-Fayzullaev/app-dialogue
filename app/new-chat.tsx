import { colors, getAvatarColor } from "@/constants/colors";
import { useAuth } from "@/contexts/auth-context";
import { useTheme } from "@/contexts/theme-context";
import { supabase } from "@/lib/supabase";
import { Profile } from "@/types/database";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    FlatList,
    Image,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";

export default function NewChatScreen() {
  const [searchQuery, setSearchQuery] = useState("");
  const [users, setUsers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const { user } = useAuth();
  const { isDark } = useTheme();
  const router = useRouter();

  useEffect(() => {
    if (searchQuery.length >= 2) {
      searchUsers();
    } else {
      setUsers([]);
    }
  }, [searchQuery]);

  const searchUsers = async () => {
    if (!user) return;

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .ilike("username", `%${searchQuery}%`)
        .neq("id", user.id) // Исключаем себя
        .limit(20);

      if (error) throw error;
      setUsers(data || []);
    } catch (error) {
      console.error("Error searching users:", error);
    } finally {
      setLoading(false);
    }
  };

  const startChat = async (otherUser: Profile) => {
    if (!user || creating) return;

    setCreating(true);
    try {
      // Проверяем, есть ли уже чат с этим пользователем
      const { data: myChats } = await supabase
        .from("chat_members")
        .select("chat_id")
        .eq("user_id", user.id);

      const myChatIds = myChats?.map((c) => c.chat_id) || [];

      if (myChatIds.length > 0) {
        const { data: existingChat } = await supabase
          .from("chat_members")
          .select("chat_id")
          .eq("user_id", otherUser.id)
          .in("chat_id", myChatIds)
          .limit(1)
          .single();

        if (existingChat) {
          // Чат уже существует — переходим в него
          router.push(`/chat/${existingChat.chat_id}` as any);
          return;
        }
      }

      // Создаём новый чат
      const { data: newChat, error: chatError } = await supabase
        .from("chats")
        .insert({
          is_group: false,
        })
        .select()
        .single();

      if (chatError) throw chatError;

      // Добавляем участников
      const { error: membersError } = await supabase
        .from("chat_members")
        .insert([
          { chat_id: newChat.id, user_id: user.id },
          { chat_id: newChat.id, user_id: otherUser.id },
        ]);

      if (membersError) throw membersError;

      // Переходим в новый чат
      router.push(`/chat/${newChat.id}` as any);
    } catch (error) {
      console.error("Error creating chat:", error);
      Alert.alert("Ошибка", "Не удалось создать чат");
    } finally {
      setCreating(false);
    }
  };

  const renderUser = ({ item }: { item: Profile }) => {
    const avatarColor = getAvatarColor(item.id);
    return (
      <TouchableOpacity
        style={styles.userItem}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          startChat(item);
        }}
        disabled={creating}
        activeOpacity={0.7}
      >
        {item.avatar_url ? (
          <Image source={{ uri: item.avatar_url }} style={styles.avatarImage} />
        ) : (
          <View style={[styles.avatar, { backgroundColor: avatarColor }]}>
            <Text style={styles.avatarText}>
              {item.username.charAt(0).toUpperCase()}
            </Text>
          </View>
        )}
        <View style={styles.userInfo}>
          <Text style={styles.username}>{item.username}</Text>
          <Text style={styles.userSubtitle}>Нажмите, чтобы начать чат</Text>
        </View>
        {creating && <ActivityIndicator size="small" color={colors.primary} />}
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.back();
          }}
        >
          <Ionicons name="arrow-back" size={24} color={colors.textLight} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Новый чат</Text>
        <View style={styles.headerSpacer} />
      </View>

      {/* Search */}
      <View style={styles.searchContainer}>
        <View style={styles.searchWrapper}>
          <Ionicons
            name="search"
            size={18}
            color={colors.textMuted}
            style={{ marginRight: 10 }}
          />
          <TextInput
            style={styles.searchInput}
            placeholder="Поиск пользователей..."
            placeholderTextColor={colors.textMuted}
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCapitalize="none"
            autoFocus
            keyboardAppearance={isDark ? "dark" : "light"}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity
              onPress={() => setSearchQuery("")}
              style={styles.clearButton}
            >
              <Ionicons name="close" size={18} color={colors.textMuted} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : users.length === 0 ? (
        <View style={styles.emptyContainer}>
          <View style={styles.emptyIcon}>
            <Ionicons
              name={searchQuery.length < 2 ? "search" : "person-outline"}
              size={36}
              color={colors.primary}
            />
          </View>
          <Text style={styles.emptyTitle}>
            {searchQuery.length < 2
              ? "Найдите собеседника"
              : "Никого не найдено"}
          </Text>
          <Text style={styles.emptySubtitle}>
            {searchQuery.length < 2
              ? "Введите минимум 2 символа для поиска"
              : `По запросу "${searchQuery}" ничего не найдено`}
          </Text>
        </View>
      ) : (
        <FlatList
          data={users}
          renderItem={renderUser}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
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
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 50,
    paddingBottom: 12,
    paddingHorizontal: 16,
    backgroundColor: colors.primary,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: colors.textLight,
  },
  headerSpacer: {
    width: 40,
  },
  searchContainer: {
    padding: 16,
    backgroundColor: colors.background,
  },
  searchWrapper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.inputBackground,
    borderRadius: 12,
    paddingHorizontal: 14,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 14,
    fontSize: 16,
    color: colors.textPrimary,
  },
  clearButton: {
    padding: 6,
  },
  listContent: {
    paddingBottom: 20,
  },
  userItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: colors.background,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 14,
  },
  avatarImage: {
    width: 52,
    height: 52,
    borderRadius: 26,
    marginRight: 14,
  },
  avatarText: {
    color: colors.textLight,
    fontSize: 20,
    fontWeight: "600",
  },
  userInfo: {
    flex: 1,
  },
  username: {
    fontSize: 17,
    fontWeight: "600",
    color: colors.textPrimary,
  },
  userSubtitle: {
    fontSize: 13,
    color: colors.textMuted,
    marginTop: 2,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 40,
  },
  emptyIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.primaryLight,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 20,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: "600",
    color: colors.textPrimary,
    textAlign: "center",
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 15,
    color: colors.textSecondary,
    textAlign: "center",
  },
});
