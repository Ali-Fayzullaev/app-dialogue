import { supabase, SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/supabase";
import { useEffect, useRef, useState } from "react";
import { AppState, AppStateStatus, Platform } from "react-native";

export interface UserPresence {
  user_id: string;
  is_online: boolean;
  last_seen: string;
}

// Таймаут для определения оффлайн (если last_seen старше 60 секунд)
const OFFLINE_THRESHOLD_MS = 60000;

export function usePresence(userId: string | null) {
  const appState = useRef(AppState.currentState);
  const heartbeatInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const isActive = useRef(true);

  // Обновить статус онлайн
  const updatePresence = async (isOnline: boolean) => {
    if (!userId) return;

    try {
      const { error } = await supabase.from("user_presence").upsert(
        {
          user_id: userId,
          is_online: isOnline,
          last_seen: new Date().toISOString(),
        },
        { onConflict: "user_id" },
      );

      if (error) {
        // Ignore RLS/permission errors silently in production
        if (process.env.NODE_ENV === "development") {
          console.warn("Presence update warning:", error.message);
        }
      }
    } catch (error) {
      // Silently ignore presence errors to not spam console
    }
  };

  // Heartbeat для поддержания онлайн статуса
  const startHeartbeat = () => {
    if (heartbeatInterval.current) {
      clearInterval(heartbeatInterval.current);
    }

    // Обновляем каждые 20 секунд
    heartbeatInterval.current = setInterval(() => {
      if (isActive.current) {
        updatePresence(true);
      }
    }, 20000);
  };

  const stopHeartbeat = () => {
    if (heartbeatInterval.current) {
      clearInterval(heartbeatInterval.current);
      heartbeatInterval.current = null;
    }
  };

  // Отслеживаем состояние приложения (mobile)
  useEffect(() => {
    if (!userId || Platform.OS === "web") return;

    isActive.current = true;
    updatePresence(true);
    startHeartbeat();

    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      if (
        appState.current.match(/inactive|background/) &&
        nextAppState === "active"
      ) {
        // Приложение стало активным
        isActive.current = true;
        updatePresence(true);
        startHeartbeat();
      } else if (nextAppState.match(/inactive|background/)) {
        // Приложение ушло в фон
        isActive.current = false;
        updatePresence(false);
        stopHeartbeat();
      }
      appState.current = nextAppState;
    };

    const subscription = AppState.addEventListener(
      "change",
      handleAppStateChange,
    );

    return () => {
      subscription.remove();
      stopHeartbeat();
      isActive.current = false;
      updatePresence(false);
    };
  }, [userId]);

  // Для web — используем visibilitychange и beforeunload
  useEffect(() => {
    if (!userId || Platform.OS !== "web") return;

    isActive.current = true;
    updatePresence(true);
    startHeartbeat();

    // Когда вкладка становится невидимой
    const handleVisibilityChange = () => {
      if (document.hidden) {
        isActive.current = false;
        updatePresence(false);
        stopHeartbeat();
      } else {
        isActive.current = true;
        updatePresence(true);
        startHeartbeat();
      }
    };

    // При закрытии страницы - синхронный запрос
    const handleBeforeUnload = () => {
      isActive.current = false;
      // Используем синхронный fetch через keepalive
      const url = `${SUPABASE_URL}/rest/v1/user_presence?user_id=eq.${userId}`;
      fetch(url, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          is_online: false,
          last_seen: new Date().toISOString(),
        }),
        keepalive: true,
      }).catch(() => {});
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("beforeunload", handleBeforeUnload);
      stopHeartbeat();
      isActive.current = false;
      updatePresence(false);
    };
  }, [userId]);
}

// Проверка, онлайн ли пользователь по last_seen
export const isUserReallyOnline = (
  isOnlineFlag: boolean,
  lastSeen: string | null,
): boolean => {
  if (!isOnlineFlag) return false;
  if (!lastSeen) return false;

  const now = new Date().getTime();
  const lastSeenTime = new Date(lastSeen).getTime();
  const diffMs = now - lastSeenTime;

  // Если last_seen старше 60 секунд, считаем оффлайн
  return diffMs < OFFLINE_THRESHOLD_MS;
};

// Hook для отслеживания онлайн статуса другого пользователя
export function useUserOnlineStatus(targetUserId: string | null) {
  const [rawIsOnline, setRawIsOnline] = useState(false);
  const [lastSeen, setLastSeen] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState(false);
  const checkInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  // Периодически проверяем, не устарел ли last_seen
  useEffect(() => {
    const checkOnlineStatus = () => {
      setIsOnline(isUserReallyOnline(rawIsOnline, lastSeen));
    };

    checkOnlineStatus();

    // Проверяем каждые 10 секунд
    checkInterval.current = setInterval(checkOnlineStatus, 10000);

    return () => {
      if (checkInterval.current) {
        clearInterval(checkInterval.current);
      }
    };
  }, [rawIsOnline, lastSeen]);

  useEffect(() => {
    if (!targetUserId) return;

    // Получаем начальный статус
    const fetchPresence = async () => {
      const { data } = await supabase
        .from("user_presence")
        .select("*")
        .eq("user_id", targetUserId)
        .single();

      if (data) {
        setRawIsOnline(data.is_online);
        setLastSeen(data.last_seen);
      }
    };

    fetchPresence();

    // Подписываемся на изменения в реальном времени
    const channel = supabase
      .channel(`presence:${targetUserId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "user_presence",
          filter: `user_id=eq.${targetUserId}`,
        },
        (payload) => {
          const presence = payload.new as UserPresence;
          setRawIsOnline(presence.is_online);
          setLastSeen(presence.last_seen);
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [targetUserId]);

  // Форматирование "был недавно"
  const formatLastSeen = () => {
    if (isOnline) return "в сети";
    if (!lastSeen) return "был(а) недавно";

    const now = new Date();
    const lastSeenDate = new Date(lastSeen);
    const diffMs = now.getTime() - lastSeenDate.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMins < 1) return "был(а) только что";
    if (diffMins < 60) return `был(а) ${diffMins} мин назад`;
    if (diffHours < 24) return `был(а) ${diffHours} ч назад`;
    if (diffDays === 1) return "был(а) вчера";
    return `был(а) ${diffDays} дн назад`;
  };

  return { isOnline, lastSeen, formatLastSeen };
}
