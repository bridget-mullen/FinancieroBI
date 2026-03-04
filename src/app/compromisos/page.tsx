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

/* Horizontal bar chart as pure divs */
function HBarChart({ data, color, colorFn, maxH }: { data: { name: string; value: number; pct?: number }[]; color?: string; colorFn?: (pct: number) => string; maxH?: number }) {
  if (!data.length) return null
  const max = Math.max(...data.map(d => d.value), 1)
  return (
    <div className="flex flex-col justify-center gap-[3px] w-full" style={{ maxHeight: maxH }}>
      {data.map((d, i) => {
        const pct = Math.max((d.value / max) * 100, 3)
        const fill = colorFn && d.pct != null ? colorFn(d.pct) : color || "#333"
        return (
          <div key={i} className="flex items-center gap-1" style={{ height: 14 }}>
            <span style={{ fontSize: 9, color: '#666', width: 55, textAlign: 'right', flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.name}</span>
            <div className="flex-1 h-full flex items-center">
              <div style={{ width: `${pct}%`, height: 10, background: fill, borderRadius: '0 3px 3px 0', minWidth: 3 }} />
              <span style={{ fontSize: 8, color: '#555', fontWeight: 600, marginLeft: 3, whiteSpace: 'nowrap' }}>{fmtShort(d.value)}</span>
            </div>
          </div>
        )
      })}
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

        {/* 2-COLUMN LAYOUT: Left=Tables, Right=Charts */}
        <div className="grid grid-cols-2 gap-3">

          {/* LEFT COLUMN — All 3 tables */}
          <div className="flex flex-col gap-2">
            {/* Compromisos table */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-2">
              <table className="w-full border-collapse" style={{ fontSize: 11, lineHeight: 1.4 }}>
                <thead>
                  <tr className="bg-[#041224] text-white border-b-2 border-b-[#E62800]">
                    <th className="px-2 py-1 text-left text-[11px]">Vendedor</th>
                    <th className="px-2 py-1 text-right text-[11px]">Meta</th>
                    <th className="px-2 py-1 text-right text-[11px]">Prima Neta</th>
                    <th className="px-2 py-1 text-right text-[11px]">%</th>
                    <th className="px-2 py-1 text-center text-[11px]">Sem.</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan={5} className="px-2 py-2 text-center text-gray-400">Cargando...</td></tr>
                  ) : data.slice(0, 10).map((r, idx) => (
                    <tr key={r.vendedor} className={`border-b border-[#F0F0F0] ${idx % 2 === 1 ? "bg-[#FAFAFA]" : ""}`}>
                      <td className="px-2 py-[2px] font-medium text-[#111]">{r.vendedor}</td>
                      <td className="px-2 py-[2px] text-right text-gray-500">{fmt(r.meta)}</td>
                      <td className="px-2 py-[2px] text-right font-medium">{fmt(r.primaActual)}</td>
                      <td className="px-2 py-[2px] text-right font-medium" style={{ color: semaforoColor(r.pctAvance) }}>{r.pctAvance}%</td>
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

            {/* Top 5 table */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-2">
              <p className="text-[11px] font-bold text-[#041224] mb-1">🏆 Top 5 Vendedores</p>
              <table className="w-full border-collapse" style={{ fontSize: 10, lineHeight: 1.4 }}>
                <thead>
                  <tr className="bg-[#041224] text-white border-b-2 border-b-[#2E7D32]">
                    <th className="px-2 py-1 text-left w-6 text-[10px]">#</th>
                    <th className="px-2 py-1 text-left text-[10px]">Vendedor</th>
                    <th className="px-2 py-1 text-right text-[10px]">Prima Neta</th>
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

            {/* Bottom 5 table */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-2">
              <p className="text-[11px] font-bold text-[#041224] mb-1">⬇️ Bottom 5 Vendedores</p>
              <table className="w-full border-collapse" style={{ fontSize: 10, lineHeight: 1.4 }}>
                <thead>
                  <tr className="bg-[#041224] text-white border-b-2 border-b-[#E62800]">
                    <th className="px-2 py-1 text-left w-6 text-[10px]">#</th>
                    <th className="px-2 py-1 text-left text-[10px]">Vendedor</th>
                    <th className="px-2 py-1 text-right text-[10px]">Prima Neta</th>
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
          </div>

          {/* RIGHT COLUMN — All 3 charts (aligned with tables) */}
          <div className="flex flex-col gap-2">
            {/* Compromisos chart */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-2">
              <p className="text-[11px] font-bold text-[#041224] mb-1">Prima Neta por Vendedor</p>
              <HBarChart data={barData} colorFn={semaforoColor} />
            </div>

            {/* Top 5 chart */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-2">
              <p className="text-[11px] font-bold text-[#2E7D32] mb-1">🏆 Top 5</p>
              <HBarChart data={topBarData} color="#2E7D32" />
            </div>

            {/* Bottom 5 chart */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-2">
              <p className="text-[11px] font-bold text-[#E62800] mb-1">⬇️ Bottom 5</p>
              <HBarChart data={bottomBarData} color="#E62800" />
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}
