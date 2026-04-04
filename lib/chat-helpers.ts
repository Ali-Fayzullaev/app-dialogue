/**
 * Chat Helpers — утилитарные функции для чата.
 * Вынесены из chat/[id].tsx для уменьшения размера файла.
 */

import { Ionicons } from "@expo/vector-icons";

/**
 * Экранирование спецсимволов Postgres LIKE/ILIKE (%, _, \)
 */
export function escapeLikePattern(input: string): string {
  return input.replace(/[\\%_]/g, "\\$&");
}

/**
 * Форматирование времени сообщения (HH:MM)
 */
export function formatMessageTime(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Форматирование разделителя дат
 */
export function formatDateSeparator(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (days === 0) return "Сегодня";
  if (days === 1) return "Вчера";
  return date.toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "long",
    year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
  });
}

/**
 * Форматирование размера файла
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 Б";
  const k = 1024;
  const sizes = ["Б", "КБ", "МБ", "ГБ"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

/**
 * Иконка файла по расширению
 */
export function getFileIcon(fileName: string): keyof typeof Ionicons.glyphMap {
  const ext = fileName.split(".").pop()?.toLowerCase() || "";
  const icons: Record<string, keyof typeof Ionicons.glyphMap> = {
    pdf: "document-text",
    doc: "document-text",
    docx: "document-text",
    xls: "grid",
    xlsx: "grid",
    ppt: "easel",
    pptx: "easel",
    zip: "archive",
    rar: "archive",
    "7z": "archive",
    txt: "document",
    mp3: "musical-notes",
    wav: "musical-notes",
    jpg: "image",
    jpeg: "image",
    png: "image",
    gif: "image",
  };
  return icons[ext] || "document-attach";
}

/**
 * Описание медиатипа на русском
 */
export function getMediaTypeLabel(mediaType: string | null): string {
  switch (mediaType) {
    case "image":
      return "Фото";
    case "video":
      return "Видео";
    case "audio":
      return "Аудио";
    case "location":
      return "Геолокация";
    case "file":
      return "Документ";
    default:
      return "";
  }
}

/**
 * Определяет, нужно ли показать разделитель дат (для inverted FlatList)
 */
export function shouldShowDateSeparator(
  currentItem: { created_at: string },
  index: number,
  messages: { created_at: string }[],
): boolean {
  const nextIndex = index + 1;
  if (nextIndex >= messages.length) return true; // самое старое сообщение
  const currentDate = new Date(currentItem.created_at).toDateString();
  const prevDate = new Date(messages[nextIndex].created_at).toDateString();
  return currentDate !== prevDate;
}
