"use client"

import { useState, useEffect, useCallback } from "react"
import { PageTabs } from "@/components/page-tabs"
import { PeriodFilter } from "@/components/period-filter"
import { getRankedAseguradoras } from "@/lib/queries"

function fmt(v: number) {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(v)
}

function fmtShort(v: number) {
  if (Math.abs(v) >= 1e6) return `$${(v / 1e6).toFixed(1)}M`
  if (Math.abs(v) >= 1e3) return `$${(v / 1e3).toFixed(0)}K`
  return `$${v}`
}

export default function AseguradorasPage() {
  const [year, setYear] = useState("2026")
  const [periodos, setPeriodos] = useState<number[]>([2])
  const [allAseguradoras, setAllAseguradoras] = useState<{ aseguradora: string; primaNeta: number; pct: number }[]>([])
  const [totalPrima, setTotalPrima] = useState(0)
  const [clasificacionFilter, setClasificacionFilter] = useState<string>("Todas")

  const handleFilterChange = useCallback((newYear: string, newPeriodos: number[]) => {
    setYear(newYear)
    setPeriodos(newPeriodos)
  }, [])

  useEffect(() => { document.title = "Aseguradoras | CLK BI Dashboard" }, [])

  const month = periodos[0] ?? 2

  useEffect(() => {
    getRankedAseguradoras(month, year, clasificacionFilter).then(a => {
      if (a && a.length > 0) {
        const total = a.reduce((s, x) => s + x.primaNeta, 0)
        setTotalPrima(total)
        setAllAseguradoras(a.slice(0, 10).map(x => ({ ...x, pct: total > 0 ? Math.round((x.primaNeta / total) * 1000) / 10 : 0 })))
      } else {
        setAllAseguradoras([])
        setTotalPrima(0)
      }
    })
  }, [year, month, clasificacionFilter])

  const maxAseguradora = allAseguradoras.length > 0 ? Math.max(...allAseguradoras.map(a => a.primaNeta)) : 0
  const COLORS = ["#1B5E20", "#2E7D32", "#388E3C", "#43A047", "#4CAF50", "#66BB6A", "#81C784", "#A5D6A7", "#C8E6C9", "#E8F5E9"]

  // Filter out zero-value aseguradoras
  const filteredAseguradoras = allAseguradoras.filter(a => a.primaNeta > 0)

  return (
    <div className="bg-[#FAFAFA] px-3 py-4">
      <div className="max-w-[1200px] mx-auto w-full">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center border-b pb-2 pt-3 md:pt-5 w-full gap-2 md:gap-0">
          <PageTabs />
          <PeriodFilter onFilterChange={handleFilterChange} />
        </div>

        <div className="flex items-center justify-between mt-3 mb-2">
          <h1 className="text-sm font-bold text-[#111] font-lato">Aseguradoras</h1>
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
              <option value="Servicio">Servicio</option>
            </select>
          </div>
        </div>

        {filteredAseguradoras.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {/* Left: Table */}
            <div className="bg-white rounded-lg border border-gray-200 p-2">
              <div className="flex items-center justify-between mb-1.5">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-[#041224]">Top 10 Aseguradoras</h3>
                <span className="text-xs text-gray-500">Total: {fmtShort(totalPrima)}</span>
              </div>
              <table className="w-full">
                <thead><tr className="bg-[#041224] text-white border-b-2 border-b-[#E62800]">
                  <th className="px-2 py-1.5 text-left text-xs font-semibold uppercase tracking-wider w-6">#</th>
                  <th className="px-2 py-1.5 text-left text-xs font-semibold uppercase tracking-wider">Aseguradora</th>
                  <th className="px-2 py-1.5 text-right text-xs font-semibold uppercase tracking-wider">Prima Neta</th>
                  <th className="px-2 py-1.5 text-right text-xs font-semibold uppercase tracking-wider">%</th>
                </tr></thead>
                <tbody>
                  {filteredAseguradoras.map((a, i) => (
                    <tr key={a.aseguradora} className={`border-b border-[#E5E7E9] ${i % 2 === 1 ? "bg-[#FAFAFA]" : "bg-white"}`}>
                      <td className="px-2 py-1.5 text-xs font-medium text-[#041224] tabular-nums">{i + 1}</td>
                      <td className="px-2 py-1.5 text-xs">{a.aseguradora}</td>
                      <td className="px-2 py-1.5 text-right text-xs font-medium tabular-nums">{fmt(a.primaNeta)}</td>
                      <td className="px-2 py-1.5 text-right text-xs font-medium tabular-nums text-[#041224]">{a.pct}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Right: Chart */}
            <div className="bg-white rounded-lg border border-gray-200 p-2">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-[#041224] mb-2">Distribución por Prima Neta</h3>
              <div className="space-y-1.5">
                {filteredAseguradoras.map((a, i) => (
                  <div key={a.aseguradora} className="flex items-center gap-2">
                    <span className="text-xs text-[#333] w-24 truncate shrink-0" title={a.aseguradora}>{a.aseguradora}</span>
                    <div className="flex-1 bg-gray-100 rounded h-4 overflow-hidden relative">
                      <div
                        className="h-full rounded transition-all duration-500 flex items-center"
                        style={{
                          width: `${maxAseguradora > 0 ? Math.max((a.primaNeta / maxAseguradora) * 100, 3) : 0}%`,
                          backgroundColor: COLORS[i] || "#4CAF50"
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
                    <span className="text-xs font-medium tabular-nums w-10 text-right shrink-0" style={{ color: COLORS[i] || "#4CAF50" }}>{a.pct}%</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-lg border border-gray-200 py-8 text-center">
            <p className="text-[#888] text-xs">Sin datos de aseguradoras para este periodo</p>
          </div>
        )}
      </div>
    </div>
  )
}
