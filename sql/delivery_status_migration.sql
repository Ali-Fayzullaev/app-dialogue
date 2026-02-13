-- Добавляем статус доставки сообщения
-- is_delivered = false: отправлено (1 серая галочка)
-- is_delivered = true, is_read = false: доставлено (2 серые галочки) 
-- is_read = true: прочитано (2 синие галочки)
ALTER TABLE messages ADD COLUMN IF NOT EXISTS is_delivered BOOLEAN DEFAULT FALSE;
