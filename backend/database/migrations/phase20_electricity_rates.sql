-- Phase 20: electricity rates set by OMECO staff, used by the customer
-- bill estimator (meter readings -> kWh -> estimated amount).
-- Every change is kept (history); the rate in effect is the newest one whose
-- effective date is today or earlier, per customer class.

CREATE TABLE IF NOT EXISTS public.electricity_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_class text NOT NULL DEFAULT 'residential',
  rate_per_kwh numeric(10, 4) NOT NULL,
  fixed_charge numeric(10, 2) NOT NULL DEFAULT 0,
  components jsonb,
  effective_from date NOT NULL DEFAULT ((now() AT TIME ZONE 'Asia/Manila')::date),
  note text,
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT electricity_rates_class_allowed CHECK (customer_class IN ('residential', 'commercial', 'industrial', 'public_building')),
  CONSTRAINT electricity_rates_rate_range CHECK (rate_per_kwh > 0 AND rate_per_kwh < 1000),
  CONSTRAINT electricity_rates_fixed_range CHECK (fixed_charge >= 0 AND fixed_charge < 100000),
  CONSTRAINT electricity_rates_components_object CHECK (components IS NULL OR jsonb_typeof(components) = 'object'),
  CONSTRAINT electricity_rates_note_length CHECK (note IS NULL OR char_length(note) <= 300)
);
CREATE INDEX IF NOT EXISTS electricity_rates_current_idx ON public.electricity_rates (customer_class, effective_from DESC, created_at DESC);

ALTER TABLE public.electricity_rates ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.electricity_rates FROM anon, authenticated;
GRANT SELECT ON public.electricity_rates TO anon, authenticated;
DROP POLICY IF EXISTS "Anyone can read electricity rates" ON public.electricity_rates;
CREATE POLICY "Anyone can read electricity rates" ON public.electricity_rates FOR SELECT TO anon, authenticated USING (true);
-- Writes only through set_electricity_rate() (billing staff / supervisors).

-- Current rate per class (public: rates are published information).
CREATE OR REPLACE FUNCTION public.get_current_rates()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT COALESCE(jsonb_agg(to_jsonb(r) - 'created_by' ORDER BY r.customer_class), '[]'::jsonb)
  FROM (
    SELECT DISTINCT ON (customer_class) id, customer_class, rate_per_kwh, fixed_charge, components, effective_from, note, created_at
    FROM public.electricity_rates
    WHERE effective_from <= (now() AT TIME ZONE 'Asia/Manila')::date
    ORDER BY customer_class, effective_from DESC, created_at DESC
  ) r;
$$;
REVOKE ALL ON FUNCTION public.get_current_rates() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_current_rates() TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.set_electricity_rate(
  p_customer_class text, p_rate_per_kwh numeric, p_fixed_charge numeric DEFAULT 0,
  p_components jsonb DEFAULT NULL, p_effective_from date DEFAULT NULL, p_note text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  new_id uuid;
  comps jsonb;
  k text;
  v jsonb;
BEGIN
  IF NOT public.is_omeco_admin() OR NOT public.staff_can('bills') THEN
    RAISE EXCEPTION 'Only billing staff or supervisors can change electricity rates.';
  END IF;
  IF p_rate_per_kwh IS NULL OR p_rate_per_kwh <= 0 OR p_rate_per_kwh >= 1000 THEN
    RAISE EXCEPTION 'Rate per kWh must be more than ₱0 and less than ₱1,000.';
  END IF;
  -- Keep only numeric breakdown items (₱ per kWh).
  IF p_components IS NOT NULL AND jsonb_typeof(p_components) = 'object' THEN
    comps := '{}'::jsonb;
    FOR k, v IN SELECT key, value FROM jsonb_each(p_components) LOOP
      IF jsonb_typeof(v) = 'number' AND k ~ '^[a-z_]{2,30}$' THEN comps := comps || jsonb_build_object(k, v); END IF;
    END LOOP;
    IF comps = '{}'::jsonb THEN comps := NULL; END IF;
  END IF;

  INSERT INTO public.electricity_rates (customer_class, rate_per_kwh, fixed_charge, components, effective_from, note, created_by)
  VALUES (COALESCE(NULLIF(btrim(p_customer_class), ''), 'residential'), round(p_rate_per_kwh, 4), round(COALESCE(p_fixed_charge, 0), 2), comps,
          COALESCE(p_effective_from, (now() AT TIME ZONE 'Asia/Manila')::date), NULLIF(left(btrim(COALESCE(p_note, '')), 300), ''),
          (SELECT id FROM public.users WHERE id = (SELECT auth.uid())))
  RETURNING id INTO new_id;

  PERFORM public.write_audit_log('rate.set', 'electricity_rates', new_id::text,
    jsonb_build_object('area', p_customer_class, 'to', '₱' || round(p_rate_per_kwh, 4) || '/kWh',
                       'reason', NULLIF(btrim(COALESCE(p_note, '')), '')));
  RETURN jsonb_build_object('id', new_id);
END;
$$;
REVOKE ALL ON FUNCTION public.set_electricity_rate(text, numeric, numeric, jsonb, date, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_electricity_rate(text, numeric, numeric, jsonb, date, text) TO authenticated;
