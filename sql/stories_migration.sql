-- Stories / Статусы — исчезающие фото/видео (24 часа)

-- Таблица статусов/историй
CREATE TABLE IF NOT EXISTS stories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  media_url TEXT NOT NULL,
  media_type TEXT NOT NULL CHECK (media_type IN ('image', 'video')),
  caption TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ DEFAULT (now() + interval '24 hours'),
  -- Приватность: 'all' = все контакты, 'contacts_except' = все кроме, 'only_share_with' = только выбранные
  privacy TEXT NOT NULL DEFAULT 'all' CHECK (privacy IN ('all', 'contacts_except', 'only_share_with'))
);

-- Просмотры историй
CREATE TABLE IF NOT EXISTS story_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  story_id UUID NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  viewer_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  viewed_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(story_id, viewer_id)
);

-- Список исключённых/включённых пользователей для приватности
CREATE TABLE IF NOT EXISTS story_privacy_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  target_user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  UNIQUE(user_id, target_user_id)
);

-- Индексы
CREATE INDEX IF NOT EXISTS idx_stories_user_id ON stories(user_id);
CREATE INDEX IF NOT EXISTS idx_stories_expires_at ON stories(expires_at);
CREATE INDEX IF NOT EXISTS idx_story_views_story_id ON story_views(story_id);
CREATE INDEX IF NOT EXISTS idx_story_views_viewer_id ON story_views(viewer_id);
CREATE INDEX IF NOT EXISTS idx_story_privacy_user_id ON story_privacy_users(user_id);

-- RLS
ALTER TABLE stories ENABLE ROW LEVEL SECURITY;
ALTER TABLE story_views ENABLE ROW LEVEL SECURITY;
ALTER TABLE story_privacy_users ENABLE ROW LEVEL SECURITY;

-- Функция для проверки видимости истории для конкретного зрителя
CREATE OR REPLACE FUNCTION story_visible_to_user(story_row stories)
RETURNS BOOLEAN AS $$
BEGIN
  -- Свои истории всегда видны
  IF story_row.user_id = auth.uid() THEN
    RETURN TRUE;
  END IF;

  -- Просроченные не видны
  IF story_row.expires_at < now() THEN
    RETURN FALSE;
  END IF;

  -- Проверяем приватность
  IF story_row.privacy = 'all' THEN
    RETURN TRUE;
  ELSIF story_row.privacy = 'contacts_except' THEN
    -- Видно всем кроме исключённых
    RETURN NOT EXISTS (
      SELECT 1 FROM story_privacy_users
      WHERE user_id = story_row.user_id AND target_user_id = auth.uid()
    );
  ELSIF story_row.privacy = 'only_share_with' THEN
    -- Видно только выбранным
    RETURN EXISTS (
      SELECT 1 FROM story_privacy_users
      WHERE user_id = story_row.user_id AND target_user_id = auth.uid()
    );
  END IF;

  RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Политики
CREATE POLICY stories_select ON stories FOR SELECT
  USING (story_visible_to_user(stories));
CREATE POLICY stories_insert ON stories FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY stories_delete ON stories FOR DELETE USING (auth.uid() = user_id);

-- Просмотры: видны только автору истории
CREATE POLICY story_views_select ON story_views FOR SELECT
  USING (
    auth.uid() = viewer_id
    OR EXISTS (SELECT 1 FROM stories WHERE id = story_views.story_id AND user_id = auth.uid())
  );
CREATE POLICY story_views_insert ON story_views FOR INSERT WITH CHECK (auth.uid() = viewer_id);

CREATE POLICY story_privacy_select ON story_privacy_users FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY story_privacy_insert ON story_privacy_users FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY story_privacy_delete ON story_privacy_users FOR DELETE USING (auth.uid() = user_id);

-- Storage bucket для медиа статусов
INSERT INTO storage.buckets (id, name, public) VALUES ('stories', 'stories', true) ON CONFLICT DO NOTHING;

-- Realtime для просмотров историй
ALTER PUBLICATION supabase_realtime ADD TABLE story_views;

CREATE POLICY stories_storage_select ON storage.objects FOR SELECT USING (bucket_id = 'stories');
CREATE POLICY stories_storage_insert ON storage.objects FOR INSERT WITH CHECK (
  bucket_id = 'stories'
  AND auth.role() = 'authenticated'
  AND (storage.foldername(name))[1] = auth.uid()::text
);
CREATE POLICY stories_storage_delete ON storage.objects FOR DELETE USING (bucket_id = 'stories' AND auth.uid()::text = (storage.foldername(name))[1]);
