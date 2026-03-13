"use client"

import React, { useState, useEffect, useCallback, useRef } from "react"
import { Download } from "lucide-react"
import { PageTabs } from "@/components/page-tabs"
import { PageFooter } from "@/components/page-footer"
import { PeriodFilter } from "@/components/period-filter"
import { getRankedAseguradoras, getLastDataDate } from "@/lib/queries"
import { supabase } from "@/lib/supabase"
import { exportExcel, exportPDF } from "@/lib/export"

function fmt(v: number) {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(v)
}

function fmtShort(v: number) {
  if (Math.abs(v) >= 1e6) return `$${(v / 1e6).toFixed(1)}M`
  if (Math.abs(v) >= 1e3) return `$${(v / 1e3).toFixed(0)}K`
  return `$${v}`
}

const MESES_LABELS = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"]

interface AseguradoraRow {
  aseguradora: string
  primaNeta: number
  pct: number
  clasificacion: string | null
}

// Top 10 + Otros aggregation
function computeTop10WithOtros(items: AseguradoraRow[]): { rows: AseguradoraRow[]; otrosCount: number } {
  if (items.length <= 10) return { rows: items, otrosCount: 0 }
  const sorted = [...items].sort((a, b) => b.primaNeta - a.primaNeta)
  const top10 = sorted.slice(0, 10)
  const rest = sorted.slice(10)
  const sumPN = rest.reduce((s, r) => s + r.primaNeta, 0)
  const sumPct = rest.reduce((s, r) => s + r.pct, 0)
  const otrosRow: AseguradoraRow = {
    aseguradora: `Otros (${rest.length})`,
    primaNeta: sumPN,
    pct: Math.round(sumPct * 10) / 10,
    clasificacion: null
  }
  return { rows: [...top10, otrosRow], otrosCount: rest.length }
}

export default function AseguradorasPage() {
  const [year, setYear] = useState("2026")
  const [periodos, setPeriodos] = useState<number[]>([2])
  const [allAseguradoras, setAllAseguradoras] = useState<AseguradoraRow[]>([])
  const [totalPrima, setTotalPrima] = useState(0)
  const [clasificacionFilter, setClasificacionFilter] = useState<string>("Todas")
  const [loading, setLoading] = useState(true)
  const [lastDataDate, setLastDataDate] = useState<string | null>(null)
  const tableRef = useRef<HTMLDivElement>(null)

  const handleFilterChange = useCallback((newYear: string, newPeriodos: number[]) => {
    setYear(newYear)
    setPeriodos(newPeriodos)
  }, [])

  useEffect(() => { document.title = "Aseguradoras | CLK BI Dashboard" }, [])
  useEffect(() => { getLastDataDate().then(d => setLastDataDate(d)) }, [])

  const month = periodos[0] ?? 2

  // Fetch aseguradoras with clasificación lookup
  useEffect(() => {
    setLoading(true)

    const loadData = async () => {
      const rawData = await getRankedAseguradoras(month, year, clasificacionFilter)

      if (rawData && rawData.length > 0) {
        const total = rawData.reduce((s, x) => s + x.primaNeta, 0)
        setTotalPrima(total)

        // Fetch clasificación for each aseguradora from catalogos_cias
        const aseguradoraNames = rawData.map(a => a.aseguradora)
        const { data: ciaData } = await supabase
          .from("catalogos_cias")
          .select("CiaAbreviacion, ClasCia_TXT")
          .in("CiaAbreviacion", aseguradoraNames)

        // Map aseguradora -> clasificacion
        const clasificacionMap: Record<string, string> = {}
        if (ciaData) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          for (const cia of ciaData as any[]) {
            clasificacionMap[cia.CiaAbreviacion] = cia.ClasCia_TXT || "Sin clasificar"
          }
        }

        // Build rows with clasificación and percentage
        const rows: AseguradoraRow[] = rawData.map(x => ({
          aseguradora: x.aseguradora,
          primaNeta: x.primaNeta,
          pct: total > 0 ? Math.round((x.primaNeta / total) * 1000) / 10 : 0,
          clasificacion: clasificacionMap[x.aseguradora] || null
        }))

        setAllAseguradoras(rows)
      } else {
        setAllAseguradoras([])
        setTotalPrima(0)
      }
      setLoading(false)
    }

    loadData()
  }, [year, month, clasificacionFilter])

  // Filter out zero-value aseguradoras and apply Top 10 + Otros
  const filteredAseguradoras = allAseguradoras.filter(a => a.primaNeta > 0)
  const { rows: displayRows, otrosCount } = computeTop10WithOtros(filteredAseguradoras)

  const maxAseguradora = filteredAseguradoras.length > 0 ? Math.max(...filteredAseguradoras.map(a => a.primaNeta)) : 0
  // Single uniform dark navy for all bars - length shows value, no need for color variation
  const COLORS = ["#041224", "#041224", "#041224", "#041224", "#041224", "#041224", "#041224", "#041224", "#041224", "#041224"]

  // Clasificación badge colors
  const getClasificacionBadge = (clas: string | null) => {
    if (!clas) return null
    const colorMap: Record<string, { bg: string; text: string }> = {
      "Estratégica": { bg: "bg-[#041224]", text: "text-white" },
      "Importante": { bg: "bg-[#FDECEA]", text: "text-[#E62800]" },
      "De servicio": { bg: "bg-[#E5E7E9]", text: "text-[#333]" },
      "Servicio": { bg: "bg-[#E5E7E9]", text: "text-[#333]" }
    }
    const colors = colorMap[clas] || { bg: "bg-gray-100", text: "text-gray-600" }
    return <span className={`text-[9px] px-1.5 py-0.5 rounded font-medium ${colors.bg} ${colors.text}`}>{clas}</span>
  }

  const handleExcelExport = () => {
    const periodoLabel = periodos.map(p => MESES_LABELS[p - 1]).join("-")
    const filename = `CLK_Aseguradoras_${year}_${periodoLabel}.xlsx`
    exportExcel(
      filteredAseguradoras.map((a, i) => ({
        "#": i + 1,
        "Aseguradora": a.aseguradora,
        "Prima Neta": a.primaNeta,
        "% Participación": `${a.pct}%`,
        "Clasificación": a.clasificacion || "—"
      })),
      ["#", "Aseguradora", "Prima Neta", "% Participación", "Clasificación"],
      ["#", "Aseguradora", "Prima Neta", "% Participación", "Clasificación"],
      filename
    )
  }

  const handlePDFExport = () => {
    if (!tableRef.current) return
    const periodoLabelPDF = periodos.map(p => MESES_LABELS[p - 1]).join(", ")
    const filters = `${periodoLabelPDF} ${year} | Clasificación: ${clasificacionFilter}`
    exportPDF(tableRef.current, "Aseguradoras — Prima Neta Cobrada", filters)
  }

  return (
    <div className="min-h-screen bg-[#FAFAFA] px-3 py-4 flex flex-col">
      <div className="max-w-[1200px] mx-auto w-full flex flex-col flex-1">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center border-b pb-2 pt-3 md:pt-5 w-full gap-2 md:gap-0">
          <PageTabs />
          <PeriodFilter onFilterChange={handleFilterChange} />
        </div>

        {/* Title + export buttons */}
        <div className="flex items-center justify-between mt-3 mb-2 flex-wrap gap-1">
          <h1 className="text-sm font-bold text-[#111] font-lato">Aseguradoras — Prima neta cobrada</h1>
          <div className="flex items-center gap-1.5">
            <label htmlFor="clasif-filter" className="text-xs text-gray-500 font-medium">Clasificación:</label>
            <select
              id="clasif-filter"
              value={clasificacionFilter}
              onChange={e => setClasificacionFilter(e.target.value)}
              className="border border-gray-300 rounded-md px-2 py-0.5 text-xs font-medium bg-white"
            >
              <option value="Todas">Todas</option>
              <option value="Estratégica">Estratégica</option>
              <option value="Importante">Importante</option>
              <option value="De servicio">De servicio</option>
            </select>
            <button onClick={handleExcelExport} className="flex items-center gap-1 px-2.5 py-1.5 rounded text-[11px] font-medium border border-[#041224] text-[#041224] hover:bg-[#F5F5F5] transition-colors ml-2">
              <Download className="w-3 h-3" /> Excel
            </button>
            <button onClick={handlePDFExport} className="flex items-center gap-1 px-2.5 py-1.5 rounded text-[11px] font-medium border border-[#041224] text-[#041224] hover:bg-[#F5F5F5] transition-colors">
              <Download className="w-3 h-3" /> PDF
            </button>
          </div>
        </div>

        {/* Data freshness indicator */}
        <div className="flex items-center justify-end gap-2 mb-2">
          <span className="text-xs text-[#CCD1D3]">Datos al: {lastDataDate ?? "—"}</span>
        </div>

        {loading ? (
          <div className="bg-white rounded-lg border border-gray-200 py-8 text-center">
            <p className="text-gray-400 text-xs">Cargando...</p>
          </div>
        ) : filteredAseguradoras.length > 0 ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {/* Left: Table */}
            <div ref={tableRef} className="bg-white rounded-lg border border-gray-200 overflow-hidden">
              {/* Mobile Card View */}
              <div className="md:hidden space-y-1.5 p-2">
                {displayRows.map((a, i) => {
                  const isOtros = a.aseguradora.startsWith("Otros (")
                  return (
                    <div key={a.aseguradora} className={`rounded-lg border border-gray-200 px-3 py-2 ${isOtros ? "bg-gray-100" : "bg-white"}`}>
                      <div className="flex justify-between items-center mb-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-500 tabular-nums w-4">{i + 1}</span>
                          <span className="font-medium text-sm text-[#111]">{a.aseguradora}</span>
                        </div>
                        <span className="text-sm font-bold text-[#041224]">{a.pct}%</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-base font-black text-[#041224]">{fmtShort(a.primaNeta)}</span>
                        {a.clasificacion && getClasificacionBadge(a.clasificacion)}
                      </div>
                    </div>
                  )
                })}
                <div className="bg-[#041224] text-white rounded-lg px-3 py-2.5 flex justify-between items-center">
                  <span className="font-bold text-sm">Total</span>
                  <span className="font-bold text-sm">{fmt(totalPrima)}</span>
                </div>
              </div>

              {/* Desktop Table View */}
              <table className="hidden md:table w-full text-xs">
                <thead className="sticky top-0 z-10">
                  <tr className="bg-[#041224] text-white border-b-2 border-b-[#E62800]">
                    <th className="px-2 py-2.5 text-center text-xs font-semibold uppercase tracking-wider w-8">#</th>
                    <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wider">Aseguradora</th>
                    <th className="px-3 py-2.5 text-center text-xs font-semibold uppercase tracking-wider">Clasificación</th>
                    <th className="px-3 py-2.5 text-center text-xs font-semibold uppercase tracking-wider">Prima Neta</th>
                    <th className="px-3 py-2.5 text-center text-xs font-semibold uppercase tracking-wider">% Participación</th>
                  </tr>
                </thead>
                <tbody>
                  {displayRows.map((a, i) => {
                    const isOtros = a.aseguradora.startsWith("Otros (")
                    return (
                      <tr key={a.aseguradora} className={`border-b border-[#E5E7EB] hover:bg-[#FFF5F5] transition-colors ${isOtros ? "bg-gray-100" : i % 2 === 1 ? "bg-[#FAFBFC]" : "bg-white"}`}>
                        <td className="px-2 py-3 text-center text-sm text-gray-800 tabular-nums">{i + 1}</td>
                        <td className="px-3 py-3 text-sm font-semibold text-[#111] text-left">{a.aseguradora}</td>
                        <td className="px-3 py-3 text-center">{a.clasificacion ? getClasificacionBadge(a.clasificacion) : <span className="text-gray-300">—</span>}</td>
                        <td className="px-3 py-3 text-center text-sm font-medium tabular-nums">{fmt(a.primaNeta)}</td>
                        <td className="px-3 py-3 text-center text-sm font-medium tabular-nums text-gray-800">{a.pct}%</td>
                      </tr>
                    )
                  })}
                  <tr className="bg-[#041224] text-white border-t-2 cursor-default">
                    <td className="px-2 py-3"></td>
                    <td className="px-3 py-3 text-sm font-bold text-left">Total</td>
                    <td className="px-3 py-3"></td>
                    <td className="px-3 py-3 text-center text-sm font-bold tabular-nums">{fmt(totalPrima)}</td>
                    <td className="px-3 py-3 text-center text-sm font-bold tabular-nums">100%</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Right: Chart */}
            <div className="bg-white rounded-lg border border-gray-200 p-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-[#041224] mb-3">Distribución por Prima Neta</h3>
              <div className="space-y-2">
                {displayRows.map((a, i) => {
                  const isOtros = a.aseguradora.startsWith("Otros (")
                  return (
                    <div key={a.aseguradora} className="flex items-center gap-2">
                      <span className="text-xs text-[#333] w-28 truncate shrink-0" title={a.aseguradora}>{a.aseguradora}</span>
                      <div className="flex-1 bg-gray-100 rounded h-5 overflow-hidden relative">
                        <div
                          className="h-full rounded transition-all duration-500 flex items-center"
                          style={{
                            width: `${maxAseguradora > 0 ? Math.max((a.primaNeta / maxAseguradora) * 100, 3) : 0}%`,
                            backgroundColor: isOtros ? "#9CA3AF" : (COLORS[i] || "#059669")
                          }}
                        >
                          {(a.primaNeta / maxAseguradora) * 100 > 25 && (
                            <span className="text-[10px] text-white font-medium px-1.5 whitespace-nowrap">{fmtShort(a.primaNeta)}</span>
                          )}
                        </div>
                        {(a.primaNeta / maxAseguradora) * 100 <= 25 && (
                          <span className="absolute right-1 top-1/2 -translate-y-1/2 text-[10px] text-gray-600 font-medium">{fmtShort(a.primaNeta)}</span>
                        )}
                      </div>
                      <span className="text-xs font-medium tabular-nums w-12 text-right shrink-0" style={{ color: isOtros ? "#6B7280" : "#041224" }}>{a.pct}%</span>
                    </div>
                  )
                })}
              </div>

              {/* Summary stats */}
              <div className="mt-4 pt-3 border-t border-gray-200">
                <div className="flex justify-between text-xs">
                  <span className="text-gray-500">Total aseguradoras:</span>
                  <span className="font-medium text-[#041224]">{filteredAseguradoras.length}</span>
                </div>
                <div className="flex justify-between text-xs mt-1">
                  <span className="text-gray-500">Prima neta total:</span>
                  <span className="font-bold text-[#041224]">{fmt(totalPrima)}</span>
                </div>
                {otrosCount > 0 && (
                  <div className="flex justify-between text-xs mt-1">
                    <span className="text-gray-500">Aseguradoras en "Otros":</span>
                    <span className="font-medium text-gray-600">{otrosCount}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-lg border border-gray-200 py-8 text-center">
            <p className="text-[#888] text-xs">Sin datos de aseguradoras para este periodo</p>
          </div>
        )}

        <PageFooter />
      </div>
    </div>
  )
}
