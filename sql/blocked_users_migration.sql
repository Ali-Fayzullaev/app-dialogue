-- Миграция для блокировки пользователей (черный список)
-- Позволяет блокировать нежелательных пользователей

-- Таблица заблокированных пользователей
CREATE TABLE IF NOT EXISTS blocked_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  blocker_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  blocked_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Один пользователь может заблокировать другого только один раз
  UNIQUE(blocker_id, blocked_id),
  
  -- Нельзя заблокировать самого себя
  CHECK (blocker_id != blocked_id)
);

-- Индексы для быстрого поиска
CREATE INDEX IF NOT EXISTS idx_blocked_users_blocker ON blocked_users(blocker_id);
CREATE INDEX IF NOT EXISTS idx_blocked_users_blocked ON blocked_users(blocked_id);

-- ВАЖНО: Включаем REPLICA IDENTITY FULL для получения старых данных при DELETE
-- Это необходимо для realtime обновления при разблокировке
ALTER TABLE blocked_users REPLICA IDENTITY FULL;

-- RLS политики
ALTER TABLE blocked_users ENABLE ROW LEVEL SECURITY;

-- Удаляем существующие политики (если есть) перед созданием
DROP POLICY IF EXISTS "Users can view own blocked list" ON blocked_users;
DROP POLICY IF EXISTS "Users can view if blocked" ON blocked_users;
DROP POLICY IF EXISTS "Users can block others" ON blocked_users;
DROP POLICY IF EXISTS "Users can unblock" ON blocked_users;

-- Политики для blocked_users
-- ВАЖНО: Пользователь может видеть записи где он blocker ИЛИ где он blocked
-- Это нужно чтобы заблокированный пользователь знал что его заблокировали
CREATE POLICY "Users can view own blocked list" ON blocked_users
  FOR SELECT USING (auth.uid() = blocker_id OR auth.uid() = blocked_id);

CREATE POLICY "Users can block others" ON blocked_users
  FOR INSERT WITH CHECK (auth.uid() = blocker_id);

CREATE POLICY "Users can unblock" ON blocked_users
  FOR DELETE USING (auth.uid() = blocker_id);

-- Функция для проверки, заблокирован ли пользователь
CREATE OR REPLACE FUNCTION is_blocked(user1_id UUID, user2_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM blocked_users 
    WHERE (blocker_id = user1_id AND blocked_id = user2_id)
       OR (blocker_id = user2_id AND blocked_id = user1_id)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Функция для проверки, можно ли отправить сообщение в чат
-- Блокирует отправку если хотя бы один из участников заблокировал другого
CREATE OR REPLACE FUNCTION can_send_message_to_chat(chat_id_param UUID, sender_id_param UUID)
RETURNS BOOLEAN AS $$
DECLARE
  chat_is_group BOOLEAN;
  other_user_id UUID;
BEGIN
  -- Получаем информацию о чате
  SELECT is_group INTO chat_is_group FROM chats WHERE id = chat_id_param;
  
  -- В групповых чатах блокировка не работает
  IF chat_is_group = TRUE THEN
    RETURN TRUE;
  END IF;
  
  -- Находим другого участника личного чата
  SELECT user_id INTO other_user_id 
  FROM chat_members 
  WHERE chat_id = chat_id_param AND user_id != sender_id_param
  LIMIT 1;
  
  IF other_user_id IS NULL THEN
    RETURN TRUE;
  END IF;
  
  -- Проверяем блокировку в обе стороны
  RETURN NOT is_blocked(sender_id_param, other_user_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Включаем Realtime для таблицы blocked_users
-- Это позволяет обновлять статус блокировки в реальном времени
ALTER PUBLICATION supabase_realtime ADD TABLE blocked_users;

-- Обновляем RLS политику для сообщений, чтобы проверять блокировку
-- ВАЖНО: Сначала удалите существующую политику INSERT для messages если она есть
DROP POLICY IF EXISTS "Users can send messages to their chats" ON messages;

-- Создаём новую политику с проверкой блокировки
CREATE POLICY "Users can send messages if not blocked" ON messages
  FOR INSERT WITH CHECK (
    auth.uid() = sender_id 
    AND EXISTS (SELECT 1 FROM chat_members WHERE chat_id = messages.chat_id AND user_id = auth.uid())
    AND can_send_message_to_chat(chat_id, auth.uid())
  );
