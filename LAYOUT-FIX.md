# URGENT: Layout Fix — Match Power BI Reference

## Current Problems (see ref-tacometro.png = Power BI reference)
The current deploy has a broken layout compared to the Power BI original. Fix these:

## Power BI Reference Layout (MATCH THIS EXACTLY):

### Top Section (2-column grid):
- **LEFT (~45%):** Gauge (speedometer) centered, with scale labels around it ($90M to $140M range)
  - Large value "$72.6M" centered below gauge text "Prima neta cobrada"
  - The gauge should have the META marker showing "$129.5M" with a small triangle
- **RIGHT (~55%):** Data table with columns: Línea | Prima Neta | Año Anterior* | Presupuesto | Diferencia

### Bottom Section (3-column layout):
- **FAR LEFT (narrow ~15%):** "Tipo de cambio" card stacked vertically:
  - "Dólar $17.23" 
  - "Peso Dominicano $56.85"
- **CENTER LEFT (~35%):** Two KPI cards stacked:
  - "Cumplimiento del presupuesto" — large "56%" — beige/cream background with subtle border
  - "Crecimiento de la prima neta actual frente al año anterior*" — green background — "⬆ 2.1%"
  - These cards should be SQUARE-ISH, not stretched wide. They have centered text.
- **CENTER RIGHT (~50%):** Horizontal bar chart
  - "PN Efectuada" (dark) vs "Presupuesto" (gray) legend
  - Bars sorted ascending: Call Center, Cartera Tradicional, Corporate, Click Promotorías, Click Franquicias
  - Scale: $0 to $80M

### Footer:
- Left: INTRA CLICK logo + disclaimer text
- Right: "Fecha de actualización" + date

## CRITICAL CSS Rules:
1. KPI cards must be COMPACT and CENTERED text, not full-width stretched
2. Tipo de cambio goes FAR LEFT as a narrow vertical card
3. The bar chart sits to the RIGHT of the KPIs, not below everything
4. NO excess whitespace — the whole dashboard fits in one viewport without scrolling
5. Use CSS Grid for the bottom section: `grid-template-columns: auto 1fr 1fr`

## Files to Edit:
- src/app/page.tsx (main layout)
- src/components/gauge.tsx (if gauge needs proportion fix)
