import { supabase } from "@/lib/supabase";
import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { useEffect, useRef, useState } from "react";
import { Platform } from "react-native";

// Настройка обработки уведомлений
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export interface PushNotificationState {
  expoPushToken: string | null;
  notification: Notifications.Notification | null;
}

export function usePushNotifications(userId: string | null) {
  const [expoPushToken, setExpoPushToken] = useState<string | null>(null);
  const [notification, setNotification] =
    useState<Notifications.Notification | null>(null);

  const notificationListener = useRef<Notifications.EventSubscription | null>(
    null,
  );
  const responseListener = useRef<Notifications.EventSubscription | null>(null);

  // Регистрация для push-уведомлений
  async function registerForPushNotificationsAsync(): Promise<string | null> {
    let token: string | null = null;

    // Push работает только на реальных устройствах
    if (!Device.isDevice) {
      console.log("Push notifications require a physical device");
      return null;
    }

    // Проверка и запрос разрешений
    const { status: existingStatus } =
      await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== "granted") {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== "granted") {
      console.log("Push notification permission not granted");
      return null;
    }

    // Получение Expo Push Token
    try {
      const projectId = Constants.expoConfig?.extra?.eas?.projectId;

      if (!projectId) {
        console.log("No projectId found. Configure eas.projectId in app.json");
        return null;
      }

      const pushToken = await Notifications.getExpoPushTokenAsync({
        projectId,
      });
      token = pushToken.data;
      console.log("Expo Push Token:", token);
    } catch (error) {
      console.error("Error getting push token:", error);
      return null;
    }

    // Настройка канала для Android
    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("messages", {
        name: "Сообщения",
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: "#007AFF",
        sound: "default",
      });
    }

    return token;
  }

  // Сохранение токена в Supabase
  async function savePushToken(token: string) {
    if (!userId) return;

    try {
      // Проверяем существует ли уже токен
      const { data: existing } = await supabase
        .from("push_tokens")
        .select("id")
        .eq("user_id", userId)
        .eq("token", token)
        .single();

      if (existing) {
        // Обновляем updated_at
        await supabase
          .from("push_tokens")
          .update({ updated_at: new Date().toISOString() })
          .eq("id", existing.id);
      } else {
        // Создаем новый токен
        await supabase.from("push_tokens").insert({
          user_id: userId,
          token: token,
          platform: Platform.OS,
        });
      }

      console.log("Push token saved to database");
    } catch (error) {
      console.error("Error saving push token:", error);
    }
  }

  // Удаление токена при выходе
  async function removePushToken() {
    if (!userId || !expoPushToken) return;

    try {
      await supabase
        .from("push_tokens")
        .delete()
        .eq("user_id", userId)
        .eq("token", expoPushToken);

      console.log("Push token removed from database");
    } catch (error) {
      console.error("Error removing push token:", error);
    }
  }

  useEffect(() => {
    if (!userId) return;

    // Регистрация и сохранение токена
    registerForPushNotificationsAsync().then((token) => {
      if (token) {
        setExpoPushToken(token);
        savePushToken(token);
      }
    });

    // Слушатель входящих уведомлений (когда приложение открыто)
    notificationListener.current =
      Notifications.addNotificationReceivedListener((notification) => {
        setNotification(notification);
        console.log("Notification received:", notification);
      });

    // Слушатель нажатия на уведомление
    // Навигация обрабатывается в _layout.tsx через отдельный слушатель
    responseListener.current =
      Notifications.addNotificationResponseReceivedListener((response) => {
        const data = response.notification.request.content.data;
        console.log("Notification tapped:", data);
      });

    return () => {
      if (notificationListener.current) {
        notificationListener.current.remove();
      }
      if (responseListener.current) {
        responseListener.current.remove();
      }
    };
  }, [userId]);

  return {
    expoPushToken,
    notification,
    removePushToken,
  };
}

// Функция для отправки локального уведомления (для тестирования)
export async function sendLocalNotification(
  title: string,
  body: string,
  data?: Record<string, unknown>,
) {
  await Notifications.scheduleNotificationAsync({
    content: {
      title,
      body,
      data,
      sound: "default",
    },
    trigger: null, // Немедленно
  });
}
