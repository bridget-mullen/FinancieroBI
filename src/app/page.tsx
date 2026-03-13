"use client"

import { useState, useEffect, useCallback } from "react"
import Link from "next/link"
import { SEED_LINEAS, SEED_PRESUPUESTO } from "@/lib/queries"
import type { LineaRow } from "@/lib/queries"
import { Gauge } from "@/components/gauge"
import { PageTabs } from "@/components/page-tabs"
import { PeriodFilter } from "@/components/period-filter"
import { BarChart, Bar, XAxis, YAxis, LabelList, Tooltip, ResponsiveContainer } from "recharts"
import { ChevronRight } from "lucide-react"

function fmt(v: number) {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(v)
}
function fmtShort(v: number) {
  if (Math.abs(v) >= 1e6) return `$${(v / 1e6).toFixed(1)}M`
  if (Math.abs(v) >= 1e3) return `$${(v / 1e3).toFixed(0)}K`
  return `$${v}`
}

const LINEA_LINKS: Record<string, string> = {
  "Click Franquicias": "/tabla-detalle?linea=click-franquicias",
  "Click Promotoras": "/tabla-detalle?linea=click-promotoras",
  "Corporate": "/tabla-detalle?linea=corporate",
  "Cartera Tradicional": "/tabla-detalle?linea=cartera-tradicional",
  "Call Center": "/tabla-detalle?linea=call-center",
}

export default function Home() {
  const [ready, setReady] = useState(false)
  const [year, setYear] = useState("2026")
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
    <div className="bg-[#FAFAFA] px-3 py-4 flex flex-col">
      <div className="max-w-[1200px] mx-auto w-full flex flex-col flex-1">
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center border-b pb-2 pt-3 md:pt-5 w-full gap-2 md:gap-0">
          <PageTabs />
          <PeriodFilter onFilterChange={handleFilterChange} defaultYear="2026" defaultMonth={2} />
        </div>

        {/* Title */}
        <h1 className="text-lg md:text-xl font-bold tracking-wide text-gray-800 mt-4 md:mt-6 mb-3 pb-1 border-b border-gray-200">PRIMA NETA COBRADA</h1>

        {/* ═══ MOBILE LAYOUT ═══ */}
        <div className="md:hidden flex flex-col gap-3">
          {/* Hero: Gauge — LARGE, fills the screen */}
          <div className="w-full mx-auto">
            <Gauge value={total / 1e6} prevYear={totalAA / 1e6} budget={totalPpto / 1e6} cumplimiento={cumpl} crecimiento={crec} />
          </div>

          {/* Lines list — card style, tappable */}
          <div>
            <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Por Línea de Negocio</h2>
            <div className="space-y-1.5">
              {lineas.map((l) => {
                const diff = l.primaNeta - l.presupuesto
                const pct = l.presupuesto > 0 ? Math.round((diff / l.presupuesto) * 100) : 0
                const link = LINEA_LINKS[l.nombre]
                // Semáforo logic: red if below last year, amber if between last year and budget, green if at/above budget
                const semaforo = l.primaNeta < l.anioAnterior
                  ? "text-[#E62800]"
                  : l.primaNeta < l.presupuesto
                    ? "text-amber-600"
                    : "text-[#059669]"
                const card = (
                  <div className="bg-white rounded-xl border border-gray-200 px-3 py-3 shadow-sm active:bg-gray-50 transition-colors">
                    <div className="flex justify-between items-center">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 mb-1">
                          <span className="font-bold text-sm text-[#111] truncate">{l.nombre}</span>
                          {link && <ChevronRight className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />}
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-base font-bold text-[#041224] tabular-nums">{fmtShort(l.primaNeta)}</span>
                          <span className="text-[11px] text-gray-600 tabular-nums">/ {fmtShort(l.presupuesto)}</span>
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0 ml-2">
                        <div className={`text-sm font-medium tabular-nums ${semaforo}`}>
                          {pct > 0 ? "+" : ""}{pct}%
                        </div>
                        <div className="text-[10px] text-gray-400">vs ppto</div>
                      </div>
                    </div>
                    {/* Mini progress bar */}
                    <div className="mt-2 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${Math.min(Math.max((l.primaNeta / l.presupuesto) * 100, 0), 100)}%`,
                          backgroundColor: l.primaNeta < l.anioAnterior ? '#E62800' : l.primaNeta < l.presupuesto ? '#F59E0B' : '#059669'
                        }}
                      />
                    </div>
                  </div>
                )
                return link ? <Link key={l.nombre} href={link}>{card}</Link> : <div key={l.nombre}>{card}</div>
              })}
            </div>
          </div>

          {/* Chart — full width */}
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm px-3 py-3">
            <div className="flex gap-3 text-[10px] mb-2">
              <div className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-[#041224]"/><span className="text-gray-600 font-medium">Prima neta</span></div>
              <div className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-[#9CA3AF]"/><span className="text-gray-600 font-medium">Presupuesto</span></div>
            </div>
            <div className="w-full" style={{ height: 220 }}>
              {ready && chartData.length > 0 && (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart layout="vertical" data={chartData} margin={{ top: 2, right: 40, left: 0, bottom: 2 }} barGap={6}>
                    <XAxis type="number" domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tickFormatter={v => `$${v}M`} tick={{ fontSize: 9 }} axisLine={{ stroke: '#E5E7EB' }}/>
                    <YAxis type="category" dataKey="name" width={75} tick={{ fontSize: 9 }} axisLine={false} tickLine={false}/>
                    <Tooltip
                      contentStyle={{ backgroundColor: '#052F5F', border: 'none', borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.25)', fontSize: 11, padding: '6px 10px', color: '#fff' }}
                      itemStyle={{ color: '#fff' }}
                      labelStyle={{ color: '#ccc', fontWeight: 600, marginBottom: 4 }}
                      formatter={(value?: number, name?: string) => [`$${value ?? 0}M`, name === 'pn' ? 'Prima Neta' : 'Presupuesto']}
                      cursor={{ fill: 'rgba(57,131,246,0.08)' }}
                    />
                    <Bar dataKey="pn" fill="#041224" radius={[0, 3, 3, 0]} barSize={10} isAnimationActive={true} animationDuration={800}>
                      <LabelList dataKey="pn" position="right" formatter={(v: unknown) => v != null ? `$${v}M` : ''} style={{ fontSize: 9, fill: '#041224', fontWeight: 600 }}/>
                    </Bar>
                    <Bar dataKey="pp" fill="#9CA3AF" radius={[0, 3, 3, 0]} barSize={10} isAnimationActive={true} animationDuration={800}>
                      <LabelList dataKey="pp" position="right" formatter={(v: unknown) => v != null ? `$${v}M` : ''} style={{ fontSize: 9, fill: '#6B7280', fontWeight: 600 }}/>
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </div>

        {/* ═══ DESKTOP LAYOUT (unchanged) ═══ */}
        <div className="hidden md:flex gap-3 flex-1 mt-0">
          {/* Left column: Gauge */}
          <div className="w-[55%] flex items-center justify-center">
            <div className="w-full">
              <Gauge value={total / 1e6} prevYear={totalAA / 1e6} budget={totalPpto / 1e6} cumplimiento={cumpl} crecimiento={crec} />
            </div>
          </div>

          {/* Right column: Table + Chart */}
          <div className="w-[45%] flex flex-col gap-1 justify-center mt-6">
            <div className="bg-white shadow-sm rounded-lg border border-gray-200 overflow-hidden">
              <table className="w-full text-xs min-w-[480px]">
                <thead>
                  <tr className="bg-[#041224] border-b-2 border-b-[#E62800]">
                    <th className="text-left px-2 py-3 text-xs font-semibold uppercase tracking-wider text-white">Línea</th>
                    <th className="text-center px-2 py-3 text-xs font-semibold uppercase tracking-wider text-white">Prima Neta</th>
                    <th className="text-center px-2 py-3 text-xs font-semibold uppercase tracking-wider text-white">Año Ant.</th>
                    <th className="text-center px-2 py-3 text-xs font-semibold uppercase tracking-wider text-white">Presupuesto</th>
                    <th className="text-center px-2 py-3 text-xs font-semibold uppercase tracking-wider text-white">Diferencia</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {lineas.map((l, i) => {
                    const diff = l.primaNeta - l.presupuesto
                    const link = LINEA_LINKS[l.nombre]
                    // Diferencia color: red if negative, green if positive or zero
                    const diffColor = diff < 0 ? "text-[#E62800]" : "text-[#059669]"
                    return (
                      <tr key={l.nombre} className={`cursor-pointer transition-colors hover:bg-blue-50 ${i % 2 === 0 ? "bg-white" : "bg-gray-50/70"}`}>
                        <td className="px-2 py-4 text-base font-bold text-gray-900">
                          {link ? <Link href={link} className="hover:underline text-gray-900">{l.nombre}</Link> : l.nombre}
                        </td>
                        <td className="px-2 py-4 text-center text-base font-medium text-gray-900 tabular-nums">{fmt(l.primaNeta)}</td>
                        <td className="px-2 py-4 text-center text-base font-medium text-gray-800 tabular-nums">{fmt(l.anioAnterior)}</td>
                        <td className="px-2 py-4 text-center text-base font-medium text-gray-600 tabular-nums">{fmt(l.presupuesto)}</td>
                        <td className={`px-2 py-4 text-center text-base tabular-nums ${diffColor} ${diff < 0 ? 'font-bold' : 'font-medium'}`}>
                          {diff < 0 ? `(${fmt(Math.abs(diff))})` : fmt(diff)}
                        </td>
                      </tr>
                    )
                  })}
                  {/* Total row with semáforo logic */}
                  <tr className="font-black border-t-2 border-gray-300 bg-[#041224]">
                    <td className="px-2 py-4 text-base font-black text-white">Total</td>
                    <td className="px-2 py-4 text-center text-base font-black tabular-nums text-white">{fmt(total)}</td>
                    <td className="px-2 py-4 text-center text-base font-black tabular-nums text-white">{fmt(totalAA)}</td>
                    <td className="px-2 py-4 text-center text-base font-black tabular-nums text-gray-400">{fmt(totalPpto)}</td>
                    <td className="px-2 py-4 text-center text-base font-black tabular-nums" style={{ color: (total - totalPpto) < 0 ? '#E62800' : '#059669' }}>
                      {(total - totalPpto) < 0 ? `(${fmt(Math.abs(total - totalPpto))})` : fmt(total - totalPpto)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Chart */}
            <div className="bg-white border border-gray-200 rounded-lg shadow-sm px-2 py-1.5 flex flex-col h-[280px] overflow-hidden">
              <div className="flex gap-3 text-[12px] mb-1 self-start">
                <div className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: '#041224' }}/><span className="text-gray-700 font-medium">Prima neta efectuada</span></div>
                <div className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: '#9CA3AF' }}/><span className="text-gray-700 font-medium">Presupuesto</span></div>
              </div>
              <div style={{ width: '100%', height: 240, minWidth: 0 }}>
                {ready && chartData.length > 0 && (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart layout="vertical" data={chartData} margin={{ top: 2, right: 50, left: 10, bottom: 2 }} barGap={8}>
                      <XAxis type="number" domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tickFormatter={v => `$${v}M`} tick={{ fontSize: 11 }} axisLine={{ stroke: '#E5E7EB' }}/>
                      <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 11 }} axisLine={false} tickLine={false}/>
                      <Tooltip
                        contentStyle={{ backgroundColor: '#052F5F', border: 'none', borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.25)', fontSize: 12, padding: '8px 12px', color: '#fff' }}
                        itemStyle={{ color: '#fff' }}
                        labelStyle={{ color: '#ccc', fontWeight: 600, marginBottom: 4 }}
                        formatter={(value?: number, name?: string) => [`$${value ?? 0}M`, name === 'pn' ? 'Prima Neta' : 'Presupuesto']}
                        cursor={{ fill: 'rgba(57,131,246,0.08)' }}
                      />
                      <Bar dataKey="pn" fill="#041224" radius={[0, 3, 3, 0]} barSize={14} isAnimationActive={true} animationDuration={800}>
                        <LabelList dataKey="pn" position="right" formatter={(v: unknown) => v != null ? `$${v}M` : ''} style={{ fontSize: 11, fill: '#041224', fontWeight: 600 }}/>
                      </Bar>
                      <Bar dataKey="pp" fill="#9CA3AF" radius={[0, 3, 3, 0]} barSize={14} isAnimationActive={true} animationDuration={800}>
                        <LabelList dataKey="pp" position="right" formatter={(v: unknown) => v != null ? `$${v}M` : ''} style={{ fontSize: 11, fill: '#6B7280', fontWeight: 600 }}/>
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  )
}
