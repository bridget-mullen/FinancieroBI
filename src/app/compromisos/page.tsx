"use client"

import { useState, useEffect, useCallback } from "react"
import { PageTabs } from "@/components/page-tabs"
import { PeriodFilter } from "@/components/period-filter"
import { getCompromisos, getRankedVendedores } from "@/lib/queries"
import type { CompromisoRow } from "@/lib/queries"
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts"

function fmt(v: number) {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(v)
}

function Semaforo({ pct }: { pct: number }) {
  const isGreen = pct >= 90
  const isYellow = pct >= 70 && pct < 90
  const isRed = pct < 70
  return (
    <span className="inline-flex items-center gap-0.5">
      <span className={`w-3 h-3 rounded-full inline-block border ${isRed ? "bg-[#E62800] border-[#B91C00] shadow-[0_0_4px_#E62800]" : "bg-[#E62800]/15 border-[#E5E7E9]"}`} />
      <span className={`w-3 h-3 rounded-full inline-block border ${isYellow ? "bg-[#F5C518] border-[#D4A800] shadow-[0_0_4px_#F5C518]" : "bg-[#F5C518]/15 border-[#E5E7E9]"}`} />
      <span className={`w-3 h-3 rounded-full inline-block border ${isGreen ? "bg-[#2E7D32] border-[#1B5E20] shadow-[0_0_4px_#2E7D32]" : "bg-[#2E7D32]/15 border-[#E5E7E9]"}`} />
    </span>
  )
}

export default function CompromisosPage() {
  const [year, setYear] = useState("2026")
  const [periodos, setPeriodos] = useState<number[]>([2])
  const [data, setData] = useState<CompromisoRow[]>([])
  const [loading, setLoading] = useState(true)

  const [topVendedores, setTopVendedores] = useState<{ vendedor: string; primaNeta: number }[]>([])
  const [bottomVendedores, setBottomVendedores] = useState<{ vendedor: string; primaNeta: number }[]>([])

  const handleFilterChange = useCallback((newYear: string, newPeriodos: number[]) => {
    setYear(newYear)
    setPeriodos(newPeriodos)
  }, [])

  useEffect(() => { document.title = "Compromisos | CLK BI Dashboard" }, [])

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

  const chartData = topVendedores.map(v => ({
    name: v.vendedor.length > 12 ? v.vendedor.slice(0, 12) + "…" : v.vendedor,
    primaNeta: v.primaNeta,
  }))

  return (
    <div className="h-screen bg-[#FAFAFA] px-3 py-2 flex flex-col overflow-hidden">
      <div className="max-w-[1200px] mx-auto w-full flex flex-col flex-1 min-h-0">
        <div className="flex justify-between items-center border-b pb-2 pt-3 w-full">
          <PageTabs />
          <PeriodFilter onFilterChange={handleFilterChange} />
        </div>

        <h1 className="text-xs font-bold text-[#111] font-lato mt-1 mb-1">Compromisos de Venta</h1>

        <div className="border border-gray-200 rounded overflow-hidden overflow-x-auto">
          <table className="w-full text-[9px]">
            <thead>
              <tr className="bg-[#041224] text-white border-b-2 border-b-[#E62800]">
                <th className="text-left px-2 py-1 font-semibold">Vendedor</th>
                <th className="text-right px-2 py-1 font-semibold">Meta comprometida</th>
                <th className="text-right px-2 py-1 font-semibold">Prima neta actual</th>
                <th className="text-right px-2 py-1 font-semibold">% Avance</th>
                <th className="text-center px-2 py-1 font-semibold">Semáforo</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} className="px-3 py-4 text-center text-gray-400 text-[9px]">Cargando...</td></tr>
              ) : data.length === 0 ? (
                <tr><td colSpan={5} className="px-3 py-4 text-center text-[#888] text-[9px]">Sin compromisos registrados para este periodo</td></tr>
              ) : data.map((r, idx) => (
                <tr key={r.vendedor} className={`border-b border-[#F0F0F0] hover:bg-[#FFF5F5] ${idx % 2 === 1 ? "bg-[#FAFAFA]" : "bg-white"}`}>
                  <td className="px-2 py-0.5 font-medium text-[#111]">{r.vendedor}</td>
                  <td className="px-2 py-0.5 text-right text-gray-500">{fmt(r.meta)}</td>
                  <td className="px-2 py-0.5 text-right font-medium">{fmt(r.primaActual)}</td>
                  <td className={`px-2 py-0.5 text-right font-medium ${r.pctAvance >= 90 ? "text-[#2E7D32]" : r.pctAvance >= 70 ? "text-[#F5C518]" : "text-[#E62800]"}`}>{r.pctAvance}%</td>
                  <td className="px-2 py-0.5 text-center"><Semaforo pct={r.pctAvance} /></td>
                </tr>
              ))}
              {!loading && data.length > 0 && (
                <tr className="bg-[#041224] text-white border-t-2">
                  <td className="px-2 py-1 font-bold">Total</td>
                  <td className="px-2 py-1 text-right font-bold">{fmt(totalMeta)}</td>
                  <td className="px-2 py-1 text-right font-bold">{fmt(totalActual)}</td>
                  <td className="px-2 py-1 text-right font-bold">{totalPct}%</td>
                  <td className="px-2 py-1 text-center"><Semaforo pct={totalPct} /></td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {topVendedores.length > 0 && (
          <div className="grid grid-cols-3 gap-2 mt-2 flex-1 min-h-0">
            <div className="bg-white rounded border border-gray-200 p-2 flex flex-col min-h-0">
              <h3 className="text-[9px] font-bold text-[#041224] mb-1">Top 5 Vendedores</h3>
              <table className="w-full text-[9px]">
                <thead><tr className="bg-[#041224] text-white border-b-2 border-b-[#E62800]">
                  <th className="px-1 py-0.5 text-left font-semibold w-6">#</th>
                  <th className="px-1 py-0.5 text-left font-semibold">Vendedor</th>
                  <th className="px-1 py-0.5 text-right font-semibold">Prima Neta</th>
                </tr></thead>
                <tbody>
                  {topVendedores.map((v, i) => (
                    <tr key={v.vendedor} className="bg-[#F1F8F1] border-b border-[#E5E7E9]">
                      <td className="px-1 py-0.5 font-bold text-[#2E7D32]">{i + 1}</td>
                      <td className="px-1 py-0.5">{v.vendedor}</td>
                      <td className="px-1 py-0.5 text-right font-medium">{fmt(v.primaNeta)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="bg-white rounded border border-gray-200 p-2 flex flex-col min-h-0">
              <h3 className="text-[9px] font-bold text-[#041224] mb-1">Bottom 5 Vendedores</h3>
              <table className="w-full text-[9px]">
                <thead><tr className="bg-[#041224] text-white border-b-2 border-b-[#E62800]">
                  <th className="px-1 py-0.5 text-left font-semibold w-6">#</th>
                  <th className="px-1 py-0.5 text-left font-semibold">Vendedor</th>
                  <th className="px-1 py-0.5 text-right font-semibold">Prima Neta</th>
                </tr></thead>
                <tbody>
                  {bottomVendedores.map((v, i) => (
                    <tr key={v.vendedor} className="bg-[#FFF3F3] border-b border-[#E5E7E9]">
                      <td className="px-1 py-0.5 font-bold text-[#E62800]">{i + 1}</td>
                      <td className="px-1 py-0.5">{v.vendedor}</td>
                      <td className="px-1 py-0.5 text-right font-medium">{fmt(v.primaNeta)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="bg-white rounded border border-gray-200 p-2 flex flex-col min-h-0">
              <h3 className="text-[9px] font-bold text-[#041224] mb-1">Prima Neta - Top 5</h3>
              <div className="flex-1 min-h-0">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 4, right: 4, left: 4, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                    <XAxis dataKey="name" tick={{ fontSize: 8 }} interval={0} angle={-30} textAnchor="end" height={40} />
                    <YAxis tick={{ fontSize: 8 }} tickFormatter={(v: number) => `${(v / 1000000).toFixed(1)}M`} width={35} />
                    <Tooltip formatter={(value) => fmt(Number(value))} labelStyle={{ fontSize: 10 }} contentStyle={{ fontSize: 10 }} />
                    <Bar dataKey="primaNeta" fill="#000000" radius={[2, 2, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
