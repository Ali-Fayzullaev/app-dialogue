/**
 * DateSeparator — разделитель дат в чате.
 */

import React from "react";
import { StyleSheet, Text, View } from "react-native";

interface DateSeparatorProps {
  dateString: string;
}

export function formatDateSeparator(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const messageDate = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
  );

  if (messageDate.getTime() === today.getTime()) return "Сегодня";
  if (messageDate.getTime() === yesterday.getTime()) return "Вчера";

  return date.toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "long",
    year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
  });
}

const DateSeparator: React.FC<DateSeparatorProps> = React.memo(
  ({ dateString }) => {
    return (
      <View style={styles.container}>
        <Text style={styles.text}>{formatDateSeparator(dateString)}</Text>
      </View>
    );
  },
);

DateSeparator.displayName = "DateSeparator";
export default DateSeparator;

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    marginVertical: 16,
    paddingHorizontal: 16,
  },
  text: {
    fontSize: 12,
    fontWeight: "600",
    color: "#8696a0",
    backgroundColor: "rgba(0,0,0,0.06)",
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 8,
    overflow: "hidden",
  },
});
