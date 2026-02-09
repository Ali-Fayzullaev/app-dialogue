// Цветовая палитра мессенджера
export const colors = {
  // Основные цвета
  primary: "#0088cc",
  primaryDark: "#006699",
  primaryLight: "#e3f2fd",

  // Фоны
  background: "#ffffff",
  backgroundSecondary: "#f7f7f8",
  backgroundChat: "#e5ddd5",

  // Текст
  textPrimary: "#1a1a1a",
  textSecondary: "#8e8e93",
  textLight: "#ffffff",
  textMuted: "#999999",

  // Сообщения
  messageMine: "#dcf8c6",
  messageOther: "#ffffff",
  messageTime: "#7d7d7d",

  // UI элементы
  border: "#e5e5ea",
  borderLight: "#f0f0f0",
  inputBackground: "#f2f2f7",

  // Статусы
  online: "#4cd964",
  error: "#ff3b30",
  danger: "#ff3b30",
  warning: "#ff9500",

  // Градиенты для аватаров
  avatarColors: [
    "#ff6b6b",
    "#4ecdc4",
    "#45b7d1",
    "#96ceb4",
    "#ffeaa7",
    "#dfe6e9",
    "#fd79a8",
    "#a29bfe",
  ],
};

// Получить цвет аватара по id пользователя
export const getAvatarColor = (id: string): string => {
  const hash = id.split("").reduce((a, b) => {
    a = (a << 5) - a + b.charCodeAt(0);
    return a & a;
  }, 0);
  return colors.avatarColors[Math.abs(hash) % colors.avatarColors.length];
};

// Общие стили
export const commonStyles = {
  shadow: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  shadowLight: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
};
