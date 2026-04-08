"use client"

import { useState, useEffect, useMemo } from "react"

const MESES_LABELS = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
]

interface PeriodFilterProps {
  onFilterChange: (year: string, periodos: number[]) => void
  defaultYear?: string
  defaultMonth?: number
}

function acumuladoMonthsForYear(year: string): number[] {
  const selectedYear = Number(year)
  const now = new Date()
  const currentYear = now.getFullYear()
  const currentMonth = now.getMonth() + 1

  // Historical years => full year accumulated
  if (selectedYear < currentYear) {
    return Array.from({ length: 12 }, (_, i) => i + 1)
  }

  // Current/future year => accumulated to current month
  const lastMonth = Math.min(Math.max(currentMonth, 1), 12)
  return Array.from({ length: lastMonth }, (_, i) => i + 1)
}

export function PeriodFilter({ onFilterChange, defaultYear = "2026" }: PeriodFilterProps) {
  const [year, setYear] = useState(defaultYear)

  const acumuladoMonths = useMemo(() => acumuladoMonthsForYear(year), [year])

  useEffect(() => {
    onFilterChange(year, acumuladoMonths)
  }, [year, acumuladoMonths, onFilterChange])

  const acumuladoLabel = `${MESES_LABELS[acumuladoMonths[0] - 1]} - ${MESES_LABELS[acumuladoMonths[acumuladoMonths.length - 1]]}`

  return (
    <div className="flex items-center gap-1.5 md:gap-3 flex-wrap w-full md:w-auto">
      <div className="flex items-center gap-1.5 text-sm">
        <label htmlFor="pf-year" className="text-gray-500 font-medium">Año</label>
        <select
          id="pf-year"
          name="pf-year"
          value={year}
          onChange={e => setYear(e.target.value)}
          className="border border-gray-300 rounded-md px-2 py-0.5 text-sm font-medium bg-white"
        >
          <option>2026</option>
          <option>2025</option>
          <option>2024</option>
        </select>
      </div>

      <div className="flex items-center gap-1.5 text-sm">
        <label className="text-gray-500 font-medium">Periodo</label>
        <span className="border border-gray-300 rounded-md px-2 py-0.5 text-sm font-semibold bg-white text-[#041224]">
          Acumulado
        </span>
      </div>

      <span className="text-[10px] text-gray-500">
        {acumuladoLabel}
      </span>
    </div>
  )
}
