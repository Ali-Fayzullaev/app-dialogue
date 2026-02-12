-- Добавляем колонки для хранения waveform и длительности голосовых сообщений
ALTER TABLE messages ADD COLUMN IF NOT EXISTS audio_waveform JSONB DEFAULT NULL;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS audio_duration REAL DEFAULT NULL;
