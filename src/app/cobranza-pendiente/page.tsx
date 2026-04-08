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

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    "Vencido": "bg-[#E62800] text-white",
    "Por vencer": "bg-amber-500 text-white",
    "Al día": "bg-[#059669] text-white",
  }
  return (
    <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${colors[status] || "bg-gray-200 text-gray-600"}`}>
      {status}
    </span>
  )
}

export default function CobranzaPendientePage() {
  const [data, setData] = useState<Pendiente[]>([])
  useEffect(() => { document.title = "Cobranza pendiente | CLK BI Dashboard" }, [])

  useEffect(() => {
    ;(async () => {
      const { data: rows, error } = await supabase
        .schema("bi_dashboard")
        .from("fact_cobranza_pendiente")
        .select("*")
        .order("dias_vencido", { ascending: false })

      if (error) {
        console.error("fact_cobranza_pendiente query failed", error)
        setData([])
        return
      }

      setData((rows ?? []) as unknown as Pendiente[])
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
          <div className="bg-white rounded-lg border border-gray-200 border-l-4 border-l-[#E62800] p-2">
            <div className="text-xs text-gray-500 uppercase tracking-wider font-semibold mb-1">Vencido</div>
            <div className="text-lg font-bold text-[#E62800] tabular-nums">{fmt(vencidoHoy)}</div>
            <div className="text-xs text-gray-400 mt-0.5 tabular-nums">{data.filter(r => r.status === "Vencido").length} pólizas</div>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 border-l-4 border-l-[#041224] p-2">
            <div className="text-xs text-gray-500 uppercase tracking-wider font-semibold mb-1">Por vencer esta semana</div>
            <div className="text-lg font-bold text-[#059669] tabular-nums">{fmt(porVencer)}</div>
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
                    i % 2 === 1 ? "bg-[#E5E7E9]/30" : "bg-white"
                  }`}
                >
                  <td className="px-2 py-1.5 text-xs font-semibold text-[#111]">{r.poliza}</td>
                  <td className="px-2 py-1.5 text-xs font-semibold text-gray-600">{r.cliente}</td>
                  <td className="px-2 py-1.5 text-xs font-normal text-gray-600">{r.gerencia}</td>
                  <td className="px-2 py-1.5 text-center text-xs font-medium tabular-nums">{fmt(r.prima_pendiente)}</td>
                  <td className={`px-2 py-1.5 text-center text-xs font-medium tabular-nums ${r.dias_vencido > 30 ? "text-[#E62800]" : ""}`}>
                    {r.dias_vencido}
                  </td>
                  <td className="px-2 py-3 text-center"><StatusBadge status={r.status} /></td>
                </tr>
              ))}
              <tr className="bg-[#041224] text-white">
                <td className="px-2 py-1.5 text-xs font-bold" colSpan={3}>TOTAL</td>
                <td className="px-2 py-3 text-right text-sm font-bold tabular-nums">{fmt(totalPendiente)}</td>
                <td className="px-2 py-3" colSpan={2}></td>
              </tr>
            </tbody>
          </table>
        </div>

        <PageFooter />
      </div>
    </div>
  )
}
