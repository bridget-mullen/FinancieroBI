"use client"

import { useState, useEffect, useCallback } from "react"
import { PageTabs } from "@/components/page-tabs"
import { PageFooter } from "@/components/page-footer"
import { PeriodFilter } from "@/components/period-filter"
import { getCompromisos } from "@/lib/queries"
import type { CompromisoRow } from "@/lib/queries"

function fmt(v: number) {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(v)
}

function Semaforo({ pct }: { pct: number }) {
  // Single traffic light — 3 stacked circles, active one is bright
  const isGreen = pct >= 90
  const isYellow = pct >= 70 && pct < 90
  const isRed = pct < 70
  return (
    <span className="inline-flex items-center gap-0.5">
      <span className={`w-3.5 h-3.5 rounded-full inline-block border ${isRed ? "bg-[#E62800] border-[#B91C00] shadow-[0_0_4px_#E62800]" : "bg-[#E62800]/15 border-[#E5E7E9]"}`} />
      <span className={`w-3.5 h-3.5 rounded-full inline-block border ${isYellow ? "bg-[#F5C518] border-[#D4A800] shadow-[0_0_4px_#F5C518]" : "bg-[#F5C518]/15 border-[#E5E7E9]"}`} />
      <span className={`w-3.5 h-3.5 rounded-full inline-block border ${isGreen ? "bg-[#2E7D32] border-[#1B5E20] shadow-[0_0_4px_#2E7D32]" : "bg-[#2E7D32]/15 border-[#E5E7E9]"}`} />
    </span>
  )
}

export default function CompromisosPage() {
  const [year, setYear] = useState("2026")
  const [periodos, setPeriodos] = useState<number[]>([2])
  const [data, setData] = useState<CompromisoRow[]>([])
  const [loading, setLoading] = useState(true)

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
  }, [year, month])

  const totalMeta = data.reduce((s, r) => s + r.meta, 0)
  const totalActual = data.reduce((s, r) => s + r.primaActual, 0)
  const totalPct = totalMeta > 0 ? Math.round((totalActual / totalMeta) * 1000) / 10 : 0

  return (
    <div className="min-h-screen bg-[#FAFAFA] px-3 py-4 flex flex-col">
      <div className="max-w-[1200px] mx-auto w-full flex flex-col flex-1">
      <PageTabs />

      <div className="flex items-center justify-between mb-3 flex-wrap gap-1">
        <h1 className="text-sm font-bold text-[#111] font-lato">Compromisos de Venta</h1>
        <PeriodFilter onFilterChange={handleFilterChange} />
      </div>

      <div className="bi-card overflow-hidden overflow-x-auto">
        <table className="w-full text-[10px]">
          <thead>
            <tr className="bg-[#041224] text-white border-b-2 border-b-[#E62800]">
              <th className="text-left px-2 py-2 font-semibold">Vendedor</th>
              <th className="text-right px-2 py-2 font-semibold">Meta comprometida</th>
              <th className="text-right px-2 py-2 font-semibold">Prima neta actual</th>
              <th className="text-right px-2 py-2 font-semibold">% Avance</th>
              <th className="text-center px-2 py-2 font-semibold">Semáforo</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} className="px-3 py-8 text-center text-gray-400">Cargando...</td></tr>
            ) : data.length === 0 ? (
              <tr><td colSpan={5} className="px-3 py-8 text-center text-[#888]">Sin compromisos registrados para este periodo</td></tr>
            ) : data.map((r, idx) => (
              <tr key={r.vendedor} className={`border-b border-[#F0F0F0] hover:bg-[#FFF5F5] ${idx % 2 === 1 ? "bg-[#FAFAFA]" : "bg-white"}`}>
                <td className="px-2 py-1.5 font-medium text-[#111]">{r.vendedor}</td>
                <td className="px-2 py-1.5 text-right text-gray-500">{fmt(r.meta)}</td>
                <td className="px-2 py-1.5 text-right font-medium">{fmt(r.primaActual)}</td>
                <td className={`px-2 py-1.5 text-right font-medium ${r.pctAvance >= 90 ? "text-[#2E7D32]" : r.pctAvance >= 70 ? "text-[#F5C518]" : "text-[#E62800]"}`}>{r.pctAvance}%</td>
                <td className="px-2 py-1.5 text-center"><Semaforo pct={r.pctAvance} /></td>
              </tr>
            ))}
            {!loading && data.length > 0 && (
              <tr className="bg-[#041224] text-white border-t-2">
                <td className="px-2 py-2 font-bold">Total</td>
                <td className="px-2 py-2 text-right font-bold">{fmt(totalMeta)}</td>
                <td className="px-2 py-2 text-right font-bold">{fmt(totalActual)}</td>
                <td className="px-2 py-2 text-right font-bold">{totalPct}%</td>
                <td className="px-2 py-2 text-center"><Semaforo pct={totalPct} /></td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <PageFooter />
      </div>
    </div>
  )
}
