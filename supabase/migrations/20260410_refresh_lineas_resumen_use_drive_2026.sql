BEGIN;

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
  -- Prefer curated drive import for 2026 when available.
  IF p_anio = 2026 AND to_regclass('public.efectuada_2026_drive') IS NOT NULL THEN
    eff_tbl := 'efectuada_2026_drive';
  END IF;

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

COMMIT;
