"use client"

import { useState, useEffect } from "react"
import { PageTabs } from "@/components/page-tabs"
import { PageFooter } from "@/components/page-footer"
import { supabase } from "@/lib/supabase"
import { LineChart, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip } from "recharts"

function fmt(v: number) {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(v)
}

interface CobranzaDia {
  fecha: string
  gerencia: string
  prima_cobrada: number
  meta_dia: number
  diferencia: number
  acumulado: number
}

const SEED: CobranzaDia[] = [
  { fecha: "2026-02-21", gerencia: "Diamond", prima_cobrada: 1245000, meta_dia: 1100000, diferencia: 145000, acumulado: 18750000 },
  { fecha: "2026-02-22", gerencia: "Diamond", prima_cobrada: 980000, meta_dia: 1100000, diferencia: -120000, acumulado: 19730000 },
  { fecha: "2026-02-23", gerencia: "Business", prima_cobrada: 1520000, meta_dia: 1300000, diferencia: 220000, acumulado: 21250000 },
  { fecha: "2026-02-24", gerencia: "Partner", prima_cobrada: 870000, meta_dia: 1100000, diferencia: -230000, acumulado: 22120000 },
  { fecha: "2026-02-25", gerencia: "Socios", prima_cobrada: 1100000, meta_dia: 1050000, diferencia: 50000, acumulado: 23220000 },
  { fecha: "2026-02-26", gerencia: "Diamond", prima_cobrada: 1350000, meta_dia: 1100000, diferencia: 250000, acumulado: 24570000 },
  { fecha: "2026-02-27", gerencia: "Business", prima_cobrada: 1050000, meta_dia: 1300000, diferencia: -250000, acumulado: 25620000 },
]

export default function CobranzaDiaPage() {
  const [data, setData] = useState<CobranzaDia[]>(SEED)
  useEffect(() => { document.title = "Cobranza por día | CLK BI Dashboard" }, [])

  useEffect(() => {
    ;(async () => {
      try {
        const { data: rows, error } = await supabase
          .schema("bi_dashboard")
          .from("fact_cobranza_diaria")
          .select("*")
          .order("fecha", { ascending: true })
        if (!error && rows?.length) {
          setData(rows as unknown as CobranzaDia[])
        }
      } catch { /* seed fallback */ }
    })()
  }, [])

  const metaTotal = data.reduce((s, r) => s + r.meta_dia, 0)
  const cobradoTotal = data.reduce((s, r) => s + r.prima_cobrada, 0)
  const cumplimiento = metaTotal > 0 ? Math.round((cobradoTotal / metaTotal) * 100) : 0
  const lastAcumulado = data[data.length - 1]?.acumulado ?? 0

  const chartData = data.map(r => ({
    fecha: r.fecha.slice(5),
    cobrado: Math.round(r.prima_cobrada / 1e6 * 10) / 10,
    meta: Math.round(r.meta_dia / 1e6 * 10) / 10,
  }))

  return (
    <div className="bg-[#FAFAFA] px-3 py-4">
      <div className="max-w-[1200px] mx-auto w-full">
        <PageTabs />
        <h1 className="text-sm font-bold text-[#111] font-lato mb-2 mt-2">Cobranza por día</h1>

        {/* Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 mb-3">
          <div className="bg-white rounded-lg border border-gray-200 border-l-4 border-l-[#E62800] p-2">
            <div className="text-xs text-gray-500 uppercase tracking-wider font-semibold mb-1">Meta del día</div>
            <div className="text-lg font-bold text-[#111] tabular-nums">{fmt(metaTotal / data.length)}</div>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 border-l-4 border-l-[#041224] p-2">
            <div className="text-xs text-gray-500 uppercase tracking-wider font-semibold mb-1">Cobrado hoy</div>
            <div className="text-lg font-bold text-[#059669] tabular-nums">{fmt(data[data.length - 1]?.prima_cobrada ?? 0)}</div>
          </div>
          <div className="bg-[#041224] rounded-lg p-2">
            <div className="text-xs text-white/70 uppercase tracking-wider font-semibold mb-1">Cumplimiento diario</div>
            <div className="text-lg font-bold text-white tabular-nums">{cumplimiento}%</div>
            <div className="text-xs text-white/60 mt-0.5 tabular-nums">Acumulado: {fmt(lastAcumulado)}</div>
          </div>
        </div>

        {/* Chart */}
        <div className="bg-white rounded-lg border border-gray-200 p-2 mb-3">
          <div className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">Tendencia diaria (millones)</div>
          <div style={{ width: '100%', height: 160, minWidth: 0 }}>
          <ResponsiveContainer width="100%" height={160}>
            <LineChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F0F0F0" />
              <XAxis dataKey="fecha" fontSize={10} tick={{ fill: "#666" }} />
              <YAxis fontSize={10} tick={{ fill: "#666" }} tickFormatter={v => `$${v}M`} />
              <Tooltip formatter={(v: unknown) => [`$${v}M`]} />
              <Line type="monotone" dataKey="cobrado" stroke="#111111" strokeWidth={2} dot={{ r: 3 }} name="Cobrado" />
              <Line type="monotone" dataKey="meta" stroke="#E62800" strokeWidth={2} strokeDasharray="5 5" dot={false} name="Meta" />
            </LineChart>
          </ResponsiveContainer>
          </div>
        </div>

        {/* Table */}
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-[#041224] text-white border-b-2 border-b-[#E62800]">
                <th className="text-left px-2 py-2.5 text-xs font-semibold uppercase tracking-wider">Fecha</th>
                <th className="text-left px-2 py-2.5 text-xs font-semibold uppercase tracking-wider">Gerencia</th>
                <th className="text-right px-2 py-2.5 text-xs font-semibold uppercase tracking-wider">Prima cobrada</th>
                <th className="text-right px-2 py-2.5 text-xs font-semibold uppercase tracking-wider">Meta</th>
                <th className="text-right px-2 py-2.5 text-xs font-semibold uppercase tracking-wider">Diferencia</th>
                <th className="text-right px-2 py-2.5 text-xs font-semibold uppercase tracking-wider">%</th>
                <th className="text-right px-2 py-2.5 text-xs font-semibold uppercase tracking-wider">Acumulado</th>
              </tr>
            </thead>
            <tbody>
              {data.map((r, i) => {
                const pct = r.meta_dia > 0 ? Math.round((r.prima_cobrada / r.meta_dia) * 100) : 0
                const neg = r.diferencia < 0
                return (
                  <tr key={i} className={`border-b border-[#F0F0F0] hover:bg-[#FFF5F5] ${i % 2 === 1 ? "bg-[#FAFAFA]" : ""}`}>
                    <td className="px-2 py-3 text-sm text-gray-600">{r.fecha}</td>
                    <td className="px-2 py-3 text-sm font-semibold text-[#111]">{r.gerencia}</td>
                    <td className="px-2 py-3 text-right text-sm font-medium tabular-nums">{fmt(r.prima_cobrada)}</td>
                    <td className="px-2 py-3 text-right text-sm text-gray-500 font-medium tabular-nums">{fmt(r.meta_dia)}</td>
                    <td className={`px-2 py-3 text-right text-sm font-medium tabular-nums ${neg ? "text-[#E62800]" : "text-[#059669]"}`}>
                      {neg ? `(${fmt(Math.abs(r.diferencia))})` : fmt(r.diferencia)}
                    </td>
                    <td className={`px-2 py-3 text-right text-sm font-medium tabular-nums ${pct < 100 ? "text-[#E62800]" : "text-[#059669]"}`}>{pct}%</td>
                    <td className="px-2 py-3 text-right text-sm text-gray-500 font-medium tabular-nums">{fmt(r.acumulado)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        <PageFooter />
      </div>
    </div>
  )
}
