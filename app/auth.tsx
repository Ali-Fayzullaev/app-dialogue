import { useAuth } from "@/contexts/auth-context";
import { useTheme } from "@/contexts/theme-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React, { useMemo, useRef, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    KeyboardAvoidingView,
    Platform,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";

const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_DURATION = 60 * 1000; // 1 минута

export default function AuthScreen() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [loading, setLoading] = useState(false);
  const loginAttemptsRef = useRef(0);
  const lockoutUntilRef = useRef(0);

  const { signIn, signUp } = useAuth();
  const { colors, isDark } = useTheme();
  const router = useRouter();

  const styles = useMemo(() => createStyles(colors), [colors]);

  const handleSubmit = async () => {
    if (!email || !password || (!isLogin && !username)) {
      Alert.alert("Ошибка", "Пожалуйста, заполните все поля");
      return;
    }

    if (!isLogin && password.length < 8) {
      Alert.alert("Ошибка", "Пароль должен быть минимум 8 символов");
      return;
    }

    if (!isLogin && !/[A-Z]/.test(password)) {
      Alert.alert("Ошибка", "Пароль должен содержать хотя бы одну заглавную букву");
      return;
    }

    if (!isLogin && !/\d/.test(password)) {
      Alert.alert("Ошибка", "Пароль должен содержать хотя бы одну цифру");
      return;
    }

    if (!isLogin && username.length < 2) {
      Alert.alert("Ошибка", "Имя пользователя — минимум 2 символа");
      return;
    }

    setLoading(true);

    if (isLogin) {
      // Rate limiting на логин
      const now = Date.now();
      if (now < lockoutUntilRef.current) {
        const seconds = Math.ceil((lockoutUntilRef.current - now) / 1000);
        Alert.alert("Подождите", `Слишком много попыток. Попробуйте через ${seconds} сек.`);
        setLoading(false);
        return;
      }

      const { error } = await signIn(email, password);
      if (error) {
        loginAttemptsRef.current += 1;
        if (loginAttemptsRef.current >= MAX_LOGIN_ATTEMPTS) {
          lockoutUntilRef.current = Date.now() + LOCKOUT_DURATION;
          loginAttemptsRef.current = 0;
          Alert.alert("Заблокировано", "Слишком много неудачных попыток. Подождите 1 минуту.");
        } else {
          Alert.alert("Ошибка входа", error.message);
        }
        setLoading(false);
      } else {
        loginAttemptsRef.current = 0;
        router.replace("/");
      }
    } else {
      const { error } = await signUp(email, password, username);
      if (error) {
        Alert.alert("Ошибка регистрации", error.message);
        setLoading(false);
      } else {
        router.replace("/");
      }
    }
  };

  return (
    <View style={styles.container}>
      {/* Градиентный хедер */}
      <View style={styles.headerContainer}>
        <View style={styles.logoContainer}>
          <View style={styles.logoCircle}>
            <Ionicons name="chatbubbles" size={40} color={colors.textLight} />
          </View>
          <Text style={styles.appName}>Messenger</Text>
          <Text style={styles.tagline}>Общайтесь с друзьями</Text>
        </View>
      </View>

      {/* Форма */}
      <KeyboardAvoidingView
        style={styles.formContainer}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <View style={styles.formCard}>
          <Text style={styles.formTitle}>
            {isLogin ? "Вход в аккаунт" : "Регистрация"}
          </Text>

          {!isLogin && (
            <View style={styles.inputContainer}>
              <Text style={styles.inputLabel}>Имя пользователя</Text>
              <TextInput
                style={styles.input}
                placeholder="Введите имя"
                placeholderTextColor={colors.textMuted}
                value={username}
                onChangeText={setUsername}
                autoCapitalize="none"
                keyboardAppearance={isDark ? "dark" : "light"}
              />
            </View>
          )}

          <View style={styles.inputContainer}>
            <Text style={styles.inputLabel}>Email</Text>
            <TextInput
              style={styles.input}
              placeholder="example@mail.com"
              placeholderTextColor={colors.textMuted}
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              keyboardAppearance={isDark ? "dark" : "light"}
            />
          </View>

          <View style={styles.inputContainer}>
            <Text style={styles.inputLabel}>Пароль</Text>
            <TextInput
              style={styles.input}
              placeholder="Минимум 6 символов"
              placeholderTextColor={colors.textMuted}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              keyboardAppearance={isDark ? "dark" : "light"}
            />
          </View>

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              handleSubmit();
            }}
            disabled={loading}
            activeOpacity={0.8}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>
                {isLogin ? "Войти" : "Создать аккаунт"}
              </Text>
            )}
          </TouchableOpacity>

          <View style={styles.dividerContainer}>
            <View style={styles.divider} />
            <Text style={styles.dividerText}>или</Text>
            <View style={styles.divider} />
          </View>

          <TouchableOpacity
            style={styles.switchButton}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setIsLogin(!isLogin);
            }}
          >
            <Text style={styles.switchText}>
              {isLogin ? "Нет аккаунта? " : "Уже есть аккаунт? "}
              <Text style={styles.switchTextBold}>
                {isLogin ? "Зарегистрируйтесь" : "Войдите"}
              </Text>
            </Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const createStyles = (colors: any) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.primary,
    },
    headerContainer: {
      paddingTop: 80,
      paddingBottom: 40,
      alignItems: "center",
    },
    logoContainer: {
      alignItems: "center",
    },
    logoCircle: {
      width: 100,
      height: 100,
      borderRadius: 50,
      backgroundColor: "rgba(255,255,255,0.2)",
      justifyContent: "center",
      alignItems: "center",
      marginBottom: 16,
    },
    appName: {
      fontSize: 32,
      fontWeight: "bold",
      color: colors.textLight,
      marginBottom: 8,
    },
    tagline: {
      fontSize: 16,
      color: "rgba(255,255,255,0.8)",
    },
    formContainer: {
      flex: 1,
    },
    formCard: {
      flex: 1,
      backgroundColor: colors.background,
      borderTopLeftRadius: 30,
      borderTopRightRadius: 30,
      paddingHorizontal: 24,
      paddingTop: 32,
    },
    formTitle: {
      fontSize: 24,
      fontWeight: "bold",
      color: colors.textPrimary,
      marginBottom: 24,
      textAlign: "center",
    },
    inputContainer: {
      marginBottom: 16,
    },
    inputLabel: {
      fontSize: 14,
      fontWeight: "600",
      color: colors.textSecondary,
      marginBottom: 8,
      marginLeft: 4,
    },
    input: {
      backgroundColor: colors.inputBackground,
      borderRadius: 16,
      paddingHorizontal: 20,
      paddingVertical: 16,
      fontSize: 16,
      color: colors.textPrimary,
    },
    button: {
      backgroundColor: colors.primary,
      borderRadius: 16,
      paddingVertical: 18,
      alignItems: "center",
      marginTop: 8,
      shadowColor: colors.primary,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.3,
      shadowRadius: 8,
      elevation: 4,
    },
    buttonDisabled: {
      opacity: 0.7,
    },
    buttonText: {
      color: colors.textLight,
      fontSize: 18,
      fontWeight: "700",
    },
    dividerContainer: {
      flexDirection: "row",
      alignItems: "center",
      marginVertical: 24,
    },
    divider: {
      flex: 1,
      height: 1,
      backgroundColor: colors.border,
    },
    dividerText: {
      marginHorizontal: 16,
      color: colors.textMuted,
      fontSize: 14,
    },
    switchButton: {
      alignItems: "center",
    },
    switchText: {
      color: colors.textSecondary,
      fontSize: 15,
    },
    switchTextBold: {
      color: colors.primary,
      fontWeight: "600",
    },
  });
