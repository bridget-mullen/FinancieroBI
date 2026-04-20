"use client"

import React, { useState, useEffect, useRef, useCallback, Suspense } from "react"
import { useSearchParams } from "next/navigation"
import { ChevronRight, ChevronLeft, ChevronDown, Search, Download } from "lucide-react"
import { PageTabs } from "@/components/page-tabs"
import { PageFooter } from "@/components/page-footer"
import { PeriodFilter } from "@/components/period-filter"
import { getLineasWithYoY, getGerencias, getVendedores, getGrupos, getClientes, globalSearch, getLastDataDate, getVendedoresWithTipo } from "@/lib/queries"
import type { SearchResult, PolizaRow, TierGroup, VendedorFullRow } from "@/lib/queries"
import { exportExcel, exportPDF } from "@/lib/export"
import { NLQuery } from "@/components/nl-query"
import { DrillCharts } from "@/components/drill-charts"

function roundToIntegerByFirstDecimal(v: number) {
  if (!Number.isFinite(v)) return 0
  // Rule requested: 10.5 -> 11, 10.4 -> 10 (same logic for negatives by symmetry)
  return v >= 0 ? Math.floor(v + 0.5) : Math.ceil(v - 0.5)
}

function fmt(v: number) {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(roundToIntegerByFirstDecimal(v))
}
function fmtShort(v: number) {
  const rounded = roundToIntegerByFirstDecimal(v)
  if (Math.abs(rounded) >= 1e6) return `$${(rounded / 1e6).toFixed(1)}M`
  if (Math.abs(rounded) >= 1e3) return `$${(rounded / 1e3).toFixed(0)}K`
  return `$${rounded}`
}
function fmtDate(dateStr: string): string {
  if (!dateStr) return ""
  // Handle ISO date format (2026-02-20T00:00:00 or 2026-02-20)
  const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (match) {
    const [, yyyy, mm, dd] = match
    return `${dd}/${mm}/${yyyy}`
  }
  return dateStr
}

const MESES_LABELS = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"]

interface LineaFull {
  linea: string; primaNeta: number; presupuesto: number; diferencia: number; pctDifPpto: number; pnAnioAnt: number; difYoY: number; pctDifYoY: number; pendiente: number
}

function toSlug(name: string) {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

function isPromotoriasLine(linea: string) {
  const normalized = toSlug(linea)
  return normalized === "click-promotorias" || normalized === "click-promotoras"
}

// Umbral configurable de alerta por desviación (default -20%)
const ALERT_THRESHOLD = -20

type DrillLevel = "linea" | "gerencia" | "vendedor" | "grupo" | "cliente" | "poliza"

interface Crumb { level: DrillLevel; label: string }

// Full row for all drill levels (9 columns)
interface DrillRow { name: string; primaNeta: number; presupuesto: number | null; diferencia: number | null; pctDifPpto: number | null; pnAnioAnt: number | null; difYoY: number | null; pctDifYoY: number | null; pendiente: number | null }

export default function TablaDetallePage() {
  return (
    <Suspense fallback={<div>Cargando...</div>}>
      <TablaDetalleContent />
    </Suspense>
  )
}

function TablaDetalleContent() {
  const searchParams = useSearchParams()
  const lineaParam = searchParams.get("linea")
  const currentYear = String(new Date().getFullYear())
  const currentMonth = new Date().getMonth() + 1

  const [year, setYear] = useState(currentYear)
  const [periodos, setPeriodos] = useState<number[]>([currentMonth])
  const [search, setSearch] = useState("")
  const [loading, setLoading] = useState(true)
  const [mounted, setMounted] = useState(false)
  const [didAutoDrill, setDidAutoDrill] = useState(false)

  // Filtros removidos por solicitud: cartera y clasificación de aseguradoras
  const clasificacionAseguradoras: string[] | null = null

  // Feature 1: Tipo Vendedor grouper state (now with full 9-column data)
  const [tipoGroups, setTipoGroups] = useState<TierGroup[] | null>(null)
  const [expandedTipos, setExpandedTipos] = useState<Set<string>>(new Set())

  useEffect(() => { setMounted(true) }, [])

  const handleFilterChange = useCallback((newYear: string, newPeriodos: number[]) => {
    setYear(newYear)
    setPeriodos(newPeriodos)
  }, [])

  // Drill state
  const [drillLevel, setDrillLevel] = useState<DrillLevel>("linea")
  const [crumbs, setCrumbs] = useState<Crumb[]>([])
  // Selections for building queries deeper
  const [sel, setSel] = useState<{ linea?: string; gerencia?: string; vendedor?: string; grupo?: string; cliente?: string }>({})

  // Data
  const [lineas, setLineas] = useState<LineaFull[]>([])
  const [rows, setRows] = useState<DrillRow[]>([])
  const [polizas, setPolizas] = useState<PolizaRow[]>([])
  const [lastDataDate, setLastDataDate] = useState<string | null>(null)
  const [vendedorParentTotals, setVendedorParentTotals] = useState<{ primaNeta: number; presupuesto: number; pnAnioAnt: number } | null>(null)
  const [groupBudgetOnlyTotal, setGroupBudgetOnlyTotal] = useState(false)

  // Global search
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [showSearchDropdown, setShowSearchDropdown] = useState(false)
  const searchTimeout = useRef<NodeJS.Timeout>(null)

  const handleSearchChange = (val: string) => {
    setSearch(val)
    if (searchTimeout.current) clearTimeout(searchTimeout.current)
    if (val.length >= 2) {
      searchTimeout.current = setTimeout(async () => {
        const results = await globalSearch(val, periodo, year)
        setSearchResults(results)
        setShowSearchDropdown(results.length > 0)
      }, 300)
    } else {
      setSearchResults([])
      setShowSearchDropdown(false)
    }
  }

  const navigateToResult = (r: SearchResult) => {
    setShowSearchDropdown(false)
    setSearch("")
    const { linea, gerencia, vendedor, grupo } = r.context
    if (r.type === "gerencia") {
      drill("gerencia", linea, { linea })
    } else if (r.type === "vendedor" && gerencia) {
      drill("vendedor", gerencia, { linea, gerencia })
    } else if (r.type === "cliente" && gerencia && vendedor && grupo) {
      drill("cliente", grupo, { linea, gerencia, vendedor, grupo })
    } else if (r.type === "poliza" && gerencia && vendedor && grupo) {
      drill("cliente", grupo, { linea, gerencia, vendedor, grupo })
    }
  }

  const tableRef = useRef<HTMLDivElement>(null)
  useEffect(() => { document.title = "Tabla detalle | CLK BI Dashboard" }, [])
  useEffect(() => { getLastDataDate().then(d => setLastDataDate(d)) }, [])

  // Use first selected period for queries (multi-period queries use first as primary)
  const periodo = periodos.length > 0 ? Math.max(...periodos) : undefined

  // Load líneas directly from bi_dashboard.fact_primas via /api/lineas
  useEffect(() => {
    let cancelled = false

    // Keep current drill level when filters change
    setLoading(true)

    const load = async () => {
      try {
        const result = await getLineasWithYoY(periodos, year)
        if (cancelled) return

        const mapped: LineaFull[] = (result ?? []).map((item) => {
          const dif = item.primaNeta - item.presupuesto
          const pctDif = item.presupuesto > 0 ? Math.round((dif / item.presupuesto) * 1000) / 10 : 0
          const difY = item.primaNeta - item.anioAnterior
          const pctDifY = item.anioAnterior > 0 ? Math.round((difY / item.anioAnterior) * 10000) / 100 : 0

          return {
            linea: item.nombre,
            primaNeta: item.primaNeta,
            presupuesto: item.presupuesto,
            diferencia: dif,
            pctDifPpto: pctDif,
            pnAnioAnt: item.anioAnterior,
            difYoY: difY,
            pctDifYoY: pctDifY,
            pendiente: item.pendiente || 0,
          }
        })

        setLineas(mapped)
      } catch {
        if (!cancelled) setLineas([])
      }

      if (!cancelled) setLoading(false)
    }

    load()

    return () => {
      cancelled = true
    }
  }, [periodos, year])

  // Helper to check if linea uses tipo vendedor grouper
  const usesTipoGrouper = (linea: string) => linea === "Click Franquicias" || isPromotoriasLine(linea)

  // Generic drill function
  const drill = async (level: DrillLevel, label: string, newSel: typeof sel, opts?: { pushCrumb?: boolean }) => {
    const pushCrumb = opts?.pushCrumb ?? true
    setLoading(true)
    if (level !== "grupo") setGroupBudgetOnlyTotal(false)
    setSel(newSel)
    if (pushCrumb) setCrumbs(prev => [...prev, { level: drillLevel, label }])

    // Reset tipo groups when changing levels (except when drilling into vendedor with tipo grouper)
    if (level !== "vendedor" || !usesTipoGrouper(newSel.linea || "")) {
      setTipoGroups(null)
      setExpandedTipos(new Set())
    }
    // Keep vendedor parent totals while drilling into grupo/cliente
    if (level === "linea" || level === "gerencia") {
      setVendedorParentTotals(null)
    }

    // Helper: compute DrillRow with YoY and proportional presupuesto
    // Now requires pnAnioAntTotal to allocate budget based on prior year share (not current primaNeta)
    // Falls back to currentTotal share when entity has no prior year data
    const toRowWithYoY = (
      name: string,
      primaNeta: number,
      pnAnioAnt: number,
      pnAnioAntTotal: number,
      lineaPpto: number,
      lineaPendiente: number,
      currentTotal: number,
      explicitPpto?: number | null
    ): DrillRow => {
      // Allocate presupuesto based on PRIOR YEAR share, not current primaNeta
      // This gives unique % Dif ppto per row (rows performing better/worse than their historical share)
      // Fallback: when no prior year data, use current year share to allocate budget
      const priorShare = pnAnioAntTotal > 0 ? pnAnioAnt / pnAnioAntTotal : 0
      const currentShare = currentTotal > 0 ? primaNeta / currentTotal : 0
      const effectiveShare = priorShare > 0 ? priorShare : currentShare
      const pptoProporcional = Math.round(lineaPpto * effectiveShare)
      const ppto = explicitPpto != null ? Math.round(explicitPpto) : pptoProporcional
      const dif = primaNeta - ppto
      const pctDif = ppto > 0 ? Math.round((dif / ppto) * 1000) / 10 : 0
      const difY = primaNeta - pnAnioAnt
      const pctDifY = pnAnioAnt > 0 ? Math.round((difY / pnAnioAnt) * 10000) / 100 : 0
      // Pendiente allocated by effectiveShare
      const pend = Math.round(lineaPendiente * effectiveShare)
      return {
        name,
        primaNeta,
        presupuesto: ppto,
        diferencia: dif,
        pctDifPpto: pctDif,
        pnAnioAnt,
        difYoY: difY,
        pctDifYoY: pctDifY,
        pendiente: pend
      }
    }

    // Get línea-level data for proportional calculations
    const lineaBase = lineas.find((s) => s.linea === newSel.linea)
    const lineaPpto = lineaBase?.presupuesto ?? 0
    const lineaPendiente = lineaBase?.pendiente ?? 0

    try {
      if (level === "gerencia") {
        const data = await getGerencias(newSel.linea!, periodos, year, clasificacionAseguradoras)
        const pnAnioAntTotal = (data ?? []).reduce((s, d) => s + d.pnAnioAnt, 0)
        const currentTotal = (data ?? []).reduce((s, d) => s + d.primaNeta, 0)
        setRows((data ?? []).map(d => toRowWithYoY(d.gerencia, d.primaNeta, d.pnAnioAnt, pnAnioAntTotal, lineaPpto, lineaPendiente, currentTotal, d.presupuesto ?? null)))
      } else if (level === "vendedor") {
        const parentGerencias = await getGerencias(newSel.linea!, periodos, year, clasificacionAseguradoras)
        const parent = (parentGerencias ?? []).find((g) => g.gerencia.trim().toLowerCase() === String(newSel.gerencia ?? '').trim().toLowerCase())
        setVendedorParentTotals(parent ? {
          primaNeta: roundToIntegerByFirstDecimal(parent.primaNeta),
          presupuesto: roundToIntegerByFirstDecimal(parent.presupuesto ?? 0),
          pnAnioAnt: roundToIntegerByFirstDecimal(parent.pnAnioAnt),
        } : null)

        // Feature 1: For Franquicias/Promotorías, use tipo grouper ONLY if groupByTipo is ON
        // Default: show flat vendedor list (Abraham: "Que haya algún botón que le ponga yo agrupar por tipo")
        if (usesTipoGrouper(newSel.linea || "") && groupByTipo) {
          const data = await getVendedoresWithTipo(
            newSel.gerencia!,
            newSel.linea!,
            periodo,
            year,
            clasificacionAseguradoras,
            lineaPpto,
            lineaPendiente
          )
          setTipoGroups(data)
          setRows([]) // Clear regular rows
        } else {
          // All líneas: show vendedores directly (default behavior)
          const data = await getVendedores(newSel.gerencia!, newSel.linea!, periodos, year, clasificacionAseguradoras)
          const pnAnioAntTotal = (data ?? []).reduce((s, d) => s + d.pnAnioAnt, 0)
          const currentTotal = (data ?? []).reduce((s, d) => s + d.primaNeta, 0)
          // For vendedor level, use gerencia's proportional share of línea ppto
          const gerenciaShare = lineas.find(l => l.linea === newSel.linea)
          const gerenciaPpto = gerenciaShare ? Math.round(lineaPpto * (currentTotal / (gerenciaShare.primaNeta || 1))) : lineaPpto
          const vendedorRows = (data ?? [])
            .map(d => toRowWithYoY(d.vendedor, d.primaNeta, d.pnAnioAnt, pnAnioAntTotal, gerenciaPpto, lineaPendiente, currentTotal, d.presupuesto ?? null))
          // Only force A-Z for requested case: Corporate > Partner
          if ((newSel.linea || "") === "Corporate" && (newSel.gerencia || "") === "Partner") {
            vendedorRows.sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }))
          }
          setRows(vendedorRows)
          setTipoGroups(null)
        }
      } else if (level === "grupo") {
        const data = await getGrupos(newSel.vendedor!, newSel.gerencia!, newSel.linea!, periodos, year, clasificacionAseguradoras)
        const rowsData = data ?? []
        const hasBudgetOutsideSinGrupo = rowsData.some((d) => ((d.presupuesto ?? 0) > 0) && String(d.grupo || '').trim().toLowerCase() !== 'sin grupo')
        const groupBudgetOnlyInSinGrupo = rowsData.some((d) => String(d.grupo || '').trim().toLowerCase() === 'sin grupo' && (d.presupuesto ?? 0) > 0)
          && !hasBudgetOutsideSinGrupo
        setGroupBudgetOnlyTotal(groupBudgetOnlyInSinGrupo)

        // If presupuesto only exists in "Sin grupo", keep it ONLY at total level (not in group rows)
        const visibleRows = groupBudgetOnlyInSinGrupo
          ? rowsData.filter((d) => String(d.grupo || '').trim().toLowerCase() !== 'sin grupo')
          : rowsData

        const pnAnioAntTotal = visibleRows.reduce((s, d) => s + d.pnAnioAnt, 0)
        const currentTotal = visibleRows.reduce((s, d) => s + d.primaNeta, 0)
        setRows(visibleRows.map(d => toRowWithYoY(d.grupo, d.primaNeta, d.pnAnioAnt, pnAnioAntTotal, 0, 0, currentTotal, d.presupuesto ?? null)))
      } else if (level === "cliente") {
        const data = await getClientes(newSel.grupo!, newSel.vendedor!, newSel.gerencia!, newSel.linea!, periodos, year, clasificacionAseguradoras)
        const pnAnioAntTotal = (data ?? []).reduce((s, d) => s + d.pnAnioAnt, 0)
        const currentTotal = (data ?? []).reduce((s, d) => s + d.primaNeta, 0)
        setRows((data ?? []).map(d => toRowWithYoY(d.cliente, d.primaNeta, d.pnAnioAnt, pnAnioAntTotal, 0, 0, currentTotal, d.presupuesto ?? null)))
      }
    } catch { setRows([]); setPolizas([]); setTipoGroups(null) }

    setDrillLevel(level)
    setLoading(false)
  }

  // When year/month filters change, keep user in current drill and refresh that level data.
  useEffect(() => {
    if (drillLevel === "linea") return
    if (!sel.linea) return
    drill(drillLevel, "", sel, { pushCrumb: false })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodos, year])

  // Auto-drill into the category matching the ?linea= param
  useEffect(() => {
    if (!lineaParam || loading || didAutoDrill) return
    const match = lineas.find(l => toSlug(l.linea) === lineaParam)
    if (match) {
      setDidAutoDrill(true)
      drill("gerencia", match.linea, { linea: match.linea })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lineaParam, loading, lineas, didAutoDrill])

  const goBack = () => {
    if (crumbs.length === 0) return
    const prev = crumbs[crumbs.length - 1]
    setCrumbs(c => c.slice(0, -1))

    // Restore selection
    if (prev.level === "linea") {
      setDrillLevel("linea"); setSel({})
    } else {
      // Re-drill to the previous level
      const newCrumbs = crumbs.slice(0, -1)
      // Reconstruct sel from crumbs
      const newSel: typeof sel = {}
      const levels: DrillLevel[] = ["linea", "gerencia", "vendedor", "grupo", "cliente"]
      const selKeys = ["linea", "gerencia", "vendedor", "grupo", "cliente"] as const
      for (let i = 0; i < newCrumbs.length; i++) {
        const idx = levels.indexOf(newCrumbs[i].level)
        if (idx >= 0 && idx < selKeys.length) {
          (newSel as Record<string, string>)[selKeys[idx]] = newCrumbs[i].label
        }
      }
      // Also include the "prev" level's label as sel
      const prevIdx = levels.indexOf(prev.level)
      if (prevIdx > 0 && prevIdx - 1 < selKeys.length) {
        // prev.level is what we're going BACK to
      }
      drill(prev.level, "", { ...newSel }).then(() => {
        setCrumbs(newCrumbs)
      })
      return
    }
  }

  const goToCrumb = (idx: number) => {
    if (idx < 0) { setDrillLevel("linea"); setCrumbs([]); setSel({}); return }
    // Reconstruct and re-drill
    const target = crumbs[idx]
    const newCrumbs = crumbs.slice(0, idx)
    const levels: DrillLevel[] = ["linea", "gerencia", "vendedor", "grupo", "cliente"]
    const selKeys = ["linea", "gerencia", "vendedor", "grupo", "cliente"] as const
    const newSel: typeof sel = {}
    for (const c of newCrumbs) {
      const li = levels.indexOf(c.level)
      if (li >= 0 && li < selKeys.length) (newSel as Record<string, string>)[selKeys[li]] = c.label
    }
    const nextLevel = levels[levels.indexOf(target.level) + 1] || target.level
    drill(nextLevel as DrillLevel, target.label, { ...newSel, [selKeys[levels.indexOf(target.level)]]: target.label }).then(() => {
      setCrumbs([...newCrumbs, target])
    })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const filterSearch = <T,>(items: T[], key: string): T[] => {
    if (!search) return items
    return items.filter(item => String((item as any)[key]).toLowerCase().includes(search.toLowerCase()))
  }

  // Top 9 + Otros aggregation for CHARTS ONLY (Abraham: "1,2,3,4,5,6,7,8,9 y el décimo que sea otros")
  // Table shows ALL rows with scroll
  const computeTop9WithOtrosForChart = (items: DrillRow[]): DrillRow[] => {
    if (items.length <= 9) return items
    // Sort by primaNeta descending and take top 9
    const sorted = [...items].sort((a, b) => b.primaNeta - a.primaNeta)
    const top9 = sorted.slice(0, 9)
    const rest = sorted.slice(9)
    // Sum numeric columns from rest
    const sumPN = rest.reduce((s, r) => s + r.primaNeta, 0)
    const sumPpto = rest.reduce((s, r) => s + (r.presupuesto ?? 0), 0)
    const sumPnAA = rest.reduce((s, r) => s + (r.pnAnioAnt ?? 0), 0)
    const sumPend = rest.reduce((s, r) => s + (r.pendiente ?? 0), 0)
    const sumDif = sumPpto > 0 ? sumPN - sumPpto : null
    const pctDif = sumPpto > 0 && sumDif !== null ? Math.round((sumDif / sumPpto) * 1000) / 10 : null
    const sumDifYoY = sumPnAA > 0 ? sumPN - sumPnAA : null
    const pctDifYoY = sumPnAA > 0 && sumDifYoY !== null ? Math.round((sumDifYoY / sumPnAA) * 10000) / 100 : null
    const otrosRow: DrillRow = {
      name: `Otros (${rest.length})`,
      primaNeta: sumPN,
      presupuesto: sumPpto > 0 ? sumPpto : null,
      diferencia: sumDif,
      pctDifPpto: pctDif,
      pnAnioAnt: sumPnAA > 0 ? sumPnAA : null,
      difYoY: sumDifYoY,
      pctDifYoY: pctDifYoY,
      pendiente: sumPend > 0 ? sumPend : null
    }
    return [...top9, otrosRow]
  }

  // Toggle state for "Agrupar por tipo" button (Abraham: default OFF, show flat vendedores)
  const [groupByTipo, setGroupByTipo] = useState(false)

  // Top 10 + Otros aggregation for drill levels 2-5 — TABLE still shows ALL rows with scroll
  const computeTop10WithOtros = (items: DrillRow[]): { rows: DrillRow[]; otrosCount: number } => {
    // TABLE shows ALL rows — no truncation, user scrolls
    return { rows: items, otrosCount: 0 }
  }

  // Keep the old logic for reference (used nowhere now, table shows all)
  const _computeTop10WithOtrosLegacy = (items: DrillRow[]): { rows: DrillRow[]; otrosCount: number } => {
    if (items.length <= 10) return { rows: items, otrosCount: 0 }
    // Sort by primaNeta descending and take top 10
    const sorted = [...items].sort((a, b) => b.primaNeta - a.primaNeta)
    const top10 = sorted.slice(0, 10)
    const rest = sorted.slice(10)
    // Sum numeric columns from rest
    const sumPN = rest.reduce((s, r) => s + r.primaNeta, 0)
    const sumPpto = rest.reduce((s, r) => s + (r.presupuesto ?? 0), 0)
    const sumPnAA = rest.reduce((s, r) => s + (r.pnAnioAnt ?? 0), 0)
    const sumPend = rest.reduce((s, r) => s + (r.pendiente ?? 0), 0)
    const sumDif = sumPpto > 0 ? sumPN - sumPpto : null
    const pctDif = sumPpto > 0 && sumDif !== null ? Math.round((sumDif / sumPpto) * 1000) / 10 : null
    const sumDifYoY = sumPnAA > 0 ? sumPN - sumPnAA : null
    const pctDifYoY = sumPnAA > 0 && sumDifYoY !== null ? Math.round((sumDifYoY / sumPnAA) * 10000) / 100 : null
    const otrosRow: DrillRow = {
      name: `Otros (${rest.length})`,
      primaNeta: sumPN,
      presupuesto: sumPpto > 0 ? sumPpto : null,
      diferencia: sumDif,
      pctDifPpto: pctDif,
      pnAnioAnt: sumPnAA > 0 ? sumPnAA : null,
      difYoY: sumDifYoY,
      pctDifYoY: pctDifYoY,
      pendiente: sumPend > 0 ? sumPend : null
    }
    return { rows: [...top10, otrosRow], otrosCount: rest.length }
  }

  // Top 10 + Otros for vendedores within a tier group (full row data)
  const computeTop10VendedoresInTier = (vendedores: VendedorFullRow[]): { vendedores: VendedorFullRow[]; otrosCount: number } => {
    if (vendedores.length <= 10) return { vendedores, otrosCount: 0 }
    const sorted = [...vendedores].sort((a, b) => b.primaNeta - a.primaNeta)
    const top10 = sorted.slice(0, 10)
    const rest = sorted.slice(10)
    // Sum all numeric columns for "Otros" row
    const sumPN = rest.reduce((s, v) => s + v.primaNeta, 0)
    const sumPpto = rest.reduce((s, v) => s + (v.presupuesto ?? 0), 0)
    const sumPnAA = rest.reduce((s, v) => s + v.pnAnioAnt, 0)
    const sumPend = rest.reduce((s, v) => s + (v.pendiente ?? 0), 0)
    const sumDif = sumPpto > 0 ? sumPN - sumPpto : null
    const pctDif = sumPpto > 0 && sumDif !== null ? Math.round((sumDif / sumPpto) * 1000) / 10 : null
    const sumDifYoY = sumPnAA > 0 ? sumPN - sumPnAA : null
    const pctDifYoY = sumPnAA > 0 && sumDifYoY !== null ? Math.round((sumDifYoY / sumPnAA) * 10000) / 100 : null
    const otrosVendedor: VendedorFullRow = {
      vendedor: `Otros (${rest.length})`,
      tipo: vendedores[0]?.tipo ?? "",
      primaNeta: sumPN,
      pnAnioAnt: sumPnAA,
      presupuesto: sumPpto > 0 ? sumPpto : null,
      diferencia: sumDif,
      pctDifPpto: pctDif,
      difYoY: sumDifYoY,
      pctDifYoY: pctDifYoY,
      pendiente: sumPend > 0 ? sumPend : null
    }
    return { vendedores: [...top10, otrosVendedor], otrosCount: rest.length }
  }

  // Column label for current level
  const levelLabels: Record<DrillLevel, string> = {
    linea: "Línea de negocio", gerencia: "Gerencia", vendedor: "Vendedor",
    grupo: "Grupo", cliente: "Cliente", poliza: "Póliza",
  }

  const filteredLineas = filterSearch(lineas, "linea")
  const totalLineas = { primaNeta: filteredLineas.reduce((s, l) => s + l.primaNeta, 0), presupuesto: filteredLineas.reduce((s, l) => s + l.presupuesto, 0), pnAnioAnt: filteredLineas.reduce((s, l) => s + l.pnAnioAnt, 0), pendiente: filteredLineas.reduce((s, l) => s + l.pendiente, 0) }
  const totalDif = filteredLineas.reduce((s, l) => s + l.diferencia, 0)
  const totalDifPct = totalLineas.presupuesto > 0 ? ((totalDif / totalLineas.presupuesto) * 100).toFixed(1) : ""
  const totalDifYoy = filteredLineas.reduce((s, l) => s + l.difYoY, 0)
  const totalDifYoyPct = totalLineas.pnAnioAnt > 0 ? ((totalDifYoy / totalLineas.pnAnioAnt) * 100).toFixed(2) : ""

  // Alert count: líneas with % dif ppto <= threshold
  const alertCount = filteredLineas.filter(l => l.presupuesto > 0 && l.pctDifPpto <= ALERT_THRESHOLD).length

  const filteredRows = filterSearch(rows, "name")
  // Apply Top 10 + Otros for drill levels 2-5 (gerencia, vendedor, grupo, cliente)
  const { rows: displayRows, otrosCount } = { rows: filteredRows, otrosCount: 0 }
  const filteredPolizas = filterSearch(polizas, "documento")
  const rowTotal = filteredRows.reduce((s, r) => s + r.primaNeta, 0)
  // Determine if table has many rows (for adaptive max-height)
  const manyRows = drillLevel === 'poliza'
    ? filteredPolizas.length > 15
    : drillLevel === 'gerencia' && sel.linea === 'Click Franquicias'
    ? displayRows.length > 15
    : (drillLevel !== 'linea' && drillLevel !== 'gerencia' && displayRows.length > 15)

  // Compute totals for levels 2-5 (same pattern as totalLineas)
  // For gerencia level, pin totals to selected línea card totals so it always matches level-1 exactly.
  const lineaTotals = sel.linea ? lineas.find((l) => l.linea === sel.linea) : null
  const totalRows = drillLevel === "gerencia" && lineaTotals
    ? {
        primaNeta: lineaTotals.primaNeta,
        presupuesto: lineaTotals.presupuesto,
        pnAnioAnt: lineaTotals.pnAnioAnt,
        pendiente: lineaTotals.pendiente,
      }
    : drillLevel === "vendedor" && vendedorParentTotals
    ? {
        primaNeta: vendedorParentTotals.primaNeta,
        presupuesto: vendedorParentTotals.presupuesto,
        pnAnioAnt: vendedorParentTotals.pnAnioAnt,
        pendiente: filteredRows.reduce((s, r) => s + (r.pendiente ?? 0), 0),
      }
    : drillLevel === "grupo" && vendedorParentTotals
    ? (() => {
        const primaNeta = filteredRows.reduce((s, r) => s + r.primaNeta, 0)
        const presupuestoRows = filteredRows.reduce((s, r) => s + (r.presupuesto ?? 0), 0)
        const presupuestoRowsSinGrupo = filteredRows
          .filter((r) => String(r.name || '').trim().toLowerCase() !== 'sin grupo')
          .reduce((s, r) => s + (r.presupuesto ?? 0), 0)
        const pnAnioAnt = filteredRows.reduce((s, r) => s + (r.pnAnioAnt ?? 0), 0)
        return {
          primaNeta,
          // If there is no presupuesto truly assigned to real groups, keep parent total at footer only
          presupuesto: presupuestoRowsSinGrupo > 0 ? presupuestoRows : (groupBudgetOnlyTotal ? (vendedorParentTotals.presupuesto ?? 0) : 0),
          pnAnioAnt,
          pendiente: filteredRows.reduce((s, r) => s + (r.pendiente ?? 0), 0),
        }
      })()
    : {
        primaNeta: filteredRows.reduce((s, r) => s + r.primaNeta, 0),
        presupuesto: filteredRows.reduce((s, r) => s + (r.presupuesto ?? 0), 0),
        pnAnioAnt: filteredRows.reduce((s, r) => s + (r.pnAnioAnt ?? 0), 0),
        pendiente: filteredRows.reduce((s, r) => s + (r.pendiente ?? 0), 0),
      }
  const totalRowsDif = totalRows.primaNeta - (totalRows.presupuesto ?? 0)
  const totalRowsDifPct = totalRows.presupuesto > 0 ? ((totalRowsDif / totalRows.presupuesto) * 100).toFixed(1) : ""
  const totalRowsDifYoy = totalRows.primaNeta - (totalRows.pnAnioAnt ?? 0)
  const totalRowsDifYoyPct = totalRows.pnAnioAnt > 0 ? ((totalRowsDifYoy / totalRows.pnAnioAnt) * 100).toFixed(2) : ""

  // Detect which optional columns have data (for levels 2-5) — hide empty columns
  // Column visibility depends ONLY on whether individual rows have data
  const hasPresupuesto = true
  const hasDiferencia = true
  const hasPctDifPpto = true
  const hasPnAnioAnt = true
  const hasDifYoY = true
  const hasPctDifYoY = true
  const hasPendiente = true
  const visibleColCount = 3 + [hasPresupuesto, hasDiferencia, hasPctDifPpto, hasPnAnioAnt, hasDifYoY, hasPctDifYoY, hasPendiente].filter(Boolean).length
  const polizaTotal = filteredPolizas.reduce((s, p) => s + p.primaNeta, 0)

  // Fixed column labels (removed compare mode)
  const cmpLabel = { col: "PN año anterior", difCol: "Dif PN año ant", pctCol: "% Dif PN AA" }

  const handleExcelExport = () => {
    const levelName = levelLabels[drillLevel]
    const periodoLabel = periodos.map(p => MESES_LABELS[p - 1]).join("-")
    const filename = `CLK_PrimaNetaCobrada_${levelName.replace(/\s/g, "")}_${year}_${periodoLabel}.xlsx`

    if (drillLevel === "linea") {
      exportExcel(
        filteredLineas.map(l => ({ "Línea": l.linea, "Prima neta": l.primaNeta, "Presupuesto": l.presupuesto, "Diferencia": l.diferencia, "% Dif ppto": l.pctDifPpto, "PN año anterior": l.pnAnioAnt, "Dif PN año ant": l.difYoY, "% Dif PN AA": l.pctDifYoY, "Pendiente": l.pendiente })),
        ["Línea", "Prima neta", "Presupuesto", "Diferencia", "% Dif ppto", "PN año anterior", "Dif PN año ant", "% Dif PN AA", "Pendiente"],
        ["Línea", "Prima neta", "Presupuesto", "Diferencia", "% Dif ppto", "PN año anterior", "Dif PN año ant", "% Dif PN AA", "Pendiente"],
        filename
      )
    } else if (drillLevel === "poliza") {
      exportExcel(
        filteredPolizas.map(p => ({ "Documento": p.documento, "Aseguradora": p.aseguradora, "Ramo": p.ramo, "Subramo": p.subramo, "F. Liquidación": p.fechaLiquidacion, "F. Lím. Pago": p.fechaLimPago, "Prima neta": p.primaNeta })),
        ["Documento", "Aseguradora", "Ramo", "Subramo", "F. Liquidación", "F. Lím. Pago", "Prima neta"],
        ["Documento", "Aseguradora", "Ramo", "Subramo", "F. Liquidación", "F. Lím. Pago", "Prima neta"],
        filename
      )
    } else {
      exportExcel(
        filteredRows.map(r => ({ [levelName]: r.name, "Prima neta": r.primaNeta, "Presupuesto": r.presupuesto ?? "—", "Diferencia": r.diferencia ?? "—", "% Dif ppto": r.pctDifPpto ?? "—", "PN año anterior": r.pnAnioAnt ?? "—", "Dif PN año ant": r.difYoY ?? "—", "% Dif PN AA": r.pctDifYoY ?? "—", "Pendiente": r.pendiente ?? "—" })),
        [levelName, "Prima neta", "Presupuesto", "Diferencia", "% Dif ppto", "PN año anterior", "Dif PN año ant", "% Dif PN AA", "Pendiente"],
        [levelName, "Prima neta", "Presupuesto", "Diferencia", "% Dif ppto", "PN año anterior", "Dif PN año ant", "% Dif PN AA", "Pendiente"],
        filename
      )
    }
  }

  const handlePDFExport = () => {
    if (!tableRef.current) return
    const periodoLabelPDF = periodos.map(p => MESES_LABELS[p - 1]).join(", ")
    const filters = `${periodoLabelPDF} ${year} | Nivel: ${levelLabels[drillLevel]} | ${crumbs.map(c => c.label).join(" > ") || "Todas las líneas"}`
    exportPDF(tableRef.current, "Prima Neta Cobrada", filters)
  }

  return (
    <div className="min-h-screen bg-[#FAFAFA] px-3 py-4 flex flex-col">
      <div className="max-w-[1200px] mx-auto w-full flex flex-col flex-1">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center border-b pb-2 pt-3 md:pt-5 w-full gap-2 md:gap-0">
        <PageTabs />
        <PeriodFilter onFilterChange={handleFilterChange} />
      </div>

      {/* Title + export buttons */}
      <div className="flex items-center justify-between mb-2 flex-wrap gap-1">
        <h1 className="text-sm font-bold text-[#111] font-lato">Prima neta cobrada</h1>
        <div className="flex items-center gap-1.5">
          <button onClick={handleExcelExport} className="flex items-center gap-1 px-2.5 py-1.5 rounded text-[11px] font-medium border border-[#041224] text-[#041224] hover:bg-[#F5F5F5] transition-colors">
            <Download className="w-3 h-3" /> Excel
          </button>
          <button onClick={handlePDFExport} className="flex items-center gap-1 px-2.5 py-1.5 rounded text-[11px] font-medium border border-[#041224] text-[#041224] hover:bg-[#F5F5F5] transition-colors">
            <Download className="w-3 h-3" /> PDF
          </button>
        </div>
      </div>

      {/* Breadcrumb */}
      {crumbs.length > 0 && (
        <div className="flex items-center gap-2 mb-2 flex-wrap">
          <button onClick={goBack} className="flex items-center gap-1 text-xs text-[#041224] hover:text-[#E62800] transition-colors font-medium">
            <ChevronLeft className="w-4 h-4" /> Atrás
          </button>
          <div className="flex items-center gap-1 text-xs text-[#888] flex-wrap">
            <button onClick={() => { setDrillLevel("linea"); setCrumbs([]); setSel({}) }} className="hover:text-[#041224] underline">Líneas</button>
            {crumbs.map((c, i) => (
              <span key={i} className="flex items-center gap-1">
                <ChevronRight className="w-3 h-3" />
                <button onClick={() => goToCrumb(i)} className={`transition-colors ${i === crumbs.length - 1 ? "text-[#041224] font-semibold" : "hover:text-[#041224] underline"}`}>
                  {c.label}
                </button>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Filter bar */}
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        {/* Feature 5: Agrupar por tipo toggle — only show for Franquicias/Promotorías at vendedor level */}
        {drillLevel === "vendedor" && usesTipoGrouper(sel.linea || "") && (
          <button
            onClick={() => {
              setGroupByTipo(!groupByTipo)
              // Re-drill to apply the new grouping
              if (sel.gerencia && sel.linea) {
                drill("vendedor", sel.gerencia, { linea: sel.linea, gerencia: sel.gerencia })
              }
            }}
            className={`px-2 py-1 rounded text-xs font-medium border transition-colors ${
              groupByTipo
                ? "bg-[#041224] text-white border-[#041224]"
                : "bg-white text-[#333] border-[#E5E7EB] hover:border-[#CCD1D3]"
            }`}
          >
            {groupByTipo ? "✓ Agrupado por tipo" : "Agrupar por tipo"}
          </button>
        )}

        <div className="relative ml-auto">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
          <input
            id="td-search"
            name="search"
            value={search}
            onChange={e => handleSearchChange(e.target.value)}
            onFocus={() => searchResults.length > 0 && setShowSearchDropdown(true)}
            onBlur={() => setTimeout(() => setShowSearchDropdown(false), 200)}
            placeholder="Buscar gerencia, vendedor, póliza..."
            className="pl-7 pr-3 py-1 border border-[#E5E7EB] rounded text-xs w-56 bg-white"
          />
          {showSearchDropdown && searchResults.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-[#E5E7E9] rounded shadow-lg z-50 max-h-60 overflow-y-auto">
              {searchResults.map((r, i) => (
                <button
                  key={`${r.type}-${r.value}-${i}`}
                  className="w-full text-left px-3 py-2 text-xs hover:bg-[#FFF5F5] border-b border-[#F0F0F0] last:border-0"
                  onMouseDown={() => navigateToResult(r)}
                >
                  <span className={`inline-block w-16 text-[9px] font-bold uppercase rounded px-1 py-0.5 mr-2 ${
                    r.type === "gerencia" ? "bg-[#041224] text-white" :
                    r.type === "vendedor" ? "bg-[#FDECEA] text-[#041224]" :
                    r.type === "poliza" ? "bg-[#E5E7E9] text-[#333]" :
                    "bg-[#F1F8F1] text-[#2E7D32]"
                  }`}>{r.type}</span>
                  <span className="text-[#111] font-medium">{r.value}</span>
                  <span className="text-[#CCD1D3] ml-2 text-[9px]">{r.context.linea}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <span className="text-xs text-[#CCD1D3]">Datos al: {lastDataDate ?? (mounted ? new Date().toLocaleDateString("es-MX", { day: "2-digit", month: "2-digit", year: "numeric" }) : "—")}</span>
        {(() => {
          if (!lastDataDate) return null
          const parts = lastDataDate.split("/")
          const dataDate = new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]))
          const daysDiff = Math.floor((Date.now() - dataDate.getTime()) / (1000 * 60 * 60 * 24))
          return daysDiff > 7 ? <span className="text-[12px] bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full font-medium ml-1">⚠ Datos pendientes de actualización</span> : null
        })()}
      </div>

      {/* Row count indicator for large datasets */}
      {drillLevel !== "linea" && filteredRows.length >= 30 && (
        <div className="text-[12px] text-[#888] mb-1">{filteredRows.length} registros encontrados — desplazar para ver más</div>
      )}
      {drillLevel === "poliza" && filteredPolizas.length >= 30 && (
        <div className="text-[12px] text-[#888] mb-1">{filteredPolizas.length} pólizas encontradas — desplazar para ver más</div>
      )}

      {/* Table — mobile: cards, desktop: full table */}
      {/* MOBILE CARD VIEW */}
      <div className="md:hidden space-y-1.5 mb-3">
        {loading ? (
          <p className="text-center text-gray-400 py-8">Cargando...</p>
        ) : drillLevel === "linea" ? (
          <>
            {filteredLineas.map((l) => {
              const pctPpto = l.presupuesto > 0 ? Math.round((l.primaNeta / l.presupuesto) * 100) : 0
              return (
                <div key={l.linea} className="bg-white rounded-xl border border-gray-200 px-3 py-3 shadow-sm active:bg-gray-50 transition-colors"
                  onClick={() => drill("gerencia", l.linea, { linea: l.linea })}>
                  <div className="flex justify-between items-center mb-1">
                    <span className="font-bold text-sm text-[#111] flex items-center gap-1 truncate">
                      <ChevronRight className="w-3.5 h-3.5 text-[#E62800] flex-shrink-0" />
                      {l.linea}
                    </span>
                    <span className={`text-sm font-black flex-shrink-0 ml-2 ${l.pctDifPpto < 0 ? "text-[#E62800]" : "text-[#166534]"}`}>
                      {l.pctDifPpto > 0 ? "+" : ""}{l.pctDifPpto}%
                    </span>
                  </div>
                  <div className="flex items-center gap-3 mb-2">
                    <span className="text-base font-black text-[#041224]">{fmtShort(l.primaNeta)}</span>
                    <span className="text-[11px] text-gray-400">/ {fmtShort(l.presupuesto)}</span>
                    <span className="text-[10px] text-gray-400 ml-auto">AA: {fmtShort(l.pnAnioAnt)}</span>
                  </div>
                  <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${Math.min(Math.max(pctPpto, 0), 100)}%`,
                        backgroundColor: pctPpto >= 100 ? '#10B981' : pctPpto >= 80 ? '#F59E0B' : '#EF4444'
                      }} />
                  </div>
                </div>
              )
            })}
            <div className="bg-[#041224] text-white rounded-lg px-3 py-2.5 flex justify-between items-center">
              <span className="font-bold text-sm">Total</span>
              <span className="font-bold text-sm">{fmt(totalLineas.primaNeta)}</span>
            </div>
          </>
        ) : drillLevel === "poliza" ? (
          <>
            {filteredPolizas.length === 0 ? (
              <p className="text-center text-[#888] py-8">Datos en integración</p>
            ) : filteredPolizas.map((p, idx) => (
              <div key={`${p.documento}-${idx}`} className="bg-white rounded-lg border border-gray-200 px-3 py-2 shadow-sm">
                <div className="flex justify-between items-center mb-1">
                  <span className="font-bold text-sm text-[#111]">{p.documento}</span>
                  <span className={`text-sm font-bold ${p.primaNeta < 0 ? "text-[#E62800]" : ""}`}>
                    {p.primaNeta < 0 ? `(${fmt(Math.abs(p.primaNeta))})` : fmt(p.primaNeta)}
                  </span>
                </div>
                <div className="text-xs text-gray-500">
                  <div>{p.aseguradora} · {p.ramo}</div>
                  <div>{fmtDate(p.fechaLiquidacion)}</div>
                </div>
              </div>
            ))}
            <div className="bg-[#041224] text-white rounded-lg px-3 py-2.5 flex justify-between">
              <span className="font-bold">Total</span><span className="font-bold">{fmt(polizaTotal)}</span>
            </div>
          </>
        ) : drillLevel === "vendedor" && tipoGroups && tipoGroups.length > 0 ? (
          /* MOBILE: Tier groups for Franquicias/Promotorías — with full data */
          <>
            {tipoGroups.map((group) => {
              const isExpanded = expandedTipos.has(group.tipo)
              const toggleTipo = () => {
                setExpandedTipos(prev => {
                  const next = new Set(prev)
                  if (next.has(group.tipo)) next.delete(group.tipo)
                  else next.add(group.tipo)
                  return next
                })
              }
              // Apply Top 10 + Otros within each tier
              const { vendedores: displayVendedores } = computeTop10VendedoresInTier(group.vendedores)
              return (
                <React.Fragment key={group.tipo}>
                  {/* Tier header — shows tier totals */}
                  <div
                    className="bg-[#F3F4F6] rounded-lg border border-gray-200 px-3 py-2.5 shadow-sm active:bg-gray-200"
                    onClick={toggleTipo}
                  >
                    <div className="flex justify-between items-center mb-1">
                      <span className="font-semibold text-sm text-[#111] flex items-center gap-1">
                        <ChevronDown className={`w-4 h-4 text-[#041224] transition-transform ${isExpanded ? "" : "-rotate-90"}`} />
                        Vendedores {group.tipo} <span className="text-[#666] font-normal">({group.vendedores.length})</span>
                      </span>
                      <span className={`text-sm font-black flex-shrink-0 ml-2 ${group.pctDifPpto !== null && group.pctDifPpto < 0 ? "text-[#E62800]" : "text-[#166534]"}`}>
                        {group.pctDifPpto !== null ? `${group.pctDifPpto > 0 ? "+" : ""}${group.pctDifPpto}%` : ""}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-base font-black text-[#041224]">{fmtShort(group.totalPrimaNeta)}</span>
                      {group.totalPresupuesto !== null && <span className="text-[11px] text-gray-400">/ {fmtShort(group.totalPresupuesto)}</span>}
                      {group.totalPnAnioAnt !== null && <span className="text-[10px] text-gray-400 ml-auto">AA: {fmtShort(group.totalPnAnioAnt)}</span>}
                    </div>
                  </div>
                  {/* Vendedores within tier — shows individual vendedor data */}
                  {isExpanded && displayVendedores.map((v) => {
                    const isOtros = v.vendedor.startsWith("Otros (")
                    const nextLevelFromVendedor = "grupo"
                    return (
                      <div
                        key={v.vendedor}
                        className={`ml-4 rounded-lg border border-gray-200 px-3 py-2 shadow-sm ${isOtros ? "bg-gray-100" : "bg-white active:bg-gray-50"}`}
                        onClick={() => !isOtros && drill(nextLevelFromVendedor as DrillLevel, v.vendedor, { ...sel, vendedor: v.vendedor })}
                      >
                        <div className="flex justify-between items-center mb-1">
                          <span className="font-bold text-sm text-[#111] flex items-center gap-1 truncate">
                            {!isOtros && <ChevronRight className="w-3.5 h-3.5 text-[#E62800] flex-shrink-0" />}
                            {v.vendedor}
                          </span>
                          <span className={`text-sm font-black flex-shrink-0 ml-2 ${v.pctDifPpto !== null && v.pctDifPpto < 0 ? "text-[#E62800]" : v.pctDifPpto !== null && v.pctDifPpto > 0 ? "text-[#166534]" : ""}`}>
                            {v.pctDifPpto !== null ? `${v.pctDifPpto > 0 ? "+" : ""}${v.pctDifPpto}%` : ""}
                          </span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-base font-black text-[#041224]">{fmtShort(v.primaNeta)}</span>
                          {v.presupuesto !== null && <span className="text-[11px] text-gray-400">/ {fmtShort(v.presupuesto)}</span>}
                          {v.pnAnioAnt > 0 && <span className="text-[10px] text-gray-400 ml-auto">AA: {fmtShort(v.pnAnioAnt)}</span>}
                        </div>
                      </div>
                    )
                  })}
                </React.Fragment>
              )
            })}
            <div className="bg-[#041224] text-white rounded-lg px-3 py-2.5 flex justify-between">
              <span className="font-bold">Total</span><span className="font-bold">{fmt(tipoGroups.reduce((s, g) => s + g.totalPrimaNeta, 0))}</span>
            </div>
          </>
        ) : (
          <>
            {displayRows.length === 0 ? (
              <p className="text-center text-[#888] py-8">Sin datos para este periodo</p>
            ) : displayRows.map((r) => {
              const isOtros = r.name.startsWith("Otros (")
              const nextLevel: DrillLevel | null = isOtros ? null : (
                drillLevel === "gerencia" ? "vendedor" :
                drillLevel === "vendedor" ? "grupo" :
                drillLevel === "grupo" ? "cliente" :
                null
              )
              const selKey = isOtros ? null : (drillLevel === "gerencia" ? "gerencia" : drillLevel === "vendedor" ? "vendedor" : drillLevel === "grupo" ? "grupo" : drillLevel === "cliente" ? "cliente" : null)
              return (
                <div key={r.name} className={`rounded-lg border border-gray-200 px-3 py-2 shadow-sm ${isOtros ? "bg-gray-100" : "bg-white active:bg-gray-50"}`}
                  onClick={() => nextLevel && selKey && drill(nextLevel, r.name, { ...sel, [selKey]: r.name })}>
                  <div className="flex justify-between items-center">
                    <span className="font-bold text-sm text-[#111] flex items-center gap-1">
                      {nextLevel && <ChevronRight className="w-3.5 h-3.5 text-[#E62800]" />}
                      {r.name}
                    </span>
                    <span className={`text-sm font-bold ${r.primaNeta < 0 ? "text-[#E62800]" : ""}`}>
                      {r.primaNeta < 0 ? `(${fmt(Math.abs(r.primaNeta))})` : fmt(r.primaNeta)}
                    </span>
                  </div>
                </div>
              )
            })}
            <div className="bg-[#041224] text-white rounded-lg px-3 py-2.5 flex justify-between">
              <span className="font-bold">Total</span><span className="font-bold">{fmt(rowTotal)}</span>
            </div>
          </>
        )}
      </div>

      {/* DESKTOP TABLE VIEW — Abraham: scroll interno, adaptive max-height only when many rows */}
      <div ref={tableRef} className="hidden md:block bi-card overflow-x-auto overflow-y-auto w-full" style={{ maxHeight: manyRows ? '50vh' : 'none' }}>
        <table className="w-full text-xs">
          <thead className="sticky top-0 z-20">
            {drillLevel === "linea" ? (
              <tr className="bg-[#041224] text-white border-b-2 border-b-[#E62800]">
                <th className="w-6 px-1 py-2.5 sticky left-0 z-30 bg-[#041224]"></th>
                <th className="text-left px-3 py-2.5 text-xs font-semibold uppercase tracking-wider whitespace-nowrap sticky left-6 z-30 bg-[#041224]">Línea de negocio</th>
                <th className="text-center px-3 py-2.5 text-xs font-semibold uppercase tracking-wider whitespace-nowrap bg-[#041224]">Prima neta</th>
                <th className="text-center px-3 py-2.5 text-xs font-semibold uppercase tracking-wider whitespace-nowrap bg-[#041224]">Presupuesto</th>
                <th className="text-center px-3 py-2.5 text-xs font-semibold uppercase tracking-wider whitespace-nowrap bg-[#041224]">Diferencia</th>
                <th className="text-center px-3 py-2.5 text-xs font-semibold uppercase tracking-wider whitespace-nowrap bg-[#041224]">% Dif ppto</th>
                <th className="text-center px-3 py-2.5 text-xs font-semibold uppercase tracking-wider whitespace-nowrap bg-[#041224]">{cmpLabel.col}</th>
                <th className="text-center px-3 py-2.5 text-xs font-semibold uppercase tracking-wider whitespace-nowrap bg-[#041224]">{cmpLabel.difCol}</th>
                <th className="text-center px-3 py-2.5 text-xs font-semibold uppercase tracking-wider whitespace-nowrap bg-[#041224]">{cmpLabel.pctCol}</th>
                <th className="text-center px-3 py-2.5 text-xs font-semibold uppercase tracking-wider whitespace-nowrap bg-[#041224]">Pendiente</th>
              </tr>
            ) : drillLevel === "poliza" ? (
              <tr className="bg-[#041224] text-white border-b-2 border-b-[#E62800]">
                <th className="text-left px-3 py-2.5 text-xs font-semibold uppercase tracking-wider whitespace-nowrap sticky left-0 z-30 bg-[#041224]">Documento</th>
                <th className="text-left px-3 py-2.5 text-xs font-semibold uppercase tracking-wider whitespace-nowrap bg-[#041224]">Aseguradora</th>
                <th className="text-left px-3 py-2.5 text-xs font-semibold uppercase tracking-wider whitespace-nowrap bg-[#041224]">Ramo</th>
                <th className="text-left px-3 py-2.5 text-xs font-semibold uppercase tracking-wider whitespace-nowrap bg-[#041224]">Subramo</th>
                <th className="text-left px-3 py-2.5 text-xs font-semibold uppercase tracking-wider whitespace-nowrap bg-[#041224]">F. Liquidación</th>
                <th className="text-left px-3 py-2.5 text-xs font-semibold uppercase tracking-wider whitespace-nowrap bg-[#041224]">F. Lím. Pago</th>
                <th className="text-center px-3 py-2.5 text-xs font-semibold uppercase tracking-wider whitespace-nowrap bg-[#041224]">Prima neta</th>
              </tr>
            ) : (
              <tr className="bg-[#041224] text-white border-b-2 border-b-[#E62800]">
                <th className="w-6 px-1 py-2.5 sticky left-0 z-30 bg-[#041224]"></th>
                <th className="text-left px-3 py-2.5 text-xs font-semibold uppercase tracking-wider whitespace-nowrap sticky left-6 z-30 bg-[#041224]">{levelLabels[drillLevel]}</th>
                <th className="text-center px-3 py-2.5 text-xs font-semibold uppercase tracking-wider whitespace-nowrap bg-[#041224]">Prima neta</th>
                {hasPresupuesto && <th className="text-center px-3 py-2.5 text-xs font-semibold uppercase tracking-wider whitespace-nowrap bg-[#041224]">Presupuesto</th>}
                {hasDiferencia && <th className="text-center px-3 py-2.5 text-xs font-semibold uppercase tracking-wider whitespace-nowrap bg-[#041224]">Diferencia</th>}
                {hasPctDifPpto && <th className="text-center px-3 py-2.5 text-xs font-semibold uppercase tracking-wider whitespace-nowrap bg-[#041224]">% Dif ppto</th>}
                {hasPnAnioAnt && <th className="text-center px-3 py-2.5 text-xs font-semibold uppercase tracking-wider whitespace-nowrap bg-[#041224]">{cmpLabel.col}</th>}
                {hasDifYoY && <th className="text-center px-3 py-2.5 text-xs font-semibold uppercase tracking-wider whitespace-nowrap bg-[#041224]">{cmpLabel.difCol}</th>}
                {hasPctDifYoY && <th className="text-center px-3 py-2.5 text-xs font-semibold uppercase tracking-wider whitespace-nowrap bg-[#041224]">{cmpLabel.pctCol}</th>}
                {hasPendiente && <th className="text-center px-3 py-2.5 text-xs font-semibold uppercase tracking-wider whitespace-nowrap bg-[#041224]">Pendiente</th>}
              </tr>
            )}
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={10} className="px-3 py-8 text-center text-gray-400">Cargando...</td></tr>

            ) : drillLevel === "linea" ? (
              /* ─── LEVEL 1: LÍNEAS (9 columns) ─── */
              <>
                {filteredLineas.map((l, idx) => {
                  const dif = l.diferencia
                  const difYoy = l.difYoY
                  // Semáforo: RED if below last year, AMBER if between, GREEN if at/above budget
                  const semaforoColor = l.primaNeta >= l.presupuesto
                    ? "text-[#059669]"
                    : l.primaNeta >= l.pnAnioAnt
                    ? "text-amber-500"
                    : "text-[#E62800]"
                  const rowBg = idx % 2 === 1 ? "bg-[#E5E7E9]/30" : "bg-white"
                  return (
                    <tr key={l.linea} id={toSlug(l.linea)} className={`group border-b border-[#F0F0F0] cursor-pointer transition-all duration-150 hover:bg-[#FFF5F5] ${rowBg}`}
                      onClick={() => drill("gerencia", l.linea, { linea: l.linea })}>
                      <td className={`px-1 py-3 text-center sticky left-0 z-10 ${rowBg} group-hover:bg-[#FFF5F5]`}>
                        <ChevronRight className="w-3.5 h-3.5 text-[#E62800] inline transition-transform group-hover:scale-125 group-hover:translate-x-1" />
                      </td>
                      <td className={`px-3 py-3 text-sm font-semibold text-[#111] text-left sticky left-6 z-10 ${rowBg} group-hover:bg-[#FFF5F5]`}>{l.linea}</td>
                      <td className="px-3 py-3 text-center text-sm font-bold tabular-nums">{fmt(l.primaNeta)}</td>
                      <td className="px-3 py-3 text-center tabular-nums text-sm text-gray-600 font-bold">{l.presupuesto ? fmt(l.presupuesto) : ""}</td>
                      <td className={`px-3 py-3 text-center text-sm font-bold tabular-nums ${semaforoColor}`}>{l.presupuesto ? (dif < 0 ? `(${fmt(Math.abs(dif))})` : fmt(dif)) : ""}</td>
                      <td className={`px-3 py-3 text-center text-sm font-bold tabular-nums ${semaforoColor}`}>{l.pctDifPpto ? `${l.pctDifPpto > 0 ? "+" : ""}${l.pctDifPpto}%` : ""}</td>
                      <td className="px-3 py-3 text-center text-sm font-bold tabular-nums text-gray-800">{l.pnAnioAnt ? fmt(l.pnAnioAnt) : ""}</td>
                      <td className={`px-3 py-3 text-center text-sm font-bold tabular-nums ${difYoy < 0 ? "text-[#E62800]" : ""}`}>{l.pnAnioAnt ? (difYoy < 0 ? `(${fmt(Math.abs(difYoy))})` : fmt(difYoy)) : ""}</td>
                      <td className={`px-3 py-3 text-center text-sm font-bold tabular-nums ${l.pctDifYoY < 0 ? "text-[#E62800]" : l.pctDifYoY > 0 ? "text-[#059669]" : ""}`}>{l.pctDifYoY ? `${l.pctDifYoY > 0 ? "+" : ""}${l.pctDifYoY}%` : ""}</td>
                      <td className="px-3 py-3 text-center text-sm font-bold tabular-nums text-gray-600">
                        {l.pendiente ? fmt(l.pendiente) : ""}
                      </td>
                    </tr>
                  )
                })}
                <tr className="bg-[#041224] text-white border-t-2 cursor-default sticky bottom-0 z-10">
                  <td className="px-1 py-3 sticky left-0 z-10 bg-[#041224]"></td>
                  <td className="px-3 py-3 text-sm font-bold text-left sticky left-6 z-10 bg-[#041224]">Total</td>
                  <td className="px-3 py-3 text-right text-sm font-bold tabular-nums">{fmt(totalLineas.primaNeta)}</td>
                  <td className="px-3 py-3 text-right text-sm font-bold tabular-nums">{totalLineas.presupuesto ? fmt(totalLineas.presupuesto) : ""}</td>
                  <td className="px-3 py-3 text-right text-sm font-bold tabular-nums">{totalLineas.presupuesto ? (totalDif < 0 ? `(${fmt(Math.abs(totalDif))})` : fmt(totalDif)) : ""}</td>
                  <td className="px-3 py-3 text-right text-sm font-bold tabular-nums">{totalDifPct ? `${totalDifPct}%` : ""}</td>
                  <td className="px-3 py-3 text-right text-sm font-bold tabular-nums">{totalLineas.pnAnioAnt ? fmt(totalLineas.pnAnioAnt) : ""}</td>
                  <td className="px-3 py-3 text-right text-sm font-bold tabular-nums">{totalLineas.pnAnioAnt ? (totalDifYoy < 0 ? `(${fmt(Math.abs(totalDifYoy))})` : fmt(totalDifYoy)) : ""}</td>
                  <td className="px-3 py-3 text-right text-sm font-bold tabular-nums">{totalDifYoyPct ? `${totalDifYoyPct}%` : ""}</td>
                  <td className="px-3 py-3 text-right text-sm font-bold tabular-nums">{totalLineas.pendiente ? fmt(totalLineas.pendiente) : ""}</td>
                </tr>
              </>

            ) : drillLevel === "poliza" ? (
              /* ─── LEVEL 6: PÓLIZAS ─── */
              <>
                {filteredPolizas.length === 0 ? (
                  <tr><td colSpan={7} className="px-3 py-8 text-center text-[#888]">Datos en integración</td></tr>
                ) : filteredPolizas.map((p, idx) => {
                  const rowBg = idx % 2 === 1 ? "bg-[#E5E7E9]/30" : "bg-white"
                  return (
                    <tr key={`${p.documento}-${idx}`} className={`group border-b border-[#F0F0F0] hover:bg-[#FFF5F5] ${rowBg}`}>
                      <td className={`px-3 py-3 font-medium text-sm text-[#111] text-left sticky left-0 z-10 ${rowBg} group-hover:bg-[#FFF5F5]`}>{p.documento}</td>
                      <td className="px-3 py-3 text-sm text-[#333] text-left">{p.aseguradora}</td>
                      <td className="px-3 py-3 text-sm text-[#333] text-left">{p.ramo}</td>
                      <td className="px-3 py-3 text-sm text-[#666] text-left">{p.subramo}</td>
                      <td className="px-3 py-3 text-sm text-[#666] text-left tabular-nums">{fmtDate(p.fechaLiquidacion)}</td>
                      <td className="px-3 py-3 text-sm text-[#666] text-left tabular-nums">{fmtDate(p.fechaLimPago)}</td>
                      <td className={`px-3 py-3 text-center text-sm font-medium tabular-nums ${p.primaNeta < 0 ? "text-[#E62800]" : ""}`}>{p.primaNeta < 0 ? `(${fmt(Math.abs(p.primaNeta))})` : fmt(p.primaNeta)}</td>
                    </tr>
                  )
                })}
                <tr className="bg-[#041224] text-white border-t-2 cursor-default sticky bottom-0 z-10">
                  <td className="px-3 py-3 text-sm font-bold sticky left-0 z-10 bg-[#041224]" colSpan={6}>Total</td>
                  <td className="px-3 py-3 text-right text-sm font-bold tabular-nums">{fmt(polizaTotal)}</td>
                </tr>
              </>

            ) : drillLevel === "vendedor" && tipoGroups && tipoGroups.length > 0 ? (
              /* ─── VENDEDOR LEVEL WITH TIPO GROUPER (Franquicias/Promotorías) — FULL 9 COLUMNS ─── */
              <>
                {tipoGroups.map((group, gIdx) => {
                  const isExpanded = expandedTipos.has(group.tipo)
                  const toggleTipo = () => {
                    setExpandedTipos(prev => {
                      const next = new Set(prev)
                      if (next.has(group.tipo)) next.delete(group.tipo)
                      else next.add(group.tipo)
                      return next
                    })
                  }
                  // Apply Top 10 + Otros within each tier
                  const { vendedores: displayVendedores } = computeTop10VendedoresInTier(group.vendedores)
                  // Tier semáforo color
                  const tierSemaforoColor = group.totalPresupuesto !== null && group.totalPnAnioAnt !== null
                    ? (group.totalPrimaNeta >= group.totalPresupuesto
                        ? "text-[#059669]"
                        : group.totalPrimaNeta >= group.totalPnAnioAnt
                        ? "text-amber-500"
                        : "text-[#E62800]")
                    : (group.totalDiferencia !== null && group.totalDiferencia < 0 ? "text-[#E62800]" : "")
                  return (
                    <React.Fragment key={group.tipo}>
                      {/* Tier group header row — shows SUMMED data for all 9 columns */}
                      <tr
                        className="group bg-[#F3F4F6] border-b border-[#E5E7EB] cursor-pointer hover:bg-[#E5E7EB] transition-colors"
                        onClick={toggleTipo}
                      >
                        <td className="px-1 py-3 text-center w-6 sticky left-0 z-10 bg-[#F3F4F6] group-hover:bg-[#E5E7EB]">
                          <ChevronDown className={`w-3.5 h-3.5 text-[#041224] inline transition-transform ${isExpanded ? "" : "-rotate-90"}`} />
                        </td>
                        <td className="px-3 py-3 text-sm font-semibold text-[#111] text-left sticky left-6 z-10 bg-[#F3F4F6] group-hover:bg-[#E5E7EB]">
                          Vendedores {group.tipo} <span className="text-[#666] font-normal">({group.vendedores.length})</span>
                        </td>
                        <td className="px-3 py-3 text-center tabular-nums text-sm font-semibold">{fmt(group.totalPrimaNeta)}</td>
                        <td className="px-3 py-3 text-center tabular-nums text-sm text-gray-600 font-medium">
                          {group.totalPresupuesto !== null && fmt(group.totalPresupuesto)}
                        </td>
                        <td className={`px-3 py-3 text-center tabular-nums text-sm font-medium ${tierSemaforoColor}`}>
                          {group.totalDiferencia !== null && (group.totalDiferencia < 0 ? `(${fmt(Math.abs(group.totalDiferencia))})` : fmt(group.totalDiferencia))}
                        </td>
                        <td className={`px-3 py-3 text-center tabular-nums text-sm font-medium ${tierSemaforoColor}`}>
                          {group.pctDifPpto !== null && `${group.pctDifPpto > 0 ? "+" : ""}${group.pctDifPpto}%`}
                        </td>
                        <td className="px-3 py-3 text-center tabular-nums text-sm text-gray-800 font-medium">
                          {group.totalPnAnioAnt !== null && fmt(group.totalPnAnioAnt)}
                        </td>
                        <td className={`px-3 py-3 text-center tabular-nums text-sm font-medium ${group.totalDifYoY !== null && group.totalDifYoY < 0 ? "text-[#E62800]" : ""}`}>
                          {group.totalDifYoY !== null && (group.totalDifYoY < 0 ? `(${fmt(Math.abs(group.totalDifYoY))})` : fmt(group.totalDifYoY))}
                        </td>
                        <td className={`px-3 py-3 text-center tabular-nums text-sm font-medium ${group.pctDifYoY !== null && group.pctDifYoY < 0 ? "text-[#E62800]" : group.pctDifYoY !== null && group.pctDifYoY > 0 ? "text-[#059669]" : ""}`}>
                          {group.pctDifYoY !== null && `${group.pctDifYoY > 0 ? "+" : ""}${group.pctDifYoY}%`}
                        </td>
                        <td className="px-3 py-3 text-center tabular-nums text-sm text-gray-600 font-medium">
                          {group.totalPendiente !== null && fmt(group.totalPendiente)}
                        </td>
                      </tr>
                      {/* Individual vendedor rows within tier (when expanded) — FULL 9 COLUMNS */}
                      {isExpanded && displayVendedores.map((v, vIdx) => {
                        const isOtros = v.vendedor.startsWith("Otros (")
                        const nextLevelFromVendedor = "grupo"
                        // Vendedor semáforo color
                        const vSemaforoColor = v.presupuesto !== null && v.pnAnioAnt > 0
                          ? (v.primaNeta >= v.presupuesto
                              ? "text-[#059669]"
                              : v.primaNeta >= v.pnAnioAnt
                              ? "text-amber-500"
                              : "text-[#E62800]")
                          : (v.diferencia !== null && v.diferencia < 0 ? "text-[#E62800]" : "")
                        const vRowBg = isOtros ? "bg-gray-100" : vIdx % 2 === 1 ? "bg-[#E5E7E9]/30" : "bg-white"
                        return (
                          <tr
                            key={v.vendedor}
                            className={`group border-b border-[#F0F0F0] ${isOtros ? "" : "cursor-pointer"} transition-all duration-150 hover:bg-[#FFF5F5] ${vRowBg}`}
                            onClick={() => !isOtros && drill(nextLevelFromVendedor as DrillLevel, v.vendedor, { ...sel, vendedor: v.vendedor })}
                          >
                            <td className={`px-1 py-3 text-center w-6 sticky left-0 z-10 ${vRowBg} group-hover:bg-[#FFF5F5]`}>
                              {!isOtros && <ChevronRight className="w-3.5 h-3.5 text-[#E62800] inline transition-transform group-hover:scale-110 group-hover:translate-x-0.5" />}
                            </td>
                            <td className={`pl-8 pr-3 py-3 text-sm font-medium text-[#111] text-left sticky left-6 z-10 ${vRowBg} group-hover:bg-[#FFF5F5]`}>{v.vendedor}</td>
                            <td className={`px-3 py-3 text-center tabular-nums text-sm font-medium ${v.primaNeta < 0 ? "text-[#E62800]" : ""}`}>
                              {v.primaNeta < 0 ? `(${fmt(Math.abs(v.primaNeta))})` : fmt(v.primaNeta)}
                            </td>
                            <td className="px-3 py-3 text-center tabular-nums text-sm text-gray-600 font-medium">
                              {v.presupuesto !== null && fmt(v.presupuesto)}
                            </td>
                            <td className={`px-3 py-3 text-center tabular-nums text-sm font-medium ${vSemaforoColor}`}>
                              {v.diferencia !== null && (v.diferencia < 0 ? `(${fmt(Math.abs(v.diferencia))})` : fmt(v.diferencia))}
                            </td>
                            <td className={`px-3 py-3 text-center tabular-nums text-sm font-medium ${vSemaforoColor}`}>
                              {v.pctDifPpto !== null && `${v.pctDifPpto > 0 ? "+" : ""}${v.pctDifPpto}%`}
                            </td>
                            <td className="px-3 py-3 text-center tabular-nums text-sm text-gray-800 font-medium">
                              {v.pnAnioAnt > 0 && fmt(v.pnAnioAnt)}
                            </td>
                            <td className={`px-3 py-3 text-center tabular-nums text-sm font-medium ${v.difYoY !== null && v.difYoY < 0 ? "text-[#E62800]" : ""}`}>
                              {v.difYoY !== null && (v.difYoY < 0 ? `(${fmt(Math.abs(v.difYoY))})` : fmt(v.difYoY))}
                            </td>
                            <td className={`px-3 py-3 text-center tabular-nums text-sm font-medium ${v.pctDifYoY !== null && v.pctDifYoY < 0 ? "text-[#E62800]" : v.pctDifYoY !== null && v.pctDifYoY > 0 ? "text-[#059669]" : ""}`}>
                              {v.pctDifYoY !== null && `${v.pctDifYoY > 0 ? "+" : ""}${v.pctDifYoY}%`}
                            </td>
                            <td className="px-3 py-3 text-center tabular-nums text-sm text-gray-600 font-medium">
                              {v.pendiente !== null && fmt(v.pendiente)}
                            </td>
                          </tr>
                        )
                      })}
                    </React.Fragment>
                  )
                })}
                {/* Grand total row with summed columns */}
                {(() => {
                  const grandTotalPN = tipoGroups.reduce((s, g) => s + g.totalPrimaNeta, 0)
                  const grandTotalPpto = tipoGroups.reduce((s, g) => s + (g.totalPresupuesto ?? 0), 0)
                  const grandTotalPnAA = tipoGroups.reduce((s, g) => s + (g.totalPnAnioAnt ?? 0), 0)
                  const grandTotalPend = tipoGroups.reduce((s, g) => s + (g.totalPendiente ?? 0), 0)
                  const grandDif = grandTotalPpto > 0 ? grandTotalPN - grandTotalPpto : null
                  const grandPctDif = grandTotalPpto > 0 && grandDif !== null ? Math.round((grandDif / grandTotalPpto) * 1000) / 10 : null
                  const grandDifYoY = grandTotalPnAA > 0 ? grandTotalPN - grandTotalPnAA : null
                  const grandPctDifYoY = grandTotalPnAA > 0 && grandDifYoY !== null ? Math.round((grandDifYoY / grandTotalPnAA) * 10000) / 100 : null
                  return (
                    <tr className="bg-[#041224] text-white border-t-2 cursor-default sticky bottom-0 z-10">
                      <td className="px-1 py-3 w-6 sticky left-0 z-10 bg-[#041224]"></td>
                      <td className="px-3 py-3 text-sm font-bold text-left sticky left-6 z-10 bg-[#041224]">Total</td>
                      <td className="px-3 py-3 text-right text-sm font-bold tabular-nums">{fmt(grandTotalPN)}</td>
                      <td className="px-3 py-3 text-right text-sm font-bold tabular-nums">{grandTotalPpto > 0 && fmt(grandTotalPpto)}</td>
                      <td className="px-3 py-3 text-right text-sm font-bold tabular-nums">{grandDif !== null && (grandDif < 0 ? `(${fmt(Math.abs(grandDif))})` : fmt(grandDif))}</td>
                      <td className="px-3 py-3 text-right text-sm font-bold tabular-nums">{grandPctDif !== null && `${grandPctDif > 0 ? "+" : ""}${grandPctDif}%`}</td>
                      <td className="px-3 py-3 text-right text-sm font-bold tabular-nums">{grandTotalPnAA > 0 && fmt(grandTotalPnAA)}</td>
                      <td className="px-3 py-3 text-right text-sm font-bold tabular-nums">{grandDifYoY !== null && (grandDifYoY < 0 ? `(${fmt(Math.abs(grandDifYoY))})` : fmt(grandDifYoY))}</td>
                      <td className="px-3 py-3 text-right text-sm font-bold tabular-nums">{grandPctDifYoY !== null && `${grandPctDifYoY > 0 ? "+" : ""}${grandPctDifYoY}%`}</td>
                      <td className="px-3 py-3 text-right text-sm font-bold tabular-nums">{grandTotalPend > 0 && fmt(grandTotalPend)}</td>
                    </tr>
                  )
                })()}
              </>

            ) : (
              /* ─── LEVELS 2-5: DYNAMIC COLUMNS (hide empty) ─── */
              <>
                {displayRows.length === 0 ? (
                  <tr><td colSpan={visibleColCount} className="px-3 py-8 text-center text-[#888]">
                    {drillLevel === "cliente" || drillLevel === "grupo"
                      ? "Datos en integración"
                      : drillLevel === "vendedor"
                      ? "Sin vendedores registrados para esta gerencia"
                      : `Sin datos para este periodo ${year}`}
                  </td></tr>
                ) : displayRows.map((r, idx) => {
                  const isOtros = r.name.startsWith("Otros (")
                  const nextLevel: DrillLevel | null = isOtros ? null : (
                    drillLevel === "gerencia" ? "vendedor" :
                    drillLevel === "vendedor" ? "grupo" :
                    drillLevel === "grupo" ? "cliente" :
                    null
                  )
                  const selKey = isOtros ? null : (
                    drillLevel === "gerencia" ? "gerencia" :
                    drillLevel === "vendedor" ? "vendedor" :
                    drillLevel === "grupo" ? "grupo" :
                    drillLevel === "cliente" ? "cliente" : null
                  )
                  // Semáforo: RED if below last year, AMBER if between, GREEN if at/above budget
                  const semaforoColor = r.presupuesto !== null && r.pnAnioAnt !== null
                    ? (r.primaNeta >= r.presupuesto
                        ? "text-[#059669]"
                        : r.primaNeta >= r.pnAnioAnt
                        ? "text-amber-500"
                        : "text-[#E62800]")
                    : (r.diferencia !== null && r.diferencia < 0 ? "text-[#E62800]" : "")

                  const rRowBg = isOtros ? "bg-gray-100" : idx % 2 === 1 ? "bg-[#E5E7E9]/30" : "bg-white"
                  return (
                    <tr key={r.name}
                      className={`group border-b border-[#F0F0F0] ${nextLevel ? "cursor-pointer" : ""} transition-all duration-150 ${rRowBg} hover:bg-[#FFF5F5]`}
                      onClick={() => nextLevel && selKey && drill(nextLevel, r.name, { ...sel, [selKey]: r.name })}>
                      <td className={`px-1 py-3 text-center w-6 sticky left-0 z-10 ${rRowBg} group-hover:bg-[#FFF5F5]`}>
                        {nextLevel && <ChevronRight className="w-3.5 h-3.5 text-[#E62800] inline transition-transform group-hover:scale-110 group-hover:translate-x-0.5" />}
                      </td>
                      <td className={`px-3 py-3 text-sm font-semibold text-[#111] text-left sticky left-6 z-10 ${rRowBg} group-hover:bg-[#FFF5F5]`}>{r.name}</td>
                      <td className={`px-3 py-3 text-center tabular-nums text-sm font-bold ${r.primaNeta < 0 ? "text-[#E62800]" : ""}`}>
                        {r.primaNeta < 0 ? `(${fmt(Math.abs(r.primaNeta))})` : fmt(r.primaNeta)}
                      </td>
                      {hasPresupuesto && <td className="px-3 py-3 text-center tabular-nums text-sm text-gray-600 font-bold">{(groupBudgetOnlyTotal && String(r.name || "").trim().toLowerCase() === "sin grupo") ? "" : (r.presupuesto !== null && fmt(r.presupuesto))}</td>}
                      {hasDiferencia && <td className={`px-3 py-3 text-center tabular-nums text-sm font-bold ${semaforoColor}`}>{(groupBudgetOnlyTotal && String(r.name || "").trim().toLowerCase() === "sin grupo") ? "" : (r.diferencia !== null && (r.diferencia < 0 ? `(${fmt(Math.abs(r.diferencia))})` : fmt(r.diferencia)))}</td>}
                      {hasPctDifPpto && <td className={`px-3 py-3 text-center tabular-nums text-sm font-bold ${semaforoColor}`}>{(groupBudgetOnlyTotal && String(r.name || "").trim().toLowerCase() === "sin grupo") ? "" : (r.pctDifPpto !== null && `${r.pctDifPpto > 0 ? "+" : ""}${r.pctDifPpto}%`)}</td>}
                      {hasPnAnioAnt && <td className="px-3 py-3 text-center tabular-nums text-sm text-gray-800 font-bold">{r.pnAnioAnt !== null && fmt(r.pnAnioAnt)}</td>}
                      {hasDifYoY && <td className={`px-3 py-3 text-center tabular-nums text-sm font-bold ${r.difYoY === null ? "" : r.difYoY < 0 ? "text-[#E62800]" : ""}`}>{r.difYoY !== null && (r.difYoY < 0 ? `(${fmt(Math.abs(r.difYoY))})` : fmt(r.difYoY))}</td>}
                      {hasPctDifYoY && <td className={`px-3 py-3 text-center tabular-nums text-sm font-bold ${r.pctDifYoY === null ? "" : r.pctDifYoY < 0 ? "text-[#E62800]" : r.pctDifYoY > 0 ? "text-[#059669]" : ""}`}>{r.pctDifYoY !== null && `${r.pctDifYoY > 0 ? "+" : ""}${r.pctDifYoY}%`}</td>}
                      {hasPendiente && <td className="px-3 py-3 text-center tabular-nums text-sm text-gray-600 font-bold">
                        {r.pendiente !== null && fmt(r.pendiente)}
                      </td>}
                    </tr>
                  )
                })}
                <tr className="bg-[#041224] text-white border-t-2 cursor-default sticky bottom-0 z-10">
                  <td className="px-1 py-3 w-6 sticky left-0 z-10 bg-[#041224]"></td>
                  <td className="px-3 py-3 text-sm font-bold text-left sticky left-6 z-10 bg-[#041224]">Total</td>
                  <td className="px-3 py-3 text-right text-sm font-bold tabular-nums">{fmt(totalRows.primaNeta)}</td>
                  {hasPresupuesto && <td className="px-3 py-3 text-right text-sm font-bold tabular-nums">{totalRows.presupuesto ? fmt(totalRows.presupuesto) : ""}</td>}
                  {hasDiferencia && <td className="px-3 py-3 text-right text-sm font-bold tabular-nums">{totalRows.presupuesto ? (totalRowsDif < 0 ? `(${fmt(Math.abs(totalRowsDif))})` : fmt(totalRowsDif)) : ""}</td>}
                  {hasPctDifPpto && <td className="px-3 py-3 text-right text-sm font-bold tabular-nums">{totalRowsDifPct ? `${totalRowsDifPct}%` : ""}</td>}
                  {hasPnAnioAnt && <td className="px-3 py-3 text-right text-sm font-bold tabular-nums">{totalRows.pnAnioAnt ? fmt(totalRows.pnAnioAnt) : ""}</td>}
                  {hasDifYoY && <td className="px-3 py-3 text-right text-sm font-bold tabular-nums">{totalRows.pnAnioAnt ? (totalRowsDifYoy < 0 ? `(${fmt(Math.abs(totalRowsDifYoy))})` : fmt(totalRowsDifYoy)) : ""}</td>}
                  {hasPctDifYoY && <td className="px-3 py-3 text-right text-sm font-bold tabular-nums">{totalRowsDifYoyPct ? `${totalRowsDifYoyPct}%` : ""}</td>}
                  {hasPendiente && <td className="px-3 py-3 text-right text-sm font-bold tabular-nums">{totalRows.pendiente ? fmt(totalRows.pendiente) : ""}</td>}
                </tr>
              </>
            )}
          </tbody>
        </table>
      </div>

      {/* Dynamic Charts — bottom half, reacts to drill level */}
      <DrillCharts
        rows={
          drillLevel === "linea"
            ? filteredLineas.map(l => ({ name: l.linea, primaNeta: l.primaNeta }))
            : drillLevel === "poliza"
            ? filteredPolizas.map(p => ({ name: p.documento, primaNeta: p.primaNeta }))
            : drillLevel === "vendedor" && tipoGroups && tipoGroups.length > 0
            ? tipoGroups.map(g => ({ name: `${g.tipo} (${g.vendedores.length})`, primaNeta: g.totalPrimaNeta }))
            : filteredRows.map(r => ({ name: r.name, primaNeta: r.primaNeta }))
        }
        levelLabel={drillLevel === "vendedor" && tipoGroups && tipoGroups.length > 0 ? "Tier de Vendedor" : levelLabels[drillLevel]}
        parentLabel={crumbs.length > 0 ? crumbs.map(c => c.label).join(" > ") : "Todas las líneas"}
        loading={loading}
      />

      {/* Natural Language Query — beta, feature flag OFF */}
      <NLQuery periodo={periodo} year={year} />

      <PageFooter showFootnote={drillLevel === "linea"} />
      </div>
    </div>
  )
}
