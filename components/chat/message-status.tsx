/**
 * MessageStatus — иконки статуса сообщения (✓ / ✓✓ / синие ✓✓).
 * Профессиональный вид как в Telegram / WhatsApp.
 */
import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, View } from "react-native";

interface MessageStatusProps {
  isRead: boolean;
  isDelivered: boolean;
  /** Цвет по умолчанию (серые галочки) */
  color?: string;
  size?: number;
}

const READ_COLOR = "#4FC3F7";

export const MessageStatus: React.FC<MessageStatusProps> = React.memo(
  ({ isRead, isDelivered, color = "#8e8e93", size = 16 }) => {
    if (isRead) {
      // Прочитано — синие двойные галочки
      return (
        <View style={styles.container}>
          <Ionicons name="checkmark-done" size={size} color={READ_COLOR} />
        </View>
      );
    }

    if (isDelivered) {
      // Доставлено — серые двойные галочки
      return (
        <View style={styles.container}>
          <Ionicons name="checkmark-done" size={size} color={color} />
        </View>
      );
    }

    // Отправлено — одиночная серая галочка
    return (
      <View style={styles.container}>
        <Ionicons name="checkmark" size={size} color={color} />
      </View>
    );
  },
);

MessageStatus.displayName = "MessageStatus";

const styles = StyleSheet.create({
  container: {
    marginLeft: 3,
    justifyContent: "center",
    alignItems: "center",
  },
});
