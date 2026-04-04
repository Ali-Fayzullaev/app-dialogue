-- Миграция для папок чатов (как в Telegram)
-- Позволяет организовать чаты по категориям

-- Таблица папок
CREATE TABLE IF NOT EXISTS chat_folders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name VARCHAR(50) NOT NULL,
  icon VARCHAR(50) NOT NULL DEFAULT 'folder',
  color VARCHAR(20) DEFAULT '#007AFF',
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  UNIQUE(user_id, name)
);

-- Таблица связи чатов с папками
CREATE TABLE IF NOT EXISTS chat_folder_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  folder_id UUID NOT NULL REFERENCES chat_folders(id) ON DELETE CASCADE,
  chat_id UUID NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  added_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  UNIQUE(folder_id, chat_id)
);

-- Индексы для быстрого поиска
CREATE INDEX IF NOT EXISTS idx_chat_folders_user ON chat_folders(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_folder_items_folder ON chat_folder_items(folder_id);
CREATE INDEX IF NOT EXISTS idx_chat_folder_items_user ON chat_folder_items(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_folder_items_chat ON chat_folder_items(chat_id);

-- RLS политики
ALTER TABLE chat_folders ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_folder_items ENABLE ROW LEVEL SECURITY;

-- Политики для chat_folders
CREATE POLICY "Users can view own folders" ON chat_folders
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create own folders" ON chat_folders
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own folders" ON chat_folders
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own folders" ON chat_folders
  FOR DELETE USING (auth.uid() = user_id);

-- Политики для chat_folder_items
CREATE POLICY "Users can view own folder items" ON chat_folder_items
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can add to own folders" ON chat_folder_items
  FOR INSERT WITH CHECK (
    auth.uid() = user_id
    AND chat_id IN (
      SELECT cm.chat_id FROM chat_members cm WHERE cm.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can remove from own folders" ON chat_folder_items
  FOR DELETE USING (auth.uid() = user_id);
