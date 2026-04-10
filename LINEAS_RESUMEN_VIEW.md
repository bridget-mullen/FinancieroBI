# Vista viva de líneas (`vw_lineas_resumen_mensual`)

## Objetivo
Reemplazar `lineas_resumen` (tabla precalculada) por una **vista en tiempo real** que siempre lea la fuente base y evite desfases por refresh manual.

## Qué se cambió

1. **Se elimina lo viejo**
   - `DROP TABLE public.lineas_resumen`
   - `DROP FUNCTION public.refresh_lineas_resumen(integer)`

2. **Se crea una vista viva**
   - `public.vw_lineas_resumen_mensual`
   - La vista agrega por:
     - `anio`
     - `periodo` (mes 1..12)
     - `linea`

3. **Fuentes consideradas**
   - Prima neta:
     - `Efectuada 2024`
     - `Efectuada 2025`
     - `efectuada_2026_drive`
   - Presupuesto:
     - `Presupuestos 2024`
     - `Presupuestos 2025`
     - `Presupuestos 2026`
   - Pendiente:
     - `Pendiente` (solo año actual)

4. **Regla crítica de 2026 (la discrepancia grande)**
   - Para 2026, el mes se toma de `FLiquidacion` (formato `MM/DD` o ISO), no de `Periodo`.
   - Si `FLiquidacion` no se puede interpretar, cae a `Periodo`.

5. **Fórmula oficial**
   - `prima_neta = (PrimaNeta - Descuento) * TCPago`

6. **Conexión al dashboard**
   - `src/app/api/lineas/route.ts` ahora prioriza `vw_lineas_resumen_mensual`.
   - Si la vista no existe, mantiene fallback raw para no romper producción.

---

## Archivo de migración

- `supabase/migrations/20260410_replace_lineas_resumen_with_live_view.sql`

---

## Validación mínima recomendada

### 1) Total marzo 2026 desde la vista
```sql
SELECT
  SUM(prima_neta) AS total_marzo_2026
FROM public.vw_lineas_resumen_mensual
WHERE anio = 2026
  AND periodo = 3;
```

### 2) Desglose por línea (marzo 2026)
```sql
SELECT
  linea,
  SUM(prima_neta) AS prima_neta
FROM public.vw_lineas_resumen_mensual
WHERE anio = 2026
  AND periodo = 3
GROUP BY linea
ORDER BY prima_neta DESC;
```

### 3) Verificar que API use la vista
```bash
curl -s "https://financiero-bi-dashboard.vercel.app/api/lineas?year=2026&meses=3" -D - | head
```
Revisar header:
- `x-lineas-source: summary:vw_lineas_resumen_mensual`

---

## Notas operativas

- Esta vista es **no materializada**: siempre consulta datos vivos.
- Si agregan nuevos años (`Efectuada 2027`, `Presupuestos 2027`), hay que extender la `UNION ALL` de la vista.
