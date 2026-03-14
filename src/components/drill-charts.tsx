"use client"

import { useMemo } from "react"

interface DrillRow {
  name: string
  primaNeta: number
}

interface DrillChartsProps {
  rows: DrillRow[]
  levelLabel: string
  parentLabel: string
  loading: boolean
}

function fmt(v: number) {
  if (Math.abs(v) >= 1e6) return "$" + (v / 1e6).toFixed(1) + "M"
  if (Math.abs(v) >= 1e3) return "$" + (v / 1e3).toFixed(0) + "K"
  return "$" + v.toLocaleString("es-MX")
}

function fmtFull(v: number) {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(v)
}

// Brand palette — each linea de negocio has a distinct, visible color
const COLORS = ["#059669", "#1565C0", "#4FC3F7", "#FF8F00", "#9E9E9E", "#E62800", "#7E57C2", "#FFB74D", "#10B981", "#78909C", "#5C6BC0", "#8D6E63"]

// Donut chart using SVG
function DonutChart({ data, total, label }: { data: { name: string; value: number; color: string }[]; total: number; label: string }) {
  const radius = 54
  const stroke = 14
  const center = 65
  const circumference = 2 * Math.PI * radius
  let cumulativePercent = 0

  return (
    <div className="flex flex-col items-center">
      <svg width="130" height="130" viewBox="0 0 130 130">
        {/* Background circle */}
        <circle cx={center} cy={center} r={radius} fill="none" stroke="#f0f1f3" strokeWidth={stroke} />
        {/* Segments */}
        {data.map((d, i) => {
          const pct = total > 0 ? d.value / total : 0
          const dashLength = pct * circumference
          const gapLength = circumference - dashLength
          const offset = -cumulativePercent * circumference + circumference * 0.25 // start from top
          cumulativePercent += pct
          return (
            <circle
              key={i}
              cx={center}
              cy={center}
              r={radius}
              fill="none"
              stroke={d.color}
              strokeWidth={stroke}
              strokeDasharray={`${dashLength} ${gapLength}`}
              strokeDashoffset={offset}
              strokeLinecap="butt"
              style={{ transition: "stroke-dasharray 0.6s ease, stroke-dashoffset 0.6s ease" }}
            />
          )
        })}
        {/* Center text */}
        <text x={center} y={center - 6} textAnchor="middle" className="text-[11px] font-semibold" fill="#052F5F">{fmt(total)}</text>
        <text x={center} y={center + 10} textAnchor="middle" className="text-[9px]" fill="#9ca3af">Total</text>
      </svg>
      <span className="text-[11px] font-medium text-[#052F5F] mt-1">{label}</span>
    </div>
  )
}

// Horizontal bar chart
function HBarChart({ data, maxValue }: { data: { name: string; value: number; pct: number; color: string }[]; maxValue: number }) {
  return (
    <div className="flex flex-col gap-1.5 w-full">
      {data.map((d, i) => (
        <div key={i} className="flex items-center gap-2 group">
          <div className="w-[140px] text-[11px] text-gray-700 truncate text-right flex-shrink-0" title={d.name}>
            {d.name}
          </div>
          <div className="flex-1 h-[22px] bg-gray-100 rounded overflow-hidden relative">
            <div
              className="h-full rounded transition-all duration-700 ease-out flex items-center"
              style={{
                width: maxValue > 0 ? `${Math.max((d.value / maxValue) * 100, 2)}%` : "2%",
                backgroundColor: d.color,
              }}
            >
              {d.pct >= 8 && (
                <span className="text-[10px] text-white font-semibold px-2 whitespace-nowrap">
                  {fmt(d.value)}
                </span>
              )}
            </div>
            {d.pct < 8 && (
              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-gray-500 font-medium">
                {fmt(d.value)}
              </span>
            )}
          </div>
          <div className="w-[42px] text-right text-[11px] font-semibold flex-shrink-0" style={{ color: d.color }}>
            {d.pct.toFixed(1)}%
          </div>
        </div>
      ))}
    </div>
  )
}

// Percentage badges grid
function PctGrid({ data }: { data: { name: string; pct: number; value: number; color: string }[] }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
      {data.map((d, i) => (
        <div
          key={i}
          className="bg-white rounded-lg border border-gray-100 px-3 py-2.5 flex flex-col items-center transition-all duration-300 hover:shadow-md hover:border-gray-200"
          style={{ borderLeftColor: d.color, borderLeftWidth: 3 }}
        >
          <span className="text-[20px] font-bold tabular-nums" style={{ color: d.color }}>
            {d.pct.toFixed(1)}%
          </span>
          <span className="text-[10px] text-gray-400 mt-0.5 text-center leading-tight truncate w-full" title={d.name}>
            {d.name}
          </span>
          <span className="text-[11px] font-medium text-gray-600 mt-0.5">{fmt(d.value)}</span>
        </div>
      ))}
    </div>
  )
}

export function DrillCharts({ rows, levelLabel, loading }: DrillChartsProps) {
  const chartData = useMemo(() => {
    if (!rows.length) return { items: [], total: 0, maxValue: 0 }
    // Filter out zero values
    const nonZeroRows = rows.filter(r => Math.abs(r.primaNeta) > 0)
    if (!nonZeroRows.length) return { items: [], total: 0, maxValue: 0 }

    const total = nonZeroRows.reduce((s, r) => s + Math.abs(r.primaNeta), 0)

    // Sort by value descending and take top 9 (Abraham: "1,2,3,4,5,6,7,8,9 y el décimo que sea otros")
    const sorted = [...nonZeroRows].sort((a, b) => Math.abs(b.primaNeta) - Math.abs(a.primaNeta))
    const top9 = sorted.slice(0, 9)
    const rest = sorted.slice(9)

    let items = top9.map((r, i) => ({
      name: r.name,
      value: Math.abs(r.primaNeta),
      pct: total > 0 ? (Math.abs(r.primaNeta) / total) * 100 : 0,
      color: COLORS[i % COLORS.length],
    }))

    // Group rest as 'Otros' if there are more than 9 items
    if (rest.length > 0) {
      const othersValue = rest.reduce((s, r) => s + Math.abs(r.primaNeta), 0)
      items.push({
        name: "Otros",
        value: othersValue,
        pct: total > 0 ? (othersValue / total) * 100 : 0,
        color: "#9CA3AF",
      })
    }

    const maxValue = Math.max(...items.map(i => i.value))
    return { items, total, maxValue }
  }, [rows])

  if (loading) {
    return (
      <div className="mt-3 bg-white rounded-lg border border-gray-200 shadow-sm p-6">
        <div className="flex items-center justify-center gap-2 text-gray-400 py-8">
          <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <span className="text-sm">Cargando visualización...</span>
        </div>
      </div>
    )
  }

  if (!rows.length) {
    return (
      <div className="mt-3 bg-white rounded-lg border border-gray-200 shadow-sm p-6">
        <div className="text-center text-gray-400 py-6">
          <p className="text-sm">Selecciona una categoría para ver la distribución gráfica</p>
        </div>
      </div>
    )
  }

  const { items, total, maxValue } = chartData
  // Top 5 for donut (rest grouped as "Otros")
  const donutData = items.length <= 6 ? items : [
    ...items.slice(0, 5),
    { name: "Otros", value: items.slice(5).reduce((s, d) => s + d.value, 0), pct: items.slice(5).reduce((s, d) => s + d.pct, 0), color: "#9CA3AF" }
  ]

  // Don't render chart if no valid data
  if (items.length === 0) {
    return null
  }

  return (
    <div className="mt-3 bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden" style={{ animation: "fadeSlideIn 0.4s ease" }}>
      {/* Header */}
      <div className="px-3 md:px-4 py-2 md:py-2.5 border-b border-gray-100 flex flex-col md:flex-row md:items-center md:justify-between gap-1 md:gap-0" style={{ backgroundColor: "#f8fafc" }}>
        <div className="flex items-center gap-2">
          <span className="text-xs md:text-sm font-semibold text-[#052F5F]">Distribución por {levelLabel}</span>
        </div>
        <span className="text-[10px] md:text-xs text-gray-400">{items.length} registros · Total: {fmtFull(total)}</span>
      </div>

      {/* ═══ MOBILE: compact donut + inline legend with values ═══ */}
      <div className="md:hidden p-3">
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0">
            <DonutChart
              data={donutData.map(d => ({ name: d.name, value: d.value, color: d.color }))}
              total={total}
              label="Prima neta"
            />
          </div>
          {/* Integrated legend with values — replaces bars + pct grid */}
          <div className="flex-1 min-w-0 flex flex-col gap-1.5 pt-1">
            {donutData.slice(0, 6).map((d, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: d.color }} />
                <span className="text-[11px] text-gray-700 truncate flex-1" title={d.name}>{d.name}</span>
                <span className="text-[11px] font-bold text-gray-900 flex-shrink-0">{fmt(d.value)}</span>
                <span className="text-[10px] font-semibold flex-shrink-0 w-10 text-right" style={{ color: d.color }}>{d.pct.toFixed(1)}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ═══ DESKTOP: full donut + bars + pct grid ═══ */}
      <div className="hidden md:block p-4">
        <div className="flex gap-6 items-start">
          {/* Left: Donut */}
          <div className="flex-shrink-0">
            <DonutChart
              data={donutData.map(d => ({ name: d.name, value: d.value, color: d.color }))}
              total={total}
              label="Prima neta"
            />
            {/* Legend */}
            <div className="mt-2 flex flex-col gap-1">
              {donutData.slice(0, 6).map((d, i) => (
                <div key={i} className="flex items-center gap-1.5 text-[10px]">
                  <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: d.color }} />
                  <span className="text-gray-600 truncate max-w-[110px]" title={d.name}>{d.name}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Right: Horizontal bars only */}
          <div className="flex-1 min-w-0">
            <HBarChart data={items} maxValue={maxValue} />
          </div>
        </div>
      </div>
    </div>
  )
}
