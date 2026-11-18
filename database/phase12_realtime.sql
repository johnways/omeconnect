-- Phase 12: live (realtime) updates.
-- Supabase Realtime sends changes on these tables to signed-in apps over a
-- WebSocket. Each subscriber only receives rows its Row Level Security policies
-- allow it to SELECT (customers: their own rows; OMECO admins: everything), so
-- no extra policies are needed. Logs, AI chat history and admin accounts are
-- deliberately NOT published.
alter publication supabase_realtime add table
  public.notifications,
  public.electricity_bills,
  public.payments,
  public.customer_accounts,
  public.account_verification_requests,
  public.announcements,
  public.complaints,
  public.complaint_status_history,
  public.users;
