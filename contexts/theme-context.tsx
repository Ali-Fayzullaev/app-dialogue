import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useContext, useEffect, useState } from "react";
import { useColorScheme as useSystemColorScheme } from "react-native";

export type ThemeMode = "light" | "dark" | "system";

export type AccentColor = {
  name: string;
  primary: string;
  primaryDark: string;
  primaryLight: string;
  messageMine: string;
};

// Доступные акцентные цвета
export const accentColors: AccentColor[] = [
  {
    name: "Синий",
    primary: "#0088cc",
    primaryDark: "#006699",
    primaryLight: "#e3f2fd",
    messageMine: "#dcf8c6",
  },
  {
    name: "Зелёный",
    primary: "#25D366",
    primaryDark: "#128C7E",
    primaryLight: "#dcf8c6",
    messageMine: "#dcf8c6",
  },
  {
    name: "Фиолетовый",
    primary: "#7C4DFF",
    primaryDark: "#651FFF",
    primaryLight: "#EDE7F6",
    messageMine: "#E1D5FA",
  },
  {
    name: "Розовый",
    primary: "#E91E63",
    primaryDark: "#C2185B",
    primaryLight: "#FCE4EC",
    messageMine: "#F8BBD9",
  },
  {
    name: "Оранжевый",
    primary: "#FF5722",
    primaryDark: "#E64A19",
    primaryLight: "#FBE9E7",
    messageMine: "#FFCCBC",
  },
  {
    name: "Бирюзовый",
    primary: "#00BCD4",
    primaryDark: "#0097A7",
    primaryLight: "#E0F7FA",
    messageMine: "#B2EBF2",
  },
  {
    name: "Индиго",
    primary: "#3F51B5",
    primaryDark: "#303F9F",
    primaryLight: "#E8EAF6",
    messageMine: "#C5CAE9",
  },
  {
    name: "Красный",
    primary: "#F44336",
    primaryDark: "#D32F2F",
    primaryLight: "#FFEBEE",
    messageMine: "#FFCDD2",
  },
];

// Светлая тема
export const lightTheme = {
  // Фоны
  background: "#ffffff",
  backgroundSecondary: "#f7f7f8",
  backgroundChat: "#e5ddd5",
  surface: "#f7f7f8",
  card: "#ffffff",

  // Текст
  text: "#1a1a1a",
  textPrimary: "#1a1a1a",
  textSecondary: "#8e8e93",
  textLight: "#ffffff",
  textMuted: "#999999",

  // Сообщения
  messageOther: "#ffffff",
  messageTime: "#7d7d7d",

  // UI элементы
  border: "#e5e5ea",
  borderLight: "#f0f0f0",
  inputBackground: "#f2f2f7",
  headerBackground: "#ffffff",
  tabBar: "#ffffff",

  // Статусы
  online: "#4cd964",
  error: "#ff3b30",
  danger: "#ff3b30",
  warning: "#ff9500",

  // Дополнительные
  overlay: "rgba(0,0,0,0.5)",
  shadowColor: "#000",
};

// Тёмная тема
export const darkTheme = {
  // Фоны
  background: "#121212",
  backgroundSecondary: "#1e1e1e",
  backgroundChat: "#0b141a",
  surface: "#1e1e1e",
  card: "#1e1e1e",

  // Текст
  text: "#e4e6eb",
  textPrimary: "#e4e6eb",
  textSecondary: "#b0b3b8",
  textLight: "#ffffff",
  textMuted: "#8a8d91",

  // Сообщения
  messageOther: "#262d31",
  messageTime: "#aaaaaa",

  // UI элементы
  border: "#3a3b3c",
  borderLight: "#2d2d2d",
  inputBackground: "#2a2a2a",
  headerBackground: "#1a1a1a",
  tabBar: "#1a1a1a",

  // Статусы
  online: "#4cd964",
  error: "#ff453a",
  danger: "#ff453a",
  warning: "#ff9f0a",

  // Дополнительные
  overlay: "rgba(0,0,0,0.7)",
  shadowColor: "#000",
};

export type ThemeColors = typeof lightTheme & {
  primary: string;
  primaryDark: string;
  primaryLight: string;
  messageMine: string;
};

interface ThemeContextType {
  themeMode: ThemeMode;
  setThemeMode: (mode: ThemeMode) => void;
  accentColor: AccentColor;
  setAccentColor: (color: AccentColor) => void;
  colors: ThemeColors;
  isDark: boolean;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const THEME_MODE_KEY = "@theme_mode";
const ACCENT_COLOR_KEY = "@accent_color";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemColorScheme = useSystemColorScheme();
  const [themeMode, setThemeModeState] = useState<ThemeMode>("system");
  const [accentColor, setAccentColorState] = useState<AccentColor>(
    accentColors[0],
  );
  const [isLoaded, setIsLoaded] = useState(false);

  // Загрузка настроек при старте
  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const [savedTheme, savedAccent] = await Promise.all([
        AsyncStorage.getItem(THEME_MODE_KEY),
        AsyncStorage.getItem(ACCENT_COLOR_KEY),
      ]);

      if (savedTheme) {
        setThemeModeState(savedTheme as ThemeMode);
      }

      if (savedAccent) {
        const parsed = JSON.parse(savedAccent);
        const found = accentColors.find((c) => c.primary === parsed.primary);
        if (found) {
          setAccentColorState(found);
        }
      }
    } catch (error) {
      console.error("Error loading theme settings:", error);
    } finally {
      setIsLoaded(true);
    }
  };

  const setThemeMode = async (mode: ThemeMode) => {
    setThemeModeState(mode);
    try {
      await AsyncStorage.setItem(THEME_MODE_KEY, mode);
    } catch (error) {
      console.error("Error saving theme mode:", error);
    }
  };

  const setAccentColor = async (color: AccentColor) => {
    setAccentColorState(color);
    try {
      await AsyncStorage.setItem(ACCENT_COLOR_KEY, JSON.stringify(color));
    } catch (error) {
      console.error("Error saving accent color:", error);
    }
  };

  // Определяем текущую тему
  const isDark =
    themeMode === "dark" ||
    (themeMode === "system" && systemColorScheme === "dark");

  // Собираем цвета
  const baseColors = isDark ? darkTheme : lightTheme;
  const colors: ThemeColors = {
    ...baseColors,
    primary: accentColor.primary,
    primaryDark: accentColor.primaryDark,
    primaryLight: isDark
      ? accentColor.primaryDark + "40"
      : accentColor.primaryLight,
    messageMine: isDark ? accentColor.primary + "40" : accentColor.messageMine,
  };

  if (!isLoaded) {
    return null;
  }

  return (
    <ThemeContext.Provider
      value={{
        themeMode,
        setThemeMode,
        accentColor,
        setAccentColor,
        colors,
        isDark,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}
