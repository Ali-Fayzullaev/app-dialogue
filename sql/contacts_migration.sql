-- Таблица контактов
-- Пользователь добавляет другого пользователя в свои контакты
CREATE TABLE IF NOT EXISTS contacts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  contact_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, contact_id)
);

-- Индексы для быстрого поиска
CREATE INDEX IF NOT EXISTS idx_contacts_user_id ON contacts(user_id);
CREATE INDEX IF NOT EXISTS idx_contacts_contact_id ON contacts(contact_id);

-- RLS
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;

-- Пользователь видит свои контакты + кто его добавил
CREATE POLICY "Users can view own contacts"
  ON contacts FOR SELECT
  USING (auth.uid() = user_id OR auth.uid() = contact_id);

-- Пользователь может добавлять контакты
CREATE POLICY "Users can add contacts"
  ON contacts FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Пользователь может удалять свои контакты
CREATE POLICY "Users can delete own contacts"
  ON contacts FOR DELETE
  USING (auth.uid() = user_id);

-- Включаем Realtime для contacts
ALTER PUBLICATION supabase_realtime ADD TABLE contacts;
