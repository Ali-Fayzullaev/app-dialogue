/**
 * StoryService — CRUD для историй/статусов.
 * Загрузка медиа, создание, получение, просмотр, приватность.
 */

import { supabase } from "@/lib/supabase";
import { Profile, StoryWithDetails, UserStories } from "@/types/database";
import { decode } from "base64-arraybuffer";
import { File } from "expo-file-system/next";

// ==================== CREATE ====================

/** Загрузить медиафайл в storage и создать историю */
export async function createStory(
  userId: string,
  mediaUri: string,
  mediaType: "image" | "video",
  caption?: string,
  privacy: "all" | "contacts_except" | "only_share_with" = "all",
): Promise<string | null> {
  try {
    // 1. Загружаем файл в storage
    const ext = mediaType === "video" ? "mp4" : "jpg";
    const fileName = `${userId}/${Date.now()}.${ext}`;

    const file = new File(mediaUri);
    const base64 = await file.base64();

    const { error: uploadError } = await supabase.storage
      .from("stories")
      .upload(fileName, decode(base64), {
        contentType: mediaType === "video" ? "video/mp4" : "image/jpeg",
        upsert: false,
      });

    if (uploadError) {
      console.error("Story upload error:", uploadError);
      return null;
    }

    // 2. Получаем публичный URL
    const {
      data: { publicUrl },
    } = supabase.storage.from("stories").getPublicUrl(fileName);

    // 3. Создаём запись
    const { data, error } = await supabase
      .from("stories")
      .insert({
        user_id: userId,
        media_url: publicUrl,
        media_type: mediaType,
        caption: caption || null,
        privacy,
      })
      .select("id")
      .single();

    if (error) {
      console.error("Story insert error:", error);
      return null;
    }

    return data.id;
  } catch (err) {
    console.error("createStory error:", err);
    return null;
  }
}

// ==================== READ ====================

/** Получить все активные истории (не истёкшие) сгруппированные по пользователям */
export async function fetchAllStories(
  currentUserId: string,
): Promise<UserStories[]> {
  try {
    const now = new Date().toISOString();

    // Получаем все активные истории
    const { data: stories, error } = await supabase
      .from("stories")
      .select("*")
      .gt("expires_at", now)
      .order("created_at", { ascending: true });

    if (error || !stories || stories.length === 0) return [];

    // Получаем уникальные user_id
    const userIds = [...new Set(stories.map((s) => s.user_id))];

    // Параллельно загружаем профили и просмотры текущего пользователя
    const [profilesRes, viewsRes] = await Promise.all([
      supabase.from("profiles").select("*").in("id", userIds),
      supabase
        .from("story_views")
        .select("story_id")
        .eq("viewer_id", currentUserId)
        .in(
          "story_id",
          stories.map((s) => s.id),
        ),
    ]);

    const profiles = profilesRes.data || [];
    const viewedStoryIds = new Set(
      (viewsRes.data || []).map((v) => v.story_id),
    );

    // Профили по id
    const profileMap = new Map<string, Profile>();
    profiles.forEach((p) => profileMap.set(p.id, p));

    // Группируем по пользователям
    const userStoriesMap = new Map<string, StoryWithDetails[]>();

    for (const story of stories) {
      const user = profileMap.get(story.user_id);
      if (!user) continue;

      // Фильтруем по приватности (упрощённая проверка)
      // Полная проверка с story_privacy_users будет ниже
      if (story.user_id !== currentUserId) {
        const isAllowed = await checkStoryPrivacy(
          story.user_id,
          currentUserId,
          story.privacy,
        );
        if (!isAllowed) continue;
      }

      const detailed: StoryWithDetails = {
        ...story,
        media_type: story.media_type as "image" | "video",
        privacy: story.privacy as "all" | "contacts_except" | "only_share_with",
        user,
        view_count: 0, // будет заполнено при открытии
        is_viewed: viewedStoryIds.has(story.id),
      };

      if (!userStoriesMap.has(story.user_id)) {
        userStoriesMap.set(story.user_id, []);
      }
      userStoriesMap.get(story.user_id)!.push(detailed);
    }

    // Формируем результат
    const result: UserStories[] = [];

    for (const [userId, userStories] of userStoriesMap) {
      const user = profileMap.get(userId);
      if (!user) continue;

      result.push({
        user,
        stories: userStories,
        hasUnviewed: userStories.some((s) => !s.is_viewed),
        latestAt: userStories[userStories.length - 1].created_at,
      });
    }

    // Сортировка: свои первые, потом непросмотренные, потом по дате
    result.sort((a, b) => {
      if (a.user.id === currentUserId) return -1;
      if (b.user.id === currentUserId) return 1;
      if (a.hasUnviewed && !b.hasUnviewed) return -1;
      if (!a.hasUnviewed && b.hasUnviewed) return 1;
      return new Date(b.latestAt).getTime() - new Date(a.latestAt).getTime();
    });

    return result;
  } catch (err) {
    console.error("fetchAllStories error:", err);
    return [];
  }
}

/** Получить просмотры конкретной истории (для владельца) */
export async function fetchStoryViews(
  storyId: string,
): Promise<{ viewer: Profile; viewed_at: string }[]> {
  try {
    const { data, error } = await supabase
      .from("story_views")
      .select("viewer_id, viewed_at")
      .eq("story_id", storyId)
      .order("viewed_at", { ascending: false });

    if (error || !data || data.length === 0) return [];

    const viewerIds = data.map((v) => v.viewer_id);
    const { data: profiles } = await supabase
      .from("profiles")
      .select("*")
      .in("id", viewerIds);

    const profileMap = new Map<string, Profile>();
    (profiles || []).forEach((p) => profileMap.set(p.id, p));

    return data
      .map((v) => ({
        viewer: profileMap.get(v.viewer_id)!,
        viewed_at: v.viewed_at,
      }))
      .filter((v) => v.viewer);
  } catch (err) {
    console.error("fetchStoryViews error:", err);
    return [];
  }
}

// ==================== VIEW / MARK ====================

/** Отметить историю как просмотренную */
export async function markStoryViewed(
  storyId: string,
  viewerId: string,
): Promise<void> {
  try {
    await supabase
      .from("story_views")
      .upsert(
        { story_id: storyId, viewer_id: viewerId },
        { onConflict: "story_id,viewer_id" },
      );
  } catch (err) {
    console.error("markStoryViewed error:", err);
  }
}

// ==================== DELETE ====================

/** Удалить свою историю */
export async function deleteStory(
  storyId: string,
  userId: string,
): Promise<boolean> {
  try {
    const { error } = await supabase
      .from("stories")
      .delete()
      .eq("id", storyId)
      .eq("user_id", userId);

    return !error;
  } catch (err) {
    console.error("deleteStory error:", err);
    return false;
  }
}

// ==================== PRIVACY ====================

/** Проверить доступна ли история пользователю */
async function checkStoryPrivacy(
  storyOwnerId: string,
  viewerId: string,
  privacy: string,
): Promise<boolean> {
  if (privacy === "all") return true;

  try {
    const { data } = await supabase
      .from("story_privacy_users")
      .select("id")
      .eq("user_id", storyOwnerId)
      .eq("target_user_id", viewerId)
      .maybeSingle();

    if (privacy === "contacts_except") {
      // Если пользователь в списке исключений — не показываем
      return !data;
    }
    if (privacy === "only_share_with") {
      // Показываем только если пользователь в списке
      return !!data;
    }

    return true;
  } catch {
    return true;
  }
}

/** Получить список пользователей приватности */
export async function getPrivacyUsers(userId: string): Promise<Profile[]> {
  try {
    const { data, error } = await supabase
      .from("story_privacy_users")
      .select("target_user_id")
      .eq("user_id", userId);

    if (error || !data || data.length === 0) return [];

    const ids = data.map((d) => d.target_user_id);
    const { data: profiles } = await supabase
      .from("profiles")
      .select("*")
      .in("id", ids);

    return profiles || [];
  } catch {
    return [];
  }
}

/** Установить список пользователей приватности */
export async function setPrivacyUsers(
  userId: string,
  targetUserIds: string[],
): Promise<void> {
  try {
    // Удаляем старый список
    await supabase.from("story_privacy_users").delete().eq("user_id", userId);

    // Вставляем новый
    if (targetUserIds.length > 0) {
      await supabase.from("story_privacy_users").insert(
        targetUserIds.map((targetId) => ({
          user_id: userId,
          target_user_id: targetId,
        })),
      );
    }
  } catch (err) {
    console.error("setPrivacyUsers error:", err);
  }
}

/** Получить количество просмотров для списка историй */
export async function fetchViewCounts(
  storyIds: string[],
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (storyIds.length === 0) return counts;

  try {
    const { data } = await supabase
      .from("story_views")
      .select("story_id")
      .in("story_id", storyIds);

    if (data) {
      for (const view of data) {
        counts.set(view.story_id, (counts.get(view.story_id) || 0) + 1);
      }
    }
  } catch {
    // ignore
  }

  return counts;
}
