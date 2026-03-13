"use client"

import { useState, useEffect, useRef, useCallback, Suspense } from "react"
import { useSearchParams } from "next/navigation"
import { ChevronRight, ChevronLeft, Search, Download } from "lucide-react"
import { PageTabs } from "@/components/page-tabs"
import { PageFooter } from "@/components/page-footer"
import { PeriodFilter } from "@/components/period-filter"
import { getLineasNegocio, getGerencias, getVendedores, getGrupos, getClientes, getPolizas, globalSearch, getLastDataDate } from "@/lib/queries"
import type { SearchResult } from "@/lib/queries"
import type { PolizaRow } from "@/lib/queries"
import { exportExcel, exportPDF } from "@/lib/export"
import { NLQuery } from "@/components/nl-query"
import { DrillCharts } from "@/components/drill-charts"

function fmt(v: number) {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(v)
}
function fmtShort(v: number) {
  if (Math.abs(v) >= 1e6) return `$${(v / 1e6).toFixed(1)}M`
  if (Math.abs(v) >= 1e3) return `$${(v / 1e3).toFixed(0)}K`
  return `$${v}`
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
const SEED: LineaFull[] = [
  { linea: "Click Franquicias", primaNeta: 52577939, presupuesto: 68989976, diferencia: -16412037, pctDifPpto: -23.8, pnAnioAnt: 45038829, difYoY: 7539110, pctDifYoY: 16.74, pendiente: 37639869 },
  { linea: "Click Promotorías", primaNeta: 20017383, presupuesto: 25534211, diferencia: -5516828, pctDifPpto: -21.6, pnAnioAnt: 19422359, difYoY: 595024, pctDifYoY: 3.06, pendiente: 21892390 },
  { linea: "Corporate", primaNeta: 12708705, presupuesto: 16242717, diferencia: -3534012, pctDifPpto: -21.8, pnAnioAnt: 13539625, difYoY: -830920, pctDifYoY: -6.14, pendiente: 8763272 },
  { linea: "Cartera Tradicional", primaNeta: 10632028, presupuesto: 12322087, diferencia: -1690059, pctDifPpto: -13.7, pnAnioAnt: 10057425, difYoY: 574603, pctDifYoY: 5.71, pendiente: 7416036 },
  { linea: "Call Center", primaNeta: 2602364, presupuesto: 6398081, diferencia: -3795717, pctDifPpto: -59.3, pnAnioAnt: 853685, difYoY: 1748679, pctDifYoY: 204.84, pendiente: 12236199 },
]

function toSlug(name: string) {
  return name.toLowerCase().replace(/\s+/g, "-")
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
  const [year, setYear] = useState("2026")
  const [periodos, setPeriodos] = useState<number[]>([2])
  const [search, setSearch] = useState("")
  const [loading, setLoading] = useState(true)
  const [mounted, setMounted] = useState(false)
  const [didAutoDrill, setDidAutoDrill] = useState(false)
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
  const [lineas, setLineas] = useState<LineaFull[]>(SEED)
  const [rows, setRows] = useState<DrillRow[]>([])
  const [polizas, setPolizas] = useState<PolizaRow[]>([])
  const [lastDataDate, setLastDataDate] = useState<string | null>(null)

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
  const periodo = periodos[0] ?? 2

  // Load líneas from Supabase, merge with SEED for budget/comparison columns
  useEffect(() => {
    let cancelled = false

    // Reset drill state
    setDrillLevel("linea")
    setCrumbs([])
    setSel({})
    setLoading(true)

    const load = async () => {
      try {
        const result = await getLineasNegocio(periodo, year)
        if (cancelled) return
        if (result && result.length > 0) {
          // Merge: iterate over SEED to preserve order, fill real primaNeta from Supabase
          const merged: LineaFull[] = SEED.map(seed => {
            const real = result.find(r => r.linea === seed.linea)
            const pn = real ? real.primaNeta : 0
            const ppto = Math.round(seed.presupuesto / 12 * Math.max(periodos.length, 1))
            const pnAA = Math.round(seed.pnAnioAnt / 12 * Math.max(periodos.length, 1))
            const dif = ppto > 0 ? pn - ppto : 0
            const pctDif = ppto > 0 ? Math.round((dif / ppto) * 1000) / 10 : 0
            const difY = pnAA > 0 ? pn - pnAA : 0
            const pctDifY = pnAA > 0 ? Math.round((difY / pnAA) * 10000) / 100 : 0
            const pend = seed.pendiente
            return {
              linea: seed.linea, primaNeta: pn, presupuesto: ppto, diferencia: dif,
              pctDifPpto: pctDif, pnAnioAnt: pnAA, difYoY: difY, pctDifYoY: pctDifY, pendiente: pend,
            }
          })
          // Also add any lines from Supabase not in SEED
          result.forEach(r => {
            if (!merged.find(m => m.linea === r.linea)) {
              merged.push({ linea: r.linea, primaNeta: r.primaNeta, presupuesto: 0, diferencia: 0, pctDifPpto: 0, pnAnioAnt: 0, difYoY: 0, pctDifYoY: 0, pendiente: 0 })
            }
          })
          setLineas(merged)
        } else {
          // Fallback to SEED if Supabase returns nothing
          setLineas(SEED)
        }
      } catch {
        setLineas(SEED)
      }
      if (!cancelled) setLoading(false)
    }

    load()

    return () => { cancelled = true }
  }, [periodo, year, periodos.length])

  // Generic drill function
  const drill = async (level: DrillLevel, label: string, newSel: typeof sel) => {
    setLoading(true)
    setSel(newSel)
    setCrumbs(prev => [...prev, { level: drillLevel, label }])

    // Helper: compute DrillRow with YoY and proportional presupuesto
    // Now requires pnAnioAntTotal to allocate budget based on prior year share (not current primaNeta)
    const toRowWithYoY = (
      name: string,
      primaNeta: number,
      pnAnioAnt: number,
      pnAnioAntTotal: number,
      lineaPpto: number,
      lineaPendiente: number
    ): DrillRow => {
      // Allocate presupuesto based on PRIOR YEAR share, not current primaNeta
      // This gives unique % Dif ppto per row (rows performing better/worse than their historical share)
      const priorShare = pnAnioAntTotal > 0 ? pnAnioAnt / pnAnioAntTotal : 0
      const ppto = Math.round(lineaPpto * priorShare)
      const dif = ppto > 0 ? primaNeta - ppto : null
      const pctDif = ppto > 0 ? Math.round((dif! / ppto) * 1000) / 10 : null
      const difY = pnAnioAnt > 0 ? primaNeta - pnAnioAnt : (pnAnioAnt === 0 && primaNeta > 0 ? primaNeta : null)
      const pctDifY = pnAnioAnt > 0 ? Math.round((difY! / pnAnioAnt) * 10000) / 100 : null
      // Pendiente allocated by current primaNeta share
      const currentShare = primaNeta > 0 ? primaNeta / (primaNeta + (pnAnioAnt || primaNeta)) : 0
      const pend = Math.round(lineaPendiente * (priorShare > 0 ? priorShare : currentShare))
      return {
        name,
        primaNeta,
        presupuesto: ppto > 0 ? ppto : null,
        diferencia: dif,
        pctDifPpto: pctDif,
        pnAnioAnt: pnAnioAnt > 0 ? pnAnioAnt : null,
        difYoY: difY,
        pctDifYoY: pctDifY,
        pendiente: pend > 0 ? pend : null
      }
    }

    // Get línea-level data for proportional calculations
    const lineaSeed = SEED.find(s => s.linea === newSel.linea)
    const lineaPpto = lineaSeed ? Math.round(lineaSeed.presupuesto / 12 * Math.max(periodos.length, 1)) : 0
    const lineaPendiente = lineaSeed?.pendiente ?? 0

    try {
      if (level === "gerencia") {
        const data = await getGerencias(newSel.linea!, periodo, year)
        const pnAnioAntTotal = (data ?? []).reduce((s, d) => s + d.pnAnioAnt, 0)
        setRows((data ?? []).map(d => toRowWithYoY(d.gerencia, d.primaNeta, d.pnAnioAnt, pnAnioAntTotal, lineaPpto, lineaPendiente)))
      } else if (level === "vendedor") {
        const data = await getVendedores(newSel.gerencia!, newSel.linea!, periodo, year)
        const pnAnioAntTotal = (data ?? []).reduce((s, d) => s + d.pnAnioAnt, 0)
        const currentTotal = (data ?? []).reduce((s, d) => s + d.primaNeta, 0)
        // For vendedor level, use gerencia's proportional share of línea ppto
        const gerenciaShare = lineas.find(l => l.linea === newSel.linea)
        const gerenciaPpto = gerenciaShare ? Math.round(lineaPpto * (currentTotal / (gerenciaShare.primaNeta || 1))) : lineaPpto
        setRows((data ?? []).map(d => toRowWithYoY(d.vendedor, d.primaNeta, d.pnAnioAnt, pnAnioAntTotal, gerenciaPpto, lineaPendiente)))
      } else if (level === "grupo") {
        const data = await getGrupos(newSel.vendedor!, newSel.gerencia!, newSel.linea!, periodo, year)
        const pnAnioAntTotal = (data ?? []).reduce((s, d) => s + d.pnAnioAnt, 0)
        setRows((data ?? []).map(d => toRowWithYoY(d.grupo, d.primaNeta, d.pnAnioAnt, pnAnioAntTotal, 0, 0)))
      } else if (level === "cliente") {
        const data = await getClientes(newSel.grupo!, newSel.vendedor!, newSel.gerencia!, newSel.linea!, periodo, year)
        const pnAnioAntTotal = (data ?? []).reduce((s, d) => s + d.pnAnioAnt, 0)
        setRows((data ?? []).map(d => toRowWithYoY(d.cliente, d.primaNeta, d.pnAnioAnt, pnAnioAntTotal, 0, 0)))
      } else if (level === "poliza") {
        const data = await getPolizas(newSel.cliente!, newSel.grupo!, newSel.vendedor!, newSel.gerencia!, newSel.linea!, periodo, year)
        setPolizas(data ?? [])
      }
    } catch { setRows([]); setPolizas([]) }

    setDrillLevel(level)
    setLoading(false)
  }

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
      const levels: DrillLevel[] = ["linea", "gerencia", "vendedor", "grupo", "cliente", "poliza"]
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

  // Top 10 + Otros aggregation for drill levels 2-5
  const computeTop10WithOtros = (items: DrillRow[]): { rows: DrillRow[]; otrosCount: number } => {
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

  // Column label for current level
  const levelLabels: Record<DrillLevel, string> = {
    linea: "Línea de negocio", gerencia: "Gerencia", vendedor: "Vendedor",
    grupo: "Grupo", cliente: "Cliente / Asegurado", poliza: "Póliza",
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
  const { rows: displayRows, otrosCount } = drillLevel !== "linea" && drillLevel !== "poliza"
    ? computeTop10WithOtros(filteredRows)
    : { rows: filteredRows, otrosCount: 0 }
  const filteredPolizas = filterSearch(polizas, "documento")
  const rowTotal = filteredRows.reduce((s, r) => s + r.primaNeta, 0)
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
        ) : (
          <>
            {displayRows.length === 0 ? (
              <p className="text-center text-[#888] py-8">Sin datos para este periodo</p>
            ) : displayRows.map((r) => {
              const isOtros = r.name.startsWith("Otros (")
              const nextLevel: DrillLevel | null = isOtros ? null : (drillLevel === "gerencia" ? "vendedor" : drillLevel === "vendedor" ? "grupo" : drillLevel === "grupo" ? "cliente" : drillLevel === "cliente" ? "poliza" : null)
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

      {/* DESKTOP TABLE VIEW */}
      <div ref={tableRef} className="hidden md:block bi-card overflow-hidden overflow-x-auto max-h-[70vh] overflow-y-auto w-full">
        <table className="w-full text-xs">
          <thead className="sticky top-0 z-10">
            {drillLevel === "linea" ? (
              <tr className="bg-[#041224] text-white border-b-2 border-b-[#E62800]">
                <th className="w-6 px-1 py-1.5"></th>
                <th className="text-left px-3 py-1.5 text-xs font-semibold uppercase tracking-wider">Línea de negocio</th>
                <th className="text-center px-3 py-1.5 text-xs font-semibold uppercase tracking-wider">Prima neta</th>
                <th className="text-center px-3 py-1.5 text-xs font-semibold uppercase tracking-wider">Presupuesto</th>
                <th className="text-center px-3 py-1.5 text-xs font-semibold uppercase tracking-wider">Diferencia</th>
                <th className="text-center px-3 py-1.5 text-xs font-semibold uppercase tracking-wider">% Dif ppto</th>
                <th className="text-center px-3 py-1.5 text-xs font-semibold uppercase tracking-wider">{cmpLabel.col}</th>
                <th className="text-center px-3 py-1.5 text-xs font-semibold uppercase tracking-wider">{cmpLabel.difCol}</th>
                <th className="text-center px-3 py-1.5 text-xs font-semibold uppercase tracking-wider">{cmpLabel.pctCol}</th>
                <th className="text-center px-3 py-1.5 text-xs font-semibold uppercase tracking-wider">Pendiente</th>
              </tr>
            ) : drillLevel === "poliza" ? (
              <tr className="bg-[#041224] text-white border-b-2 border-b-[#E62800]">
                <th className="text-left px-3 py-1.5 text-xs font-semibold uppercase tracking-wider">Documento</th>
                <th className="text-left px-3 py-1.5 text-xs font-semibold uppercase tracking-wider">Aseguradora</th>
                <th className="text-left px-3 py-1.5 text-xs font-semibold uppercase tracking-wider">Ramo</th>
                <th className="text-left px-3 py-1.5 text-xs font-semibold uppercase tracking-wider">Subramo</th>
                <th className="text-left px-3 py-1.5 text-xs font-semibold uppercase tracking-wider">F. Liquidación</th>
                <th className="text-left px-3 py-1.5 text-xs font-semibold uppercase tracking-wider">F. Lím. Pago</th>
                <th className="text-center px-3 py-1.5 text-xs font-semibold uppercase tracking-wider">Prima neta</th>
              </tr>
            ) : (
              <tr className="bg-[#041224] text-white border-b-2 border-b-[#E62800]">
                <th className="w-6 px-1 py-1.5"></th>
                <th className="text-left px-3 py-1.5 text-xs font-semibold uppercase tracking-wider">{levelLabels[drillLevel]}</th>
                <th className="text-center px-3 py-1.5 text-xs font-semibold uppercase tracking-wider">Prima neta</th>
                <th className="text-center px-3 py-1.5 text-xs font-semibold uppercase tracking-wider">Presupuesto</th>
                <th className="text-center px-3 py-1.5 text-xs font-semibold uppercase tracking-wider">Diferencia</th>
                <th className="text-center px-3 py-1.5 text-xs font-semibold uppercase tracking-wider">% Dif ppto</th>
                <th className="text-center px-3 py-1.5 text-xs font-semibold uppercase tracking-wider">{cmpLabel.col}</th>
                <th className="text-center px-3 py-1.5 text-xs font-semibold uppercase tracking-wider">{cmpLabel.difCol}</th>
                <th className="text-center px-3 py-1.5 text-xs font-semibold uppercase tracking-wider">{cmpLabel.pctCol}</th>
                <th className="text-center px-3 py-1.5 text-xs font-semibold uppercase tracking-wider">Pendiente</th>
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
                    ? "text-emerald-600"
                    : l.primaNeta >= l.pnAnioAnt
                    ? "text-amber-600"
                    : "text-red-600"
                  return (
                    <tr key={l.linea} id={toSlug(l.linea)} className={`group border-b border-[#F0F0F0] cursor-pointer transition-all duration-150 hover:bg-[#FFF5F5] ${idx % 2 === 1 ? "bg-[#FAFBFC]" : "bg-white"}`}
                      onClick={() => drill("gerencia", l.linea, { linea: l.linea })}>
                      <td className="px-1 py-2 text-center">
                        <ChevronRight className="w-3.5 h-3.5 text-[#E62800] inline transition-transform group-hover:scale-125 group-hover:translate-x-1" />
                      </td>
                      <td className="px-3 py-2 font-medium text-[#111] text-left">{l.linea}</td>
                      <td className="px-3 py-2 text-right font-normal tabular-nums">{fmt(l.primaNeta)}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-green-600 font-semibold">{l.presupuesto ? fmt(l.presupuesto) : ""}</td>
                      <td className={`px-3 py-2 text-right font-normal tabular-nums ${semaforoColor}`}>{l.presupuesto ? (dif < 0 ? `(${fmt(Math.abs(dif))})` : fmt(dif)) : ""}</td>
                      <td className={`px-3 py-2 text-right tabular-nums ${semaforoColor}`}>{l.pctDifPpto ? `${l.pctDifPpto > 0 ? "+" : ""}${l.pctDifPpto}%` : ""}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-gray-800">{l.pnAnioAnt ? fmt(l.pnAnioAnt) : ""}</td>
                      <td className={`px-3 py-2 text-right font-normal tabular-nums ${difYoy < 0 ? "text-red-500" : ""}`}>{l.pnAnioAnt ? (difYoy < 0 ? `(${fmt(Math.abs(difYoy))})` : fmt(difYoy)) : ""}</td>
                      <td className={`px-3 py-2 text-right tabular-nums ${l.pctDifYoY < 0 ? "text-red-500" : l.pctDifYoY > 0 ? "text-green-600" : ""}`}>{l.pctDifYoY ? `${l.pctDifYoY > 0 ? "+" : ""}${l.pctDifYoY}%` : ""}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-gray-500">
                        {l.pendiente ? fmt(l.pendiente) : ""}
                      </td>
                    </tr>
                  )
                })}
                <tr className="bg-[#041224] text-white border-t-2 cursor-default">
                  <td className="px-1 py-1.5"></td>
                  <td className="px-3 py-1.5 font-bold text-left">Total</td>
                  <td className="px-3 py-1.5 text-right font-bold tabular-nums">{fmt(totalLineas.primaNeta)}</td>
                  <td className="px-3 py-1.5 text-right font-bold tabular-nums">{totalLineas.presupuesto ? fmt(totalLineas.presupuesto) : ""}</td>
                  <td className="px-3 py-1.5 text-right font-bold tabular-nums">{totalLineas.presupuesto ? (totalDif < 0 ? `(${fmt(Math.abs(totalDif))})` : fmt(totalDif)) : ""}</td>
                  <td className="px-3 py-1.5 text-right font-bold tabular-nums">{totalDifPct ? `${totalDifPct}%` : ""}</td>
                  <td className="px-3 py-1.5 text-right font-bold tabular-nums">{totalLineas.pnAnioAnt ? fmt(totalLineas.pnAnioAnt) : ""}</td>
                  <td className="px-3 py-1.5 text-right font-bold tabular-nums">{totalLineas.pnAnioAnt ? (totalDifYoy < 0 ? `(${fmt(Math.abs(totalDifYoy))})` : fmt(totalDifYoy)) : ""}</td>
                  <td className="px-3 py-1.5 text-right font-bold tabular-nums">{totalDifYoyPct ? `${totalDifYoyPct}%` : ""}</td>
                  <td className="px-3 py-1.5 text-right font-bold tabular-nums">{totalLineas.pendiente ? fmt(totalLineas.pendiente) : ""}</td>
                </tr>
              </>

            ) : drillLevel === "poliza" ? (
              /* ─── LEVEL 6: PÓLIZAS ─── */
              <>
                {filteredPolizas.length === 0 ? (
                  <tr><td colSpan={7} className="px-3 py-8 text-center text-[#888]">Datos en integración</td></tr>
                ) : filteredPolizas.map((p, idx) => (
                  <tr key={`${p.documento}-${idx}`} className={`border-b border-[#F0F0F0] hover:bg-[#FFF5F5] ${idx % 2 === 1 ? "bg-[#FAFAFA]" : "bg-white"}`}>
                    <td className="px-3 py-1.5 font-medium text-[#111] text-left">{p.documento}</td>
                    <td className="px-3 py-1.5 text-[#333] text-left">{p.aseguradora}</td>
                    <td className="px-3 py-1.5 text-[#333] text-left">{p.ramo}</td>
                    <td className="px-3 py-1.5 text-[#666] text-left">{p.subramo}</td>
                    <td className="px-3 py-1.5 text-[#666] text-left tabular-nums">{fmtDate(p.fechaLiquidacion)}</td>
                    <td className="px-3 py-1.5 text-[#666] text-left tabular-nums">{fmtDate(p.fechaLimPago)}</td>
                    <td className={`px-3 py-1.5 text-right font-medium tabular-nums ${p.primaNeta < 0 ? "text-red-500" : ""}`}>{p.primaNeta < 0 ? `(${fmt(Math.abs(p.primaNeta))})` : fmt(p.primaNeta)}</td>
                  </tr>
                ))}
                <tr className="bg-[#041224] text-white border-t-2 cursor-default">
                  <td className="px-3 py-1.5 font-bold" colSpan={6}>Total</td>
                  <td className="px-3 py-1.5 text-right font-bold tabular-nums">{fmt(polizaTotal)}</td>
                </tr>
              </>

            ) : (
              /* ─── LEVELS 2-5: FULL 9 COLUMNS ─── */
              <>
                {displayRows.length === 0 ? (
                  <tr><td colSpan={10} className="px-3 py-8 text-center text-[#888]">
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
                    drillLevel === "cliente" ? "poliza" : null
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
                        ? "text-emerald-600"
                        : r.primaNeta >= r.pnAnioAnt
                        ? "text-amber-600"
                        : "text-red-600")
                    : (r.diferencia !== null && r.diferencia < 0 ? "text-red-600" : "")

                  return (
                    <tr key={r.name}
                      className={`group border-b border-[#F0F0F0] ${nextLevel ? "cursor-pointer" : ""} transition-all duration-150 ${isOtros ? "bg-gray-100" : idx % 2 === 1 ? "bg-[#FAFBFC]" : "bg-white"} hover:bg-[#FFF5F5]`}
                      onClick={() => nextLevel && selKey && drill(nextLevel, r.name, { ...sel, [selKey]: r.name })}>
                      <td className="px-1 py-2 text-center w-6">
                        {nextLevel && <ChevronRight className="w-3.5 h-3.5 text-[#E62800] inline transition-transform group-hover:scale-110 group-hover:translate-x-0.5" />}
                      </td>
                      <td className="px-3 py-2 font-medium text-[#111] text-left">{r.name}</td>
                      <td className={`px-3 py-2 text-right tabular-nums font-normal ${r.primaNeta < 0 ? "text-red-500" : ""}`}>
                        {r.primaNeta < 0 ? `(${fmt(Math.abs(r.primaNeta))})` : fmt(r.primaNeta)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-green-600 font-semibold">{r.presupuesto !== null ? fmt(r.presupuesto) : <span className="text-gray-300 font-normal">—</span>}</td>
                      <td className={`px-3 py-2 text-right tabular-nums font-normal ${semaforoColor}`}>{r.diferencia !== null ? (r.diferencia < 0 ? `(${fmt(Math.abs(r.diferencia))})` : fmt(r.diferencia)) : <span className="text-gray-300">—</span>}</td>
                      <td className={`px-3 py-2 text-right tabular-nums ${semaforoColor}`}>{r.pctDifPpto !== null ? `${r.pctDifPpto > 0 ? "+" : ""}${r.pctDifPpto}%` : <span className="text-gray-300">—</span>}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-gray-800">{r.pnAnioAnt !== null ? fmt(r.pnAnioAnt) : <span className="text-gray-300">—</span>}</td>
                      <td className={`px-3 py-2 text-right tabular-nums font-normal ${r.difYoY === null ? "" : r.difYoY < 0 ? "text-red-500" : ""}`}>{r.difYoY !== null ? (r.difYoY < 0 ? `(${fmt(Math.abs(r.difYoY))})` : fmt(r.difYoY)) : <span className="text-gray-300">—</span>}</td>
                      <td className={`px-3 py-2 text-right tabular-nums ${r.pctDifYoY === null ? "" : r.pctDifYoY < 0 ? "text-red-500" : r.pctDifYoY > 0 ? "text-green-600" : ""}`}>{r.pctDifYoY !== null ? `${r.pctDifYoY > 0 ? "+" : ""}${r.pctDifYoY}%` : <span className="text-gray-300">—</span>}</td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {r.pendiente !== null ? fmt(r.pendiente) : <span className="text-gray-300">—</span>}
                      </td>
                    </tr>
                  )
                })}
                <tr className="bg-[#041224] text-white border-t-2 cursor-default">
                  <td className="px-1 py-1.5 w-6"></td>
                  <td className="px-3 py-1.5 font-bold text-left">Total</td>
                  <td className="px-3 py-1.5 text-right font-bold tabular-nums">{fmt(rowTotal)}</td>
                  <td className="px-3 py-1.5 text-right text-white/50 tabular-nums">—</td>
                  <td className="px-3 py-1.5 text-right text-white/50 tabular-nums">—</td>
                  <td className="px-3 py-1.5 text-right text-white/50 tabular-nums">—</td>
                  <td className="px-3 py-1.5 text-right text-white/50 tabular-nums">—</td>
                  <td className="px-3 py-1.5 text-right text-white/50 tabular-nums">—</td>
                  <td className="px-3 py-1.5 text-right text-white/50 tabular-nums">—</td>
                  <td className="px-3 py-1.5 text-right text-white/50 tabular-nums">—</td>
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
            : filteredRows.map(r => ({ name: r.name, primaNeta: r.primaNeta }))
        }
        levelLabel={levelLabels[drillLevel]}
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
