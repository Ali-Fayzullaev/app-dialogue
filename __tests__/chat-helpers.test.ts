/**
 * Тесты для chat-helpers — утилитарные функции чата.
 */

import {
    formatDateSeparator,
    formatFileSize,
    formatMessageTime,
    getFileIcon,
    getMediaTypeLabel,
    shouldShowDateSeparator,
} from "@/lib/chat-helpers";

// ---- Тесты ----

describe("chat-helpers", () => {
  describe("formatMessageTime", () => {
    it("форматирует время в HH:MM", () => {
      // Создаём дату с известным временем
      const date = new Date(2025, 0, 15, 14, 35, 0);
      const result = formatMessageTime(date.toISOString());
      // Должно содержать часы и минуты
      expect(result).toMatch(/14[:\.]35/);
    });

    it("добавляет ведущий ноль", () => {
      const date = new Date(2025, 0, 15, 9, 5, 0);
      const result = formatMessageTime(date.toISOString());
      expect(result).toMatch(/09[:\.]05/);
    });
  });

  describe("formatDateSeparator", () => {
    it('возвращает "Сегодня" для сегодняшней даты', () => {
      const now = new Date();
      const result = formatDateSeparator(now.toISOString());
      expect(result).toBe("Сегодня");
    });

    it('возвращает "Вчера" для вчерашней даты', () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const result = formatDateSeparator(yesterday.toISOString());
      expect(result).toBe("Вчера");
    });

    it("возвращает полную дату для старых дат", () => {
      const old = new Date(2024, 2, 15); // 15 марта 2024
      const result = formatDateSeparator(old.toISOString());
      // Должна содержать число и месяц
      expect(result).toMatch(/15/);
      expect(result.length).toBeGreaterThan(2);
    });
  });

  describe("formatFileSize", () => {
    it("возвращает 0 Б для нулевого размера", () => {
      expect(formatFileSize(0)).toBe("0 Б");
    });

    it("форматирует байты", () => {
      expect(formatFileSize(500)).toBe("500 Б");
    });

    it("форматирует килобайты", () => {
      expect(formatFileSize(1024)).toBe("1 КБ");
    });

    it("форматирует мегабайты", () => {
      expect(formatFileSize(1048576)).toBe("1 МБ");
    });

    it("форматирует мегабайты с десятичной частью", () => {
      const result = formatFileSize(1572864); // 1.5 MB
      expect(result).toBe("1.5 МБ");
    });

    it("форматирует гигабайты", () => {
      expect(formatFileSize(1073741824)).toBe("1 ГБ");
    });
  });

  describe("getFileIcon", () => {
    it('возвращает "document-text" для pdf', () => {
      expect(getFileIcon("report.pdf")).toBe("document-text");
    });

    it('возвращает "document-text" для docx', () => {
      expect(getFileIcon("file.docx")).toBe("document-text");
    });

    it('возвращает "grid" для xlsx', () => {
      expect(getFileIcon("table.xlsx")).toBe("grid");
    });

    it('возвращает "archive" для zip', () => {
      expect(getFileIcon("archive.zip")).toBe("archive");
    });

    it('возвращает "musical-notes" для mp3', () => {
      expect(getFileIcon("song.mp3")).toBe("musical-notes");
    });

    it('возвращает "image" для jpg', () => {
      expect(getFileIcon("photo.jpg")).toBe("image");
    });

    it('возвращает "document-attach" для неизвестного расширения', () => {
      expect(getFileIcon("data.xyz")).toBe("document-attach");
    });

    it("регистронезависимо (нижний регистр в ext)", () => {
      // getFileIcon приводит расширение к lowercase
      expect(getFileIcon("file.PDF")).toBe("document-text");
    });
  });

  describe("getMediaTypeLabel", () => {
    it('возвращает "Фото" для image', () => {
      expect(getMediaTypeLabel("image")).toBe("Фото");
    });

    it('возвращает "Видео" для video', () => {
      expect(getMediaTypeLabel("video")).toBe("Видео");
    });

    it('возвращает "Аудио" для audio', () => {
      expect(getMediaTypeLabel("audio")).toBe("Аудио");
    });

    it('возвращает "Геолокация" для location', () => {
      expect(getMediaTypeLabel("location")).toBe("Геолокация");
    });

    it('возвращает "Документ" для file', () => {
      expect(getMediaTypeLabel("file")).toBe("Документ");
    });

    it("возвращает пустую строку для null", () => {
      expect(getMediaTypeLabel(null)).toBe("");
    });

    it("возвращает пустую строку для неизвестного типа", () => {
      expect(getMediaTypeLabel("unknown")).toBe("");
    });
  });

  describe("shouldShowDateSeparator", () => {
    it("возвращает true для последнего сообщения (самого старого)", () => {
      const messages = [{ created_at: "2025-01-15T10:00:00Z" }];
      expect(shouldShowDateSeparator(messages[0], 0, messages)).toBe(true);
    });

    it("возвращает true когда даты различаются", () => {
      const messages = [
        { created_at: "2025-01-15T10:00:00Z" },
        { created_at: "2025-01-14T10:00:00Z" },
      ];
      expect(shouldShowDateSeparator(messages[0], 0, messages)).toBe(true);
    });

    it("возвращает false когда даты совпадают", () => {
      const messages = [
        { created_at: "2025-01-15T10:00:00Z" },
        { created_at: "2025-01-15T08:00:00Z" },
      ];
      expect(shouldShowDateSeparator(messages[0], 0, messages)).toBe(false);
    });

    it("корректно работает в середине списка", () => {
      // Используем локальные даты чтобы избежать проблем с часовыми поясами
      const day1 = new Date(2025, 0, 17, 12, 0, 0); // 17 янв, полдень
      const day2a = new Date(2025, 0, 16, 18, 0, 0); // 16 янв, вечер
      const day2b = new Date(2025, 0, 16, 8, 0, 0); // 16 янв, утро
      const messages = [
        { created_at: day1.toISOString() },
        { created_at: day2a.toISOString() },
        { created_at: day2b.toISOString() },
      ];
      // index=0: 17й vs 16й → true
      expect(shouldShowDateSeparator(messages[0], 0, messages)).toBe(true);
      // index=1: 16й vs 16й → false
      expect(shouldShowDateSeparator(messages[1], 1, messages)).toBe(false);
      // index=2: последнее → true
      expect(shouldShowDateSeparator(messages[2], 2, messages)).toBe(true);
    });
  });
});
