-- Миграция для таблицы звонков
-- Выполните этот SQL в Supabase Dashboard → SQL Editor

-- Таблица звонков
CREATE TABLE IF NOT EXISTS calls (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    chat_id UUID NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
    caller_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    receiver_id UUID REFERENCES profiles(id) ON DELETE SET NULL, -- NULL для групповых звонков
    call_type TEXT NOT NULL CHECK (call_type IN ('audio', 'video')),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'ringing', 'active', 'ended', 'missed', 'declined', 'failed')),
    daily_room_name TEXT,
    daily_room_url TEXT,
    started_at TIMESTAMPTZ,
    ended_at TIMESTAMPTZ,
    duration_seconds INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Индексы для быстрого поиска
CREATE INDEX IF NOT EXISTS idx_calls_chat_id ON calls(chat_id);
CREATE INDEX IF NOT EXISTS idx_calls_caller_id ON calls(caller_id);
CREATE INDEX IF NOT EXISTS idx_calls_receiver_id ON calls(receiver_id);
CREATE INDEX IF NOT EXISTS idx_calls_status ON calls(status);
CREATE INDEX IF NOT EXISTS idx_calls_created_at ON calls(created_at DESC);

-- RLS политики
ALTER TABLE calls ENABLE ROW LEVEL SECURITY;

-- Политика: пользователи могут видеть звонки где они участники
CREATE POLICY "Users can view their calls" ON calls
    FOR SELECT USING (
        caller_id = auth.uid() OR 
        receiver_id = auth.uid() OR
        EXISTS (
            SELECT 1 FROM chat_members 
            WHERE chat_members.chat_id = calls.chat_id 
            AND chat_members.user_id = auth.uid()
        )
    );

-- Политика: пользователи могут создавать звонки в своих чатах
CREATE POLICY "Users can create calls in their chats" ON calls
    FOR INSERT WITH CHECK (
        caller_id = auth.uid() AND
        EXISTS (
            SELECT 1 FROM chat_members 
            WHERE chat_members.chat_id = calls.chat_id 
            AND chat_members.user_id = auth.uid()
        )
    );

-- Политика: участники звонка могут обновлять статус
CREATE POLICY "Call participants can update call" ON calls
    FOR UPDATE USING (
        caller_id = auth.uid() OR 
        receiver_id = auth.uid() OR
        EXISTS (
            SELECT 1 FROM chat_members 
            WHERE chat_members.chat_id = calls.chat_id 
            AND chat_members.user_id = auth.uid()
        )
    );

-- Включаем Realtime для таблицы звонков
ALTER PUBLICATION supabase_realtime ADD TABLE calls;

-- Триггер для обновления длительности звонка при завершении
CREATE OR REPLACE FUNCTION calculate_call_duration()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status = 'ended' AND NEW.started_at IS NOT NULL AND NEW.ended_at IS NOT NULL THEN
        NEW.duration_seconds := EXTRACT(EPOCH FROM (NEW.ended_at - NEW.started_at))::INTEGER;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_calculate_call_duration
    BEFORE UPDATE ON calls
    FOR EACH ROW
    EXECUTE FUNCTION calculate_call_duration();
