-- Миграция для реакций на сообщения
-- Выполните этот SQL в Supabase Dashboard -> SQL Editor

-- Удалить старую таблицу если существует (для обновления)
DROP TABLE IF EXISTS message_reactions;

-- Таблица для хранения реакций
CREATE TABLE message_reactions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  emoji TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- ВАЖНО: Один пользователь может поставить только ОДНУ реакцию на сообщение
  -- При смене реакции старая удаляется, новая добавляется
  UNIQUE(message_id, user_id)
);

-- Индексы для быстрого поиска
CREATE INDEX idx_message_reactions_message_id ON message_reactions(message_id);
CREATE INDEX idx_message_reactions_user_id ON message_reactions(user_id);
CREATE INDEX idx_message_reactions_emoji ON message_reactions(emoji);

-- RLS политики
ALTER TABLE message_reactions ENABLE ROW LEVEL SECURITY;

-- Пользователи могут видеть реакции в чатах, где они участники
CREATE POLICY "Users can view reactions in their chats" ON message_reactions
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM messages m
      JOIN chat_members cm ON cm.chat_id = m.chat_id
      WHERE m.id = message_reactions.message_id
      AND cm.user_id = auth.uid()
    )
  );

-- Пользователи могут добавлять реакции в чатах, где они участники
CREATE POLICY "Users can add reactions to messages in their chats" ON message_reactions
  FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM messages m
      JOIN chat_members cm ON cm.chat_id = m.chat_id
      WHERE m.id = message_reactions.message_id
      AND cm.user_id = auth.uid()
    )
  );

-- Пользователи могут обновлять только свои реакции
CREATE POLICY "Users can update own reactions" ON message_reactions
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Пользователи могут удалять только свои реакции
CREATE POLICY "Users can delete own reactions" ON message_reactions
  FOR DELETE
  USING (auth.uid() = user_id);

-- Включить realtime для реакций
ALTER PUBLICATION supabase_realtime ADD TABLE message_reactions;
