"use client"

import { useState, useEffect, useCallback } from "react"
import Link from "next/link"
import { SEED_LINEAS, SEED_PRESUPUESTO, getLineasNegocio } from "@/lib/queries"
import type { LineaRow } from "@/lib/queries"
import { Gauge } from "@/components/gauge"
import { PageTabs } from "@/components/page-tabs"
import { PeriodFilter } from "@/components/period-filter"
import { BarChart, Bar, XAxis, YAxis, LabelList, Tooltip } from "recharts"

function fmt(v: number) {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(v)
}

const LINEA_LINKS: Record<string, string> = {
  "Vendedores": "/compromisos",
  "Aseguradoras": "/internacional",
}

export default function Home() {
  const [ready, setReady] = useState(false)
  const [year, setYear] = useState("2025")
  const [periodos, setPeriodos] = useState<number[]>([2])
  const [lineas, setLineas] = useState<LineaRow[]>(SEED_LINEAS)

  const handleFilterChange = useCallback((newYear: string, newPeriodos: number[]) => {
    setYear(newYear)
    setPeriodos(newPeriodos)
  }, [])

  const periodo = periodos[0] ?? 2

  useEffect(() => {
    document.title = "Tacómetro | CLK BI Dashboard"
    const timer = setTimeout(() => setReady(true), 500)
    return () => clearTimeout(timer)
  }, [])

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const result = await getLineasNegocio(periodo, year)
        if (cancelled || !result || result.length === 0) return
        const merged: LineaRow[] = SEED_LINEAS.map(seed => {
          const real = result.find(r => r.linea === seed.nombre)
          return {
            ...seed,
            primaNeta: real ? real.primaNeta : seed.primaNeta,
          }
        })
        result.forEach(r => {
          if (!merged.find(m => m.nombre === r.linea)) {
            merged.push({ nombre: r.linea, primaNeta: r.primaNeta, anioAnterior: 0, presupuesto: 0 })
          }
        })
        setLineas(merged)
      } catch {
        // Keep current lineas
      }
    }
    load()
    return () => { cancelled = true }
  }, [periodo, year])

  const total = lineas.reduce((s, l) => s + l.primaNeta, 0)
  const totalPpto = lineas.reduce((s, l) => s + l.presupuesto, 0) || SEED_PRESUPUESTO
  const totalAA = lineas.reduce((s, l) => s + l.anioAnterior, 0)
  const cumpl = Math.round((total / totalPpto) * 100)
  const crec = totalAA > 0 ? Math.round(((total - totalAA) / totalAA) * 1000) / 10 : 0

  const chartData = [...lineas].sort((a, b) => a.primaNeta - b.primaNeta).map(l => ({
    name: l.nombre,
    pn: +((l.primaNeta ?? 0) / 1e6).toFixed(1),
    pp: +((l.presupuesto ?? 0) / 1e6).toFixed(1),
  }))

  return (
    <div className="min-h-screen bg-[#FAFAFA] px-3 py-4 flex flex-col">
      <div className="max-w-[1200px] mx-auto w-full flex flex-col flex-1">
        {/* Header */}
        <div className="flex justify-between items-center border-b pb-2 pt-5 w-full">
          <PageTabs />
          <PeriodFilter onFilterChange={handleFilterChange} defaultYear="2025" defaultMonth={2} />
        </div>

        {/* Title */}
        <h1 className="text-xl font-bold tracking-wide text-gray-800 mt-6 mb-3 pb-1 border-b border-gray-200">PRIMA NETA COBRADA</h1>

        {/* Main Grid */}
        <div className="flex gap-3 flex-1 mt-0">
          {/* Left column: KPI boxes + Gauge */}
          <div className="w-[55%] flex items-center justify-center gap-3">
            {/* KPI indicator box */}
            <div className="w-[150px] shrink-0 rounded-lg shadow-sm overflow-hidden">
              <div className="bg-[#ECFDF5] px-3 p-6 text-center">
                <p className="text-[11px] text-[#065F46] leading-tight">Cumplimiento</p>
                <p className="text-3xl font-bold text-[#059669] leading-tight mt-0.5">{cumpl}%</p>
              </div>
              <div className="bg-[#FEF2F2] px-3 p-6 text-center">
                <p className="text-[11px] text-[#991B1B] leading-tight">Crecimiento</p>
                <p className="text-3xl font-bold text-[#DC2626] leading-tight mt-0.5">
                  {crec < 0 ? "↓" : "↑"} {crec}%
                </p>
              </div>
            </div>

            {/* Gauge */}
            <div className="flex-1 min-w-0">
              <Gauge value={total / 1e6} prevYear={totalAA / 1e6} budget={totalPpto / 1e6} />
            </div>
          </div>

          {/* Right column: Table + Chart */}
          <div className="w-[45%] flex flex-col gap-1 justify-start mt-0">
            <div className="bg-white shadow-sm rounded-lg border border-gray-200 overflow-hidden">
              <table className="w-full text-[12px]">
                <thead className="bg-[#041224] text-white">
                  <tr>
                    <th className="text-left px-1.5 py-0.5 text-[13px] font-bold">Línea</th>
                    <th className="text-right px-1.5 py-0.5 text-[13px] font-bold">Prima Neta</th>
                    <th className="text-right px-1.5 py-0.5 text-[13px] font-bold">Año Ant. *</th>
                    <th className="text-right px-1.5 py-0.5 text-[13px] font-bold">Presupuesto</th>
                    <th className="text-right px-1.5 py-0.5 text-[13px] font-bold">Diferencia</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {lineas.map((l, i) => {
                    const diff = l.primaNeta - l.presupuesto
                    const link = LINEA_LINKS[l.nombre]
                    return (
                      <tr key={l.nombre} className={`cursor-pointer transition-colors hover:bg-blue-50 ${i % 2 === 0 ? "bg-white" : "bg-gray-50/70"}`}>
                        <td className="px-1.5 py-0.5 font-medium text-gray-800">
                          {link ? <Link href={link} className="text-blue-700 hover:underline">{l.nombre}</Link> : l.nombre}
                        </td>
                        <td className="px-1.5 py-0.5 text-right font-semibold text-gray-900">{fmt(l.primaNeta)}</td>
                        <td className="px-1.5 py-0.5 text-right text-gray-500">{fmt(l.anioAnterior)}</td>
                        <td className="px-1.5 py-0.5 text-right text-gray-500">{fmt(l.presupuesto)}</td>
                        <td className={`px-1.5 py-1 text-right font-semibold ${diff < 0 ? "text-red-600" : "text-emerald-600"}`}>
                          {diff < 0 ? `(${fmt(Math.abs(diff))})` : fmt(diff)}
                        </td>
                      </tr>
                    )
                  })}
                  <tr className="bg-gray-100 font-bold border-t-2 border-gray-300">
                    <td className="px-1.5 py-0.5 text-gray-900">Total</td>
                    <td className="px-1.5 py-0.5 text-right text-gray-900">{fmt(total)}</td>
                    <td className="px-1.5 py-0.5 text-right text-gray-700">{fmt(totalAA)}</td>
                    <td className="px-1.5 py-0.5 text-right text-gray-700">{fmt(totalPpto)}</td>
                    <td className={`px-1.5 py-1 text-right font-bold ${(total - totalPpto) < 0 ? "text-red-600" : "text-emerald-600"}`}>
                      {(total - totalPpto) < 0 ? `(${fmt(Math.abs(total - totalPpto))})` : fmt(total - totalPpto)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Chart */}
            <div className="bg-white border border-gray-200 rounded-lg shadow-sm px-2 py-1.5 flex flex-col h-[250px] items-center">
              <div className="flex gap-3 text-[12px] mb-1 self-start">
                <div className="flex items-center gap-1"><span className="w-2.5 h-2.5 bg-[#F5C518] rounded-sm"/><span className="text-gray-700 font-medium">PN Efectuada</span></div>
                <div className="flex items-center gap-1"><span className="w-2.5 h-2.5 bg-[#2E7D32] rounded-sm"/><span className="text-gray-700 font-medium">Presupuesto</span></div>
              </div>
              <div className="w-full flex justify-center overflow-hidden">
                {ready && chartData.length > 0 && (
                    <BarChart width={480} height={190} layout="vertical" data={chartData} margin={{ top: 2, right: 50, left: 10, bottom: 2 }} barGap={8}>
                      <defs>
                        <linearGradient id="gradYellow" x1="0" y1="0" x2="1" y2="1">
                          <stop offset="0%" stopColor="#F5C518" stopOpacity={1}/>
                          <stop offset="100%" stopColor="#D4A80E" stopOpacity={1}/>
                        </linearGradient>
                        <linearGradient id="gradGreen" x1="0" y1="0" x2="1" y2="1">
                          <stop offset="0%" stopColor="#2E7D32" stopOpacity={1}/>
                          <stop offset="100%" stopColor="#1B5E20" stopOpacity={1}/>
                        </linearGradient>
                      </defs>
                      <XAxis type="number" domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tickFormatter={v => `$${v}M`} tick={{ fontSize: 12 }} axisLine={{ stroke: '#E5E7EB' }}/>
                      <YAxis type="category" dataKey="name" width={90} tick={{ fontSize: 12 }} axisLine={false} tickLine={false}/>
                      <Tooltip
                        contentStyle={{ backgroundColor: 'white', border: '1px solid #e5e7eb', borderRadius: '6px', boxShadow: '0 2px 4px rgba(0,0,0,0.08)', fontSize: 13 }}
                        formatter={(value?: number) => [`$${value ?? 0}M`, '']}
                      />
                      <Bar dataKey="pn" fill="url(#gradYellow)" radius={[0, 3, 3, 0]} barSize={16} isAnimationActive={true} animationDuration={800}>
                        <LabelList dataKey="pn" position="right" formatter={(v: unknown) => v != null ? `$${v}M` : ''} style={{ fontSize: 12, fill: '#B8960E', fontWeight: 600 }}/>
                      </Bar>
                      <Bar dataKey="pp" fill="url(#gradGreen)" radius={[0, 3, 3, 0]} barSize={16} isAnimationActive={true} animationDuration={800}>
                        <LabelList dataKey="pp" position="right" formatter={(v: unknown) => v != null ? `$${v}M` : ''} style={{ fontSize: 12, fill: '#1B5E20' }}/>
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
