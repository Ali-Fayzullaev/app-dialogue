import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider,
} from "@react-navigation/native";
import * as Notifications from "expo-notifications";
import { Stack, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { ActivityIndicator, View } from "react-native";
import "react-native-reanimated";

import { AuthProvider, useAuth } from "@/contexts/auth-context";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { usePresence } from "@/hooks/use-presence";
import { usePushNotifications } from "@/hooks/use-push-notifications";
import AuthScreen from "./auth";

export const unstable_settings = {
  anchor: "(tabs)",
};

function RootLayoutNav() {
  const colorScheme = useColorScheme();
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
        if (data?.chatId) {
          router.push(`/chat/${data.chatId}`);
        }
      },
    );

    return () => subscription.remove();
  }, [router]);

  console.log("RootLayoutNav render:", {
    session: !!session,
    loading,
    pushToken: !!expoPushToken,
  });

  if (loading) {
    console.log("Showing loading spinner");
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator size="large" color="#007AFF" />
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
    <ThemeProvider value={colorScheme === "dark" ? DarkTheme : DefaultTheme}>
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="chat/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="profile/[id]" options={{ headerShown: false }} />
        <Stack.Screen
          name="new-chat"
          options={{ presentation: "modal", title: "Новый чат" }}
        />
        <Stack.Screen
          name="modal"
          options={{ presentation: "modal", title: "Modal" }}
        />
      </Stack>
      <StatusBar style="auto" />
    </ThemeProvider>
  );
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <RootLayoutNav />
    </AuthProvider>
  );
}
