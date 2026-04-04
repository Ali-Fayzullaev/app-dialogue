import AsyncStorage from "@react-native-async-storage/async-storage";

// Обфускация данных в AsyncStorage (base64, чтобы не хранить plaintext)
function obfuscate(data: string): string {
  try {
    return btoa(unescape(encodeURIComponent(data)));
  } catch {
    return data;
  }
}

function deobfuscate(data: string): string {
  try {
    return decodeURIComponent(escape(atob(data)));
  } catch {
    // Fallback: данные могут быть в старом формате (plain JSON)
    return data;
  }
}

// Ключи для кеша
const CACHE_KEYS = {
  CHATS: "cache_chats",
  MESSAGES: "cache_messages_", // + chat_id
  PROFILES: "cache_profiles",
  USER_PROFILE: "cache_user_profile",
  LAST_SYNC: "cache_last_sync",
};

// Время жизни кеша (24 часа)
const CACHE_TTL = 24 * 60 * 60 * 1000;

// Интерфейсы
interface CacheItem<T> {
  data: T;
  timestamp: number;
}

interface CachedChat {
  id: string;
  name: string | null;
  is_group: boolean;
  avatar_url: string | null;
  last_message?: {
    content: string | null;
    created_at: string;
    sender_name?: string;
    media_type?: string | null;
  };
  unread_count: number;
  other_user?: {
    id: string;
    username: string;
    avatar_url: string | null;
  };
}

interface CachedMessage {
  id: string;
  chat_id: string;
  sender_id: string;
  content: string | null;
  media_url: string | null;
  media_type: "image" | "video" | "audio" | null;
  created_at: string;
  is_read: boolean;
  sender?: {
    id: string;
    username: string;
    avatar_url: string | null;
  };
}

interface CachedProfile {
  id: string;
  username: string;
  avatar_url: string | null;
}

class CacheService {
  private static instance: CacheService;
  private memoryCache: Map<string, CacheItem<unknown>> = new Map();

  private constructor() {}

  static getInstance(): CacheService {
    if (!CacheService.instance) {
      CacheService.instance = new CacheService();
    }
    return CacheService.instance;
  }

  // Проверка валидности кеша
  private isValid<T>(item: CacheItem<T> | null): boolean {
    if (!item) return false;
    return Date.now() - item.timestamp < CACHE_TTL;
  }

  // Сохранение в кеш (память + AsyncStorage)
  private async set<T>(key: string, data: T): Promise<void> {
    const item: CacheItem<T> = {
      data,
      timestamp: Date.now(),
    };

    // Память (быстро)
    this.memoryCache.set(key, item as CacheItem<unknown>);

    // AsyncStorage (персистентно, обфусцировано)
    try {
      await AsyncStorage.setItem(key, obfuscate(JSON.stringify(item)));
    } catch (error) {
      console.error("Cache set error:", error);
    }
  }

  // Получение из кеша
  private async get<T>(key: string): Promise<T | null> {
    // Сначала из памяти
    const memItem = this.memoryCache.get(key) as CacheItem<T> | undefined;
    if (memItem && this.isValid(memItem)) {
      return memItem.data;
    }

    // Потом из AsyncStorage
    try {
      const stored = await AsyncStorage.getItem(key);
      if (stored) {
        const item: CacheItem<T> = JSON.parse(deobfuscate(stored));
        if (this.isValid(item)) {
          // Восстанавливаем в память
          this.memoryCache.set(key, item as CacheItem<unknown>);
          return item.data;
        }
      }
    } catch (error) {
      console.error("Cache get error:", error);
    }

    return null;
  }

  // === ЧАТЫ ===

  async cacheChats(chats: CachedChat[]): Promise<void> {
    await this.set(CACHE_KEYS.CHATS, chats);
  }

  async getCachedChats(): Promise<CachedChat[] | null> {
    return this.get<CachedChat[]>(CACHE_KEYS.CHATS);
  }

  // === СООБЩЕНИЯ ===

  async cacheMessages(
    chatId: string,
    messages: CachedMessage[],
  ): Promise<void> {
    // Кешируем только последние 50 сообщений
    const toCache = messages.slice(0, 50);
    await this.set(CACHE_KEYS.MESSAGES + chatId, toCache);
  }

  async getCachedMessages(chatId: string): Promise<CachedMessage[] | null> {
    return this.get<CachedMessage[]>(CACHE_KEYS.MESSAGES + chatId);
  }

  // === ПРОФИЛИ ===

  async cacheProfiles(profiles: CachedProfile[]): Promise<void> {
    const current = (await this.getCachedProfiles()) || [];
    const profileMap = new Map(current.map((p) => [p.id, p]));

    // Мерджим новые профили
    profiles.forEach((p) => profileMap.set(p.id, p));

    await this.set(CACHE_KEYS.PROFILES, Array.from(profileMap.values()));
  }

  async getCachedProfiles(): Promise<CachedProfile[] | null> {
    return this.get<CachedProfile[]>(CACHE_KEYS.PROFILES);
  }

  async getCachedProfile(userId: string): Promise<CachedProfile | null> {
    const profiles = await this.getCachedProfiles();
    return profiles?.find((p) => p.id === userId) || null;
  }

  // === ПРОФИЛЬ ПОЛЬЗОВАТЕЛЯ ===

  async cacheUserProfile(profile: CachedProfile): Promise<void> {
    await this.set(CACHE_KEYS.USER_PROFILE, profile);
  }

  async getCachedUserProfile(): Promise<CachedProfile | null> {
    return this.get<CachedProfile>(CACHE_KEYS.USER_PROFILE);
  }

  // === ОЧИСТКА ===

  async clearAll(): Promise<void> {
    this.memoryCache.clear();

    try {
      const keys = await AsyncStorage.getAllKeys();
      const cacheKeys = keys.filter((k) => k.startsWith("cache_"));
      await AsyncStorage.multiRemove(cacheKeys);
    } catch (error) {
      console.error("Cache clear error:", error);
    }
  }

  async clearChatMessages(chatId: string): Promise<void> {
    const key = CACHE_KEYS.MESSAGES + chatId;
    this.memoryCache.delete(key);
    await AsyncStorage.removeItem(key);
  }

  // === ВРЕМЯ СИНХРОНИЗАЦИИ ===

  async setLastSync(): Promise<void> {
    await AsyncStorage.setItem(CACHE_KEYS.LAST_SYNC, Date.now().toString());
  }

  async getLastSync(): Promise<Date | null> {
    const timestamp = await AsyncStorage.getItem(CACHE_KEYS.LAST_SYNC);
    return timestamp ? new Date(parseInt(timestamp)) : null;
  }

  // Прогрев кеша - загрузка из AsyncStorage в память
  async warmUp(): Promise<void> {
    console.log("🔥 Warming up cache...");

    try {
      // Загружаем основные данные в память
      await this.getCachedChats();
      await this.getCachedProfiles();
      await this.getCachedUserProfile();

      console.log("✅ Cache warmed up");
    } catch (error) {
      console.error("Cache warm up error:", error);
    }
  }
}

export const cacheService = CacheService.getInstance();
export type { CachedChat, CachedMessage, CachedProfile };

