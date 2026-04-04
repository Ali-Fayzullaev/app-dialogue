/**
 * Draft Service — сохранение и восстановление черновиков сообщений.
 *
 * Черновики хранятся в AsyncStorage по ключу `draft_{chatId}`.
 * При выходе из чата текст сохраняется, при входе — восстанавливается.
 * После успешной отправки черновик удаляется.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";

// Обфускация черновиков (base64)
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
    return data;
  }
}

const DRAFT_PREFIX = "draft_";
const DRAFT_INDEX_KEY = "draft_index"; // список chatId с черновиками

export interface Draft {
  chatId: string;
  text: string;
  replyToId?: string | null;
  updatedAt: number;
}

/**
 * Сохранить черновик для чата
 */
export async function saveDraft(
  chatId: string,
  text: string,
  replyToId?: string | null,
): Promise<void> {
  const trimmed = text.trim();

  if (!trimmed) {
    // Пустой текст — удаляем черновик
    await removeDraft(chatId);
    return;
  }

  const draft: Draft = {
    chatId,
    text: trimmed,
    replyToId: replyToId || null,
    updatedAt: Date.now(),
  };

  try {
    await AsyncStorage.setItem(
      `${DRAFT_PREFIX}${chatId}`,
      obfuscate(JSON.stringify(draft)),
    );
    await addToIndex(chatId);
  } catch (error) {
    console.error("[DraftService] Error saving draft:", error);
  }
}

/**
 * Загрузить черновик для чата
 */
export async function loadDraft(chatId: string): Promise<Draft | null> {
  try {
    const raw = await AsyncStorage.getItem(`${DRAFT_PREFIX}${chatId}`);
    if (!raw) return null;
    return JSON.parse(deobfuscate(raw)) as Draft;
  } catch (error) {
    console.error("[DraftService] Error loading draft:", error);
    return null;
  }
}

/**
 * Удалить черновик для чата (после отправки)
 */
export async function removeDraft(chatId: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(`${DRAFT_PREFIX}${chatId}`);
    await removeFromIndex(chatId);
  } catch (error) {
    console.error("[DraftService] Error removing draft:", error);
  }
}

/**
 * Получить все черновики (для отображения в списке чатов)
 */
export async function getAllDrafts(): Promise<Map<string, Draft>> {
  const drafts = new Map<string, Draft>();

  try {
    const indexRaw = await AsyncStorage.getItem(DRAFT_INDEX_KEY);
    if (!indexRaw) return drafts;

    const chatIds: string[] = JSON.parse(indexRaw);
    const keys = chatIds.map((id) => `${DRAFT_PREFIX}${id}`);
    const entries = await AsyncStorage.multiGet(keys);

    for (const [key, value] of entries) {
      if (value) {
        try {
          const draft = JSON.parse(value) as Draft;
          drafts.set(draft.chatId, draft);
        } catch {
          // Повреждённый черновик — пропускаем
        }
      }
    }
  } catch (error) {
    console.error("[DraftService] Error loading all drafts:", error);
  }

  return drafts;
}

/**
 * Получить текст черновика для чата (быстрый доступ для списка чатов)
 */
export async function getDraftText(chatId: string): Promise<string | null> {
  const draft = await loadDraft(chatId);
  return draft?.text || null;
}

/**
 * Очистить все черновики
 */
export async function clearAllDrafts(): Promise<void> {
  try {
    const indexRaw = await AsyncStorage.getItem(DRAFT_INDEX_KEY);
    if (!indexRaw) return;

    const chatIds: string[] = JSON.parse(indexRaw);
    const keys = chatIds.map((id) => `${DRAFT_PREFIX}${id}`);
    await AsyncStorage.multiRemove([...keys, DRAFT_INDEX_KEY]);
  } catch (error) {
    console.error("[DraftService] Error clearing drafts:", error);
  }
}

// --- Internal helpers ---

async function addToIndex(chatId: string): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(DRAFT_INDEX_KEY);
    const ids: string[] = raw ? JSON.parse(raw) : [];
    if (!ids.includes(chatId)) {
      ids.push(chatId);
      await AsyncStorage.setItem(DRAFT_INDEX_KEY, JSON.stringify(ids));
    }
  } catch {
    // Не критично
  }
}

async function removeFromIndex(chatId: string): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(DRAFT_INDEX_KEY);
    if (!raw) return;
    const ids: string[] = JSON.parse(raw);
    const filtered = ids.filter((id) => id !== chatId);
    await AsyncStorage.setItem(DRAFT_INDEX_KEY, JSON.stringify(filtered));
  } catch {
    // Не критично
  }
}
