"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { ChevronRight, ChevronLeft, Search, Download } from "lucide-react"
import { getGerencias, getVendedores, getGrupos, getClientes, getPolizas } from "@/lib/queries"
import type { PolizaRow } from "@/lib/queries"
import { exportExcel, exportPDF } from "@/lib/export"

function fmt(v: number) {
  return new Intl.NumberFormat("es-MX", {
    style: "currency", currency: "MXN",
    minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(v)
}

type DrillLevel = "gerencia" | "vendedor" | "grupo" | "cliente" | "poliza"

interface DrillRow {
  name: string
  primaNeta: number
}

interface Crumb {
  level: DrillLevel
  label: string
  selKey: string
}

interface DetailDrillTableProps {
  selectedLinea: string | null
  periodo: number
  year: string
}

const LEVEL_LABELS: Record<DrillLevel, string> = {
  gerencia: "Gerencia",
  vendedor: "Vendedor",
  grupo: "Grupo",
  cliente: "Cliente / Asegurado",
  poliza: "Póliza",
}

export function DetailDrillTable({ selectedLinea, periodo, year }: DetailDrillTableProps) {
  const [drillLevel, setDrillLevel] = useState<DrillLevel>("gerencia")
  const [crumbs, setCrumbs] = useState<Crumb[]>([])
  const [rows, setRows] = useState<DrillRow[]>([])
  const [polizas, setPolizas] = useState<PolizaRow[]>([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState("")
  const [animKey, setAnimKey] = useState(0)
  const tableRef = useRef<HTMLDivElement>(null)

  // Track selections for deeper queries
  const [sel, setSel] = useState<{
    linea?: string; gerencia?: string; vendedor?: string; grupo?: string; cliente?: string
  }>({})

  // Reset when linea changes
  useEffect(() => {
    if (!selectedLinea) {
      setRows([])
      setPolizas([])
      setCrumbs([])
      setSel({})
      setSearch("")
      return
    }
    setDrillLevel("gerencia")
    setCrumbs([])
    setSel({ linea: selectedLinea })
    setSearch("")
    loadGerencias(selectedLinea)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedLinea, periodo, year])

  const loadGerencias = async (linea: string) => {
    setLoading(true)
    try {
      const data = await getGerencias(linea, periodo, year)
      setRows((data ?? []).map(d => ({ name: d.gerencia, primaNeta: d.primaNeta })))
    } catch { setRows([]) }
    setLoading(false)
    setAnimKey(k => k + 1)
  }

  const drill = useCallback(async (
    level: DrillLevel,
    label: string,
    newSel: typeof sel,
    newCrumb: Crumb
  ) => {
    setLoading(true)
    setSel(newSel)
    setCrumbs(prev => [...prev, newCrumb])
    setSearch("")

    try {
      if (level === "vendedor") {
        const data = await getVendedores(newSel.gerencia!, newSel.linea!, periodo, year)
        setRows((data ?? []).map(d => ({ name: d.vendedor, primaNeta: d.primaNeta })))
      } else if (level === "grupo") {
        const data = await getGrupos(newSel.vendedor!, newSel.gerencia!, newSel.linea!, periodo, year)
        setRows((data ?? []).map(d => ({ name: d.grupo, primaNeta: d.primaNeta })))
      } else if (level === "cliente") {
        const data = await getClientes(newSel.grupo!, newSel.vendedor!, newSel.gerencia!, newSel.linea!, periodo, year)
        setRows((data ?? []).map(d => ({ name: d.cliente, primaNeta: d.primaNeta })))
      } else if (level === "poliza") {
        const data = await getPolizas(newSel.cliente!, newSel.grupo!, newSel.vendedor!, newSel.gerencia!, newSel.linea!, periodo, year)
        setPolizas(data ?? [])
        setRows([])
      }
    } catch { setRows([]); setPolizas([]) }

    setDrillLevel(level)
    setLoading(false)
    setAnimKey(k => k + 1)
  }, [periodo, year])

  const goBack = () => {
    if (crumbs.length === 0 || !selectedLinea) return
    const newCrumbs = crumbs.slice(0, -1)
    setCrumbs(newCrumbs)
    setSearch("")

    if (newCrumbs.length === 0) {
      // Back to gerencias
      setDrillLevel("gerencia")
      setSel({ linea: selectedLinea })
      loadGerencias(selectedLinea)
      return
    }

    // Rebuild sel from crumbs and re-fetch
    const rebuildSel: typeof sel = { linea: selectedLinea }
    for (const c of newCrumbs) {
      rebuildSel[c.selKey as keyof typeof sel] = c.label
    }
    const lastCrumb = newCrumbs[newCrumbs.length - 1]
    const nextLevelMap: Record<string, DrillLevel> = {
      gerencia: "vendedor", vendedor: "grupo", grupo: "cliente", cliente: "poliza"
    }
    const targetLevel = nextLevelMap[lastCrumb.level] || "gerencia"
    setSel(rebuildSel)

    // Re-fetch data for target level without adding crumb
    const refetch = async () => {
      setLoading(true)
      try {
        if (targetLevel === "vendedor") {
          const data = await getVendedores(rebuildSel.gerencia!, rebuildSel.linea!, periodo, year)
          setRows((data ?? []).map(d => ({ name: d.vendedor, primaNeta: d.primaNeta })))
        } else if (targetLevel === "grupo") {
          const data = await getGrupos(rebuildSel.vendedor!, rebuildSel.gerencia!, rebuildSel.linea!, periodo, year)
          setRows((data ?? []).map(d => ({ name: d.grupo, primaNeta: d.primaNeta })))
        } else if (targetLevel === "cliente") {
          const data = await getClientes(rebuildSel.grupo!, rebuildSel.vendedor!, rebuildSel.gerencia!, rebuildSel.linea!, periodo, year)
          setRows((data ?? []).map(d => ({ name: d.cliente, primaNeta: d.primaNeta })))
        } else if (targetLevel === "poliza") {
          const data = await getPolizas(rebuildSel.cliente!, rebuildSel.grupo!, rebuildSel.vendedor!, rebuildSel.gerencia!, rebuildSel.linea!, periodo, year)
          setPolizas(data ?? [])
          setRows([])
        }
      } catch { setRows([]); setPolizas([]) }
      setDrillLevel(targetLevel)
      setLoading(false)
      setAnimKey(k => k + 1)
    }
    refetch()
  }

  const goToCrumb = (idx: number) => {
    if (!selectedLinea) return
    if (idx < 0) {
      // Go to gerencias root
      setCrumbs([])
      setDrillLevel("gerencia")
      setSel({ linea: selectedLinea })
      setSearch("")
      loadGerencias(selectedLinea)
      return
    }
    // Slice crumbs to idx+1, rebuild sel, re-fetch next level
    const newCrumbs = crumbs.slice(0, idx + 1)
    setCrumbs(newCrumbs)
    setSearch("")
    const rebuildSel: typeof sel = { linea: selectedLinea }
    for (const c of newCrumbs) {
      rebuildSel[c.selKey as keyof typeof sel] = c.label
    }
    setSel(rebuildSel)

    const lastCrumb = newCrumbs[newCrumbs.length - 1]
    const nextLevelMap: Record<string, DrillLevel> = {
      gerencia: "vendedor", vendedor: "grupo", grupo: "cliente", cliente: "poliza"
    }
    const targetLevel = nextLevelMap[lastCrumb.level] || "gerencia"

    const refetch = async () => {
      setLoading(true)
      try {
        if (targetLevel === "vendedor") {
          const data = await getVendedores(rebuildSel.gerencia!, rebuildSel.linea!, periodo, year)
          setRows((data ?? []).map(d => ({ name: d.vendedor, primaNeta: d.primaNeta })))
        } else if (targetLevel === "grupo") {
          const data = await getGrupos(rebuildSel.vendedor!, rebuildSel.gerencia!, rebuildSel.linea!, periodo, year)
          setRows((data ?? []).map(d => ({ name: d.grupo, primaNeta: d.primaNeta })))
        } else if (targetLevel === "cliente") {
          const data = await getClientes(rebuildSel.grupo!, rebuildSel.vendedor!, rebuildSel.gerencia!, rebuildSel.linea!, periodo, year)
          setRows((data ?? []).map(d => ({ name: d.cliente, primaNeta: d.primaNeta })))
        } else if (targetLevel === "poliza") {
          const data = await getPolizas(rebuildSel.cliente!, rebuildSel.grupo!, rebuildSel.vendedor!, rebuildSel.gerencia!, rebuildSel.linea!, periodo, year)
          setPolizas(data ?? [])
          setRows([])
        }
      } catch { setRows([]); setPolizas([]) }
      setDrillLevel(targetLevel)
      setLoading(false)
      setAnimKey(k => k + 1)
    }
    refetch()
  }

  const handleRowClick = (row: DrillRow) => {
    const nextMap: Record<DrillLevel, DrillLevel | null> = {
      gerencia: "vendedor", vendedor: "grupo", grupo: "cliente", cliente: "poliza", poliza: null
    }
    const selKeyMap: Record<DrillLevel, string> = {
      gerencia: "gerencia", vendedor: "vendedor", grupo: "grupo", cliente: "cliente", poliza: ""
    }
    const nextLevel = nextMap[drillLevel]
    if (!nextLevel) return
    const newSel = { ...sel, [selKeyMap[drillLevel]]: row.name }
    drill(nextLevel, row.name, newSel, { level: drillLevel, label: row.name, selKey: selKeyMap[drillLevel] })
  }

  // Filtering
  const filteredRows = search
    ? rows.filter(r => r.name.toLowerCase().includes(search.toLowerCase()))
    : rows
  const filteredPolizas = search
    ? polizas.filter(p => p.documento.toLowerCase().includes(search.toLowerCase()) || p.aseguradora.toLowerCase().includes(search.toLowerCase()))
    : polizas

  const rowTotal = filteredRows.reduce((s, r) => s + r.primaNeta, 0)
  const polizaTotal = filteredPolizas.reduce((s, p) => s + p.primaNeta, 0)

  const hasNextLevel = drillLevel !== "poliza"

  // Export
  const handleExcelExport = () => {
    const levelName = drillLevel === "poliza" ? "Póliza" : LEVEL_LABELS[drillLevel]
    const filename = `CLK_Detalle_${levelName}_${year}_P${periodo}.xlsx`
    if (drillLevel === "poliza") {
      exportExcel(
        filteredPolizas.map(p => ({ "Documento": p.documento, "Aseguradora": p.aseguradora, "Ramo": p.ramo, "Subramo": p.subramo, "F. Liquidación": p.fechaLiquidacion, "F. Lím. Pago": p.fechaLimPago, "Prima neta": p.primaNeta })),
        ["Documento", "Aseguradora", "Ramo", "Subramo", "F. Liquidación", "F. Lím. Pago", "Prima neta"],
        ["Documento", "Aseguradora", "Ramo", "Subramo", "F. Liquidación", "F. Lím. Pago", "Prima neta"],
        filename
      )
    } else {
      exportExcel(
        filteredRows.map(r => ({ [levelName]: r.name, "Prima neta": r.primaNeta })),
        [levelName, "Prima neta"],
        [levelName, "Prima neta"],
        filename
      )
    }
  }

  const handlePDFExport = () => {
    if (!tableRef.current) return
    const path = [selectedLinea, ...crumbs.map(c => c.label)].filter(Boolean).join(" > ")
    exportPDF(tableRef.current, "Detalle — " + (path || ""), `Periodo ${periodo} | ${year}`)
  }

  // Empty state
  if (!selectedLinea) {
    return (
      <div className="mt-4">
        <div className="border-t border-gray-200 mb-4" />
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-5 py-12 text-center">
            <div className="text-4xl mb-3">👆</div>
            <p className="text-sm text-gray-400">Selecciona una línea de negocio para ver el desglose detallado</p>
            <p className="text-xs text-gray-300 mt-1">Click en una fila de la tabla o una barra del gráfico</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="mt-4">
      {/* Separator */}
      <div className="border-t border-gray-200 mb-3" />

      {/* Container */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">

        {/* Header bar — Azure Blue */}
        <div className="flex items-center justify-between px-4 py-2.5" style={{ backgroundColor: "#3983F6" }}>
          <div className="flex items-center gap-3">
            <h3 className="text-sm font-semibold text-white">
              📋 {drillLevel === "poliza" ? "Pólizas" : LEVEL_LABELS[drillLevel]}
            </h3>
            <span className="text-xs text-white/70 bg-white/15 px-2 py-0.5 rounded-full">
              {drillLevel === "poliza" ? filteredPolizas.length : filteredRows.length} registros
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={handleExcelExport} className="flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium text-white border border-white/30 hover:bg-white/15 transition-colors">
              <Download className="w-3 h-3" /> Excel
            </button>
            <button onClick={handlePDFExport} className="flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium text-white border border-white/30 hover:bg-white/15 transition-colors">
              <Download className="w-3 h-3" /> PDF
            </button>
          </div>
        </div>

        {/* Breadcrumb + Search */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-gray-100 bg-gray-50/50">
          <div className="flex items-center gap-1.5 text-xs flex-wrap">
            {crumbs.length > 0 && (
              <button onClick={goBack} className="flex items-center gap-0.5 text-[#3983F6] hover:text-[#2b6fd4] font-medium transition-colors">
                <ChevronLeft className="w-3.5 h-3.5" /> Atrás
              </button>
            )}
            {crumbs.length > 0 && <span className="text-gray-300 mx-1">|</span>}
            <button onClick={() => goToCrumb(-1)} className="text-[#3983F6] hover:underline">
              {selectedLinea}
            </button>
            {crumbs.map((c, i) => (
              <span key={i} className="flex items-center gap-1">
                <ChevronRight className="w-3 h-3 text-gray-300" />
                <button
                  onClick={() => goToCrumb(i)}
                  className={i === crumbs.length - 1
                    ? "text-[#052F5F] font-semibold"
                    : "text-[#3983F6] hover:underline"
                  }
                >
                  {c.label}
                </button>
              </span>
            ))}
          </div>
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar..."
              className="pl-7 pr-3 py-1 border border-gray-200 rounded text-xs w-44 bg-white focus:border-[#3983F6] focus:ring-1 focus:ring-[#3983F6]/20 outline-none transition-all"
            />
          </div>
        </div>

        {/* Table */}
        <div ref={tableRef} className="max-h-[42vh] overflow-y-auto overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10">
              {drillLevel === "poliza" ? (
                <tr style={{ backgroundColor: "#3983F6" }}>
                  <th className="text-left px-3 py-2 text-[11px] font-semibold text-white uppercase tracking-wide">Documento</th>
                  <th className="text-left px-3 py-2 text-[11px] font-semibold text-white uppercase tracking-wide">Aseguradora</th>
                  <th className="text-left px-3 py-2 text-[11px] font-semibold text-white uppercase tracking-wide">Ramo</th>
                  <th className="text-left px-3 py-2 text-[11px] font-semibold text-white uppercase tracking-wide">Subramo</th>
                  <th className="text-left px-3 py-2 text-[11px] font-semibold text-white uppercase tracking-wide">F. Liquidación</th>
                  <th className="text-left px-3 py-2 text-[11px] font-semibold text-white uppercase tracking-wide">F. Lím. Pago</th>
                  <th className="text-right px-3 py-2 text-[11px] font-semibold text-white uppercase tracking-wide">Prima neta</th>
                </tr>
              ) : (
                <tr style={{ backgroundColor: "#3983F6" }}>
                  {hasNextLevel && <th className="w-8 px-1 py-2"></th>}
                  <th className="text-left px-3 py-2 text-[11px] font-semibold text-white uppercase tracking-wide">{LEVEL_LABELS[drillLevel]}</th>
                  <th className="text-right px-3 py-2 text-[11px] font-semibold text-white uppercase tracking-wide">Prima neta</th>
                </tr>
              )}
            </thead>
            <tbody key={animKey}>
              {loading ? (
                <tr>
                  <td colSpan={drillLevel === "poliza" ? 7 : 3} className="px-4 py-10 text-center">
                    <div className="inline-flex items-center gap-2 text-gray-400 text-sm">
                      <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Cargando...
                    </div>
                  </td>
                </tr>
              ) : drillLevel === "poliza" ? (
                <>
                  {filteredPolizas.length === 0 ? (
                    <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400 text-sm">Sin pólizas para este periodo</td></tr>
                  ) : filteredPolizas.map((p, idx) => (
                    <tr
                      key={`${p.documento}-${idx}`}
                      className={`border-b border-gray-50 transition-all duration-150 hover:bg-[#eff6ff] ${idx % 2 === 0 ? "bg-white" : "bg-[#fafbfc]"}`}
                      style={{ animation: `fadeSlideIn 0.3s ease ${idx * 30}ms both` }}
                    >
                      <td className="px-3 py-2 font-medium text-gray-900">{p.documento}</td>
                      <td className="px-3 py-2 text-gray-600">{p.aseguradora}</td>
                      <td className="px-3 py-2 text-gray-600">{p.ramo}</td>
                      <td className="px-3 py-2 text-gray-500">{p.subramo}</td>
                      <td className="px-3 py-2 text-gray-500">{p.fechaLiquidacion}</td>
                      <td className="px-3 py-2 text-gray-500">{p.fechaLimPago}</td>
                      <td className={`px-3 py-2 text-right font-medium tabular-nums ${p.primaNeta < 0 ? "text-[#E62800]" : "text-gray-900"}`}>
                        {p.primaNeta < 0 ? `(${fmt(Math.abs(p.primaNeta))})` : fmt(p.primaNeta)}
                      </td>
                    </tr>
                  ))}
                  {filteredPolizas.length > 0 && (
                    <tr style={{ backgroundColor: "#6B7280" }}>
                      <td className="px-3 py-2 font-bold text-white" colSpan={6}>Total</td>
                      <td className="px-3 py-2 text-right font-bold text-white tabular-nums">{fmt(polizaTotal)}</td>
                    </tr>
                  )}
                </>
              ) : (
                <>
                  {filteredRows.length === 0 ? (
                    <tr><td colSpan={3} className="px-4 py-8 text-center text-gray-400 text-sm">Sin datos para este periodo</td></tr>
                  ) : filteredRows.map((r, idx) => (
                    <tr
                      key={r.name}
                      className={`group border-b border-gray-50 transition-all duration-150 hover:bg-[#eff6ff] ${hasNextLevel ? "cursor-pointer" : ""} ${idx % 2 === 0 ? "bg-white" : "bg-[#fafbfc]"}`}
                      onClick={() => handleRowClick(r)}
                      style={{ animation: `fadeSlideIn 0.3s ease ${idx * 30}ms both` }}
                    >
                      {hasNextLevel && (
                        <td className="px-1 py-2 text-center">
                          <ChevronRight className="w-4 h-4 text-[#3983F6] inline transition-transform duration-200 group-hover:translate-x-0.5 group-hover:scale-110" />
                        </td>
                      )}
                      <td className="px-3 py-2 font-medium text-gray-900">{r.name}</td>
                      <td className={`px-3 py-2 text-right font-medium tabular-nums ${r.primaNeta < 0 ? "text-[#E62800]" : "text-gray-900"}`}>
                        {r.primaNeta < 0 ? `(${fmt(Math.abs(r.primaNeta))})` : fmt(r.primaNeta)}
                        {hasNextLevel && (
                          <span className="ml-2 text-[9px] text-[#3983F6] opacity-0 group-hover:opacity-100 transition-opacity font-medium">
                            ver detalle →
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {filteredRows.length > 0 && (
                    <tr style={{ backgroundColor: "#6B7280" }}>
                      {hasNextLevel && <td className="px-1 py-2"></td>}
                      <td className="px-3 py-2 font-bold text-white">Total</td>
                      <td className="px-3 py-2 text-right font-bold text-white tabular-nums">{fmt(rowTotal)}</td>
                    </tr>
                  )}
                </>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* CSS animation */}
      <style jsx global>{`
        @keyframes fadeSlideIn {
          from { opacity: 0; transform: translateY(4px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  )
}
