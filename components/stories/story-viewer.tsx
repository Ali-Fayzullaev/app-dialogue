/**
 * StoryViewer — полноэкранный просмотрщик историй.
 * Прогресс-бары сверху, тап слева/справа, свайп вниз закрывает.
 * Показ просмотров для своих историй.
 */

import { useAuth } from "@/contexts/auth-context";
import { useTheme } from "@/contexts/theme-context";
import {
    deleteStory,
    fetchStoryViews,
    markStoryViewed,
} from "@/lib/story-service";
import { Profile, UserStories } from "@/types/database";
import { Ionicons } from "@expo/vector-icons";
import { ResizeMode, Video } from "expo-av";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
    ActivityIndicator,
    Animated,
    Dimensions,
    FlatList,
    Image,
    Modal,
    PanResponder,
    Platform,
    SafeAreaView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");
const STORY_DURATION = 5000; // 5 sec для фото
const VIDEO_MAX_DURATION = 30000; // 30 sec для видео
const PROGRESS_HEIGHT = 2.5;

interface StoryViewerProps {
  visible: boolean;
  allUserStories: UserStories[];
  initialUserIndex: number;
  initialStoryIndex?: number;
  onClose: () => void;
  onStoriesChanged?: () => void;
}

export function StoryViewer({
  visible,
  allUserStories,
  initialUserIndex,
  initialStoryIndex = 0,
  onClose,
  onStoriesChanged,
}: StoryViewerProps) {
  const { user } = useAuth();
  const { colors } = useTheme();
  const [userIndex, setUserIndex] = useState(initialUserIndex);
  const [storyIndex, setStoryIndex] = useState(initialStoryIndex);
  const [paused, setPaused] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showViewers, setShowViewers] = useState(false);
  const [viewers, setViewers] = useState<
    { viewer: Profile; viewed_at: string }[]
  >([]);
  const [viewersLoading, setViewersLoading] = useState(false);

  const progressAnim = useRef(new Animated.Value(0)).current;
  const progressAnimation = useRef<Animated.CompositeAnimation | null>(null);
  const translateY = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(1)).current;

  const currentUserStories = allUserStories[userIndex];
  const currentStory = currentUserStories?.stories[storyIndex];
  const isMyStory = currentStory?.user_id === user?.id;
  const totalStories = currentUserStories?.stories.length || 0;

  // Сброс при открытии
  useEffect(() => {
    if (visible) {
      setUserIndex(initialUserIndex);
      setStoryIndex(initialStoryIndex);
      setPaused(false);
      setShowViewers(false);
      translateY.setValue(0);
      opacity.setValue(1);
    }
  }, [visible, initialUserIndex, initialStoryIndex]);

  // Отметить как просмотренную
  useEffect(() => {
    if (
      currentStory &&
      user &&
      currentStory.user_id !== user.id &&
      !currentStory.is_viewed
    ) {
      markStoryViewed(currentStory.id, user.id);
      currentStory.is_viewed = true;
    }
  }, [currentStory?.id]);

  // Запуск прогресса
  const startProgress = useCallback(
    (duration: number) => {
      progressAnim.setValue(0);
      progressAnimation.current?.stop();
      progressAnimation.current = Animated.timing(progressAnim, {
        toValue: 1,
        duration,
        useNativeDriver: false,
      });
      progressAnimation.current.start(({ finished }) => {
        if (finished) {
          goNext();
        }
      });
    },
    [storyIndex, userIndex, allUserStories.length],
  );

  // Стартуем прогресс при смене истории
  useEffect(() => {
    if (!visible || paused || loading) return;

    const duration =
      currentStory?.media_type === "video"
        ? VIDEO_MAX_DURATION
        : STORY_DURATION;
    startProgress(duration);

    return () => {
      progressAnimation.current?.stop();
    };
  }, [visible, storyIndex, userIndex, paused, loading]);

  // Пауза/возобновление
  useEffect(() => {
    if (paused || showViewers) {
      progressAnimation.current?.stop();
    }
  }, [paused, showViewers]);

  const goNext = useCallback(() => {
    if (storyIndex < totalStories - 1) {
      setStoryIndex((prev) => prev + 1);
      setLoading(true);
    } else if (userIndex < allUserStories.length - 1) {
      setUserIndex((prev) => prev + 1);
      setStoryIndex(0);
      setLoading(true);
    } else {
      onClose();
    }
  }, [storyIndex, totalStories, userIndex, allUserStories.length, onClose]);

  const goPrev = useCallback(() => {
    if (storyIndex > 0) {
      setStoryIndex((prev) => prev - 1);
      setLoading(true);
    } else if (userIndex > 0) {
      setUserIndex((prev) => prev - 1);
      const prevStories = allUserStories[userIndex - 1];
      setStoryIndex(prevStories ? prevStories.stories.length - 1 : 0);
      setLoading(true);
    }
  }, [storyIndex, userIndex, allUserStories]);

  // Swipe down to close
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gs) =>
        Math.abs(gs.dy) > 10 && Math.abs(gs.dy) > Math.abs(gs.dx),
      onPanResponderMove: (_, gs) => {
        if (gs.dy > 0) {
          translateY.setValue(gs.dy);
          opacity.setValue(1 - gs.dy / (SCREEN_HEIGHT * 0.5));
        }
      },
      onPanResponderRelease: (_, gs) => {
        if (gs.dy > 100) {
          Animated.parallel([
            Animated.timing(translateY, {
              toValue: SCREEN_HEIGHT,
              duration: 200,
              useNativeDriver: true,
            }),
            Animated.timing(opacity, {
              toValue: 0,
              duration: 200,
              useNativeDriver: true,
            }),
          ]).start(() => onClose());
        } else {
          Animated.spring(translateY, {
            toValue: 0,
            useNativeDriver: true,
          }).start();
          Animated.spring(opacity, {
            toValue: 1,
            useNativeDriver: true,
          }).start();
        }
      },
    }),
  ).current;

  // Тап левая/правая половина
  const handleTap = useCallback(
    (x: number) => {
      if (showViewers) {
        setShowViewers(false);
        return;
      }
      if (x < SCREEN_WIDTH * 0.3) {
        goPrev();
      } else {
        goNext();
      }
    },
    [goNext, goPrev, showViewers],
  );

  // Показать просмотры
  const handleShowViewers = useCallback(async () => {
    if (!currentStory || !isMyStory) return;
    setShowViewers(true);
    setPaused(true);
    setViewersLoading(true);
    const data = await fetchStoryViews(currentStory.id);
    setViewers(data);
    setViewersLoading(false);
  }, [currentStory?.id, isMyStory]);

  // Удалить свою историю
  const handleDelete = useCallback(async () => {
    if (!currentStory || !user) return;
    const ok = await deleteStory(currentStory.id, user.id);
    if (ok) {
      onStoriesChanged?.();
      if (totalStories <= 1) {
        onClose();
      } else {
        goNext();
      }
    }
  }, [currentStory?.id, user?.id, totalStories, onClose, goNext]);

  const formatTime = (dateStr: string) => {
    const d = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return "только что";
    if (diffMin < 60) return `${diffMin} мин назад`;
    const diffH = Math.floor(diffMin / 60);
    if (diffH < 24) return `${diffH} ч назад`;
    return d.toLocaleDateString("ru");
  };

  if (!visible || !currentStory || !currentUserStories) return null;

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <Animated.View
        style={[styles.container, { transform: [{ translateY }], opacity }]}
        {...panResponder.panHandlers}
      >
        {/* Фон / Медиа */}
        <View style={styles.mediaContainer}>
          {currentStory.media_type === "video" ? (
            <Video
              source={{ uri: currentStory.media_url }}
              style={styles.media}
              resizeMode={ResizeMode.CONTAIN}
              shouldPlay={!paused && !showViewers}
              isLooping={false}
              onLoad={() => setLoading(false)}
              onPlaybackStatusUpdate={(status) => {
                if ("didJustFinish" in status && status.didJustFinish) {
                  goNext();
                }
              }}
            />
          ) : (
            <Image
              source={{ uri: currentStory.media_url }}
              style={styles.media}
              resizeMode="contain"
              onLoad={() => setLoading(false)}
            />
          )}

          {loading && (
            <View style={styles.loadingOverlay}>
              <ActivityIndicator size="large" color="#fff" />
            </View>
          )}
        </View>

        {/* Тап зоны */}
        <TouchableOpacity
          style={styles.tapZone}
          activeOpacity={1}
          onPress={(e) => handleTap(e.nativeEvent.locationX)}
          onLongPress={() => setPaused(true)}
          onPressOut={() => setPaused(false)}
          delayLongPress={200}
        />

        {/* Прогресс-бары */}
        <SafeAreaView style={styles.topSafeArea}>
          <View style={styles.progressContainer}>
            {currentUserStories.stories.map((_, i) => (
              <View key={i} style={styles.progressTrack}>
                <Animated.View
                  style={[
                    styles.progressFill,
                    i < storyIndex
                      ? { flex: 1 }
                      : i === storyIndex
                        ? {
                            width: progressAnim.interpolate({
                              inputRange: [0, 1],
                              outputRange: ["0%", "100%"],
                            }),
                          }
                        : { width: 0 },
                  ]}
                />
              </View>
            ))}
          </View>

          {/* Заголовок — аватар + имя + время */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <View style={styles.avatarSmall}>
                {currentUserStories.user.avatar_url ? (
                  <Image
                    source={{ uri: currentUserStories.user.avatar_url }}
                    style={styles.avatarImage}
                  />
                ) : (
                  <Text style={styles.avatarText}>
                    {currentUserStories.user.username?.[0]?.toUpperCase() ||
                      "?"}
                  </Text>
                )}
              </View>
              <View>
                <Text style={styles.username}>
                  {isMyStory ? "Мой статус" : currentUserStories.user.username}
                </Text>
                <Text style={styles.timeAgo}>
                  {formatTime(currentStory.created_at)}
                </Text>
              </View>
            </View>
            <View style={styles.headerRight}>
              {isMyStory && (
                <TouchableOpacity
                  onPress={handleDelete}
                  style={styles.headerBtn}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Ionicons name="trash-outline" size={22} color="#fff" />
                </TouchableOpacity>
              )}
              <TouchableOpacity
                onPress={onClose}
                style={styles.headerBtn}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons name="close" size={26} color="#fff" />
              </TouchableOpacity>
            </View>
          </View>
        </SafeAreaView>

        {/* Caption */}
        {currentStory.caption ? (
          <View style={styles.captionContainer}>
            <Text style={styles.captionText}>{currentStory.caption}</Text>
          </View>
        ) : null}

        {/* Количество просмотров (для своих историй) — снизу */}
        {isMyStory && (
          <SafeAreaView style={styles.bottomSafeArea}>
            <TouchableOpacity
              style={styles.viewersButton}
              onPress={handleShowViewers}
            >
              <Ionicons name="eye-outline" size={20} color="#fff" />
              <Text style={styles.viewersText}>Просмотры</Text>
            </TouchableOpacity>
          </SafeAreaView>
        )}

        {/* Модалка просмотров */}
        {showViewers && (
          <View style={styles.viewersOverlay}>
            <SafeAreaView style={styles.viewersSafeArea}>
              <View
                style={[
                  styles.viewersPanel,
                  { backgroundColor: colors.background },
                ]}
              >
                <View style={styles.viewersHeader}>
                  <Text style={[styles.viewersTitle, { color: colors.text }]}>
                    Просмотрели
                  </Text>
                  <TouchableOpacity
                    onPress={() => {
                      setShowViewers(false);
                      setPaused(false);
                    }}
                  >
                    <Ionicons name="close" size={24} color={colors.text} />
                  </TouchableOpacity>
                </View>
                {viewersLoading ? (
                  <ActivityIndicator
                    size="small"
                    color={colors.primary}
                    style={{ marginTop: 20 }}
                  />
                ) : viewers.length === 0 ? (
                  <Text
                    style={[styles.noViewers, { color: colors.textSecondary }]}
                  >
                    Пока никто не просмотрел
                  </Text>
                ) : (
                  <FlatList
                    data={viewers}
                    keyExtractor={(item) => item.viewer.id}
                    renderItem={({ item }) => (
                      <View style={styles.viewerRow}>
                        <View
                          style={[
                            styles.viewerAvatar,
                            { backgroundColor: colors.primary },
                          ]}
                        >
                          {item.viewer.avatar_url ? (
                            <Image
                              source={{ uri: item.viewer.avatar_url }}
                              style={styles.viewerAvatarImage}
                            />
                          ) : (
                            <Text style={styles.viewerAvatarText}>
                              {item.viewer.username?.[0]?.toUpperCase()}
                            </Text>
                          )}
                        </View>
                        <View style={styles.viewerInfo}>
                          <Text
                            style={[styles.viewerName, { color: colors.text }]}
                          >
                            {item.viewer.username}
                          </Text>
                          <Text
                            style={[
                              styles.viewerTime,
                              { color: colors.textSecondary },
                            ]}
                          >
                            {formatTime(item.viewed_at)}
                          </Text>
                        </View>
                      </View>
                    )}
                  />
                )}
              </View>
            </SafeAreaView>
          </View>
        )}
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
  },
  mediaContainer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
  },
  media: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  tapZone: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1,
  },
  topSafeArea: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
  },
  progressContainer: {
    flexDirection: "row",
    paddingHorizontal: 8,
    paddingTop: Platform.OS === "android" ? 30 : 6,
    gap: 3,
  },
  progressTrack: {
    flex: 1,
    height: PROGRESS_HEIGHT,
    backgroundColor: "rgba(255,255,255,0.35)",
    borderRadius: PROGRESS_HEIGHT / 2,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    backgroundColor: "#fff",
    borderRadius: PROGRESS_HEIGHT / 2,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingTop: 10,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  headerBtn: {
    padding: 4,
  },
  avatarSmall: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#555",
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden",
  },
  avatarImage: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  avatarText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
  username: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "600",
  },
  timeAgo: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 12,
  },
  captionContainer: {
    position: "absolute",
    bottom: 80,
    left: 0,
    right: 0,
    paddingHorizontal: 20,
    zIndex: 10,
  },
  captionText: {
    color: "#fff",
    fontSize: 16,
    textAlign: "center",
    textShadowColor: "rgba(0,0,0,0.8)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  bottomSafeArea: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 10,
  },
  viewersButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(255,255,255,0.2)",
  },
  viewersText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "500",
  },
  viewersOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "flex-end",
    zIndex: 20,
  },
  viewersSafeArea: {
    maxHeight: SCREEN_HEIGHT * 0.5,
  },
  viewersPanel: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingTop: 16,
    paddingBottom: 20,
    maxHeight: SCREEN_HEIGHT * 0.5,
  },
  viewersHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  viewersTitle: {
    fontSize: 17,
    fontWeight: "600",
  },
  noViewers: {
    textAlign: "center",
    paddingVertical: 20,
    fontSize: 14,
  },
  viewerRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 12,
  },
  viewerAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden",
  },
  viewerAvatarImage: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  viewerAvatarText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  viewerInfo: {
    flex: 1,
  },
  viewerName: {
    fontSize: 15,
    fontWeight: "500",
  },
  viewerTime: {
    fontSize: 12,
    marginTop: 2,
  },
});
