import { decode } from "base64-arraybuffer";
import * as FileSystem from "expo-file-system/legacy";
import * as ImagePicker from "expo-image-picker";
import { Alert } from "react-native";
import { supabase } from "./supabase";

// Ограничения размеров файлов (в байтах)
export const FILE_LIMITS = {
  image: 5 * 1024 * 1024, // 5MB
  video: 10 * 1024 * 1024, // 10MB (уменьшено для стабильности)
  audio: 5 * 1024 * 1024, // 5MB
};

// Допустимые MIME-типы
export const ALLOWED_TYPES = {
  image: ["image/jpeg", "image/png", "image/gif", "image/webp"],
  video: ["video/mp4", "video/quicktime", "video/webm"],
  audio: ["audio/mpeg", "audio/wav", "audio/m4a", "audio/aac"],
};

export type MediaType = "image" | "video" | "audio";

export interface UploadResult {
  success: boolean;
  url?: string;
  type?: MediaType;
  error?: string;
}

/**
 * Получить размер файла
 */
async function getFileSize(uri: string): Promise<number> {
  try {
    const fileInfo = await FileSystem.getInfoAsync(uri);
    return fileInfo.exists ? (fileInfo.size ?? 0) : 0;
  } catch {
    return 0;
  }
}

/**
 * Определить тип медиа по MIME-типу
 */
function getMediaType(mimeType: string): MediaType | null {
  if (ALLOWED_TYPES.image.includes(mimeType)) return "image";
  if (ALLOWED_TYPES.video.includes(mimeType)) return "video";
  if (ALLOWED_TYPES.audio.includes(mimeType)) return "audio";
  return null;
}

/**
 * Проверить ограничения файла
 */
function validateFile(
  size: number,
  type: MediaType,
): { valid: boolean; error?: string } {
  const limit = FILE_LIMITS[type];
  if (size > limit) {
    const limitMB = limit / (1024 * 1024);
    return {
      valid: false,
      error: `Файл слишком большой. Максимум ${limitMB}MB для ${type}`,
    };
  }
  return { valid: true };
}

/**
 * Загрузить файл на Supabase Storage
 */
export async function uploadMedia(
  uri: string,
  userId: string,
  mimeType: string,
): Promise<UploadResult> {
  try {
    const mediaType = getMediaType(mimeType);
    if (!mediaType) {
      return { success: false, error: "Неподдерживаемый тип файла" };
    }

    // Проверка размера
    const fileSize = await getFileSize(uri);
    const validation = validateFile(fileSize, mediaType);
    if (!validation.valid) {
      return { success: false, error: validation.error };
    }

    // Генерация уникального имени файла
    const timestamp = Date.now();
    const extension = mimeType.split("/")[1] || "bin";
    const fileName = `${userId}/${mediaType}_${timestamp}.${extension}`;

    // Читаем файл как base64
    const base64Data = await FileSystem.readAsStringAsync(uri, {
      encoding: "base64",
    });

    // Загружаем на Supabase Storage с decode: true
    const { data, error } = await supabase.storage
      .from("chat-media")
      .upload(fileName, decode(base64Data), {
        contentType: mimeType,
        cacheControl: "3600",
        upsert: false,
      });

    if (error) {
      console.error("Upload error:", error);
      return { success: false, error: error.message };
    }

    // Получаем публичный URL
    const {
      data: { publicUrl },
    } = supabase.storage.from("chat-media").getPublicUrl(data.path);

    return {
      success: true,
      url: publicUrl,
      type: mediaType,
    };
  } catch (error) {
    console.error("Upload error:", error);
    return {
      success: false,
      error: "Ошибка загрузки файла",
    };
  }
}

/**
 * Выбрать изображение или видео из галереи
 */
export async function pickImageOrVideo(): Promise<ImagePicker.ImagePickerResult | null> {
  try {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert(
        "Нет доступа",
        "Разрешите доступ к галерее в настройках приложения",
      );
      return null;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images", "videos"],
      allowsEditing: false,
      quality: 0.7,
      videoMaxDuration: 30,
      exif: false,
    });

    return result;
  } catch (error) {
    console.error("Pick media error:", error);
    return null;
  }
}

/**
 * Сделать фото камерой
 */
export async function takePhoto(): Promise<ImagePicker.ImagePickerResult | null> {
  try {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
      Alert.alert(
        "Нет доступа",
        "Разрешите доступ к камере в настройках приложения",
      );
      return null;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ["images", "videos"],
      allowsEditing: false,
      quality: 0.8,
      videoMaxDuration: 30,
      exif: false,
    });

    return result;
  } catch (error) {
    console.error("Take photo error:", error);
    return null;
  }
}

/**
 * Форматирование размера файла для отображения
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}
