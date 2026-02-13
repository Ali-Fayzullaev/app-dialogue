/**
 * Тесты для EncryptionService — E2EE сквозное шифрование.
 *
 * Тестирует: утилиты (base64, hex), isEncrypted,
 * generateKeyPair, deriveSharedSecret, encrypt/decrypt цикл.
 */

// ---- Мок expo-secure-store ----
const secureStore: Record<string, string> = {};

jest.mock("expo-secure-store", () => ({
  setItemAsync: jest.fn((key: string, value: string) => {
    secureStore[key] = value;
    return Promise.resolve();
  }),
  getItemAsync: jest.fn((key: string) =>
    Promise.resolve(secureStore[key] ?? null),
  ),
  deleteItemAsync: jest.fn((key: string) => {
    delete secureStore[key];
    return Promise.resolve();
  }),
}));

// ---- Мок expo-crypto ----
// Используем встроенный Node.js crypto для тестов
import nodeCrypto from "crypto";

jest.mock("expo-crypto", () => ({
  getRandomValues: (arr: Uint8Array) => {
    const rand = nodeCrypto.randomBytes(arr.length);
    arr.set(rand);
    return arr;
  },
  digestStringAsync: jest.fn((_algo: string, data: string) => {
    const hash = nodeCrypto.createHash("sha256").update(data).digest("hex");
    return Promise.resolve(hash);
  }),
  CryptoDigestAlgorithm: {
    SHA256: "SHA-256",
  },
}));

// Подключаем Web Crypto API из Node.js для SubtleCrypto
Object.defineProperty(globalThis, "crypto", {
  value: {
    subtle: nodeCrypto.webcrypto.subtle,
  },
  writable: true,
});

import {
    clearE2EEData,
    decryptMessage,
    deriveSharedSecret,
    encryptMessage,
    generateKeyPair,
    getE2EEStatus,
    getOrDeriveSharedSecret,
    getPrivateKey,
    getPublicKey,
    hasKeys,
    isEncrypted,
} from "@/lib/encryption-service";

function clearSecureStore() {
  Object.keys(secureStore).forEach((k) => delete secureStore[k]);
}

// ---- Тесты ----

describe("EncryptionService", () => {
  beforeEach(() => {
    clearSecureStore();
    jest.clearAllMocks();
  });

  describe("isEncrypted", () => {
    it('возвращает true для строки с префиксом "e2e:"', () => {
      expect(isEncrypted("e2e:abc:def")).toBe(true);
    });

    it("возвращает false для обычного текста", () => {
      expect(isEncrypted("Привет!")).toBe(false);
    });

    it("возвращает false для пустой строки", () => {
      expect(isEncrypted("")).toBe(false);
    });
  });

  describe("generateKeyPair", () => {
    it("возвращает публичный ключ (hex-строку)", async () => {
      const pubKey = await generateKeyPair();
      expect(typeof pubKey).toBe("string");
      expect(pubKey.length).toBe(64); // SHA-256 hex = 64 символа
    });

    it("сохраняет приватный и публичный ключ в SecureStore", async () => {
      await generateKeyPair();
      expect(secureStore["e2ee_private_key"]).toBeDefined();
      expect(secureStore["e2ee_public_key"]).toBeDefined();
    });

    it("генерирует разные ключи при каждом вызове", async () => {
      const key1 = await generateKeyPair();
      clearSecureStore();
      const key2 = await generateKeyPair();
      // С крайне высокой вероятностью ключи разные
      expect(key1).not.toBe(key2);
    });
  });

  describe("getPublicKey / getPrivateKey / hasKeys", () => {
    it("возвращает null когда ключей нет", async () => {
      expect(await getPublicKey()).toBeNull();
      expect(await getPrivateKey()).toBeNull();
      expect(await hasKeys()).toBe(false);
    });

    it("возвращает ключи после генерации", async () => {
      await generateKeyPair();
      expect(await getPublicKey()).not.toBeNull();
      expect(await getPrivateKey()).not.toBeNull();
      expect(await hasKeys()).toBe(true);
    });
  });

  describe("deriveSharedSecret", () => {
    it("выбрасывает ошибку без приватного ключа", async () => {
      await expect(deriveSharedSecret("other_pub_key")).rejects.toThrow(
        "No private key found",
      );
    });

    it("вычисляет общий секрет", async () => {
      await generateKeyPair();
      const shared = await deriveSharedSecret("other_user_public_key");
      expect(typeof shared).toBe("string");
      expect(shared.length).toBe(64); // SHA-256 hex
    });

    it("детерминирован для тех же ключей", async () => {
      await generateKeyPair();
      const s1 = await deriveSharedSecret("fixed_key");
      const s2 = await deriveSharedSecret("fixed_key");
      expect(s1).toBe(s2);
    });

    it("разный секрет для разных собеседников", async () => {
      await generateKeyPair();
      const s1 = await deriveSharedSecret("user_a_key");
      const s2 = await deriveSharedSecret("user_b_key");
      expect(s1).not.toBe(s2);
    });
  });

  describe("getOrDeriveSharedSecret", () => {
    it("вычисляет и кеширует секрет", async () => {
      await generateKeyPair();
      const s1 = await getOrDeriveSharedSecret("chat-1", "other_key");
      // Второй вызов — из кеша
      const s2 = await getOrDeriveSharedSecret("chat-1", "other_key");
      expect(s1).toBe(s2);
      // Кеш записан в SecureStore
      expect(secureStore["e2ee_shared_chat-1"]).toBe(s1);
    });
  });

  describe("encrypt / decrypt цикл", () => {
    it("шифрует и дешифрует текст обратно", async () => {
      await generateKeyPair();
      const sharedSecret = await deriveSharedSecret("partner_key");

      const original = "Привет, это секретное сообщение! 🔐";
      const encrypted = await encryptMessage(original, sharedSecret);

      expect(isEncrypted(encrypted)).toBe(true);
      expect(encrypted).not.toContain(original);

      const decrypted = await decryptMessage(encrypted, sharedSecret);
      expect(decrypted).toBe(original);
    });

    it("разные IV при каждом шифровании", async () => {
      await generateKeyPair();
      const sharedSecret = await deriveSharedSecret("key");

      const e1 = await encryptMessage("test", sharedSecret);
      const e2 = await encryptMessage("test", sharedSecret);

      // Одинаковый текст → разный шифротекст (разный IV)
      expect(e1).not.toBe(e2);

      // Но оба дешифруются корректно
      expect(await decryptMessage(e1, sharedSecret)).toBe("test");
      expect(await decryptMessage(e2, sharedSecret)).toBe("test");
    });

    it("не расшифрует с неправильным ключом", async () => {
      await generateKeyPair();
      const sharedSecret = await deriveSharedSecret("correct_partner");

      const encrypted = await encryptMessage("secret", sharedSecret);

      // Другой ключ
      const wrongSecret = await deriveSharedSecret("wrong_partner");
      const result = await decryptMessage(encrypted, wrongSecret);
      // Должен вернуть сообщение об ошибке
      expect(result).toBe("[Не удалось расшифровать сообщение]");
    });

    it("шифрует кириллицу и эмодзи", async () => {
      await generateKeyPair();
      const sharedSecret = await deriveSharedSecret("key");

      const texts = [
        "Привет мир!",
        "Тест 🎉🔥",
        "日本語テスト",
        "Mixed: Hello Мир 🌍",
      ];

      for (const text of texts) {
        const enc = await encryptMessage(text, sharedSecret);
        const dec = await decryptMessage(enc, sharedSecret);
        expect(dec).toBe(text);
      }
    });

    it("decryptMessage возвращает незашифрованный текст as-is", async () => {
      const plain = "Обычное сообщение";
      const result = await decryptMessage(plain, "any_secret");
      expect(result).toBe(plain);
    });
  });

  describe("clearE2EEData", () => {
    it("удаляет ключи из SecureStore", async () => {
      await generateKeyPair();
      expect(await hasKeys()).toBe(true);

      await clearE2EEData();
      expect(secureStore["e2ee_private_key"]).toBeUndefined();
      expect(secureStore["e2ee_public_key"]).toBeUndefined();
    });
  });

  describe("getE2EEStatus", () => {
    it("всё выключено без ключей", async () => {
      const status = await getE2EEStatus(null);
      expect(status.enabled).toBe(false);
      expect(status.hasKeys).toBe(false);
      expect(status.otherHasKeys).toBe(false);
    });

    it("частично: свои ключи есть, у собеседника нет", async () => {
      await generateKeyPair();
      const status = await getE2EEStatus(null);
      expect(status.enabled).toBe(false);
      expect(status.hasKeys).toBe(true);
      expect(status.otherHasKeys).toBe(false);
    });

    it("полностью активно: ключи у обоих", async () => {
      await generateKeyPair();
      const status = await getE2EEStatus("other_public_key");
      expect(status.enabled).toBe(true);
      expect(status.hasKeys).toBe(true);
      expect(status.otherHasKeys).toBe(true);
    });
  });
});
