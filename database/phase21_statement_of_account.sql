-- Phase 21: online Statement of Account (receipt) like OMECO's printed bill.
--   * Bills keep meter readings, billing period, reading date, cut-off date,
--     surcharge and a frozen copy of every charge line (line_items).
--   * Each bill gets a unique 20-digit online payment reference.
--   * Rates can be a full schedule (Generation, Distribution, Others, VAT,
--     Universal charges, Local tax), each line per kWh or per month.
--   * compute_bill() prices a kWh amount with the schedule in effect.
--   * get_statement() returns everything the receipt needs (owner or staff only).

-- ---------------------------------------------------------------- statement header (editable by supervisors)
INSERT INTO public.app_settings (key, value) VALUES
  ('statement_header', jsonb_build_object(
    'name', 'Occidental Mindoro Electric Cooperative, Inc.',
    'short', 'OMECO',
    'address', 'San Jose, Occidental Mindoro',
    'tin', '',
    'hotline', '',
    'footer', 'This is your OMECOnnect online statement. Pay on or before the deadline to avoid a surcharge. Service may be disconnected after the cut-off date.'))
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.set_statement_header(p_header jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  clean jsonb := '{}'::jsonb;
  k text;
BEGIN
  IF public.staff_role() IS DISTINCT FROM 'supervisor' THEN RAISE EXCEPTION 'Only a supervisor can change the statement header.'; END IF;
  FOREACH k IN ARRAY ARRAY['name', 'short', 'address', 'tin', 'hotline', 'footer'] LOOP
    clean := clean || jsonb_build_object(k, left(btrim(COALESCE(p_header ->> k, '')), CASE WHEN k = 'footer' THEN 400 ELSE 120 END));
  END LOOP;
  UPDATE public.app_settings SET value = clean, updated_at = now() WHERE key = 'statement_header';
  PERFORM public.write_audit_log('settings.statement_header', 'app_settings', 'statement_header', clean);
  RETURN clean;
END;
$$;
REVOKE ALL ON FUNCTION public.set_statement_header(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_statement_header(jsonb) TO authenticated;

-- ---------------------------------------------------------------- account details on the statement
ALTER TABLE public.customer_accounts
  ADD COLUMN IF NOT EXISTS customer_type text NOT NULL DEFAULT 'R',
  ADD COLUMN IF NOT EXISTS service_address text;
ALTER TABLE public.customer_accounts DROP CONSTRAINT IF EXISTS customer_accounts_type_allowed;
ALTER TABLE public.customer_accounts ADD CONSTRAINT customer_accounts_type_allowed CHECK (customer_type IN ('R', 'C', 'I', 'P'));

-- ---------------------------------------------------------------- bill details
CREATE SEQUENCE IF NOT EXISTS public.bill_sequence_seq START 1000;
ALTER TABLE public.electricity_bills
  ADD COLUMN IF NOT EXISTS period_from date,
  ADD COLUMN IF NOT EXISTS period_to date,
  ADD COLUMN IF NOT EXISTS reading_date date,
  ADD COLUMN IF NOT EXISTS present_reading numeric(12, 2),
  ADD COLUMN IF NOT EXISTS previous_reading numeric(12, 2),
  ADD COLUMN IF NOT EXISTS multiplier numeric(10, 2) NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS line_items jsonb,
  ADD COLUMN IF NOT EXISTS surcharge_rate numeric(6, 4) NOT NULL DEFAULT 0.05,
  ADD COLUMN IF NOT EXISTS cutoff_date date,
  ADD COLUMN IF NOT EXISTS sequence_no bigint,
  ADD COLUMN IF NOT EXISTS payment_reference text;
ALTER TABLE public.electricity_bills DROP CONSTRAINT IF EXISTS electricity_bills_line_items_array;
ALTER TABLE public.electricity_bills ADD CONSTRAINT electricity_bills_line_items_array CHECK (line_items IS NULL OR jsonb_typeof(line_items) = 'array');
ALTER TABLE public.electricity_bills DROP CONSTRAINT IF EXISTS electricity_bills_readings_order;
ALTER TABLE public.electricity_bills ADD CONSTRAINT electricity_bills_readings_order
  CHECK (present_reading IS NULL OR previous_reading IS NULL OR present_reading >= previous_reading);
ALTER TABLE public.electricity_bills DROP CONSTRAINT IF EXISTS electricity_bills_multiplier_positive;
ALTER TABLE public.electricity_bills ADD CONSTRAINT electricity_bills_multiplier_positive CHECK (multiplier > 0);
ALTER TABLE public.electricity_bills DROP CONSTRAINT IF EXISTS electricity_bills_surcharge_range;
ALTER TABLE public.electricity_bills ADD CONSTRAINT electricity_bills_surcharge_range CHECK (surcharge_rate >= 0 AND surcharge_rate <= 0.5);
CREATE UNIQUE INDEX IF NOT EXISTS electricity_bills_payment_reference_key ON public.electricity_bills (payment_reference);

-- 20-digit reference: account digits (10) + YYMM (4) + bill sequence (6).
CREATE OR REPLACE FUNCTION public.make_payment_reference(p_account_number text, p_sequence bigint, p_at timestamptz)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO ''
AS $$
  SELECT right(lpad(regexp_replace(COALESCE(p_account_number, ''), '\D', '', 'g'), 10, '0'), 10)
      || to_char(p_at AT TIME ZONE 'Asia/Manila', 'YYMM')
      || lpad((p_sequence % 1000000)::text, 6, '0');
$$;

CREATE OR REPLACE FUNCTION public.prepare_bill()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
SET row_security TO 'off'
AS $$
DECLARE
  acct text;
BEGIN
  IF NEW.sequence_no IS NULL THEN NEW.sequence_no := nextval('public.bill_sequence_seq'); END IF;
  IF NEW.payment_reference IS NULL THEN
    SELECT account_number INTO acct FROM public.customer_accounts WHERE id = NEW.customer_account_id;
    NEW.payment_reference := public.make_payment_reference(acct, NEW.sequence_no, COALESCE(NEW.created_at, now()));
  END IF;
  IF NEW.cutoff_date IS NULL AND NEW.due_date IS NOT NULL THEN NEW.cutoff_date := NEW.due_date + 1; END IF;
  -- kWh from the readings when both are given.
  IF NEW.present_reading IS NOT NULL AND NEW.previous_reading IS NOT NULL AND NEW.consumption_kwh IS NULL THEN
    NEW.consumption_kwh := (NEW.present_reading - NEW.previous_reading) * NEW.multiplier;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.prepare_bill() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS electricity_bills_prepare ON public.electricity_bills;
CREATE TRIGGER electricity_bills_prepare BEFORE INSERT ON public.electricity_bills
  FOR EACH ROW EXECUTE FUNCTION public.prepare_bill();

-- Existing bills get a sequence number and payment reference too.
UPDATE public.electricity_bills b
SET sequence_no = nextval('public.bill_sequence_seq')
WHERE sequence_no IS NULL;
UPDATE public.electricity_bills b
SET payment_reference = public.make_payment_reference(ca.account_number, b.sequence_no, b.created_at),
    cutoff_date = COALESCE(b.cutoff_date, b.due_date + 1)
FROM public.customer_accounts ca
WHERE ca.id = b.customer_account_id AND b.payment_reference IS NULL;

-- ---------------------------------------------------------------- full rate schedule
ALTER TABLE public.electricity_rates
  ADD COLUMN IF NOT EXISTS schedule jsonb,
  ADD COLUMN IF NOT EXISTS surcharge_percent numeric(5, 2) NOT NULL DEFAULT 5;
ALTER TABLE public.electricity_rates DROP CONSTRAINT IF EXISTS electricity_rates_schedule_array;
ALTER TABLE public.electricity_rates ADD CONSTRAINT electricity_rates_schedule_array CHECK (schedule IS NULL OR jsonb_typeof(schedule) = 'array');
ALTER TABLE public.electricity_rates DROP CONSTRAINT IF EXISTS electricity_rates_surcharge_range;
ALTER TABLE public.electricity_rates ADD CONSTRAINT electricity_rates_surcharge_range CHECK (surcharge_percent >= 0 AND surcharge_percent <= 50);

-- Clean a schedule: [{group, name, rate, per: 'kwh'|'month'}], max 40 lines.
CREATE OR REPLACE FUNCTION public.clean_rate_schedule(p_schedule jsonb)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO ''
AS $$
DECLARE
  line jsonb;
  result jsonb := '[]'::jsonb;
  r numeric;
BEGIN
  IF p_schedule IS NULL OR jsonb_typeof(p_schedule) <> 'array' THEN RETURN NULL; END IF;
  FOR line IN SELECT value FROM jsonb_array_elements(p_schedule) LIMIT 40 LOOP
    r := public.try_numeric(line ->> 'rate');
    CONTINUE WHEN r IS NULL OR btrim(COALESCE(line ->> 'name', '')) = '';
    result := result || jsonb_build_array(jsonb_build_object(
      'group', left(btrim(COALESCE(NULLIF(line ->> 'group', ''), 'OTHERS')), 40),
      'name', left(btrim(line ->> 'name'), 60),
      'rate', round(r, 4),
      'per', CASE WHEN line ->> 'per' = 'month' THEN 'month' ELSE 'kwh' END));
  END LOOP;
  RETURN CASE WHEN jsonb_array_length(result) = 0 THEN NULL ELSE result END;
END;
$$;

DROP FUNCTION IF EXISTS public.set_electricity_rate(text, numeric, numeric, jsonb, date, text);
CREATE OR REPLACE FUNCTION public.set_electricity_rate(
  p_customer_class text, p_rate_per_kwh numeric DEFAULT NULL, p_fixed_charge numeric DEFAULT 0,
  p_components jsonb DEFAULT NULL, p_effective_from date DEFAULT NULL, p_note text DEFAULT NULL,
  p_schedule jsonb DEFAULT NULL, p_surcharge_percent numeric DEFAULT 5)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  new_id uuid;
  comps jsonb;
  sched jsonb := public.clean_rate_schedule(p_schedule);
  per_kwh numeric := p_rate_per_kwh;
  fixed numeric := COALESCE(p_fixed_charge, 0);
  k text;
  v jsonb;
BEGIN
  IF NOT public.is_omeco_admin() OR NOT public.staff_can('bills') THEN
    RAISE EXCEPTION 'Only billing staff or supervisors can change electricity rates.';
  END IF;
  IF sched IS NOT NULL THEN
    -- The schedule decides the totals.
    SELECT COALESCE(sum((l ->> 'rate')::numeric) FILTER (WHERE l ->> 'per' = 'kwh'), 0),
           COALESCE(sum((l ->> 'rate')::numeric) FILTER (WHERE l ->> 'per' = 'month'), 0)
    INTO per_kwh, fixed
    FROM jsonb_array_elements(sched) l;
  END IF;
  IF per_kwh IS NULL OR per_kwh <= 0 OR per_kwh >= 1000 THEN
    RAISE EXCEPTION 'Rate per kWh must be more than ₱0 and less than ₱1,000.';
  END IF;
  IF p_surcharge_percent IS NULL OR p_surcharge_percent < 0 OR p_surcharge_percent > 50 THEN
    RAISE EXCEPTION 'Surcharge must be between 0%% and 50%%.';
  END IF;
  IF sched IS NULL AND p_components IS NOT NULL AND jsonb_typeof(p_components) = 'object' THEN
    comps := '{}'::jsonb;
    FOR k, v IN SELECT key, value FROM jsonb_each(p_components) LOOP
      IF jsonb_typeof(v) = 'number' AND k ~ '^[a-z_]{2,30}$' THEN comps := comps || jsonb_build_object(k, v); END IF;
    END LOOP;
    IF comps = '{}'::jsonb THEN comps := NULL; END IF;
  END IF;

  INSERT INTO public.electricity_rates (customer_class, rate_per_kwh, fixed_charge, components, schedule, surcharge_percent, effective_from, note, created_by)
  VALUES (COALESCE(NULLIF(btrim(p_customer_class), ''), 'residential'), round(per_kwh, 4), round(fixed, 2), comps, sched, p_surcharge_percent,
          COALESCE(p_effective_from, (now() AT TIME ZONE 'Asia/Manila')::date), NULLIF(left(btrim(COALESCE(p_note, '')), 300), ''),
          (SELECT id FROM public.users WHERE id = (SELECT auth.uid())))
  RETURNING id INTO new_id;

  PERFORM public.write_audit_log('rate.set', 'electricity_rates', new_id::text,
    jsonb_build_object('area', p_customer_class, 'to', '₱' || round(per_kwh, 4) || '/kWh',
                       'reason', NULLIF(btrim(COALESCE(p_note, '')), '')));
  RETURN jsonb_build_object('id', new_id, 'rate_per_kwh', round(per_kwh, 4), 'fixed_charge', round(fixed, 2));
END;
$$;
REVOKE ALL ON FUNCTION public.set_electricity_rate(text, numeric, numeric, jsonb, date, text, jsonb, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_electricity_rate(text, numeric, numeric, jsonb, date, text, jsonb, numeric) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_current_rates()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT COALESCE(jsonb_agg(to_jsonb(r) - 'created_by' ORDER BY r.customer_class), '[]'::jsonb)
  FROM (
    SELECT DISTINCT ON (customer_class) id, customer_class, rate_per_kwh, fixed_charge, components, schedule, surcharge_percent,
           effective_from, note, created_at
    FROM public.electricity_rates
    WHERE effective_from <= (now() AT TIME ZONE 'Asia/Manila')::date
    ORDER BY customer_class, effective_from DESC, created_at DESC
  ) r;
$$;

-- Price a kWh amount with the schedule in effect on a date (rates are public).
CREATE OR REPLACE FUNCTION public.compute_bill(p_kwh numeric, p_customer_class text DEFAULT 'residential', p_on date DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  r public.electricity_rates%ROWTYPE;
  lines jsonb := '[]'::jsonb;
  line jsonb;
  amt numeric;
  total numeric := 0;
  kwh numeric := GREATEST(COALESCE(p_kwh, 0), 0);
BEGIN
  SELECT * INTO r FROM public.electricity_rates
  WHERE customer_class = COALESCE(NULLIF(p_customer_class, ''), 'residential')
    AND effective_from <= COALESCE(p_on, (now() AT TIME ZONE 'Asia/Manila')::date)
  ORDER BY effective_from DESC, created_at DESC LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'No electricity rate is published for this customer type yet.'; END IF;

  IF r.schedule IS NOT NULL THEN
    FOR line IN SELECT value FROM jsonb_array_elements(r.schedule) LOOP
      amt := round(CASE WHEN line ->> 'per' = 'month' THEN (line ->> 'rate')::numeric ELSE kwh * (line ->> 'rate')::numeric END, 2);
      total := total + amt;
      lines := lines || jsonb_build_array(line || jsonb_build_object('amount', amt));
    END LOOP;
  ELSE
    amt := round(kwh * r.rate_per_kwh, 2);
    total := amt;
    lines := jsonb_build_array(jsonb_build_object('group', 'CHARGES', 'name', 'Energy charge', 'rate', r.rate_per_kwh, 'per', 'kwh', 'amount', amt));
    IF r.fixed_charge > 0 THEN
      total := total + r.fixed_charge;
      lines := lines || jsonb_build_array(jsonb_build_object('group', 'CHARGES', 'name', 'Fixed monthly charge', 'rate', r.fixed_charge, 'per', 'month', 'amount', r.fixed_charge));
    END IF;
  END IF;

  RETURN jsonb_build_object('rate_id', r.id, 'customer_class', r.customer_class, 'effective_from', r.effective_from,
    'kwh', kwh, 'lines', lines, 'total', round(total, 2), 'surcharge_percent', r.surcharge_percent);
END;
$$;
REVOKE ALL ON FUNCTION public.compute_bill(numeric, text, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.compute_bill(numeric, text, date) TO anon, authenticated;

-- ---------------------------------------------------------------- the statement
CREATE OR REPLACE FUNCTION public.get_statement(p_bill_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
SET row_security TO 'off'
AS $$
DECLARE
  b public.electricity_bills%ROWTYPE;
  ca public.customer_accounts%ROWTYPE;
  u public.users%ROWTYPE;
  me uuid := (SELECT auth.uid());
  pay jsonb;
BEGIN
  SELECT * INTO b FROM public.electricity_bills WHERE id = p_bill_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Statement not found.'; END IF;
  SELECT * INTO ca FROM public.customer_accounts WHERE id = b.customer_account_id;
  IF NOT (public.is_omeco_admin() OR (ca.user_id = me AND ca.verification_status = 'verified')) THEN
    RAISE EXCEPTION 'Statement not found.';
  END IF;
  SELECT * INTO u FROM public.users WHERE id = ca.user_id;
  SELECT jsonb_build_object('method', p.payment_method, 'reference', p.reference_number, 'amount', p.amount, 'paid_at', p.payment_date)
  INTO pay FROM public.payments p
  WHERE p.customer_account_id = ca.id AND p.status = 'paid'
    AND (p.reference_number = b.payment_reference OR p.payment_date >= b.created_at)
  ORDER BY p.payment_date DESC LIMIT 1;

  RETURN jsonb_build_object(
    'header', (SELECT value FROM public.app_settings WHERE key = 'statement_header'),
    'account', jsonb_build_object(
      'account_number', ca.account_number, 'name', u.full_name,
      'address', COALESCE(ca.service_address, NULLIF(concat_ws(', ', u.barangay, u.municipality), '')),
      'meter_serial', ca.meter_number, 'customer_type', ca.customer_type, 'service_area', ca.service_area),
    'bill', jsonb_build_object(
      'id', b.id, 'billing_month', b.billing_month, 'sequence_no', b.sequence_no, 'reading_date', b.reading_date,
      'period_from', b.period_from, 'period_to', b.period_to,
      'present_reading', b.present_reading, 'previous_reading', b.previous_reading, 'multiplier', b.multiplier,
      'kwh', b.consumption_kwh, 'line_items', b.line_items, 'charges', b.charges,
      'current_amount', b.total_amount, 'outstanding', b.outstanding_balance,
      'surcharge', round(COALESCE(b.total_amount, 0) * b.surcharge_rate, 2), 'surcharge_rate', b.surcharge_rate,
      'due_date', b.due_date, 'cutoff_date', b.cutoff_date, 'status', b.status,
      'payment_reference', b.payment_reference, 'created_at', b.created_at),
    'payment', pay,
    'generated_at', now());
END;
$$;
REVOKE ALL ON FUNCTION public.get_statement(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_statement(uuid) TO authenticated;

-- Applied as "phase21b_percent_of_group_lines": schedule lines may be per = 'pct' with of = '<GROUP>'
-- (e.g. VAT on Distribution = 12% of all DISTRIBUTION lines). clean_rate_schedule(), compute_bill()
-- and set_electricity_rate() were updated accordingly (see the live database for the final bodies).
