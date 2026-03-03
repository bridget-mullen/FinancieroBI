"use client"

import { PieChart, Pie, Cell } from "recharts"
import Link from "next/link"

interface GaugeProps {
  value: number
  prevYear?: number
  budget?: number
  clickable?: boolean
}

// 10 color segments for the gauge arc
const COLORS = [
  "#1B8A2D", "#2DA83E", "#6BBF1A", "#C5D900", "#F5D000",
  "#F5A623", "#F57C00", "#E64A19", "#D32F2F", "#B71C1C",
]

export function Gauge({ value, clickable = true }: GaugeProps) {
  const W = 500, H = 260
  const cxVal = W / 2, cyVal = H  // cy at BOTTOM of container

  // 10 equal segments for the colored arc
  const segData = COLORS.map((_, i) => ({ name: `seg${i}`, value: 1 }))

  // Needle at 75% hardcoded
  const NEEDLE_PCT = 0.75
  // 75% of 180° sweep from startAngle=180 to endAngle=0
  // 180° - (0.75 * 180°) = 45° → that's the angle in degrees
  const needleAngleDeg = 180 - NEEDLE_PCT * 180 // = 45°
  const needleAngleRad = (needleAngleDeg * Math.PI) / 180
  const needleLen = 175
  const tipX = cxVal + needleLen * Math.cos(needleAngleRad)
  const tipY = cyVal - needleLen * Math.sin(needleAngleRad)
  const bw = 9
  const b1x = cxVal + bw * Math.cos(needleAngleRad + Math.PI / 2)
  const b1y = cyVal - bw * Math.sin(needleAngleRad + Math.PI / 2)
  const b2x = cxVal + bw * Math.cos(needleAngleRad - Math.PI / 2)
  const b2y = cyVal - bw * Math.sin(needleAngleRad - Math.PI / 2)

  // Scale labels
  const min = 80, max = 150, range = max - min
  const scaleCount = 8
  const labelR = 215
  const labels = Array.from({ length: scaleCount + 1 }, (_, i) => {
    const pct = i / scaleCount
    const angleDeg = 180 - pct * 180
    const angleRad = (angleDeg * Math.PI) / 180
    return {
      val: min + range * pct,
      x: cxVal + labelR * Math.cos(angleRad),
      y: cyVal - labelR * Math.sin(angleRad),
    }
  })

  const content = (
    <div style={{ width: "100%", position: "relative" }}>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: "block", overflow: "hidden" }}>
        {/* Grey outer border arc */}
        <path
          d={`M ${cxVal - 205} ${cyVal} A 205 205 0 0 1 ${cxVal + 205} ${cyVal}`}
          fill="none" stroke="#6B6B6B" strokeWidth={8}
        />

        {/* Recharts PieChart rendered as foreignObject won't work, so use Pie SVG directly */}
        {/* Actually embed the PieChart inline */}
      </svg>

      {/* Recharts overlay — exact same dimensions */}
      <div style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%" }}>
        <PieChart width={W} height={H} style={{ position: "absolute", top: 0, left: 0 }}>
          <Pie
            data={segData}
            cx={cxVal}
            cy={cyVal}
            startAngle={180}
            endAngle={0}
            innerRadius={145}
            outerRadius={195}
            paddingAngle={2}
            dataKey="value"
            stroke="none"
            isAnimationActive={false}
          >
            {COLORS.map((color, i) => (
              <Cell key={i} fill={color} />
            ))}
          </Pie>
        </PieChart>
      </div>

      {/* SVG overlay for needle, hub, labels */}
      <svg
        viewBox={`0 0 ${W} ${H}`}
        style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", pointerEvents: "none" }}
      >
        {/* Grey outer border */}
        <path
          d={`M ${cxVal - 203} ${cyVal} A 203 203 0 0 1 ${cxVal + 203} ${cyVal}`}
          fill="none" stroke="#6B6B6B" strokeWidth={7}
        />

        {/* Scale labels */}
        {labels.map(({ val, x, y }) => (
          <text key={val} x={x} y={y} fontSize="11" fill="#4B5563"
            textAnchor="middle" dominantBaseline="middle" fontWeight="600"
            fontFamily="Calibri, sans-serif">
            ${val.toFixed(0)}M
          </text>
        ))}

        {/* Needle — hardcoded 75% */}
        <polygon
          points={`${tipX},${tipY} ${b1x},${b1y} ${b2x},${b2y}`}
          fill="#2D2D2D" stroke="#1a1a1a" strokeWidth={1}
        />

        {/* Center hub */}
        <circle cx={cxVal} cy={cyVal} r={24} fill="#F5F5F5" stroke="#BDBDBD" strokeWidth={3} />
        <circle cx={cxVal} cy={cyVal} r={14} fill="#E0E0E0" stroke="#9E9E9E" strokeWidth={2} />
        <circle cx={cxVal} cy={cyVal} r={6} fill="#757575" />

        {/* LOW / CRITICAL */}
        <text x={cxVal - 210} y={cyVal + 18} fontSize="13" fill="#1B8A2D"
          textAnchor="middle" fontWeight="900" fontFamily="Calibri, sans-serif" letterSpacing="2">LOW</text>
        <text x={cxVal + 215} y={cyVal + 18} fontSize="13" fill="#B71C1C"
          textAnchor="middle" fontWeight="900" fontFamily="Calibri, sans-serif" letterSpacing="1">CRITICAL</text>

        {/* Value */}
        <text x={cxVal} y={cyVal + 40} fontSize="36" fontWeight="900" fill="#111827"
          textAnchor="middle" fontFamily="Calibri, sans-serif">${value.toFixed(1)}M</text>
        <text x={cxVal} y={cyVal + 58} fontSize="12" fill="#6B7280"
          textAnchor="middle" fontFamily="Calibri, sans-serif" fontWeight="500">Prima neta cobrada</text>
      </svg>
    </div>
  )

  if (clickable) return <Link href="/tabla-detalle" className="block">{content}</Link>
  return content
}
