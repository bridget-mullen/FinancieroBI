"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { ChevronRight, ChevronLeft, Search, Download } from "lucide-react"
import { PageTabs } from "@/components/page-tabs"
import { PageFooter } from "@/components/page-footer"
import { PeriodFilter } from "@/components/period-filter"
import { getLineasNegocio, getGerencias, getVendedores, getGrupos, getClientes, getPolizas, getRankedVendedores, getRankedAseguradoras, globalSearch, getLastDataDate } from "@/lib/queries"
import type { SearchResult } from "@/lib/queries"
import type { PolizaRow } from "@/lib/queries"
import { exportExcel, exportPDF } from "@/lib/export"
import { NLQuery } from "@/components/nl-query"

function fmt(v: number) {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(v)
}

const MESES_LABELS = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"]

interface LineaFull {
  linea: string; primaNeta: number; presupuesto: number; diferencia: number; pctDifPpto: number; pnAnioAnt: number; difYoY: number; pctDifYoY: number; pendiente: number
}
const SEED: LineaFull[] = [
  { linea: "Click Franquicias", primaNeta: 52577939, presupuesto: 68989976, diferencia: -16412037, pctDifPpto: -23.8, pnAnioAnt: 45038829, difYoY: 7539110, pctDifYoY: 16.74, pendiente: 37639869 },
  { linea: "Click Promotoras", primaNeta: 20017383, presupuesto: 25534211, diferencia: -5516828, pctDifPpto: -21.6, pnAnioAnt: 19422359, difYoY: 595024, pctDifYoY: 3.06, pendiente: 21892390 },
  { linea: "Corporate", primaNeta: 12708705, presupuesto: 16242717, diferencia: -3534012, pctDifPpto: -21.8, pnAnioAnt: 13539625, difYoY: -830920, pctDifYoY: -6.14, pendiente: 8763272 },
  { linea: "Cartera Tradicional", primaNeta: 10632028, presupuesto: 12322087, diferencia: -1690059, pctDifPpto: -13.7, pnAnioAnt: 10057425, difYoY: 574603, pctDifYoY: 5.71, pendiente: 7416036 },
  { linea: "Call Center", primaNeta: 2602364, presupuesto: 6398081, diferencia: -3795717, pctDifPpto: -59.3, pnAnioAnt: 853685, difYoY: 1748679, pctDifYoY: 204.84, pendiente: 12236199 },
]

// Umbral configurable de alerta por desviación (default -20%)
const ALERT_THRESHOLD = -20

type DrillLevel = "linea" | "gerencia" | "vendedor" | "grupo" | "cliente" | "poliza"

interface Crumb { level: DrillLevel; label: string }

// Full row for all drill levels (9 columns)
interface DrillRow { name: string; primaNeta: number; presupuesto: number | null; diferencia: number | null; pctDifPpto: number | null; pnAnioAnt: number | null; difYoY: number | null; pctDifYoY: number | null; pendiente: number | null }

export default function TablaDetallePage() {
  const [year, setYear] = useState("2026")
  const [periodos, setPeriodos] = useState<number[]>([2])
  const [search, setSearch] = useState("")
  const [loading, setLoading] = useState(true)
  const [mounted, setMounted] = useState(false)
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

  // Rankings
  const [topVendedores, setTopVendedores] = useState<{ vendedor: string; primaNeta: number }[]>([])
  const [bottomVendedores, setBottomVendedores] = useState<{ vendedor: string; primaNeta: number }[]>([])
  const [topAseguradoras, setTopAseguradoras] = useState<{ aseguradora: string; primaNeta: number; pct: number }[]>([])

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
          // Merge real primaNeta with SEED presupuesto/comparison data
          const merged: LineaFull[] = result.map(r => {
            const seed = SEED.find(s => s.linea === r.linea)
            const pn = r.primaNeta
            const ppto = seed?.presupuesto ?? 0
            const pnAA = seed?.pnAnioAnt ?? 0
            const dif = ppto > 0 ? pn - ppto : 0
            const pctDif = ppto > 0 ? Math.round((dif / ppto) * 1000) / 10 : 0
            const difY = pnAA > 0 ? pn - pnAA : 0
            const pctDifY = pnAA > 0 ? Math.round((difY / pnAA) * 10000) / 100 : 0
            const pend = seed?.pendiente ?? 0
            return {
              linea: r.linea, primaNeta: pn, presupuesto: ppto, diferencia: dif,
              pctDifPpto: pctDif, pnAnioAnt: pnAA, difYoY: difY, pctDifYoY: pctDifY, pendiente: pend,
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

    // Load rankings in parallel
    getRankedVendedores(periodo, year).then(v => {
      if (v && v.length > 0) {
        setTopVendedores(v.slice(0, 5))
        setBottomVendedores(v.slice(-5).reverse())
      }
    })
    getRankedAseguradoras(periodo, year).then(a => {
      if (a && a.length > 0) {
        const total = a.reduce((s, x) => s + x.primaNeta, 0)
        setTopAseguradoras(a.slice(0, 5).map(x => ({ ...x, pct: total > 0 ? Math.round((x.primaNeta / total) * 1000) / 10 : 0 })))
      }
    })

    return () => { cancelled = true }
  }, [periodo, year])

  // Generic drill function
  const drill = async (level: DrillLevel, label: string, newSel: typeof sel) => {
    setLoading(true)
    setSel(newSel)
    setCrumbs(prev => [...prev, { level: drillLevel, label }])

    const toRow = (name: string, primaNeta: number): DrillRow => ({
      name, primaNeta, presupuesto: null, diferencia: null, pctDifPpto: null, pnAnioAnt: null, difYoY: null, pctDifYoY: null, pendiente: null
    })

    try {
      if (level === "gerencia") {
        const data = await getGerencias(newSel.linea!, periodo, year)
        setRows((data ?? []).map(d => toRow(d.gerencia, d.primaNeta)))
      } else if (level === "vendedor") {
        const data = await getVendedores(newSel.gerencia!, newSel.linea!, periodo, year)
        setRows((data ?? []).map(d => toRow(d.vendedor, d.primaNeta)))
      } else if (level === "grupo") {
        const data = await getGrupos(newSel.vendedor!, newSel.gerencia!, newSel.linea!, periodo, year)
        setRows((data ?? []).map(d => toRow(d.grupo, d.primaNeta)))
      } else if (level === "cliente") {
        const data = await getClientes(newSel.grupo!, newSel.vendedor!, newSel.gerencia!, newSel.linea!, periodo, year)
        setRows((data ?? []).map(d => toRow(d.cliente, d.primaNeta)))
      } else if (level === "poliza") {
        const data = await getPolizas(newSel.cliente!, newSel.grupo!, newSel.vendedor!, newSel.gerencia!, newSel.linea!, periodo, year)
        setPolizas(data ?? [])
      }
    } catch { setRows([]); setPolizas([]) }

    setDrillLevel(level)
    setLoading(false)
  }

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
  const filteredPolizas = filterSearch(polizas, "documento")
  const rowTotal = filteredRows.reduce((s, r) => s + r.primaNeta, 0)
  const polizaTotal = filteredPolizas.reduce((s, p) => s + p.primaNeta, 0)

  // Fixed column labels (removed compare mode)
  const cmpLabel = { col: "PN año anterior *", difCol: "Dif PN año ant", pctCol: "% Dif PN AA" }

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
      <PageTabs alertCount={alertCount} />

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
        <PeriodFilter onFilterChange={handleFilterChange} />
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
          return daysDiff > 7 ? <span className="text-[10px] bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full font-medium ml-1">⚠ Datos pendientes de actualización</span> : null
        })()}
      </div>

      {/* Row count indicator for large datasets */}
      {drillLevel !== "linea" && filteredRows.length >= 30 && (
        <div className="text-[10px] text-[#888] mb-1">{filteredRows.length} registros encontrados — desplazar para ver más</div>
      )}
      {drillLevel === "poliza" && filteredPolizas.length >= 30 && (
        <div className="text-[10px] text-[#888] mb-1">{filteredPolizas.length} pólizas encontradas — desplazar para ver más</div>
      )}

      {/* Table — scrollable for large datasets */}
      <div ref={tableRef} className="bi-card overflow-hidden overflow-x-auto max-h-[70vh] overflow-y-auto">
        <table className="w-full text-[10px]">
          <thead className="sticky top-0 z-10">
            {drillLevel === "linea" ? (
              <tr className="bg-[#041224] text-white border-b-2 border-b-[#E62800]">
                <th className="w-6 px-1 py-2"></th>
                <th className="text-left px-2 py-2 font-semibold">Línea de negocio</th>
                <th className="text-right px-2 py-2 font-semibold">Prima neta</th>
                <th className="text-right px-2 py-2 font-semibold">Presupuesto</th>
                <th className="text-right px-2 py-2 font-semibold">Diferencia</th>
                <th className="text-right px-2 py-2 font-semibold">% Dif ppto</th>
                <th className="text-right px-2 py-2 font-semibold">{cmpLabel.col}</th>
                <th className="text-right px-2 py-2 font-semibold">{cmpLabel.difCol}</th>
                <th className="text-right px-2 py-2 font-semibold">{cmpLabel.pctCol}</th>
                <th className="text-right px-2 py-2 font-semibold">Pendiente</th>
              </tr>
            ) : drillLevel === "poliza" ? (
              <tr className="bg-[#041224] text-white border-b-2 border-b-[#E62800]">
                <th className="text-left px-2 py-2 font-semibold">Documento</th>
                <th className="text-left px-2 py-2 font-semibold">Aseguradora</th>
                <th className="text-left px-2 py-2 font-semibold">Ramo</th>
                <th className="text-left px-2 py-2 font-semibold">Subramo</th>
                <th className="text-left px-2 py-2 font-semibold">F. Liquidación</th>
                <th className="text-left px-2 py-2 font-semibold">F. Lím. Pago</th>
                <th className="text-right px-2 py-2 font-semibold">Prima neta</th>
              </tr>
            ) : (
              <tr className="bg-[#041224] text-white border-b-2 border-b-[#E62800]">
                <th className="w-6 px-1 py-2"></th>
                <th className="text-left px-2 py-2 font-semibold">{levelLabels[drillLevel]}</th>
                <th className="text-right px-2 py-2 font-semibold">Prima neta</th>
                <th className="text-right px-2 py-2 font-semibold">Presupuesto</th>
                <th className="text-right px-2 py-2 font-semibold">Diferencia</th>
                <th className="text-right px-2 py-2 font-semibold">% Dif ppto</th>
                <th className="text-right px-2 py-2 font-semibold">{cmpLabel.col}</th>
                <th className="text-right px-2 py-2 font-semibold">{cmpLabel.difCol}</th>
                <th className="text-right px-2 py-2 font-semibold">{cmpLabel.pctCol}</th>
                <th className="text-right px-2 py-2 font-semibold">Pendiente</th>
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
                  const isAlert = l.presupuesto > 0 && l.pctDifPpto <= ALERT_THRESHOLD
                  const isCritical = l.presupuesto > 0 && l.pctDifPpto < -15
                  return (
                    <tr key={l.linea} className={`group border-b border-[#F0F0F0] cursor-pointer transition-all duration-150 hover:bg-[#FFF5F5] hover:border-l-[3px] hover:border-l-[#E62800] ${isAlert ? "bg-[#FFF3F3]" : isCritical ? "bg-[#FFF2F2]" : idx % 2 === 1 ? "bg-[#FAFAFA]" : "bg-white"}`}
                      onClick={() => drill("gerencia", l.linea, { linea: l.linea })}>
                      <td className="px-1 py-1.5 text-center">
                        {/* Alert icons hidden for SEED data presentation */}
                        <ChevronRight className="w-4 h-4 text-[#E62800] inline transition-transform group-hover:scale-125 group-hover:translate-x-1" />
                      </td>
                      <td className="px-2 py-1.5 font-medium text-[#111]">{l.linea}</td>
                      <td className="px-2 py-1.5 text-right font-medium">{fmt(l.primaNeta)}</td>
                      <td className="px-2 py-1.5 text-right text-gray-500">{l.presupuesto ? fmt(l.presupuesto) : ""}</td>
                      <td className={`px-2 py-1.5 text-right font-medium ${dif < 0 ? "text-[#E62800]" : "text-[#166534]"}`}>{l.presupuesto ? (dif < 0 ? `(${fmt(Math.abs(dif))})` : fmt(dif)) : ""}</td>
                      <td className={`px-2 py-1.5 text-right ${dif < 0 ? "text-[#E62800]" : "text-[#166534]"}`}>{l.pctDifPpto ? `${l.pctDifPpto > 0 ? "+" : ""}${l.pctDifPpto}%` : ""}</td>
                      <td className="px-2 py-1.5 text-right text-gray-500">{l.pnAnioAnt ? fmt(l.pnAnioAnt) : ""}</td>
                      <td className={`px-2 py-1.5 text-right font-medium ${difYoy < 0 ? "text-[#E62800]" : "text-[#166534]"}`}>{l.pnAnioAnt ? (difYoy < 0 ? `(${fmt(Math.abs(difYoy))})` : fmt(difYoy)) : ""}</td>
                      <td className={`px-2 py-1.5 text-right ${difYoy < 0 ? "text-[#E62800]" : "text-[#166534]"}`}>{l.pctDifYoY ? `${l.pctDifYoY > 0 ? "+" : ""}${l.pctDifYoY}%` : ""}</td>
                      <td className="px-2 py-1.5 text-right text-gray-500 relative">
                        {l.pendiente ? fmt(l.pendiente) : ""}
                        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[9px] text-[#E62800] opacity-0 group-hover:opacity-100 transition-opacity font-medium">→ Ver detalle</span>
                      </td>
                    </tr>
                  )
                })}
                <tr className="bg-[#041224] text-white border-t-2 cursor-default">
                  <td className="px-1 py-2"></td>
                  <td className="px-2 py-2 font-bold">Total</td>
                  <td className="px-2 py-2 text-right font-bold">{fmt(totalLineas.primaNeta)}</td>
                  <td className="px-2 py-2 text-right font-bold">{totalLineas.presupuesto ? fmt(totalLineas.presupuesto) : ""}</td>
                  <td className="px-2 py-2 text-right font-bold">{totalLineas.presupuesto ? (totalDif < 0 ? `(${fmt(Math.abs(totalDif))})` : fmt(totalDif)) : ""}</td>
                  <td className="px-2 py-2 text-right font-bold">{totalDifPct ? `${totalDifPct}%` : ""}</td>
                  <td className="px-2 py-2 text-right font-bold">{totalLineas.pnAnioAnt ? fmt(totalLineas.pnAnioAnt) : ""}</td>
                  <td className="px-2 py-2 text-right font-bold">{totalLineas.pnAnioAnt ? (totalDifYoy < 0 ? `(${fmt(Math.abs(totalDifYoy))})` : fmt(totalDifYoy)) : ""}</td>
                  <td className="px-2 py-2 text-right font-bold">{totalDifYoyPct ? `${totalDifYoyPct}%` : ""}</td>
                  <td className="px-2 py-2 text-right font-bold">{totalLineas.pendiente ? fmt(totalLineas.pendiente) : ""}</td>
                </tr>
              </>

            ) : drillLevel === "poliza" ? (
              /* ─── LEVEL 6: PÓLIZAS ─── */
              <>
                {filteredPolizas.length === 0 ? (
                  <tr><td colSpan={7} className="px-3 py-8 text-center text-[#888]">Datos en integración</td></tr>
                ) : filteredPolizas.map((p, idx) => (
                  <tr key={`${p.documento}-${idx}`} className={`border-b border-[#F0F0F0] hover:bg-[#FFF5F5] ${idx % 2 === 1 ? "bg-[#FAFAFA]" : "bg-white"}`}>
                    <td className="px-2 py-1.5 font-medium text-[#111]">{p.documento}</td>
                    <td className="px-2 py-1.5 text-[#333]">{p.aseguradora}</td>
                    <td className="px-2 py-1.5 text-[#333]">{p.ramo}</td>
                    <td className="px-2 py-1.5 text-[#666]">{p.subramo}</td>
                    <td className="px-2 py-1.5 text-[#666]">{p.fechaLiquidacion}</td>
                    <td className="px-2 py-1.5 text-[#666]">{p.fechaLimPago}</td>
                    <td className={`px-2 py-1.5 text-right font-medium ${p.primaNeta < 0 ? "text-[#E62800]" : ""}`}>{p.primaNeta < 0 ? `(${fmt(Math.abs(p.primaNeta))})` : fmt(p.primaNeta)}</td>
                  </tr>
                ))}
                <tr className="bg-[#041224] text-white border-t-2 cursor-default">
                  <td className="px-2 py-2 font-bold" colSpan={6}>Total</td>
                  <td className="px-2 py-2 text-right font-bold">{fmt(polizaTotal)}</td>
                </tr>
              </>

            ) : (
              /* ─── LEVELS 2-5: FULL 9 COLUMNS ─── */
              <>
                {filteredRows.length === 0 ? (
                  <tr><td colSpan={10} className="px-3 py-8 text-center text-[#888]">
                    {drillLevel === "cliente" || drillLevel === "grupo" 
                      ? "Datos en integración" 
                      : drillLevel === "vendedor" 
                      ? "Sin vendedores registrados para esta gerencia" 
                      : `Sin datos para este periodo ${year}`}
                  </td></tr>
                ) : filteredRows.map((r, idx) => {
                  const nextLevel: DrillLevel | null =
                    drillLevel === "gerencia" ? "vendedor" :
                    drillLevel === "vendedor" ? "grupo" :
                    drillLevel === "grupo" ? "cliente" :
                    drillLevel === "cliente" ? "poliza" : null
                  const selKey =
                    drillLevel === "gerencia" ? "gerencia" :
                    drillLevel === "vendedor" ? "vendedor" :
                    drillLevel === "grupo" ? "grupo" :
                    drillLevel === "cliente" ? "cliente" : null

                  return (
                    <tr key={r.name}
                      className={`group border-b border-[#F0F0F0] ${nextLevel ? "cursor-pointer" : ""} transition-all duration-150 ${idx % 2 === 1 ? "bg-[#FAFAFA]" : "bg-white"} hover:bg-[#FFF5F5] hover:border-l-[3px] hover:border-l-[#E62800]`}
                      onClick={() => nextLevel && selKey && drill(nextLevel, r.name, { ...sel, [selKey]: r.name })}>
                      <td className="px-1 py-1.5 text-center">
                        {nextLevel && <ChevronRight className="w-4 h-4 text-[#E62800] inline transition-transform group-hover:scale-125 group-hover:translate-x-1" />}
                      </td>
                      <td className="px-2 py-1.5 font-medium text-[#111]">{r.name}</td>
                      <td className={`px-2 py-1.5 text-right font-medium ${r.primaNeta < 0 ? "text-[#E62800]" : ""}`}>
                        {r.primaNeta < 0 ? `(${fmt(Math.abs(r.primaNeta))})` : fmt(r.primaNeta)}
                      </td>
                      <td className="px-2 py-1.5 text-right text-gray-400">{r.presupuesto !== null ? fmt(r.presupuesto) : "—"}</td>
                      <td className="px-2 py-1.5 text-right text-gray-400">{r.diferencia !== null ? fmt(r.diferencia) : "—"}</td>
                      <td className="px-2 py-1.5 text-right text-gray-400">{r.pctDifPpto !== null ? `${r.pctDifPpto}%` : "—"}</td>
                      <td className="px-2 py-1.5 text-right text-gray-400">{r.pnAnioAnt !== null ? fmt(r.pnAnioAnt) : "—"}</td>
                      <td className="px-2 py-1.5 text-right text-gray-400">{r.difYoY !== null ? fmt(r.difYoY) : "—"}</td>
                      <td className="px-2 py-1.5 text-right text-gray-400">{r.pctDifYoY !== null ? `${r.pctDifYoY}%` : "—"}</td>
                      <td className="px-2 py-1.5 text-right relative">
                        <span className="text-gray-400">{r.pendiente !== null ? fmt(r.pendiente) : "—"}</span>
                        {nextLevel && <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[9px] text-[#E62800] opacity-0 group-hover:opacity-100 transition-opacity font-medium">→ Ver detalle</span>}
                      </td>
                    </tr>
                  )
                })}
                <tr className="bg-[#041224] text-white border-t-2 cursor-default">
                  <td className="px-1 py-2"></td>
                  <td className="px-2 py-2 font-bold">Total</td>
                  <td className="px-2 py-2 text-right font-bold">{fmt(rowTotal)}</td>
                  <td className="px-2 py-2 text-right text-white/50">—</td>
                  <td className="px-2 py-2 text-right text-white/50">—</td>
                  <td className="px-2 py-2 text-right text-white/50">—</td>
                  <td className="px-2 py-2 text-right text-white/50">—</td>
                  <td className="px-2 py-2 text-right text-white/50">—</td>
                  <td className="px-2 py-2 text-right text-white/50">—</td>
                  <td className="px-2 py-2 text-right text-white/50">—</td>
                </tr>
              </>
            )}
          </tbody>
        </table>
      </div>

      {/* Rankings — only visible at linea level */}
      {drillLevel === "linea" && (topVendedores.length > 0 || topAseguradoras.length > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-2 mt-2">
          {/* RANKING VENDEDORES */}
          {topVendedores.length > 0 && (
            <div className="bi-card p-3">
              <h3 className="text-xs font-bold text-[#041224] mb-2">🏆 Top 5 Vendedores</h3>
              <table className="w-full text-[10px]">
                <thead><tr className="bg-[#041224] text-white border-b-2 border-b-[#E62800]">
                  <th className="px-2 py-1.5 text-left font-semibold w-8">#</th>
                  <th className="px-2 py-1.5 text-left font-semibold">Vendedor</th>
                  <th className="px-2 py-1.5 text-right font-semibold">Prima Neta</th>
                </tr></thead>
                <tbody>
                  {topVendedores.map((v, i) => (
                    <tr key={v.vendedor} className="bg-[#F1F8F1] border-b border-[#E5E7E9]">
                      <td className="px-2 py-1 font-bold text-[#2E7D32]">↑ {i + 1}</td>
                      <td className="px-2 py-1">{v.vendedor}</td>
                      <td className="px-2 py-1 text-right font-medium">{fmt(v.primaNeta)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {bottomVendedores.length > 0 && (
                <>
                  <h3 className="text-xs font-bold text-[#041224] mt-3 mb-2">⬇️ Bottom 5 Vendedores</h3>
                  <table className="w-full text-[10px]">
                    <tbody>
                      {bottomVendedores.map((v, i) => (
                        <tr key={v.vendedor} className="bg-[#FFF3F3] border-b border-[#E5E7E9]">
                          <td className="px-2 py-1 font-bold text-[#E62800] w-8">↓ {i + 1}</td>
                          <td className="px-2 py-1">{v.vendedor}</td>
                          <td className="px-2 py-1 text-right font-medium">{fmt(v.primaNeta)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              )}
            </div>
          )}

          {/* RANKING ASEGURADORAS */}
          {topAseguradoras.length > 0 && (
            <div className="bi-card p-3">
              <h3 className="text-xs font-bold text-[#041224] mb-2">🏢 Top 5 Aseguradoras</h3>
              <table className="w-full text-[10px]">
                <thead><tr className="bg-[#041224] text-white border-b-2 border-b-[#E62800]">
                  <th className="px-2 py-1.5 text-left font-semibold w-8">#</th>
                  <th className="px-2 py-1.5 text-left font-semibold">Aseguradora</th>
                  <th className="px-2 py-1.5 text-right font-semibold">Prima Neta</th>
                  <th className="px-2 py-1.5 text-right font-semibold">% del total</th>
                </tr></thead>
                <tbody>
                  {topAseguradoras.map((a, i) => (
                    <tr key={a.aseguradora} className={`border-b border-[#E5E7E9] ${i % 2 === 1 ? "bg-[#FAFAFA]" : "bg-white"}`}>
                      <td className="px-2 py-1 font-bold text-[#041224]">{i + 1}</td>
                      <td className="px-2 py-1">{a.aseguradora}</td>
                      <td className="px-2 py-1 text-right font-medium">{fmt(a.primaNeta)}</td>
                      <td className="px-2 py-1 text-right text-[#041224] font-medium">{a.pct}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Natural Language Query — beta, feature flag OFF */}
      <NLQuery periodo={periodo} year={year} />

      <PageFooter showFootnote={drillLevel === "linea"} />
      </div>
    </div>
  )
}
