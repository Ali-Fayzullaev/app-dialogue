import { useAuth } from "@/contexts/auth-context";
import { useTheme } from "@/contexts/theme-context";
import {
    acceptCall,
    Call,
    declineCall,
    endCall,
    formatCallDuration,
} from "@/lib/call-service";
import { supabase } from "@/lib/supabase";
import { Ionicons } from "@expo/vector-icons";
import { RealtimeChannel } from "@supabase/supabase-js";
import { BlurView } from "expo-blur";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
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
import { WebView } from "react-native-webview";

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
  const { user } = useAuth();
  const { colors, isDark } = useTheme();

  const [callState, setCallState] = useState<
    "connecting" | "ringing" | "active" | "ended"
  >(isIncoming === "true" ? "ringing" : "connecting");
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(callType === "audio");
  const [isSpeakerOn, setIsSpeakerOn] = useState(true);
  const [callDuration, setCallDuration] = useState(0);
  const [call, setCall] = useState<Call | null>(null);
  const [joinUrl, setJoinUrl] = useState<string | null>(null);
  const [otherUserName, setOtherUserName] = useState<string>(callerName || "");

  const durationTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const ringAnim = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const ring1Anim = useRef(new Animated.Value(0)).current;
  const ring2Anim = useRef(new Animated.Value(0)).current;
  const ring3Anim = useRef(new Animated.Value(0)).current;
  const webViewRef = useRef<WebView>(null);

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
        router.back();
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

      // Если это исходящий звонок и есть roomUrl и token - сразу подключаемся
      if (isIncoming !== "true" && roomUrl && token) {
        setJoinUrl(`${roomUrl}?t=${token}`);
        setCallState("active");
        startDurationTimer();
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
            startDurationTimer();
          } else if (
            updatedCall.status === "ended" ||
            updatedCall.status === "declined" ||
            updatedCall.status === "missed"
          ) {
            setCallState("ended");
            stopDurationTimer();
            setTimeout(() => router.back(), 1500);
          }
        },
      )
      .subscribe();

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
      }
    };
  }, [id]);

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
    return () => stopDurationTimer();
  }, []);

  // Принять входящий звонок
  const handleAcceptCall = async () => {
    if (!id || !user) return;
    safeHaptic();

    setCallState("connecting");

    const result = await acceptCall(id, user.id);
    if (result) {
      setJoinUrl(`${result.roomUrl}?t=${result.token}`);
      setCallState("active");
      startDurationTimer();
    } else {
      Alert.alert("Ошибка", "Не удалось подключиться к звонку");
      router.back();
    }
  };

  // Отклонить звонок
  const handleDeclineCall = async () => {
    if (!id) return;
    safeHaptic(Haptics.ImpactFeedbackStyle.Heavy);

    await declineCall(id);
    router.back();
  };

  // Завершить звонок
  const handleEndCall = async () => {
    if (!id) return;
    safeHaptic(Haptics.ImpactFeedbackStyle.Heavy);

    stopDurationTimer();
    setCallState("ended");
    await endCall(id);
    setTimeout(() => router.back(), 500);
  };

  // Переключение микрофона
  const toggleMute = () => {
    safeHaptic(Haptics.ImpactFeedbackStyle.Light);
    const newMuted = !isMuted;
    setIsMuted(newMuted);
    // Отправляем команду в WebView (setLocalAudio принимает true для включения)
    webViewRef.current?.injectJavaScript(`
      if (window.callFrame) {
        window.callFrame.setLocalAudio(${!newMuted});
      }
      true;
    `);
  };

  // Переключение камеры
  const toggleVideo = () => {
    safeHaptic(Haptics.ImpactFeedbackStyle.Light);
    const newVideoOff = !isVideoOff;
    setIsVideoOff(newVideoOff);
    // Отправляем команду в WebView (setLocalVideo принимает true для включения)
    webViewRef.current?.injectJavaScript(`
      if (window.callFrame) {
        window.callFrame.setLocalVideo(${!newVideoOff});
      }
      true;
    `);
  };

  // Переключение динамика
  const toggleSpeaker = () => {
    safeHaptic(Haptics.ImpactFeedbackStyle.Light);
    setIsSpeakerOn(!isSpeakerOn);
  };

  // HTML для Daily.co WebView
  const getDailyHtml = (url: string) => `
    <!DOCTYPE html>
    <html>
    <head>
      <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        html, body { 
          width: 100%; 
          height: 100%; 
          overflow: hidden;
          background: #000;
        }
        #daily-container {
          width: 100%;
          height: 100%;
        }
      </style>
      <script crossorigin src="https://unpkg.com/@daily-co/daily-js"></script>
    </head>
    <body>
      <div id="daily-container"></div>
      <script>
        window.callFrame = Daily.createFrame(document.getElementById('daily-container'), {
          iframeStyle: {
            width: '100%',
            height: '100%',
            border: 'none',
          },
          showLeaveButton: false,
          showFullscreenButton: false,
        });
        
        window.callFrame.join({ url: '${url}' })
          .then(() => {
            window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'joined' }));
          })
          .catch((err) => {
            window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'error', error: err.message }));
          });
        
        window.callFrame.on('left-meeting', () => {
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'left' }));
        });
        
        window.callFrame.on('error', (e) => {
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'error', error: e.errorMsg }));
        });
      </script>
    </body>
    </html>
  `;

  const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: "#000",
    },
    gradientContainer: {
      flex: 1,
    },
    videoContainer: {
      flex: 1,
      backgroundColor: "#1a1a1a",
    },
    webview: {
      flex: 1,
    },
    // Общий экран звонка (входящий/исходящий/подключение)
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
      fontSize: 18,
      color: "rgba(255,255,255,0.9)",
      marginTop: 12,
      fontVariant: ["tabular-nums"],
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
    controlsOverlay: {
      position: "absolute",
      bottom: 0,
      left: 0,
      right: 0,
      paddingBottom: Platform.OS === "ios" ? 50 : 30,
      paddingTop: 24,
      paddingHorizontal: 20,
    },
    controlsBlur: {
      borderRadius: 24,
      overflow: "hidden",
      paddingVertical: 20,
      paddingHorizontal: 16,
    },
    durationContainer: {
      alignItems: "center",
      marginBottom: 24,
    },
    durationText: {
      color: "#fff",
      fontSize: 17,
      fontWeight: "600",
      fontVariant: ["tabular-nums"],
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
      width: 56,
      height: 56,
      borderRadius: 28,
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
      width: 68,
      height: 68,
      borderRadius: 34,
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
  });

  // Получаем инициалы для аватара
  const getInitials = (name: string) => {
    return name?.charAt(0).toUpperCase() || "?";
  };

  // Рендер кольца анимации
  const renderRing = (anim: Animated.Value, delay: number) => {
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
          {/* Верхняя часть */}
          <View style={styles.topSection}>
            <Text style={styles.callStatusText}>Входящий звонок</Text>
          </View>

          {/* Центральная часть с аватаром */}
          <View style={styles.centerSection}>
            <View style={styles.avatarContainer}>
              {renderRing(ring1Anim, 0)}
              {renderRing(ring2Anim, 600)}
              {renderRing(ring3Anim, 1200)}
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
              {callType === "video" ? "Видеозвонок" : "Аудиозвонок"}
            </Text>
          </View>

          {/* Нижняя часть с кнопками */}
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
          {/* Верхняя часть */}
          <View style={styles.topSection}>
            <Text style={styles.callStatusText}>Вызов...</Text>
          </View>

          {/* Центральная часть с аватаром */}
          <View style={styles.centerSection}>
            <View style={styles.avatarContainer}>
              {renderRing(ring1Anim, 0)}
              {renderRing(ring2Anim, 600)}
              {renderRing(ring3Anim, 1200)}
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
              {callType === "video" ? "Видеозвонок" : "Аудиозвонок"}
            </Text>
          </View>

          {/* Нижняя часть с кнопкой завершения */}
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

  // Активный звонок с видео
  return (
    <View style={styles.container}>
      {/* Видео через WebView */}
      {joinUrl && (
        <View style={styles.videoContainer}>
          <WebView
            ref={webViewRef}
            source={{ html: getDailyHtml(joinUrl) }}
            style={styles.webview}
            javaScriptEnabled
            mediaPlaybackRequiresUserAction={false}
            allowsInlineMediaPlayback
            allowsFullscreenVideo
            onMessage={(event) => {
              try {
                const data = JSON.parse(event.nativeEvent.data);
                if (data.type === "joined") {
                  console.log("Daily.co call joined successfully");
                } else if (data.type === "left") {
                  console.log("Daily.co call left");
                  handleEndCall();
                } else if (data.type === "error") {
                  console.error("Daily.co error:", data.error);
                  Alert.alert("Ошибка", "Не удалось подключиться к звонку");
                }
              } catch (e) {
                console.log("WebView message:", event.nativeEvent.data);
              }
            }}
          />
        </View>
      )}

      {/* Панель управления */}
      <View style={styles.controlsOverlay}>
        <BlurView intensity={80} tint="dark" style={styles.controlsBlur}>
          {/* Длительность */}
          <View style={styles.durationContainer}>
            <Text style={styles.durationText}>
              {formatCallDuration(callDuration)}
            </Text>
          </View>

          {/* Кнопки управления */}
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
                  size={24}
                  color={isMuted ? "#000" : "#fff"}
                />
              </TouchableOpacity>
              <Text style={styles.controlButtonLabel}>
                {isMuted ? "Вкл" : "Выкл"}
              </Text>
            </View>

            {/* Камера (только для видеозвонка) */}
            {callType === "video" && (
              <View style={styles.controlButtonWrapper}>
                <TouchableOpacity
                  style={[
                    styles.controlButton,
                    isVideoOff && styles.controlButtonActive,
                  ]}
                  onPress={toggleVideo}
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name={isVideoOff ? "videocam-off" : "videocam"}
                    size={24}
                    color={isVideoOff ? "#000" : "#fff"}
                  />
                </TouchableOpacity>
                <Text style={styles.controlButtonLabel}>Камера</Text>
              </View>
            )}

            {/* Завершить звонок */}
            <View style={styles.controlButtonWrapper}>
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
                  size={24}
                  color={!isSpeakerOn ? "#000" : "#fff"}
                />
              </TouchableOpacity>
              <Text style={styles.controlButtonLabel}>Динамик</Text>
            </View>
          </View>
        </BlurView>
      </View>
    </View>
  );
}
