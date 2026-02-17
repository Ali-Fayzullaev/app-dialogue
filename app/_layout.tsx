import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider as NavigationThemeProvider,
} from "@react-navigation/native";
import * as Notifications from "expo-notifications";
import { Stack, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { ActivityIndicator, Platform, View } from "react-native";
import "react-native-reanimated";

import { AuthProvider, useAuth } from "@/contexts/auth-context";
import { ThemeProvider, useTheme } from "@/contexts/theme-context";
import { usePresence } from "@/hooks/use-presence";
import { usePushNotifications } from "@/hooks/use-push-notifications";
import AuthScreen from "./auth";

export const unstable_settings = {
  anchor: "(tabs)",
};

function RootLayoutNav() {
  const { isDark, colors } = useTheme();
  const { session, loading, user } = useAuth();
  const router = useRouter();

  // Отслеживание онлайн статуса текущего пользователя
  usePresence(user?.id || null);

  // Инициализация push-уведомлений
  const { expoPushToken, notification } = usePushNotifications(
    user?.id || null,
  );

  // Обработка нажатия на уведомление - переход в чат
  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        const data = response.notification.request.content.data;
        if (data?.chatId && session) {
          // Небольшая задержка чтобы навигация была готова
          setTimeout(() => {
            router.push(`/chat/${data.chatId}` as any);
          }, 500);
        }
      },
    );

    // Обрабатываем уведомление если приложение было открыто из закрытого состояния
    // getLastNotificationResponseAsync недоступен на web
    if (Platform.OS !== "web") {
      Notifications.getLastNotificationResponseAsync().then((response) => {
        if (response && session) {
          const data = response.notification.request.content.data;
          if (data?.chatId) {
            setTimeout(() => {
              router.push(`/chat/${data.chatId}` as any);
            }, 1000);
          }
        }
      });
    }

    return () => subscription.remove();
  }, [router, session]);

  console.log("RootLayoutNav render:", {
    session: !!session,
    loading,
    pushToken: !!expoPushToken,
  });

  if (loading) {
    console.log("Showing loading spinner");
    return (
      <View
        style={{
          flex: 1,
          justifyContent: "center",
          alignItems: "center",
          backgroundColor: colors.background,
        }}
      >
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  // Если не авторизован — показываем экран входа
  if (!session) {
    console.log("No session, showing auth screen");
    return <AuthScreen />;
  }

  console.log("Session exists, showing main app");
  return (
    <NavigationThemeProvider value={isDark ? DarkTheme : DefaultTheme}>
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="chat/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="profile/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="search" options={{ headerShown: false }} />
        <Stack.Screen name="settings" options={{ headerShown: false }} />
        <Stack.Screen name="story-privacy" options={{ headerShown: false }} />
        <Stack.Screen
          name="new-chat"
          options={{ presentation: "modal", title: "Новый чат" }}
        />
        <Stack.Screen
          name="modal"
          options={{ presentation: "modal", title: "Modal" }}
        />
      </Stack>
      <StatusBar style={isDark ? "light" : "dark"} />
    </NavigationThemeProvider>
  );
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <ThemeProvider>
        <RootLayoutNav />
      </ThemeProvider>
    </AuthProvider>
  );
}
