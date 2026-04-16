import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import { NextRequest, NextResponse } from "next/server"

function cleanEnv(value?: string): string {
  return (value || "").replace(/\\n/g, "").trim()
}

function toNumber(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0
  if (typeof value === "string") {
    const n = Number(value.replace(/[$,\s]/g, ""))
    return Number.isFinite(n) ? n : 0
  }
  return 0
}

function monthFromDateLike(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null
  if (typeof v === "number") {
    const d = new Date(Math.round((v - 25569) * 86400 * 1000))
    return Number.isNaN(d.getTime()) ? null : d.getMonth() + 1
  }
  const s = String(v).trim()
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/)
  if (m) return parseInt(m[1], 10)
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) return parseInt(iso[2], 10)
  return null
}

function normalizeLinea(v: unknown): string {
  const x = String(v ?? "").trim()
  if (/^Click Promotor/i.test(x)) return "Click Promotorías"
  return x
}

async function fetchAll(queryFactory: () => any, pageSize = 1000): Promise<Record<string, unknown>[]> {
  const allRows: Record<string, unknown>[] = []
  let from = 0
  while (from < 200000) {
    const to = from + pageSize - 1
    const { data, error } = await queryFactory().range(from, to)
    if (error) throw new Error(error.message)
    const rows = (data || []) as Record<string, unknown>[]
    if (rows.length === 0) break
    allRows.push(...rows)
    if (rows.length < pageSize) break
    from += pageSize
  }
  return allRows
}

async function loadGerenciasDrive(supabase: SupabaseClient, linea: string, yearNum: number, months: number[]) {
  const includeMonth = (m: number | null) => months.length === 0 || (m !== null && months.includes(m))

  const effTable = `efectuada_${yearNum}_drive`
  const pptoTable = `presupuestos_${yearNum}_drive`
  const prevEffTable = yearNum > 2024 ? `efectuada_${yearNum - 1}_drive` : null

  const effRows = await fetchAll(() => {
    let q = supabase
      .from(effTable)
      .select("LBussinesNombre, GerenciaNombre, PrimaNeta, Descuento, TCPago, FLiquidacion, Periodo")
    if (linea === "Click Promotorías") q = q.in("LBussinesNombre", ["Click Promotorías", "Click Promotorias"])
    else q = q.eq("LBussinesNombre", linea)
    return q
  })

  const pptoRows = await fetchAll(() => {
    let q = supabase
      .from(pptoTable)
      .select("LBussinesNombre, GerenciaNombre, Presupuesto, Fecha")
    if (linea === "Click Promotorías") q = q.in("LBussinesNombre", ["Click Promotorías", "Click Promotorias"])
    else q = q.eq("LBussinesNombre", linea)
    return q
  })

  const prevRows = prevEffTable
    ? await fetchAll(() => {
        let q = supabase
          .from(prevEffTable)
          .select("LBussinesNombre, GerenciaNombre, PrimaNeta, Descuento, TCPago, FLiquidacion, Periodo")
        if (linea === "Click Promotorías") q = q.in("LBussinesNombre", ["Click Promotorías", "Click Promotorias"])
        else q = q.eq("LBussinesNombre", linea)
        return q
      })
    : []

  const map = new Map<string, { primaNeta: number; pnAnioAnt: number; presupuesto: number }>()

  for (const r of effRows) {
    if (normalizeLinea(r.LBussinesNombre) !== linea) continue
    const ger = String(r.GerenciaNombre ?? "").trim() || "Sin gerencia"
    const m = monthFromDateLike(r.FLiquidacion) ?? toNumber(r.Periodo)
    if (!includeMonth(m)) continue
    const pn = (toNumber(r.PrimaNeta) - toNumber(r.Descuento)) * (toNumber(r.TCPago) || 1)
    const cur = map.get(ger) || { primaNeta: 0, pnAnioAnt: 0, presupuesto: 0 }
    cur.primaNeta += pn
    map.set(ger, cur)
  }

  for (const r of pptoRows) {
    if (normalizeLinea(r.LBussinesNombre) !== linea) continue
    const ger = String(r.GerenciaNombre ?? "").trim() || "Sin gerencia"
    const m = monthFromDateLike(r.Fecha)
    if (!includeMonth(m)) continue
    const cur = map.get(ger) || { primaNeta: 0, pnAnioAnt: 0, presupuesto: 0 }
    cur.presupuesto += toNumber(r.Presupuesto)
    map.set(ger, cur)
  }

  for (const r of prevRows) {
    if (normalizeLinea(r.LBussinesNombre) !== linea) continue
    const ger = String(r.GerenciaNombre ?? "").trim() || "Sin gerencia"
    const m = monthFromDateLike(r.FLiquidacion) ?? toNumber(r.Periodo)
    if (!includeMonth(m)) continue
    const pnAA = (toNumber(r.PrimaNeta) - toNumber(r.Descuento)) * (toNumber(r.TCPago) || 1)
    const cur = map.get(ger) || { primaNeta: 0, pnAnioAnt: 0, presupuesto: 0 }
    cur.pnAnioAnt += pnAA
    map.set(ger, cur)
  }

  return Array.from(map.entries())
    .map(([gerencia, v]) => ({
      gerencia,
      primaNeta: Math.round(v.primaNeta),
      pnAnioAnt: Math.round(v.pnAnioAnt),
      presupuesto: Math.round(v.presupuesto),
    }))
    .filter((r) => r.primaNeta > 0)
    .sort((a, b) => a.gerencia.localeCompare(b.gerencia, "es", { sensitivity: "base" }))
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const linea = (searchParams.get("linea") || "").trim()
    const year = parseInt(searchParams.get("year") || `${new Date().getFullYear()}`, 10)
    const meses = (searchParams.get("meses") || "")
      .split(",")
      .map((m) => parseInt(m, 10))
      .filter((m) => Number.isFinite(m) && m >= 1 && m <= 12)

    if (!linea) return NextResponse.json([], { headers: { "Cache-Control": "no-store" } })
    if (![2024, 2025, 2026].includes(year)) return NextResponse.json([], { headers: { "Cache-Control": "no-store" } })

    const supabaseUrl = cleanEnv(process.env.NEXT_PUBLIC_SUPABASE_URL)
    const serviceRoleKey = cleanEnv(process.env.SUPABASE_SERVICE_ROLE_KEY)
    const anonKey = cleanEnv(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
    const apiKey = serviceRoleKey || anonKey
    if (!supabaseUrl || !apiKey) return NextResponse.json([], { headers: { "Cache-Control": "no-store" } })

    const supabase = createClient(supabaseUrl, apiKey)
    const rows = await loadGerenciasDrive(supabase, linea, year, meses)
    return NextResponse.json(rows, { headers: { "Cache-Control": "no-store" } })
  } catch (err) {
    const detail = err instanceof Error ? err.message : "unknown"
    return NextResponse.json({ error: "gerencias_failed", detail }, { status: 500 })
  }
}
