BEGIN;

-- Keep parser available for text-based numeric inputs (budgets and defensive casts).
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

-- Legacy artifacts (table + refresh function) are intentionally removed.
DROP FUNCTION IF EXISTS public.refresh_lineas_resumen(integer);
DROP TABLE IF EXISTS public.lineas_resumen;

CREATE OR REPLACE VIEW public.vw_lineas_resumen_mensual AS
WITH primas_base AS (
  SELECT
    2024::integer AS anio,
    CASE WHEN "Periodo" BETWEEN 1 AND 12 THEN "Periodo"::integer ELSE NULL END AS periodo,
    COALESCE(NULLIF(trim("LBussinesNombre"), ''), 'Sin línea') AS linea,
    public.parse_budget_text("PrimaNeta"::text) AS prima_neta,
    public.parse_budget_text("Descuento"::text) AS descuento,
    COALESCE(NULLIF(public.parse_budget_text("TCPago"::text), 0), 1) AS tc_pago
  FROM public."Efectuada 2024"

  UNION ALL

  SELECT
    2025::integer AS anio,
    CASE WHEN "Periodo" BETWEEN 1 AND 12 THEN "Periodo"::integer ELSE NULL END AS periodo,
    COALESCE(NULLIF(trim("LBussinesNombre"), ''), 'Sin línea') AS linea,
    public.parse_budget_text("PrimaNeta"::text) AS prima_neta,
    public.parse_budget_text("Descuento"::text) AS descuento,
    COALESCE(NULLIF(public.parse_budget_text("TCPago"::text), 0), 1) AS tc_pago
  FROM public."Efectuada 2025"

  UNION ALL

  SELECT
    2026::integer AS anio,
    COALESCE(
      CASE
        WHEN trim(COALESCE("FLiquidacion"::text, '')) ~ '^\d{1,2}/\d{1,2}(/\d{2,4})?$'
          THEN split_part(trim("FLiquidacion"::text), '/', 1)::integer
        WHEN trim(COALESCE("FLiquidacion"::text, '')) ~ '^\d{4}-\d{1,2}-\d{1,2}$'
          THEN EXTRACT(month FROM trim("FLiquidacion"::text)::date)::integer
        ELSE NULL
      END,
      CASE WHEN "Periodo" BETWEEN 1 AND 12 THEN "Periodo"::integer ELSE NULL END
    ) AS periodo,
    COALESCE(NULLIF(trim("LBussinesNombre"), ''), 'Sin línea') AS linea,
    public.parse_budget_text("PrimaNeta"::text) AS prima_neta,
    public.parse_budget_text("Descuento"::text) AS descuento,
    COALESCE(NULLIF(public.parse_budget_text("TCPago"::text), 0), 1) AS tc_pago
  FROM public.efectuada_2026_drive
),
primas_agg AS (
  SELECT
    anio,
    periodo,
    linea,
    SUM((COALESCE(prima_neta, 0) - COALESCE(descuento, 0)) * COALESCE(NULLIF(tc_pago, 0), 1)) AS prima_neta
  FROM primas_base
  WHERE periodo BETWEEN 1 AND 12
  GROUP BY 1, 2, 3
),
presupuesto_base AS (
  SELECT
    2024::integer AS anio,
    EXTRACT(month FROM "Fecha"::date)::integer AS periodo,
    COALESCE(NULLIF(trim("LBussinesNombre"), ''), 'Sin línea') AS linea,
    public.parse_budget_text("Presupuesto") AS presupuesto
  FROM public."Presupuestos 2024"

  UNION ALL

  SELECT
    2025::integer AS anio,
    EXTRACT(month FROM "Fecha"::date)::integer AS periodo,
    COALESCE(NULLIF(trim("LBussinesNombre"), ''), 'Sin línea') AS linea,
    public.parse_budget_text("Presupuesto") AS presupuesto
  FROM public."Presupuestos 2025"

  UNION ALL

  SELECT
    2026::integer AS anio,
    EXTRACT(month FROM "Fecha"::date)::integer AS periodo,
    COALESCE(NULLIF(trim("LBussinesNombre"), ''), 'Sin línea') AS linea,
    public.parse_budget_text("Presupuesto") AS presupuesto
  FROM public."Presupuestos 2026"
),
presupuesto_agg AS (
  SELECT
    anio,
    periodo,
    linea,
    SUM(COALESCE(presupuesto, 0)) AS presupuesto
  FROM presupuesto_base
  WHERE periodo BETWEEN 1 AND 12
  GROUP BY 1, 2, 3
),
pendiente_agg AS (
  SELECT
    EXTRACT(year FROM now())::integer AS anio,
    CASE WHEN "Periodo" BETWEEN 1 AND 12 THEN "Periodo"::integer ELSE NULL END AS periodo,
    COALESCE(NULLIF(trim("LBussinesNombre"), ''), 'Sin línea') AS linea,
    SUM(public.parse_budget_text("PrimaNeta"::text)) AS pendiente
  FROM public."Pendiente"
  WHERE "Periodo" BETWEEN 1 AND 12
  GROUP BY 1, 2, 3
),
unioned AS (
  SELECT anio, periodo, linea, prima_neta, 0::numeric AS presupuesto, 0::numeric AS pendiente FROM primas_agg
  UNION ALL
  SELECT anio, periodo, linea, 0::numeric AS prima_neta, presupuesto, 0::numeric AS pendiente FROM presupuesto_agg
  UNION ALL
  SELECT anio, periodo, linea, 0::numeric AS prima_neta, 0::numeric AS presupuesto, pendiente FROM pendiente_agg
)
SELECT
  anio,
  periodo,
  linea,
  SUM(prima_neta)::numeric AS prima_neta,
  SUM(presupuesto)::numeric AS presupuesto,
  SUM(pendiente)::numeric AS pendiente,
  now() AS updated_at
FROM unioned
WHERE periodo BETWEEN 1 AND 12
GROUP BY anio, periodo, linea;

GRANT SELECT ON public.vw_lineas_resumen_mensual TO anon, authenticated, service_role;

COMMIT;
