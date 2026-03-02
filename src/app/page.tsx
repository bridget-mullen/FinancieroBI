"use client"

import React, { useState, useEffect, useCallback } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { SEED_LINEAS, SEED_PRESUPUESTO, SEED_FX, getTipoCambio, getLineasNegocio } from "@/lib/queries"
import type { FxRates, LineaRow } from "@/lib/queries"
import { Gauge } from "@/components/gauge"
import { PeriodFilter } from "@/components/period-filter"
import { BarChart, Bar, XAxis, YAxis, LabelList, Tooltip } from "recharts"

function fmt(v: number) {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(v)
}

const TABS = [
  { href: "/", label: "Tacómetro" },
  { href: "/tabla-detalle", label: "Tabla detalle" },
  { href: "/compromisos", label: "Compromisos 2024" },
  { href: "/internacional", label: "Internacional" },
  { href: "/corporate", label: "Corporate." },
  { href: "/cobranza", label: "Convenios." },
]

function Tabs() {
  const pathname = usePathname()
  return (
    <div className="flex items-center">
      {TABS.map((tab, i) => (
        <React.Fragment key={tab.href}>
          {i > 0 && <span className="text-gray-300 mx-2">|</span>}
          <Link href={tab.href} className={`text-[14px] ${pathname === tab.href ? "text-gray-900 font-bold" : "text-gray-500 hover:text-gray-700"}`}>
            {tab.label}
          </Link>
        </React.Fragment>
      ))}
    </div>
  )
}

export default function Home() {
  const [fx, setFx] = useState<FxRates>(SEED_FX)
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

  useEffect(() => { getTipoCambio().then(r => r && setFx(r)) }, [])

  // Load real data from Supabase when filters change
  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const result = await getLineasNegocio(periodo, year)
        if (cancelled || !result || result.length === 0) return
        // Merge real primaNeta with SEED presupuesto/anioAnterior
        const merged: LineaRow[] = result.map(r => {
          const seed = SEED_LINEAS.find(s => s.nombre === r.linea)
          return {
            nombre: r.linea,
            primaNeta: r.primaNeta,
            anioAnterior: seed?.anioAnterior ?? 0,
            presupuesto: seed?.presupuesto ?? 0,
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
    <div className="min-h-screen bg-[#FAFAFA] px-3 py-2 flex flex-col">
      {/* Header */}
      <div className="flex justify-between items-center border-b pb-1.5 mb-1.5">
        <Tabs />
        <PeriodFilter onFilterChange={handleFilterChange} defaultYear="2025" defaultMonth={2} />
      </div>

      {/* Title */}
      <h1 className="text-base font-bold text-gray-800 mb-1.5">Prima neta cobrada por línea de negocio</h1>

      {/* Main Grid */}
      <div className="flex gap-2 justify-between flex-1 overflow-hidden">
        {/* Left side: Gauge + KPIs + Tipo de Cambio */}
        <div className="w-[calc(50%-6px)] flex flex-col">
          {/* Tacómetro — large, no wasted space */}
          <div className="flex items-center justify-center mb-1">
            <div className="w-full max-w-[380px]">
              <Gauge value={total / 1e6} prevYear={totalAA / 1e6} budget={totalPpto / 1e6} />
            </div>
          </div>

          {/* KPI Cards — compact squares side by side */}
          <div className="grid grid-cols-2 gap-2 mb-2">
            <div className="bg-[#FDF6EC] rounded-lg border border-orange-200 px-3 py-2 text-center">
              <p className="text-[10px] text-gray-600">Cumplimiento del presupuesto</p>
              <p className="text-xl font-bold text-gray-900">{cumpl}%</p>
            </div>
            <div className="bg-[#22c55e] rounded-lg px-3 py-2 text-center">
              <p className="text-[10px] text-white/80">Crecimiento vs año anterior</p>
              <p className="text-xl font-bold text-white flex items-center justify-center gap-1">
                <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M5.293 9.707a1 1 0 010-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 01-1.414 1.414L10 6.414l-3.293 3.293a1 1 0 01-1.414 0z" clipRule="evenodd"/></svg>
                {crec}%
              </p>
            </div>
          </div>

          {/* Tipo de cambio — elegant dark */}
          <div className="bg-[#1a1a2e] rounded-lg overflow-hidden">
            <div className="px-3 py-2 flex justify-around text-xs">
              <div className="text-center"><span className="text-gray-400 text-[10px] block">Dólar</span><span className="font-bold text-base text-white">${fx.usd.toFixed(2)}</span></div>
              <div className="text-center border-l border-gray-600 pl-4"><span className="text-gray-400 text-[10px] block">Peso Dom.</span><span className="font-bold text-base text-white">${fx.dop.toFixed(2)}</span></div>
            </div>
          </div>
        </div>

        {/* Right side: Table + Chart */}
        <div className="w-[calc(50%-6px)] flex flex-col gap-1 min-h-0">
          <div className="flex-1 bg-white shadow-sm rounded-lg border border-gray-200 overflow-hidden flex flex-col">
            <table className="w-full h-full text-[11px]">
              <thead className="bg-[#041224] text-white">
                <tr>
                  <th className="text-left px-2 py-1.5 font-semibold">Línea</th>
                  <th className="text-right px-2 py-1.5 font-semibold">Prima Neta</th>
                  <th className="text-right px-2 py-1.5 font-semibold">Año Ant. *</th>
                  <th className="text-right px-2 py-1.5 font-semibold">Presupuesto</th>
                  <th className="text-right px-2 py-1.5 font-semibold">Diferencia</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {lineas.map((l, i) => {
                  const diff = l.primaNeta - l.presupuesto
                  return (
                    <tr key={l.nombre} className={`cursor-pointer transition-colors hover:bg-blue-50 ${i % 2 === 0 ? "bg-white" : "bg-gray-50"}`}>
                      <td className="px-2 py-1 font-medium text-gray-800">{l.nombre}</td>
                      <td className="px-2 py-1 text-right font-semibold text-gray-900">{fmt(l.primaNeta)}</td>
                      <td className="px-2 py-1 text-right text-gray-500">{fmt(l.anioAnterior)}</td>
                      <td className="px-2 py-1 text-right text-gray-500">{fmt(l.presupuesto)}</td>
                      <td className={`px-2 py-1 text-right font-semibold ${diff < 0 ? "text-red-600" : "text-emerald-600"}`}>
                        {diff < 0 ? `(${fmt(Math.abs(diff))})` : fmt(diff)}
                      </td>
                    </tr>
                  )
                })}
                <tr className="bg-gray-100 font-bold border-t-2 border-gray-300">
                  <td className="px-2 py-1.5 text-gray-900">Total</td>
                  <td className="px-2 py-1.5 text-right text-gray-900">{fmt(total)}</td>
                  <td className="px-2 py-1.5 text-right text-gray-700">{fmt(totalAA)}</td>
                  <td className="px-2 py-1.5 text-right text-gray-700">{fmt(totalPpto)}</td>
                  <td className={`px-2 py-1.5 text-right font-bold ${(total - totalPpto) < 0 ? "text-red-600" : "text-emerald-600"}`}>
                    {(total - totalPpto) < 0 ? `(${fmt(Math.abs(total - totalPpto))})` : fmt(total - totalPpto)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Chart — fixed height, no stretch */}
          <div className="bg-white border border-gray-200 rounded-lg shadow-sm px-2 py-1.5 flex flex-col h-[260px]">
            <div className="flex gap-3 text-[10px] mb-1">
              <div className="flex items-center gap-1"><span className="w-2.5 h-2.5 bg-[#1e3a5f] rounded-sm"/><span className="text-gray-700 font-medium">PN Efectuada</span></div>
              <div className="flex items-center gap-1"><span className="w-2.5 h-2.5 bg-[#94a3b8] rounded-sm"/><span className="text-gray-700 font-medium">Presupuesto</span></div>
            </div>
            <div className="w-full max-w-[460px]">
              {ready && chartData.length > 0 && (
                  <BarChart width={440} height={220} layout="vertical" data={chartData} margin={{ top: 2, right: 45, left: 5, bottom: 2 }} barGap={1}>
                    <XAxis type="number" domain={[0, 80]} ticks={[0, 20, 40, 60, 80]} tickFormatter={v => `$${v}M`} tick={{ fontSize: 9 }} axisLine={{ stroke: '#E5E7EB' }}/>
                    <YAxis type="category" dataKey="name" width={70} tick={{ fontSize: 9 }} axisLine={false} tickLine={false}/>
                    <Tooltip
                      contentStyle={{ backgroundColor: 'white', border: '1px solid #e5e7eb', borderRadius: '6px', boxShadow: '0 2px 4px rgba(0,0,0,0.08)', fontSize: 11 }}
                      formatter={(value?: number) => [`$${value ?? 0}M`, '']}
                    />
                    <Bar dataKey="pn" fill="#1e3a5f" radius={[0, 3, 3, 0]} barSize={18} isAnimationActive={true} animationDuration={800}>
                      <LabelList dataKey="pn" position="right" formatter={(v: unknown) => v != null ? `$${v}M` : ''} style={{ fontSize: 9, fill: '#1e3a5f', fontWeight: 600 }}/>
                    </Bar>
                    <Bar dataKey="pp" fill="#94a3b8" radius={[0, 3, 3, 0]} barSize={18} isAnimationActive={true} animationDuration={800}>
                      <LabelList dataKey="pp" position="right" formatter={(v: unknown) => v != null ? `$${v}M` : ''} style={{ fontSize: 9, fill: '#64748b' }}/>
                    </Bar>
                  </BarChart>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="flex justify-between items-center mt-1.5 pt-1.5 border-t">
        <div className="flex items-center gap-2">
          <div className="bg-orange-500 text-white text-[8px] font-black px-1.5 py-0.5 rounded leading-tight">INTRA<br/>CLICK</div>
          <span className="text-[10px] text-gray-500">* El total de la prima neta del año anterior está al corte del día: 23/febrero/2025</span>
        </div>
        <div className="text-right text-[10px] text-gray-600">
          <div className="font-semibold">Fecha de actualización.</div>
          <div>23/02/2026 08:10:20 a.m.</div>
        </div>
      </div>
    </div>
  )
}
