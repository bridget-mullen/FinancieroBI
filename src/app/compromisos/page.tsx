"use client"

import { useState, useEffect, useCallback } from "react"
import { PageTabs } from "@/components/page-tabs"
import { PeriodFilter } from "@/components/period-filter"
import { getCompromisos } from "@/lib/queries"
import type { CompromisoRow } from "@/lib/queries"

function fmt(v: number) {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(v)
}
function fmtShort(v: number) {
  if (v >= 1e6) return `$${(v / 1e6).toFixed(1)}M`
  if (v >= 1e3) return `$${(v / 1e3).toFixed(0)}K`
  return `$${v}`
}
function shortName(name: string, maxLen = 18) {
  const parts = name.trim().split(/\s+/)
  if (parts.length <= 2) {
    // If still too long, abbreviate last name
    if (name.length > maxLen && parts.length === 2) {
      return `${parts[0]} ${parts[1][0]}.`
    }
    return name
  }
  // First name + last name
  const firstName = parts[0]
  const lastName = parts[parts.length - 1]
  const fullName = `${firstName} ${lastName}`
  // If still too long, abbreviate last name
  if (fullName.length > maxLen) {
    return `${firstName} ${lastName[0]}.`
  }
  return fullName
}
// Semaforo logic: needs actual vs lastYear vs budget comparison
// RED: below last year, YELLOW: above last year but below budget, GREEN: exceeded budget
function semaforoStatus(actual: number, lastYear: number, budget: number): 'red' | 'yellow' | 'green' {
  if (actual < lastYear) return 'red'
  if (actual < budget) return 'yellow'
  return 'green'
}
function semaforoColorFromStatus(status: 'red' | 'yellow' | 'green') {
  if (status === 'green') return "#059669"
  if (status === 'yellow') return "#F5C518"
  return "#E62800"
}
// Legacy percentage-based color (fallback when we don't have lastYear/budget)
function semaforoColor(pct: number) {
  if (pct >= 100) return "#059669"
  if (pct >= 80) return "#F5C518"
  return "#E62800"
}
function Semaforo({ status }: { status?: 'red' | 'yellow' | 'green' }) {
  // Single clean colored circle based on status
  const bgColor = status === 'green' ? '#059669' : status === 'yellow' ? '#F5C518' : '#E62800'
  return (
    <span
      className="inline-block w-3 h-3 rounded-full"
      style={{ backgroundColor: bgColor }}
    />
  )
}

/* Premium horizontal bar chart */
function PremiumBarChart({ data, colorFn, barHeight = 18, showGrid = true }: {
  data: { name: string; value: number; pct?: number }[];
  colorFn: (idx: number, pct?: number) => { from: string; to: string };
  barHeight?: number;
  showGrid?: boolean;
}) {
  if (!data.length) return null
  const max = Math.max(...data.map(d => d.value), 1)
  const gridLines = showGrid ? [25, 50, 75, 100] : []
  return (
    <div className="flex flex-col justify-center w-full h-full relative">
      {/* Grid lines */}
      {showGrid && (
        <div className="absolute inset-0 pointer-events-none" style={{ left: 70, right: 55 }}>
          {gridLines.map(g => (
            <div key={g} className="absolute top-0 bottom-0" style={{ left: `${g}%`, width: 1, background: 'rgba(0,0,0,0.06)' }} />
          ))}
        </div>
      )}
      <div className="flex flex-col justify-center gap-[4px] w-full">
        {data.map((d, i) => {
          const pct = Math.max((d.value / max) * 100, 4)
          const colors = colorFn(i, d.pct)
          return (
            <div key={i} className="flex items-center gap-1.5" style={{ height: barHeight }}>
              <span className="tabular-nums" style={{
                fontSize: 10, color: '#374151', width: 70, textAlign: 'right', flexShrink: 0,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                fontWeight: 500, letterSpacing: '-0.01em'
              }}>{d.name}</span>
              <div className="flex-1 h-full flex items-center">
                <div style={{
                  width: `${pct}%`, height: barHeight - 4,
                  background: `linear-gradient(90deg, ${colors.from}, ${colors.to})`,
                  borderRadius: 4, minWidth: 6,
                  boxShadow: `0 1px 3px ${colors.from}33`,
                  transition: 'width 0.5s ease'
                }} />
                <span className="tabular-nums" style={{
                  fontSize: 9, color: '#374151', fontWeight: 600,
                  marginLeft: 4, whiteSpace: 'nowrap', letterSpacing: '-0.02em'
                }}>{fmtShort(d.value)}</span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// Top 10 + Otros aggregation
function computeTop10WithOtros(items: CompromisoRow[]): { rows: CompromisoRow[]; otrosCount: number; otrosRow: CompromisoRow | null } {
  if (items.length <= 10) return { rows: items, otrosCount: 0, otrosRow: null }
  const sorted = [...items].sort((a, b) => b.primaActual - a.primaActual)
  const top10 = sorted.slice(0, 10)
  const rest = sorted.slice(10)
  const sumMeta = rest.reduce((s, r) => s + r.meta, 0)
  const sumActual = rest.reduce((s, r) => s + r.primaActual, 0)
  const pctAvance = sumMeta > 0 ? Math.round((sumActual / sumMeta) * 1000) / 10 : 0
  const otrosRow: CompromisoRow = {
    vendedor: `Otros (${rest.length})`,
    meta: sumMeta,
    primaActual: sumActual,
    pctAvance
  }
  return { rows: top10, otrosCount: rest.length, otrosRow }
}

export default function CompromisosPage() {
  const [year, setYear] = useState("2026")
  const [periodos, setPeriodos] = useState<number[]>([2])
  const [data, setData] = useState<CompromisoRow[]>([])
  const [loading, setLoading] = useState(true)
  // Bottom 5 removed per Angel's request

  const handleFilterChange = useCallback((newYear: string, newPeriodos: number[]) => { setYear(newYear); setPeriodos(newPeriodos) }, [])
  useEffect(() => { document.title = "Vendedores | CLK BI Dashboard" }, [])
  const month = periodos[0] ?? 2

  useEffect(() => {
    setLoading(true)
    getCompromisos(Number(year), month).then(r => { setData(r ?? []); setLoading(false) }).catch(() => setLoading(false))
  }, [year, month])

  const totalMeta = data.reduce((s, r) => s + r.meta, 0)
  const totalActual = data.reduce((s, r) => s + r.primaActual, 0)
  const totalPct = totalMeta > 0 ? Math.round((totalActual / totalMeta) * 1000) / 10 : 0

  // Apply Top 10 + Otros
  const { rows: displayRows, otrosCount, otrosRow } = computeTop10WithOtros(data)
  const allDisplayRows = otrosRow ? [...displayRows, otrosRow] : displayRows

  const barData = allDisplayRows.map(r => ({ name: shortName(r.vendedor), value: r.primaActual, pct: r.pctAvance }))
  // Top 5 from compromisos data (sorted by prima actual, desc)
  const top5Compromisos = [...data].sort((a, b) => b.primaActual - a.primaActual).slice(0, 5)
  const topBarData = top5Compromisos.map(r => ({ name: shortName(r.vendedor), value: r.primaActual }))


  return (
    <div className="bg-[#FAFAFA] px-3 py-4">
      <div className="max-w-[1200px] mx-auto w-full flex flex-col">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center border-b pb-2 pt-3 md:pt-5 w-full gap-2 md:gap-0">
          <PageTabs />
          <PeriodFilter onFilterChange={handleFilterChange} />
        </div>
        <h1 className="text-sm font-bold text-[#111] font-lato mt-3 mb-2">Vendedores — Compromisos</h1>

        {/* ROW-BASED LAYOUT */}
        <div className="flex flex-col gap-2">

          {/* Row 1: Compromisos table + chart */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="bg-white rounded-xl shadow-md border border-gray-100 p-3">
              {/* Mobile: card layout */}
              <div className="md:hidden space-y-1.5">
                {loading ? (
                  <p className="text-center text-gray-400 py-4 text-xs">Cargando...</p>
                ) : allDisplayRows.map((r, idx) => {
                  const isOtros = r.vendedor.startsWith("Otros (")
                  const status = semaforoStatus(r.primaActual, r.meta * 0.8, r.meta)
                  const diferencia = r.primaActual - r.meta
                  return (
                    <div key={r.vendedor} className={`vendedor-row border border-gray-100 rounded-lg px-3 py-1.5 ${isOtros ? "bg-gray-100" : ""}`}>
                      <div className="flex justify-between items-center mb-0.5">
                        <span className="text-xs font-medium text-[#374151]">{r.vendedor}</span>
                        <span className="flex items-center gap-1.5">
                          <span className="text-xs tabular-nums" style={{ color: semaforoColorFromStatus(status) }}>{r.pctAvance.toFixed(1)}%</span>
                          <Semaforo status={status} />
                        </span>
                      </div>
                      <div className="flex justify-between text-xs text-gray-500">
                        <span>PN: <span className="text-gray-900 font-medium tabular-nums">{fmt(r.primaActual)}</span></span>
                        <span>Meta: <span className="text-gray-600 font-normal tabular-nums">{fmt(r.meta)}</span></span>
                      </div>
                      <div className="flex justify-between text-xs text-gray-500 mt-0.5">
                        <span>Dif: <span className="tabular-nums" style={{ color: semaforoColorFromStatus(status) }}>{diferencia < 0 ? `(${fmt(Math.abs(diferencia))})` : fmt(diferencia)}</span></span>
                      </div>
                    </div>
                  )
                })}
                {!loading && data.length > 0 && (() => {
                  const totalStatus = semaforoStatus(totalActual, totalMeta * 0.8, totalMeta)
                  return (
                    <div className="bg-[#6B7280] rounded-lg px-3 py-1.5 flex justify-between items-center">
                      <span className="font-bold text-xs text-white tabular-nums">Total: {totalPct.toFixed(1)}%</span>
                      <span className="font-bold text-xs text-white tabular-nums">{fmt(totalActual)}</span>
                    </div>
                  )
                })()}
              </div>
              {/* Desktop: full table */}
              <table className="hidden md:table w-full border-collapse text-xs">
                <thead>
                  <tr className="bg-[#041224] text-white border-b-2 border-b-[#E62800]">
                    <th className="px-2 py-1.5 text-left text-xs font-semibold uppercase tracking-wider">Vendedor</th>
                    <th className="px-2 py-1.5 text-center text-xs font-semibold uppercase tracking-wider">Meta</th>
                    <th className="px-2 py-1.5 text-center text-xs font-semibold uppercase tracking-wider">Prima Neta</th>
                    <th className="px-2 py-1.5 text-center text-xs font-semibold uppercase tracking-wider">Diferencia</th>
                    <th className="px-2 py-1.5 text-center text-xs font-semibold uppercase tracking-wider">% Avance</th>
                    <th className="px-2 py-1.5 text-center text-xs font-semibold uppercase tracking-wider">Sem.</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan={6} className="px-2 py-2 text-center text-gray-400 text-xs">Cargando...</td></tr>
                  ) : allDisplayRows.map((r, idx) => {
                    const isOtros = r.vendedor.startsWith("Otros (")
                    const status = semaforoStatus(r.primaActual, r.meta * 0.8, r.meta)
                    // Semáforo 3-color: red if below 80%, amber if 80-99%, green if >= 100%
                    const semaforoColor = status === 'green' ? 'text-[#059669]' : status === 'yellow' ? 'text-amber-500' : 'text-[#E62800]'
                    const diferencia = r.primaActual - r.meta
                    return (
                      <tr key={r.vendedor} className={`vendedor-row border-b border-[#E5E7EB] ${isOtros ? 'bg-gray-100' : idx % 2 === 0 ? 'bg-white' : 'bg-[#FAFBFC]'}`}>
                        <td className="px-2 py-1.5 text-left text-xs font-semibold text-[#111]">{r.vendedor}</td>
                        <td className="px-2 py-1.5 text-center text-xs text-gray-600 font-medium tabular-nums">{fmt(r.meta)}</td>
                        <td className="px-2 py-1.5 text-center text-xs font-medium tabular-nums">{fmt(r.primaActual)}</td>
                        <td className={`px-2 py-1.5 text-center text-xs font-medium tabular-nums ${semaforoColor}`}>
                          {diferencia < 0 ? `(${fmt(Math.abs(diferencia))})` : fmt(diferencia)}
                        </td>
                        <td className={`px-2 py-1.5 text-center text-xs font-medium tabular-nums ${semaforoColor}`}>{r.pctAvance.toFixed(1)}%</td>
                        <td className="px-2 py-1.5 text-center"><Semaforo status={status} /></td>
                      </tr>
                    )
                  })}
                  {!loading && data.length > 0 && (() => {
                    const totalStatus = semaforoStatus(totalActual, totalMeta * 0.8, totalMeta)
                    const totalDif = totalActual - totalMeta
                    return (
                      <tr className="total-row bg-[#041224] text-white border-b-2 border-b-[#E62800]">
                        <td className="px-2 py-1.5 text-xs font-bold text-left">Total</td>
                        <td className="px-2 py-1.5 text-center text-xs font-bold tabular-nums">{fmt(totalMeta)}</td>
                        <td className="px-2 py-1.5 text-center text-xs font-bold tabular-nums">{fmt(totalActual)}</td>
                        <td className="px-2 py-1.5 text-center text-xs font-bold tabular-nums">
                          {totalDif < 0 ? `(${fmt(Math.abs(totalDif))})` : fmt(totalDif)}
                        </td>
                        <td className="px-2 py-1.5 text-center text-xs font-bold tabular-nums">{totalPct.toFixed(1)}%</td>
                        <td className="px-2 py-1.5 text-center"><Semaforo status={totalStatus} /></td>
                      </tr>
                    )
                  })()}
                </tbody>
              </table>
            </div>
            <div className="bg-white rounded-xl shadow-md border border-gray-100 p-3 flex flex-col" style={{ boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
              <p className="text-xs font-semibold uppercase tracking-wider text-[#041224] mb-2">Distribución por Vendedor</p>
              <div className="flex-1">
                <PremiumBarChart data={barData} barHeight={18} showGrid={false} colorFn={(idx) => {
                  return { from: '#041224', to: '#1E3A5F' }
                }} />
              </div>
            </div>
          </div>

          {/* Top 10 Vendedores — bar chart */}
          <div className="bg-white rounded-xl shadow-md border border-gray-100 p-3" style={{ boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
            <p className="text-xs font-semibold uppercase tracking-wider text-[#041224] mb-2">Top 10 Vendedores — Prima Neta</p>
            <div style={{ maxWidth: 700 }}>
              <PremiumBarChart data={[...data].sort((a,b) => b.primaActual - a.primaActual).slice(0, 10).map(r => ({ name: shortName(r.vendedor), value: r.primaActual, pct: r.pctAvance }))} barHeight={22} showGrid colorFn={(idx, pct) => {
                if (pct !== undefined && pct >= 100) return { from: '#059669', to: '#10B981' }
                if (pct !== undefined && pct >= 80) return { from: '#D97706', to: '#F59E0B' }
                return { from: '#E62800', to: '#EF4444' }
              }} />
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}
