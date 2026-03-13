"use client"

import { useState, useEffect } from "react"
import { PageTabs } from "@/components/page-tabs"
import { PageFooter } from "@/components/page-footer"
import { supabase } from "@/lib/supabase"

function fmt(v: number) {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(v)
}

interface Pendiente {
  poliza: string
  cliente: string
  gerencia: string
  prima_pendiente: number
  dias_vencido: number
  status: string
  fecha_vencimiento: string
}

const SEED: Pendiente[] = [
  { poliza: "POL-2026-0142", cliente: "García López María", gerencia: "Diamond", prima_pendiente: 45200, dias_vencido: 45, status: "Vencido", fecha_vencimiento: "2026-01-13" },
  { poliza: "POL-2026-0187", cliente: "Hernández Ruiz Juan", gerencia: "Business", prima_pendiente: 128500, dias_vencido: 32, status: "Vencido", fecha_vencimiento: "2026-01-26" },
  { poliza: "POL-2026-0213", cliente: "Martínez Sánchez Ana", gerencia: "Partner", prima_pendiente: 67800, dias_vencido: 15, status: "Por vencer", fecha_vencimiento: "2026-02-12" },
  { poliza: "POL-2026-0298", cliente: "López Torres Pedro", gerencia: "Diamond", prima_pendiente: 234100, dias_vencido: 8, status: "Por vencer", fecha_vencimiento: "2026-02-19" },
  { poliza: "POL-2026-0334", cliente: "Ramírez Flores Isabel", gerencia: "Socios", prima_pendiente: 89300, dias_vencido: 0, status: "Al día", fecha_vencimiento: "2026-02-27" },
  { poliza: "POL-2026-0356", cliente: "González Díaz Roberto", gerencia: "Business", prima_pendiente: 156700, dias_vencido: 52, status: "Vencido", fecha_vencimiento: "2026-01-06" },
  { poliza: "POL-2026-0401", cliente: "Fernández Mora Lucía", gerencia: "Partner", prima_pendiente: 42100, dias_vencido: 3, status: "Al día", fecha_vencimiento: "2026-02-24" },
  { poliza: "POL-2026-0445", cliente: "Castillo Reyes David", gerencia: "Diamond", prima_pendiente: 310800, dias_vencido: 28, status: "Por vencer", fecha_vencimiento: "2026-01-30" },
]

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    "Vencido": "bg-[#C00000] text-white",
    "Por vencer": "bg-[#E8735A] text-white",
    "Al día": "bg-[#041224] text-white",
  }
  return (
    <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${colors[status] || "bg-gray-200 text-gray-600"}`}>
      {status}
    </span>
  )
}

export default function CobranzaPendientePage() {
  const [data, setData] = useState<Pendiente[]>(SEED)
  useEffect(() => { document.title = "Cobranza pendiente | CLK BI Dashboard" }, [])

  useEffect(() => {
    ;(async () => {
      try {
        const { data: rows, error } = await supabase
          .schema("bi_dashboard")
          .from("fact_cobranza_pendiente")
          .select("*")
          .order("dias_vencido", { ascending: false })
        if (!error && rows?.length) {
          setData(rows as unknown as Pendiente[])
        }
      } catch { /* seed fallback */ }
    })()
  }, [])

  const totalPendiente = data.reduce((s, r) => s + r.prima_pendiente, 0)
  const vencidoHoy = data.filter(r => r.status === "Vencido").reduce((s, r) => s + r.prima_pendiente, 0)
  const porVencer = data.filter(r => r.status === "Por vencer").reduce((s, r) => s + r.prima_pendiente, 0)

  return (
    <div className="bg-[#FAFAFA] px-3 py-4">
      <div className="max-w-[1200px] mx-auto w-full">
        <PageTabs />
        <h1 className="text-sm font-bold text-[#111] font-lato mb-2 mt-2">Cobranza pendiente</h1>

        {/* Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 mb-3">
          <div className="bg-white rounded-lg border border-gray-200 border-l-4 border-l-[#E62800] p-2">
            <div className="text-xs text-gray-500 uppercase tracking-wider font-semibold mb-1">Total pendiente</div>
            <div className="text-lg font-bold text-[#E62800] tabular-nums">{fmt(totalPendiente)}</div>
            <div className="text-xs text-gray-400 mt-0.5 tabular-nums">{data.length} pólizas</div>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 border-l-4 border-l-[#E8735A] p-2">
            <div className="text-xs text-gray-500 uppercase tracking-wider font-semibold mb-1">Vencido</div>
            <div className="text-lg font-bold text-[#E8735A] tabular-nums">{fmt(vencidoHoy)}</div>
            <div className="text-xs text-gray-400 mt-0.5 tabular-nums">{data.filter(r => r.status === "Vencido").length} pólizas</div>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 border-l-4 border-l-[#041224] p-2">
            <div className="text-xs text-gray-500 uppercase tracking-wider font-semibold mb-1">Por vencer esta semana</div>
            <div className="text-lg font-bold text-[#166534] tabular-nums">{fmt(porVencer)}</div>
            <div className="text-xs text-gray-400 mt-0.5 tabular-nums">{data.filter(r => r.status === "Por vencer").length} pólizas</div>
          </div>
        </div>

        {/* Table */}
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-[#041224] text-white border-b-2 border-b-[#E62800]">
                <th className="text-left px-2 py-1.5 text-xs font-semibold uppercase tracking-wider">Póliza</th>
                <th className="text-left px-2 py-1.5 text-xs font-semibold uppercase tracking-wider">Cliente</th>
                <th className="text-left px-2 py-1.5 text-xs font-semibold uppercase tracking-wider">Gerencia</th>
                <th className="text-right px-2 py-1.5 text-xs font-semibold uppercase tracking-wider">Prima pendiente</th>
                <th className="text-right px-2 py-1.5 text-xs font-semibold uppercase tracking-wider">Días vencido</th>
                <th className="text-center px-2 py-1.5 text-xs font-semibold uppercase tracking-wider">Status</th>
              </tr>
            </thead>
            <tbody>
              {data.map((r, i) => (
                <tr
                  key={i}
                  className={`border-b border-[#F0F0F0] hover:bg-[#FFF5F5] transition-colors ${
                    i % 2 === 1 ? "bg-[#FAFBFC]" : "bg-white"
                  }`}
                >
                  <td className="px-2 py-1.5 text-xs font-normal text-[#111]">{r.poliza}</td>
                  <td className="px-2 py-1.5 text-xs font-normal text-gray-600">{r.cliente}</td>
                  <td className="px-2 py-1.5 text-xs font-normal text-gray-600">{r.gerencia}</td>
                  <td className="px-2 py-1.5 text-center text-xs font-normal tabular-nums">{fmt(r.prima_pendiente)}</td>
                  <td className={`px-2 py-1.5 text-center text-xs font-normal tabular-nums ${r.dias_vencido > 30 ? "text-[#E62800]" : ""}`}>
                    {r.dias_vencido}
                  </td>
                  <td className="px-2 py-1.5 text-center"><StatusBadge status={r.status} /></td>
                </tr>
              ))}
              <tr className="bg-[#041224] text-white">
                <td className="px-2 py-1.5 text-xs font-bold" colSpan={3}>TOTAL</td>
                <td className="px-2 py-1.5 text-right text-xs font-bold tabular-nums">{fmt(totalPendiente)}</td>
                <td className="px-2 py-1.5" colSpan={2}></td>
              </tr>
            </tbody>
          </table>
        </div>

        <PageFooter />
      </div>
    </div>
  )
}
