// Утилита для получения Open Graph метаданных из URL

export interface LinkPreviewData {
  url: string;
  title: string | null;
  description: string | null;
  image: string | null;
  siteName: string | null;
  favicon: string | null;
  isDirectImage?: boolean;
}

// Кеш превью в памяти
const previewCache = new Map<string, LinkPreviewData | null>();

// Извлечь первый URL из текста
export function extractUrl(text: string): string | null {
  const urlRegex = /(https?:\/\/[^\s]+)/i;
  const match = text.match(urlRegex);
  return match ? match[1] : null;
}

// Извлечь домен из URL
function getDomain(url: string): string {
  try {
    const u = new URL(url);
    return u.hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

// Получить фавикон сайта
function getFavicon(url: string): string {
  try {
    const u = new URL(url);
    return `https://www.google.com/s2/favicons?domain=${u.hostname}&sz=32`;
  } catch {
    return "";
  }
}

// Парсим OG-теги из HTML
function parseOGTags(html: string, url: string): LinkPreviewData {
  const getMetaContent = (property: string, html: string): string | null => {
    // og:property
    const ogRegex = new RegExp(
      `<meta[^>]*property=["']${property}["'][^>]*content=["']([^"']*)["']`,
      "i",
    );
    let match = html.match(ogRegex);
    if (match) return match[1];

    // content перед property
    const ogRegex2 = new RegExp(
      `<meta[^>]*content=["']([^"']*)["'][^>]*property=["']${property}["']`,
      "i",
    );
    match = html.match(ogRegex2);
    if (match) return match[1];

    // name variant
    const nameRegex = new RegExp(
      `<meta[^>]*name=["']${property}["'][^>]*content=["']([^"']*)["']`,
      "i",
    );
    match = html.match(nameRegex);
    if (match) return match[1];

    const nameRegex2 = new RegExp(
      `<meta[^>]*content=["']([^"']*)["'][^>]*name=["']${property}["']`,
      "i",
    );
    match = html.match(nameRegex2);
    if (match) return match[1];

    return null;
  };

  // Заголовок: og:title -> <title>
  let title =
    getMetaContent("og:title", html) || getMetaContent("twitter:title", html);
  if (!title) {
    const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
    title = titleMatch ? titleMatch[1].trim() : null;
  }

  const description =
    getMetaContent("og:description", html) ||
    getMetaContent("twitter:description", html) ||
    getMetaContent("description", html);

  let image =
    getMetaContent("og:image", html) ||
    getMetaContent("twitter:image", html) ||
    getMetaContent("twitter:image:src", html);

  // Конвертируем относительные URL в абсолютные
  if (image && !image.startsWith("http")) {
    try {
      const base = new URL(url);
      image = new URL(image, base.origin).href;
    } catch {
      image = null;
    }
  }

  const siteName = getMetaContent("og:site_name", html) || getDomain(url);

  return {
    url,
    title: title ? decodeHTMLEntities(title) : null,
    description: description ? decodeHTMLEntities(description) : null,
    image,
    siteName,
    favicon: getFavicon(url),
  };
}

// Декодируем HTML-сущности
function decodeHTMLEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, "/")
    .replace(/&nbsp;/g, " ");
}

// Проверить, является ли URL прямой ссылкой на изображение
function isImageUrl(url: string): boolean {
  const imageExtensions = /\.(jpg|jpeg|png|gif|webp|bmp|svg|ico|tiff)(\?.*)?$/i;
  if (imageExtensions.test(url)) return true;
  // Известные image CDN
  const imageDomains = [
    "encrypted-tbn0.gstatic.com",
    "i.imgur.com",
    "pbs.twimg.com",
    "images.unsplash.com",
    "cdn.pixabay.com",
    "lh3.googleusercontent.com",
  ];
  try {
    const u = new URL(url);
    if (imageDomains.some((d) => u.hostname.includes(d))) return true;
  } catch {}
  return false;
}

// Загрузить метаданные ссылки
export async function fetchLinkPreview(
  url: string,
): Promise<LinkPreviewData | null> {
  // Проверяем кеш
  if (previewCache.has(url)) {
    return previewCache.get(url) || null;
  }

  // Если URL — это прямая ссылка на изображение
  if (isImageUrl(url)) {
    const preview: LinkPreviewData = {
      url,
      title: null,
      description: null,
      image: url,
      siteName: getDomain(url),
      favicon: getFavicon(url),
      isDirectImage: true,
    };
    previewCache.set(url, preview);
    return preview;
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; LinkPreview/1.0)",
        Accept: "text/html",
      },
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      previewCache.set(url, null);
      return null;
    }

    const contentType = response.headers.get("content-type") || "";

    // Если сервер вернул изображение — показываем как картинку
    if (contentType.startsWith("image/")) {
      const preview: LinkPreviewData = {
        url,
        title: null,
        description: null,
        image: url,
        siteName: getDomain(url),
        favicon: getFavicon(url),
        isDirectImage: true,
      };
      previewCache.set(url, preview);
      return preview;
    }

    if (!contentType.includes("text/html")) {
      previewCache.set(url, null);
      return null;
    }

    // Читаем только первые 50KB (хватает для мета-тегов)
    const reader = response.body?.getReader();
    if (!reader) {
      previewCache.set(url, null);
      return null;
    }

    let html = "";
    const decoder = new TextDecoder();
    let totalBytes = 0;
    const maxBytes = 50000;

    while (totalBytes < maxBytes) {
      const { done, value } = await reader.read();
      if (done) break;
      html += decoder.decode(value, { stream: true });
      totalBytes += value.length;

      // Если нашли </head> — хватит, мета-теги в head
      if (html.includes("</head>")) break;
    }

    reader.cancel();

    const preview = parseOGTags(html, url);

    // Если нет ни title ни image — не показываем превью
    if (!preview.title && !preview.image) {
      previewCache.set(url, null);
      return null;
    }

    previewCache.set(url, preview);
    return preview;
  } catch {
    previewCache.set(url, null);
    return null;
  }
}

// Очистить кеш
export function clearPreviewCache() {
  previewCache.clear();
}
