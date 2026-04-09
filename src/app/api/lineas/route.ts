import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import { NextRequest, NextResponse } from "next/server"

function cleanEnv(value?: string): string {
  return (value || "").replace(/\\n/g, "").trim()
}

function toNumber(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0
  if (typeof value === "string") {
    const trimmed = value.trim()
    if (!trimmed) return 0

    // Keep digits, sign, separators. Handle formats like:
    // "$ 17,545.167", "-$ 5,668.322", "1,234", "1234.56"
    let normalized = trimmed.replace(/[^\d,.-]/g, "")
    if (!normalized || normalized === "-" || normalized === ".") return 0

    const hasComma = normalized.includes(",")
    const hasDot = normalized.includes(".")

    if (hasComma && hasDot) {
      // Assume comma is thousands separator
      normalized = normalized.replace(/,/g, "")
    } else if (hasComma && !hasDot) {
      // Assume decimal comma
      normalized = normalized.replace(/,/g, ".")
    }

    const parsed = Number.parseFloat(normalized)
    return Number.isFinite(parsed) ? parsed : 0
  }
  return 0
}

function monthFromPeriodo(periodo: unknown): number | null {
  const n = Math.trunc(toNumber(periodo))
  if (!Number.isFinite(n) || n <= 0) return null

  // Handles 1..12 or YYYYMM
  if (n >= 1 && n <= 12) return n
  if (n >= 190001) {
    const m = n % 100
    if (m >= 1 && m <= 12) return m
  }

  return null
}

function monthFromFecha(fecha: unknown): number | null {
  if (typeof fecha !== "string" || !fecha.trim()) return null

  // ISO: YYYY-MM-DD...
  const iso = fecha.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) {
    const m = Number.parseInt(iso[2], 10)
    return m >= 1 && m <= 12 ? m : null
  }

  // Fallback using Date parsing
  const dt = new Date(fecha)
  if (Number.isFinite(dt.getTime())) {
    const m = dt.getMonth() + 1
    return m >= 1 && m <= 12 ? m : null
  }

  return null
}

function lineaName(row: Record<string, unknown>): string {
  const raw = row.LBussinesNombre
  const value = typeof raw === "string" ? raw.trim() : ""
  return value || "Sin línea"
}

function isTableMissing(message: string): boolean {
  return (
    message.includes("PGRST205") ||
    message.includes("Could not find the table") ||
    message.includes("relation")
  )
}

async function accumulateEfectuada(
  supabase: SupabaseClient,
  tableName: string,
  meses: number[],
  target: Map<string, number>
): Promise<boolean> {
  const PAGE_SIZE = 5000

  for (let from = 0; from < 1_000_000; from += PAGE_SIZE) {
    let query = supabase
      .from(tableName)
      .select("LBussinesNombre, PrimaNeta, Descuento, TCPago, Periodo")
      .order("IDDocto", { ascending: true })
      .range(from, from + PAGE_SIZE - 1)

    if (meses.length > 0) {
      query = query.in("Periodo", meses)
    }

    const { data, error } = await query

    if (error) {
      if (isTableMissing(error.message)) return false
      throw new Error(`${tableName} error: ${error.message}`)
    }

    const rows = (data || []) as Record<string, unknown>[]
    if (rows.length === 0) return true

    for (const row of rows) {
      const linea = lineaName(row)
      const prima = toNumber(row.PrimaNeta)
      const descuento = toNumber(row.Descuento)
      const tc = toNumber(row.TCPago) || 1
      const primaOficial = (prima - descuento) * tc

      target.set(linea, (target.get(linea) || 0) + primaOficial)
    }

    if (rows.length < PAGE_SIZE) return true
  }

  return true
}

async function accumulatePresupuesto(
  supabase: SupabaseClient,
  tableName: string,
  meses: number[],
  target: Map<string, number>
): Promise<boolean> {
  const PAGE_SIZE = 5000

  for (let from = 0; from < 1_000_000; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from(tableName)
      .select("LBussinesNombre, Presupuesto, Fecha")
      .order("Fecha", { ascending: true })
      .range(from, from + PAGE_SIZE - 1)

    if (error) {
      if (isTableMissing(error.message)) return false
      throw new Error(`${tableName} error: ${error.message}`)
    }

    const rows = (data || []) as Record<string, unknown>[]
    if (rows.length === 0) return true

    for (const row of rows) {
      const month = monthFromFecha(row.Fecha)
      if (meses.length > 0 && month !== null && !meses.includes(month)) continue

      const linea = lineaName(row)
      const presupuesto = toNumber(row.Presupuesto)
      target.set(linea, (target.get(linea) || 0) + presupuesto)
    }

    if (rows.length < PAGE_SIZE) return true
  }

  return true
}

async function accumulatePendiente(
  supabase: SupabaseClient,
  meses: number[],
  target: Map<string, number>
): Promise<boolean> {
  const PAGE_SIZE = 5000

  for (let from = 0; from < 1_000_000; from += PAGE_SIZE) {
    let query = supabase
      .from("Pendiente")
      .select("LBussinesNombre, PrimaNeta, Periodo, Documento")
      .order("Documento", { ascending: true })
      .range(from, from + PAGE_SIZE - 1)

    if (meses.length > 0) {
      query = query.in("Periodo", meses)
    }

    const { data, error } = await query

    if (error) {
      if (isTableMissing(error.message)) return false
      throw new Error(`Pendiente error: ${error.message}`)
    }

    const rows = (data || []) as Record<string, unknown>[]
    if (rows.length === 0) return true

    for (const row of rows) {
      const linea = lineaName(row)
      const pendiente = toNumber(row.PrimaNeta)
      target.set(linea, (target.get(linea) || 0) + pendiente)
    }

    if (rows.length < PAGE_SIZE) return true
  }

  return true
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const fallbackYear = new Date().getFullYear().toString()
  const year = Number.parseInt(searchParams.get("year") || fallbackYear, 10)

  const mesesParam = searchParams.get("meses")
  const meses = mesesParam
    ? mesesParam
        .split(",")
        .map((m) => Number.parseInt(m, 10))
        .filter((m) => Number.isFinite(m) && m >= 1 && m <= 12)
    : []

  try {
    const supabaseUrl = cleanEnv(process.env.NEXT_PUBLIC_SUPABASE_URL)
    const serviceRoleKey = cleanEnv(process.env.SUPABASE_SERVICE_ROLE_KEY)
    const anonKey = cleanEnv(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
    const apiKey = serviceRoleKey || anonKey

    if (!supabaseUrl || !apiKey) {
      return NextResponse.json(
        { error: "Supabase env not configured (NEXT_PUBLIC_SUPABASE_URL + key)" },
        { status: 500 }
      )
    }

    const supabase = createClient(supabaseUrl, apiKey)

    const currentByLine = new Map<string, number>()
    const priorByLine = new Map<string, number>()
    const budgetByLine = new Map<string, number>()
    const pendingByLine = new Map<string, number>()

    const currentTable = `Efectuada ${year}`
    const priorTable = `Efectuada ${year - 1}`
    const budgetTable = `Presupuestos ${year}`

    await accumulateEfectuada(supabase, currentTable, meses, currentByLine)
    await accumulateEfectuada(supabase, priorTable, meses, priorByLine)

    // Budget table is currently expected mostly for 2026, but keep dynamic naming.
    await accumulatePresupuesto(supabase, budgetTable, meses, budgetByLine)

    // Pendiente table reflects current operational backlog; avoid projecting it to historical years.
    if (year === new Date().getFullYear()) {
      await accumulatePendiente(supabase, meses, pendingByLine)
    }

    const lineas = new Set<string>([
      ...Array.from(currentByLine.keys()),
      ...Array.from(priorByLine.keys()),
      ...Array.from(budgetByLine.keys()),
      ...Array.from(pendingByLine.keys()),
    ])

    const result = Array.from(lineas)
      .map((nombre) => ({
        nombre,
        primaNeta: Math.round(currentByLine.get(nombre) || 0),
        anioAnterior: Math.round(priorByLine.get(nombre) || 0),
        presupuesto: Math.round(budgetByLine.get(nombre) || 0),
        pendiente: Math.round(pendingByLine.get(nombre) || 0),
      }))
      .sort((a, b) => b.primaNeta - a.primaNeta)

    return NextResponse.json(result, {
      headers: { "Cache-Control": "no-store" },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error"
    return NextResponse.json({ error: "Failed to fetch", detail: message }, { status: 500 })
  }
}
