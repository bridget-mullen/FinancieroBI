"use client"

import { useState, useEffect, useCallback } from "react"
import { PageTabs } from "@/components/page-tabs"
import { PeriodFilter } from "@/components/period-filter"
import { getCompromisos, getRankedVendedores } from "@/lib/queries"
import type { CompromisoRow } from "@/lib/queries"
import { BarChart, Bar, XAxis, Tooltip, LabelList, Cell } from "recharts"

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
  return parts.length >= 2 ? parts.slice(-2).join(" ") : name
}

function semaforoColor(pct: number) {
  if (pct >= 90) return "#2E7D32"
  if (pct >= 70) return "#F5C518"
  return "#E62800"
}

function Semaforo({ pct }: { pct: number }) {
  const isGreen = pct >= 90
  const isYellow = pct >= 70 && pct < 90
  const isRed = pct < 70
  return (
    <span className="inline-flex items-center gap-0.5">
      <span className={`w-2.5 h-2.5 rounded-full inline-block border ${isRed ? "bg-[#E62800] border-[#B91C00] shadow-[0_0_3px_#E62800]" : "bg-[#E62800]/15 border-[#E5E7E9]"}`} />
      <span className={`w-2.5 h-2.5 rounded-full inline-block border ${isYellow ? "bg-[#F5C518] border-[#D4A800] shadow-[0_0_3px_#F5C518]" : "bg-[#F5C518]/15 border-[#E5E7E9]"}`} />
      <span className={`w-2.5 h-2.5 rounded-full inline-block border ${isGreen ? "bg-[#2E7D32] border-[#1B5E20] shadow-[0_0_3px_#2E7D32]" : "bg-[#2E7D32]/15 border-[#E5E7E9]"}`} />
    </span>
  )
}

export default function CompromisosPage() {
  const [year, setYear] = useState("2026")
  const [periodos, setPeriodos] = useState<number[]>([2])
  const [data, setData] = useState<CompromisoRow[]>([])
  const [loading, setLoading] = useState(true)
  const [ready, setReady] = useState(false)

  const [topVendedores, setTopVendedores] = useState<{ vendedor: string; primaNeta: number }[]>([])
  const [bottomVendedores, setBottomVendedores] = useState<{ vendedor: string; primaNeta: number }[]>([])

  const handleFilterChange = useCallback((newYear: string, newPeriodos: number[]) => {
    setYear(newYear)
    setPeriodos(newPeriodos)
  }, [])

  useEffect(() => {
    document.title = "Vendedores | CLK BI Dashboard"
    const timer = setTimeout(() => setReady(true), 500)
    return () => clearTimeout(timer)
  }, [])

  const month = periodos[0] ?? 2

  useEffect(() => {
    setLoading(true)
    getCompromisos(Number(year), month).then(r => {
      setData(r ?? [])
      setLoading(false)
    }).catch(() => setLoading(false))

    getRankedVendedores(month, year).then(v => {
      if (v && v.length > 0) {
        setTopVendedores(v.slice(0, 5))
        setBottomVendedores(v.slice(-5).reverse())
      }
    })
  }, [year, month])

  const totalMeta = data.reduce((s, r) => s + r.meta, 0)
  const totalActual = data.reduce((s, r) => s + r.primaActual, 0)
  const totalPct = totalMeta > 0 ? Math.round((totalActual / totalMeta) * 1000) / 10 : 0

  const barData = [...data].sort((a, b) => b.primaActual - a.primaActual).map(r => ({
    name: surname(r.vendedor),
    fullName: r.vendedor,
    value: r.primaActual,
    pct: r.pctAvance,
    color: semaforoColor(r.pctAvance),
  }))

  return (
    <div className="h-screen bg-[#FAFAFA] px-3 py-2 flex flex-col overflow-hidden">
      <div className="max-w-[1200px] mx-auto w-full flex flex-col flex-1 min-h-0">
        {/* Header: tabs + filters */}
        <div className="flex justify-between items-center border-b pb-2 pt-3 w-full">
          <PageTabs />
          <PeriodFilter onFilterChange={handleFilterChange} />
        </div>

        {/* Content area — viewport minus header */}
        <div className="flex flex-col flex-1 min-h-0 max-h-[calc(100vh-80px)] mt-1 gap-1.5">

          {/* ROW 1: Compromisos table (~55%) */}
          <div className="border border-gray-200 rounded overflow-hidden" style={{ flex: '55 1 0%' }}>
            <table className="w-full text-[8px]">
              <thead>
                <tr className="bg-[#041224] text-white border-b-2 border-b-[#E62800]">
                  <th className="text-left px-1.5 py-[2px] text-[9px] font-semibold">Vendedor</th>
                  <th className="text-right px-1.5 py-[2px] text-[9px] font-semibold">Meta comprometida</th>
                  <th className="text-right px-1.5 py-[2px] text-[9px] font-semibold">Prima neta actual</th>
                  <th className="text-right px-1.5 py-[2px] text-[9px] font-semibold">% Avance</th>
                  <th className="text-center px-1.5 py-[2px] text-[9px] font-semibold">Semáforo</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={5} className="px-1.5 py-2 text-center text-gray-400 text-[8px]">Cargando...</td></tr>
                ) : data.length === 0 ? (
                  <tr><td colSpan={5} className="px-1.5 py-2 text-center text-[#888] text-[8px]">Sin compromisos registrados</td></tr>
                ) : data.map((r, idx) => (
                  <tr key={r.vendedor} className={`border-b border-[#F0F0F0] hover:bg-[#FFF5F5] ${idx % 2 === 1 ? "bg-[#FAFAFA]" : "bg-white"}`}>
                    <td className="px-1.5 py-[2px] font-medium text-[#111]">{r.vendedor}</td>
                    <td className="px-1.5 py-[2px] text-right text-gray-500">{fmt(r.meta)}</td>
                    <td className="px-1.5 py-[2px] text-right font-medium">{fmt(r.primaActual)}</td>
                    <td className={`px-1.5 py-[2px] text-right font-medium ${r.pctAvance >= 90 ? "text-[#2E7D32]" : r.pctAvance >= 70 ? "text-[#F5C518]" : "text-[#E62800]"}`}>{r.pctAvance}%</td>
                    <td className="px-1.5 py-[2px] text-center"><Semaforo pct={r.pctAvance} /></td>
                  </tr>
                ))}
                {!loading && data.length > 0 && (
                  <tr className="bg-[#041224] text-white">
                    <td className="px-1.5 py-[2px] font-bold">Total</td>
                    <td className="px-1.5 py-[2px] text-right font-bold">{fmt(totalMeta)}</td>
                    <td className="px-1.5 py-[2px] text-right font-bold">{fmt(totalActual)}</td>
                    <td className="px-1.5 py-[2px] text-right font-bold">{totalPct}%</td>
                    <td className="px-1.5 py-[2px] text-center"><Semaforo pct={totalPct} /></td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* ROW 2: 3-col grid (~45%) */}
          <div className="grid grid-cols-3 gap-2 min-h-0" style={{ flex: '45 1 0%' }}>
            {/* Col 1: Top 5 */}
            <div className="border border-gray-200 rounded p-1.5 bg-white flex flex-col min-h-0">
              <h3 className="text-[8px] font-bold text-[#041224] mb-0.5 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-[#2E7D32] inline-block" />
                Top 5 Vendedores
              </h3>
              <table className="w-full text-[8px]">
                <thead><tr className="bg-[#041224] text-white border-b-2 border-b-[#2E7D32]">
                  <th className="px-1 py-[1px] text-left font-semibold w-4">#</th>
                  <th className="px-1 py-[1px] text-left font-semibold">Vendedor</th>
                  <th className="px-1 py-[1px] text-right font-semibold">Prima Neta</th>
                </tr></thead>
                <tbody>
                  {topVendedores.map((v, i) => (
                    <tr key={v.vendedor} className="bg-[#F1F8F1] border-b border-[#E5E7E9]">
                      <td className="px-1 py-[1px] font-bold text-[#2E7D32]">{i + 1}</td>
                      <td className="px-1 py-[1px]">{v.vendedor}</td>
                      <td className="px-1 py-[1px] text-right font-medium">{fmt(v.primaNeta)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Col 2: Bottom 5 */}
            <div className="border border-gray-200 rounded p-1.5 bg-white flex flex-col min-h-0">
              <h3 className="text-[8px] font-bold text-[#041224] mb-0.5 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-[#E62800] inline-block" />
                Bottom 5 Vendedores
              </h3>
              <table className="w-full text-[8px]">
                <thead><tr className="bg-[#041224] text-white border-b-2 border-b-[#E62800]">
                  <th className="px-1 py-[1px] text-left font-semibold w-4">#</th>
                  <th className="px-1 py-[1px] text-left font-semibold">Vendedor</th>
                  <th className="px-1 py-[1px] text-right font-semibold">Prima Neta</th>
                </tr></thead>
                <tbody>
                  {bottomVendedores.map((v, i) => (
                    <tr key={v.vendedor} className="bg-[#FFF3F3] border-b border-[#E5E7E9]">
                      <td className="px-1 py-[1px] font-bold text-[#E62800]">{i + 1}</td>
                      <td className="px-1 py-[1px]">{v.vendedor}</td>
                      <td className="px-1 py-[1px] text-right font-medium">{fmt(v.primaNeta)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Col 3: Bar chart — all vendedores from compromisos data */}
            <div className="border border-gray-200 rounded p-1.5 bg-white flex flex-col min-h-0">
              <h3 className="text-[8px] font-bold text-[#041224] mb-0.5">Prima Neta por Vendedor</h3>
              <div className="flex-1 min-h-0 flex items-end">
                {ready && barData.length > 0 && (
                  <BarChart
                    width={360}
                    height={180}
                    data={barData}
                    margin={{ top: 12, right: 4, left: 4, bottom: 50 }}
                  >
                    <XAxis
                      dataKey="name"
                      tick={{ fontSize: 7 }}
                      interval={0}
                      angle={-45}
                      textAnchor="end"
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip
                      content={({ active, payload }) => {
                        if (!active || !payload || !payload[0]) return null
                        const d = payload[0].payload as { fullName: string; value: number; pct: number }
                        return (
                          <div className="bg-white border border-gray-200 rounded px-2 py-1 shadow text-[10px]">
                            <p className="font-semibold">{d.fullName}</p>
                            <p>Prima Neta: {fmt(d.value)}</p>
                            <p>Avance: <span style={{ color: semaforoColor(d.pct) }}>{d.pct}%</span></p>
                          </div>
                        )
                      }}
                    />
                    <Bar dataKey="value" radius={[2, 2, 0, 0]} barSize={16}>
                      {barData.map((entry, idx) => (
                        <Cell key={idx} fill={entry.color} />
                      ))}
                      <LabelList
                        dataKey="value"
                        position="top"
                        formatter={(v: unknown) => fmtShort(Number(v))}
                        style={{ fontSize: 7, fill: '#333', fontWeight: 600 }}
                      />
                    </Bar>
                  </BarChart>
                )}
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}
