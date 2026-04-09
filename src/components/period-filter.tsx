"use client"

import { useState, useEffect, useMemo, useRef } from "react"
import { ChevronDown, X } from "lucide-react"

const MESES_LABELS = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
]

const ALL_MONTHS = Array.from({ length: 12 }, (_, i) => i + 1)

interface PeriodFilterProps {
  onFilterChange: (year: string, periodos: number[]) => void
  defaultYear?: string
  defaultMonth?: number
}

const CURRENT_YEAR = new Date().getFullYear()

function buildYearOptions(defaultYear?: string): string[] {
  const baseYears = [CURRENT_YEAR, CURRENT_YEAR - 1, CURRENT_YEAR - 2].map(String)
  if (!defaultYear) return baseYears
  if (baseYears.includes(defaultYear)) return baseYears
  return [defaultYear, ...baseYears].sort((a, b) => Number(b) - Number(a))
}

function monthsRange(lastMonth: number): number[] {
  const safeLast = Math.min(Math.max(lastMonth, 1), 12)
  return Array.from({ length: safeLast }, (_, i) => i + 1)
}

function availableMonthsForYear(year: string): number[] {
  const selectedYear = Number(year)
  const currentDate = new Date()
  const currentYear = currentDate.getFullYear()
  const currentMonth = currentDate.getMonth() + 1

  if (selectedYear < currentYear) {
    return ALL_MONTHS
  }

  if (selectedYear === currentYear) {
    return monthsRange(currentMonth)
  }

  // Future years: no months available yet
  return []
}

export function PeriodFilter({ onFilterChange, defaultYear, defaultMonth }: PeriodFilterProps) {
  const yearOptions = useMemo(() => buildYearOptions(defaultYear), [defaultYear])
  const resolvedDefaultYear = defaultYear || yearOptions[0] || String(CURRENT_YEAR)

  const [year, setYear] = useState(resolvedDefaultYear)
  const [isMonthMenuOpen, setIsMonthMenuOpen] = useState(false)

  // Keep prop for backward compatibility; current behavior ignores defaultMonth by request
  void defaultMonth

  const initialMonths = useMemo(() => availableMonthsForYear(resolvedDefaultYear), [resolvedDefaultYear])

  const [selectedMonths, setSelectedMonths] = useState<number[]>(initialMonths)

  const wrapperRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const sortedMonths = [...selectedMonths].sort((a, b) => a - b)
    onFilterChange(year, sortedMonths)
  }, [year, selectedMonths, onFilterChange])

  useEffect(() => {
    const onDocumentClick = (event: MouseEvent) => {
      if (!wrapperRef.current) return
      if (wrapperRef.current.contains(event.target as Node)) return
      setIsMonthMenuOpen(false)
    }

    document.addEventListener("mousedown", onDocumentClick)
    return () => document.removeEventListener("mousedown", onDocumentClick)
  }, [])

  const availableMonths = useMemo(() => availableMonthsForYear(year), [year])

  const resetMonthsForYear = (targetYear: string) => availableMonthsForYear(targetYear)

  const handleYearChange = (nextYear: string) => {
    setYear(nextYear)
    setSelectedMonths(resetMonthsForYear(nextYear))
  }

  const toggleMonth = (month: number) => {
    if (!availableMonths.includes(month)) return

    setSelectedMonths(prev => {
      const exists = prev.includes(month)
      const next = exists
        ? prev.filter(m => m !== month)
        : [...prev, month]

      return next.sort((a, b) => a - b)
    })
  }

  const allSelected = availableMonths.length > 0 && selectedMonths.length === availableMonths.length

  const toggleSelectAll = () => {
    setSelectedMonths(prev => (prev.length === availableMonths.length ? [] : [...availableMonths]))
  }

  const clearFilters = () => {
    // Clear only month selection and keep the currently selected year
    setSelectedMonths([])
    setIsMonthMenuOpen(false)
  }

  const selectedSummary = useMemo(() => {
    const sorted = [...selectedMonths].sort((a, b) => a - b)

    if (sorted.length === 0) return "Sin meses seleccionados"
    if (availableMonths.length > 0 && sorted.length === availableMonths.length) return "Todos los meses"
    if (sorted.length === 1) return MESES_LABELS[sorted[0] - 1]

    const first = MESES_LABELS[sorted[0] - 1]
    const last = MESES_LABELS[sorted[sorted.length - 1] - 1]
    return `${sorted.length} meses (${first} - ${last})`
  }, [selectedMonths, availableMonths])

  return (
    <div ref={wrapperRef} className="flex items-center gap-1.5 md:gap-3 flex-wrap w-full md:w-auto">
      <div className="flex items-center gap-1.5 text-sm">
        <label htmlFor="pf-year" className="text-gray-500 font-medium">Año</label>
        <select
          id="pf-year"
          name="pf-year"
          value={year}
          onChange={e => handleYearChange(e.target.value)}
          className="border border-gray-300 rounded-md px-2 py-0.5 text-sm font-medium bg-white"
        >
          {yearOptions.map((optionYear) => (
            <option key={optionYear} value={optionYear}>{optionYear}</option>
          ))}
        </select>
      </div>

      <div className="relative flex items-center gap-1.5 text-sm w-full md:w-auto">
        <label className="text-gray-500 font-medium">Mes</label>

        <button
          type="button"
          onClick={() => setIsMonthMenuOpen(open => !open)}
          className="inline-flex items-center justify-between gap-2 border border-gray-300 rounded-md px-2 py-0.5 text-sm font-semibold bg-white text-[#041224] min-w-[170px]"
        >
          <span className="truncate">{selectedSummary}</span>
          <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isMonthMenuOpen ? "rotate-180" : ""}`} />
        </button>

        {isMonthMenuOpen && (
          <div className="absolute z-50 top-full mt-1 left-0 md:left-auto md:right-0 w-full md:w-[240px] bg-white border border-gray-200 rounded-md shadow-lg p-2">
            <button
              type="button"
              onClick={toggleSelectAll}
              disabled={availableMonths.length === 0}
              className="w-full text-left px-2 py-1.5 rounded hover:bg-gray-50 text-sm font-semibold text-[#041224] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <input
                type="checkbox"
                readOnly
                checked={allSelected}
                className="mr-2 align-middle"
              />
              Seleccionar todo
            </button>

            <div className="h-px bg-gray-100 my-1" />

            <div className="max-h-56 overflow-y-auto">
              {availableMonths.length === 0 && (
                <p className="px-2 py-1.5 text-xs text-gray-400">No hay meses disponibles para este año.</p>
              )}

              {availableMonths.map((monthNumber) => {
                const mes = MESES_LABELS[monthNumber - 1]
                const checked = selectedMonths.includes(monthNumber)

                return (
                  <button
                    key={mes}
                    type="button"
                    onClick={() => toggleMonth(monthNumber)}
                    className="w-full text-left px-2 py-1.5 rounded hover:bg-gray-50 text-sm text-[#041224]"
                  >
                    <input
                      type="checkbox"
                      readOnly
                      checked={checked}
                      className="mr-2 align-middle"
                    />
                    {mes}
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={clearFilters}
        className="inline-flex items-center gap-1 border border-gray-300 rounded-md px-2 py-0.5 text-xs md:text-sm font-medium bg-white text-gray-700 hover:bg-gray-50"
      >
        <X className="w-3.5 h-3.5" />
        Limpiar filtros
      </button>
    </div>
  )
}
