-- OMECOnnect: OMECO service coverage (Occidental Mindoro) and customer location.
-- Run after phase6_authenticator_app_2fa.sql.
--
-- 1. service_areas: every municipality + barangay OMECO serves (139 barangays, 9 municipalities).
--    Public reference data: the sign-up form reads it before the customer logs in.
-- 2. users.municipality / users.barangay: the customer's location, chosen at sign-up
--    from the list above (enforced by a foreign key, so typos are impossible).
-- 3. Admins can list and filter customers by location (existing RLS: is_omeco_admin()).

CREATE TABLE IF NOT EXISTS public.service_areas (
  municipality   TEXT NOT NULL,
  barangay       TEXT NOT NULL,
  municipality_order INTEGER NOT NULL,
  barangay_order INTEGER NOT NULL,
  PRIMARY KEY (municipality, barangay)
);

INSERT INTO public.service_areas (municipality, barangay, municipality_order, barangay_order) VALUES
  ('Abra de Ilog', 'Armado', 1, 1),
  ('Abra de Ilog', 'Balao', 1, 2),
  ('Abra de Ilog', 'Cabacao', 1, 3),
  ('Abra de Ilog', 'Lumangbayan', 1, 4),
  ('Abra de Ilog', 'Poblacion', 1, 5),
  ('Abra de Ilog', 'San Vicente', 1, 6),
  ('Abra de Ilog', 'Santa Maria', 1, 7),
  ('Abra de Ilog', 'Tibag', 1, 8),
  ('Abra de Ilog', 'Udalo', 1, 9),
  ('Abra de Ilog', 'Wawa', 1, 10),
  ('Mamburao', 'Balansay', 2, 1),
  ('Mamburao', 'Fatima', 2, 2),
  ('Mamburao', 'Payompon', 2, 3),
  ('Mamburao', 'San Luis', 2, 4),
  ('Mamburao', 'Talabaan', 2, 5),
  ('Mamburao', 'Tangkalan', 2, 6),
  ('Mamburao', 'Tayamaan', 2, 7),
  ('Mamburao', 'Poblacion 1', 2, 8),
  ('Mamburao', 'Poblacion 2', 2, 9),
  ('Mamburao', 'Poblacion 3', 2, 10),
  ('Mamburao', 'Poblacion 4', 2, 11),
  ('Mamburao', 'Poblacion 5', 2, 12),
  ('Mamburao', 'Poblacion 6', 2, 13),
  ('Mamburao', 'Poblacion 7', 2, 14),
  ('Mamburao', 'Poblacion 8', 2, 15),
  ('Paluan', 'Alipaoy', 3, 1),
  ('Paluan', 'Bagong Silang Poblacion', 3, 2),
  ('Paluan', 'Handang Tumulong Poblacion', 3, 3),
  ('Paluan', 'Harrison', 3, 4),
  ('Paluan', 'Lumangbayan', 3, 5),
  ('Paluan', 'Mananao', 3, 6),
  ('Paluan', 'Mapalad Poblacion', 3, 7),
  ('Paluan', 'Marikit', 3, 8),
  ('Paluan', 'Pag-asa ng Bayan Poblacion', 3, 9),
  ('Paluan', 'San Jose Poblacion', 3, 10),
  ('Paluan', 'Silahis ng Pag-asa Poblacion', 3, 11),
  ('Paluan', 'Tubili', 3, 12),
  ('Santa Cruz', 'Alacaak', 4, 1),
  ('Santa Cruz', 'Barahan', 4, 2),
  ('Santa Cruz', 'Casague', 4, 3),
  ('Santa Cruz', 'Dayap', 4, 4),
  ('Santa Cruz', 'Kurtinganan', 4, 5),
  ('Santa Cruz', 'Lumangbayan', 4, 6),
  ('Santa Cruz', 'Mulawin', 4, 7),
  ('Santa Cruz', 'Pinagturilan', 4, 8),
  ('Santa Cruz', 'Poblacion I', 4, 9),
  ('Santa Cruz', 'Poblacion II', 4, 10),
  ('Santa Cruz', 'San Vicente', 4, 11),
  ('Sablayan', 'Batong Buhay', 5, 1),
  ('Sablayan', 'Buenavista', 5, 2),
  ('Sablayan', 'Burgos', 5, 3),
  ('Sablayan', 'Claudio Salgado', 5, 4),
  ('Sablayan', 'General Emilio Aguinaldo', 5, 5),
  ('Sablayan', 'Ibud', 5, 6),
  ('Sablayan', 'Ilvita', 5, 7),
  ('Sablayan', 'Lagnas', 5, 8),
  ('Sablayan', 'Ligaya', 5, 9),
  ('Sablayan', 'Malisbong', 5, 10),
  ('Sablayan', 'Paetan', 5, 11),
  ('Sablayan', 'Pag-asa', 5, 12),
  ('Sablayan', 'Poblacion', 5, 13),
  ('Sablayan', 'San Agustin', 5, 14),
  ('Sablayan', 'San Francisco', 5, 15),
  ('Sablayan', 'San Nicolas', 5, 16),
  ('Sablayan', 'San Vicente', 5, 17),
  ('Sablayan', 'Santa Lucia', 5, 18),
  ('Sablayan', 'Santo Niño', 5, 19),
  ('Sablayan', 'Tagumpay', 5, 20),
  ('Sablayan', 'Tuban', 5, 21),
  ('Sablayan', 'Victoria', 5, 22),
  ('Calintaan', 'Concepcion', 6, 1),
  ('Calintaan', 'Iriron', 6, 2),
  ('Calintaan', 'Malpalon', 6, 3),
  ('Calintaan', 'New Dagupan', 6, 4),
  ('Calintaan', 'Poblacion', 6, 5),
  ('Calintaan', 'Poypoy', 6, 6),
  ('Calintaan', 'Tanyag', 6, 7),
  ('Rizal', 'Adela', 7, 1),
  ('Rizal', 'Aguas', 7, 2),
  ('Rizal', 'Magsikap', 7, 3),
  ('Rizal', 'Malawaan', 7, 4),
  ('Rizal', 'Manoot', 7, 5),
  ('Rizal', 'Pitogo', 7, 6),
  ('Rizal', 'Rizal', 7, 7),
  ('Rizal', 'Rumbang', 7, 8),
  ('Rizal', 'Salvacion', 7, 9),
  ('Rizal', 'San Pedro', 7, 10),
  ('Rizal', 'Santo Niño', 7, 11),
  ('San Jose', 'Ambulong', 8, 1),
  ('San Jose', 'Ansiray', 8, 2),
  ('San Jose', 'Bagong Sikat', 8, 3),
  ('San Jose', 'Bangkal', 8, 4),
  ('San Jose', 'Barangay 1', 8, 5),
  ('San Jose', 'Barangay 2', 8, 6),
  ('San Jose', 'Barangay 3', 8, 7),
  ('San Jose', 'Barangay 4', 8, 8),
  ('San Jose', 'Barangay 5', 8, 9),
  ('San Jose', 'Barangay 6', 8, 10),
  ('San Jose', 'Barangay 7', 8, 11),
  ('San Jose', 'Barangay 8', 8, 12),
  ('San Jose', 'Batasan', 8, 13),
  ('San Jose', 'Bayotbot', 8, 14),
  ('San Jose', 'Bubog', 8, 15),
  ('San Jose', 'Buri', 8, 16),
  ('San Jose', 'Camburay', 8, 17),
  ('San Jose', 'Caminawit', 8, 18),
  ('San Jose', 'Catayungan', 8, 19),
  ('San Jose', 'Central', 8, 20),
  ('San Jose', 'Iling Proper', 8, 21),
  ('San Jose', 'Inasakan', 8, 22),
  ('San Jose', 'Ipil', 8, 23),
  ('San Jose', 'La Curva', 8, 24),
  ('San Jose', 'Labangan Iling', 8, 25),
  ('San Jose', 'Labangan Poblacion', 8, 26),
  ('San Jose', 'Mabini', 8, 27),
  ('San Jose', 'Magbay', 8, 28),
  ('San Jose', 'Mangarin', 8, 29),
  ('San Jose', 'Mapaya', 8, 30),
  ('San Jose', 'Monte Claro', 8, 31),
  ('San Jose', 'Murtha', 8, 32),
  ('San Jose', 'Naibuan', 8, 33),
  ('San Jose', 'Natandol', 8, 34),
  ('San Jose', 'Pag-asa', 8, 35),
  ('San Jose', 'Pawican', 8, 36),
  ('San Jose', 'San Agustin', 8, 37),
  ('San Jose', 'San Isidro', 8, 38),
  ('San Jose', 'San Roque', 8, 39),
  ('Magsaysay', 'Alibog', 9, 1),
  ('Magsaysay', 'Caguray', 9, 2),
  ('Magsaysay', 'Calawag', 9, 3),
  ('Magsaysay', 'Gapasan', 9, 4),
  ('Magsaysay', 'Laste', 9, 5),
  ('Magsaysay', 'Lourdes', 9, 6),
  ('Magsaysay', 'Nicolas (Bulo)', 9, 7),
  ('Magsaysay', 'Paclolo', 9, 8),
  ('Magsaysay', 'Poblacion', 9, 9),
  ('Magsaysay', 'Purnaga', 9, 10),
  ('Magsaysay', 'Santa Teresa', 9, 11),
  ('Magsaysay', 'Sibalat', 9, 12)
ON CONFLICT (municipality, barangay) DO UPDATE
  SET municipality_order = EXCLUDED.municipality_order,
      barangay_order = EXCLUDED.barangay_order;

ALTER TABLE public.service_areas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can read the service coverage list" ON public.service_areas;
CREATE POLICY "Anyone can read the service coverage list"
  ON public.service_areas FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "Admins can manage the service coverage list" ON public.service_areas;
CREATE POLICY "Admins can manage the service coverage list"
  ON public.service_areas FOR ALL TO authenticated
  USING (public.is_omeco_admin()) WITH CHECK (public.is_omeco_admin());
REVOKE ALL ON public.service_areas FROM anon, authenticated;
GRANT SELECT ON public.service_areas TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.service_areas TO authenticated;

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS municipality TEXT,
  ADD COLUMN IF NOT EXISTS barangay TEXT;

ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_location_fkey;
ALTER TABLE public.users
  ADD CONSTRAINT users_location_fkey
  FOREIGN KEY (municipality, barangay)
  REFERENCES public.service_areas (municipality, barangay)
  ON UPDATE CASCADE;

-- Both or neither: a barangay always belongs to a municipality.
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_location_complete;
ALTER TABLE public.users
  ADD CONSTRAINT users_location_complete
  CHECK ((municipality IS NULL) = (barangay IS NULL));

CREATE INDEX IF NOT EXISTS users_location_idx ON public.users (municipality, barangay);

-- Customers may set or correct their own location (other columns stay locked).
GRANT UPDATE (municipality, barangay) ON public.users TO authenticated;

-- New accounts: copy the location chosen on the sign-up form, if it is valid.
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  user_phone TEXT := NULLIF(NEW.phone, '');
  chosen_municipality TEXT := NULLIF(NEW.raw_user_meta_data ->> 'municipality', '');
  chosen_barangay TEXT := NULLIF(NEW.raw_user_meta_data ->> 'barangay', '');
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.service_areas AS sa
    WHERE sa.municipality = chosen_municipality AND sa.barangay = chosen_barangay
  ) THEN
    chosen_municipality := NULL;
    chosen_barangay := NULL;
  END IF;

  INSERT INTO public.users (id, full_name, email, mobile_number, role, is_verified, municipality, barangay)
  VALUES (
    NEW.id,
    COALESCE(
      NULLIF(NEW.raw_user_meta_data ->> 'full_name', ''),
      NULLIF(NEW.raw_user_meta_data ->> 'name', ''),
      NEW.email,
      CASE WHEN user_phone IS NOT NULL THEN '+' || ltrim(user_phone, '+') END,
      'Customer'
    ),
    NULLIF(NEW.email, ''),
    COALESCE(
      NULLIF(NEW.raw_user_meta_data ->> 'mobile_number', ''),
      CASE WHEN user_phone IS NOT NULL THEN '+' || ltrim(user_phone, '+') END
    ),
    'customer',
    FALSE,
    chosen_municipality,
    chosen_barangay
  )
  ON CONFLICT (id) DO UPDATE
    SET email = EXCLUDED.email,
        full_name = EXCLUDED.full_name,
        mobile_number = EXCLUDED.mobile_number,
        municipality = COALESCE(EXCLUDED.municipality, public.users.municipality),
        barangay = COALESCE(EXCLUDED.barangay, public.users.barangay);

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.handle_new_auth_user() FROM PUBLIC, anon, authenticated;
