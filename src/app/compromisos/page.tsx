"use client"

import { useState, useEffect, useCallback } from "react"
import { PageTabs } from "@/components/page-tabs"
import { PeriodFilter } from "@/components/period-filter"
import { getCompromisos, getRankedVendedores } from "@/lib/queries"
import type { CompromisoRow } from "@/lib/queries"

function fmt(v: number) {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(v)
}
function fmtShort(v: number) {
  if (v >= 1e6) return `$${(v / 1e6).toFixed(1)}M`
  if (v >= 1e3) return `$${(v / 1e3).toFixed(0)}K`
  return `$${v}`
}
function surname(name: string) {
  const parts = name.trim().split(/\s+/)
  return parts.length >= 3 ? parts[parts.length - 2] : parts[parts.length - 1] || name
}
function semaforoColor(pct: number) {
  if (pct >= 90) return "#2E7D32"
  if (pct >= 70) return "#F5C518"
  return "#E62800"
}
function Semaforo({ pct }: { pct: number }) {
  const g = pct >= 90, y = pct >= 70 && pct < 90, r = pct < 70
  return (
    <span className="inline-flex items-center gap-0.5">
      <span className={`w-2.5 h-2.5 rounded-full inline-block border ${r ? "bg-[#E62800] border-[#B91C00]" : "bg-[#E62800]/15 border-[#E5E7E9]"}`} />
      <span className={`w-2.5 h-2.5 rounded-full inline-block border ${y ? "bg-[#F5C518] border-[#D4A800]" : "bg-[#F5C518]/15 border-[#E5E7E9]"}`} />
      <span className={`w-2.5 h-2.5 rounded-full inline-block border ${g ? "bg-[#2E7D32] border-[#1B5E20]" : "bg-[#2E7D32]/15 border-[#E5E7E9]"}`} />
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
  const [topVendedores, setTopVendedores] = useState<{ vendedor: string; primaNeta: number }[]>([])
  const [bottomVendedores, setBottomVendedores] = useState<{ vendedor: string; primaNeta: number }[]>([])

  const handleFilterChange = useCallback((newYear: string, newPeriodos: number[]) => { setYear(newYear); setPeriodos(newPeriodos) }, [])
  useEffect(() => { document.title = "Vendedores | CLK BI Dashboard" }, [])
  const month = periodos[0] ?? 2

  useEffect(() => {
    setLoading(true)
    getCompromisos(Number(year), month).then(r => { setData(r ?? []); setLoading(false) }).catch(() => setLoading(false))
    getRankedVendedores(month, year).then(v => {
      if (v && v.length > 0) { setTopVendedores(v.slice(0, 5)); setBottomVendedores(v.slice(-5).reverse()) }
    })
  }, [year, month])

  const totalMeta = data.reduce((s, r) => s + r.meta, 0)
  const totalActual = data.reduce((s, r) => s + r.primaActual, 0)
  const totalPct = totalMeta > 0 ? Math.round((totalActual / totalMeta) * 1000) / 10 : 0

  const barData = data.map(r => ({ name: surname(r.vendedor), value: r.primaActual, pct: r.pctAvance }))
  const topBarData = topVendedores.map(v => ({ name: surname(v.vendedor), value: v.primaNeta }))
  const bottomBarData = bottomVendedores.map(v => ({ name: surname(v.vendedor), value: v.primaNeta }))

  return (
    <div className="min-h-screen bg-[#FAFAFA] px-3 py-4 flex flex-col">
      <div className="max-w-[1200px] mx-auto w-full flex flex-col">
        <div className="flex justify-between items-center border-b pb-2 pt-5 w-full">
          <PageTabs />
          <PeriodFilter onFilterChange={handleFilterChange} />
        </div>
        <h1 className="text-sm font-bold text-[#111] font-lato mt-3 mb-2">Vendedores — Compromisos</h1>

        {/* ROW-BASED LAYOUT: Each row = [table | chart] with matched heights */}
        <div className="flex flex-col gap-2">

          {/* Row 1: Compromisos table + chart */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-white rounded-xl shadow-md border border-gray-100 p-3">
              <table className="w-full border-collapse" style={{ fontSize: 14, lineHeight: 1.4 }}>
                <thead>
                  <tr className="bg-[#041224] text-white border-b-2 border-b-[#E62800]">
                    <th className="px-2 py-1 text-left text-sm">Vendedor</th>
                    <th className="px-2 py-1 text-right text-sm">Meta</th>
                    <th className="px-2 py-1 text-right text-sm">Prima Neta</th>
                    <th className="px-2 py-1 text-right text-sm">%</th>
                    <th className="px-2 py-1 text-center text-sm">Sem.</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan={5} className="px-2 py-2 text-center text-gray-400">Cargando...</td></tr>
                  ) : data.slice(0, 10).map((r, idx) => (
                    <tr key={r.vendedor} className={`border-b border-[#F0F0F0] ${idx % 2 === 0 ? 'bg-white' : 'bg-[#F9FAFB]'}`}>
                      <td className="px-2 py-[2px] font-medium text-[#111]">{r.vendedor}</td>
                      <td className="px-2 py-[2px] text-right text-gray-500">{fmt(r.meta)}</td>
                      <td className="px-2 py-[2px] text-right font-medium">{fmt(r.primaActual)}</td>
                      <td className="px-2 py-[2px] text-right font-medium" style={{ color: r.pctAvance >= 80 ? '#60A63A' : r.pctAvance >= 60 ? '#F9DC5C' : '#E62800' }}>{r.pctAvance}%</td>
                      <td className="px-2 py-[2px] text-center"><Semaforo pct={r.pctAvance} /></td>
                    </tr>
                  ))}
                  {!loading && data.length > 0 && (
                    <tr className="bg-[#041224] text-white">
                      <td className="px-2 py-[2px] font-bold">Total</td>
                      <td className="px-2 py-[2px] text-right font-bold">{fmt(totalMeta)}</td>
                      <td className="px-2 py-[2px] text-right font-bold">{fmt(totalActual)}</td>
                      <td className="px-2 py-[2px] text-right font-bold">{totalPct}%</td>
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
                  const shades = [
                    { from: '#1a5dc7', to: '#3983F6' },
                    { from: '#2568d4', to: '#4a90f7' },
                    { from: '#3074e0', to: '#5b9df8' },
                    { from: '#3b80ec', to: '#6caaf9' },
                    { from: '#468cf8', to: '#7db7fa' },
                    { from: '#5198f9', to: '#8ec4fb' },
                    { from: '#5ca4fa', to: '#9fd1fc' },
                    { from: '#67b0fb', to: '#b0defd' },
                    { from: '#72bcfc', to: '#c1ebfe' },
                    { from: '#7dc8fd', to: '#d2f8ff' },
                  ]
                  return shades[idx % shades.length]
                }} />
              </div>
            </div>
          </div>

          {/* Row 2: Top 5 table + chart */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-white rounded-xl shadow-md border border-gray-100 p-3">
              <p className="text-sm font-bold text-[#041224] mb-1">Top 5 Vendedores</p>
              <table className="w-full border-collapse" style={{ fontSize: 14, lineHeight: 1.4 }}>
                <thead>
                  <tr className="bg-[#041224] text-white border-b-2 border-b-[#2E7D32]">
                    <th className="px-2 py-1 text-left w-6 text-sm">#</th>
                    <th className="px-2 py-1 text-left text-sm">Vendedor</th>
                    <th className="px-2 py-1 text-right text-sm">Prima Neta</th>
                  </tr>
                </thead>
                <tbody>
                  {topVendedores.map((v, i) => (
                    <tr key={v.vendedor} className={`border-b border-[#E5E7E9] ${i % 2 === 1 ? "bg-[#FAFAFA]" : ""}`}>
                      <td className="px-2 py-[2px] font-bold text-[#2E7D32]">{i + 1}</td>
                      <td className="px-2 py-[2px]">{v.vendedor}</td>
                      <td className="px-2 py-[2px] text-right font-medium">{fmt(v.primaNeta)}</td>
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
                    { from: '#1a5dc7', to: '#3983F6' },
                    { from: '#2568d4', to: '#4a90f7' },
                    { from: '#3074e0', to: '#5b9df8' },
                    { from: '#3b80ec', to: '#6caaf9' },
                    { from: '#468cf8', to: '#7db7fa' },
                  ]
                  return shades[idx] || shades[4]
                }} />
              </div>
            </div>
          </div>

          {/* Row 3: Bottom 5 table + chart */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-white rounded-xl shadow-md border border-gray-100 p-3">
              <p className="text-sm font-bold text-[#041224] mb-1">Bottom 5 Vendedores</p>
              <table className="w-full border-collapse" style={{ fontSize: 14, lineHeight: 1.4 }}>
                <thead>
                  <tr className="bg-[#041224] text-white border-b-2 border-b-[#E62800]">
                    <th className="px-2 py-1 text-left w-6 text-sm">#</th>
                    <th className="px-2 py-1 text-left text-sm">Vendedor</th>
                    <th className="px-2 py-1 text-right text-sm">Prima Neta</th>
                  </tr>
                </thead>
                <tbody>
                  {bottomVendedores.map((v, i) => (
                    <tr key={v.vendedor} className={`border-b border-[#E5E7E9] ${i % 2 === 1 ? "bg-[#FAFAFA]" : ""}`}>
                      <td className="px-2 py-[2px] font-bold text-[#E62800]">{i + 1}</td>
                      <td className="px-2 py-[2px]">{v.vendedor}</td>
                      <td className="px-2 py-[2px] text-right font-medium">{fmt(v.primaNeta)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="bg-white rounded-xl shadow-md border border-gray-100 p-3 flex flex-col" style={{ boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
              <p className="text-sm font-bold text-[#C62828] mb-2 tracking-tight">Bottom 5</p>
              <div className="flex-1">
                <PremiumBarChart data={bottomBarData} barHeight={22} showGrid={false} colorFn={(idx) => {
                  const shades = [
                    { from: '#8F2D56', to: '#E62800' },
                    { from: '#A03862', to: '#E84020' },
                    { from: '#B1436E', to: '#EA5840' },
                    { from: '#C24E7A', to: '#EC7060' },
                    { from: '#D35986', to: '#EE8880' },
                  ]
                  return shades[idx] || shades[4]
                }} />
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}
