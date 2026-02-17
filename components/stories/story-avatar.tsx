/**
 * StoryAvatar — аватар с кольцом статуса.
 * Зелёное/градиентное кольцо = есть непросмотренные истории.
 * Серое кольцо = все просмотрены.
 * Без кольца = нет историй.
 */

import { getAvatarColor } from "@/constants/colors";
import { Profile } from "@/types/database";
import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Image, StyleSheet, Text, TouchableOpacity, View } from "react-native";

interface StoryAvatarProps {
  user: Profile;
  size?: number;
  hasStories: boolean;
  hasUnviewed: boolean;
  onPress?: () => void;
  showAddButton?: boolean; // кнопка "+" для создания
  primaryColor?: string;
}

export function StoryAvatar({
  user,
  size = 56,
  hasStories,
  hasUnviewed,
  onPress,
  showAddButton = false,
  primaryColor = "#007AFF",
}: StoryAvatarProps) {
  const ringSize = size + 6;
  const ringBorderWidth = 2.5;

  const ringColor = hasStories
    ? hasUnviewed
      ? "#25D366" // зелёный для непросмотренных
      : "#8e8e93" // серый для просмотренных
    : "transparent";

  const avatarColor = getAvatarColor(user.id);

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7} disabled={!onPress}>
      <View
        style={[
          styles.ring,
          {
            width: ringSize,
            height: ringSize,
            borderRadius: ringSize / 2,
            borderWidth: hasStories ? ringBorderWidth : 0,
            borderColor: ringColor,
          },
        ]}
      >
        <View
          style={[
            styles.avatar,
            {
              width: size,
              height: size,
              borderRadius: size / 2,
              backgroundColor: avatarColor,
            },
          ]}
        >
          {user.avatar_url ? (
            <Image
              source={{ uri: user.avatar_url }}
              style={[
                styles.avatarImage,
                {
                  width: size - 2,
                  height: size - 2,
                  borderRadius: (size - 2) / 2,
                },
              ]}
            />
          ) : (
            <Text style={[styles.avatarText, { fontSize: size * 0.38 }]}>
              {user.username?.[0]?.toUpperCase() || "?"}
            </Text>
          )}
        </View>
      </View>

      {/* Кнопка + для создания */}
      {showAddButton && (
        <View style={[styles.addButton, { backgroundColor: primaryColor }]}>
          <Ionicons name="add" size={14} color="#fff" />
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  ring: {
    justifyContent: "center",
    alignItems: "center",
  },
  avatar: {
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden",
  },
  avatarImage: {
    resizeMode: "cover",
  },
  avatarText: {
    color: "#fff",
    fontWeight: "700",
  },
  addButton: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 20,
    height: 20,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#fff",
  },
});
