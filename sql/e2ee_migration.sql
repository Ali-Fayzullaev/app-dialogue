-- E2EE: Добавляем публичный ключ шифрования в профили
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS public_key TEXT DEFAULT NULL;

-- Индекс для быстрого поиска ключей
CREATE INDEX IF NOT EXISTS idx_profiles_public_key ON profiles(id) WHERE public_key IS NOT NULL;

-- Комментарий
COMMENT ON COLUMN profiles.public_key IS 'E2EE: Публичный ключ пользователя для сквозного шифрования';
