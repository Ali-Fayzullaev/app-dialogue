-- Миграция для архивирования чатов
-- Добавляет возможность архивировать чаты для каждого пользователя отдельно

-- Добавить колонку is_archived в таблицу chat_members
ALTER TABLE chat_members 
ADD COLUMN IF NOT EXISTS is_archived BOOLEAN DEFAULT FALSE;

-- Создать индекс для быстрого поиска архивированных чатов
CREATE INDEX IF NOT EXISTS idx_chat_members_archived 
ON chat_members(user_id, is_archived);
