"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { ChevronRight, ChevronLeft, Search, Download } from "lucide-react"
import { PageTabs } from "@/components/page-tabs"
import { PageFooter } from "@/components/page-footer"
import { PeriodFilter } from "@/components/period-filter"
import { getGerencias, getVendedores, getGrupos, getClientes, getPolizas } from "@/lib/queries"
import type { PolizaRow } from "@/lib/queries"
import { exportExcel, exportPDF } from "@/lib/export"

function fmt(v: number) {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(v)
}

const MESES_LABELS = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"]

const LINEA = "Corporate" // Pre-filtered

type DrillLevel = "gerencia" | "vendedor" | "grupo" | "cliente" | "poliza"
interface SimpleRow { name: string; primaNeta: number }

export default function CorporatePage() {
  const [year, setYear] = useState("2026")
  const [periodos, setPeriodos] = useState<number[]>([2])
  const [search, setSearch] = useState("")
  const [loading, setLoading] = useState(true)
  const [drillLevel, setDrillLevel] = useState<DrillLevel>("gerencia")
  const [crumbs, setCrumbs] = useState<{ level: DrillLevel; label: string }[]>([])
  const [sel, setSel] = useState<{ gerencia?: string; vendedor?: string; grupo?: string; cliente?: string }>({})
  const [rows, setRows] = useState<SimpleRow[]>([])
  const [polizas, setPolizas] = useState<PolizaRow[]>([])
  const tableRef = useRef<HTMLDivElement>(null)

  useEffect(() => { document.title = "Corporate | CLK BI Dashboard" }, [])
  const handleFilterChange = useCallback((newYear: string, newPeriodos: number[]) => {
    setYear(newYear)
    setPeriodos(newPeriodos)
  }, [])
  const periodo = periodos[0] ?? 2

  // Load gerencias (entry level for Corporate)
  useEffect(() => {
    setLoading(true)
    setDrillLevel("gerencia"); setCrumbs([]); setSel({})
    getGerencias(LINEA, periodo, year).then(data => {
      setRows((data ?? []).map(d => ({ name: d.gerencia, primaNeta: d.primaNeta })))
      setLoading(false)
    }).catch(() => { setRows([]); setLoading(false) })
  }, [periodo, year])

  const drill = async (level: DrillLevel, label: string, newSel: typeof sel) => {
    setLoading(true)
    setSel(newSel)
    setCrumbs(prev => [...prev, { level: drillLevel, label }])
    try {
      if (level === "vendedor") {
        const data = await getVendedores(newSel.gerencia!, LINEA, periodo, year)
        setRows((data ?? []).map(d => ({ name: d.vendedor, primaNeta: d.primaNeta })))
      } else if (level === "grupo") {
        const data = await getGrupos(newSel.vendedor!, newSel.gerencia!, LINEA, periodo, year)
        setRows((data ?? []).map(d => ({ name: d.grupo, primaNeta: d.primaNeta })))
      } else if (level === "cliente") {
        const data = await getClientes(newSel.grupo!, newSel.vendedor!, newSel.gerencia!, LINEA, periodo, year)
        setRows((data ?? []).map(d => ({ name: d.cliente, primaNeta: d.primaNeta })))
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
          setRows((data ?? []).map(d => ({ name: d.gerencia, primaNeta: d.primaNeta })))
        } else if (prev.level === "vendedor") {
          const data = await getVendedores(newSel.gerencia!, LINEA, periodo, year)
          setRows((data ?? []).map(d => ({ name: d.vendedor, primaNeta: d.primaNeta })))
        } else if (prev.level === "grupo") {
          const data = await getGrupos(newSel.vendedor!, newSel.gerencia!, LINEA, periodo, year)
          setRows((data ?? []).map(d => ({ name: d.grupo, primaNeta: d.primaNeta })))
        } else if (prev.level === "cliente") {
          const data = await getClientes(newSel.grupo!, newSel.vendedor!, newSel.gerencia!, LINEA, periodo, year)
          setRows((data ?? []).map(d => ({ name: d.cliente, primaNeta: d.primaNeta })))
        }
      } catch { setRows([]) }
      setDrillLevel(prev.level)
      setLoading(false)
    }
    reload()
  }

  const levelLabels: Record<DrillLevel, string> = { gerencia: "Gerencia", vendedor: "Vendedor", grupo: "Grupo", cliente: "Cliente", poliza: "Póliza" }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const filterSearch = <T,>(items: T[], key: string): T[] => search ? items.filter(item => String((item as any)[key]).toLowerCase().includes(search.toLowerCase())) : items

  const filteredRows = filterSearch(rows, "name")
  const filteredPolizas = filterSearch(polizas, "documento")
  const rowTotal = filteredRows.reduce((s, r) => s + r.primaNeta, 0)
  const polizaTotal = filteredPolizas.reduce((s, p) => s + p.primaNeta, 0)

  const handleExcelExport = () => {
    const filename = `CLK_Corporate_${levelLabels[drillLevel]}_${year}_P${periodos.join("-")}.xlsx`
    if (drillLevel === "poliza") {
      exportExcel(filteredPolizas.map(p => ({ "Documento": p.documento, "Aseguradora": p.aseguradora, "Ramo": p.ramo, "Prima": p.primaNeta })), ["Documento","Aseguradora","Ramo","Prima"], ["Documento","Aseguradora","Ramo","Prima"], filename)
    } else {
      exportExcel(filteredRows.map(r => ({ [levelLabels[drillLevel]]: r.name, "Prima neta": r.primaNeta })), [levelLabels[drillLevel], "Prima neta"], [levelLabels[drillLevel], "Prima neta"], filename)
    }
  }

  return (
    <div className="bg-[#FAFAFA] px-3 py-4">
      <div className="max-w-[1200px] mx-auto w-full">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center border-b pb-2 pt-3 md:pt-5 w-full gap-2 md:gap-0">
        <PageTabs />
        <PeriodFilter onFilterChange={handleFilterChange} />
      </div>
      <div className="flex items-center justify-between mb-2 flex-wrap gap-1">
        <h1 className="text-sm font-bold text-[#111] font-lato">Corporate — Prima neta cobrada</h1>
        <div className="flex items-center gap-1">
          <button onClick={handleExcelExport} className="flex items-center gap-1 px-2 py-1 rounded text-xs font-medium border border-[#041224] text-[#041224] hover:bg-[#F5F5F5]">
            <Download className="w-3 h-3" /> Excel
          </button>
        </div>
      </div>

      {/* Breadcrumb */}
      {crumbs.length > 0 && (
        <div className="flex items-center gap-2 mb-2">
          <button onClick={goBack} className="flex items-center gap-1 text-xs text-[#041224] hover:text-[#E62800] font-medium">
            <ChevronLeft className="w-4 h-4" /> Atrás
          </button>
          <div className="flex items-center gap-1 text-xs text-[#888]">
            <span className="text-[#041224] font-semibold">Corporate</span>
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
      </div>

      {/* Row count for large datasets */}
      {drillLevel !== "poliza" && filteredRows.length >= 30 && (
        <div className="text-xs text-[#888] mb-1">{filteredRows.length} registros encontrados — desplazar para ver más</div>
      )}
      {drillLevel === "poliza" && filteredPolizas.length >= 30 && (
        <div className="text-xs text-[#888] mb-1">{filteredPolizas.length} pólizas encontradas — desplazar para ver más</div>
      )}

      {/* Table */}
      <div ref={tableRef} className="bg-white rounded-lg border border-gray-200 overflow-hidden max-h-[70vh] overflow-y-auto">
        {/* Mobile poliza card view */}
        {drillLevel === "poliza" && (
          <div className="md:hidden">
            {loading ? (
              <p className="px-2 py-6 text-center text-xs text-gray-400">Cargando...</p>
            ) : filteredPolizas.length === 0 ? (
              <p className="px-2 py-6 text-center text-xs text-[#888]">Datos en integración</p>
            ) : (
              <div className="space-y-1 p-2">
                {filteredPolizas.map((p, idx) => (
                  <div key={`${p.documento}-${idx}`} className="border border-gray-100 rounded-lg px-2 py-1.5">
                    <div className="flex justify-between items-center mb-0.5">
                      <span className="font-medium text-xs text-[#111]">{p.documento}</span>
                      <span className={`text-xs font-medium tabular-nums ${p.primaNeta < 0 ? "text-[#E62800]" : ""}`}>
                        {p.primaNeta < 0 ? `(${fmt(Math.abs(p.primaNeta))})` : fmt(p.primaNeta)}
                      </span>
                    </div>
                    <div className="text-xs text-gray-500 space-y-0.5">
                      <div>{p.aseguradora} · {p.ramo}</div>
                      <div>{p.subramo} · {p.fechaLiquidacion}</div>
                    </div>
                  </div>
                ))}
                <div className="bg-[#041224] text-white rounded-lg px-2 py-1.5 flex justify-between">
                  <span className="font-bold text-xs">Total</span>
                  <span className="font-bold text-xs tabular-nums">{fmt(polizaTotal)}</span>
                </div>
              </div>
            )}
          </div>
        )}
        <table className={`w-full ${drillLevel === "poliza" ? "hidden md:table" : ""}`}>
          <thead className="sticky top-0 z-10">
            {drillLevel === "poliza" ? (
              <tr className="bg-[#041224] text-white border-b-2 border-b-[#E62800]">
                <th className="text-left px-2 py-1.5 text-xs font-semibold uppercase tracking-wider">Documento</th>
                <th className="text-left px-2 py-1.5 text-xs font-semibold uppercase tracking-wider">Aseguradora</th>
                <th className="text-left px-2 py-1.5 text-xs font-semibold uppercase tracking-wider">Ramo</th>
                <th className="text-left px-2 py-1.5 text-xs font-semibold uppercase tracking-wider">Subramo</th>
                <th className="text-left px-2 py-1.5 text-xs font-semibold uppercase tracking-wider">F. Liquidación</th>
                <th className="text-right px-2 py-1.5 text-xs font-semibold uppercase tracking-wider">Prima neta</th>
              </tr>
            ) : (
              <tr className="bg-[#041224] text-white border-b-2 border-b-[#E62800]">
                <th className="w-6 px-1 py-1.5"></th>
                <th className="text-left px-2 py-1.5 text-xs font-semibold uppercase tracking-wider">{levelLabels[drillLevel]}</th>
                <th className="text-right px-2 py-1.5 text-xs font-semibold uppercase tracking-wider">Prima neta</th>
              </tr>
            )}
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="px-2 py-6 text-center text-xs text-gray-400">Cargando...</td></tr>
            ) : drillLevel === "poliza" ? (
              <>
                {filteredPolizas.length === 0 ? (
                  <tr><td colSpan={6} className="px-2 py-6 text-center text-xs text-[#888]">Datos en integración</td></tr>
                ) : filteredPolizas.map((p, idx) => (
                  <tr key={`${p.documento}-${idx}`} className={`border-b border-[#F0F0F0] hover:bg-[#FFF5F5] ${idx % 2 === 1 ? "bg-[#FAFAFA]" : ""}`}>
                    <td className="px-2 py-2 text-xs font-medium text-[#111]">{p.documento}</td>
                    <td className="px-2 py-2 text-xs">{p.aseguradora}</td>
                    <td className="px-2 py-2 text-xs">{p.ramo}</td>
                    <td className="px-2 py-2 text-xs text-[#666]">{p.subramo}</td>
                    <td className="px-2 py-2 text-xs text-[#666]">{p.fechaLiquidacion}</td>
                    <td className={`px-2 py-2 text-right text-xs font-medium tabular-nums ${p.primaNeta < 0 ? "text-[#E62800]" : ""}`}>{p.primaNeta < 0 ? `(${fmt(Math.abs(p.primaNeta))})` : fmt(p.primaNeta)}</td>
                  </tr>
                ))}
                <tr className="bg-[#041224] text-white"><td className="px-2 py-1.5 text-xs font-bold" colSpan={5}>Total</td><td className="px-2 py-1.5 text-right text-xs font-bold tabular-nums">{fmt(polizaTotal)}</td></tr>
              </>
            ) : (
              <>
                {filteredRows.length === 0 ? (
                  <tr><td colSpan={3} className="px-2 py-6 text-center text-xs text-[#888]">Sin datos para este periodo {year}</td></tr>
                ) : filteredRows.map((r, idx) => {
                  const nextLevel: DrillLevel | null = drillLevel === "gerencia" ? "vendedor" : drillLevel === "vendedor" ? "grupo" : drillLevel === "grupo" ? "cliente" : drillLevel === "cliente" ? "poliza" : null
                  const selKey = drillLevel === "gerencia" ? "gerencia" : drillLevel === "vendedor" ? "vendedor" : drillLevel === "grupo" ? "grupo" : drillLevel === "cliente" ? "cliente" : null
                  return (
                    <tr key={r.name} className={`border-b border-[#F0F0F0] ${nextLevel ? "cursor-pointer" : ""} hover:bg-[#FFF5F5] ${idx % 2 === 1 ? "bg-[#FAFAFA]" : ""}`}
                      onClick={() => nextLevel && selKey && drill(nextLevel, r.name, { ...sel, [selKey]: r.name })}>
                      <td className="px-1 py-2 text-center">{nextLevel && <ChevronRight className="w-3 h-3 text-[#E62800] inline" />}</td>
                      <td className="px-2 py-2 text-xs font-medium text-[#111]">{r.name}</td>
                      <td className={`px-2 py-2 text-right text-xs font-medium tabular-nums ${r.primaNeta < 0 ? "text-[#E62800]" : ""}`}>{r.primaNeta < 0 ? `(${fmt(Math.abs(r.primaNeta))})` : fmt(r.primaNeta)}</td>
                    </tr>
                  )
                })}
                <tr className="bg-[#041224] text-white"><td className="px-1 py-1.5"></td><td className="px-2 py-1.5 text-xs font-bold">Total</td><td className="px-2 py-1.5 text-right text-xs font-bold tabular-nums">{fmt(rowTotal)}</td></tr>
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
