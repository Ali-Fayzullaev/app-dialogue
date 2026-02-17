/**
 * Story Privacy — настройки приватности статусов.
 * Кто может видеть мои статусы: все / все, кроме... / только...
 */

import { getAvatarColor } from "@/constants/colors";
import { useAuth } from "@/contexts/auth-context";
import { useTheme } from "@/contexts/theme-context";
import { getPrivacyUsers, setPrivacyUsers } from "@/lib/story-service";
import { supabase } from "@/lib/supabase";
import { Profile } from "@/types/database";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    FlatList,
    Image,
    SafeAreaView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";

type PrivacyMode = "all" | "contacts_except" | "only_share_with";

const PRIVACY_KEY = "story_privacy_mode";

export default function StoryPrivacyScreen() {
  const { user } = useAuth();
  const { colors } = useTheme();
  const router = useRouter();

  const [mode, setMode] = useState<PrivacyMode>("all");
  const [contacts, setContacts] = useState<Profile[]>([]);
  const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Загружаем текущие настройки
  useEffect(() => {
    const load = async () => {
      if (!user) return;
      try {
        // Загружаем режим из AsyncStorage
        const savedMode = await AsyncStorage.getItem(PRIVACY_KEY);
        if (savedMode) setMode(savedMode as PrivacyMode);

        // Загружаем список пользователей приватности
        const privUsers = await getPrivacyUsers(user.id);
        setSelectedUsers(new Set(privUsers.map((p) => p.id)));

        // Загружаем все контакты (те, с кем есть общие чаты)
        const { data: chatMembers } = await supabase
          .from("chat_members")
          .select("chat_id")
          .eq("user_id", user.id);

        if (chatMembers && chatMembers.length > 0) {
          const chatIds = chatMembers.map((m) => m.chat_id);
          const { data: otherMembers } = await supabase
            .from("chat_members")
            .select("user_id")
            .in("chat_id", chatIds)
            .neq("user_id", user.id);

          if (otherMembers) {
            const uniqueIds = [...new Set(otherMembers.map((m) => m.user_id))];
            const { data: profiles } = await supabase
              .from("profiles")
              .select("*")
              .in("id", uniqueIds);

            setContacts(profiles || []);
          }
        }
      } catch (err) {
        console.error("Load privacy settings error:", err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [user?.id]);

  const toggleUser = useCallback((userId: string) => {
    setSelectedUsers((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) {
        next.delete(userId);
      } else {
        next.add(userId);
      }
      return next;
    });
  }, []);

  const handleSave = useCallback(async () => {
    if (!user) return;
    setSaving(true);
    try {
      await AsyncStorage.setItem(PRIVACY_KEY, mode);

      if (mode !== "all") {
        await setPrivacyUsers(user.id, [...selectedUsers]);
      } else {
        await setPrivacyUsers(user.id, []);
      }

      Alert.alert("Сохранено", "Настройки приватности обновлены");
      router.back();
    } catch (err) {
      Alert.alert("Ошибка", "Не удалось сохранить настройки");
    } finally {
      setSaving(false);
    }
  }, [user?.id, mode, selectedUsers]);

  const modeOptions: { value: PrivacyMode; label: string; desc: string }[] = [
    {
      value: "all",
      label: "Все контакты",
      desc: "Все ваши контакты смогут видеть статусы",
    },
    {
      value: "contacts_except",
      label: "Мои контакты, кроме...",
      desc: "Скройте статусы от выбранных контактов",
    },
    {
      value: "only_share_with",
      label: "Только...",
      desc: "Покажите статусы только выбранным контактам",
    },
  ];

  if (loading) {
    return (
      <SafeAreaView
        style={[styles.container, { backgroundColor: colors.background }]}
      >
        <ActivityIndicator
          size="large"
          color={colors.primary}
          style={{ marginTop: 40 }}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: colors.background }]}
    >
      {/* Header */}
      <View
        style={[
          styles.header,
          {
            backgroundColor: colors.headerBackground,
            borderBottomColor: colors.border,
          },
        ]}
      >
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>
          Приватность статусов
        </Text>
        <TouchableOpacity
          onPress={handleSave}
          disabled={saving}
          style={styles.saveBtn}
        >
          {saving ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <Text style={[styles.saveText, { color: colors.primary }]}>
              Сохранить
            </Text>
          )}
        </TouchableOpacity>
      </View>

      <FlatList
        data={contacts}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={
          <View>
            {/* Режим приватности */}
            <Text
              style={[styles.sectionTitle, { color: colors.textSecondary }]}
            >
              Кто видит мои статусы
            </Text>
            <View
              style={[
                styles.card,
                { backgroundColor: colors.surface || colors.card },
              ]}
            >
              {modeOptions.map((opt, i) => (
                <TouchableOpacity
                  key={opt.value}
                  style={[
                    styles.modeRow,
                    i < modeOptions.length - 1 && {
                      borderBottomWidth: StyleSheet.hairlineWidth,
                      borderBottomColor: colors.border,
                    },
                  ]}
                  onPress={() => setMode(opt.value)}
                  activeOpacity={0.7}
                >
                  <View style={styles.modeInfo}>
                    <Text style={[styles.modeLabel, { color: colors.text }]}>
                      {opt.label}
                    </Text>
                    <Text
                      style={[styles.modeDesc, { color: colors.textSecondary }]}
                    >
                      {opt.desc}
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.radio,
                      {
                        borderColor:
                          mode === opt.value
                            ? colors.primary
                            : colors.textMuted,
                      },
                    ]}
                  >
                    {mode === opt.value && (
                      <View
                        style={[
                          styles.radioInner,
                          { backgroundColor: colors.primary },
                        ]}
                      />
                    )}
                  </View>
                </TouchableOpacity>
              ))}
            </View>

            {/* Список контактов — если нужен */}
            {mode !== "all" && (
              <Text
                style={[styles.sectionTitle, { color: colors.textSecondary }]}
              >
                {mode === "contacts_except" ? "Скрыть от:" : "Показать только:"}
                {selectedUsers.size > 0 && ` (${selectedUsers.size})`}
              </Text>
            )}
          </View>
        }
        renderItem={({ item }) => {
          if (mode === "all") return null;
          const isSelected = selectedUsers.has(item.id);
          const avatarColor = getAvatarColor(item.id);
          return (
            <TouchableOpacity
              style={styles.contactRow}
              onPress={() => toggleUser(item.id)}
              activeOpacity={0.7}
            >
              <View
                style={[styles.contactAvatar, { backgroundColor: avatarColor }]}
              >
                {item.avatar_url ? (
                  <Image
                    source={{ uri: item.avatar_url }}
                    style={styles.contactAvatarImage}
                  />
                ) : (
                  <Text style={styles.contactAvatarText}>
                    {item.username?.[0]?.toUpperCase()}
                  </Text>
                )}
              </View>
              <Text
                style={[styles.contactName, { color: colors.text }]}
                numberOfLines={1}
              >
                {item.username}
              </Text>
              <View
                style={[
                  styles.checkbox,
                  isSelected && {
                    backgroundColor: colors.primary,
                    borderColor: colors.primary,
                  },
                  !isSelected && { borderColor: colors.textMuted },
                ]}
              >
                {isSelected && (
                  <Ionicons name="checkmark" size={14} color="#fff" />
                )}
              </View>
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={
          mode !== "all" ? (
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
              Нет контактов
            </Text>
          ) : null
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: {
    padding: 4,
    marginRight: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "600",
    flex: 1,
  },
  saveBtn: {
    padding: 4,
  },
  saveText: {
    fontSize: 16,
    fontWeight: "600",
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "600",
    textTransform: "uppercase",
    marginLeft: 16,
    marginTop: 20,
    marginBottom: 8,
  },
  card: {
    marginHorizontal: 16,
    borderRadius: 12,
    overflow: "hidden",
  },
  modeRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  modeInfo: {
    flex: 1,
  },
  modeLabel: {
    fontSize: 16,
    fontWeight: "500",
  },
  modeDesc: {
    fontSize: 13,
    marginTop: 2,
  },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    justifyContent: "center",
    alignItems: "center",
    marginLeft: 12,
  },
  radioInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  contactRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 12,
  },
  contactAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden",
  },
  contactAvatarImage: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  contactAvatarText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  contactName: {
    flex: 1,
    fontSize: 16,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 4,
    borderWidth: 2,
    justifyContent: "center",
    alignItems: "center",
  },
  emptyText: {
    textAlign: "center",
    marginTop: 20,
    fontSize: 14,
  },
});
