"use client"

import { useEffect, useState, useCallback } from "react"
import { PageTabs } from "@/components/page-tabs"
import { PageFooter } from "@/components/page-footer"
import { PeriodFilter } from "@/components/period-filter"
import { getLineasWithYoY, getRamos, getRankedAseguradoras } from "@/lib/queries"

function fmt(v: number) {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(v)
}

type RamoItem = { ramo: string; primaNeta: number; polizas: number }

export default function GobiernoPage() {
  const [year, setYear] = useState("2026")
  const [periodos, setPeriodos] = useState<number[]>([1, 2, 3, 4])

  const [totalPrima, setTotalPrima] = useState(0)
  const [totalPpto, setTotalPpto] = useState(0)
  const [totalAA, setTotalAA] = useState(0)

  const [ramos, setRamos] = useState<RamoItem[]>([])
  const [aseguradoras, setAseguradoras] = useState<Array<{ aseguradora: string; primaNeta: number }>>([])
  const [loading, setLoading] = useState(true)

  const handleFilterChange = useCallback((newYear: string, newPeriodos: number[]) => {
    setYear(newYear)
    setPeriodos(newPeriodos)
  }, [])

  const periodo = periodos[periodos.length - 1] ?? 2

  useEffect(() => {
    document.title = "Gobierno | CLK BI Dashboard"
  }, [])

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)

      const [lineasData, ramosData, aseguradorasData] = await Promise.all([
        getLineasWithYoY(periodos, year),
        getRamos(periodo, year),
        getRankedAseguradoras(periodo, year),
      ])

      if (cancelled) return

      const lineas = lineasData ?? []
      setTotalPrima(lineas.reduce((s, l) => s + l.primaNeta, 0))
      setTotalPpto(lineas.reduce((s, l) => s + l.presupuesto, 0))
      setTotalAA(lineas.reduce((s, l) => s + l.anioAnterior, 0))

      setRamos(
        (ramosData ?? []).map((r) => ({
          ramo: r.ramo,
          primaNeta: r.primaNeta,
          polizas: r.polizas ?? 0,
        }))
      )

      setAseguradoras(aseguradorasData ?? [])
      setLoading(false)
    }

    load()

    return () => {
      cancelled = true
    }
  }, [year, periodos, periodo])

  const cumplimiento = totalPpto > 0 ? Math.round((totalPrima / totalPpto) * 1000) / 10 : 0
  const crecimiento = totalAA > 0 ? Math.round(((totalPrima - totalAA) / totalAA) * 1000) / 10 : 0

  return (
    <div className="min-h-screen bg-[#FAFAFA] px-3 py-4 flex flex-col">
      <div className="max-w-[1200px] mx-auto w-full flex flex-col flex-1">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center border-b pb-2 pt-3 md:pt-5 w-full gap-2 md:gap-0">
          <PageTabs />
          <PeriodFilter onFilterChange={handleFilterChange} />
        </div>

        <h1 className="text-sm font-bold text-[#111] font-lato mt-3 mb-2">Gobierno — Control Ejecutivo</h1>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
          <div className="bg-white border border-gray-200 rounded-lg p-3">
            <p className="text-xs text-gray-500 uppercase font-semibold">Prima neta acumulada</p>
            <p className="text-xl font-black text-[#041224] mt-1 tabular-nums">{fmt(totalPrima)}</p>
          </div>
          <div className="bg-white border border-gray-200 rounded-lg p-3">
            <p className="text-xs text-gray-500 uppercase font-semibold">Cumplimiento vs presupuesto</p>
            <p className={`text-xl font-black mt-1 tabular-nums ${cumplimiento >= 100 ? "text-[#059669]" : cumplimiento >= 80 ? "text-amber-600" : "text-[#E62800]"}`}>
              {cumplimiento}%
            </p>
          </div>
          <div className="bg-white border border-gray-200 rounded-lg p-3">
            <p className="text-xs text-gray-500 uppercase font-semibold">Crecimiento vs año anterior</p>
            <p className={`text-xl font-black mt-1 tabular-nums ${crecimiento >= 0 ? "text-[#059669]" : "text-[#E62800]"}`}>
              {crecimiento >= 0 ? "+" : ""}{crecimiento}%
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <div className="bg-[#041224] text-white px-3 py-2 text-xs font-semibold uppercase tracking-wider">Ramos (Top)</div>
            <div className="max-h-[360px] overflow-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-[#F8FAFC] border-b border-gray-200">
                    <th className="text-left px-3 py-2">Ramo</th>
                    <th className="text-center px-3 py-2">Prima Neta</th>
                    <th className="text-center px-3 py-2">Pólizas</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan={3} className="px-3 py-6 text-center text-gray-400">Cargando...</td></tr>
                  ) : ramos.length === 0 ? (
                    <tr><td colSpan={3} className="px-3 py-6 text-center text-gray-400">Sin datos</td></tr>
                  ) : (
                    [...ramos]
                      .sort((a, b) => b.primaNeta - a.primaNeta)
                      .slice(0, 12)
                      .map((r) => (
                        <tr key={r.ramo} className="border-b border-gray-100 odd:bg-white even:bg-[#F9FAFB]">
                          <td className="px-3 py-2 text-left font-medium text-[#111]">{r.ramo}</td>
                          <td className="px-3 py-2 text-center tabular-nums font-semibold">{fmt(r.primaNeta)}</td>
                          <td className="px-3 py-2 text-center tabular-nums">{new Intl.NumberFormat("es-MX").format(r.polizas)}</td>
                        </tr>
                      ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <div className="bg-[#041224] text-white px-3 py-2 text-xs font-semibold uppercase tracking-wider">Aseguradoras (Top)</div>
            <div className="max-h-[360px] overflow-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-[#F8FAFC] border-b border-gray-200">
                    <th className="text-left px-3 py-2">Aseguradora</th>
                    <th className="text-center px-3 py-2">Prima Neta</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan={2} className="px-3 py-6 text-center text-gray-400">Cargando...</td></tr>
                  ) : aseguradoras.length === 0 ? (
                    <tr><td colSpan={2} className="px-3 py-6 text-center text-gray-400">Sin datos</td></tr>
                  ) : (
                    [...aseguradoras]
                      .sort((a, b) => b.primaNeta - a.primaNeta)
                      .slice(0, 12)
                      .map((a) => (
                        <tr key={a.aseguradora} className="border-b border-gray-100 odd:bg-white even:bg-[#F9FAFB]">
                          <td className="px-3 py-2 text-left font-medium text-[#111]">{a.aseguradora}</td>
                          <td className="px-3 py-2 text-center tabular-nums font-semibold">{fmt(a.primaNeta)}</td>
                        </tr>
                      ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <PageFooter />
      </div>
    </div>
  )
}
