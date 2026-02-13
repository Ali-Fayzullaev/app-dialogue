/**
 * Тесты для DraftService — CRUD операции над черновиками.
 */

import {
    clearAllDrafts,
    getAllDrafts,
    getDraftText,
    loadDraft,
    removeDraft,
    saveDraft,
} from "@/lib/draft-service";

// ---- Мок AsyncStorage ----
const store: Record<string, string> = {};

jest.mock("@react-native-async-storage/async-storage", () => ({
  __esModule: true,
  default: {
    getItem: jest.fn((key: string) => Promise.resolve(store[key] ?? null)),
    setItem: jest.fn((key: string, value: string) => {
      store[key] = value;
      return Promise.resolve();
    }),
    removeItem: jest.fn((key: string) => {
      delete store[key];
      return Promise.resolve();
    }),
    multiGet: jest.fn((keys: string[]) =>
      Promise.resolve(keys.map((k) => [k, store[k] ?? null])),
    ),
    multiRemove: jest.fn((keys: string[]) => {
      keys.forEach((k) => delete store[k]);
      return Promise.resolve();
    }),
  },
}));

function clearStore() {
  Object.keys(store).forEach((k) => delete store[k]);
}

// ---- Тесты ----

describe("DraftService", () => {
  beforeEach(() => {
    clearStore();
    jest.clearAllMocks();
  });

  describe("saveDraft", () => {
    it("сохраняет черновик и добавляет chatId в индекс", async () => {
      await saveDraft("chat-1", "Привет мир");

      const raw = store["draft_chat-1"];
      expect(raw).toBeDefined();
      const draft = JSON.parse(raw);
      expect(draft.chatId).toBe("chat-1");
      expect(draft.text).toBe("Привет мир");
      expect(draft.replyToId).toBeNull();
      expect(typeof draft.updatedAt).toBe("number");

      // Индекс содержит chatId
      const idx = JSON.parse(store["draft_index"]);
      expect(idx).toContain("chat-1");
    });

    it("сохраняет replyToId если передан", async () => {
      await saveDraft("chat-2", "Ответ", "msg-42");

      const draft = JSON.parse(store["draft_chat-2"]);
      expect(draft.replyToId).toBe("msg-42");
    });

    it("удаляет черновик если текст пустой", async () => {
      await saveDraft("chat-3", "Текст");
      expect(store["draft_chat-3"]).toBeDefined();

      await saveDraft("chat-3", "   ");
      expect(store["draft_chat-3"]).toBeUndefined();
    });

    it("обрезает пробелы", async () => {
      await saveDraft("chat-4", "  пробелы вокруг  ");
      const draft = JSON.parse(store["draft_chat-4"]);
      expect(draft.text).toBe("пробелы вокруг");
    });

    it("не дублирует chatId в индексе при повторном сохранении", async () => {
      await saveDraft("chat-5", "v1");
      await saveDraft("chat-5", "v2");

      const idx = JSON.parse(store["draft_index"]);
      expect(idx.filter((id: string) => id === "chat-5")).toHaveLength(1);
    });
  });

  describe("loadDraft", () => {
    it("возвращает null для несуществующего черновика", async () => {
      const result = await loadDraft("nonexistent");
      expect(result).toBeNull();
    });

    it("загружает сохранённый черновик", async () => {
      await saveDraft("chat-6", "Текст черновика", "reply-1");
      const draft = await loadDraft("chat-6");

      expect(draft).not.toBeNull();
      expect(draft!.chatId).toBe("chat-6");
      expect(draft!.text).toBe("Текст черновика");
      expect(draft!.replyToId).toBe("reply-1");
    });
  });

  describe("removeDraft", () => {
    it("удаляет черновик и убирает из индекса", async () => {
      await saveDraft("chat-7", "Удалить меня");
      expect(store["draft_chat-7"]).toBeDefined();

      await removeDraft("chat-7");
      expect(store["draft_chat-7"]).toBeUndefined();

      const idx = JSON.parse(store["draft_index"]);
      expect(idx).not.toContain("chat-7");
    });

    it("не падает при удалении несуществующего черновика", async () => {
      await expect(removeDraft("nonexistent")).resolves.not.toThrow();
    });
  });

  describe("getAllDrafts", () => {
    it("возвращает пустую Map без черновиков", async () => {
      const drafts = await getAllDrafts();
      expect(drafts.size).toBe(0);
    });

    it("возвращает все сохранённые черновики", async () => {
      await saveDraft("chat-a", "Текст А");
      await saveDraft("chat-b", "Текст Б");
      await saveDraft("chat-c", "Текст В");

      const drafts = await getAllDrafts();
      expect(drafts.size).toBe(3);
      expect(drafts.get("chat-a")!.text).toBe("Текст А");
      expect(drafts.get("chat-b")!.text).toBe("Текст Б");
      expect(drafts.get("chat-c")!.text).toBe("Текст В");
    });
  });

  describe("getDraftText", () => {
    it("возвращает null без черновика", async () => {
      const text = await getDraftText("no-draft");
      expect(text).toBeNull();
    });

    it("возвращает текст черновика", async () => {
      await saveDraft("chat-d", "Быстрый доступ");
      const text = await getDraftText("chat-d");
      expect(text).toBe("Быстрый доступ");
    });
  });

  describe("clearAllDrafts", () => {
    it("удаляет все черновики и индекс", async () => {
      await saveDraft("chat-x", "X");
      await saveDraft("chat-y", "Y");

      await clearAllDrafts();

      expect(store["draft_chat-x"]).toBeUndefined();
      expect(store["draft_chat-y"]).toBeUndefined();
      expect(store["draft_index"]).toBeUndefined();
    });
  });
});
