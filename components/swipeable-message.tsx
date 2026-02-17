import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useCallback, useRef } from "react";
import { Animated, Platform, StyleSheet, View } from "react-native";
import {
    GestureHandlerRootView,
    Swipeable,
} from "react-native-gesture-handler";

interface SwipeableMessageProps {
  isMyMessage: boolean;
  onSwipeReply: () => void;
  colors: any;
  children: React.ReactNode;
}

/**
 * Обёртка для сообщения с поддержкой свайпа влево для ответа.
 */
export function SwipeableMessage({
  isMyMessage,
  onSwipeReply,
  colors,
  children,
}: SwipeableMessageProps) {
  const swipeRef = useRef<Swipeable>(null);

  // Свайп влево → показываем иконку ответа справа
  const renderRightActions = useCallback(
    (
      _progress: Animated.AnimatedInterpolation<number>,
      dragX: Animated.AnimatedInterpolation<number>,
    ) => {
      const scale = dragX.interpolate({
        inputRange: [-80, -40, 0],
        outputRange: [1, 0.8, 0],
        extrapolate: "clamp",
      });

      const opacity = dragX.interpolate({
        inputRange: [-60, -30, 0],
        outputRange: [1, 0.5, 0],
        extrapolate: "clamp",
      });

      return (
        <View style={styles.actionContainer}>
          <Animated.View
            style={[
              styles.actionIcon,
              {
                backgroundColor: colors.primary + "20",
                transform: [{ scale }],
                opacity,
              },
            ]}
          >
            <Ionicons name="arrow-undo" size={20} color={colors.primary} />
          </Animated.View>
        </View>
      );
    },
    [colors],
  );

  const handleSwipeOpen = useCallback(() => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    onSwipeReply();
    setTimeout(() => {
      swipeRef.current?.close();
    }, 200);
  }, [onSwipeReply]);

  // На вебе свайп не работает — просто рендерим children
  if (Platform.OS === "web") {
    return <>{children}</>;
  }

  return (
    <GestureHandlerRootView>
      <Swipeable
        ref={swipeRef}
        renderRightActions={renderRightActions}
        onSwipeableOpen={handleSwipeOpen}
        rightThreshold={60}
        overshootRight={false}
        friction={2}
        containerStyle={styles.swipeContainer}
      >
        {children}
      </Swipeable>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  swipeContainer: {
    overflow: "visible",
  },
  actionContainer: {
    justifyContent: "center",
    alignItems: "center",
    width: 60,
  },
  actionIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: "center",
    alignItems: "center",
  },
});
