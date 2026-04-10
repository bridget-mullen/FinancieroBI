# Vista viva de líneas (`vw_lineas_resumen_mensual`)

## Estado actual (schema DRIVE)
El cliente reinició tablas y dejó esta nomenclatura en `public`:
- `efectuada_2024_drive`
- `efectuada_2025_drive`
- `efectuada_2026_drive`
- `presupuestos_2026_drive`
- `pendiente_drive`
- `catalogo_lineas_negocio_drive`

Por eso se reconstruyó la capa resumen para depender **solo** de ese esquema actual.

---

## Qué se reconstruyó

1) Vista principal viva:
- `public.vw_lineas_resumen_mensual`

2) Tabla de compatibilidad rápida (para builds viejos y como **fast path** del API):
- `public.lineas_resumen` (tabla física + índice por `anio, periodo`)
- refresco vía `public.refresh_lineas_resumen(p_anio integer default null)`
- el endpoint `/api/lineas` prioriza esta tabla para evitar timeouts

3) Funciones auxiliares:
- `public.parse_budget_text(text)`
- `public.parse_month_text(text)`
- `public.normalize_linea_name(text)`

---

## Reglas de cálculo

### Prima Neta
`(PrimaNeta - Descuento) * TCPago`

### Mes (`periodo`)
Se toma de `FLiquidacion` cuando existe parseable (`M/D/YY`, `M/D/YYYY`, `YYYY-MM-DD`, con/sin hora).
Si no se puede parsear, fallback a `Periodo`.

### Presupuesto
Se agrega desde `presupuestos_2026_drive` por mes parseado de `Fecha`.

### Pendiente
Se agrega desde `pendiente_drive` para el año actual.

### Scope de líneas del tacómetro
La vista se limita a:
- Click Franquicias
- Cartera Tradicional
- Click Promotorías
- Corporate
- Call Center

---

## Archivo SQL
`supabase/migrations/20260410_replace_lineas_resumen_with_live_view.sql`

---

## Validación rápida

```sql
SELECT anio, periodo, count(*) lineas, sum(prima_neta) total
FROM public.vw_lineas_resumen_mensual
WHERE anio = 2026 AND periodo = 2
GROUP BY 1,2;
```

```sql
SELECT linea, prima_neta, anio_anterior, presupuesto
FROM (
  SELECT
    cur.linea,
    cur.prima_neta,
    prev.prima_neta AS anio_anterior,
    cur.presupuesto
  FROM public.vw_lineas_resumen_mensual cur
  LEFT JOIN public.vw_lineas_resumen_mensual prev
    ON prev.anio = 2025
   AND prev.periodo = 2
   AND prev.linea = cur.linea
  WHERE cur.anio = 2026
    AND cur.periodo = 2
) x
ORDER BY prima_neta DESC;
```

Y en API:
```bash
curl -s "https://financiero-bi-dashboard.vercel.app/api/lineas?year=2026&meses=2" -D - | head
```

Refresh manual (cuando recarguen tablas `*_drive`):
```sql
SELECT public.refresh_lineas_resumen(NULL);      -- todo
-- o por año:
SELECT public.refresh_lineas_resumen(2026);
```
