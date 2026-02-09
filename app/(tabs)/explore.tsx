import { colors, getAvatarColor } from "@/constants/colors";
import { useAuth } from "@/contexts/auth-context";
import { supabase } from "@/lib/supabase";
import { Ionicons } from "@expo/vector-icons";
import { decode } from "base64-arraybuffer";
import * as FileSystem from "expo-file-system/legacy";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

// Safe haptic function for web compatibility
const safeHaptic = () => {
  if (Platform.OS !== "web") {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }
};

const safeNotificationHaptic = (type: Haptics.NotificationFeedbackType) => {
  if (Platform.OS !== "web") {
    Haptics.notificationAsync(type);
  }
};

export default function ProfileScreen() {
  const { user, profile, signOut, refreshProfile } = useAuth();
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  const handlePickAvatar = async () => {
    if (Platform.OS === "web") {
      Alert.alert("Недоступно", "Загрузка аватара недоступна в веб-версии");
      return;
    }

    safeHaptic();

    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Ошибка", "Нужен доступ к галерее для выбора фото");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (result.canceled || !result.assets[0]) return;

    const asset = result.assets[0];
    setUploadingAvatar(true);

    try {
      const fileExt = asset.uri.split(".").pop()?.toLowerCase() || "jpg";
      const fileName = `avatars/${user!.id}_${Date.now()}.${fileExt}`;
      const mimeType = `image/${fileExt === "jpg" ? "jpeg" : fileExt}`;

      // Read file as base64 (proper way for React Native)
      const base64Data = await FileSystem.readAsStringAsync(asset.uri, {
        encoding: "base64",
      });

      // Upload to Supabase Storage with decoded base64
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from("chat-media")
        .upload(fileName, decode(base64Data), {
          contentType: mimeType,
          upsert: true,
        });

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: urlData } = supabase.storage
        .from("chat-media")
        .getPublicUrl(uploadData.path);

      console.log("Avatar public URL:", urlData.publicUrl);

      // Update profile with new avatar URL
      const { error: updateError } = await supabase
        .from("profiles")
        .update({ avatar_url: urlData.publicUrl + "?t=" + Date.now() })
        .eq("id", user!.id);

      if (updateError) throw updateError;

      // Refresh profile to get updated avatar
      await refreshProfile();

      safeNotificationHaptic(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Успешно", "Аватар обновлён");
    } catch (error) {
      console.error("Avatar upload error:", error);
      safeNotificationHaptic(Haptics.NotificationFeedbackType.Error);
      Alert.alert("Ошибка", "Не удалось загрузить аватар");
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleSignOut = () => {
    Alert.alert("Выход", "Вы уверены, что хотите выйти?", [
      { text: "Отмена", style: "cancel" },
      { text: "Выйти", style: "destructive", onPress: signOut },
    ]);
  };

  const avatarColor = profile?.id ? getAvatarColor(profile.id) : colors.primary;
  const memberSince = profile?.created_at
    ? new Date(profile.created_at).toLocaleDateString("ru-RU", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : "-";

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {/* Header with gradient-like effect */}
      <View style={styles.headerBackground}>
        <View style={styles.headerContent}>
          <TouchableOpacity
            style={styles.avatarContainer}
            onPress={handlePickAvatar}
            disabled={uploadingAvatar}
            activeOpacity={0.8}
          >
            {profile?.avatar_url ? (
              <Image
                source={{ uri: profile.avatar_url }}
                style={styles.avatarImage}
              />
            ) : (
              <View style={[styles.avatar, { backgroundColor: avatarColor }]}>
                <Text style={styles.avatarText}>
                  {profile?.username?.charAt(0).toUpperCase() || "?"}
                </Text>
              </View>
            )}

            {/* Edit overlay */}
            <View style={styles.avatarEditOverlay}>
              {uploadingAvatar ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Ionicons name="camera" size={20} color="#fff" />
              )}
            </View>
          </TouchableOpacity>

          <Text style={styles.username}>
            {profile?.username || "Пользователь"}
          </Text>
          <View style={styles.emailContainer}>
            <Ionicons
              name="mail-outline"
              size={14}
              color="rgba(255,255,255,0.9)"
              style={{ marginRight: 6 }}
            />
            <Text style={styles.email}>{user?.email}</Text>
          </View>
        </View>
      </View>

      {/* Account Info Card */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Ionicons
            name="person-outline"
            size={18}
            color={colors.textPrimary}
            style={{ marginRight: 8 }}
          />
          <Text style={styles.cardTitle}>Аккаунт</Text>
        </View>

        <View style={styles.infoRow}>
          <View style={styles.infoIconContainer}>
            <Ionicons name="at" size={16} color={colors.primary} />
          </View>
          <View style={styles.infoContent}>
            <Text style={styles.infoLabel}>Имя пользователя</Text>
            <Text style={styles.infoValue}>{profile?.username || "-"}</Text>
          </View>
        </View>

        <View style={styles.divider} />

        <View style={styles.infoRow}>
          <View style={styles.infoIconContainer}>
            <Ionicons name="mail-outline" size={16} color={colors.primary} />
          </View>
          <View style={styles.infoContent}>
            <Text style={styles.infoLabel}>Email</Text>
            <Text style={styles.infoValue}>{user?.email || "-"}</Text>
          </View>
        </View>

        <View style={styles.divider} />

        <View style={styles.infoRow}>
          <View style={styles.infoIconContainer}>
            <Ionicons
              name="calendar-outline"
              size={16}
              color={colors.primary}
            />
          </View>
          <View style={styles.infoContent}>
            <Text style={styles.infoLabel}>Дата регистрации</Text>
            <Text style={styles.infoValue}>{memberSince}</Text>
          </View>
        </View>
      </View>

      {/* Settings Card */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Ionicons
            name="settings-outline"
            size={18}
            color={colors.textPrimary}
            style={{ marginRight: 8 }}
          />
          <Text style={styles.cardTitle}>Настройки</Text>
        </View>

        <TouchableOpacity
          style={styles.menuItem}
          activeOpacity={0.6}
          onPress={safeHaptic}
        >
          <View style={styles.menuItemLeft}>
            <View style={[styles.menuIcon, { backgroundColor: "#FF6B6B20" }]}>
              <Ionicons
                name="notifications-outline"
                size={18}
                color="#FF6B6B"
              />
            </View>
            <Text style={styles.menuItemText}>Уведомления</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
        </TouchableOpacity>

        <View style={styles.divider} />

        <TouchableOpacity
          style={styles.menuItem}
          activeOpacity={0.6}
          onPress={safeHaptic}
        >
          <View style={styles.menuItemLeft}>
            <View style={[styles.menuIcon, { backgroundColor: "#4ECDC420" }]}>
              <Ionicons name="lock-closed-outline" size={18} color="#4ECDC4" />
            </View>
            <Text style={styles.menuItemText}>Конфиденциальность</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
        </TouchableOpacity>

        <View style={styles.divider} />

        <TouchableOpacity
          style={styles.menuItem}
          activeOpacity={0.6}
          onPress={safeHaptic}
        >
          <View style={styles.menuItemLeft}>
            <View style={[styles.menuIcon, { backgroundColor: "#45B7D120" }]}>
              <Ionicons name="help-circle-outline" size={18} color="#45B7D1" />
            </View>
            <Text style={styles.menuItemText}>Помощь</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
        </TouchableOpacity>
      </View>

      {/* Sign Out Button */}
      <TouchableOpacity
        style={styles.signOutButton}
        onPress={() => {
          safeNotificationHaptic(Haptics.NotificationFeedbackType.Warning);
          handleSignOut();
        }}
        activeOpacity={0.7}
      >
        <Ionicons
          name="log-out-outline"
          size={20}
          color={colors.danger}
          style={{ marginRight: 8 }}
        />
        <Text style={styles.signOutText}>Выйти из аккаунта</Text>
      </TouchableOpacity>

      <Text style={styles.version}>Messenger v1.0.0</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.backgroundSecondary,
  },
  headerBackground: {
    backgroundColor: colors.primary,
    paddingTop: 60,
    paddingBottom: 40,
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
  },
  headerContent: {
    alignItems: "center",
  },
  avatarContainer: {
    position: "relative",
    marginBottom: 16,
  },
  avatarImage: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 4,
    borderColor: "rgba(255,255,255,0.3)",
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 4,
    borderColor: "rgba(255,255,255,0.3)",
  },
  avatarEditOverlay: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#fff",
  },
  avatarText: {
    color: colors.textLight,
    fontSize: 40,
    fontWeight: "600",
  },
  username: {
    fontSize: 26,
    fontWeight: "bold",
    color: colors.textLight,
    marginBottom: 8,
  },
  emailContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.15)",
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
  },
  email: {
    fontSize: 14,
    color: "rgba(255,255,255,0.9)",
  },
  card: {
    backgroundColor: colors.background,
    marginHorizontal: 16,
    marginTop: 20,
    borderRadius: 16,
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: colors.textPrimary,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
  },
  infoIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: colors.primaryLight,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  infoContent: {
    flex: 1,
  },
  infoLabel: {
    fontSize: 12,
    color: colors.textMuted,
    marginBottom: 2,
  },
  infoValue: {
    fontSize: 15,
    color: colors.textPrimary,
    fontWeight: "500",
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: 8,
    marginLeft: 48,
  },
  menuItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 10,
  },
  menuItemLeft: {
    flexDirection: "row",
    alignItems: "center",
  },
  menuIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  menuItemText: {
    fontSize: 15,
    color: colors.textPrimary,
  },
  menuItemArrow: {
    fontSize: 22,
    color: colors.textMuted,
  },
  signOutButton: {
    flexDirection: "row",
    marginTop: 24,
    marginHorizontal: 16,
    backgroundColor: colors.background,
    borderRadius: 16,
    paddingVertical: 16,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1.5,
    borderColor: colors.danger,
  },
  signOutText: {
    color: colors.danger,
    fontSize: 16,
    fontWeight: "600",
  },
  version: {
    textAlign: "center",
    color: colors.textMuted,
    fontSize: 12,
    marginTop: 24,
    marginBottom: 40,
  },
});
