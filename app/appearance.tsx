import { accentColors, ThemeMode, useTheme } from "@/contexts/theme-context";
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

export default function AppearanceScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const {
    colors,
    themeMode,
    setThemeMode,
    accentColor,
    setAccentColor,
    isDark,
  } = useTheme();

  const themeModes: {
    mode: ThemeMode;
    label: string;
    icon: keyof typeof Ionicons.glyphMap;
  }[] = [
    { mode: "light", label: "Светлая", icon: "sunny" },
    { mode: "dark", label: "Тёмная", icon: "moon" },
    { mode: "system", label: "Системная", icon: "phone-portrait" },
  ];

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
      fontSize: 14,
      fontWeight: "600",
      color: colors.textSecondary,
      marginBottom: 12,
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
    themeOption: {
      flexDirection: "row",
      alignItems: "center",
      padding: 16,
      borderBottomWidth: 1,
      borderBottomColor: colors.borderLight,
    },
    themeOptionLast: {
      borderBottomWidth: 0,
    },
    themeIcon: {
      width: 40,
      height: 40,
      borderRadius: 12,
      justifyContent: "center",
      alignItems: "center",
      marginRight: 12,
    },
    themeLabel: {
      flex: 1,
      fontSize: 16,
      color: colors.text,
    },
    checkIcon: {
      width: 24,
      height: 24,
      borderRadius: 12,
      justifyContent: "center",
      alignItems: "center",
    },
    colorsContainer: {
      flexDirection: "row",
      flexWrap: "wrap",
      padding: 12,
      gap: 12,
    },
    colorOption: {
      width: 56,
      height: 56,
      borderRadius: 28,
      justifyContent: "center",
      alignItems: "center",
      borderWidth: 3,
      borderColor: "transparent",
    },
    colorOptionSelected: {
      borderColor: colors.text,
    },
    colorInner: {
      width: 44,
      height: 44,
      borderRadius: 22,
      justifyContent: "center",
      alignItems: "center",
    },
    colorName: {
      fontSize: 11,
      color: colors.textSecondary,
      textAlign: "center",
      marginTop: 4,
    },
    previewCard: {
      backgroundColor: colors.card,
      borderRadius: 16,
      padding: 16,
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
    previewTitle: {
      fontSize: 14,
      fontWeight: "600",
      color: colors.textSecondary,
      marginBottom: 16,
    },
    previewChat: {
      backgroundColor: colors.backgroundChat,
      borderRadius: 12,
      padding: 12,
    },
    previewBubbleMine: {
      alignSelf: "flex-end",
      backgroundColor: colors.messageMine,
      borderRadius: 16,
      borderBottomRightRadius: 4,
      paddingHorizontal: 14,
      paddingVertical: 10,
      maxWidth: "75%",
      marginBottom: 8,
    },
    previewBubbleOther: {
      alignSelf: "flex-start",
      backgroundColor: colors.messageOther,
      borderRadius: 16,
      borderBottomLeftRadius: 4,
      paddingHorizontal: 14,
      paddingVertical: 10,
      maxWidth: "75%",
    },
    previewText: {
      fontSize: 15,
      color: colors.text,
    },
    previewTime: {
      fontSize: 11,
      color: colors.textSecondary,
      marginTop: 4,
      textAlign: "right",
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
        <Text style={styles.headerTitle}>Оформление</Text>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Theme Mode */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Тема приложения</Text>
          <View style={styles.card}>
            {themeModes.map((theme, index) => (
              <TouchableOpacity
                key={theme.mode}
                style={[
                  styles.themeOption,
                  index === themeModes.length - 1 && styles.themeOptionLast,
                ]}
                onPress={() => setThemeMode(theme.mode)}
              >
                <View
                  style={[
                    styles.themeIcon,
                    {
                      backgroundColor:
                        themeMode === theme.mode
                          ? colors.primary + "20"
                          : colors.surface,
                    },
                  ]}
                >
                  <Ionicons
                    name={theme.icon}
                    size={20}
                    color={
                      themeMode === theme.mode
                        ? colors.primary
                        : colors.textSecondary
                    }
                  />
                </View>
                <Text style={styles.themeLabel}>{theme.label}</Text>
                {themeMode === theme.mode && (
                  <View
                    style={[
                      styles.checkIcon,
                      { backgroundColor: colors.primary },
                    ]}
                  >
                    <Ionicons name="checkmark" size={16} color="#fff" />
                  </View>
                )}
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Accent Color */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Цвет чата</Text>
          <View style={styles.card}>
            <View style={styles.colorsContainer}>
              {accentColors.map((color) => (
                <TouchableOpacity
                  key={color.primary}
                  onPress={() => setAccentColor(color)}
                >
                  <View
                    style={[
                      styles.colorOption,
                      accentColor.primary === color.primary &&
                        styles.colorOptionSelected,
                    ]}
                  >
                    <View
                      style={[
                        styles.colorInner,
                        { backgroundColor: color.primary },
                      ]}
                    >
                      {accentColor.primary === color.primary && (
                        <Ionicons name="checkmark" size={24} color="#fff" />
                      )}
                    </View>
                  </View>
                  <Text style={styles.colorName}>{color.name}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>

        {/* Preview */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Предпросмотр</Text>
          <View style={styles.previewCard}>
            <Text style={styles.previewTitle}>Как будет выглядеть чат:</Text>
            <View style={styles.previewChat}>
              <View style={styles.previewBubbleOther}>
                <Text style={styles.previewText}>Привет! Как дела? 👋</Text>
                <Text style={styles.previewTime}>10:30</Text>
              </View>
              <View style={styles.previewBubbleMine}>
                <Text style={styles.previewText}>Отлично! А у тебя?</Text>
                <Text style={styles.previewTime}>10:31 ✓✓</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Bottom spacing */}
        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}
