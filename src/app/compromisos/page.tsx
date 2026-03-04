"use client"

import { useState, useEffect, useCallback } from "react"
import { PageTabs } from "@/components/page-tabs"
import { PeriodFilter } from "@/components/period-filter"
import { getCompromisos, getRankedVendedores } from "@/lib/queries"
import type { CompromisoRow } from "@/lib/queries"
import { BarChart, Bar, XAxis, YAxis, LabelList, Cell, ResponsiveContainer } from "recharts"

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
  const isGreen = pct >= 90
  const isYellow = pct >= 70 && pct < 90
  const isRed = pct < 70
  return (
    <span className="inline-flex items-center gap-0.5">
      <span className={`w-2 h-2 rounded-full inline-block border ${isRed ? "bg-[#E62800] border-[#B91C00] shadow-[0_0_3px_#E62800]" : "bg-[#E62800]/15 border-[#E5E7E9]"}`} />
      <span className={`w-2 h-2 rounded-full inline-block border ${isYellow ? "bg-[#F5C518] border-[#D4A800] shadow-[0_0_3px_#F5C518]" : "bg-[#F5C518]/15 border-[#E5E7E9]"}`} />
      <span className={`w-2 h-2 rounded-full inline-block border ${isGreen ? "bg-[#2E7D32] border-[#1B5E20] shadow-[0_0_3px_#2E7D32]" : "bg-[#2E7D32]/15 border-[#E5E7E9]"}`} />
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

  const barData = [...data].sort((a, b) => a.primaActual - b.primaActual).map(r => ({
    name: surname(r.vendedor),
    fullName: r.vendedor,
    value: r.primaActual,
    pct: r.pctAvance,
    color: semaforoColor(r.pctAvance),
  }))

  const topBarData = topVendedores.map(v => ({
    name: surname(v.vendedor),
    value: v.primaNeta,
  })).reverse()

  const bottomBarData = bottomVendedores.map(v => ({
    name: surname(v.vendedor),
    value: v.primaNeta,
  })).reverse()

  return (
    <div className="min-h-screen bg-[#FAFAFA] px-3 py-4 flex flex-col">
      <div className="max-w-[1200px] mx-auto w-full flex flex-col flex-1">
        {/* Header */}
        <div className="flex justify-between items-center border-b pb-2 pt-5 w-full">
          <PageTabs />
          <PeriodFilter onFilterChange={handleFilterChange} />
        </div>

        <h1 className="text-sm font-bold text-[#111] font-lato mt-3 mb-2">Vendedores — Compromisos</h1>

        {/* 3-row layout, each row = table + chart side by side */}
        <div className="flex flex-col gap-2 max-h-[calc(100vh-80px)] flex-1">

          {/* ROW 1: Compromisos table + chart */}
          <div className="grid grid-cols-2 gap-2 flex-[5] min-h-0">
            {/* Table */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-2 overflow-hidden flex flex-col">
              <table className="w-full text-[8px]">
                <thead>
                  <tr className="bg-[#041224] text-white border-b-2 border-b-[#E62800]">
                    <th className="text-left px-1.5 py-[2px] text-[9px] font-semibold">Vendedor</th>
                    <th className="text-right px-1.5 py-[2px] text-[9px] font-semibold">Meta</th>
                    <th className="text-right px-1.5 py-[2px] text-[9px] font-semibold">Prima Neta</th>
                    <th className="text-right px-1.5 py-[2px] text-[9px] font-semibold">% Avance</th>
                    <th className="text-center px-1.5 py-[2px] text-[9px] font-semibold">Semáforo</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan={5} className="px-1.5 py-4 text-center text-gray-400 text-[8px]">Cargando...</td></tr>
                  ) : data.length === 0 ? (
                    <tr><td colSpan={5} className="px-1.5 py-4 text-center text-[#888] text-[8px]">Sin compromisos para este periodo</td></tr>
                  ) : data.slice(0, 10).map((r, idx) => (
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
            {/* Chart */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-2 overflow-hidden">
              {ready && barData.length > 0 && (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart layout="vertical" data={barData} margin={{ top: 2, right: 30, bottom: 2, left: 0 }}>
                    <XAxis type="number" hide />
                    <YAxis type="category" dataKey="name" width={60} tick={{ fontSize: 7 }} axisLine={false} tickLine={false} />
                    <Bar dataKey="value" radius={[0, 2, 2, 0]} barSize={8}>
                      {barData.map((entry, idx) => (
                        <Cell key={idx} fill={entry.color} />
                      ))}
                      <LabelList dataKey="value" position="right" formatter={(v: unknown) => fmtShort(Number(v))} style={{ fontSize: 7, fill: '#333', fontWeight: 600 }} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* ROW 2: Top 5 table + chart */}
          <div className="grid grid-cols-2 gap-2 flex-[2.5] min-h-0">
            {/* Table */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-2 overflow-hidden flex flex-col">
              <p className="text-[9px] font-bold text-[#041224] mb-1">Top 5 Vendedores</p>
              <table className="w-full text-[8px]">
                <thead>
                  <tr className="bg-[#041224] text-white border-b-2 border-b-[#2E7D32]">
                    <th className="px-1.5 py-[2px] text-left text-[9px] font-semibold w-5">#</th>
                    <th className="px-1.5 py-[2px] text-left text-[9px] font-semibold">Vendedor</th>
                    <th className="px-1.5 py-[2px] text-right text-[9px] font-semibold">Prima Neta</th>
                  </tr>
                </thead>
                <tbody>
                  {topVendedores.map((v, i) => (
                    <tr key={v.vendedor} className={`border-b border-[#E5E7E9] ${i % 2 === 1 ? "bg-[#FAFAFA]" : "bg-[#F1F8F1]"}`}>
                      <td className="px-1.5 py-[2px] font-bold text-[#2E7D32]">{i + 1}</td>
                      <td className="px-1.5 py-[2px]">{v.vendedor}</td>
                      <td className="px-1.5 py-[2px] text-right font-medium">{fmt(v.primaNeta)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* Chart */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-2 overflow-hidden">
              {ready && topBarData.length > 0 && (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart layout="vertical" data={topBarData} margin={{ top: 2, right: 30, bottom: 2, left: 0 }}>
                    <XAxis type="number" hide />
                    <YAxis type="category" dataKey="name" width={60} tick={{ fontSize: 7 }} axisLine={false} tickLine={false} />
                    <Bar dataKey="value" fill="#2E7D32" radius={[0, 2, 2, 0]} barSize={8}>
                      <LabelList dataKey="value" position="right" formatter={(v: unknown) => fmtShort(Number(v))} style={{ fontSize: 7, fill: '#2E7D32', fontWeight: 600 }} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* ROW 3: Bottom 5 table + chart */}
          <div className="grid grid-cols-2 gap-2 flex-[2.5] min-h-0">
            {/* Table */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-2 overflow-hidden flex flex-col">
              <p className="text-[9px] font-bold text-[#041224] mb-1">Bottom 5 Vendedores</p>
              <table className="w-full text-[8px]">
                <thead>
                  <tr className="bg-[#041224] text-white border-b-2 border-b-[#E62800]">
                    <th className="px-1.5 py-[2px] text-left text-[9px] font-semibold w-5">#</th>
                    <th className="px-1.5 py-[2px] text-left text-[9px] font-semibold">Vendedor</th>
                    <th className="px-1.5 py-[2px] text-right text-[9px] font-semibold">Prima Neta</th>
                  </tr>
                </thead>
                <tbody>
                  {bottomVendedores.map((v, i) => (
                    <tr key={v.vendedor} className={`border-b border-[#E5E7E9] ${i % 2 === 1 ? "bg-[#FAFAFA]" : "bg-[#FFF3F3]"}`}>
                      <td className="px-1.5 py-[2px] font-bold text-[#E62800]">{i + 1}</td>
                      <td className="px-1.5 py-[2px]">{v.vendedor}</td>
                      <td className="px-1.5 py-[2px] text-right font-medium">{fmt(v.primaNeta)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* Chart */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-2 overflow-hidden">
              {ready && bottomBarData.length > 0 && (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart layout="vertical" data={bottomBarData} margin={{ top: 2, right: 30, bottom: 2, left: 0 }}>
                    <XAxis type="number" hide />
                    <YAxis type="category" dataKey="name" width={60} tick={{ fontSize: 7 }} axisLine={false} tickLine={false} />
                    <Bar dataKey="value" fill="#E62800" radius={[0, 2, 2, 0]} barSize={8}>
                      <LabelList dataKey="value" position="right" formatter={(v: unknown) => fmtShort(Number(v))} style={{ fontSize: 7, fill: '#E62800', fontWeight: 600 }} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}
