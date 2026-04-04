-- ============================================
-- SECURITY FIXES — выполнить в Supabase SQL Editor
-- ============================================

-- 1. БЛОКИРОВКА: Enforced RLS на INSERT сообщений
-- Удаляем старую политику (если есть)
DROP POLICY IF EXISTS "Users can send messages to their chats" ON messages;
DROP POLICY IF EXISTS "Users can send messages if not blocked" ON messages;

-- Новая политика: проверяет membership + блокировку
CREATE POLICY "Users can send messages if not blocked" ON messages
  FOR INSERT WITH CHECK (
    auth.uid() = sender_id
    AND EXISTS (SELECT 1 FROM chat_members WHERE chat_id = messages.chat_id AND user_id = auth.uid())
    AND can_send_message_to_chat(chat_id, auth.uid())
  );


-- 2. STORIES: Приватность на уровне БД (вместо USING(true))
-- Создаём функцию проверки видимости
CREATE OR REPLACE FUNCTION story_visible_to_user(story_row stories)
RETURNS BOOLEAN AS $$
BEGIN
  IF story_row.user_id = auth.uid() THEN RETURN TRUE; END IF;
  IF story_row.expires_at < now() THEN RETURN FALSE; END IF;

  IF story_row.privacy = 'all' THEN
    RETURN TRUE;
  ELSIF story_row.privacy = 'contacts_except' THEN
    RETURN NOT EXISTS (
      SELECT 1 FROM story_privacy_users
      WHERE user_id = story_row.user_id AND target_user_id = auth.uid()
    );
  ELSIF story_row.privacy = 'only_share_with' THEN
    RETURN EXISTS (
      SELECT 1 FROM story_privacy_users
      WHERE user_id = story_row.user_id AND target_user_id = auth.uid()
    );
  END IF;
  RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Обновляем политику SELECT для stories
DROP POLICY IF EXISTS stories_select ON stories;
CREATE POLICY stories_select ON stories FOR SELECT
  USING (story_visible_to_user(stories));

-- Обновляем политику просмотров — только автор и зритель
DROP POLICY IF EXISTS story_views_select ON story_views;
CREATE POLICY story_views_select ON story_views FOR SELECT
  USING (
    auth.uid() = viewer_id
    OR EXISTS (SELECT 1 FROM stories WHERE id = story_views.story_id AND user_id = auth.uid())
  );


-- 3. STORAGE: Ограничение загрузки в свою папку
DROP POLICY IF EXISTS stories_storage_insert ON storage.objects;
CREATE POLICY stories_storage_insert ON storage.objects FOR INSERT WITH CHECK (
  bucket_id = 'stories'
  AND auth.role() = 'authenticated'
  AND (storage.foldername(name))[1] = auth.uid()::text
);


-- 4. CHAT FOLDERS: Проверка membership при добавлении чата в папку
DROP POLICY IF EXISTS "Users can add to own folders" ON chat_folder_items;
CREATE POLICY "Users can add to own folders" ON chat_folder_items
  FOR INSERT WITH CHECK (
    auth.uid() = user_id
    AND chat_id IN (
      SELECT cm.chat_id FROM chat_members cm WHERE cm.user_id = auth.uid()
    )
  );
