import {
    extractUrl,
    fetchLinkPreview,
    LinkPreviewData,
} from "@/lib/link-preview";
import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useState } from "react";
import {
    Image,
    Linking,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";

interface LinkPreviewCardProps {
  text: string;
  isMyMessage: boolean;
  colors: any;
  isDark: boolean;
}

export default function LinkPreviewCard({
  text,
  isMyMessage,
  colors,
  isDark,
}: LinkPreviewCardProps) {
  const [preview, setPreview] = useState<LinkPreviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [imageError, setImageError] = useState(false);

  const url = extractUrl(text);

  useEffect(() => {
    if (!url) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    const load = async () => {
      const data = await fetchLinkPreview(url);
      if (!cancelled) {
        setPreview(data);
        setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [url]);

  if (!url || loading || !preview) return null;

  const cardBg = isMyMessage
    ? isDark
      ? "rgba(255,255,255,0.08)"
      : "rgba(0,0,0,0.06)"
    : isDark
      ? "rgba(255,255,255,0.06)"
      : "rgba(0,0,0,0.04)";

  const titleColor = isMyMessage
    ? isDark
      ? "#fff"
      : colors.text
    : colors.text;

  const descColor = isMyMessage
    ? isDark
      ? "rgba(255,255,255,0.7)"
      : "rgba(0,0,0,0.6)"
    : colors.textSecondary;

  const domainColor = isMyMessage
    ? isDark
      ? "#90CAF9"
      : colors.primary
    : colors.primary;

  // Если прямая ссылка на картинку — показываем только изображение
  if (preview.isDirectImage) {
    return (
      <TouchableOpacity
        style={[styles.container, { backgroundColor: cardBg }]}
        onPress={() => Linking.openURL(preview.url)}
        activeOpacity={0.7}
      >
        <Image
          source={{ uri: preview.image! }}
          style={styles.directImage}
          resizeMode="contain"
          onError={() => setImageError(true)}
        />
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity
      style={[styles.container, { backgroundColor: cardBg }]}
      onPress={() => Linking.openURL(preview.url)}
      activeOpacity={0.7}
    >
      {/* Превью-картинка */}
      {preview.image && !imageError && (
        <Image
          source={{ uri: preview.image }}
          style={styles.image}
          resizeMode="cover"
          onError={() => setImageError(true)}
        />
      )}

      {/* Контент */}
      <View style={styles.content}>
        {/* Домен с фавиконом */}
        <View style={styles.domainRow}>
          {preview.favicon ? (
            <Image source={{ uri: preview.favicon }} style={styles.favicon} />
          ) : (
            <Ionicons name="globe-outline" size={12} color={domainColor} />
          )}
          <Text
            style={[styles.domain, { color: domainColor }]}
            numberOfLines={1}
          >
            {preview.siteName || ""}
          </Text>
        </View>

        {/* Заголовок */}
        {preview.title && (
          <Text style={[styles.title, { color: titleColor }]} numberOfLines={2}>
            {preview.title}
          </Text>
        )}

        {/* Описание */}
        {preview.description && (
          <Text
            style={[styles.description, { color: descColor }]}
            numberOfLines={2}
          >
            {preview.description}
          </Text>
        )}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 12,
    overflow: "hidden",
    marginTop: 6,
    marginBottom: 2,
  },
  image: {
    width: "100%",
    height: 140,
    backgroundColor: "rgba(0,0,0,0.05)",
  },
  directImage: {
    width: "100%",
    height: 200,
    borderRadius: 12,
    backgroundColor: "rgba(0,0,0,0.05)",
  },
  content: {
    padding: 10,
    gap: 3,
  },
  domainRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginBottom: 2,
  },
  favicon: {
    width: 14,
    height: 14,
    borderRadius: 3,
  },
  domain: {
    fontSize: 12,
    fontWeight: "500",
    textTransform: "lowercase",
  },
  title: {
    fontSize: 14,
    fontWeight: "600",
    lineHeight: 18,
  },
  description: {
    fontSize: 13,
    lineHeight: 17,
  },
});
