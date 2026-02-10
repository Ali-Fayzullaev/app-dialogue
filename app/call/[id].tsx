import { useAuth } from "@/contexts/auth-context";
import { useTheme } from "@/contexts/theme-context";
import {
  acceptCall,
  Call,
  declineCall,
  endCall,
  formatCallDuration,
} from "@/lib/call-service";
import { soundService } from "@/lib/sound-service";
import { supabase } from "@/lib/supabase";
import { Ionicons } from "@expo/vector-icons";
import { RealtimeChannel } from "@supabase/supabase-js";
import { Audio } from "expo-av";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import * as Linking from "expo-linking";
import { useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  Animated,
  Dimensions,
  Platform,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

const safeHaptic = (
  style: Haptics.ImpactFeedbackStyle = Haptics.ImpactFeedbackStyle.Medium,
) => {
  if (Platform.OS !== "web") {
    Haptics.impactAsync(style);
  }
};

type CallParams = {
  id: string;
  roomUrl?: string | string[];
  token?: string | string[];
  callType?: string | string[];
  isIncoming?: string | string[];
  callerName?: string | string[];
};

// Хелпер для получения строки из параметра
const getStringParam = (
  param: string | string[] | undefined,
): string | undefined => {
  if (Array.isArray(param)) return param[0];
  return param;
};

export default function CallScreen() {
  const params = useLocalSearchParams<CallParams>();
  const id = params.id;
  const roomUrl = getStringParam(params.roomUrl);
  const token = getStringParam(params.token);
  const callType = getStringParam(params.callType) as
    | "audio"
    | "video"
    | undefined;
  const isIncoming = getStringParam(params.isIncoming);
  const callerName = getStringParam(params.callerName);
  const router = useRouter();
  const navigation = useNavigation();
  const { user } = useAuth();
  const { colors, isDark } = useTheme();

  const [callState, setCallState] = useState<
    "connecting" | "ringing" | "active" | "ended"
  >(isIncoming === "true" ? "ringing" : "connecting");
  const [isMuted, setIsMuted] = useState(false);
  const [isSpeakerOn, setIsSpeakerOn] = useState(true);
  const [callDuration, setCallDuration] = useState(0);
  const [call, setCall] = useState<Call | null>(null);
  const [joinUrl, setJoinUrl] = useState<string | null>(null);
  const [otherUserName, setOtherUserName] = useState<string>(callerName || "");
  const [isConnected, setIsConnected] = useState(false);

  const durationTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const ring1Anim = useRef(new Animated.Value(0)).current;
  const ring2Anim = useRef(new Animated.Value(0)).current;
  const ring3Anim = useRef(new Animated.Value(0)).current;

  // Безопасная навигация назад
  const safeGoBack = useCallback(() => {
    if (navigation.canGoBack()) {
      router.back();
    } else {
      router.replace("/(tabs)");
    }
  }, [navigation, router]);

  // Настройка аудио для звонка
  const setupAudio = useCallback(async () => {
    try {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        staysActiveInBackground: true,
        shouldDuckAndroid: false,
        playThroughEarpieceAndroid: !isSpeakerOn,
      });
    } catch (error) {
      console.error("Error setting up audio:", error);
    }
  }, [isSpeakerOn]);

  // Анимация появления
  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 400,
      useNativeDriver: true,
    }).start();
  }, []);

  // Пульсирующая анимация для входящего звонка
  useEffect(() => {
    if (callState === "ringing" || callState === "connecting") {
      // Основная пульсация аватара
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.08,
            duration: 1200,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 1200,
            useNativeDriver: true,
          }),
        ]),
      );
      pulse.start();

      // Анимация колец
      const createRingAnimation = (anim: Animated.Value, delay: number) => {
        return Animated.loop(
          Animated.sequence([
            Animated.delay(delay),
            Animated.parallel([
              Animated.timing(anim, {
                toValue: 1,
                duration: 2000,
                useNativeDriver: true,
              }),
            ]),
            Animated.timing(anim, {
              toValue: 0,
              duration: 0,
              useNativeDriver: true,
            }),
          ]),
        );
      };

      const ring1 = createRingAnimation(ring1Anim, 0);
      const ring2 = createRingAnimation(ring2Anim, 600);
      const ring3 = createRingAnimation(ring3Anim, 1200);

      ring1.start();
      ring2.start();
      ring3.start();

      return () => {
        pulse.stop();
        ring1.stop();
        ring2.stop();
        ring3.stop();
      };
    }
  }, [callState]);

  // Загрузка данных о звонке
  useEffect(() => {
    const loadCall = async () => {
      if (!id) return;

      const { data, error } = await supabase
        .from("calls")
        .select("*")
        .eq("id", id)
        .single();

      if (error || !data) {
        console.error("Failed to load call:", error);
        Alert.alert("Ошибка", "Не удалось загрузить звонок");
        safeGoBack();
        return;
      }

      setCall(data);

      // Загружаем имя собеседника
      const otherUserId =
        data.caller_id === user?.id ? data.receiver_id : data.caller_id;
      if (otherUserId && !otherUserName) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("username")
          .eq("id", otherUserId)
          .single();
        if (profile?.username) {
          setOtherUserName(profile.username);
        }
      }

      // Если это исходящий звонок и есть roomUrl и token - подключаемся
      if (isIncoming !== "true" && roomUrl && token) {
        const url = `${roomUrl}?t=${token}`;
        setJoinUrl(url);
        setCallState("active");
        setIsConnected(true);
        startDurationTimer();
        await setupAudio();
        
        // Автоматически открываем браузер для исходящего звонка
        try {
          await Linking.openURL(url);
        } catch (e) {
          console.error("Failed to open browser:", e);
        }
      }
    };

    loadCall();
  }, [id]);

  // Подписка на изменения статуса звонка
  useEffect(() => {
    if (!id) return;

    channelRef.current = supabase
      .channel(`call_${id}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "calls",
          filter: `id=eq.${id}`,
        },
        (payload) => {
          const updatedCall = payload.new as Call;
          setCall(updatedCall);

          if (updatedCall.status === "active" && callState !== "active") {
            setCallState("active");
            setIsConnected(true);
            startDurationTimer();
            setupAudio();
          } else if (
            updatedCall.status === "ended" ||
            updatedCall.status === "declined" ||
            updatedCall.status === "missed"
          ) {
            setCallState("ended");
            stopDurationTimer();
            soundService.stopAllSounds();
            setTimeout(() => safeGoBack(), 1500);
          }
        },
      )
      .subscribe();

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
      }
    };
  }, [id, safeGoBack]);

  // Таймер длительности звонка
  const startDurationTimer = useCallback(() => {
    if (durationTimerRef.current) return;
    durationTimerRef.current = setInterval(() => {
      setCallDuration((prev) => prev + 1);
    }, 1000);
  }, []);

  const stopDurationTimer = useCallback(() => {
    if (durationTimerRef.current) {
      clearInterval(durationTimerRef.current);
      durationTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      stopDurationTimer();
      soundService.stopAllSounds();
    };
  }, []);

  // Принять входящий звонок
  const handleAcceptCall = async () => {
    if (!id || !user) return;
    safeHaptic();
    soundService.stopRingtone();

    setCallState("connecting");

    const result = await acceptCall(id, user.id);
    if (result) {
      const url = `${result.roomUrl}?t=${result.token}`;
      setJoinUrl(url);
      setCallState("active");
      setIsConnected(true);
      startDurationTimer();
      await setupAudio();
      
      // Автоматически открываем браузер для видео/аудио звонка
      // так как WebRTC не работает в Expo Go
      try {
        await Linking.openURL(url);
      } catch (e) {
        console.error("Failed to open browser:", e);
      }
    } else {
      Alert.alert("Ошибка", "Не удалось подключиться к звонку");
      safeGoBack();
    }
  };

  // Отклонить звонок
  const handleDeclineCall = async () => {
    if (!id) return;
    safeHaptic(Haptics.ImpactFeedbackStyle.Heavy);
    soundService.stopRingtone();

    await declineCall(id);
    safeGoBack();
  };

  // Завершить звонок
  const handleEndCall = async () => {
    if (!id) return;
    safeHaptic(Haptics.ImpactFeedbackStyle.Heavy);

    stopDurationTimer();
    setCallState("ended");
    await endCall(id);
    setTimeout(() => safeGoBack(), 500);
  };

  // Переключение микрофона
  const toggleMute = () => {
    safeHaptic(Haptics.ImpactFeedbackStyle.Light);
    setIsMuted(!isMuted);
    // В реальном приложении здесь нужно управлять аудио потоком
  };

  // Переключение динамика
  const toggleSpeaker = async () => {
    safeHaptic(Haptics.ImpactFeedbackStyle.Light);
    const newSpeakerState = !isSpeakerOn;
    setIsSpeakerOn(newSpeakerState);
    
    try {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        staysActiveInBackground: true,
        shouldDuckAndroid: false,
        playThroughEarpieceAndroid: !newSpeakerState,
      });
    } catch (error) {
      console.error("Error toggling speaker:", error);
    }
  };

  // Открыть видеозвонок в браузере (для видео)
  const openVideoInBrowser = async () => {
    if (joinUrl) {
      await Linking.openURL(joinUrl);
    }
  };

  const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: "#000",
    },
    gradientContainer: {
      flex: 1,
    },
    // Общий экран звонка
    callScreenContainer: {
      flex: 1,
      alignItems: "center",
      justifyContent: "space-between",
      paddingTop: Platform.OS === "ios" ? 80 : 60,
      paddingBottom: Platform.OS === "ios" ? 60 : 40,
    },
    // Верхняя часть с инфо
    topSection: {
      alignItems: "center",
    },
    callStatusText: {
      fontSize: 14,
      color: "rgba(255,255,255,0.7)",
      marginBottom: 8,
      textTransform: "uppercase",
      letterSpacing: 1,
    },
    // Центральная часть с аватаром
    centerSection: {
      alignItems: "center",
      flex: 1,
      justifyContent: "center",
    },
    avatarContainer: {
      alignItems: "center",
      justifyContent: "center",
    },
    ringAnimation: {
      position: "absolute",
      width: 160,
      height: 160,
      borderRadius: 80,
      borderWidth: 2,
      borderColor: "rgba(255,255,255,0.3)",
    },
    callerAvatar: {
      width: 130,
      height: 130,
      borderRadius: 65,
      backgroundColor: "rgba(255,255,255,0.15)",
      justifyContent: "center",
      alignItems: "center",
      borderWidth: 3,
      borderColor: "rgba(255,255,255,0.2)",
    },
    callerAvatarActive: {
      borderColor: "#34C759",
      borderWidth: 4,
    },
    avatarText: {
      fontSize: 48,
      fontWeight: "600",
      color: "#fff",
    },
    callerName: {
      fontSize: 28,
      fontWeight: "700",
      color: "#fff",
      marginTop: 24,
      textAlign: "center",
    },
    callTypeLabel: {
      fontSize: 16,
      color: "rgba(255,255,255,0.7)",
      marginTop: 8,
    },
    callDurationLarge: {
      fontSize: 24,
      color: "#fff",
      marginTop: 16,
      fontVariant: ["tabular-nums"],
      fontWeight: "600",
    },
    connectedBadge: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: "rgba(52, 199, 89, 0.2)",
      paddingHorizontal: 16,
      paddingVertical: 8,
      borderRadius: 20,
      marginTop: 12,
    },
    connectedDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: "#34C759",
      marginRight: 8,
    },
    connectedText: {
      color: "#34C759",
      fontSize: 14,
      fontWeight: "600",
    },
    // Нижняя часть с кнопками
    bottomSection: {
      width: "100%",
      paddingHorizontal: 30,
    },
    // Кнопки для входящего звонка
    incomingButtons: {
      flexDirection: "row",
      justifyContent: "space-around",
      alignItems: "center",
    },
    incomingButtonWrapper: {
      alignItems: "center",
    },
    incomingButton: {
      width: 72,
      height: 72,
      borderRadius: 36,
      justifyContent: "center",
      alignItems: "center",
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.3,
      shadowRadius: 8,
      elevation: 8,
    },
    declineButton: {
      backgroundColor: "#FF3B30",
    },
    acceptButton: {
      backgroundColor: "#34C759",
    },
    buttonLabel: {
      color: "rgba(255,255,255,0.8)",
      fontSize: 13,
      marginTop: 12,
      fontWeight: "500",
    },
    // Панель управления для активного звонка
    controlsContainer: {
      backgroundColor: "rgba(255,255,255,0.1)",
      borderRadius: 24,
      paddingVertical: 24,
      paddingHorizontal: 20,
    },
    controlsRow: {
      flexDirection: "row",
      justifyContent: "space-around",
      alignItems: "center",
    },
    controlButtonWrapper: {
      alignItems: "center",
    },
    controlButton: {
      width: 60,
      height: 60,
      borderRadius: 30,
      justifyContent: "center",
      alignItems: "center",
      backgroundColor: "rgba(255,255,255,0.15)",
    },
    controlButtonActive: {
      backgroundColor: "#fff",
    },
    controlButtonLabel: {
      color: "rgba(255,255,255,0.7)",
      fontSize: 11,
      marginTop: 8,
    },
    endCallButton: {
      width: 70,
      height: 70,
      borderRadius: 35,
      backgroundColor: "#FF3B30",
      justifyContent: "center",
      alignItems: "center",
      shadowColor: "#FF3B30",
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.4,
      shadowRadius: 8,
      elevation: 8,
    },
    // Экран завершения
    endedContainer: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
    },
    endedIcon: {
      width: 80,
      height: 80,
      borderRadius: 40,
      backgroundColor: "rgba(255,255,255,0.1)",
      justifyContent: "center",
      alignItems: "center",
      marginBottom: 20,
    },
    endedText: {
      color: "#fff",
      fontSize: 22,
      fontWeight: "600",
    },
    endedDuration: {
      color: "rgba(255,255,255,0.6)",
      fontSize: 16,
      marginTop: 8,
    },
    // Видео кнопка
    videoButton: {
      backgroundColor: "rgba(88, 86, 214, 0.3)",
      paddingHorizontal: 20,
      paddingVertical: 12,
      borderRadius: 25,
      marginTop: 20,
      flexDirection: "row",
      alignItems: "center",
    },
    videoButtonText: {
      color: "#fff",
      fontSize: 14,
      fontWeight: "600",
      marginLeft: 8,
    },
  });

  // Получаем инициалы для аватара
  const getInitials = (name: string) => {
    return name?.charAt(0).toUpperCase() || "?";
  };

  // Рендер кольца анимации
  const renderRing = (anim: Animated.Value) => {
    const scale = anim.interpolate({
      inputRange: [0, 1],
      outputRange: [1, 2],
    });
    const opacity = anim.interpolate({
      inputRange: [0, 0.5, 1],
      outputRange: [0.6, 0.3, 0],
    });

    return (
      <Animated.View
        style={[
          styles.ringAnimation,
          {
            transform: [{ scale }],
            opacity,
          },
        ]}
      />
    );
  };

  // Экран входящего звонка
  if (callState === "ringing" && isIncoming === "true") {
    return (
      <LinearGradient
        colors={
          isDark
            ? ["#1a1a2e", "#16213e", "#0f3460"]
            : [colors.primary, "#5856D6", "#AF52DE"]
        }
        style={styles.gradientContainer}
      >
        <StatusBar barStyle="light-content" />
        <Animated.View
          style={[styles.callScreenContainer, { opacity: fadeAnim }]}
        >
          <View style={styles.topSection}>
            <Text style={styles.callStatusText}>Входящий звонок</Text>
          </View>

          <View style={styles.centerSection}>
            <View style={styles.avatarContainer}>
              {renderRing(ring1Anim)}
              {renderRing(ring2Anim)}
              {renderRing(ring3Anim)}
              <Animated.View
                style={[
                  styles.callerAvatar,
                  { transform: [{ scale: pulseAnim }] },
                ]}
              >
                <Text style={styles.avatarText}>
                  {getInitials(callerName || otherUserName)}
                </Text>
              </Animated.View>
            </View>
            <Text style={styles.callerName}>
              {callerName || otherUserName || "Неизвестный"}
            </Text>
            <Text style={styles.callTypeLabel}>
              {callType === "video" ? "📹 Видеозвонок" : "📞 Аудиозвонок"}
            </Text>
          </View>

          <View style={styles.bottomSection}>
            <View style={styles.incomingButtons}>
              <View style={styles.incomingButtonWrapper}>
                <TouchableOpacity
                  style={[styles.incomingButton, styles.declineButton]}
                  onPress={handleDeclineCall}
                  activeOpacity={0.8}
                >
                  <Ionicons name="close" size={32} color="#fff" />
                </TouchableOpacity>
                <Text style={styles.buttonLabel}>Отклонить</Text>
              </View>

              <View style={styles.incomingButtonWrapper}>
                <TouchableOpacity
                  style={[styles.incomingButton, styles.acceptButton]}
                  onPress={handleAcceptCall}
                  activeOpacity={0.8}
                >
                  <Ionicons
                    name={callType === "video" ? "videocam" : "call"}
                    size={28}
                    color="#fff"
                  />
                </TouchableOpacity>
                <Text style={styles.buttonLabel}>Принять</Text>
              </View>
            </View>
          </View>
        </Animated.View>
      </LinearGradient>
    );
  }

  // Экран подключения / исходящего звонка
  if (callState === "connecting") {
    return (
      <LinearGradient
        colors={
          isDark
            ? ["#1a1a2e", "#16213e", "#0f3460"]
            : [colors.primary, "#5856D6", "#AF52DE"]
        }
        style={styles.gradientContainer}
      >
        <StatusBar barStyle="light-content" />
        <Animated.View
          style={[styles.callScreenContainer, { opacity: fadeAnim }]}
        >
          <View style={styles.topSection}>
            <Text style={styles.callStatusText}>Вызов...</Text>
          </View>

          <View style={styles.centerSection}>
            <View style={styles.avatarContainer}>
              {renderRing(ring1Anim)}
              {renderRing(ring2Anim)}
              {renderRing(ring3Anim)}
              <Animated.View
                style={[
                  styles.callerAvatar,
                  { transform: [{ scale: pulseAnim }] },
                ]}
              >
                <Text style={styles.avatarText}>
                  {getInitials(otherUserName)}
                </Text>
              </Animated.View>
            </View>
            <Text style={styles.callerName}>{otherUserName || "Вызов..."}</Text>
            <Text style={styles.callTypeLabel}>
              {callType === "video" ? "📹 Видеозвонок" : "📞 Аудиозвонок"}
            </Text>
          </View>

          <View style={styles.bottomSection}>
            <View style={styles.incomingButtons}>
              <View style={styles.incomingButtonWrapper}>
                <TouchableOpacity
                  style={styles.endCallButton}
                  onPress={handleEndCall}
                  activeOpacity={0.8}
                >
                  <Ionicons
                    name="call"
                    size={28}
                    color="#fff"
                    style={{ transform: [{ rotate: "135deg" }] }}
                  />
                </TouchableOpacity>
                <Text style={styles.buttonLabel}>Завершить</Text>
              </View>
            </View>
          </View>
        </Animated.View>
      </LinearGradient>
    );
  }

  // Экран завершения
  if (callState === "ended") {
    return (
      <LinearGradient
        colors={["#1a1a1a", "#2d2d2d", "#1a1a1a"]}
        style={styles.gradientContainer}
      >
        <StatusBar barStyle="light-content" />
        <View style={styles.endedContainer}>
          <View style={styles.endedIcon}>
            <Ionicons name="call" size={36} color="rgba(255,255,255,0.5)" />
          </View>
          <Text style={styles.endedText}>Звонок завершён</Text>
          {callDuration > 0 && (
            <Text style={styles.endedDuration}>
              {formatCallDuration(callDuration)}
            </Text>
          )}
        </View>
      </LinearGradient>
    );
  }

  // Активный звонок
  return (
    <LinearGradient
      colors={
        isDark
          ? ["#0f3460", "#16213e", "#1a1a2e"]
          : ["#34C759", "#30B350", "#28A745"]
      }
      style={styles.gradientContainer}
    >
      <StatusBar barStyle="light-content" />
      <View style={styles.callScreenContainer}>
        <View style={styles.topSection}>
          <Text style={styles.callStatusText}>
            {callType === "video" ? "Видеозвонок" : "Аудиозвонок"}
          </Text>
        </View>

        <View style={styles.centerSection}>
          <View style={styles.avatarContainer}>
            <View style={[styles.callerAvatar, styles.callerAvatarActive]}>
              <Text style={styles.avatarText}>
                {getInitials(otherUserName)}
              </Text>
            </View>
          </View>
          <Text style={styles.callerName}>{otherUserName}</Text>
          
          <View style={styles.connectedBadge}>
            <View style={styles.connectedDot} />
            <Text style={styles.connectedText}>Подключено</Text>
          </View>

          <Text style={styles.callDurationLarge}>
            {formatCallDuration(callDuration)}
          </Text>

          {/* Кнопка для открытия видео в браузере */}
          {callType === "video" && joinUrl && (
            <TouchableOpacity
              style={styles.videoButton}
              onPress={openVideoInBrowser}
              activeOpacity={0.8}
            >
              <Ionicons name="open-outline" size={20} color="#fff" />
              <Text style={styles.videoButtonText}>Открыть видео</Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.bottomSection}>
          <View style={styles.controlsContainer}>
            <View style={styles.controlsRow}>
              {/* Микрофон */}
              <View style={styles.controlButtonWrapper}>
                <TouchableOpacity
                  style={[
                    styles.controlButton,
                    isMuted && styles.controlButtonActive,
                  ]}
                  onPress={toggleMute}
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name={isMuted ? "mic-off" : "mic"}
                    size={26}
                    color={isMuted ? "#000" : "#fff"}
                  />
                </TouchableOpacity>
                <Text style={styles.controlButtonLabel}>
                  {isMuted ? "Вкл микрофон" : "Выкл микрофон"}
                </Text>
              </View>

              {/* Завершить звонок */}
              <View style={styles.controlButtonWrapper}>
                <TouchableOpacity
                  style={styles.endCallButton}
                  onPress={handleEndCall}
                  activeOpacity={0.8}
                >
                  <Ionicons
                    name="call"
                    size={30}
                    color="#fff"
                    style={{ transform: [{ rotate: "135deg" }] }}
                  />
                </TouchableOpacity>
              </View>

              {/* Динамик */}
              <View style={styles.controlButtonWrapper}>
                <TouchableOpacity
                  style={[
                    styles.controlButton,
                    !isSpeakerOn && styles.controlButtonActive,
                  ]}
                  onPress={toggleSpeaker}
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name={isSpeakerOn ? "volume-high" : "volume-mute"}
                    size={26}
                    color={!isSpeakerOn ? "#000" : "#fff"}
                  />
                </TouchableOpacity>
                <Text style={styles.controlButtonLabel}>
                  {isSpeakerOn ? "Динамик" : "Наушник"}
                </Text>
              </View>
            </View>
          </View>
        </View>
      </View>
    </LinearGradient>
  );
}
