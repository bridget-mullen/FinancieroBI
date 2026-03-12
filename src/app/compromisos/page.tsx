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
function shortName(name: string) {
  const parts = name.trim().split(/\s+/)
  if (parts.length <= 2) return name
  // First name + first letter of middle name + last name (e.g., "Juan A. Behar")
  const firstName = parts[0]
  const lastName = parts[parts.length - 1]
  return `${firstName} ${lastName}`
}
function semaforoColor(pct: number) {
  if (pct >= 90) return "#2E7D32"
  if (pct >= 70) return "#F5C518"
  return "#E62800"
}
function Semaforo(_props: { pct: number }) {
  return (
    <span className="inline-flex items-center gap-0.5 semaforo-lights">
      <span className="w-2.5 h-2.5 rounded-full inline-block border border-[#E5E7EB] transition-colors duration-200 light-red" style={{ backgroundColor: '#D1D5DB' }} />
      <span className="w-2.5 h-2.5 rounded-full inline-block border border-[#E5E7EB] transition-colors duration-200 light-yellow" style={{ backgroundColor: '#D1D5DB' }} />
      <span className="w-2.5 h-2.5 rounded-full inline-block border border-[#E5E7EB] transition-colors duration-200 light-green" style={{ backgroundColor: '#D1D5DB' }} />
    </span>
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
      <div className="flex flex-col justify-center gap-[5px] w-full">
        {data.map((d, i) => {
          const pct = Math.max((d.value / max) * 100, 4)
          const colors = colorFn(i, d.pct)
          return (
            <div key={i} className="flex items-center gap-2" style={{ height: barHeight }}>
              <span style={{
                fontSize: 11, color: '#374151', width: 65, textAlign: 'right', flexShrink: 0,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                fontWeight: 500, letterSpacing: '-0.01em'
              }}>{d.name}</span>
              <div className="flex-1 h-full flex items-center">
                <div style={{
                  width: `${pct}%`, height: barHeight - 4,
                  background: `linear-gradient(90deg, ${colors.from}, ${colors.to})`,
                  borderRadius: 6, minWidth: 6,
                  boxShadow: `0 1px 3px ${colors.from}33`,
                  transition: 'width 0.5s ease'
                }} />
                <span style={{
                  fontSize: 10, color: '#374151', fontWeight: 700,
                  marginLeft: 6, whiteSpace: 'nowrap', letterSpacing: '-0.02em'
                }}>{fmtShort(d.value)}</span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
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

  const barData = data.map(r => ({ name: shortName(r.vendedor), value: r.primaActual, pct: r.pctAvance }))
  // Top 5 from compromisos data (sorted by prima actual, desc)
  const top5Compromisos = [...data].sort((a, b) => b.primaActual - a.primaActual).slice(0, 5)
  const topBarData = top5Compromisos.map(r => ({ name: shortName(r.vendedor), value: r.primaActual }))

  return (
    <div className="bg-[#FAFAFA] px-3 py-4">
      {/* CSS for hover semaforo */}
      <style>{`
        .vendedor-row .semaforo-lights span { background-color: #D1D5DB !important; border-color: #E5E7EB !important; }
        .vendedor-row:hover .semaforo-lights .light-red { background-color: #E62800 !important; border-color: #B91C00 !important; }
        .vendedor-row:hover .semaforo-lights .light-yellow { background-color: #F9DC5C !important; border-color: #D4A800 !important; }
        .vendedor-row:hover .semaforo-lights .light-green { background-color: #60A63A !important; border-color: #4A8A2A !important; }
        .total-row .semaforo-lights .light-red { background-color: #E62800 !important; border-color: #B91C00 !important; }
        .total-row .semaforo-lights .light-yellow { background-color: #F9DC5C !important; border-color: #D4A800 !important; }
        .total-row .semaforo-lights .light-green { background-color: #60A63A !important; border-color: #4A8A2A !important; }
      `}</style>
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
                  <p className="text-center text-gray-400 py-4">Cargando...</p>
                ) : data.slice(0, 10).map((r) => (
                  <div key={r.vendedor} className="vendedor-row border border-gray-100 rounded-lg px-3 py-2">
                    <div className="flex justify-between items-center mb-1">
                      <span className="font-bold text-sm text-[#374151]">{r.vendedor}</span>
                      <span className="flex items-center gap-1.5">
                        <span className="text-xs font-bold" style={{ color: semaforoColor(r.pctAvance) }}>{r.pctAvance}%</span>
                        <Semaforo pct={r.pctAvance} />
                      </span>
                    </div>
                    <div className="flex justify-between text-xs text-gray-500">
                      <span>PN: <strong className="text-gray-900">{fmt(r.primaActual)}</strong></span>
                      <span>Meta: {fmt(r.meta)}</span>
                    </div>
                  </div>
                ))}
                {!loading && data.length > 0 && (
                  <div className="bg-[#6B7280] rounded-lg px-3 py-2 flex justify-between items-center">
                    <span className="font-bold text-sm text-white">Total: {totalPct}%</span>
                    <span className="font-bold text-sm text-white">{fmt(totalActual)}</span>
                  </div>
                )}
              </div>
              {/* Desktop: full table */}
              <table className="hidden md:table w-full border-collapse" style={{ fontSize: 14, lineHeight: 1.4 }}>
                <thead>
                  <tr className="bg-[#6B7280] text-white">
                    <th className="px-2 py-1 text-left text-sm">Vendedor</th>
                    <th className="px-2 py-1 text-center text-sm">Meta</th>
                    <th className="px-2 py-1 text-center text-sm">Prima Neta</th>
                    <th className="px-2 py-1 text-center text-sm">%</th>
                    <th className="px-2 py-1 text-center text-sm">Sem.</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan={5} className="px-2 py-2 text-center text-gray-400">Cargando...</td></tr>
                  ) : data.slice(0, 10).map((r, idx) => (
                    <tr key={r.vendedor} className={`vendedor-row border-b border-[#E5E7EB] ${idx % 2 === 0 ? 'bg-white' : 'bg-[#F8FAFC]'}`}>
                      <td className="px-2 py-[2px] font-medium text-left text-[#374151]">{r.vendedor}</td>
                      <td className="px-2 py-[2px] text-center text-[#374151]">{fmt(r.meta)}</td>
                      <td className="px-2 py-[2px] text-center font-medium text-[#374151]">{fmt(r.primaActual)}</td>
                      <td className="px-2 py-[2px] text-center font-medium text-[#374151]">{r.pctAvance}%</td>
                      <td className="px-2 py-[2px] text-center"><Semaforo pct={r.pctAvance} /></td>
                    </tr>
                  ))}
                  {!loading && data.length > 0 && (
                    <tr className="total-row bg-[#6B7280] text-white">
                      <td className="px-2 py-[2px] font-bold text-left">Total</td>
                      <td className="px-2 py-[2px] text-center font-bold">{fmt(totalMeta)}</td>
                      <td className="px-2 py-[2px] text-center font-bold">{fmt(totalActual)}</td>
                      <td className="px-2 py-[2px] text-center font-bold">{totalPct}%</td>
                      <td className="px-2 py-[2px] text-center"><Semaforo pct={totalPct} /></td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="bg-white rounded-xl shadow-md border border-gray-100 p-3 flex flex-col" style={{ boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
              <p className="text-sm font-bold text-[#041224] mb-2 tracking-tight">Prima Neta por Vendedor</p>
              <div className="flex-1">
                <PremiumBarChart data={barData} barHeight={20} colorFn={(idx) => {
                  const total = barData.length || 1
                  const intensity = 1 - (idx / total) * 0.5
                  const r = Math.round(57 * intensity), g = Math.round(131 * intensity), b = Math.round(246 * intensity)
                  return { from: `rgb(${r},${g},${b})`, to: `rgb(${Math.min(r+30,255)},${Math.min(g+30,255)},${Math.min(b+30,255)})` }
                }} />
              </div>
            </div>
          </div>

          {/* Row 2: Top 5 table + chart */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="bg-white rounded-xl shadow-md border border-gray-100 p-3">
              <p className="text-sm font-bold text-[#041224] mb-1">Top 5 Vendedores (Prima Neta)</p>
              {/* Mobile: compact list */}
              <div className="md:hidden space-y-1">
                {top5Compromisos.map((r, i) => (
                  <div key={r.vendedor} className="flex justify-between items-center border-b border-gray-100 py-1.5">
                    <span className="text-sm"><strong className="text-gray-500 mr-1.5">#{i+1}</strong>{r.vendedor}</span>
                    <span className="text-sm font-bold text-[#374151]">{fmt(r.primaActual)}</span>
                  </div>
                ))}
              </div>
              {/* Desktop: table */}
              <table className="hidden md:table w-full border-collapse" style={{ fontSize: 14, lineHeight: 1.4 }}>
                <thead>
                  <tr className="bg-[#6B7280] text-white">
                    <th className="px-2 py-1 text-center w-6 text-sm">#</th>
                    <th className="px-2 py-1 text-left text-sm">Vendedor</th>
                    <th className="px-2 py-1 text-center text-sm">Prima Neta</th>
                  </tr>
                </thead>
                <tbody>
                  {top5Compromisos.map((r, i) => (
                    <tr key={r.vendedor} className={`border-b border-[#E5E7EB] ${i % 2 === 0 ? 'bg-white' : 'bg-[#F8FAFC]'}`}>
                      <td className="px-2 py-[2px] font-bold text-center text-[#374151]">{i + 1}</td>
                      <td className="px-2 py-[2px] text-left text-[#374151]">{r.vendedor}</td>
                      <td className="px-2 py-[2px] text-center font-medium text-[#374151]">{fmt(r.primaActual)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="bg-white rounded-xl shadow-md border border-gray-100 p-3 flex flex-col" style={{ boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
              <p className="text-sm font-bold text-[#1E3A5F] mb-2 tracking-tight">Top 5</p>
              <div className="flex-1">
                <PremiumBarChart data={topBarData} barHeight={22} showGrid={false} colorFn={(idx) => {
                  const shades = [
                    { from: '#1D4ED8', to: '#2563EB' },
                    { from: '#2563EB', to: '#3B82F6' },
                    { from: '#3B82F6', to: '#60A5FA' },
                    { from: '#60A5FA', to: '#93C5FD' },
                    { from: '#93C5FD', to: '#BFDBFE' },
                  ]
                  return shades[idx] || shades[4]
                }} />
              </div>
            </div>
          </div>

          {/* Bottom 5 removed */}

        </div>
      </div>
    </div>
  )
}
