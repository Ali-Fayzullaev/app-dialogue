import { useTheme } from "@/contexts/theme-context";
import { Ionicons } from "@expo/vector-icons";
import { Audio } from "expo-av";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
    Animated,
    Platform,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";

const TOTAL_BARS = 40;
const BAR_WIDTH = 2.5;
const BAR_GAP = 1.5;
const MAX_BAR_HEIGHT = 24;
const MIN_BAR_HEIGHT = 3;

interface VoiceMessageBubbleProps {
  messageId: string;
  audioUrl: string;
  isMyMessage: boolean;
  waveform?: number[] | null;
  duration?: number | null;
  playingAudioId: string | null;
  onPlayStateChange: (messageId: string | null) => void;
  soundRef: React.MutableRefObject<Audio.Sound | null>;
}

// Нормализовать waveform данные до TOTAL_BARS баров
function normalizeWaveform(raw: number[] | null | undefined): number[] {
  if (!raw || raw.length === 0) {
    return Array.from({ length: TOTAL_BARS }, () => 0.05 + Math.random() * 0.1);
  }

  const result: number[] = [];
  const step = raw.length / TOTAL_BARS;

  for (let i = 0; i < TOTAL_BARS; i++) {
    const startIdx = Math.floor(i * step);
    const endIdx = Math.min(Math.floor((i + 1) * step), raw.length);

    let sum = 0;
    let count = 0;
    for (let j = startIdx; j < endIdx; j++) {
      sum += raw[j];
      count++;
    }

    const avg = count > 0 ? sum / count : 0;
    result.push(Math.max(0.05, Math.min(1, avg)));
  }

  return result;
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// Флаг — был ли уже настроен AudioMode
let audioModeConfigured = false;

async function ensureAudioMode() {
  if (audioModeConfigured || Platform.OS === "web") return;
  await Audio.setAudioModeAsync({
    allowsRecordingIOS: false,
    playsInSilentModeIOS: true,
  });
  audioModeConfigured = true;
}

// Сброс флага при записи (вызывается из чата)
export function resetAudioMode() {
  audioModeConfigured = false;
}

export default function VoiceMessageBubble({
  messageId,
  audioUrl,
  isMyMessage,
  waveform,
  duration,
  playingAudioId,
  onPlayStateChange,
  soundRef,
}: VoiceMessageBubbleProps) {
  const { colors, isDark } = useTheme();
  const [progress, setProgress] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [totalDuration, setTotalDuration] = useState(duration || 0);
  const [isLoading, setIsLoading] = useState(false);
  const isPlaying = playingAudioId === messageId;
  const progressInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const localSoundRef = useRef<Audio.Sound | null>(null);
  const playButtonScale = useRef(new Animated.Value(1)).current;

  const bars = useMemo(() => normalizeWaveform(waveform), [waveform]);

  // Предварительная настройка аудио режима при монтировании
  useEffect(() => {
    if (Platform.OS !== "web") {
      ensureAudioMode();
    }
  }, []);

  // Отслеживаем прогресс воспроизведения
  useEffect(() => {
    if (isPlaying && (soundRef.current || localSoundRef.current)) {
      const sound = soundRef.current || localSoundRef.current;
      progressInterval.current = setInterval(async () => {
        try {
          if (!sound) return;
          const status = await sound.getStatusAsync();
          if (status.isLoaded && status.durationMillis) {
            const pos = status.positionMillis / status.durationMillis;
            setProgress(Math.min(1, pos));
            setCurrentTime(status.positionMillis / 1000);
            if (status.durationMillis > 0) {
              setTotalDuration(status.durationMillis / 1000);
            }
          }
        } catch {
          // Sound might be unloaded
        }
      }, 60);
    } else {
      if (progressInterval.current) {
        clearInterval(progressInterval.current);
        progressInterval.current = null;
      }
      if (!isPlaying) {
        setProgress(0);
        setCurrentTime(0);
      }
    }

    return () => {
      if (progressInterval.current) {
        clearInterval(progressInterval.current);
      }
    };
  }, [isPlaying]);

  const animateButton = () => {
    Animated.sequence([
      Animated.timing(playButtonScale, {
        toValue: 0.85,
        duration: 40,
        useNativeDriver: true,
      }),
      Animated.spring(playButtonScale, {
        toValue: 1,
        useNativeDriver: true,
        speed: 50,
      }),
    ]).start();
  };

  const handlePlay = async () => {
    animateButton();

    // Пауза
    if (isPlaying && soundRef.current) {
      await soundRef.current.pauseAsync();
      onPlayStateChange(null);
      return;
    }

    // Возобновление (если была пауза на этом же сообщении)
    if (progress > 0 && progress < 1 && localSoundRef.current) {
      try {
        const status = await localSoundRef.current.getStatusAsync();
        if (status.isLoaded) {
          onPlayStateChange(messageId);
          await localSoundRef.current.playAsync();
          return;
        }
      } catch {
        // Sound was unloaded
      }
    }

    // === Новое воспроизведение ===
    // Сразу показываем что нажали
    onPlayStateChange(messageId);

    // Останавливаем предыдущий звук
    if (soundRef.current) {
      try {
        await soundRef.current.stopAsync();
        await soundRef.current.unloadAsync();
      } catch {}
      soundRef.current = null;
    }

    if (Platform.OS === "web") {
      try {
        const audio = new window.Audio(audioUrl);
        audio.play();
        audio.onended = () => {
          onPlayStateChange(null);
          setProgress(0);
          setCurrentTime(0);
        };
      } catch (error) {
        console.error("Web audio error:", error);
        onPlayStateChange(null);
      }
      return;
    }

    try {
      await ensureAudioMode();

      const { sound } = await Audio.Sound.createAsync(
        { uri: audioUrl },
        { shouldPlay: true, progressUpdateIntervalMillis: 60 },
        (status) => {
          if ("didJustFinish" in status && status.didJustFinish) {
            onPlayStateChange(null);
            setProgress(0);
            setCurrentTime(0);
            sound.unloadAsync();
            soundRef.current = null;
            localSoundRef.current = null;
          }
        },
      );

      soundRef.current = sound;
      localSoundRef.current = sound;

      const status = await sound.getStatusAsync();
      if (status.isLoaded && status.durationMillis) {
        setTotalDuration(status.durationMillis / 1000);
      }
    } catch (error) {
      console.error("Play audio error:", error);
      onPlayStateChange(null);
    }
  };

  // Цвета — адаптивные для светлой и тёмной темы
  const myPlayedBar = isDark ? "#fff" : colors.primary;
  const myUnplayedBar = isDark
    ? "rgba(255,255,255,0.35)"
    : colors.primary + "50";
  const myPlayBtnBg = isDark ? "rgba(255,255,255,0.2)" : colors.primary;
  const myPlayBtnIcon = "#fff";
  const myTimeColor = isDark ? "rgba(255,255,255,0.75)" : colors.primary + "CC";

  const playedBarColor = isMyMessage ? myPlayedBar : colors.primary;
  const unplayedBarColor = isMyMessage
    ? myUnplayedBar
    : isDark
      ? colors.textMuted + "60"
      : colors.border;
  const playButtonBg = isMyMessage ? myPlayBtnBg : colors.primary;
  const playButtonIcon = isMyMessage ? myPlayBtnIcon : "#fff";
  const timeColor = isMyMessage ? myTimeColor : colors.textSecondary;

  const progressBarIndex = Math.floor(progress * TOTAL_BARS);

  return (
    <View style={styles.container}>
      {/* Play/Pause кнопка */}
      <Animated.View style={{ transform: [{ scale: playButtonScale }] }}>
        <TouchableOpacity
          style={[styles.playButton, { backgroundColor: playButtonBg }]}
          onPress={handlePlay}
          activeOpacity={0.7}
        >
          <Ionicons
            name={isPlaying ? "pause" : "play"}
            size={22}
            color={playButtonIcon}
            style={isPlaying ? undefined : { marginLeft: 2 }}
          />
        </TouchableOpacity>
      </Animated.View>

      {/* Waveform + время */}
      <View style={styles.waveformSection}>
        {/* Полоски */}
        <View style={styles.waveformContainer}>
          {bars.map((amplitude, i) => {
            const height =
              MIN_BAR_HEIGHT + amplitude * (MAX_BAR_HEIGHT - MIN_BAR_HEIGHT);
            const isPlayed = i < progressBarIndex;
            const isCurrent = i === progressBarIndex && isPlaying;

            return (
              <View
                key={i}
                style={[
                  styles.bar,
                  {
                    height,
                    backgroundColor:
                      isPlayed || isCurrent ? playedBarColor : unplayedBarColor,
                  },
                  isCurrent && {
                    shadowColor:
                      isMyMessage && isDark ? "#fff" : colors.primary,
                    shadowOffset: { width: 0, height: 0 },
                    shadowOpacity: 0.5,
                    shadowRadius: 3,
                    elevation: 2,
                  },
                ]}
              />
            );
          })}
        </View>

        {/* Время */}
        <View style={styles.timeRow}>
          <Text style={[styles.timeText, { color: timeColor }]}>
            {isPlaying
              ? formatDuration(currentTime)
              : formatDuration(totalDuration)}
          </Text>
          {isLoading && (
            <Text
              style={[styles.timeText, { color: timeColor, marginLeft: 6 }]}
            >
              ...
            </Text>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 6,
    paddingHorizontal: 8,
    minWidth: 220,
    maxWidth: 280,
  },
  playButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 10,
  },
  waveformSection: {
    flex: 1,
  },
  waveformContainer: {
    flexDirection: "row",
    alignItems: "center",
    height: MAX_BAR_HEIGHT + 4,
    gap: BAR_GAP,
  },
  bar: {
    width: BAR_WIDTH,
    borderRadius: BAR_WIDTH / 2,
  },
  currentBar: {
    shadowColor: "#fff",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 3,
    elevation: 2,
  },
  timeRow: {
    flexDirection: "row",
    justifyContent: "flex-start",
    marginTop: 4,
  },
  timeText: {
    fontSize: 12,
    fontWeight: "500",
  },
});
