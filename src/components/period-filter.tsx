"use client"

import { useState, useEffect } from "react"

const MESES_LABELS = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
]

const TRIMESTRES = [
  { label: "Q1 (Ene-Mar)", months: [1, 2, 3] },
  { label: "Q2 (Abr-Jun)", months: [4, 5, 6] },
  { label: "Q3 (Jul-Sep)", months: [7, 8, 9] },
  { label: "Q4 (Oct-Dic)", months: [10, 11, 12] },
]

const SEMESTRES = [
  { label: "S1 (Ene-Jun)", months: [1, 2, 3, 4, 5, 6] },
  { label: "S2 (Jul-Dic)", months: [7, 8, 9, 10, 11, 12] },
]

type PeriodoType = "mes" | "trimestre" | "semestre" | "acumulado"

interface PeriodFilterProps {
  onFilterChange: (year: string, periodos: number[]) => void
  defaultYear?: string
  defaultMonth?: number
}

export function PeriodFilter({ onFilterChange, defaultYear = "2026", defaultMonth = 2 }: PeriodFilterProps) {
  const [year, setYear] = useState(defaultYear)
  const [periodoType, setPeriodoType] = useState<PeriodoType>("mes")
  const [selectedMonths, setSelectedMonths] = useState<number[]>([defaultMonth])
  const [selectedTrimestre, setSelectedTrimestre] = useState(0)
  const [selectedSemestre, setSelectedSemestre] = useState(0)

  useEffect(() => {
    let periodos: number[] = []
    if (periodoType === "mes") {
      periodos = selectedMonths
    } else if (periodoType === "trimestre") {
      periodos = TRIMESTRES[selectedTrimestre].months
    } else if (periodoType === "semestre") {
      periodos = SEMESTRES[selectedSemestre].months
    } else {
      // Acumulado = all months up to current
      const currentMonth = new Date().getMonth() + 1
      periodos = Array.from({ length: currentMonth }, (_, i) => i + 1)
    }
    onFilterChange(year, periodos)
  }, [year, periodoType, selectedMonths, selectedTrimestre, selectedSemestre])

  const toggleMonth = (m: number) => {
    setSelectedMonths(prev => {
      if (prev.includes(m)) {
        return prev.length > 1 ? prev.filter(x => x !== m) : prev
      }
      return [...prev, m].sort((a, b) => a - b)
    })
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <div className="flex items-center gap-1 text-xs">
        <label htmlFor="pf-year" className="text-gray-500 font-medium">Año</label>
        <select id="pf-year" name="pf-year" value={year} onChange={e => setYear(e.target.value)} className="border border-[#E5E7EB] rounded px-1.5 py-0.5 text-xs bg-white">
          <option>2026</option><option>2025</option><option>2024</option>
        </select>
      </div>

      <div className="flex items-center gap-1 text-xs">
        <label htmlFor="pf-tipo" className="text-gray-500 font-medium">Periodo</label>
        <select
          id="pf-tipo"
          name="pf-tipo"
          value={periodoType}
          onChange={e => setPeriodoType(e.target.value as PeriodoType)}
          className="border border-[#E5E7EB] rounded px-1.5 py-0.5 text-xs bg-white"
        >
          <option value="mes">Mes</option>
          <option value="trimestre">Trimestre</option>
          <option value="semestre">Semestre</option>
          <option value="acumulado">Acumulado</option>
        </select>
      </div>

      {periodoType === "mes" && (
        <div className="flex items-center gap-1 text-xs">
          <label htmlFor="pf-mes" className="text-gray-500 font-medium">Mes</label>
          <select
            id="pf-mes"
            name="pf-mes"
            value={selectedMonths[0]}
            onChange={e => setSelectedMonths([Number(e.target.value)])}
            className="border border-[#E5E7EB] rounded px-1.5 py-0.5 text-xs bg-white"
          >
            {MESES_LABELS.map((m, i) => (
              <option key={m} value={i + 1}>{m}</option>
            ))}
          </select>
        </div>
      )}

      {periodoType === "trimestre" && (
        <div className="flex items-center gap-1">
          {TRIMESTRES.map((t, i) => (
            <button
              key={t.label}
              onClick={() => setSelectedTrimestre(i)}
              className={`px-2 py-0.5 text-[10px] rounded border transition-colors ${
                selectedTrimestre === i
                  ? "bg-[#041224] text-white border-[#041224]"
                  : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"
              }`}
            >
              Q{i + 1}
            </button>
          ))}
        </div>
      )}

      {periodoType === "semestre" && (
        <div className="flex items-center gap-1">
          {SEMESTRES.map((s, i) => (
            <button
              key={s.label}
              onClick={() => setSelectedSemestre(i)}
              className={`px-2 py-0.5 text-[10px] rounded border transition-colors ${
                selectedSemestre === i
                  ? "bg-[#041224] text-white border-[#041224]"
                  : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"
              }`}
            >
              S{i + 1}
            </button>
          ))}
        </div>
      )}

      {periodoType === "acumulado" && (
        <span className="text-[10px] text-gray-500">Acumulado al periodo actual vs año anterior</span>
      )}
    </div>
  )
}
