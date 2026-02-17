import { useTheme } from "@/contexts/theme-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React from "react";
import {
    Platform,
    SafeAreaView,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function SettingsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors, themeMode, accentColor } = useTheme();

  // Получаем текст для текущей темы
  const getThemeText = () => {
    switch (themeMode) {
      case "light":
        return "Светлая";
      case "dark":
        return "Тёмная";
      case "system":
        return "Системная";
    }
  };

  const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    header: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      backgroundColor: colors.headerBackground,
      paddingTop: Platform.OS === "android" ? insets.top + 12 : 12,
    },
    backButton: {
      width: 40,
      height: 40,
      borderRadius: 20,
      justifyContent: "center",
      alignItems: "center",
      backgroundColor: colors.surface,
    },
    headerTitle: {
      fontSize: 20,
      fontWeight: "700",
      color: colors.text,
      marginLeft: 12,
    },
    content: {
      flex: 1,
    },
    section: {
      marginTop: 24,
      paddingHorizontal: 16,
    },
    sectionTitle: {
      fontSize: 13,
      fontWeight: "600",
      color: colors.textSecondary,
      marginBottom: 10,
      textTransform: "uppercase",
      letterSpacing: 0.5,
    },
    card: {
      backgroundColor: colors.card,
      borderRadius: 16,
      overflow: "hidden",
      ...Platform.select({
        ios: {
          shadowColor: colors.shadowColor,
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.1,
          shadowRadius: 8,
        },
        android: {
          elevation: 3,
        },
      }),
    },
    navItem: {
      flexDirection: "row",
      alignItems: "center",
      padding: 16,
      borderBottomWidth: 1,
      borderBottomColor: colors.borderLight,
    },
    navItemLast: {
      borderBottomWidth: 0,
    },
    navIcon: {
      width: 40,
      height: 40,
      borderRadius: 12,
      justifyContent: "center",
      alignItems: "center",
      marginRight: 14,
    },
    navContent: {
      flex: 1,
    },
    navLabel: {
      fontSize: 16,
      fontWeight: "500",
      color: colors.text,
    },
    navValue: {
      fontSize: 13,
      color: colors.textSecondary,
      marginTop: 2,
    },
    colorDot: {
      width: 20,
      height: 20,
      borderRadius: 10,
      marginRight: 8,
    },
    navRight: {
      flexDirection: "row",
      alignItems: "center",
    },
  });

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Настройки</Text>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Chats & Privacy */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Чаты</Text>
          <View style={styles.card}>
            {/* Folders */}
            <TouchableOpacity
              style={styles.navItem}
              onPress={() => router.push("/folders")}
            >
              <View
                style={[
                  styles.navIcon,
                  { backgroundColor: colors.primary + "20" },
                ]}
              >
                <Ionicons
                  name="folder-outline"
                  size={22}
                  color={colors.primary}
                />
              </View>
              <View style={styles.navContent}>
                <Text style={styles.navLabel}>Папки чатов</Text>
                <Text style={styles.navValue}>Организация чатов</Text>
              </View>
              <Ionicons
                name="chevron-forward"
                size={20}
                color={colors.textSecondary}
              />
            </TouchableOpacity>

            {/* Blocked Users */}
            <TouchableOpacity
              style={[styles.navItem, styles.navItemLast]}
              onPress={() => router.push("/blocked-users")}
            >
              <View style={[styles.navIcon, { backgroundColor: "#FEE2E2" }]}>
                <Ionicons name="ban-outline" size={22} color="#DC2626" />
              </View>
              <View style={styles.navContent}>
                <Text style={styles.navLabel}>Чёрный список</Text>
                <Text style={styles.navValue}>
                  Заблокированные пользователи
                </Text>
              </View>
              <Ionicons
                name="chevron-forward"
                size={20}
                color={colors.textSecondary}
              />
            </TouchableOpacity>
          </View>
        </View>

        {/* Конфиденциальность */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Конфиденциальность</Text>
          <View style={styles.card}>
            <TouchableOpacity
              style={[styles.navItem, styles.navItemLast]}
              onPress={() => router.push("/story-privacy" as any)}
            >
              <View style={[styles.navIcon, { backgroundColor: "#25D36620" }]}>
                <Ionicons name="eye-outline" size={22} color="#25D366" />
              </View>
              <View style={styles.navContent}>
                <Text style={styles.navLabel}>Приватность статусов</Text>
                <Text style={styles.navValue}>Кто видит мои статусы</Text>
              </View>
              <Ionicons
                name="chevron-forward"
                size={20}
                color={colors.textSecondary}
              />
            </TouchableOpacity>
          </View>
        </View>

        {/* Appearance */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Оформление</Text>
          <View style={styles.card}>
            {/* Theme & Colors */}
            <TouchableOpacity
              style={[styles.navItem, styles.navItemLast]}
              onPress={() => router.push("/appearance")}
            >
              <View
                style={[
                  styles.navIcon,
                  { backgroundColor: accentColor.primaryLight },
                ]}
              >
                <Ionicons
                  name="color-palette-outline"
                  size={22}
                  color={accentColor.primary}
                />
              </View>
              <View style={styles.navContent}>
                <Text style={styles.navLabel}>Тема и цвета</Text>
                <Text style={styles.navValue}>{getThemeText()}</Text>
              </View>
              <View style={styles.navRight}>
                <View
                  style={[
                    styles.colorDot,
                    { backgroundColor: accentColor.primary },
                  ]}
                />
                <Ionicons
                  name="chevron-forward"
                  size={20}
                  color={colors.textSecondary}
                />
              </View>
            </TouchableOpacity>
          </View>
        </View>

        {/* Bottom spacing */}
        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}
