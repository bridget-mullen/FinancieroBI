-- Canonical ramos source for app queries.
-- Creates bi_dashboard.vw_ramos_prima with columns:
--   anio INT, periodo INT (1-12), ramo TEXT, prima_oficial NUMERIC, polizas BIGINT
--
-- Selection strategy (bi_dashboard ONLY):
-- 1) Prefer bi_dashboard.fact_primas when a ramo text column exists directly.
-- 2) Else, use bi_dashboard.fact_primas.ramo_id + bi_dashboard.dim_ramo.nombre.
-- 3) Else, fallback to bi_dashboard.fact_primas.linea_negocio as provisional ramo bucket.
--    (Still real bi_dashboard data; avoids dashboard_data dependency.)

DO $$
DECLARE
  ramo_col TEXT;
  linea_col TEXT;
  year_col TEXT;
  month_col TEXT;
  prima_col TEXT;
  has_dim_ramo BOOLEAN;
BEGIN
  SELECT column_name
  INTO year_col
  FROM information_schema.columns
  WHERE table_schema = 'bi_dashboard'
    AND table_name = 'fact_primas'
    AND column_name IN ('año', 'anio', 'year')
  ORDER BY CASE column_name WHEN 'año' THEN 1 WHEN 'anio' THEN 2 WHEN 'year' THEN 3 ELSE 99 END
  LIMIT 1;

  SELECT column_name
  INTO month_col
  FROM information_schema.columns
  WHERE table_schema = 'bi_dashboard'
    AND table_name = 'fact_primas'
    AND column_name IN ('mes', 'periodo', 'month')
  ORDER BY CASE column_name WHEN 'mes' THEN 1 WHEN 'periodo' THEN 2 WHEN 'month' THEN 3 ELSE 99 END
  LIMIT 1;

  SELECT column_name
  INTO prima_col
  FROM information_schema.columns
  WHERE table_schema = 'bi_dashboard'
    AND table_name = 'fact_primas'
    AND column_name IN ('prima_cobrada_calculada', 'prima_neta_cobrada', 'prima_neta')
  ORDER BY CASE column_name
    WHEN 'prima_cobrada_calculada' THEN 1
    WHEN 'prima_neta_cobrada' THEN 2
    WHEN 'prima_neta' THEN 3
    ELSE 99
  END
  LIMIT 1;

  SELECT column_name
  INTO ramo_col
  FROM information_schema.columns
  WHERE table_schema = 'bi_dashboard'
    AND table_name = 'fact_primas'
    AND column_name IN ('ramo', 'ramos_nombre', 'ramo_nombre', 'RamosNombre', 'dim_ramo')
  ORDER BY CASE column_name
    WHEN 'ramo' THEN 1
    WHEN 'ramos_nombre' THEN 2
    WHEN 'ramo_nombre' THEN 3
    WHEN 'RamosNombre' THEN 4
    WHEN 'dim_ramo' THEN 5
    ELSE 99
  END
  LIMIT 1;

  SELECT column_name
  INTO linea_col
  FROM information_schema.columns
  WHERE table_schema = 'bi_dashboard'
    AND table_name = 'fact_primas'
    AND column_name IN ('linea_negocio', 'linea', 'linea_de_negocio')
  ORDER BY CASE column_name
    WHEN 'linea_negocio' THEN 1
    WHEN 'linea' THEN 2
    WHEN 'linea_de_negocio' THEN 3
    ELSE 99
  END
  LIMIT 1;

  SELECT EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'bi_dashboard'
      AND table_name = 'dim_ramo'
  ) INTO has_dim_ramo;

  IF ramo_col IS NOT NULL AND year_col IS NOT NULL AND month_col IS NOT NULL AND prima_col IS NOT NULL THEN
    EXECUTE format($sql$
      CREATE OR REPLACE VIEW bi_dashboard.vw_ramos_prima AS
      SELECT
        %1$I::int AS anio,
        CASE
          WHEN lower(%2$I::text) IN ('enero','1') THEN 1
          WHEN lower(%2$I::text) IN ('febrero','2') THEN 2
          WHEN lower(%2$I::text) IN ('marzo','3') THEN 3
          WHEN lower(%2$I::text) IN ('abril','4') THEN 4
          WHEN lower(%2$I::text) IN ('mayo','5') THEN 5
          WHEN lower(%2$I::text) IN ('junio','6') THEN 6
          WHEN lower(%2$I::text) IN ('julio','7') THEN 7
          WHEN lower(%2$I::text) IN ('agosto','8') THEN 8
          WHEN lower(%2$I::text) IN ('septiembre','9') THEN 9
          WHEN lower(%2$I::text) IN ('octubre','10') THEN 10
          WHEN lower(%2$I::text) IN ('noviembre','11') THEN 11
          WHEN lower(%2$I::text) IN ('diciembre','12') THEN 12
          ELSE NULL
        END AS periodo,
        COALESCE(NULLIF(trim(%3$I::text), ''), 'Sin ramo') AS ramo,
        SUM(COALESCE(%4$I, 0))::numeric AS prima_oficial,
        COUNT(*)::bigint AS polizas
      FROM bi_dashboard.fact_primas
      GROUP BY 1,2,3;
    $sql$, year_col, month_col, ramo_col, prima_col);

  ELSIF EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'bi_dashboard'
        AND table_name = 'fact_primas'
        AND column_name = 'ramo_id'
    )
    AND has_dim_ramo
    AND year_col IS NOT NULL
    AND month_col IS NOT NULL
    AND prima_col IS NOT NULL THEN

    EXECUTE format($sql$
      CREATE OR REPLACE VIEW bi_dashboard.vw_ramos_prima AS
      SELECT
        fp.%1$I::int AS anio,
        CASE
          WHEN lower(fp.%2$I::text) IN ('enero','1') THEN 1
          WHEN lower(fp.%2$I::text) IN ('febrero','2') THEN 2
          WHEN lower(fp.%2$I::text) IN ('marzo','3') THEN 3
          WHEN lower(fp.%2$I::text) IN ('abril','4') THEN 4
          WHEN lower(fp.%2$I::text) IN ('mayo','5') THEN 5
          WHEN lower(fp.%2$I::text) IN ('junio','6') THEN 6
          WHEN lower(fp.%2$I::text) IN ('julio','7') THEN 7
          WHEN lower(fp.%2$I::text) IN ('agosto','8') THEN 8
          WHEN lower(fp.%2$I::text) IN ('septiembre','9') THEN 9
          WHEN lower(fp.%2$I::text) IN ('octubre','10') THEN 10
          WHEN lower(fp.%2$I::text) IN ('noviembre','11') THEN 11
          WHEN lower(fp.%2$I::text) IN ('diciembre','12') THEN 12
          ELSE NULL
        END AS periodo,
        COALESCE(NULLIF(trim(dr.nombre), ''), 'Sin ramo') AS ramo,
        SUM(COALESCE(fp.%3$I, 0))::numeric AS prima_oficial,
        COUNT(*)::bigint AS polizas
      FROM bi_dashboard.fact_primas fp
      LEFT JOIN bi_dashboard.dim_ramo dr ON dr.id = fp.ramo_id
      GROUP BY 1,2,3;
    $sql$, year_col, month_col, prima_col);

  ELSIF linea_col IS NOT NULL
    AND year_col IS NOT NULL
    AND month_col IS NOT NULL
    AND prima_col IS NOT NULL THEN

    EXECUTE format($sql$
      CREATE OR REPLACE VIEW bi_dashboard.vw_ramos_prima AS
      SELECT
        %1$I::int AS anio,
        CASE
          WHEN lower(%2$I::text) IN ('enero','1') THEN 1
          WHEN lower(%2$I::text) IN ('febrero','2') THEN 2
          WHEN lower(%2$I::text) IN ('marzo','3') THEN 3
          WHEN lower(%2$I::text) IN ('abril','4') THEN 4
          WHEN lower(%2$I::text) IN ('mayo','5') THEN 5
          WHEN lower(%2$I::text) IN ('junio','6') THEN 6
          WHEN lower(%2$I::text) IN ('julio','7') THEN 7
          WHEN lower(%2$I::text) IN ('agosto','8') THEN 8
          WHEN lower(%2$I::text) IN ('septiembre','9') THEN 9
          WHEN lower(%2$I::text) IN ('octubre','10') THEN 10
          WHEN lower(%2$I::text) IN ('noviembre','11') THEN 11
          WHEN lower(%2$I::text) IN ('diciembre','12') THEN 12
          ELSE NULL
        END AS periodo,
        COALESCE(NULLIF(trim(%3$I::text), ''), 'Sin ramo') AS ramo,
        SUM(COALESCE(%4$I, 0))::numeric AS prima_oficial,
        COUNT(*)::bigint AS polizas
      FROM bi_dashboard.fact_primas
      GROUP BY 1,2,3;
    $sql$, year_col, month_col, linea_col, prima_col);

  ELSE
    RAISE EXCEPTION 'No ramo source found inside bi_dashboard (expected ramo column, ramo_id + dim_ramo, or linea_negocio fallback).';
  END IF;

  GRANT SELECT ON bi_dashboard.vw_ramos_prima TO anon, authenticated, service_role;
END $$;
