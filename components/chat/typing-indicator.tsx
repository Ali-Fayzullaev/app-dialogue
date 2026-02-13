/**
 * TypingIndicator — компонент индикатора набора текста.
 * Показывает анимированные точки и статус активности собеседника.
 */

import React, { useEffect, useRef } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";

interface TypingUser {
  id: string;
  username: string;
  avatar_url: string | null;
  action: string;
}

interface TypingIndicatorProps {
  typingUsers: TypingUser[];
  colors: {
    textSecondary: string;
    primary: string;
  };
}

const ACTION_LABELS: Record<string, string> = {
  typing: "печатает...",
  recording_audio: "записывает аудио...",
  recording_video: "записывает видео...",
  sending_photo: "отправляет фото...",
  sending_file: "отправляет файл...",
  choosing_sticker: "выбирает стикер...",
};

function getTypingText(typingUsers: TypingUser[]): string {
  if (typingUsers.length === 0) return "";
  if (typingUsers.length === 1) {
    const user = typingUsers[0];
    return `${user.username} ${ACTION_LABELS[user.action] || "печатает..."}`;
  }
  return `${typingUsers.length} печатают...`;
}

const TypingIndicator: React.FC<TypingIndicatorProps> = React.memo(
  ({ typingUsers, colors }) => {
    const dot1 = useRef(new Animated.Value(0.3)).current;
    const dot2 = useRef(new Animated.Value(0.3)).current;
    const dot3 = useRef(new Animated.Value(0.3)).current;

    useEffect(() => {
      if (typingUsers.length === 0) {
        dot1.setValue(0.3);
        dot2.setValue(0.3);
        dot3.setValue(0.3);
        return;
      }

      const animateDot = (dot: Animated.Value, delay: number) =>
        Animated.loop(
          Animated.sequence([
            Animated.delay(delay),
            Animated.timing(dot, {
              toValue: 1,
              duration: 300,
              useNativeDriver: true,
            }),
            Animated.timing(dot, {
              toValue: 0.3,
              duration: 300,
              useNativeDriver: true,
            }),
          ]),
        );

      const animations = Animated.parallel([
        animateDot(dot1, 0),
        animateDot(dot2, 150),
        animateDot(dot3, 300),
      ]);

      animations.start();
      return () => {
        animations.stop();
        dot1.setValue(0.3);
        dot2.setValue(0.3);
        dot3.setValue(0.3);
      };
    }, [typingUsers.length]);

    if (typingUsers.length === 0) return null;

    return (
      <View style={styles.container}>
        <View style={styles.dots}>
          <Animated.View
            style={[
              styles.dot,
              { backgroundColor: colors.primary, opacity: dot1 },
            ]}
          />
          <Animated.View
            style={[
              styles.dot,
              { backgroundColor: colors.primary, opacity: dot2 },
            ]}
          />
          <Animated.View
            style={[
              styles.dot,
              { backgroundColor: colors.primary, opacity: dot3 },
            ]}
          />
        </View>
        <Text style={[styles.text, { color: colors.textSecondary }]}>
          {getTypingText(typingUsers)}
        </Text>
      </View>
    );
  },
);

TypingIndicator.displayName = "TypingIndicator";
export default TypingIndicator;

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 4,
  },
  dots: {
    flexDirection: "row",
    alignItems: "center",
    marginRight: 6,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    marginHorizontal: 1,
  },
  text: {
    fontSize: 13,
    fontStyle: "italic",
  },
});
