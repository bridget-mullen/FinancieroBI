"use client"

import { useState, useEffect, useCallback } from "react"
import { PageTabs } from "@/components/page-tabs"
import { PeriodFilter } from "@/components/period-filter"
import { getRankedAseguradoras } from "@/lib/queries"

function fmt(v: number) {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(v)
}

export default function AseguradorasPage() {
  const [year, setYear] = useState("2026")
  const [periodos, setPeriodos] = useState<number[]>([2])
  const [topAseguradoras, setTopAseguradoras] = useState<{ aseguradora: string; primaNeta: number; pct: number }[]>([])

  const handleFilterChange = useCallback((newYear: string, newPeriodos: number[]) => {
    setYear(newYear)
    setPeriodos(newPeriodos)
  }, [])

  useEffect(() => { document.title = "Aseguradoras | CLK BI Dashboard" }, [])

  const month = periodos[0] ?? 2

  useEffect(() => {
    getRankedAseguradoras(month, year).then(a => {
      if (a && a.length > 0) {
        const total = a.reduce((s, x) => s + x.primaNeta, 0)
        setTopAseguradoras(a.slice(0, 5).map(x => ({ ...x, pct: total > 0 ? Math.round((x.primaNeta / total) * 1000) / 10 : 0 })))
      } else {
        setTopAseguradoras([])
      }
    })
  }, [year, month])

  const maxAseguradora = topAseguradoras.length > 0 ? Math.max(...topAseguradoras.map(a => a.primaNeta)) : 0

  return (
    <div className="min-h-screen bg-[#FAFAFA] px-3 py-4 flex flex-col">
      <div className="max-w-[1200px] mx-auto w-full flex flex-col flex-1">
        <div className="flex justify-between items-center border-b pb-2 pt-5 w-full">
          <PageTabs />
          <PeriodFilter onFilterChange={handleFilterChange} />
        </div>

        <h1 className="text-sm font-bold text-[#111] font-lato mt-3 mb-3">Aseguradoras</h1>

        {topAseguradoras.length > 0 ? (
          <div className="flex flex-col gap-4">
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <h3 className="text-xs font-bold text-[#041224] mb-2">Top 5 Aseguradoras</h3>
              <table className="w-full text-[10px]">
                <thead><tr className="bg-[#041224] text-white border-b-2 border-b-[#E62800]">
                  <th className="px-2 py-1.5 text-left font-semibold w-8">#</th>
                  <th className="px-2 py-1.5 text-left font-semibold">Aseguradora</th>
                  <th className="px-2 py-1.5 text-right font-semibold">Prima Neta</th>
                  <th className="px-2 py-1.5 text-right font-semibold">% del total</th>
                </tr></thead>
                <tbody>
                  {topAseguradoras.map((a, i) => (
                    <tr key={a.aseguradora} className={`border-b border-[#E5E7E9] ${i % 2 === 1 ? "bg-[#FAFAFA]" : "bg-white"}`}>
                      <td className="px-2 py-1 font-bold text-[#041224]">{i + 1}</td>
                      <td className="px-2 py-1">{a.aseguradora}</td>
                      <td className="px-2 py-1 text-right font-medium">{fmt(a.primaNeta)}</td>
                      <td className="px-2 py-1 text-right text-[#041224] font-medium">{a.pct}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <h3 className="text-xs font-bold text-[#041224] mb-3">Distribución Aseguradoras</h3>
              <div className="space-y-2">
                {topAseguradoras.map((a) => (
                  <div key={a.aseguradora} className="flex items-center gap-2">
                    <span className="text-[10px] text-[#333] w-28 truncate shrink-0">{a.aseguradora}</span>
                    <div className="flex-1 bg-gray-100 rounded-full h-4 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-[#041224] to-[#E62800] transition-all duration-500"
                        style={{ width: `${maxAseguradora > 0 ? (a.primaNeta / maxAseguradora) * 100 : 0}%` }}
                      />
                    </div>
                    <span className="text-[10px] font-medium text-[#041224] w-10 text-right shrink-0">{a.pct}%</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-lg border border-gray-200 py-12 text-center">
            <p className="text-[#888] text-sm">Sin datos de aseguradoras para este periodo</p>
          </div>
        )}
      </div>
    </div>
  )
}
