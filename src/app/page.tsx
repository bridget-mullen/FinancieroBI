"use client"

import React, { useState, useEffect, useCallback } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { SEED_LINEAS, SEED_PRESUPUESTO, SEED_FX, getTipoCambio } from "@/lib/queries"
import type { FxRates } from "@/lib/queries"
import { Gauge } from "@/components/gauge"
import { PeriodFilter } from "@/components/period-filter"
import { BarChart, Bar, XAxis, YAxis, LabelList, Tooltip, ResponsiveContainer } from "recharts"

function fmt(v: number) {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(v)
}

const TABS = [
  { href: "/", label: "Tacometro" },
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
  const handleFilterChange = useCallback((_year: string, _periodos: number[]) => {
    // Filter state managed by PeriodFilter — SEED data is static for tacometro
  }, [])

  const lineas = SEED_LINEAS

  useEffect(() => {
    document.title = "Tacometro | CLK BI Dashboard"
    const timer = setTimeout(() => setReady(true), 500)
    return () => clearTimeout(timer)
  }, [])

  useEffect(() => { getTipoCambio().then(r => r && setFx(r)) }, [])

  const total = lineas.reduce((s, l) => s + l.primaNeta, 0)
  const totalPpto = lineas.reduce((s, l) => s + l.presupuesto, 0) || SEED_PRESUPUESTO
  const totalAA = lineas.reduce((s, l) => s + l.anioAnterior, 0)
  const cumpl = Math.round((total / totalPpto) * 100)
  const crec = Math.round(((total - totalAA) / totalAA) * 1000) / 10

  const chartData = [...lineas].sort((a, b) => a.primaNeta - b.primaNeta).map(l => ({
    name: l.nombre.replace('Click ', '').replace('Cartera ', ''),
    pn: +((l.primaNeta ?? 0) / 1e6).toFixed(1),
    pp: +((l.presupuesto ?? 0) / 1e6).toFixed(1),
  }))

  return (
    <div className="h-screen bg-[#FAFAFA] px-3 py-2 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex justify-between items-center border-b pb-1.5 mb-1">
        <Tabs />
        <PeriodFilter onFilterChange={handleFilterChange} defaultYear="2025" defaultMonth={2} />
      </div>

      {/* Title */}
      <h1 className="text-sm font-bold text-gray-800 mb-1">Prima neta cobrada por linea de negocio</h1>

      {/* === TOP ROW: Gauge (left) + Table (right) === */}
      <div className="grid grid-cols-[42fr_58fr] gap-2 mb-2">
        {/* Gauge */}
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-3 flex items-center justify-center">
          <div className="w-full max-w-[300px]">
            <Gauge value={total / 1e6} prevYear={totalAA / 1e6} budget={totalPpto / 1e6} />
          </div>
        </div>

        {/* Table */}
        <div className="bg-white shadow-sm rounded-lg border border-gray-200 overflow-hidden">
          <table className="w-full text-[11px]">
            <thead className="bg-[#041224] text-white">
              <tr>
                <th className="text-left px-2 py-1.5 font-semibold">Linea</th>
                <th className="text-right px-2 py-1.5 font-semibold">Prima Neta</th>
                <th className="text-right px-2 py-1.5 font-semibold">Ano Ant. *</th>
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
      </div>

      {/* === BOTTOM ROW: Tipo de cambio (narrow) | KPI cards (center) | Bar chart (right) === */}
      <div className="grid grid-cols-[140px_minmax(200px,280px)_1fr] gap-2 flex-1 min-h-0">

        {/* Tipo de Cambio — narrow vertical card */}
        <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden flex flex-col">
          <div className="bg-gray-800 text-white text-[10px] font-bold px-2 py-1.5 text-center">Tipo de cambio</div>
          <div className="flex-1 flex flex-col justify-center px-3 py-2 gap-3">
            <div className="text-center">
              <span className="text-blue-600 font-medium text-[10px] block mb-0.5">Dolar</span>
              <span className="font-bold text-xl">${fx.usd.toFixed(2)}</span>
            </div>
            <div className="border-t border-gray-200 pt-3 text-center">
              <span className="text-gray-500 text-[10px] block mb-0.5">Peso Dom.</span>
              <span className="font-bold text-xl">${fx.dop.toFixed(2)}</span>
            </div>
          </div>
        </div>

        {/* KPI Cards — compact, stacked, centered text */}
        <div className="flex flex-col gap-2">
          <div className="bg-[#FFF8F0] rounded-lg border border-orange-200 flex-1 flex flex-col items-center justify-center px-3 py-2">
            <p className="text-[10px] text-gray-600 text-center leading-tight mb-1">Cumplimiento del presupuesto</p>
            <p className="text-4xl font-bold text-gray-900">{cumpl}%</p>
          </div>
          <div className="bg-[#22c55e] rounded-lg flex-1 flex flex-col items-center justify-center px-3 py-2">
            <p className="text-[10px] text-white/80 text-center leading-tight mb-1">Crecimiento vs ano anterior</p>
            <p className="text-4xl font-bold text-white flex items-center gap-1">
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M5.293 9.707a1 1 0 010-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 01-1.414 1.414L10 6.414l-3.293 3.293a1 1 0 01-1.414 0z" clipRule="evenodd"/></svg>
              {crec}%
            </p>
          </div>
        </div>

        {/* Bar Chart */}
        <div className="bg-white border border-gray-200 rounded-lg shadow-sm px-3 py-2 flex flex-col min-h-0">
          <div className="flex gap-4 text-[10px] mb-1">
            <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 bg-[#1e3a5f] rounded-sm"/><span className="text-gray-600">PN Efectuada</span></div>
            <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 bg-[#94a3b8] rounded-sm"/><span className="text-gray-600">Presupuesto</span></div>
          </div>
          <div className="flex-1 min-h-0">
            {ready && chartData.length > 0 && (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart layout="vertical" data={chartData} margin={{ top: 2, right: 50, left: 10, bottom: 2 }} barGap={2}>
                  <XAxis type="number" domain={[0, 80]} ticks={[0, 10, 20, 30, 40, 50, 60, 70, 80]} tickFormatter={v => `$${v}M`} tick={{ fontSize: 9 }} axisLine={{ stroke: '#E5E7EB' }}/>
                  <YAxis type="category" dataKey="name" width={75} tick={{ fontSize: 10 }} axisLine={false} tickLine={false}/>
                  <Tooltip contentStyle={{ backgroundColor: 'white', border: '1px solid #e5e7eb', borderRadius: '6px', boxShadow: '0 2px 4px rgba(0,0,0,0.08)', fontSize: 11 }} formatter={(value?: number) => [`$${value ?? 0}M`, '']}/>
                  <Bar dataKey="pn" fill="#1e3a5f" radius={[0, 3, 3, 0]} barSize={14} isAnimationActive={true} animationDuration={800}>
                    <LabelList dataKey="pn" position="right" formatter={(v: unknown) => v != null ? `$${v}M` : ''} style={{ fontSize: 9, fill: '#1e3a5f', fontWeight: 600 }}/>
                  </Bar>
                  <Bar dataKey="pp" fill="#94a3b8" radius={[0, 3, 3, 0]} barSize={14} isAnimationActive={true} animationDuration={800}>
                    <LabelList dataKey="pp" position="right" formatter={(v: unknown) => v != null ? `$${v}M` : ''} style={{ fontSize: 9, fill: '#64748b' }}/>
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="flex justify-between items-center mt-1 pt-1 border-t">
        <div className="flex items-center gap-2">
          <div className="bg-orange-500 text-white text-[8px] font-black px-1.5 py-0.5 rounded leading-tight">INTRA<br/>CLICK</div>
          <span className="text-[10px] text-gray-500">* El total de la prima neta del ano anterior esta al corte del dia: 23/febrero/2025</span>
        </div>
        <div className="text-right text-[10px] text-gray-600">
          <div className="font-semibold">Fecha de actualizacion.</div>
          <div>23/02/2026 08:10:20 a.m.</div>
        </div>
      </div>
    </div>
  )
}
