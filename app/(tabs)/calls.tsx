import { useAuth } from "@/contexts/auth-context";
import { useTheme } from "@/contexts/theme-context";
import {
    Call,
    formatCallDuration,
    initiateCall
} from "@/lib/call-service";
import { supabase } from "@/lib/supabase";
import { Profile } from "@/types/database";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    FlatList,
    Platform,
    RefreshControl,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const safeHaptic = (
  style: Haptics.ImpactFeedbackStyle = Haptics.ImpactFeedbackStyle.Medium,
) => {
  if (Platform.OS !== "web") {
    Haptics.impactAsync(style);
  }
};

interface CallWithProfile extends Call {
  caller?: Profile;
  receiver?: Profile;
}

export default function CallsScreen() {
  const { user } = useAuth();
  const { colors, isDark } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [calls, setCalls] = useState<CallWithProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Загрузка истории звонков
  const loadCalls = useCallback(async () => {
    if (!user?.id) return;

    try {
      // Получаем звонки пользователя
      const { data, error } = await supabase
        .from("calls")
        .select("*")
        .or(`caller_id.eq.${user.id},receiver_id.eq.${user.id}`)
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) {
        console.error("Failed to load calls:", error);
        return;
      }

      if (!data) {
        setCalls([]);
        return;
      }

      // Получаем профили участников
      const userIds = new Set<string>();
      data.forEach((call) => {
        userIds.add(call.caller_id);
        userIds.add(call.receiver_id);
      });

      const { data: profiles } = await supabase
        .from("profiles")
        .select("*")
        .in("id", Array.from(userIds));

      const profileMap = new Map(profiles?.map((p) => [p.id, p]) || []);

      const callsWithProfiles: CallWithProfile[] = data.map((call) => ({
        ...call,
        caller: profileMap.get(call.caller_id),
        receiver: profileMap.get(call.receiver_id),
      }));

      setCalls(callsWithProfiles);
    } catch (error) {
      console.error("Load calls error:", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user?.id]);

  useEffect(() => {
    loadCalls();
  }, [loadCalls]);

  // Перезвонить
  const handleCallback = async (call: CallWithProfile) => {
    if (!user?.id) return;
    safeHaptic();

    // Определяем кому перезвонить (тому, кто не является текущим пользователем)
    const targetId =
      call.caller_id === user.id ? call.receiver_id : call.caller_id;

    const result = await initiateCall(
      call.chat_id,
      user.id,
      targetId,
      call.call_type,
    );

    if (result) {
      router.push({
        pathname: "/call/[id]",
        params: {
          id: result.call.id,
          roomUrl: result.roomUrl,
          token: result.token,
          callType: call.call_type,
          isIncoming: "false",
        },
      });
    } else {
      Alert.alert("Ошибка", "Не удалось начать звонок");
    }
  };

  // Форматирование времени звонка
  const formatCallTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffDays = Math.floor(
      (now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24),
    );

    const time = date.toLocaleTimeString("ru-RU", {
      hour: "2-digit",
      minute: "2-digit",
    });

    if (diffDays === 0) {
      return time;
    } else if (diffDays === 1) {
      return `Вчера, ${time}`;
    } else if (diffDays < 7) {
      const days = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];
      return `${days[date.getDay()]}, ${time}`;
    } else {
      return date.toLocaleDateString("ru-RU", {
        day: "numeric",
        month: "short",
      });
    }
  };

  // Получить иконку статуса звонка
  const getCallIcon = (call: CallWithProfile) => {
    const isOutgoing = call.caller_id === user?.id;
    const isMissed = call.status === "missed" || call.status === "declined";

    if (isMissed) {
      return {
        name: isOutgoing ? "arrow-up" : "arrow-down",
        color: "#FF3B30",
      };
    }

    return {
      name: isOutgoing ? "arrow-up" : "arrow-down",
      color: isOutgoing ? "#34C759" : colors.primary,
    };
  };

  // Получить текст статуса
  const getCallStatusText = (call: CallWithProfile) => {
    switch (call.status) {
      case "missed":
        return "Пропущенный";
      case "declined":
        return "Отклонённый";
      case "ended":
        if (call.duration_seconds && call.duration_seconds > 0) {
          return formatCallDuration(call.duration_seconds);
        }
        return "Завершён";
      case "failed":
        return "Ошибка";
      default:
        return "";
    }
  };

  const renderCallItem = ({ item }: { item: CallWithProfile }) => {
    const isOutgoing = item.caller_id === user?.id;
    const otherUser = isOutgoing ? item.receiver : item.caller;
    const isMissed = item.status === "missed" || item.status === "declined";
    const icon = getCallIcon(item);

    return (
      <TouchableOpacity
        style={[
          styles.callItem,
          { backgroundColor: isDark ? "#1c1c1e" : "#fff" },
        ]}
        onPress={() => handleCallback(item)}
        activeOpacity={0.7}
      >
        {/* Аватар */}
        <View
          style={[
            styles.avatar,
            { backgroundColor: isDark ? "#2c2c2e" : "#f0f0f0" },
          ]}
        >
          <Text style={[styles.avatarText, { color: colors.primary }]}>
            {otherUser?.username?.charAt(0).toUpperCase() || "?"}
          </Text>
        </View>

        {/* Информация о звонке */}
        <View style={styles.callInfo}>
          <View style={styles.callHeader}>
            <Text
              style={[
                styles.callerName,
                { color: isMissed ? "#FF3B30" : colors.text },
              ]}
              numberOfLines={1}
            >
              {otherUser?.username || "Неизвестный"}
            </Text>
            <Text style={[styles.callTime, { color: colors.textSecondary }]}>
              {formatCallTime(item.created_at)}
            </Text>
          </View>

          <View style={styles.callDetails}>
            <Ionicons
              name={icon.name as any}
              size={14}
              color={icon.color}
              style={styles.callDirectionIcon}
            />
            <Ionicons
              name={item.call_type === "video" ? "videocam" : "call"}
              size={14}
              color={colors.textSecondary}
              style={{ marginRight: 6 }}
            />
            <Text style={[styles.callStatus, { color: colors.textSecondary }]}>
              {getCallStatusText(item)}
            </Text>
          </View>
        </View>

        {/* Кнопка перезвона */}
        <TouchableOpacity
          style={styles.callbackButton}
          onPress={() => handleCallback(item)}
        >
          <Ionicons
            name={item.call_type === "video" ? "videocam" : "call"}
            size={22}
            color={colors.primary}
          />
        </TouchableOpacity>
      </TouchableOpacity>
    );
  };

  const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    header: {
      paddingTop: insets.top + 10,
      paddingHorizontal: 20,
      paddingBottom: 15,
      backgroundColor: colors.background,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: isDark ? "#333" : "#e0e0e0",
    },
    headerTitle: {
      fontSize: 32,
      fontWeight: "700",
      color: colors.text,
    },
    loadingContainer: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
    },
    emptyContainer: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
      paddingHorizontal: 40,
    },
    emptyIcon: {
      marginBottom: 16,
    },
    emptyText: {
      fontSize: 18,
      fontWeight: "600",
      color: colors.text,
      marginBottom: 8,
      textAlign: "center",
    },
    emptySubtext: {
      fontSize: 14,
      color: colors.textSecondary,
      textAlign: "center",
    },
    listContent: {
      paddingTop: 8,
    },
    callItem: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: 12,
      paddingHorizontal: 16,
      marginHorizontal: 16,
      marginVertical: 4,
      borderRadius: 12,
    },
    avatar: {
      width: 50,
      height: 50,
      borderRadius: 25,
      justifyContent: "center",
      alignItems: "center",
      marginRight: 14,
    },
    avatarText: {
      fontSize: 20,
      fontWeight: "600",
    },
    callInfo: {
      flex: 1,
    },
    callHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 4,
    },
    callerName: {
      fontSize: 16,
      fontWeight: "600",
      flex: 1,
      marginRight: 8,
    },
    callTime: {
      fontSize: 13,
    },
    callDetails: {
      flexDirection: "row",
      alignItems: "center",
    },
    callDirectionIcon: {
      marginRight: 6,
    },
    callStatus: {
      fontSize: 13,
    },
    callbackButton: {
      width: 44,
      height: 44,
      justifyContent: "center",
      alignItems: "center",
    },
  });

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Звонки</Text>
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Звонки</Text>
      </View>

      {calls.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons
            name="call-outline"
            size={64}
            color={colors.textSecondary}
            style={styles.emptyIcon}
          />
          <Text style={styles.emptyText}>Нет звонков</Text>
          <Text style={styles.emptySubtext}>
            Здесь будет отображаться история ваших звонков
          </Text>
        </View>
      ) : (
        <FlatList
          data={calls}
          renderItem={renderCallItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                loadCalls();
              }}
              tintColor={colors.primary}
            />
          }
        />
      )}
    </View>
  );
}
