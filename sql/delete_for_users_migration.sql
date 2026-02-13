-- Добавляем колонку для мягкого удаления "для себя"
-- Хранит массив user_id тех, кто удалил это сообщение для себя
ALTER TABLE messages ADD COLUMN IF NOT EXISTS deleted_for_users UUID[] DEFAULT '{}';
