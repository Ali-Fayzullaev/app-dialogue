/**
 * Statuses — экран историй/статусов.
 * Горизонтальный список аватарок сверху + вертикальный список.
 * Создание статуса (камера/галерея), просмотр, приватность.
 */

import { StoryAvatar } from "@/components/stories/story-avatar";
import { StoryViewer } from "@/components/stories/story-viewer";
import { useAuth } from "@/contexts/auth-context";
import { useTheme } from "@/contexts/theme-context";
import { createStory, fetchAllStories } from "@/lib/story-service";
import { UserStories } from "@/types/database";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import React, { useCallback, useEffect, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Platform,
    RefreshControl,
    SafeAreaView,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from "react-native";

export default function StatusesScreen() {
  const { user } = useAuth();
  const { colors, isDark } = useTheme();

  const [allStories, setAllStories] = useState<UserStories[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [uploading, setUploading] = useState(false);

  // Viewer
  const [viewerVisible, setViewerVisible] = useState(false);
  const [viewerUserIndex, setViewerUserIndex] = useState(0);

  // Create caption modal
  const [captionText, setCaptionText] = useState("");

  const loadStories = useCallback(async () => {
    if (!user) return;
    try {
      const data = await fetchAllStories(user.id);
      setAllStories(data);
    } catch (err) {
      console.error("loadStories error:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user?.id]);

  useEffect(() => {
    loadStories();
  }, [loadStories]);

  // Рефреш каждые 30 сек для обновления кольца
  useEffect(() => {
    const interval = setInterval(loadStories, 30000);
    return () => clearInterval(interval);
  }, [loadStories]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadStories();
  }, [loadStories]);

  // Создание статуса
  const handleCreateStatus = useCallback(async () => {
    if (!user) return;

    try {
      const permResult =
        await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permResult.granted) {
        Alert.alert("Нет доступа", "Разрешите доступ к медиатеке в настройках");
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images", "videos"],
        allowsEditing: true,
        quality: 0.8,
        videoMaxDuration: 30,
      });

      if (result.canceled || !result.assets[0]) return;

      const asset = result.assets[0];
      const mediaType: "image" | "video" =
        asset.type === "video" ? "video" : "image";

      // Спрашиваем подпись
      Alert.prompt
        ? Alert.prompt(
            "Подпись",
            "Добавьте подпись к статусу (необязательно)",
            [
              {
                text: "Пропустить",
                onPress: () => uploadStory(asset.uri, mediaType, ""),
              },
              {
                text: "Добавить",
                onPress: (text?: string) =>
                  uploadStory(asset.uri, mediaType, text || ""),
              },
            ],
            "plain-text",
          )
        : uploadStory(asset.uri, mediaType, "");
    } catch (err) {
      console.error("handleCreateStatus error:", err);
    }
  }, [user?.id]);

  const uploadStory = async (
    uri: string,
    mediaType: "image" | "video",
    caption: string,
  ) => {
    if (!user) return;
    setUploading(true);

    if (Platform.OS !== "web") {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }

    const storyId = await createStory(user.id, uri, mediaType, caption);
    setUploading(false);

    if (storyId) {
      loadStories();
    } else {
      Alert.alert("Ошибка", "Не удалось создать статус");
    }
  };

  // Открыть просмотрщик
  const openViewer = useCallback((userIndex: number) => {
    setViewerUserIndex(userIndex);
    setViewerVisible(true);
  }, []);

  // Мои статусы
  const myStories = allStories.find((s) => s.user.id === user?.id);
  const otherStories = allStories.filter((s) => s.user.id !== user?.id);

  // Для горизонтального списка — первый элемент это "Мой статус"
  const horizontalData = allStories;

  const getMyUserProfile = () => {
    if (myStories) return myStories.user;
    return user
      ? {
          id: user.id,
          username:
            (user as any).user_metadata?.username ||
            user.email?.split("@")[0] ||
            "Я",
          avatar_url: (user as any).user_metadata?.avatar_url || null,
          public_key: null,
          created_at: user.created_at || new Date().toISOString(),
        }
      : null;
  };

  const myProfile = getMyUserProfile();

  if (loading) {
    return (
      <SafeAreaView
        style={[styles.container, { backgroundColor: colors.background }]}
      >
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: colors.background }]}
    >
      {/* Header */}
      <View
        style={[
          styles.header,
          {
            backgroundColor: colors.headerBackground,
            borderBottomColor: colors.border,
          },
        ]}
      >
        <Text style={[styles.headerTitle, { color: colors.text }]}>
          Статусы
        </Text>
      </View>

      <ScrollView
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {/* Горизонтальный список аватарок */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.avatarRow}
        >
          {/* Мой статус */}
          {myProfile && (
            <View style={styles.avatarItem}>
              <StoryAvatar
                user={myProfile}
                size={60}
                hasStories={!!myStories && myStories.stories.length > 0}
                hasUnviewed={false}
                showAddButton={!myStories || myStories.stories.length === 0}
                primaryColor={colors.primary}
                onPress={() => {
                  if (myStories && myStories.stories.length > 0) {
                    const idx = allStories.findIndex(
                      (s) => s.user.id === user?.id,
                    );
                    if (idx >= 0) openViewer(idx);
                  } else {
                    handleCreateStatus();
                  }
                }}
              />
              <Text
                style={[styles.avatarName, { color: colors.textSecondary }]}
                numberOfLines={1}
              >
                Мой статус
              </Text>
            </View>
          )}

          {/* Другие */}
          {otherStories.map((us, i) => {
            const globalIdx = allStories.findIndex(
              (s) => s.user.id === us.user.id,
            );
            return (
              <View key={us.user.id} style={styles.avatarItem}>
                <StoryAvatar
                  user={us.user}
                  size={60}
                  hasStories
                  hasUnviewed={us.hasUnviewed}
                  primaryColor={colors.primary}
                  onPress={() => openViewer(globalIdx)}
                />
                <Text
                  style={[styles.avatarName, { color: colors.textSecondary }]}
                  numberOfLines={1}
                >
                  {us.user.username}
                </Text>
              </View>
            );
          })}
        </ScrollView>

        {/* Разделитель */}
        <View style={[styles.divider, { backgroundColor: colors.border }]} />

        {/* Мой статус */}
        <View style={styles.section}>
          <TouchableOpacity
            style={styles.myStatusRow}
            onPress={() => {
              if (myStories && myStories.stories.length > 0) {
                const idx = allStories.findIndex((s) => s.user.id === user?.id);
                if (idx >= 0) openViewer(idx);
              } else {
                handleCreateStatus();
              }
            }}
            activeOpacity={0.7}
          >
            {myProfile && (
              <StoryAvatar
                user={myProfile}
                size={50}
                hasStories={!!myStories && myStories.stories.length > 0}
                hasUnviewed={false}
                showAddButton
                primaryColor={colors.primary}
              />
            )}
            <View style={styles.myStatusInfo}>
              <Text style={[styles.myStatusTitle, { color: colors.text }]}>
                Мой статус
              </Text>
              <Text
                style={[
                  styles.myStatusSubtitle,
                  { color: colors.textSecondary },
                ]}
              >
                {myStories && myStories.stories.length > 0
                  ? `${myStories.stories.length} статус${myStories.stories.length > 1 ? (myStories.stories.length < 5 ? "а" : "ов") : ""}`
                  : "Нажмите, чтобы добавить статус"}
              </Text>
            </View>
            {uploading && (
              <ActivityIndicator size="small" color={colors.primary} />
            )}
          </TouchableOpacity>
        </View>

        {/* Недавние статусы */}
        {otherStories.length > 0 && (
          <>
            <Text
              style={[styles.sectionTitle, { color: colors.textSecondary }]}
            >
              Недавние обновления
            </Text>
            {otherStories.map((us) => {
              const globalIdx = allStories.findIndex(
                (s) => s.user.id === us.user.id,
              );
              return (
                <TouchableOpacity
                  key={us.user.id}
                  style={styles.statusRow}
                  onPress={() => openViewer(globalIdx)}
                  activeOpacity={0.7}
                >
                  <StoryAvatar
                    user={us.user}
                    size={50}
                    hasStories
                    hasUnviewed={us.hasUnviewed}
                    primaryColor={colors.primary}
                  />
                  <View style={styles.statusInfo}>
                    <Text style={[styles.statusName, { color: colors.text }]}>
                      {us.user.username}
                    </Text>
                    <Text
                      style={[
                        styles.statusTime,
                        { color: colors.textSecondary },
                      ]}
                    >
                      {formatTimeAgo(us.latestAt)}
                    </Text>
                  </View>
                  {us.hasUnviewed && (
                    <View
                      style={[
                        styles.unviewedDot,
                        { backgroundColor: "#25D366" },
                      ]}
                    />
                  )}
                </TouchableOpacity>
              );
            })}
          </>
        )}

        {otherStories.length === 0 && (
          <View style={styles.emptyContainer}>
            <Ionicons
              name="camera-outline"
              size={56}
              color={colors.textMuted}
            />
            <Text style={[styles.emptyTitle, { color: colors.textSecondary }]}>
              Нет статусов
            </Text>
            <Text style={[styles.emptySubtitle, { color: colors.textMuted }]}>
              Статусы контактов будут отображаться здесь
            </Text>
          </View>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* FAB — создать статус */}
      <TouchableOpacity
        style={[styles.fab, { backgroundColor: colors.primary }]}
        onPress={handleCreateStatus}
        activeOpacity={0.8}
        disabled={uploading}
      >
        {uploading ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <Ionicons name="camera" size={24} color="#fff" />
        )}
      </TouchableOpacity>

      {/* StoryViewer */}
      <StoryViewer
        visible={viewerVisible}
        allUserStories={allStories}
        initialUserIndex={viewerUserIndex}
        onClose={() => {
          setViewerVisible(false);
          loadStories(); // обновляем кольца после просмотра
        }}
        onStoriesChanged={loadStories}
      />
    </SafeAreaView>
  );
}

function formatTimeAgo(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "только что";
  if (diffMin < 60) return `${diffMin} мин назад`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH} ч назад`;
  return d.toLocaleDateString("ru");
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
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: "700",
  },
  avatarRow: {
    paddingHorizontal: 12,
    paddingVertical: 14,
    gap: 14,
  },
  avatarItem: {
    alignItems: "center",
    width: 72,
  },
  avatarName: {
    fontSize: 11,
    marginTop: 4,
    textAlign: "center",
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginHorizontal: 16,
  },
  section: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  myStatusRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    gap: 14,
  },
  myStatusInfo: {
    flex: 1,
  },
  myStatusTitle: {
    fontSize: 16,
    fontWeight: "600",
  },
  myStatusSubtitle: {
    fontSize: 13,
    marginTop: 2,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "600",
    textTransform: "uppercase",
    marginLeft: 16,
    marginTop: 16,
    marginBottom: 8,
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 14,
  },
  statusInfo: {
    flex: 1,
  },
  statusName: {
    fontSize: 16,
    fontWeight: "500",
  },
  statusTime: {
    fontSize: 13,
    marginTop: 2,
  },
  unviewedDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  emptyContainer: {
    alignItems: "center",
    paddingTop: 60,
    paddingHorizontal: 40,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "600",
    marginTop: 16,
  },
  emptySubtitle: {
    fontSize: 14,
    textAlign: "center",
    marginTop: 8,
    lineHeight: 20,
  },
  fab: {
    position: "absolute",
    bottom: 24,
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: "center",
    alignItems: "center",
    elevation: 6,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
  },
});
