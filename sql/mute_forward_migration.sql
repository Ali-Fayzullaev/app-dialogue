-- Мьют чата: добавляем поле is_muted в chat_members
ALTER TABLE chat_members ADD COLUMN IF NOT EXISTS is_muted BOOLEAN DEFAULT FALSE;

-- Пересылка сообщений: добавляем поля для forwarded сообщений
ALTER TABLE messages ADD COLUMN IF NOT EXISTS forwarded_from_id UUID REFERENCES messages(id) ON DELETE SET NULL;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS forwarded_from_username TEXT;
