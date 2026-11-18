-- OMECOnnect: indexes for foreign keys flagged by the Supabase performance advisor.
-- Run after phase10_admin_operations.sql. Safe to re-run.
-- Speeds up joins, cascading deletes and RLS checks as the data grows.

CREATE INDEX IF NOT EXISTS verification_requests_reviewed_by_idx ON public.account_verification_requests (reviewed_by);
CREATE INDEX IF NOT EXISTS ai_chat_history_user_created_idx ON public.ai_chat_history (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS announcements_created_by_idx ON public.announcements (created_by);
CREATE INDEX IF NOT EXISTS audit_logs_user_created_idx ON public.audit_logs (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_logs_created_idx ON public.audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS complaint_history_complaint_idx ON public.complaint_status_history (complaint_id);
CREATE INDEX IF NOT EXISTS complaint_history_updated_by_idx ON public.complaint_status_history (updated_by);
CREATE INDEX IF NOT EXISTS complaints_customer_account_idx ON public.complaints (customer_account_id);
CREATE INDEX IF NOT EXISTS meter_readings_account_date_idx ON public.meter_readings (customer_account_id, reading_date DESC);
CREATE INDEX IF NOT EXISTS notifications_announcement_idx ON public.notifications (announcement_id);
CREATE INDEX IF NOT EXISTS notifications_bill_idx ON public.notifications (bill_id);
CREATE INDEX IF NOT EXISTS payments_account_date_idx ON public.payments (customer_account_id, payment_date DESC);
