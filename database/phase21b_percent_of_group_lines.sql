-- Phase 21b: rate schedule lines can be a percentage of another group's total
-- (e.g. VAT on Distribution = 12% of all DISTRIBUTION lines): per = 'pct', of = '<GROUP>'.
-- Run after phase21_statement_of_account.sql.

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
  per text;
BEGIN
  IF p_schedule IS NULL OR jsonb_typeof(p_schedule) <> 'array' THEN RETURN NULL; END IF;
  FOR line IN SELECT value FROM jsonb_array_elements(p_schedule) LIMIT 40 LOOP
    r := public.try_numeric(line ->> 'rate');
    CONTINUE WHEN r IS NULL OR btrim(COALESCE(line ->> 'name', '')) = '';
    per := CASE WHEN line ->> 'per' IN ('month', 'pct') THEN line ->> 'per' ELSE 'kwh' END;
    CONTINUE WHEN per = 'pct' AND (btrim(COALESCE(line ->> 'of', '')) = '' OR r > 1 OR r < 0);
    result := result || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
      'group', left(upper(btrim(COALESCE(NULLIF(line ->> 'group', ''), 'OTHERS'))), 40),
      'name', left(btrim(line ->> 'name'), 60),
      'rate', round(r, 4),
      'per', per,
      'of', CASE WHEN per = 'pct' THEN left(upper(btrim(line ->> 'of')), 40) END)));
  END LOOP;
  RETURN CASE WHEN jsonb_array_length(result) = 0 THEN NULL ELSE result END;
END;
$$;

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
  group_sums jsonb := '{}'::jsonb;
  g text;
BEGIN
  SELECT * INTO r FROM public.electricity_rates
  WHERE customer_class = COALESCE(NULLIF(p_customer_class, ''), 'residential')
    AND effective_from <= COALESCE(p_on, (now() AT TIME ZONE 'Asia/Manila')::date)
  ORDER BY effective_from DESC, created_at DESC LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'No electricity rate is published for this customer type yet.'; END IF;

  IF r.schedule IS NOT NULL THEN
    -- 1) per kWh and per month lines; remember each group's total
    FOR line IN SELECT value FROM jsonb_array_elements(r.schedule) LOOP
      CONTINUE WHEN line ->> 'per' = 'pct';
      amt := round(CASE WHEN line ->> 'per' = 'month' THEN (line ->> 'rate')::numeric ELSE kwh * (line ->> 'rate')::numeric END, 2);
      g := line ->> 'group';
      group_sums := group_sums || jsonb_build_object(g, COALESCE((group_sums ->> g)::numeric, 0) + amt);
    END LOOP;
    -- 2) every line in schedule order, percentages use the group totals
    FOR line IN SELECT value FROM jsonb_array_elements(r.schedule) LOOP
      amt := round(CASE line ->> 'per'
        WHEN 'month' THEN (line ->> 'rate')::numeric
        WHEN 'pct' THEN COALESCE((group_sums ->> (line ->> 'of'))::numeric, 0) * (line ->> 'rate')::numeric
        ELSE kwh * (line ->> 'rate')::numeric END, 2);
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
-- set_electricity_rate() keeps the phase 21 body (per-kWh total = sum of 'kwh' lines,
-- fixed charge = sum of 'month' lines; 'pct' lines are priced by compute_bill()).
