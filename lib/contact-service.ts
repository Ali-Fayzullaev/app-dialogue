import { supabase } from "@/lib/supabase";

/**
 * Проверяет, является ли пользователь контактом
 */
export async function isContact(
  userId: string,
  contactId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from("contacts")
    .select("id")
    .eq("user_id", userId)
    .eq("contact_id", contactId)
    .maybeSingle();

  return !!data;
}

/**
 * Добавляет пользователя в контакты
 */
export async function addContact(
  userId: string,
  contactId: string,
): Promise<boolean> {
  const { error } = await supabase.from("contacts").insert({
    user_id: userId,
    contact_id: contactId,
  });

  return !error;
}

/**
 * Удаляет пользователя из контактов
 */
export async function removeContact(
  userId: string,
  contactId: string,
): Promise<boolean> {
  const { error } = await supabase
    .from("contacts")
    .delete()
    .eq("user_id", userId)
    .eq("contact_id", contactId);

  return !error;
}

/**
 * Получает список ID контактов пользователя (одностороннее)
 */
export async function getContactIds(userId: string): Promise<string[]> {
  const { data } = await supabase
    .from("contacts")
    .select("contact_id")
    .eq("user_id", userId);

  return data?.map((c) => c.contact_id) || [];
}

/**
 * Получает список ID всех связанных контактов (двустороннее).
 * Если A добавил B ИЛИ B добавил A — оба в результате.
 * Используется для видимости статусов.
 */
export async function getMutualContactIds(userId: string): Promise<string[]> {
  // Те, кого я добавил
  const { data: added } = await supabase
    .from("contacts")
    .select("contact_id")
    .eq("user_id", userId);

  // Те, кто добавил меня
  const { data: addedBy } = await supabase
    .from("contacts")
    .select("user_id")
    .eq("contact_id", userId);

  const ids = new Set<string>();
  added?.forEach((c) => ids.add(c.contact_id));
  addedBy?.forEach((c) => ids.add(c.user_id));

  return [...ids];
}

/**
 * Проверяет, писал ли текущий пользователь в этот чат
 */
export async function hasUserSentMessages(
  userId: string,
  chatId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from("messages")
    .select("id")
    .eq("chat_id", chatId)
    .eq("sender_id", userId)
    .limit(1);

  return (data?.length ?? 0) > 0;
}

/**
 * Проверяет, есть ли в чате сообщения от другого пользователя
 * (для определения — «мне написали первыми»)
 */
export async function hasOtherUserSentMessages(
  chatId: string,
  currentUserId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from("messages")
    .select("id")
    .eq("chat_id", chatId)
    .neq("sender_id", currentUserId)
    .limit(1);

  return (data?.length ?? 0) > 0;
}
