-- Аудит-логи для критичных действий

CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  resource_type TEXT,
  resource_id UUID,
  details JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at);

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Только service role может читать (через Supabase Dashboard)
CREATE POLICY "No direct access to audit logs" ON audit_logs
  FOR SELECT USING (false);

-- Вставка только через триггеры (SECURITY DEFINER)
CREATE POLICY "Insert via triggers only" ON audit_logs
  FOR INSERT WITH CHECK (true);

-- Триггер: логирование блокировки
CREATE OR REPLACE FUNCTION log_block_action() RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO audit_logs (user_id, action, resource_type, resource_id, details)
  VALUES (
    NEW.blocker_id,
    'block_user',
    'user',
    NEW.blocked_id,
    jsonb_build_object('reason', COALESCE(NEW.reason, ''))
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS blocked_users_audit ON blocked_users;
CREATE TRIGGER blocked_users_audit
  AFTER INSERT ON blocked_users
  FOR EACH ROW EXECUTE FUNCTION log_block_action();

-- Триггер: логирование разблокировки
CREATE OR REPLACE FUNCTION log_unblock_action() RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO audit_logs (user_id, action, resource_type, resource_id)
  VALUES (OLD.blocker_id, 'unblock_user', 'user', OLD.blocked_id);
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS unblocked_users_audit ON blocked_users;
CREATE TRIGGER unblocked_users_audit
  AFTER DELETE ON blocked_users
  FOR EACH ROW EXECUTE FUNCTION log_unblock_action();

-- Триггер: логирование удаления сообщений
CREATE OR REPLACE FUNCTION log_message_delete() RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO audit_logs (user_id, action, resource_type, resource_id, details)
  VALUES (
    auth.uid(),
    'delete_message',
    'message',
    OLD.id,
    jsonb_build_object('chat_id', OLD.chat_id)
  );
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS message_delete_audit ON messages;
CREATE TRIGGER message_delete_audit
  AFTER DELETE ON messages
  FOR EACH ROW EXECUTE FUNCTION log_message_delete();
