import { getAvatarColor } from "@/constants/colors";
import { useAuth } from "@/contexts/auth-context";
import { useTheme } from "@/contexts/theme-context";
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
    Linking,
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

interface FileItem {
  id: string;
  url: string;
  name: string;
  size: number;
  created_at: string;
  sender_id: string;
}

interface LinkItem {
  id: string;
  url: string;
  title: string;
  created_at: string;
  sender_id: string;
}

type MediaTab = "media" | "audio" | "files" | "links";

export default function UserProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const { colors } = useTheme();
  const router = useRouter();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [mediaItems, setMediaItems] = useState<MediaItem[]>([]);
  const [audioItems, setAudioItems] = useState<MediaItem[]>([]);
  const [fileItems, setFileItems] = useState<FileItem[]>([]);
  const [linkItems, setLinkItems] = useState<LinkItem[]>([]);
  const [activeTab, setActiveTab] = useState<MediaTab>("media");
  const [fullscreenMedia, setFullscreenMedia] = useState<MediaItem | null>(
    null,
  );
  const [showAvatarViewer, setShowAvatarViewer] = useState(false);
  const [mediaCount, setMediaCount] = useState({
    images: 0,
    videos: 0,
    audio: 0,
    files: 0,
    links: 0,
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
      const commonChatIds = myIds.filter((chatId) => theirIds.includes(chatId));

      if (commonChatIds.length === 0) return;

      // Получить все сообщения с медиа из общих чатов
      const { data: messages } = await supabase
        .from("messages")
        .select(
          "id, content, media_url, media_type, file_name, file_size, created_at, sender_id",
        )
        .in("chat_id", commonChatIds)
        .order("created_at", { ascending: false });

      if (!messages) return;

      const media: MediaItem[] = [];
      const audio: MediaItem[] = [];
      const files: FileItem[] = [];
      const links: LinkItem[] = [];
      let imgCount = 0,
        vidCount = 0,
        audCount = 0,
        fileCount = 0,
        linkCount = 0;

      messages.forEach((msg) => {
        // Обработка медиа
        if (msg.media_url && msg.media_type) {
          if (msg.media_type === "image") {
            media.push({
              id: msg.id,
              url: msg.media_url,
              type: "image",
              created_at: msg.created_at,
              sender_id: msg.sender_id,
            });
            imgCount++;
          } else if (msg.media_type === "video") {
            media.push({
              id: msg.id,
              url: msg.media_url,
              type: "video",
              created_at: msg.created_at,
              sender_id: msg.sender_id,
            });
            vidCount++;
          } else if (msg.media_type === "audio") {
            audio.push({
              id: msg.id,
              url: msg.media_url,
              type: "audio",
              created_at: msg.created_at,
              sender_id: msg.sender_id,
            });
            audCount++;
          } else if (msg.media_type === "file") {
            files.push({
              id: msg.id,
              url: msg.media_url,
              name: msg.file_name || "Документ",
              size: msg.file_size || 0,
              created_at: msg.created_at,
              sender_id: msg.sender_id,
            });
            fileCount++;
          }
        }

        // Извлечение ссылок из текста
        if (msg.content) {
          // Создаём новый regex для каждого сообщения
          const urlRegex = /(https?:\/\/[^\s<>"{}|\\^`[\]]+)/g;
          const foundUrls = msg.content.match(urlRegex);
          if (foundUrls) {
            foundUrls.forEach((url: string) => {
              // Убираем возможные знаки препинания в конце
              const cleanUrl = url.replace(/[.,;:!?)]+$/, "");
              // Проверяем что это не ссылка на медиа в Supabase storage
              if (!cleanUrl.includes("supabase.co/storage")) {
                links.push({
                  id: `${msg.id}-${linkCount}`,
                  url: cleanUrl,
                  title: extractDomain(cleanUrl),
                  created_at: msg.created_at,
                  sender_id: msg.sender_id,
                });
                linkCount++;
              }
            });
          }
        }
      });

      setMediaItems(media);
      setAudioItems(audio);
      setFileItems(files);
      setLinkItems(links);
      setMediaCount({
        images: imgCount,
        videos: vidCount,
        audio: audCount,
        files: fileCount,
        links: linkCount,
      });
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

  const extractDomain = (url: string) => {
    try {
      const domain = new URL(url).hostname.replace("www.", "");
      return domain;
    } catch {
      return url.substring(0, 30);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getFileIcon = (fileName: string) => {
    const ext = fileName.split(".").pop()?.toLowerCase() || "";
    if (["pdf"].includes(ext)) return "document-text";
    if (["doc", "docx"].includes(ext)) return "document";
    if (["xls", "xlsx"].includes(ext)) return "grid";
    if (["ppt", "pptx"].includes(ext)) return "easel";
    if (["zip", "rar", "7z"].includes(ext)) return "archive";
    if (["txt", "rtf"].includes(ext)) return "document-text-outline";
    return "document-attach";
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

  if (!profile) {
    return (
      <View
        style={[styles.errorContainer, { backgroundColor: colors.background }]}
      >
        <Ionicons name="person-outline" size={64} color={colors.textMuted} />
        <Text style={[styles.errorText, { color: colors.textSecondary }]}>
          Пользователь не найден
        </Text>
        <TouchableOpacity
          style={[styles.backButtonLarge, { backgroundColor: colors.primary }]}
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
        style={[
          styles.audioItem,
          { backgroundColor: colors.card },
          isPlaying && {
            backgroundColor: colors.primaryLight,
            borderWidth: 1,
            borderColor: colors.primary,
          },
        ]}
        onPress={() => playAudio(item)}
        onLongPress={() => {
          safeHaptic();
          openMediaActions(item);
        }}
        delayLongPress={300}
      >
        <TouchableOpacity
          style={[
            styles.audioPlayBtn,
            { backgroundColor: colors.primary },
            isPlaying && styles.audioPlayBtnActive,
          ]}
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
            <Text style={[styles.audioTime, { color: colors.textMuted }]}>
              {isPlaying && audioDuration > 0
                ? formatDuration(audioProgress * audioDuration)
                : formatDate(item.created_at)}
            </Text>
            {isOwn && (
              <View style={styles.ownLabel}>
                <Text style={[styles.ownLabelText, { color: colors.primary }]}>
                  Вы
                </Text>
              </View>
            )}
          </View>
        </View>
      </Pressable>
    );
  };

  const renderFileItem = ({ item }: { item: FileItem }) => {
    const isOwn = item.sender_id === user?.id;

    return (
      <TouchableOpacity
        style={[styles.fileItem, { backgroundColor: colors.card }]}
        onPress={() => Linking.openURL(item.url)}
        activeOpacity={0.7}
      >
        <View
          style={[
            styles.fileIconContainer,
            { backgroundColor: colors.primaryLight },
          ]}
        >
          <Ionicons
            name={getFileIcon(item.name)}
            size={24}
            color={colors.primary}
          />
        </View>
        <View style={styles.fileContent}>
          <Text
            style={[styles.fileItemName, { color: colors.text }]}
            numberOfLines={1}
          >
            {item.name}
          </Text>
          <View style={styles.fileMeta}>
            <Text style={[styles.fileItemSize, { color: colors.textMuted }]}>
              {formatFileSize(item.size)}
            </Text>
            <Text style={[styles.fileItemDate, { color: colors.textMuted }]}>
              {formatDate(item.created_at)}
            </Text>
            {isOwn && (
              <View style={styles.ownLabel}>
                <Text style={[styles.ownLabelText, { color: colors.primary }]}>
                  Вы
                </Text>
              </View>
            )}
          </View>
        </View>
        <Ionicons name="download-outline" size={20} color={colors.textMuted} />
      </TouchableOpacity>
    );
  };

  const renderLinkItem = ({ item }: { item: LinkItem }) => {
    const isOwn = item.sender_id === user?.id;

    return (
      <TouchableOpacity
        style={[styles.linkItem, { backgroundColor: colors.card }]}
        onPress={() => Linking.openURL(item.url)}
        activeOpacity={0.7}
      >
        <View
          style={[styles.linkIconContainer, { backgroundColor: "#E8F5E9" }]}
        >
          <Ionicons name="link" size={22} color="#4CAF50" />
        </View>
        <View style={styles.linkContent}>
          <Text
            style={[styles.linkTitle, { color: colors.primary }]}
            numberOfLines={1}
          >
            {item.title}
          </Text>
          <Text
            style={[styles.linkUrl, { color: colors.textMuted }]}
            numberOfLines={1}
          >
            {item.url}
          </Text>
          <View style={styles.linkMeta}>
            <Text style={[styles.linkDate, { color: colors.textMuted }]}>
              {formatDate(item.created_at)}
            </Text>
            {isOwn && (
              <View style={styles.ownLabel}>
                <Text style={[styles.ownLabelText, { color: colors.primary }]}>
                  Вы
                </Text>
              </View>
            )}
          </View>
        </View>
        <Ionicons name="open-outline" size={18} color={colors.textMuted} />
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
            safeHaptic();
            if (router.canGoBack()) {
              router.back();
            } else {
              router.replace("/(tabs)");
            }
          }}
        >
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Профиль</Text>
        <View style={styles.headerRight} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Profile Info */}
        <View
          style={[
            styles.profileSection,
            { backgroundColor: colors.background },
          ]}
        >
          <TouchableOpacity
            onPress={() => {
              safeHaptic();
              setShowAvatarViewer(true);
            }}
            activeOpacity={0.8}
          >
            {profile.avatar_url ? (
              <Image
                source={{ uri: profile.avatar_url }}
                style={styles.avatar}
              />
            ) : (
              <View style={[styles.avatar, { backgroundColor: avatarColor }]}>
                <Text style={styles.avatarText}>
                  {profile.username?.charAt(0).toUpperCase() || "?"}
                </Text>
              </View>
            )}
          </TouchableOpacity>

          <Text style={[styles.username, { color: colors.text }]}>
            {profile.username}
          </Text>

          <Text style={[styles.joinDate, { color: colors.textMuted }]}>
            В приложении с {formatDate(profile.created_at)}
          </Text>
        </View>

        {/* Stats */}
        <View style={[styles.statsContainer, { backgroundColor: colors.card }]}>
          <View style={styles.statItem}>
            <View style={[styles.statIcon, { backgroundColor: "#E3F2FD" }]}>
              <Ionicons name="image" size={18} color="#2196F3" />
            </View>
            <Text style={[styles.statValue, { color: colors.text }]}>
              {mediaCount.images}
            </Text>
            <Text style={[styles.statLabel, { color: colors.textMuted }]}>
              Фото
            </Text>
          </View>

          <View style={styles.statItem}>
            <View style={[styles.statIcon, { backgroundColor: "#FCE4EC" }]}>
              <Ionicons name="videocam" size={18} color="#E91E63" />
            </View>
            <Text style={[styles.statValue, { color: colors.text }]}>
              {mediaCount.videos}
            </Text>
            <Text style={[styles.statLabel, { color: colors.textMuted }]}>
              Видео
            </Text>
          </View>

          <View style={styles.statItem}>
            <View style={[styles.statIcon, { backgroundColor: "#FFF3E0" }]}>
              <Ionicons name="mic" size={18} color="#FF9800" />
            </View>
            <Text style={[styles.statValue, { color: colors.text }]}>
              {mediaCount.audio}
            </Text>
            <Text style={[styles.statLabel, { color: colors.textMuted }]}>
              Аудио
            </Text>
          </View>

          <View style={styles.statItem}>
            <View style={[styles.statIcon, { backgroundColor: "#E8EAF6" }]}>
              <Ionicons name="document" size={18} color="#5C6BC0" />
            </View>
            <Text style={[styles.statValue, { color: colors.text }]}>
              {mediaCount.files}
            </Text>
            <Text style={[styles.statLabel, { color: colors.textMuted }]}>
              Файлы
            </Text>
          </View>

          <View style={styles.statItem}>
            <View style={[styles.statIcon, { backgroundColor: "#E8F5E9" }]}>
              <Ionicons name="link" size={18} color="#4CAF50" />
            </View>
            <Text style={[styles.statValue, { color: colors.text }]}>
              {mediaCount.links}
            </Text>
            <Text style={[styles.statLabel, { color: colors.textMuted }]}>
              Ссылки
            </Text>
          </View>
        </View>

        {/* Tabs */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={[styles.tabsContainer, { borderBottomColor: colors.border }]}
          contentContainerStyle={styles.tabsContent}
        >
          <TouchableOpacity
            style={[
              styles.tab,
              activeTab === "media" && [
                styles.activeTab,
                { borderBottomColor: colors.primary },
              ],
            ]}
            onPress={() => setActiveTab("media")}
          >
            <Ionicons
              name="images"
              size={20}
              color={activeTab === "media" ? colors.primary : colors.textMuted}
            />
            <Text
              style={[
                styles.tabText,
                { color: colors.textMuted },
                activeTab === "media" && { color: colors.primary },
              ]}
            >
              Медиа
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.tab,
              activeTab === "audio" && [
                styles.activeTab,
                { borderBottomColor: colors.primary },
              ],
            ]}
            onPress={() => setActiveTab("audio")}
          >
            <Ionicons
              name="musical-notes"
              size={20}
              color={activeTab === "audio" ? colors.primary : colors.textMuted}
            />
            <Text
              style={[
                styles.tabText,
                { color: colors.textMuted },
                activeTab === "audio" && { color: colors.primary },
              ]}
            >
              Аудио
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.tab,
              activeTab === "files" && [
                styles.activeTab,
                { borderBottomColor: colors.primary },
              ],
            ]}
            onPress={() => setActiveTab("files")}
          >
            <Ionicons
              name="document"
              size={20}
              color={activeTab === "files" ? colors.primary : colors.textMuted}
            />
            <Text
              style={[
                styles.tabText,
                { color: colors.textMuted },
                activeTab === "files" && { color: colors.primary },
              ]}
            >
              Файлы
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.tab,
              activeTab === "links" && [
                styles.activeTab,
                { borderBottomColor: colors.primary },
              ],
            ]}
            onPress={() => setActiveTab("links")}
          >
            <Ionicons
              name="link"
              size={20}
              color={activeTab === "links" ? colors.primary : colors.textMuted}
            />
            <Text
              style={[
                styles.tabText,
                { color: colors.textMuted },
                activeTab === "links" && { color: colors.primary },
              ]}
            >
              Ссылки
            </Text>
          </TouchableOpacity>
        </ScrollView>

        {/* Content based on active tab */}
        {activeTab === "media" &&
          (mediaItems.length > 0 ? (
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
              <Text style={[styles.emptyText, { color: colors.textMuted }]}>
                Нет общих фото и видео
              </Text>
            </View>
          ))}

        {activeTab === "audio" &&
          (audioItems.length > 0 ? (
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
              <Text style={[styles.emptyText, { color: colors.textMuted }]}>
                Нет голосовых сообщений
              </Text>
            </View>
          ))}

        {activeTab === "files" &&
          (fileItems.length > 0 ? (
            <FlatList
              key="files-list"
              data={fileItems}
              renderItem={renderFileItem}
              keyExtractor={(item) => item.id}
              scrollEnabled={false}
              style={styles.filesList}
            />
          ) : (
            <View style={styles.emptyState}>
              <Ionicons
                name="document-outline"
                size={48}
                color={colors.textMuted}
              />
              <Text style={[styles.emptyText, { color: colors.textMuted }]}>
                Нет общих файлов
              </Text>
            </View>
          ))}

        {activeTab === "links" &&
          (linkItems.length > 0 ? (
            <FlatList
              key="links-list"
              data={linkItems}
              renderItem={renderLinkItem}
              keyExtractor={(item) => item.id}
              scrollEnabled={false}
              style={styles.linksList}
            />
          ) : (
            <View style={styles.emptyState}>
              <Ionicons
                name="link-outline"
                size={48}
                color={colors.textMuted}
              />
              <Text style={[styles.emptyText, { color: colors.textMuted }]}>
                Нет общих ссылок
              </Text>
            </View>
          ))}

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
              { backgroundColor: colors.background },
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
            <View
              style={[styles.actionsHandle, { backgroundColor: colors.border }]}
            />

            <Text style={[styles.actionsTitle, { color: colors.text }]}>
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
                  style={[styles.actionItem, { backgroundColor: colors.card }]}
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
                  <Text style={[styles.actionText, { color: colors.text }]}>
                    Открыть
                  </Text>
                </TouchableOpacity>
              )}

              {/* Play audio */}
              {selectedMedia?.type === "audio" && (
                <TouchableOpacity
                  style={[styles.actionItem, { backgroundColor: colors.card }]}
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
                  <Text style={[styles.actionText, { color: colors.text }]}>
                    {playingAudioId === selectedMedia?.id
                      ? "Остановить"
                      : "Воспроизвести"}
                  </Text>
                </TouchableOpacity>
              )}

              {/* Delete - only for own media */}
              {selectedMedia?.sender_id === user?.id && (
                <TouchableOpacity
                  style={[styles.actionItem, { backgroundColor: colors.card }]}
                  onPress={deleteMedia}
                >
                  <View
                    style={[styles.actionIcon, { backgroundColor: "#FFEBEE" }]}
                  >
                    <Ionicons name="trash-outline" size={22} color="#F44336" />
                  </View>
                  <Text style={[styles.actionText, { color: "#F44336" }]}>
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
                <Text
                  style={[styles.actionInfoText, { color: colors.textMuted }]}
                >
                  {selectedMedia ? formatDate(selectedMedia.created_at) : ""}
                </Text>
                {selectedMedia?.sender_id === user?.id ? (
                  <Text
                    style={[
                      styles.actionInfoBadge,
                      {
                        color: colors.primary,
                        backgroundColor: colors.primaryLight,
                      },
                    ]}
                  >
                    Ваше
                  </Text>
                ) : (
                  <Text
                    style={[
                      styles.actionInfoBadge,
                      {
                        color: colors.primary,
                        backgroundColor: colors.primaryLight,
                      },
                    ]}
                  >
                    От {profile?.username}
                  </Text>
                )}
              </View>
            </View>

            <TouchableOpacity
              style={[styles.actionCancel, { backgroundColor: colors.card }]}
              onPress={closeMediaActions}
            >
              <Text
                style={[
                  styles.actionCancelText,
                  { color: colors.textSecondary },
                ]}
              >
                Отмена
              </Text>
            </TouchableOpacity>
          </Animated.View>
        </Pressable>
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

          {profile?.avatar_url ? (
            <Image
              source={{ uri: profile.avatar_url }}
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
                {profile?.username?.charAt(0).toUpperCase() || "?"}
              </Text>
            </View>
          )}

          <View style={styles.avatarViewerInfo}>
            <Text style={styles.avatarViewerName}>{profile?.username}</Text>
            <Text style={styles.avatarViewerSubtitle}>
              В приложении с {formatDate(profile?.created_at || "")}
            </Text>
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
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  errorContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  errorText: {
    fontSize: 18,
    marginTop: 16,
    marginBottom: 24,
  },
  backButtonLarge: {
    paddingHorizontal: 32,
    paddingVertical: 12,
    borderRadius: 24,
  },
  backButtonText: {
    color: "#fff",
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
    color: "#fff",
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
    color: "#fff",
  },
  username: {
    fontSize: 28,
    fontWeight: "bold",
    marginBottom: 8,
  },
  joinDate: {
    fontSize: 14,
  },
  statsContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 16,
    paddingHorizontal: 12,
    marginHorizontal: 16,
    borderRadius: 16,
    marginBottom: 20,
  },
  statItem: {
    alignItems: "center",
    flex: 1,
  },
  statIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 6,
  },
  statValue: {
    fontSize: 18,
    fontWeight: "bold",
  },
  statLabel: {
    fontSize: 10,
    marginTop: 2,
  },
  tabsContainer: {
    borderBottomWidth: 1,
    marginHorizontal: 16,
  },
  tab: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 6,
  },
  activeTab: {
    borderBottomWidth: 2,
  },
  tabText: {
    fontSize: 14,
    fontWeight: "500",
  },
  activeTabText: {},
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
    padding: 14,
    borderRadius: 12,
    marginBottom: 8,
  },
  audioIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
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
  },
  audioDate: {
    fontSize: 12,
    marginTop: 2,
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: 48,
  },
  emptyText: {
    fontSize: 15,
    marginTop: 12,
  },
  // Files list styles
  filesList: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  fileItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderRadius: 12,
    marginBottom: 8,
  },
  fileIconContainer: {
    width: 44,
    height: 44,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  fileContent: {
    flex: 1,
    marginRight: 8,
  },
  fileItemName: {
    fontSize: 15,
    fontWeight: "500",
    marginBottom: 4,
  },
  fileMeta: {
    flexDirection: "row",
    alignItems: "center",
  },
  fileItemSize: {
    fontSize: 12,
    marginRight: 8,
  },
  fileItemDate: {
    fontSize: 12,
  },
  // Links list styles
  linksList: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  linkItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderRadius: 12,
    marginBottom: 8,
  },
  linkIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  linkContent: {
    flex: 1,
    marginRight: 8,
  },
  linkTitle: {
    fontSize: 15,
    fontWeight: "500",
    marginBottom: 2,
  },
  linkUrl: {
    fontSize: 13,
    marginBottom: 4,
  },
  linkMeta: {
    flexDirection: "row",
    alignItems: "center",
  },
  linkDate: {
    fontSize: 12,
  },
  tabsContent: {
    paddingHorizontal: 8,
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
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: "#007AFF",
  },
  ownBadgeText: {
    fontSize: 9,
    color: "#fff",
    fontWeight: "600",
  },
  // Audio player styles
  audioItemPlaying: {},
  audioPlayBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
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
  },
  audioMeta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  audioTime: {
    fontSize: 12,
    fontWeight: "500",
  },
  ownLabel: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  ownLabelText: {
    fontSize: 11,
    fontWeight: "500",
  },
  // Actions modal styles
  actionsOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "flex-end",
  },
  actionsContainer: {
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
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: 16,
  },
  actionsTitle: {
    fontSize: 18,
    fontWeight: "700",
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
    flex: 1,
  },
  actionInfoBadge: {
    fontSize: 12,
    fontWeight: "500",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  actionCancel: {
    marginTop: 12,
    padding: 16,
    alignItems: "center",
    borderRadius: 12,
  },
  actionCancelText: {
    fontSize: 16,
    fontWeight: "600",
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
});
