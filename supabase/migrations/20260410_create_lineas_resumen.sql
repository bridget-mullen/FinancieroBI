-- Pre-aggregated monthly summary by line for fast/stable dashboard totals.

BEGIN;

CREATE OR REPLACE FUNCTION public.parse_budget_text(input text)
RETURNS numeric
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  s text;
BEGIN
  s := COALESCE(input, '');
  s := regexp_replace(s, '[^0-9,.-]', '', 'g');

  IF s = '' OR s = '-' OR s = '.' THEN
    RETURN 0;
  END IF;

  IF position(',' in s) > 0 AND position('.' in s) > 0 THEN
    -- Typical input: 17,545.167 -> 17545.167
    s := replace(s, ',', '');
  ELSIF position(',' in s) > 0 AND position('.' in s) = 0 THEN
    -- Decimal comma fallback
    s := replace(s, ',', '.');
  END IF;

  RETURN COALESCE(s::numeric, 0);
EXCEPTION WHEN OTHERS THEN
  RETURN 0;
END;
$$;

CREATE TABLE IF NOT EXISTS public.lineas_resumen (
  anio integer NOT NULL,
  periodo integer NOT NULL CHECK (periodo BETWEEN 1 AND 12),
  linea text NOT NULL,
  prima_neta numeric NOT NULL DEFAULT 0,
  presupuesto numeric NOT NULL DEFAULT 0,
  pendiente numeric NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (anio, periodo, linea)
);

CREATE INDEX IF NOT EXISTS idx_lineas_resumen_anio_periodo ON public.lineas_resumen (anio, periodo);
CREATE INDEX IF NOT EXISTS idx_lineas_resumen_linea ON public.lineas_resumen (linea);

ALTER TABLE public.lineas_resumen DISABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.refresh_lineas_resumen(p_anio integer)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  eff_tbl text := format('Efectuada %s', p_anio);
  budget_tbl text := format('Presupuestos %s', p_anio);
  current_year integer := extract(year from now())::integer;
BEGIN
  IF to_regclass(format('public.%I', eff_tbl)) IS NULL THEN
    RAISE EXCEPTION 'Missing source table: %', eff_tbl;
  END IF;

  DELETE FROM public.lineas_resumen WHERE anio = p_anio;

  -- 1) Prima neta (current year table)
  EXECUTE format($sql$
    INSERT INTO public.lineas_resumen (anio, periodo, linea, prima_neta, presupuesto, pendiente, updated_at)
    SELECT
      %s::integer AS anio,
      "Periodo"::integer AS periodo,
      COALESCE(NULLIF(trim("LBussinesNombre"), ''), 'Sin línea') AS linea,
      SUM((COALESCE("PrimaNeta", 0)::numeric - COALESCE("Descuento", 0)::numeric)
          * COALESCE(NULLIF("TCPago"::numeric, 0), 1)) AS prima_neta,
      0::numeric AS presupuesto,
      0::numeric AS pendiente,
      now() AS updated_at
    FROM public.%I
    WHERE "Periodo" BETWEEN 1 AND 12
    GROUP BY 2, 3
    ON CONFLICT (anio, periodo, linea)
    DO UPDATE SET
      prima_neta = EXCLUDED.prima_neta,
      updated_at = now()
  $sql$, p_anio, eff_tbl);

  -- 2) Presupuesto (year-specific budget table, if present)
  IF to_regclass(format('public.%I', budget_tbl)) IS NOT NULL THEN
    EXECUTE format($sql$
      INSERT INTO public.lineas_resumen (anio, periodo, linea, prima_neta, presupuesto, pendiente, updated_at)
      SELECT
        %s::integer AS anio,
        EXTRACT(month FROM "Fecha"::date)::integer AS periodo,
        COALESCE(NULLIF(trim("LBussinesNombre"), ''), 'Sin línea') AS linea,
        0::numeric AS prima_neta,
        SUM(public.parse_budget_text("Presupuesto")) AS presupuesto,
        0::numeric AS pendiente,
        now() AS updated_at
      FROM public.%I
      WHERE EXTRACT(month FROM "Fecha"::date) BETWEEN 1 AND 12
      GROUP BY 2, 3
      ON CONFLICT (anio, periodo, linea)
      DO UPDATE SET
        presupuesto = EXCLUDED.presupuesto,
        updated_at = now()
    $sql$, p_anio, budget_tbl);
  END IF;

  -- 3) Pendiente table is operational backlog; only for current year.
  IF to_regclass('public."Pendiente"') IS NOT NULL THEN
    IF p_anio = current_year THEN
      EXECUTE format($sql$
        INSERT INTO public.lineas_resumen (anio, periodo, linea, prima_neta, presupuesto, pendiente, updated_at)
        SELECT
          %s::integer AS anio,
          "Periodo"::integer AS periodo,
          COALESCE(NULLIF(trim("LBussinesNombre"), ''), 'Sin línea') AS linea,
          0::numeric AS prima_neta,
          0::numeric AS presupuesto,
          SUM(COALESCE("PrimaNeta", 0)::numeric) AS pendiente,
          now() AS updated_at
        FROM public."Pendiente"
        WHERE "Periodo" BETWEEN 1 AND 12
        GROUP BY 2, 3
        ON CONFLICT (anio, periodo, linea)
        DO UPDATE SET
          pendiente = EXCLUDED.pendiente,
          updated_at = now()
      $sql$, p_anio);
    ELSE
      UPDATE public.lineas_resumen
      SET pendiente = 0,
          updated_at = now()
      WHERE anio = p_anio;
    END IF;
  END IF;

  RETURN (SELECT COUNT(*) FROM public.lineas_resumen WHERE anio = p_anio);
END;
$$;

REVOKE ALL ON FUNCTION public.refresh_lineas_resumen(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.refresh_lineas_resumen(integer) TO service_role;

GRANT SELECT ON public.lineas_resumen TO anon, authenticated, service_role;

COMMIT;
