import { getAvatarColor } from "@/constants/colors";
import { useAuth } from "@/contexts/auth-context";
import { useTheme } from "@/contexts/theme-context";
import { supabase } from "@/lib/supabase";
import { BlockedUserWithProfile, Profile } from "@/types/database";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
    Alert,
    FlatList,
    Image,
    Platform,
    StatusBar,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";

export default function BlockedUsersScreen() {
  const { user } = useAuth();
  const { colors } = useTheme();
  const router = useRouter();
  const [blockedUsers, setBlockedUsers] = useState<BlockedUserWithProfile[]>(
    [],
  );
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchBlockedUsers();
  }, [user]);

  const fetchBlockedUsers = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from("blocked_users")
        .select("*")
        .eq("blocker_id", user.id)
        .order("created_at", { ascending: false });

      if (error) throw error;

      // Получаем профили заблокированных
      if (data && data.length > 0) {
        const blockedIds = data.map((b) => b.blocked_id);
        const { data: profiles, error: profilesError } = await supabase
          .from("profiles")
          .select("*")
          .in("id", blockedIds);

        if (profilesError) throw profilesError;

        const profilesMap = new Map(profiles?.map((p) => [p.id, p]));
        const blockedWithProfiles: BlockedUserWithProfile[] = data.map((b) => ({
          ...b,
          profile: profilesMap.get(b.blocked_id) as Profile,
        }));

        setBlockedUsers(blockedWithProfiles);
      } else {
        setBlockedUsers([]);
      }
    } catch (error) {
      console.error("Error fetching blocked users:", error);
    } finally {
      setLoading(false);
    }
  };

  const unblockUser = async (blockedUser: BlockedUserWithProfile) => {
    Alert.alert(
      "Разблокировать",
      `Разблокировать пользователя ${blockedUser.profile.username}?`,
      [
        { text: "Отмена", style: "cancel" },
        {
          text: "Разблокировать",
          onPress: async () => {
            try {
              const { error } = await supabase
                .from("blocked_users")
                .delete()
                .eq("id", blockedUser.id);

              if (error) throw error;

              setBlockedUsers((prev) =>
                prev.filter((b) => b.id !== blockedUser.id),
              );

              if (Platform.OS !== "web") {
                Haptics.notificationAsync(
                  Haptics.NotificationFeedbackType.Success,
                );
              }
            } catch (error) {
              console.error("Error unblocking user:", error);
              Alert.alert("Ошибка", "Не удалось разблокировать пользователя");
            }
          },
        },
      ],
    );
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("ru-RU", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  };

  const renderBlockedUser = ({ item }: { item: BlockedUserWithProfile }) => {
    const avatarColor = getAvatarColor(item.profile.id);

    return (
      <View style={[styles.userItem, { backgroundColor: colors.card }]}>
        <TouchableOpacity
          style={styles.userInfo}
          onPress={() => router.push(`/profile/${item.profile.id}`)}
          activeOpacity={0.7}
        >
          {item.profile.avatar_url ? (
            <Image
              source={{ uri: item.profile.avatar_url }}
              style={styles.avatar}
            />
          ) : (
            <View style={[styles.avatar, { backgroundColor: avatarColor }]}>
              <Text style={styles.avatarText}>
                {item.profile.username.charAt(0).toUpperCase()}
              </Text>
            </View>
          )}
          <View style={styles.userDetails}>
            <Text style={[styles.username, { color: colors.text }]}>
              {item.profile.username}
            </Text>
            <Text style={[styles.blockedDate, { color: colors.textSecondary }]}>
              Заблокирован {formatDate(item.created_at)}
            </Text>
            {item.reason && (
              <Text
                style={[styles.reason, { color: colors.textMuted }]}
                numberOfLines={1}
              >
                Причина: {item.reason}
              </Text>
            )}
          </View>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.unblockButton, { backgroundColor: colors.primary }]}
          onPress={() => unblockUser(item)}
          activeOpacity={0.8}
        >
          <Ionicons name="lock-open-outline" size={18} color="#fff" />
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar
        barStyle={colors.text === "#1a1a1a" ? "dark-content" : "light-content"}
      />

      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.background }]}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>
          Черный список
        </Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Description */}
      <View style={styles.description}>
        <View
          style={[styles.infoBox, { backgroundColor: colors.inputBackground }]}
        >
          <Ionicons
            name="information-circle"
            size={20}
            color={colors.textMuted}
          />
          <Text style={[styles.infoText, { color: colors.textSecondary }]}>
            Заблокированные пользователи не смогут отправлять вам сообщения и
            видеть вашу страницу
          </Text>
        </View>
      </View>

      {/* Blocked Users List */}
      {blockedUsers.length === 0 ? (
        <View style={styles.emptyContainer}>
          <View
            style={[styles.emptyIcon, { backgroundColor: colors.primaryLight }]}
          >
            <Ionicons
              name="shield-checkmark-outline"
              size={48}
              color={colors.primary}
            />
          </View>
          <Text style={[styles.emptyTitle, { color: colors.text }]}>
            Список пуст
          </Text>
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
            У вас нет заблокированных пользователей
          </Text>
        </View>
      ) : (
        <FlatList
          data={blockedUsers}
          renderItem={renderBlockedUser}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContainer}
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
        />
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
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: Platform.OS === "ios" ? 60 : 20,
    paddingBottom: 16,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "700",
  },
  description: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  infoBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    padding: 14,
    borderRadius: 12,
    gap: 10,
  },
  infoText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
  },
  listContainer: {
    paddingHorizontal: 16,
    paddingBottom: 20,
  },
  userItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderRadius: 12,
  },
  userInfo: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    justifyContent: "center",
    alignItems: "center",
  },
  avatarText: {
    fontSize: 20,
    fontWeight: "700",
    color: "#fff",
  },
  userDetails: {
    flex: 1,
    marginLeft: 12,
  },
  username: {
    fontSize: 16,
    fontWeight: "600",
  },
  blockedDate: {
    fontSize: 13,
    marginTop: 2,
  },
  reason: {
    fontSize: 12,
    marginTop: 2,
    fontStyle: "italic",
  },
  unblockButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
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
    width: 100,
    height: 100,
    borderRadius: 50,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 24,
  },
  emptyTitle: {
    fontSize: 22,
    fontWeight: "700",
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 16,
    textAlign: "center",
  },
});
