import { colors, getAvatarColor } from "@/constants/colors";
import { useAuth } from "@/contexts/auth-context";
import { supabase } from "@/lib/supabase";
import { Profile } from "@/types/database";
import { Ionicons } from "@expo/vector-icons";
import { Audio, ResizeMode, Video } from "expo-av";
import * as Haptics from "expo-haptics";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Animated,
    Dimensions,
    FlatList,
    Image,
    Modal,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const MEDIA_SIZE = (SCREEN_WIDTH - 8) / 3;

// Safe haptic
const safeHaptic = () => {
  if (Platform.OS !== "web") {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }
};

interface MediaItem {
  id: string;
  url: string;
  type: "image" | "video" | "audio";
  created_at: string;
  sender_id: string;
  duration?: number;
}

type MediaTab = "media" | "audio";

export default function UserProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const router = useRouter();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [mediaItems, setMediaItems] = useState<MediaItem[]>([]);
  const [audioItems, setAudioItems] = useState<MediaItem[]>([]);
  const [activeTab, setActiveTab] = useState<MediaTab>("media");
  const [fullscreenMedia, setFullscreenMedia] = useState<MediaItem | null>(
    null,
  );
  const [mediaCount, setMediaCount] = useState({
    images: 0,
    videos: 0,
    audio: 0,
  });

  // Audio player state
  const [playingAudioId, setPlayingAudioId] = useState<string | null>(null);
  const [audioProgress, setAudioProgress] = useState<number>(0);
  const [audioDuration, setAudioDuration] = useState<number>(0);
  const soundRef = useRef<Audio.Sound | null>(null);
  const progressAnimation = useRef(new Animated.Value(0)).current;

  // Selected media for actions
  const [selectedMedia, setSelectedMedia] = useState<MediaItem | null>(null);
  const [showMediaActions, setShowMediaActions] = useState(false);
  const menuAnimation = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (id) {
      fetchProfile();
      fetchSharedMedia();
    }

    return () => {
      // Cleanup audio on unmount
      if (soundRef.current) {
        soundRef.current.unloadAsync();
      }
    };
  }, [id]);

  const fetchProfile = async () => {
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", id)
        .single();

      if (error) throw error;
      setProfile(data);
    } catch (error) {
      console.error("Error fetching profile:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchSharedMedia = async () => {
    if (!user || !id) return;

    try {
      // Найти общие чаты между пользователями
      const { data: myChats } = await supabase
        .from("chat_members")
        .select("chat_id")
        .eq("user_id", user.id);

      const { data: theirChats } = await supabase
        .from("chat_members")
        .select("chat_id")
        .eq("user_id", id);

      if (!myChats || !theirChats) return;

      const myIds = myChats.map((c) => c.chat_id);
      const theirIds = theirChats.map((c) => c.chat_id);
      const commonChatIds = myIds.filter((id) => theirIds.includes(id));

      if (commonChatIds.length === 0) return;

      // Получить все медиа сообщения из общих чатов
      const { data: messages } = await supabase
        .from("messages")
        .select("id, media_url, media_type, created_at, sender_id")
        .in("chat_id", commonChatIds)
        .not("media_url", "is", null)
        .order("created_at", { ascending: false });

      if (!messages) return;

      const media: MediaItem[] = [];
      const audio: MediaItem[] = [];
      let imgCount = 0,
        vidCount = 0,
        audCount = 0;

      messages.forEach((msg) => {
        if (!msg.media_url || !msg.media_type) return;

        const item: MediaItem = {
          id: msg.id,
          url: msg.media_url,
          type: msg.media_type as "image" | "video" | "audio",
          created_at: msg.created_at,
          sender_id: msg.sender_id,
        };

        if (msg.media_type === "image") {
          media.push(item);
          imgCount++;
        } else if (msg.media_type === "video") {
          media.push(item);
          vidCount++;
        } else if (msg.media_type === "audio") {
          audio.push(item);
          audCount++;
        }
      });

      setMediaItems(media);
      setAudioItems(audio);
      setMediaCount({ images: imgCount, videos: vidCount, audio: audCount });
    } catch (error) {
      console.error("Error fetching shared media:", error);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("ru-RU", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  // Audio playback
  const playAudio = async (item: MediaItem) => {
    if (Platform.OS === "web") {
      // Web fallback
      try {
        if (playingAudioId === item.id) {
          setPlayingAudioId(null);
          return;
        }
        const audio = new window.Audio(item.url);
        audio.play();
        setPlayingAudioId(item.id);
        audio.onended = () => setPlayingAudioId(null);
      } catch (error) {
        console.error("Web audio error:", error);
      }
      return;
    }

    try {
      // If same audio is playing, stop it
      if (playingAudioId === item.id) {
        if (soundRef.current) {
          await soundRef.current.stopAsync();
          await soundRef.current.unloadAsync();
          soundRef.current = null;
        }
        setPlayingAudioId(null);
        setAudioProgress(0);
        progressAnimation.setValue(0);
        return;
      }

      // Stop any currently playing audio
      if (soundRef.current) {
        await soundRef.current.stopAsync();
        await soundRef.current.unloadAsync();
        soundRef.current = null;
      }

      safeHaptic();
      setPlayingAudioId(item.id);
      setAudioProgress(0);
      progressAnimation.setValue(0);

      const { sound } = await Audio.Sound.createAsync(
        { uri: item.url },
        { shouldPlay: true },
        (status) => {
          if (status.isLoaded) {
            if (status.durationMillis) {
              setAudioDuration(status.durationMillis / 1000);
            }
            if (status.positionMillis && status.durationMillis) {
              const progress = status.positionMillis / status.durationMillis;
              setAudioProgress(progress);
              progressAnimation.setValue(progress);
            }
            if (status.didJustFinish) {
              setPlayingAudioId(null);
              setAudioProgress(0);
              progressAnimation.setValue(0);
            }
          }
        },
      );

      soundRef.current = sound;
    } catch (error) {
      console.error("Audio playback error:", error);
      setPlayingAudioId(null);
    }
  };

  // Open media actions menu
  const openMediaActions = (item: MediaItem) => {
    setSelectedMedia(item);
    setShowMediaActions(true);
    Animated.spring(menuAnimation, {
      toValue: 1,
      useNativeDriver: true,
      tension: 100,
      friction: 8,
    }).start();
  };

  const closeMediaActions = () => {
    Animated.timing(menuAnimation, {
      toValue: 0,
      duration: 150,
      useNativeDriver: true,
    }).start(() => {
      setShowMediaActions(false);
      setSelectedMedia(null);
    });
  };

  // Delete media message
  const deleteMedia = async () => {
    if (!selectedMedia || !user) return;

    // Check if user owns this media
    if (selectedMedia.sender_id !== user.id) {
      Alert.alert("Ошибка", "Вы можете удалять только свои медиа");
      closeMediaActions();
      return;
    }

    Alert.alert("Удалить медиа", "Вы уверены? Это действие нельзя отменить.", [
      { text: "Отмена", style: "cancel", onPress: closeMediaActions },
      {
        text: "Удалить",
        style: "destructive",
        onPress: async () => {
          try {
            const { error } = await supabase
              .from("messages")
              .delete()
              .eq("id", selectedMedia.id);

            if (error) throw error;

            // Remove from local state
            if (selectedMedia.type === "audio") {
              setAudioItems((prev) =>
                prev.filter((item) => item.id !== selectedMedia.id),
              );
              setMediaCount((prev) => ({
                ...prev,
                audio: prev.audio - 1,
              }));
            } else {
              setMediaItems((prev) =>
                prev.filter((item) => item.id !== selectedMedia.id),
              );
              if (selectedMedia.type === "image") {
                setMediaCount((prev) => ({
                  ...prev,
                  images: prev.images - 1,
                }));
              } else {
                setMediaCount((prev) => ({
                  ...prev,
                  videos: prev.videos - 1,
                }));
              }
            }

            safeHaptic();
            closeMediaActions();
          } catch (error) {
            console.error("Delete error:", error);
            Alert.alert("Ошибка", "Не удалось удалить медиа");
          }
        },
      },
    ]);
  };

  const avatarColor = profile?.id ? getAvatarColor(profile.id) : colors.primary;

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!profile) {
    return (
      <View style={styles.errorContainer}>
        <Ionicons name="person-outline" size={64} color={colors.textMuted} />
        <Text style={styles.errorText}>Пользователь не найден</Text>
        <TouchableOpacity
          style={styles.backButtonLarge}
          onPress={() => router.back()}
        >
          <Text style={styles.backButtonText}>Назад</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const renderMediaItem = ({ item }: { item: MediaItem }) => {
    const isOwn = item.sender_id === user?.id;

    return (
      <Pressable
        style={styles.mediaItem}
        onPress={() => {
          safeHaptic();
          setFullscreenMedia(item);
        }}
        onLongPress={() => {
          safeHaptic();
          openMediaActions(item);
        }}
        delayLongPress={300}
      >
        {item.type === "image" ? (
          <Image source={{ uri: item.url }} style={styles.mediaThumbnail} />
        ) : item.type === "video" ? (
          <View style={styles.mediaThumbnail}>
            <Image
              source={{ uri: item.url }}
              style={styles.mediaThumbnail}
              blurRadius={2}
            />
            <View style={styles.videoOverlay}>
              <Ionicons name="play-circle" size={40} color="#fff" />
            </View>
          </View>
        ) : null}

        {/* Own indicator */}
        {isOwn && (
          <View style={styles.ownBadge}>
            <Ionicons name="person" size={10} color="#fff" />
          </View>
        )}
      </Pressable>
    );
  };

  const renderAudioItem = ({ item }: { item: MediaItem }) => {
    const isPlaying = playingAudioId === item.id;
    const isOwn = item.sender_id === user?.id;

    return (
      <Pressable
        style={[styles.audioItem, isPlaying && styles.audioItemPlaying]}
        onPress={() => playAudio(item)}
        onLongPress={() => {
          safeHaptic();
          openMediaActions(item);
        }}
        delayLongPress={300}
      >
        <TouchableOpacity
          style={[styles.audioPlayBtn, isPlaying && styles.audioPlayBtnActive]}
          onPress={() => playAudio(item)}
          activeOpacity={0.7}
        >
          <Ionicons
            name={isPlaying ? "pause" : "play"}
            size={22}
            color="#fff"
          />
        </TouchableOpacity>

        <View style={styles.audioContent}>
          <View style={styles.audioWaveform}>
            {[...Array(25)].map((_, i) => (
              <Animated.View
                key={i}
                style={[
                  styles.audioBar,
                  {
                    height: 8 + Math.sin(i * 0.8) * 12 + Math.random() * 4,
                    backgroundColor: isPlaying
                      ? i / 25 <= audioProgress
                        ? colors.primary
                        : colors.border
                      : colors.border,
                  },
                ]}
              />
            ))}
          </View>
          <View style={styles.audioMeta}>
            <Text style={styles.audioTime}>
              {isPlaying && audioDuration > 0
                ? formatDuration(audioProgress * audioDuration)
                : formatDate(item.created_at)}
            </Text>
            {isOwn && (
              <View style={styles.ownLabel}>
                <Text style={styles.ownLabelText}>Вы</Text>
              </View>
            )}
          </View>
        </View>
      </Pressable>
    );
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => {
            safeHaptic();
            if (router.canGoBack()) {
              router.back();
            } else {
              router.replace("/(tabs)");
            }
          }}
        >
          <Ionicons name="arrow-back" size={24} color={colors.textLight} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Профиль</Text>
        <View style={styles.headerRight} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Profile Info */}
        <View style={styles.profileSection}>
          {profile.avatar_url ? (
            <Image source={{ uri: profile.avatar_url }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, { backgroundColor: avatarColor }]}>
              <Text style={styles.avatarText}>
                {profile.username?.charAt(0).toUpperCase() || "?"}
              </Text>
            </View>
          )}

          <Text style={styles.username}>{profile.username}</Text>

          <Text style={styles.joinDate}>
            В приложении с {formatDate(profile.created_at)}
          </Text>
        </View>

        {/* Stats */}
        <View style={styles.statsContainer}>
          <View style={styles.statItem}>
            <View style={[styles.statIcon, { backgroundColor: "#E3F2FD" }]}>
              <Ionicons name="image" size={20} color="#2196F3" />
            </View>
            <Text style={styles.statValue}>{mediaCount.images}</Text>
            <Text style={styles.statLabel}>Фото</Text>
          </View>

          <View style={styles.statItem}>
            <View style={[styles.statIcon, { backgroundColor: "#FCE4EC" }]}>
              <Ionicons name="videocam" size={20} color="#E91E63" />
            </View>
            <Text style={styles.statValue}>{mediaCount.videos}</Text>
            <Text style={styles.statLabel}>Видео</Text>
          </View>

          <View style={styles.statItem}>
            <View style={[styles.statIcon, { backgroundColor: "#FFF3E0" }]}>
              <Ionicons name="mic" size={20} color="#FF9800" />
            </View>
            <Text style={styles.statValue}>{mediaCount.audio}</Text>
            <Text style={styles.statLabel}>Аудио</Text>
          </View>
        </View>

        {/* Tabs */}
        <View style={styles.tabsContainer}>
          <TouchableOpacity
            style={[styles.tab, activeTab === "media" && styles.activeTab]}
            onPress={() => setActiveTab("media")}
          >
            <Ionicons
              name="images"
              size={22}
              color={activeTab === "media" ? colors.primary : colors.textMuted}
            />
            <Text
              style={[
                styles.tabText,
                activeTab === "media" && styles.activeTabText,
              ]}
            >
              Медиа
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tab, activeTab === "audio" && styles.activeTab]}
            onPress={() => setActiveTab("audio")}
          >
            <Ionicons
              name="musical-notes"
              size={22}
              color={activeTab === "audio" ? colors.primary : colors.textMuted}
            />
            <Text
              style={[
                styles.tabText,
                activeTab === "audio" && styles.activeTabText,
              ]}
            >
              Аудио
            </Text>
          </TouchableOpacity>
        </View>

        {/* Media Grid / Audio List */}
        {activeTab === "media" ? (
          mediaItems.length > 0 ? (
            <FlatList
              key="media-grid"
              data={mediaItems}
              renderItem={renderMediaItem}
              keyExtractor={(item) => item.id}
              numColumns={3}
              scrollEnabled={false}
              style={styles.mediaGrid}
              columnWrapperStyle={styles.mediaRow}
            />
          ) : (
            <View style={styles.emptyState}>
              <Ionicons
                name="images-outline"
                size={48}
                color={colors.textMuted}
              />
              <Text style={styles.emptyText}>Нет общих фото и видео</Text>
            </View>
          )
        ) : audioItems.length > 0 ? (
          <FlatList
            key="audio-list"
            data={audioItems}
            renderItem={renderAudioItem}
            keyExtractor={(item) => item.id}
            scrollEnabled={false}
            style={styles.audioList}
          />
        ) : (
          <View style={styles.emptyState}>
            <Ionicons
              name="musical-notes-outline"
              size={48}
              color={colors.textMuted}
            />
            <Text style={styles.emptyText}>Нет голосовых сообщений</Text>
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Fullscreen Media Viewer */}
      <Modal
        visible={!!fullscreenMedia}
        transparent
        animationType="fade"
        onRequestClose={() => setFullscreenMedia(null)}
      >
        <View style={styles.fullscreenOverlay}>
          <TouchableOpacity
            style={styles.fullscreenClose}
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

      {/* Media Actions Modal */}
      <Modal
        visible={showMediaActions}
        transparent
        animationType="none"
        onRequestClose={closeMediaActions}
      >
        <Pressable style={styles.actionsOverlay} onPress={closeMediaActions}>
          <Animated.View
            style={[
              styles.actionsContainer,
              {
                transform: [
                  {
                    translateY: menuAnimation.interpolate({
                      inputRange: [0, 1],
                      outputRange: [300, 0],
                    }),
                  },
                ],
                opacity: menuAnimation,
              },
            ]}
          >
            <View style={styles.actionsHandle} />

            <Text style={styles.actionsTitle}>
              {selectedMedia?.type === "image"
                ? "Фото"
                : selectedMedia?.type === "video"
                  ? "Видео"
                  : "Аудио"}
            </Text>

            {/* Preview for image */}
            {selectedMedia?.type === "image" && (
              <Image
                source={{ uri: selectedMedia.url }}
                style={styles.actionsPreview}
                resizeMode="cover"
              />
            )}

            <View style={styles.actionsList}>
              {/* View full */}
              {selectedMedia?.type !== "audio" && (
                <TouchableOpacity
                  style={styles.actionItem}
                  onPress={() => {
                    closeMediaActions();
                    setTimeout(() => setFullscreenMedia(selectedMedia), 200);
                  }}
                >
                  <View
                    style={[
                      styles.actionIcon,
                      { backgroundColor: colors.primaryLight },
                    ]}
                  >
                    <Ionicons name="expand" size={22} color={colors.primary} />
                  </View>
                  <Text style={styles.actionText}>Открыть</Text>
                </TouchableOpacity>
              )}

              {/* Play audio */}
              {selectedMedia?.type === "audio" && (
                <TouchableOpacity
                  style={styles.actionItem}
                  onPress={() => {
                    if (selectedMedia) {
                      playAudio(selectedMedia);
                    }
                    closeMediaActions();
                  }}
                >
                  <View
                    style={[
                      styles.actionIcon,
                      { backgroundColor: colors.primaryLight },
                    ]}
                  >
                    <Ionicons
                      name={
                        playingAudioId === selectedMedia?.id ? "pause" : "play"
                      }
                      size={22}
                      color={colors.primary}
                    />
                  </View>
                  <Text style={styles.actionText}>
                    {playingAudioId === selectedMedia?.id
                      ? "Остановить"
                      : "Воспроизвести"}
                  </Text>
                </TouchableOpacity>
              )}

              {/* Delete - only for own media */}
              {selectedMedia?.sender_id === user?.id && (
                <TouchableOpacity
                  style={styles.actionItem}
                  onPress={deleteMedia}
                >
                  <View
                    style={[styles.actionIcon, { backgroundColor: "#FFEBEE" }]}
                  >
                    <Ionicons
                      name="trash-outline"
                      size={22}
                      color={colors.error}
                    />
                  </View>
                  <Text style={[styles.actionText, { color: colors.error }]}>
                    Удалить
                  </Text>
                </TouchableOpacity>
              )}

              {/* Info */}
              <View style={styles.actionInfo}>
                <Ionicons
                  name="time-outline"
                  size={14}
                  color={colors.textMuted}
                />
                <Text style={styles.actionInfoText}>
                  {selectedMedia ? formatDate(selectedMedia.created_at) : ""}
                </Text>
                {selectedMedia?.sender_id === user?.id ? (
                  <Text style={styles.actionInfoBadge}>Ваше</Text>
                ) : (
                  <Text style={styles.actionInfoBadge}>
                    От {profile?.username}
                  </Text>
                )}
              </View>
            </View>

            <TouchableOpacity
              style={styles.actionCancel}
              onPress={closeMediaActions}
            >
              <Text style={styles.actionCancelText}>Отмена</Text>
            </TouchableOpacity>
          </Animated.View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: colors.background,
  },
  errorContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: colors.background,
    padding: 20,
  },
  errorText: {
    fontSize: 18,
    color: colors.textSecondary,
    marginTop: 16,
    marginBottom: 24,
  },
  backButtonLarge: {
    backgroundColor: colors.primary,
    paddingHorizontal: 32,
    paddingVertical: 12,
    borderRadius: 24,
  },
  backButtonText: {
    color: colors.textLight,
    fontSize: 16,
    fontWeight: "600",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 50,
    paddingBottom: 14,
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
  headerRight: {
    width: 40,
  },
  content: {
    flex: 1,
  },
  profileSection: {
    alignItems: "center",
    paddingVertical: 32,
    backgroundColor: colors.background,
  },
  avatar: {
    width: 120,
    height: 120,
    borderRadius: 60,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
  },
  avatarText: {
    fontSize: 48,
    fontWeight: "600",
    color: colors.textLight,
  },
  username: {
    fontSize: 28,
    fontWeight: "bold",
    color: colors.textPrimary,
    marginBottom: 8,
  },
  joinDate: {
    fontSize: 14,
    color: colors.textMuted,
  },
  statsContainer: {
    flexDirection: "row",
    justifyContent: "space-around",
    paddingVertical: 20,
    paddingHorizontal: 16,
    backgroundColor: colors.backgroundSecondary,
    marginHorizontal: 16,
    borderRadius: 16,
    marginBottom: 20,
  },
  statItem: {
    alignItems: "center",
  },
  statIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 8,
  },
  statValue: {
    fontSize: 20,
    fontWeight: "bold",
    color: colors.textPrimary,
  },
  statLabel: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
  },
  tabsContainer: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    marginHorizontal: 16,
  },
  tab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    gap: 8,
  },
  activeTab: {
    borderBottomWidth: 2,
    borderBottomColor: colors.primary,
  },
  tabText: {
    fontSize: 14,
    color: colors.textMuted,
    fontWeight: "500",
  },
  activeTabText: {
    color: colors.primary,
  },
  mediaGrid: {
    paddingHorizontal: 2,
    paddingTop: 2,
  },
  mediaRow: {
    gap: 2,
  },
  mediaItem: {
    width: MEDIA_SIZE,
    height: MEDIA_SIZE,
    marginBottom: 2,
  },
  mediaThumbnail: {
    width: "100%",
    height: "100%",
    backgroundColor: colors.border,
  },
  videoOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.3)",
  },
  audioList: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  audioItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.backgroundSecondary,
    padding: 14,
    borderRadius: 12,
    marginBottom: 8,
  },
  audioIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primaryLight,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  audioInfo: {
    flex: 1,
  },
  audioTitle: {
    fontSize: 15,
    fontWeight: "500",
    color: colors.textPrimary,
  },
  audioDate: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: 48,
  },
  emptyText: {
    fontSize: 15,
    color: colors.textMuted,
    marginTop: 12,
  },
  fullscreenOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.95)",
    justifyContent: "center",
    alignItems: "center",
  },
  fullscreenClose: {
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
    width: SCREEN_WIDTH,
    height: Dimensions.get("window").height * 0.8,
  },
  fullscreenVideo: {
    width: SCREEN_WIDTH,
    height: Dimensions.get("window").height * 0.7,
  },
  // Own badge styles
  ownBadge: {
    position: "absolute",
    bottom: 4,
    right: 4,
    backgroundColor: colors.primary,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  ownBadgeText: {
    fontSize: 9,
    color: colors.textLight,
    fontWeight: "600",
  },
  // Audio player styles
  audioItemPlaying: {
    backgroundColor: colors.primaryLight,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  audioPlayBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primary,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  audioPlayBtnActive: {
    backgroundColor: "#4CAF50",
  },
  audioContent: {
    flex: 1,
  },
  audioWaveform: {
    flexDirection: "row",
    alignItems: "center",
    height: 24,
    gap: 2,
    marginBottom: 4,
  },
  audioBar: {
    width: 3,
    borderRadius: 1.5,
    backgroundColor: colors.border,
  },
  audioMeta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  audioTime: {
    fontSize: 12,
    color: colors.textMuted,
    fontWeight: "500",
  },
  ownLabel: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  ownLabelText: {
    fontSize: 11,
    color: colors.primary,
    fontWeight: "500",
  },
  // Actions modal styles
  actionsOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "flex-end",
  },
  actionsContainer: {
    backgroundColor: colors.background,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingBottom: 34,
    paddingTop: 12,
    paddingHorizontal: 20,
    maxHeight: "80%",
  },
  actionsHandle: {
    width: 40,
    height: 4,
    backgroundColor: colors.border,
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: 16,
  },
  actionsTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.textPrimary,
    textAlign: "center",
    marginBottom: 16,
  },
  actionsPreview: {
    width: "100%",
    height: 200,
    borderRadius: 12,
    marginBottom: 16,
  },
  actionsList: {
    gap: 8,
  },
  actionItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    backgroundColor: colors.backgroundSecondary,
    borderRadius: 12,
  },
  actionIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 14,
  },
  actionText: {
    fontSize: 16,
    fontWeight: "500",
    color: colors.textPrimary,
  },
  actionInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 4,
  },
  actionInfoText: {
    fontSize: 13,
    color: colors.textMuted,
    flex: 1,
  },
  actionInfoBadge: {
    fontSize: 12,
    color: colors.primary,
    fontWeight: "500",
    backgroundColor: colors.primaryLight,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  actionCancel: {
    marginTop: 12,
    padding: 16,
    alignItems: "center",
    backgroundColor: colors.backgroundSecondary,
    borderRadius: 12,
  },
  actionCancelText: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.textSecondary,
  },
});
