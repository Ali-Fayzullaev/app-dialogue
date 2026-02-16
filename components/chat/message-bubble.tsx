/**
 * MessageBubble — компонент отображения отдельного сообщения в чате.
 * Вынесен из chat/[id].tsx для декомпозиции (~460 строк JSX).
 */

import LinkPreviewCard from "@/components/link-preview-card";
import { ReactionDisplay } from "@/components/message-reactions";
import VoiceMessageBubble from "@/components/voice-message-bubble";
import { getAvatarColor } from "@/constants/colors";
import {
    formatFileSize,
    formatMessageTime,
    getFileIcon,
} from "@/lib/chat-helpers";
import { GroupedReaction, Profile } from "@/types/database";
import { Ionicons } from "@expo/vector-icons";
import { Audio, ResizeMode, Video } from "expo-av";
import React from "react";
import {
    Animated,
    Image,
    Linking,
    Platform,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";

export interface MessageItem {
  id: string;
  sender_id: string;
  content: string;
  created_at: string;
  updated_at: string | null;
  media_url: string | null;
  media_type: "image" | "video" | "audio" | "location" | "file" | null;
  latitude: number | null;
  longitude: number | null;
  location_name: string | null;
  file_name: string | null;
  file_size: number | null;
  audio_waveform: number[] | null;
  audio_duration: number | null;
  is_read: boolean;
  is_delivered: boolean;
  forwarded_from_username: string | null;
  sender: Profile | null;
  replied_message?: {
    id: string;
    content: string | null;
    sender: Profile | null;
    media_type: "image" | "video" | "audio" | "location" | "file" | null;
  } | null;
  reactions?: GroupedReaction[];
}

interface MessageBubbleProps {
  item: MessageItem;
  isMyMessage: boolean;
  isGroup: boolean;
  isSelected: boolean;
  isSelectMode: boolean;
  isHighlighted: boolean;
  isDark: boolean;
  colors: Record<string, any>;
  searchQuery: string;
  playingAudioId: string | null;
  soundRef: React.MutableRefObject<Audio.Sound | null>;
  highlightAnimation: Animated.Value;
  // Callbacks
  onLongPress: (message: MessageItem) => void;
  onToggleSelect: (messageId: string) => void;
  onMediaPress: (url: string, type: "image" | "video") => void;
  onDocumentPress: (url: string, name: string) => void;
  onReplyPress: (messageId: string) => void;
  onToggleReaction: (messageId: string, emoji: string) => void;
  onReactionLongPress: (
    reaction: GroupedReaction,
    allReactions: GroupedReaction[],
  ) => void;
  onPlayStateChange: (id: string | null) => void;
}

const MessageBubble: React.FC<MessageBubbleProps> = React.memo(
  ({
    item,
    isMyMessage,
    isGroup,
    isSelected,
    isSelectMode,
    isHighlighted,
    isDark,
    colors,
    searchQuery,
    playingAudioId,
    soundRef,
    highlightAnimation,
    onLongPress,
    onToggleSelect,
    onMediaPress,
    onDocumentPress,
    onReplyPress,
    onToggleReaction,
    onReactionLongPress,
    onPlayStateChange,
  }) => {
    const myMessageTextColor = isMyMessage
      ? isDark
        ? "#fff"
        : colors.text
      : colors.text;

    const renderTextWithLinks = (text: string) => {
      const urlRegex = /(https?:\/\/[^\s]+)/gi;
      const parts = text.split(urlRegex);

      if (parts.length === 1 && !urlRegex.test(text)) {
        return text;
      }

      return parts.map((part, index) => {
        if (urlRegex.test(part)) {
          urlRegex.lastIndex = 0;
          return (
            <Text
              key={index}
              style={[
                styles.linkText,
                { color: isMyMessage ? "#90CAF9" : colors.primary },
              ]}
              onPress={() => {
                if (Platform.OS === "web") {
                  window.open(part, "_blank");
                } else {
                  Linking.openURL(part);
                }
              }}
            >
              {part}
            </Text>
          );
        }
        urlRegex.lastIndex = 0;
        return part;
      });
    };

    const renderContent = () => {
      if (!searchQuery || searchQuery.trim().length < 2) {
        return (
          <Text style={[styles.messageText, { color: myMessageTextColor }]}>
            {renderTextWithLinks(item.content)}
          </Text>
        );
      }

      const text = item.content;
      const lowerText = text.toLowerCase();
      const lowerQuery = searchQuery.toLowerCase();
      const idx = lowerText.indexOf(lowerQuery);

      if (idx === -1) {
        return (
          <Text style={[styles.messageText, { color: myMessageTextColor }]}>
            {renderTextWithLinks(text)}
          </Text>
        );
      }

      const before = text.substring(0, idx);
      const match = text.substring(idx, idx + searchQuery.length);
      const after = text.substring(idx + searchQuery.length);

      return (
        <Text style={[styles.messageText, { color: myMessageTextColor }]}>
          {renderTextWithLinks(before)}
          <Text style={styles.searchHighlight}>{match}</Text>
          {renderTextWithLinks(after)}
        </Text>
      );
    };

    return (
      <Animated.View
        style={[
          isHighlighted && {
            backgroundColor: highlightAnimation.interpolate({
              inputRange: [0, 1],
              outputRange: ["transparent", colors.primaryLight],
            }),
            transform: [
              {
                scale: highlightAnimation.interpolate({
                  inputRange: [0, 0.5, 1],
                  outputRange: [1, 1.02, 1],
                }),
              },
            ],
          },
          isSelected && {
            backgroundColor: isDark
              ? "rgba(0,150,136,0.15)"
              : "rgba(0,150,136,0.08)",
          },
        ]}
      >
        <TouchableOpacity
          style={[
            styles.messageContainer,
            isMyMessage
              ? styles.myMessageContainer
              : styles.otherMessageContainer,
          ]}
          onLongPress={() => {
            if (isSelectMode) {
              onToggleSelect(item.id);
            } else {
              onLongPress(item);
            }
          }}
          onPress={isSelectMode ? () => onToggleSelect(item.id) : undefined}
          activeOpacity={isSelectMode ? 0.6 : 0.8}
          delayLongPress={300}
        >
          {/* Чекбокс в режиме выбора */}
          {isSelectMode && (
            <View
              style={[
                styles.selectCheckbox,
                isSelected && styles.selectCheckboxSelected,
                isSelected && { backgroundColor: colors.primary },
              ]}
            >
              {isSelected && (
                <Ionicons name="checkmark" size={16} color="#fff" />
              )}
            </View>
          )}
          <View
            style={[
              styles.messageBubble,
              isMyMessage
                ? [
                    styles.myMessageBubble,
                    { backgroundColor: colors.messageMine },
                  ]
                : [
                    styles.otherMessageBubble,
                    { backgroundColor: colors.messageOther },
                  ],
              item.media_url && styles.mediaBubble,
            ]}
          >
            {/* Sender name for group */}
            {isGroup && !isMyMessage && item.sender && (
              <Text
                style={[
                  styles.senderName,
                  { color: getAvatarColor(item.sender.id) },
                ]}
              >
                {item.sender.username}
              </Text>
            )}

            {/* Forwarded from label */}
            {item.forwarded_from_username && (
              <View style={styles.forwardedLabel}>
                <Ionicons
                  name="arrow-redo"
                  size={13}
                  color={
                    isMyMessage
                      ? isDark
                        ? "rgba(255,255,255,0.7)"
                        : colors.primary
                      : colors.primary
                  }
                  style={{ marginRight: 4 }}
                />
                <Text
                  style={[
                    styles.forwardedText,
                    {
                      color: isMyMessage
                        ? isDark
                          ? "rgba(255,255,255,0.7)"
                          : colors.primary
                        : colors.primary,
                    },
                  ]}
                  numberOfLines={1}
                >
                  Переслано от {item.forwarded_from_username}
                </Text>
              </View>
            )}

            {/* Replied message quote */}
            {item.replied_message && (
              <TouchableOpacity
                style={[
                  styles.repliedMessageContainer,
                  {
                    backgroundColor: isMyMessage
                      ? "rgba(255,255,255,0.15)"
                      : isDark
                        ? "rgba(255,255,255,0.08)"
                        : "rgba(0,0,0,0.05)",
                    borderLeftColor: colors.primary,
                  },
                ]}
                activeOpacity={0.7}
                onPress={() => {
                  if (item.replied_message?.id) {
                    onReplyPress(item.replied_message.id);
                  }
                }}
              >
                <Text
                  style={[
                    styles.repliedMessageSender,
                    { color: colors.primary },
                  ]}
                >
                  {item.replied_message.sender?.username || "Пользователь"}
                </Text>
                <Text
                  style={[
                    styles.repliedMessageText,
                    {
                      color: isMyMessage
                        ? "rgba(255,255,255,0.8)"
                        : colors.textSecondary,
                    },
                  ]}
                  numberOfLines={2}
                >
                  {item.replied_message.content ||
                    (item.replied_message.media_type === "image"
                      ? "Фото"
                      : item.replied_message.media_type === "video"
                        ? "Видео"
                        : item.replied_message.media_type === "location"
                          ? "Геолокация"
                          : item.replied_message.media_type === "file"
                            ? "Документ"
                            : "Аудио")}
                </Text>
              </TouchableOpacity>
            )}

            {/* Image */}
            {item.media_url && item.media_type === "image" && (
              <TouchableOpacity
                activeOpacity={0.9}
                onPress={() => onMediaPress(item.media_url!, "image")}
              >
                <Image
                  source={{ uri: item.media_url }}
                  style={styles.mediaImage}
                  resizeMode="cover"
                />
              </TouchableOpacity>
            )}

            {/* Video */}
            {item.media_url &&
              item.media_type === "video" &&
              Platform.OS !== "web" && (
                <TouchableOpacity
                  activeOpacity={0.9}
                  onPress={() => onMediaPress(item.media_url!, "video")}
                >
                  <Video
                    source={{ uri: item.media_url }}
                    style={styles.mediaVideo}
                    useNativeControls
                    resizeMode={ResizeMode.CONTAIN}
                    isLooping={false}
                  />
                </TouchableOpacity>
              )}
            {item.media_url &&
              item.media_type === "video" &&
              Platform.OS === "web" && (
                <View style={styles.mediaVideo}>
                  <Text style={{ color: colors.textMuted }}>
                    Видео (откройте в приложении)
                  </Text>
                </View>
              )}

            {/* Voice message */}
            {item.media_url && item.media_type === "audio" && (
              <VoiceMessageBubble
                messageId={item.id}
                audioUrl={item.media_url}
                isMyMessage={isMyMessage}
                waveform={item.audio_waveform}
                duration={item.audio_duration}
                playingAudioId={playingAudioId}
                onPlayStateChange={onPlayStateChange}
                soundRef={soundRef}
              />
            )}

            {/* Location */}
            {item.media_type === "location" &&
              item.latitude &&
              item.longitude && (
                <TouchableOpacity
                  style={styles.locationContainer}
                  activeOpacity={0.8}
                  onPress={() => {
                    const url = `https://www.google.com/maps/search/?api=1&query=${item.latitude},${item.longitude}`;
                    if (Platform.OS === "web") {
                      window.open(url, "_blank");
                    } else {
                      Linking.openURL(url);
                    }
                  }}
                >
                  <Image
                    source={{
                      uri: `https://static-maps.yandex.ru/1.x/?ll=${item.longitude},${item.latitude}&z=14&size=280,150&l=map&pt=${item.longitude},${item.latitude},pm2rdl`,
                    }}
                    style={styles.locationMap}
                    resizeMode="cover"
                  />
                  <View style={styles.locationInfo}>
                    <View style={styles.locationHeader}>
                      <Ionicons
                        name="location"
                        size={18}
                        color={colors.primary}
                      />
                      <Text
                        style={[styles.locationTitle, { color: colors.text }]}
                        numberOfLines={1}
                      >
                        {item.location_name || "Местоположение"}
                      </Text>
                    </View>
                    <Text
                      style={[
                        styles.locationCoords,
                        { color: colors.textSecondary },
                      ]}
                    >
                      {item.latitude.toFixed(6)}, {item.longitude.toFixed(6)}
                    </Text>
                  </View>
                </TouchableOpacity>
              )}

            {/* File / Document */}
            {item.media_type === "file" && item.media_url && (
              <TouchableOpacity
                style={[
                  styles.fileContainer,
                  {
                    backgroundColor: isMyMessage
                      ? "rgba(255,255,255,0.15)"
                      : isDark
                        ? "rgba(255,255,255,0.08)"
                        : "rgba(0,0,0,0.05)",
                  },
                ]}
                activeOpacity={0.7}
                onPress={() =>
                  onDocumentPress(item.media_url!, item.file_name || "Документ")
                }
                onLongPress={() => {
                  if (Platform.OS === "web") {
                    window.open(item.media_url!, "_blank");
                  } else {
                    Linking.openURL(item.media_url!);
                  }
                }}
              >
                <View
                  style={[styles.fileIcon, { backgroundColor: colors.primary }]}
                >
                  <Ionicons
                    name={getFileIcon(item.file_name || "")}
                    size={24}
                    color="#fff"
                  />
                </View>
                <View style={styles.fileInfo}>
                  <Text
                    style={[
                      styles.fileName,
                      {
                        color: isMyMessage
                          ? isDark
                            ? "#fff"
                            : colors.text
                          : colors.text,
                      },
                    ]}
                    numberOfLines={1}
                  >
                    {item.file_name || "Документ"}
                  </Text>
                  <Text
                    style={[
                      styles.fileSize,
                      {
                        color: isMyMessage
                          ? isDark
                            ? "rgba(255,255,255,0.7)"
                            : colors.textSecondary
                          : colors.textSecondary,
                      },
                    ]}
                  >
                    {formatFileSize(item.file_size || 0)}
                  </Text>
                </View>
                <Ionicons
                  name="download-outline"
                  size={22}
                  color={
                    isMyMessage
                      ? isDark
                        ? "rgba(255,255,255,0.8)"
                        : colors.primary
                      : colors.primary
                  }
                />
              </TouchableOpacity>
            )}

            {/* Text content */}
            {item.content ? renderContent() : null}

            {/* Link Preview */}
            {item.content && /(https?:\/\/[^\s]+)/i.test(item.content) && (
              <LinkPreviewCard
                text={item.content}
                isMyMessage={isMyMessage}
                colors={colors}
                isDark={isDark}
              />
            )}

            {/* Time + status */}
            <Text style={[styles.messageTime, { color: colors.messageTime }]}>
              {formatMessageTime(item.created_at)}
              {isMyMessage ? (
                <Text
                  style={{
                    marginLeft: 4,
                    color: item.is_read ? "#4FC3F7" : colors.messageTime,
                  }}
                >
                  {" "}
                  {item.is_read ? "✓✓" : item.is_delivered ? "✓✓" : "✓"}
                </Text>
              ) : null}
            </Text>
            {item.updated_at && item.updated_at !== item.created_at && (
              <Text style={styles.editedLabel}>изменено</Text>
            )}
          </View>

          {/* Reactions */}
          {item.reactions && item.reactions.length > 0 && (
            <ReactionDisplay
              reactions={item.reactions}
              onReactionPress={(emoji: string) =>
                onToggleReaction(item.id, emoji)
              }
              onReactionLongPress={(reaction: GroupedReaction) =>
                onReactionLongPress(reaction, item.reactions || [])
              }
              isMyMessage={isMyMessage}
            />
          )}
        </TouchableOpacity>
      </Animated.View>
    );
  },
  (prevProps, nextProps) => {
    // Custom areEqual for performance
    return (
      prevProps.item.id === nextProps.item.id &&
      prevProps.item.content === nextProps.item.content &&
      prevProps.item.updated_at === nextProps.item.updated_at &&
      prevProps.item.is_read === nextProps.item.is_read &&
      prevProps.item.is_delivered === nextProps.item.is_delivered &&
      prevProps.isMyMessage === nextProps.isMyMessage &&
      prevProps.isSelected === nextProps.isSelected &&
      prevProps.isSelectMode === nextProps.isSelectMode &&
      prevProps.isHighlighted === nextProps.isHighlighted &&
      prevProps.isDark === nextProps.isDark &&
      prevProps.searchQuery === nextProps.searchQuery &&
      prevProps.playingAudioId === nextProps.playingAudioId &&
      prevProps.item.reactions === nextProps.item.reactions
    );
  },
);

MessageBubble.displayName = "MessageBubble";
export default MessageBubble;

const styles = StyleSheet.create({
  messageContainer: {
    marginVertical: 2,
    marginHorizontal: 12,
    maxWidth: "85%",
    paddingVertical: 2,
  },
  myMessageContainer: {
    alignSelf: "flex-end",
  },
  otherMessageContainer: {
    alignSelf: "flex-start",
  },
  messageBubble: {
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 8,
    minWidth: 80,
  },
  myMessageBubble: {
    borderBottomRightRadius: 4,
  },
  otherMessageBubble: {
    borderBottomLeftRadius: 4,
  },
  mediaBubble: {
    paddingHorizontal: 4,
    paddingTop: 4,
  },
  selectCheckbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "#aaa",
    justifyContent: "center",
    alignItems: "center",
    position: "absolute",
    left: -32,
    top: 8,
  },
  selectCheckboxSelected: {
    borderColor: "transparent",
  },
  senderName: {
    fontSize: 13,
    fontWeight: "700",
    marginBottom: 2,
  },
  forwardedLabel: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 4,
  },
  forwardedText: {
    fontSize: 12,
    fontStyle: "italic",
    flex: 1,
  },
  repliedMessageContainer: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderLeftWidth: 3,
    borderRadius: 6,
    marginBottom: 6,
  },
  repliedMessageSender: {
    fontSize: 12,
    fontWeight: "700",
    marginBottom: 2,
  },
  repliedMessageText: {
    fontSize: 12,
  },
  mediaImage: {
    width: 240,
    height: 180,
    borderRadius: 14,
    marginBottom: 4,
  },
  mediaVideo: {
    width: 240,
    height: 180,
    borderRadius: 14,
    marginBottom: 4,
    backgroundColor: "#000",
    justifyContent: "center",
    alignItems: "center",
  },
  locationContainer: {
    borderRadius: 12,
    overflow: "hidden",
    marginBottom: 4,
    width: 240,
  },
  locationMap: {
    width: 240,
    height: 120,
  },
  locationInfo: {
    padding: 8,
  },
  locationHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  locationTitle: {
    fontSize: 14,
    fontWeight: "600",
    flex: 1,
  },
  locationCoords: {
    fontSize: 11,
    marginTop: 2,
  },
  fileContainer: {
    flexDirection: "row",
    alignItems: "center",
    padding: 10,
    borderRadius: 12,
    marginBottom: 4,
    width: 240,
  },
  fileIcon: {
    width: 40,
    height: 40,
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 10,
  },
  fileInfo: {
    flex: 1,
  },
  fileName: {
    fontSize: 14,
    fontWeight: "500",
  },
  fileSize: {
    fontSize: 12,
    marginTop: 2,
  },
  messageText: {
    fontSize: 16,
    lineHeight: 22,
  },
  linkText: {
    textDecorationLine: "underline",
  },
  searchHighlight: {
    backgroundColor: "#FFD60A",
    color: "#000",
    fontWeight: "600",
  },
  messageTime: {
    fontSize: 11,
    marginTop: 4,
    textAlign: "right",
  },
  editedLabel: {
    fontSize: 10,
    color: "#888",
    fontStyle: "italic",
    textAlign: "right",
    marginTop: 1,
  },
});
