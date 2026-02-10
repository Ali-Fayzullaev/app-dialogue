import { useAuth } from "@/contexts/auth-context";
import { useTheme } from "@/contexts/theme-context";
import {
    cancelCallNotification,
    sendCallNotification,
} from "@/hooks/use-push-notifications";
import {
    acceptCall,
    Call,
    declineCall,
    subscribeToCallsForUser,
} from "@/lib/call-service";
import { supabase } from "@/lib/supabase";
import { Ionicons } from "@expo/vector-icons";
import { RealtimeChannel } from "@supabase/supabase-js";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React, {
    createContext,
    useContext,
    useEffect,
    useRef,
    useState,
} from "react";
import {
    Animated,
    Dimensions,
    Modal,
    Platform,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

interface IncomingCallContextType {
  incomingCall: Call | null;
  callerName: string | null;
}

const IncomingCallContext = createContext<IncomingCallContextType>({
  incomingCall: null,
  callerName: null,
});

export const useIncomingCall = () => useContext(IncomingCallContext);

const safeHaptic = (
  style: Haptics.ImpactFeedbackStyle = Haptics.ImpactFeedbackStyle.Heavy,
) => {
  if (Platform.OS !== "web") {
    Haptics.impactAsync(style);
  }
};

export function IncomingCallProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user } = useAuth();
  const router = useRouter();
  const { colors, isDark } = useTheme();

  const [incomingCall, setIncomingCall] = useState<Call | null>(null);
  const [callerName, setCallerName] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);

  const channelRef = useRef<RealtimeChannel | null>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const slideAnim = useRef(new Animated.Value(SCREEN_WIDTH)).current;

  // Пульсирующая анимация
  useEffect(() => {
    if (showModal) {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.15,
            duration: 800,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 800,
            useNativeDriver: true,
          }),
        ]),
      );
      pulse.start();

      // Slide in animation
      Animated.spring(slideAnim, {
        toValue: 0,
        tension: 50,
        friction: 9,
        useNativeDriver: true,
      }).start();

      // Вибрация при входящем звонке
      if (Platform.OS !== "web") {
        const interval = setInterval(() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
        }, 1500);
        return () => {
          clearInterval(interval);
          pulse.stop();
        };
      }

      return () => pulse.stop();
    }
  }, [showModal]);

  // Подписка на входящие звонки
  useEffect(() => {
    if (!user?.id) return;

    channelRef.current = subscribeToCallsForUser(user.id, async (call) => {
      // Показываем только входящие звонки в статусе "ringing" для получателя
      if (
        call.status === "ringing" &&
        call.receiver_id === user.id &&
        call.caller_id !== user.id
      ) {
        // Получаем имя звонящего
        const { data: callerProfile } = await supabase
          .from("profiles")
          .select("username")
          .eq("id", call.caller_id)
          .single();

        const name = callerProfile?.username || "Неизвестный";
        setCallerName(name);
        setIncomingCall(call);
        setShowModal(true);
        safeHaptic();

        // Отправляем push-уведомление
        sendCallNotification(name, call.call_type, call.id, call.chat_id);
      } else if (
        incomingCall?.id === call.id &&
        (call.status === "ended" ||
          call.status === "declined" ||
          call.status === "missed")
      ) {
        // Звонок завершён - скрываем модал
        cancelCallNotification();
        closeModal();
      }
    });

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
      }
    };
  }, [user?.id]);

  const closeModal = () => {
    Animated.timing(slideAnim, {
      toValue: SCREEN_WIDTH,
      duration: 200,
      useNativeDriver: true,
    }).start(() => {
      setShowModal(false);
      setIncomingCall(null);
      setCallerName(null);
    });
  };

  // Принять звонок
  const handleAccept = async () => {
    if (!incomingCall || !user) return;
    safeHaptic(Haptics.ImpactFeedbackStyle.Medium);

    const result = await acceptCall(incomingCall.id, user.id);

    if (result) {
      closeModal();
      router.push({
        pathname: `/call/${incomingCall.id}`,
        params: {
          roomUrl: result.roomUrl,
          token: result.token,
          callType: incomingCall.call_type,
          isIncoming: "true",
          callerName: callerName || "Неизвестный",
        },
      } as any);
    }
  };

  // Отклонить звонок
  const handleDecline = async () => {
    if (!incomingCall) return;
    safeHaptic(Haptics.ImpactFeedbackStyle.Heavy);

    await declineCall(incomingCall.id);
    closeModal();
  };

  const styles = StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.85)",
      justifyContent: "center",
      alignItems: "center",
      padding: 24,
    },
    container: {
      width: SCREEN_WIDTH - 48,
      backgroundColor: isDark ? "#1e1e1e" : "#fff",
      borderRadius: 24,
      padding: 32,
      alignItems: "center",
      ...Platform.select({
        ios: {
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 10 },
          shadowOpacity: 0.3,
          shadowRadius: 20,
        },
        android: {
          elevation: 20,
        },
      }),
    },
    avatarContainer: {
      marginBottom: 24,
    },
    avatar: {
      width: 100,
      height: 100,
      borderRadius: 50,
      backgroundColor: colors.primary,
      justifyContent: "center",
      alignItems: "center",
    },
    callerName: {
      fontSize: 24,
      fontWeight: "700",
      color: colors.text,
      marginBottom: 8,
      textAlign: "center",
    },
    callType: {
      fontSize: 16,
      color: colors.textSecondary,
      marginBottom: 40,
    },
    buttonsRow: {
      flexDirection: "row",
      gap: 48,
    },
    buttonContainer: {
      alignItems: "center",
    },
    declineButton: {
      width: 64,
      height: 64,
      borderRadius: 32,
      backgroundColor: "#FF3B30",
      justifyContent: "center",
      alignItems: "center",
    },
    acceptButton: {
      width: 64,
      height: 64,
      borderRadius: 32,
      backgroundColor: "#34C759",
      justifyContent: "center",
      alignItems: "center",
    },
    buttonLabel: {
      marginTop: 8,
      fontSize: 14,
      color: colors.textSecondary,
    },
  });

  return (
    <IncomingCallContext.Provider value={{ incomingCall, callerName }}>
      {children}

      <Modal
        visible={showModal}
        transparent
        animationType="none"
        statusBarTranslucent
      >
        <View style={styles.overlay}>
          <Animated.View
            style={[
              styles.container,
              { transform: [{ translateX: slideAnim }] },
            ]}
          >
            {/* Avatar */}
            <View style={styles.avatarContainer}>
              <Animated.View
                style={[styles.avatar, { transform: [{ scale: pulseAnim }] }]}
              >
                <Ionicons
                  name={
                    incomingCall?.call_type === "video" ? "videocam" : "call"
                  }
                  size={44}
                  color="#fff"
                />
              </Animated.View>
            </View>

            {/* Caller info */}
            <Text style={styles.callerName}>{callerName}</Text>
            <Text style={styles.callType}>
              {incomingCall?.call_type === "video"
                ? "Видеозвонок"
                : "Аудиозвонок"}
            </Text>

            {/* Action buttons */}
            <View style={styles.buttonsRow}>
              <View style={styles.buttonContainer}>
                <TouchableOpacity
                  style={styles.declineButton}
                  onPress={handleDecline}
                  activeOpacity={0.8}
                >
                  <Ionicons name="close" size={32} color="#fff" />
                </TouchableOpacity>
                <Text style={styles.buttonLabel}>Отклонить</Text>
              </View>

              <View style={styles.buttonContainer}>
                <TouchableOpacity
                  style={styles.acceptButton}
                  onPress={handleAccept}
                  activeOpacity={0.8}
                >
                  <Ionicons
                    name={
                      incomingCall?.call_type === "video" ? "videocam" : "call"
                    }
                    size={28}
                    color="#fff"
                  />
                </TouchableOpacity>
                <Text style={styles.buttonLabel}>Принять</Text>
              </View>
            </View>
          </Animated.View>
        </View>
      </Modal>
    </IncomingCallContext.Provider>
  );
}
