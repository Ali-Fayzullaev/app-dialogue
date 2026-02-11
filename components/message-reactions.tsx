import { getAvatarColor } from "@/constants/colors";
import { useTheme } from "@/contexts/theme-context";
import { GroupedReaction } from "@/types/database";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useEffect, useRef, useState } from "react";
import {
    Animated,
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

// Популярные эмодзи для быстрого доступа (как в Telegram)
export const QUICK_REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🙏"];

// Расширенный набор реакций
export const ALL_REACTIONS = [
  "👍",
  "👎",
  "❤️",
  "🔥",
  "🥰",
  "👏",
  "😁",
  "🤔",
  "🤯",
  "😱",
  "🤬",
  "😢",
  "🎉",
  "🤩",
  "🤮",
  "💩",
  "🙏",
  "👌",
  "🕊",
  "🤡",
  "🥱",
  "🥴",
  "😍",
  "🐳",
  "❤️‍🔥",
  "🌚",
  "🌭",
  "💯",
  "🤣",
  "⚡️",
  "🍌",
  "🏆",
  "💔",
  "🤨",
  "😐",
  "🍓",
  "🍾",
  "💋",
  "🖕",
  "😈",
  "😴",
  "😭",
  "🤓",
  "👻",
  "👨‍💻",
  "👀",
  "🎃",
  "🙈",
  "😇",
  "😨",
  "🤝",
  "✍️",
  "🤗",
  "🫡",
  "🎅",
  "🎄",
  "☃️",
  "💅",
  "🤪",
  "🗿",
  "🆒",
  "💘",
  "🙉",
  "🦄",
  "😘",
  "💊",
  "🙊",
  "😎",
  "👾",
  "🤷‍♂️",
  "🤷",
  "🤷‍♀️",
  "😡",
];

// Безопасная вибрация
const safeHaptic = (
  style: Haptics.ImpactFeedbackStyle = Haptics.ImpactFeedbackStyle.Light,
) => {
  if (Platform.OS !== "web") {
    Haptics.impactAsync(style);
  }
};

interface QuickReactionBarProps {
  onSelect: (emoji: string) => void;
  selectedEmoji?: string;
  onShowMore?: () => void;
}

// Быстрая панель реакций (появляется над сообщением) - УЛУЧШЕННАЯ
export function QuickReactionBar({
  onSelect,
  selectedEmoji,
  onShowMore,
}: QuickReactionBarProps) {
  const { colors, isDark } = useTheme();
  const scaleAnims = useRef(
    QUICK_REACTIONS.map(() => new Animated.Value(0)),
  ).current;

  useEffect(() => {
    // Анимация появления каждой реакции с задержкой
    const animations = scaleAnims.map((anim, index) =>
      Animated.spring(anim, {
        toValue: 1,
        tension: 120,
        friction: 6,
        delay: index * 30,
        useNativeDriver: true,
      }),
    );
    Animated.stagger(30, animations).start();
  }, []);

  return (
    <View
      style={[
        styles.quickBar,
        {
          backgroundColor: isDark ? colors.card : "#fff",
          shadowColor: "#000",
          borderColor: isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.05)",
        },
      ]}
    >
      {QUICK_REACTIONS.map((emoji, index) => (
        <Animated.View
          key={emoji}
          style={{
            transform: [
              { scale: scaleAnims[index] },
              {
                translateY: scaleAnims[index].interpolate({
                  inputRange: [0, 1],
                  outputRange: [10, 0],
                }),
              },
            ],
          }}
        >
          <TouchableOpacity
            style={[
              styles.quickEmoji,
              selectedEmoji === emoji && {
                backgroundColor: colors.primary + "35",
                transform: [{ scale: 1.15 }],
              },
            ]}
            onPress={() => {
              safeHaptic(Haptics.ImpactFeedbackStyle.Medium);
              onSelect(emoji);
            }}
            activeOpacity={0.6}
          >
            <Text style={styles.quickEmojiText}>{emoji}</Text>
          </TouchableOpacity>
        </Animated.View>
      ))}

      {onShowMore && (
        <Animated.View
          style={{
            transform: [
              {
                scale:
                  scaleAnims[scaleAnims.length - 1] || new Animated.Value(1),
              },
            ],
          }}
        >
          <TouchableOpacity
            style={[styles.quickEmoji, styles.moreButton]}
            onPress={() => {
              safeHaptic();
              onShowMore();
            }}
            activeOpacity={0.6}
          >
            <Ionicons name="add" size={24} color={colors.textSecondary} />
          </TouchableOpacity>
        </Animated.View>
      )}
    </View>
  );
}

interface ReactionDisplayProps {
  reactions: GroupedReaction[];
  onReactionPress: (emoji: string) => void;
  onReactionLongPress: (reaction: GroupedReaction) => void;
  isMyMessage: boolean;
}

// Отображение реакций под сообщением - УЛУЧШЕННОЕ
export function ReactionDisplay({
  reactions,
  onReactionPress,
  onReactionLongPress,
  isMyMessage,
}: ReactionDisplayProps) {
  const { colors, isDark } = useTheme();
  const scaleAnims = useRef(reactions.map(() => new Animated.Value(1))).current;

  if (!reactions || reactions.length === 0) return null;

  const handlePress = (emoji: string, index: number) => {
    // Анимация нажатия
    Animated.sequence([
      Animated.spring(scaleAnims[index], {
        toValue: 1.3,
        tension: 200,
        friction: 5,
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnims[index], {
        toValue: 1,
        tension: 200,
        friction: 5,
        useNativeDriver: true,
      }),
    ]).start();

    safeHaptic(Haptics.ImpactFeedbackStyle.Light);
    onReactionPress(emoji);
  };

  return (
    <View
      style={[
        styles.reactionsContainer,
        isMyMessage ? styles.reactionsRight : styles.reactionsLeft,
      ]}
    >
      {reactions.map((reaction, index) => (
        <Animated.View
          key={reaction.emoji}
          style={{
            transform: [{ scale: scaleAnims[index] || new Animated.Value(1) }],
          }}
        >
          <Pressable
            style={[
              styles.reactionBadge,
              {
                backgroundColor: reaction.hasReacted
                  ? colors.primary + "30"
                  : isDark
                    ? "rgba(255,255,255,0.12)"
                    : "rgba(0,0,0,0.06)",
                borderColor: reaction.hasReacted
                  ? colors.primary
                  : "transparent",
                borderWidth: reaction.hasReacted ? 1.5 : 1,
              },
            ]}
            onPress={() => handlePress(reaction.emoji, index)}
            onLongPress={() => {
              safeHaptic(Haptics.ImpactFeedbackStyle.Medium);
              onReactionLongPress(reaction);
            }}
            delayLongPress={300}
          >
            <Text style={styles.reactionEmoji}>{reaction.emoji}</Text>
            <Text
              style={[
                styles.reactionCount,
                {
                  color: reaction.hasReacted
                    ? colors.primary
                    : colors.textSecondary,
                  fontWeight: reaction.hasReacted ? "700" : "500",
                },
              ]}
            >
              {reaction.count}
            </Text>
          </Pressable>
        </Animated.View>
      ))}
    </View>
  );
}

interface ReactionUsersModalProps {
  visible: boolean;
  reaction: GroupedReaction | null;
  allReactions: GroupedReaction[];
  onClose: () => void;
  onReactionSelect: (emoji: string) => void;
}

// Модальное окно со списком пользователей, которые поставили реакции
export function ReactionUsersModal({
  visible,
  reaction,
  allReactions,
  onClose,
  onReactionSelect,
}: ReactionUsersModalProps) {
  const { colors, isDark } = useTheme();
  const slideAnim = useRef(new Animated.Value(0)).current;
  const [selectedEmoji, setSelectedEmoji] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      setSelectedEmoji(reaction?.emoji || null);
      Animated.spring(slideAnim, {
        toValue: 1,
        tension: 65,
        friction: 10,
        useNativeDriver: true,
      }).start();
    } else {
      slideAnim.setValue(0);
    }
  }, [visible, reaction]);

  const currentReaction = selectedEmoji
    ? allReactions.find((r) => r.emoji === selectedEmoji)
    : reaction;

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
    >
      <Pressable style={styles.modalOverlay} onPress={onClose}>
        <Animated.View
          style={[
            styles.usersModal,
            {
              backgroundColor: isDark ? colors.card : "#fff",
              transform: [
                {
                  translateY: slideAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [300, 0],
                  }),
                },
              ],
              opacity: slideAnim,
            },
          ]}
        >
          <Pressable onPress={(e) => e.stopPropagation()}>
            {/* Ручка для закрытия */}
            <View
              style={[styles.modalHandle, { backgroundColor: colors.border }]}
            />

            {/* Заголовок */}
            <Text style={[styles.modalTitle, { color: colors.text }]}>
              Реакции
            </Text>

            {/* Табы с реакциями */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.reactionTabs}
              contentContainerStyle={styles.reactionTabsContent}
            >
              {allReactions.map((r) => (
                <TouchableOpacity
                  key={r.emoji}
                  style={[
                    styles.reactionTab,
                    selectedEmoji === r.emoji && {
                      backgroundColor: colors.primary + "20",
                      borderColor: colors.primary,
                    },
                  ]}
                  onPress={() => setSelectedEmoji(r.emoji)}
                >
                  <Text style={styles.reactionTabEmoji}>{r.emoji}</Text>
                  <Text
                    style={[
                      styles.reactionTabCount,
                      {
                        color:
                          selectedEmoji === r.emoji
                            ? colors.primary
                            : colors.textSecondary,
                      },
                    ]}
                  >
                    {r.count}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* Список пользователей */}
            <FlatList
              data={currentReaction?.users || []}
              keyExtractor={(item) => item.id}
              style={styles.usersList}
              renderItem={({ item: userInfo }) => (
                <View style={styles.userRow}>
                  {userInfo.avatar_url ? (
                    <Image
                      source={{ uri: userInfo.avatar_url }}
                      style={styles.userAvatar}
                    />
                  ) : (
                    <View
                      style={[
                        styles.userAvatar,
                        styles.userAvatarPlaceholder,
                        { backgroundColor: getAvatarColor(userInfo.id) },
                      ]}
                    >
                      <Text style={styles.userAvatarText}>
                        {userInfo.username?.charAt(0).toUpperCase() || "?"}
                      </Text>
                    </View>
                  )}
                  <Text style={[styles.userName, { color: colors.text }]}>
                    {userInfo.username}
                  </Text>
                  <Text style={styles.userReactionEmoji}>
                    {currentReaction?.emoji}
                  </Text>
                </View>
              )}
              ListEmptyComponent={
                <Text
                  style={[styles.emptyText, { color: colors.textSecondary }]}
                >
                  Нет реакций
                </Text>
              }
            />

            {/* Кнопка закрытия */}
            <TouchableOpacity
              style={[
                styles.closeButton,
                { backgroundColor: colors.inputBackground },
              ]}
              onPress={onClose}
            >
              <Text style={[styles.closeButtonText, { color: colors.text }]}>
                Закрыть
              </Text>
            </TouchableOpacity>
          </Pressable>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

interface FullReactionPickerProps {
  visible: boolean;
  onClose: () => void;
  onSelect: (emoji: string) => void;
  currentReaction?: string;
}

// Полный пикер реакций (модальное окно) - УЛУЧШЕННЫЙ
export function FullReactionPicker({
  visible,
  onClose,
  onSelect,
  currentReaction,
}: FullReactionPickerProps) {
  const { colors, isDark } = useTheme();
  const scaleAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.spring(scaleAnim, {
        toValue: 1,
        tension: 80,
        friction: 8,
        useNativeDriver: true,
      }).start();
    } else {
      scaleAnim.setValue(0);
    }
  }, [visible]);

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={styles.overlay} onPress={onClose}>
        <Animated.View
          style={[
            styles.fullPicker,
            {
              backgroundColor: isDark ? colors.card : "#fff",
              transform: [{ scale: scaleAnim }],
            },
          ]}
        >
          <Pressable onPress={(e) => e.stopPropagation()}>
            <View
              style={[styles.pickerHandle, { backgroundColor: colors.border }]}
            />
            <Text style={[styles.pickerTitle, { color: colors.text }]}>
              Выберите реакцию
            </Text>
            <ScrollView
              style={styles.pickerScroll}
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.pickerGrid}>
                {ALL_REACTIONS.map((emoji) => (
                  <TouchableOpacity
                    key={emoji}
                    style={[
                      styles.pickerEmoji,
                      currentReaction === emoji && {
                        backgroundColor: colors.primary + "35",
                        borderRadius: 12,
                        transform: [{ scale: 1.1 }],
                      },
                    ]}
                    onPress={() => {
                      safeHaptic(Haptics.ImpactFeedbackStyle.Medium);
                      onSelect(emoji);
                      onClose();
                    }}
                    activeOpacity={0.6}
                  >
                    <Text style={styles.pickerEmojiText}>{emoji}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
          </Pressable>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  // Quick bar styles
  quickBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 28,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 8,
    gap: 4,
    borderWidth: 1,
  },
  quickEmoji: {
    width: 44,
    height: 44,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 22,
  },
  quickEmojiText: {
    fontSize: 26,
  },
  moreButton: {
    backgroundColor: "rgba(128,128,128,0.15)",
  },

  // Reaction display styles
  reactionsContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: 6,
    gap: 6,
  },
  reactionsLeft: {
    justifyContent: "flex-start",
    marginLeft: 48,
  },
  reactionsRight: {
    justifyContent: "flex-end",
    marginRight: 8,
  },
  reactionBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 14,
    gap: 4,
  },
  reactionEmoji: {
    fontSize: 16,
  },
  reactionCount: {
    fontSize: 13,
  },

  // Modal overlay styles
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },

  // Users modal styles
  usersModal: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingBottom: 34,
    maxHeight: "70%",
  },
  modalHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    alignSelf: "center",
    marginTop: 12,
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "700",
    textAlign: "center",
    marginBottom: 16,
  },
  reactionTabs: {
    maxHeight: 50,
    marginBottom: 12,
  },
  reactionTabsContent: {
    paddingHorizontal: 16,
    gap: 8,
  },
  reactionTab: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "transparent",
    backgroundColor: "rgba(128,128,128,0.1)",
    gap: 4,
  },
  reactionTabEmoji: {
    fontSize: 18,
  },
  reactionTabCount: {
    fontSize: 14,
    fontWeight: "600",
  },
  usersList: {
    paddingHorizontal: 16,
    maxHeight: 300,
  },
  userRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(128,128,128,0.2)",
  },
  userAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 12,
  },
  userAvatarPlaceholder: {
    justifyContent: "center",
    alignItems: "center",
  },
  userAvatarText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#fff",
  },
  userName: {
    flex: 1,
    fontSize: 16,
    fontWeight: "500",
  },
  userReactionEmoji: {
    fontSize: 20,
  },
  emptyText: {
    textAlign: "center",
    paddingVertical: 20,
    fontSize: 15,
  },
  closeButton: {
    marginHorizontal: 16,
    marginTop: 16,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  closeButtonText: {
    fontSize: 16,
    fontWeight: "600",
  },

  // Full picker styles
  fullPicker: {
    width: "90%",
    maxWidth: 380,
    maxHeight: "65%",
    borderRadius: 20,
    paddingBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 12,
  },
  pickerHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    alignSelf: "center",
    marginTop: 12,
    marginBottom: 8,
  },
  pickerTitle: {
    fontSize: 17,
    fontWeight: "600",
    textAlign: "center",
    marginBottom: 12,
  },
  pickerScroll: {
    paddingHorizontal: 12,
  },
  pickerGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 4,
    paddingBottom: 8,
  },
  pickerEmoji: {
    width: 48,
    height: 48,
    justifyContent: "center",
    alignItems: "center",
  },
  pickerEmojiText: {
    fontSize: 30,
  },
});
