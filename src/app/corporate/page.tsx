"use client"

import React, { useState, useEffect, useRef, useCallback } from "react"
import { ChevronRight, ChevronLeft, Search, Download } from "lucide-react"
import { PageTabs } from "@/components/page-tabs"
import { PageFooter } from "@/components/page-footer"
import { PeriodFilter } from "@/components/period-filter"
import { getGerencias, getVendedores, getGrupos, getClientes, getPolizas, getLastDataDate } from "@/lib/queries"
import type { PolizaRow } from "@/lib/queries"
import { exportExcel, exportPDF } from "@/lib/export"

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
  const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (match) {
    const [, yyyy, mm, dd] = match
    return `${dd}/${mm}/${yyyy}`
  }
  return dateStr
}

const MESES_LABELS = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"]

const LINEA = "Corporate" // Pre-filtered

// Corporate SEED data for presupuesto calculation (annual values)
const CORPORATE_SEED = {
  presupuesto: 16242717,
  pnAnioAnt: 13539625,
  pendiente: 8763272
}

type DrillLevel = "gerencia" | "vendedor" | "grupo" | "cliente" | "poliza"

// Full 9-column row (same as tabla-detalle)
interface DrillRow {
  name: string
  primaNeta: number
  presupuesto: number | null
  diferencia: number | null
  pctDifPpto: number | null
  pnAnioAnt: number | null
  difYoY: number | null
  pctDifYoY: number | null
  pendiente: number | null
}

// Top 10 + Otros aggregation
function computeTop10WithOtros(items: DrillRow[]): { rows: DrillRow[]; otrosCount: number } {
  if (items.length <= 10) return { rows: items, otrosCount: 0 }
  const sorted = [...items].sort((a, b) => b.primaNeta - a.primaNeta)
  const top10 = sorted.slice(0, 10)
  const rest = sorted.slice(10)
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

export default function CorporatePage() {
  const [year, setYear] = useState("2026")
  const [periodos, setPeriodos] = useState<number[]>([2])
  const [search, setSearch] = useState("")
  const [loading, setLoading] = useState(true)
  const [drillLevel, setDrillLevel] = useState<DrillLevel>("gerencia")
  const [crumbs, setCrumbs] = useState<{ level: DrillLevel; label: string }[]>([])
  const [sel, setSel] = useState<{ gerencia?: string; vendedor?: string; grupo?: string; cliente?: string }>({})
  const [rows, setRows] = useState<DrillRow[]>([])
  const [polizas, setPolizas] = useState<PolizaRow[]>([])
  const [lastDataDate, setLastDataDate] = useState<string | null>(null)
  const tableRef = useRef<HTMLDivElement>(null)

  useEffect(() => { document.title = "Corporate | CLK BI Dashboard" }, [])
  useEffect(() => { getLastDataDate().then(d => setLastDataDate(d)) }, [])

  const handleFilterChange = useCallback((newYear: string, newPeriodos: number[]) => {
    setYear(newYear)
    setPeriodos(newPeriodos)
  }, [])
  const periodo = periodos[0] ?? 2

  // Calculate proportional presupuesto based on selected periods
  const lineaPpto = Math.round(CORPORATE_SEED.presupuesto / 12 * Math.max(periodos.length, 1))
  const lineaPnAnioAnt = Math.round(CORPORATE_SEED.pnAnioAnt / 12 * Math.max(periodos.length, 1))
  const lineaPendiente = CORPORATE_SEED.pendiente

  // Helper to build DrillRow with all columns
  const toRowWithYoY = (
    name: string,
    primaNeta: number,
    pnAnioAnt: number,
    pnAnioAntTotal: number
  ): DrillRow => {
    // Allocate presupuesto based on PRIOR YEAR share
    const priorShare = pnAnioAntTotal > 0 ? pnAnioAnt / pnAnioAntTotal : 0
    const ppto = Math.round(lineaPpto * priorShare)
    const dif = ppto > 0 ? primaNeta - ppto : null
    const pctDif = ppto > 0 && dif !== null ? Math.round((dif / ppto) * 1000) / 10 : null
    const difY = pnAnioAnt > 0 ? primaNeta - pnAnioAnt : (pnAnioAnt === 0 && primaNeta > 0 ? primaNeta : null)
    const pctDifY = pnAnioAnt > 0 && difY !== null ? Math.round((difY / pnAnioAnt) * 10000) / 100 : null
    const pend = Math.round(lineaPendiente * (priorShare > 0 ? priorShare : 0))
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

  // Load gerencias (entry level for Corporate)
  useEffect(() => {
    setLoading(true)
    setDrillLevel("gerencia"); setCrumbs([]); setSel({})
    getGerencias(LINEA, periodo, year).then(data => {
      const pnAnioAntTotal = (data ?? []).reduce((s, d) => s + d.pnAnioAnt, 0)
      setRows((data ?? []).map(d => toRowWithYoY(d.gerencia, d.primaNeta, d.pnAnioAnt, pnAnioAntTotal)))
      setLoading(false)
    }).catch(() => { setRows([]); setLoading(false) })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodo, year, periodos.length])

  const drill = async (level: DrillLevel, label: string, newSel: typeof sel) => {
    setLoading(true)
    setSel(newSel)
    setCrumbs(prev => [...prev, { level: drillLevel, label }])
    try {
      if (level === "vendedor") {
        const data = await getVendedores(newSel.gerencia!, LINEA, periodo, year)
        const pnAnioAntTotal = (data ?? []).reduce((s, d) => s + d.pnAnioAnt, 0)
        setRows((data ?? []).map(d => toRowWithYoY(d.vendedor, d.primaNeta, d.pnAnioAnt, pnAnioAntTotal)))
      } else if (level === "grupo") {
        const data = await getGrupos(newSel.vendedor!, newSel.gerencia!, LINEA, periodo, year)
        const pnAnioAntTotal = (data ?? []).reduce((s, d) => s + d.pnAnioAnt, 0)
        setRows((data ?? []).map(d => toRowWithYoY(d.grupo, d.primaNeta, d.pnAnioAnt, pnAnioAntTotal)))
      } else if (level === "cliente") {
        const data = await getClientes(newSel.grupo!, newSel.vendedor!, newSel.gerencia!, LINEA, periodo, year)
        const pnAnioAntTotal = (data ?? []).reduce((s, d) => s + d.pnAnioAnt, 0)
        setRows((data ?? []).map(d => toRowWithYoY(d.cliente, d.primaNeta, d.pnAnioAnt, pnAnioAntTotal)))
      } else if (level === "poliza") {
        const data = await getPolizas(newSel.cliente!, newSel.grupo!, newSel.vendedor!, newSel.gerencia!, LINEA, periodo, year)
        setPolizas(data ?? [])
      }
    } catch { setRows([]); setPolizas([]) }
    setDrillLevel(level)
    setLoading(false)
  }

  const goBack = () => {
    if (crumbs.length === 0) return
    const prev = crumbs[crumbs.length - 1]
    const newCrumbs = crumbs.slice(0, -1)
    setCrumbs(newCrumbs)
    setLoading(true)

    // Reconstruct sel from remaining crumbs
    const levels: DrillLevel[] = ["gerencia", "vendedor", "grupo", "cliente", "poliza"]
    const selKeys = ["gerencia", "vendedor", "grupo", "cliente"] as const
    const newSel: typeof sel = {}
    for (const c of newCrumbs) {
      const li = levels.indexOf(c.level)
      if (li >= 0 && li < selKeys.length) {
        (newSel as Record<string, string>)[selKeys[li]] = c.label
      }
    }
    setSel(newSel)

    const reload = async () => {
      try {
        if (prev.level === "gerencia") {
          const data = await getGerencias(LINEA, periodo, year)
          const pnAnioAntTotal = (data ?? []).reduce((s, d) => s + d.pnAnioAnt, 0)
          setRows((data ?? []).map(d => toRowWithYoY(d.gerencia, d.primaNeta, d.pnAnioAnt, pnAnioAntTotal)))
        } else if (prev.level === "vendedor") {
          const data = await getVendedores(newSel.gerencia!, LINEA, periodo, year)
          const pnAnioAntTotal = (data ?? []).reduce((s, d) => s + d.pnAnioAnt, 0)
          setRows((data ?? []).map(d => toRowWithYoY(d.vendedor, d.primaNeta, d.pnAnioAnt, pnAnioAntTotal)))
        } else if (prev.level === "grupo") {
          const data = await getGrupos(newSel.vendedor!, newSel.gerencia!, LINEA, periodo, year)
          const pnAnioAntTotal = (data ?? []).reduce((s, d) => s + d.pnAnioAnt, 0)
          setRows((data ?? []).map(d => toRowWithYoY(d.grupo, d.primaNeta, d.pnAnioAnt, pnAnioAntTotal)))
        } else if (prev.level === "cliente") {
          const data = await getClientes(newSel.grupo!, newSel.vendedor!, newSel.gerencia!, LINEA, periodo, year)
          const pnAnioAntTotal = (data ?? []).reduce((s, d) => s + d.pnAnioAnt, 0)
          setRows((data ?? []).map(d => toRowWithYoY(d.cliente, d.primaNeta, d.pnAnioAnt, pnAnioAntTotal)))
        }
      } catch { setRows([]) }
      setDrillLevel(prev.level)
      setLoading(false)
    }
    reload()
  }

  const levelLabels: Record<DrillLevel, string> = { gerencia: "Gerencia", vendedor: "Vendedor", grupo: "Grupo", cliente: "Cliente / Asegurado", poliza: "Póliza" }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const filterSearch = <T,>(items: T[], key: string): T[] => search ? items.filter(item => String((item as any)[key]).toLowerCase().includes(search.toLowerCase())) : items

  const filteredRows = filterSearch(rows, "name")
  // Apply Top 10 + Otros for drill levels (gerencia, vendedor, grupo, cliente)
  const { rows: displayRows } = drillLevel !== "poliza"
    ? computeTop10WithOtros(filteredRows)
    : { rows: filteredRows }
  const filteredPolizas = filterSearch(polizas, "documento")
  const rowTotal = filteredRows.reduce((s, r) => s + r.primaNeta, 0)
  const polizaTotal = filteredPolizas.reduce((s, p) => s + p.primaNeta, 0)

  // Column label for comparison
  const cmpLabel = { col: "PN año anterior", difCol: "Dif YoY", pctCol: "% Dif YoY" }

  const handleExcelExport = () => {
    const periodoLabel = periodos.map(p => MESES_LABELS[p - 1]).join("-")
    const filename = `CLK_Corporate_${levelLabels[drillLevel].replace(/\s/g, "")}_${year}_${periodoLabel}.xlsx`
    if (drillLevel === "poliza") {
      exportExcel(
        filteredPolizas.map(p => ({ "Documento": p.documento, "Aseguradora": p.aseguradora, "Ramo": p.ramo, "Subramo": p.subramo, "F. Liquidación": p.fechaLiquidacion, "F. Lím. Pago": p.fechaLimPago, "Prima neta": p.primaNeta })),
        ["Documento", "Aseguradora", "Ramo", "Subramo", "F. Liquidación", "F. Lím. Pago", "Prima neta"],
        ["Documento", "Aseguradora", "Ramo", "Subramo", "F. Liquidación", "F. Lím. Pago", "Prima neta"],
        filename
      )
    } else {
      exportExcel(
        filteredRows.map(r => ({ [levelLabels[drillLevel]]: r.name, "Prima neta": r.primaNeta, "Presupuesto": r.presupuesto ?? "—", "Diferencia": r.diferencia ?? "—", "% Dif ppto": r.pctDifPpto ?? "—", "PN año anterior": r.pnAnioAnt ?? "—", "Dif YoY": r.difYoY ?? "—", "% Dif YoY": r.pctDifYoY ?? "—", "Pendiente": r.pendiente ?? "—" })),
        [levelLabels[drillLevel], "Prima neta", "Presupuesto", "Diferencia", "% Dif ppto", "PN año anterior", "Dif YoY", "% Dif YoY", "Pendiente"],
        [levelLabels[drillLevel], "Prima neta", "Presupuesto", "Diferencia", "% Dif ppto", "PN año anterior", "Dif YoY", "% Dif YoY", "Pendiente"],
        filename
      )
    }
  }

  const handlePDFExport = () => {
    if (!tableRef.current) return
    const periodoLabelPDF = periodos.map(p => MESES_LABELS[p - 1]).join(", ")
    const filters = `${periodoLabelPDF} ${year} | Nivel: ${levelLabels[drillLevel]} | ${crumbs.map(c => c.label).join(" > ") || "Corporate"}`
    exportPDF(tableRef.current, "Corporate — Prima Neta Cobrada", filters)
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
        <h1 className="text-sm font-bold text-[#111] font-lato">Corporate — Prima neta cobrada</h1>
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
            <button onClick={() => { setDrillLevel("gerencia"); setCrumbs([]); setSel({}); setLoading(true); getGerencias(LINEA, periodo, year).then(data => { const pnAnioAntTotal = (data ?? []).reduce((s, d) => s + d.pnAnioAnt, 0); setRows((data ?? []).map(d => toRowWithYoY(d.gerencia, d.primaNeta, d.pnAnioAnt, pnAnioAntTotal))); setLoading(false) }) }} className="hover:text-[#041224] underline">Corporate</button>
            {crumbs.map((c, i) => (
              <span key={i} className="flex items-center gap-1">
                <ChevronRight className="w-3 h-3" />
                <span className={i === crumbs.length - 1 ? "text-[#041224] font-semibold" : "text-[#888]"}>{c.label}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        <div className="relative ml-auto">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
          <input id="corp-search" name="corp-search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar..." className="pl-7 pr-3 py-1 border border-[#E5E7EB] rounded text-xs w-44 bg-white" />
        </div>
        <span className="text-xs text-[#CCD1D3]">Datos al: {lastDataDate ?? "—"}</span>
      </div>

      {/* Row count for large datasets */}
      {drillLevel !== "poliza" && filteredRows.length >= 30 && (
        <div className="text-xs text-[#888] mb-1">{filteredRows.length} registros encontrados — desplazar para ver más</div>
      )}
      {drillLevel === "poliza" && filteredPolizas.length >= 30 && (
        <div className="text-xs text-[#888] mb-1">{filteredPolizas.length} pólizas encontradas — desplazar para ver más</div>
      )}

      {/* MOBILE CARD VIEW */}
      <div className="md:hidden space-y-1.5 mb-3">
        {loading ? (
          <p className="text-center text-gray-400 py-8">Cargando...</p>
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
              const pctPpto = r.presupuesto && r.presupuesto > 0 ? Math.round((r.primaNeta / r.presupuesto) * 100) : 0
              return (
                <div key={r.name} className={`rounded-xl border border-gray-200 px-3 py-3 shadow-sm transition-colors ${isOtros ? "bg-gray-100" : "bg-white active:bg-gray-50"}`}
                  onClick={() => nextLevel && selKey && drill(nextLevel, r.name, { ...sel, [selKey]: r.name })}>
                  <div className="flex justify-between items-center mb-1">
                    <span className="font-bold text-sm text-[#111] flex items-center gap-1 truncate">
                      {nextLevel && <ChevronRight className="w-3.5 h-3.5 text-[#E62800] flex-shrink-0" />}
                      {r.name}
                    </span>
                    <span className={`text-sm font-black flex-shrink-0 ml-2 ${r.pctDifPpto !== null && r.pctDifPpto < 0 ? "text-[#E62800]" : "text-[#166534]"}`}>
                      {r.pctDifPpto !== null ? `${r.pctDifPpto > 0 ? "+" : ""}${r.pctDifPpto}%` : ""}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 mb-2">
                    <span className="text-base font-black text-[#041224]">{fmtShort(r.primaNeta)}</span>
                    {r.presupuesto && <span className="text-[11px] text-gray-400">/ {fmtShort(r.presupuesto)}</span>}
                    {r.pnAnioAnt && <span className="text-[10px] text-gray-400 ml-auto">AA: {fmtShort(r.pnAnioAnt)}</span>}
                  </div>
                  {r.presupuesto && r.presupuesto > 0 && (
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${Math.min(Math.max(pctPpto, 0), 100)}%`,
                          backgroundColor: pctPpto >= 100 ? '#10B981' : pctPpto >= 80 ? '#F59E0B' : '#EF4444'
                        }} />
                    </div>
                  )}
                </div>
              )
            })}
            <div className="bg-[#041224] text-white rounded-lg px-3 py-2.5 flex justify-between items-center">
              <span className="font-bold text-sm">Total</span>
              <span className="font-bold text-sm">{fmt(rowTotal)}</span>
            </div>
          </>
        )}
      </div>

      {/* DESKTOP TABLE VIEW */}
      <div ref={tableRef} className="hidden md:block bi-card overflow-hidden overflow-x-auto max-h-[70vh] overflow-y-auto w-full">
        <table className="w-full text-xs">
          <thead className="sticky top-0 z-10">
            {drillLevel === "poliza" ? (
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
            ) : drillLevel === "poliza" ? (
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
                    <td className={`px-3 py-1.5 text-center font-normal text-xs tabular-nums ${p.primaNeta < 0 ? "text-[#E62800]" : ""}`}>{p.primaNeta < 0 ? `(${fmt(Math.abs(p.primaNeta))})` : fmt(p.primaNeta)}</td>
                  </tr>
                ))}
                <tr className="bg-[#041224] text-white border-t-2 cursor-default">
                  <td className="px-3 py-1.5 font-bold" colSpan={6}>Total</td>
                  <td className="px-3 py-1.5 text-center font-bold tabular-nums">{fmt(polizaTotal)}</td>
                </tr>
              </>
            ) : (
              /* ─── LEVELS WITH FULL 9 COLUMNS ─── */
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
                        ? "text-[#059669]"
                        : r.primaNeta >= r.pnAnioAnt
                        ? "text-amber-500"
                        : "text-[#E62800]")
                    : (r.diferencia !== null && r.diferencia < 0 ? "text-[#E62800]" : "")

                  return (
                    <tr key={r.name}
                      className={`group border-b border-[#F0F0F0] ${nextLevel ? "cursor-pointer" : ""} transition-all duration-150 ${isOtros ? "bg-gray-100" : idx % 2 === 1 ? "bg-[#FAFBFC]" : "bg-white"} hover:bg-[#FFF5F5]`}
                      onClick={() => nextLevel && selKey && drill(nextLevel, r.name, { ...sel, [selKey]: r.name })}>
                      <td className="px-1 py-1.5 text-center w-6">
                        {nextLevel && <ChevronRight className="w-3.5 h-3.5 text-[#E62800] inline transition-transform group-hover:scale-110 group-hover:translate-x-0.5" />}
                      </td>
                      <td className="px-3 py-1.5 text-xs font-medium text-[#111] text-left">{r.name}</td>
                      <td className={`px-3 py-1.5 text-center tabular-nums text-xs font-normal ${r.primaNeta < 0 ? "text-[#E62800]" : ""}`}>
                        {r.primaNeta < 0 ? `(${fmt(Math.abs(r.primaNeta))})` : fmt(r.primaNeta)}
                      </td>
                      <td className="px-3 py-1.5 text-center tabular-nums text-xs text-gray-600 font-normal">{r.presupuesto !== null ? fmt(r.presupuesto) : <span className="text-gray-300 font-normal">—</span>}</td>
                      <td className={`px-3 py-1.5 text-center tabular-nums text-xs font-normal ${semaforoColor}`}>{r.diferencia !== null ? (r.diferencia < 0 ? `(${fmt(Math.abs(r.diferencia))})` : fmt(r.diferencia)) : <span className="text-gray-300">—</span>}</td>
                      <td className={`px-3 py-1.5 text-center tabular-nums text-xs ${semaforoColor}`}>{r.pctDifPpto !== null ? `${r.pctDifPpto > 0 ? "+" : ""}${r.pctDifPpto}%` : <span className="text-gray-300">—</span>}</td>
                      <td className="px-3 py-1.5 text-center tabular-nums text-xs text-gray-800">{r.pnAnioAnt !== null ? fmt(r.pnAnioAnt) : <span className="text-gray-300">—</span>}</td>
                      <td className={`px-3 py-1.5 text-center tabular-nums text-xs font-normal ${r.difYoY === null ? "" : r.difYoY < 0 ? "text-[#E62800]" : ""}`}>{r.difYoY !== null ? (r.difYoY < 0 ? `(${fmt(Math.abs(r.difYoY))})` : fmt(r.difYoY)) : <span className="text-gray-300">—</span>}</td>
                      <td className={`px-3 py-1.5 text-center tabular-nums text-xs ${r.pctDifYoY === null ? "" : r.pctDifYoY < 0 ? "text-[#E62800]" : r.pctDifYoY > 0 ? "text-[#059669]" : ""}`}>{r.pctDifYoY !== null ? `${r.pctDifYoY > 0 ? "+" : ""}${r.pctDifYoY}%` : <span className="text-gray-300">—</span>}</td>
                      <td className="px-3 py-1.5 text-center tabular-nums text-xs">
                        {r.pendiente !== null ? fmt(r.pendiente) : <span className="text-gray-300">—</span>}
                      </td>
                    </tr>
                  )
                })}
                <tr className="bg-[#041224] text-white border-t-2 cursor-default">
                  <td className="px-1 py-1.5 w-6"></td>
                  <td className="px-3 py-1.5 font-bold text-left">Total</td>
                  <td className="px-3 py-1.5 text-center font-bold tabular-nums">{fmt(rowTotal)}</td>
                  <td className="px-3 py-1.5 text-center text-white/50 tabular-nums">—</td>
                  <td className="px-3 py-1.5 text-center text-white/50 tabular-nums">—</td>
                  <td className="px-3 py-1.5 text-center text-white/50 tabular-nums">—</td>
                  <td className="px-3 py-1.5 text-center text-white/50 tabular-nums">—</td>
                  <td className="px-3 py-1.5 text-center text-white/50 tabular-nums">—</td>
                  <td className="px-3 py-1.5 text-center text-white/50 tabular-nums">—</td>
                  <td className="px-3 py-1.5 text-center text-white/50 tabular-nums">—</td>
                </tr>
              </>
            )}
          </tbody>
        </table>
      </div>
      <PageFooter />
      </div>
    </div>
  )
}
