"use client"

import { useState, useEffect, useCallback } from "react"
import { SEED_LINEAS, SEED_PRESUPUESTO, getLineasNegocio } from "@/lib/queries"
import type { LineaRow } from "@/lib/queries"
import { Gauge } from "@/components/gauge"
import { PageTabs } from "@/components/page-tabs"
import { PeriodFilter } from "@/components/period-filter"
import { BarChart, Bar, XAxis, YAxis, LabelList, Tooltip } from "recharts"

function fmt(v: number) {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(v)
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

  // Load real data from Supabase when filters change
  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const result = await getLineasNegocio(periodo, year)
        if (cancelled || !result || result.length === 0) return
        // Start with ALL SEED lines, update primaNeta for lines found in Supabase
        const merged: LineaRow[] = SEED_LINEAS.map(seed => {
          const real = result.find(r => r.linea === seed.nombre)
          return {
            ...seed,
            primaNeta: real ? real.primaNeta : seed.primaNeta,
          }
        })
        // Add any new lines from Supabase not in SEED
        result.forEach(r => {
          if (!merged.find(m => m.nombre === r.linea)) {
            merged.push({ nombre: r.linea, primaNeta: r.primaNeta, anioAnterior: 0, presupuesto: 0 })
          }
        })
        setLineas(merged)
      } catch {
        // Keep current lineas (SEED or previous data)
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
    name: l.nombre.replace('Click ', '').replace('Cartera ', ''),
    pn: +((l.primaNeta ?? 0) / 1e6).toFixed(1),
    pp: +((l.presupuesto ?? 0) / 1e6).toFixed(1),
  }))

  return (
    <div className="min-h-screen bg-[#FAFAFA] px-3 py-4 flex flex-col">
      <div className="max-w-[1400px] mx-auto w-full flex flex-col flex-1">
        {/* Header */}
        <div className="flex justify-between items-center border-b pb-2 pt-5 w-full">
          <PageTabs />
          <PeriodFilter onFilterChange={handleFilterChange} defaultYear="2025" defaultMonth={2} />
        </div>

        {/* Title */}
        <h1 className="text-xl font-bold tracking-wide text-gray-800 mt-6 mb-3 pb-1 border-b border-gray-200">PRIMA NETA COBRADA</h1>

        {/* Main Grid — compact two-column */}
        <div className="flex gap-3 flex-1 mt-2">
          {/* Left column ~55%: Pastel indicator + Gauge in flex row */}
          <div className="w-[55%] flex items-center justify-center gap-3">
            {/* KPI indicator box — two stacked colored sections */}
            <div className="w-[130px] shrink-0 rounded-lg shadow-sm overflow-hidden">
              <div className="bg-[#ECFDF5] px-3 py-2.5 text-center">
                <p className="text-[11px] text-[#065F46] leading-tight">Cumplimiento</p>
                <p className="text-xl font-bold text-[#059669] leading-tight mt-0.5">{cumpl}%</p>
              </div>
              <div className="bg-[#FEF2F2] px-3 py-2.5 text-center">
                <p className="text-[11px] text-[#991B1B] leading-tight">Crecimiento</p>
                <p className="text-xl font-bold text-[#DC2626] leading-tight mt-0.5">
                  {crec < 0 ? "↓" : "↑"} {crec}%
                </p>
              </div>
            </div>

            {/* Gauge — hero element, fills available space */}
            <div className="flex-1 flex justify-center">
              <Gauge value={total / 1e6} prevYear={totalAA / 1e6} budget={totalPpto / 1e6} />
            </div>
          </div>

          {/* Right column ~45%: Table + Chart */}
          <div className="w-[45%] flex flex-col gap-1 justify-center">
            <div className="bg-white shadow-sm rounded-lg border border-gray-200 overflow-hidden">
              <table className="w-full text-[11px]">
                <thead className="bg-[#041224] text-white">
                  <tr>
                    <th className="text-left px-1.5 py-0.5 text-[11px] font-bold">Línea</th>
                    <th className="text-right px-1.5 py-0.5 text-[11px] font-bold">Prima Neta</th>
                    <th className="text-right px-1.5 py-0.5 text-[11px] font-bold">Año Ant. *</th>
                    <th className="text-right px-1.5 py-0.5 text-[11px] font-bold">Presupuesto</th>
                    <th className="text-right px-1.5 py-0.5 text-[11px] font-bold">Diferencia</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {lineas.map((l, i) => {
                    const diff = l.primaNeta - l.presupuesto
                    return (
                      <tr key={l.nombre} className={`cursor-pointer transition-colors hover:bg-blue-50 ${i % 2 === 0 ? "bg-white" : "bg-gray-50/70"}`}>
                        <td className="px-1.5 py-0.5 font-medium text-gray-800">{l.nombre}</td>
                        <td className="px-1.5 py-0.5 text-right font-semibold text-gray-900">{fmt(l.primaNeta)}</td>
                        <td className="px-1.5 py-0.5 text-right text-gray-500">{fmt(l.anioAnterior)}</td>
                        <td className="px-1.5 py-0.5 text-right text-gray-500">{fmt(l.presupuesto)}</td>
                        <td className={`px-1.5 py-0.5 text-right font-semibold ${diff < 0 ? "text-red-600" : "text-emerald-600"}`}>
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
                    <td className={`px-1.5 py-0.5 text-right font-bold ${(total - totalPpto) < 0 ? "text-red-600" : "text-emerald-600"}`}>
                      {(total - totalPpto) < 0 ? `(${fmt(Math.abs(total - totalPpto))})` : fmt(total - totalPpto)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Chart */}
            <div className="bg-white border border-gray-200 rounded-lg shadow-sm px-2 py-1.5 flex flex-col h-[250px]">
              <div className="flex gap-3 text-[11px] mb-1">
                <div className="flex items-center gap-1"><span className="w-2.5 h-2.5 bg-[#1e3a5f] rounded-sm"/><span className="text-gray-700 font-medium">PN Efectuada</span></div>
                <div className="flex items-center gap-1"><span className="w-2.5 h-2.5 bg-[#94a3b8] rounded-sm"/><span className="text-gray-700 font-medium">Presupuesto</span></div>
              </div>
              <div className="w-full max-w-[520px]">
                {ready && chartData.length > 0 && (
                    <BarChart width={500} height={215} layout="vertical" data={chartData} margin={{ top: 2, right: 45, left: 5, bottom: 2 }} barGap={1}>
                      <XAxis type="number" domain={[0, 80]} ticks={[0, 20, 40, 60, 80]} tickFormatter={v => `$${v}M`} tick={{ fontSize: 9 }} axisLine={{ stroke: '#E5E7EB' }}/>
                      <YAxis type="category" dataKey="name" width={75} tick={{ fontSize: 9 }} axisLine={false} tickLine={false}/>
                      <Tooltip
                        contentStyle={{ backgroundColor: 'white', border: '1px solid #e5e7eb', borderRadius: '6px', boxShadow: '0 2px 4px rgba(0,0,0,0.08)', fontSize: 11 }}
                        formatter={(value?: number) => [`$${value ?? 0}M`, '']}
                      />
                      <Bar dataKey="pn" fill="#1e3a5f" radius={[0, 3, 3, 0]} barSize={18} isAnimationActive={true} animationDuration={800}>
                        <LabelList dataKey="pn" position="right" formatter={(v: unknown) => v != null ? `$${v}M` : ''} style={{ fontSize: 9, fill: '#1e3a5f', fontWeight: 600 }}/>
                      </Bar>
                      <Bar dataKey="pp" fill="#94a3b8" radius={[0, 3, 3, 0]} barSize={18} isAnimationActive={true} animationDuration={800}>
                        <LabelList dataKey="pp" position="right" formatter={(v: unknown) => v != null ? `$${v}M` : ''} style={{ fontSize: 9, fill: '#94a3b8' }}/>
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
