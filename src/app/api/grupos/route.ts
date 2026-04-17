import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import { NextRequest, NextResponse } from "next/server"

function cleanEnv(value?: string): string {
  return (value || "").replace(/\n/g, "").trim()
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
  if (/^\d+(\.\d+)?$/.test(s)) {
    const serial = Number(s)
    if (Number.isFinite(serial) && serial > 20000) {
      const d = new Date(Math.round((serial - 25569) * 86400 * 1000))
      return Number.isNaN(d.getTime()) ? null : d.getMonth() + 1
    }
  }
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/)
  if (m) {
    const mm = parseInt(m[1], 10)
    return mm >= 1 && mm <= 12 ? mm : null
  }
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) {
    const mm = parseInt(iso[2], 10)
    return mm >= 1 && mm <= 12 ? mm : null
  }
  return null
}

function normalizeText(v: unknown): string {
  return String(v ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
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

async function loadGruposDrive(
  supabase: SupabaseClient,
  linea: string,
  gerencia: string,
  vendedor: string,
  yearNum: number,
  months: number[]
) {
  const includeMonth = (m: number | null) => months.length === 0 || (m !== null && months.includes(m))
  const selGerNorm = normalizeText(gerencia)
  const selVendNorm = normalizeText(vendedor)

  const effTable = `efectuada_${yearNum}_drive`
  const pptoTable = `presupuestos_${yearNum}_drive`
  const prevEffTable = yearNum > 2024 ? `efectuada_${yearNum - 1}_drive` : null

  const effRows = await fetchAll(() => {
    let q = supabase
      .from(effTable)
      .select("LBussinesNombre, GerenciaNombre, VendNombre, Grupo, PrimaNeta, Descuento, TCPago, FLiquidacion, Periodo")
    if (linea === "Click Promotorías") q = q.in("LBussinesNombre", ["Click Promotorías", "Click Promotorias"])
    else q = q.eq("LBussinesNombre", linea)
    return q
  })

  const pptoRows = await fetchAll(() => {
    let q = supabase
      .from(pptoTable)
      .select("LBussinesNombre, GerenciaNombre, Vendedor, Grupo, Presupuesto, Fecha")
    if (linea === "Click Promotorías") q = q.in("LBussinesNombre", ["Click Promotorías", "Click Promotorias"])
    else q = q.eq("LBussinesNombre", linea)
    return q
  })

  const prevRows = prevEffTable
    ? await fetchAll(() => {
        let q = supabase
          .from(prevEffTable)
          .select("LBussinesNombre, GerenciaNombre, VendNombre, Grupo, PrimaNeta, Descuento, TCPago, FLiquidacion, Periodo")
        if (linea === "Click Promotorías") q = q.in("LBussinesNombre", ["Click Promotorías", "Click Promotorias"])
        else q = q.eq("LBussinesNombre", linea)
        return q
      })
    : []

  const map = new Map<string, { grupo: string; primaNeta: number; pnAnioAnt: number; presupuesto: number }>()
  const getOrInit = (raw: string) => {
    const display = raw.trim() || "Sin grupo"
    const key = normalizeText(display)
    const cur = map.get(key) || { grupo: display, primaNeta: 0, pnAnioAnt: 0, presupuesto: 0 }
    map.set(key, cur)
    return cur
  }

  for (const r of effRows) {
    if (normalizeLinea(r.LBussinesNombre) !== linea) continue
    if (normalizeText(r.GerenciaNombre) !== selGerNorm) continue
    if (normalizeText(r.VendNombre) !== selVendNorm) continue
    const grupo = String(r.Grupo ?? "").trim() || "Sin grupo"
    const m = monthFromDateLike(r.FLiquidacion) ?? toNumber(r.Periodo)
    if (!includeMonth(m)) continue
    const pn = (toNumber(r.PrimaNeta) - toNumber(r.Descuento)) * (toNumber(r.TCPago) || 1)
    const cur = getOrInit(grupo)
    cur.primaNeta += pn
  }

  for (const r of pptoRows) {
    if (normalizeLinea(r.LBussinesNombre) !== linea) continue
    if (normalizeText(r.GerenciaNombre) !== selGerNorm) continue
    if (normalizeText(r.Vendedor) !== selVendNorm) continue
    const grupo = String(r.Grupo ?? "").trim() || "Sin grupo"
    const m = monthFromDateLike(r.Fecha)
    if (!includeMonth(m)) continue
    const cur = getOrInit(grupo)
    cur.presupuesto += toNumber(r.Presupuesto)
  }

  for (const r of prevRows) {
    if (normalizeLinea(r.LBussinesNombre) !== linea) continue
    if (normalizeText(r.GerenciaNombre) !== selGerNorm) continue
    if (normalizeText(r.VendNombre) !== selVendNorm) continue
    const grupo = String(r.Grupo ?? "").trim() || "Sin grupo"
    const m = monthFromDateLike(r.FLiquidacion) ?? toNumber(r.Periodo)
    if (!includeMonth(m)) continue
    const pnAA = (toNumber(r.PrimaNeta) - toNumber(r.Descuento)) * (toNumber(r.TCPago) || 1)
    const cur = getOrInit(grupo)
    cur.pnAnioAnt += pnAA
  }

  return Array.from(map.values())
    .map((v) => ({
      grupo: v.grupo,
      cliente: v.grupo,
      primaNeta: Math.round(v.primaNeta),
      pnAnioAnt: Math.round(v.pnAnioAnt),
      presupuesto: Math.round(v.presupuesto),
    }))
    .filter((r) => r.primaNeta > 0 || (r.presupuesto ?? 0) > 0)
    .sort((a, b) => a.grupo.localeCompare(b.grupo, "es", { sensitivity: "base" }))
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const linea = (searchParams.get("linea") || "").trim()
    const gerencia = (searchParams.get("gerencia") || "").trim()
    const vendedor = (searchParams.get("vendedor") || "").trim()
    const year = parseInt(searchParams.get("year") || `${new Date().getFullYear()}`, 10)
    const meses = (searchParams.get("meses") || "")
      .split(",")
      .map((m) => parseInt(m, 10))
      .filter((m) => Number.isFinite(m) && m >= 1 && m <= 12)

    if (!linea || !gerencia || !vendedor) return NextResponse.json([], { headers: { "Cache-Control": "no-store" } })
    if (![2024, 2025, 2026].includes(year)) return NextResponse.json([], { headers: { "Cache-Control": "no-store" } })

    const supabaseUrl = cleanEnv(process.env.NEXT_PUBLIC_SUPABASE_URL)
    const serviceRoleKey = cleanEnv(process.env.SUPABASE_SERVICE_ROLE_KEY)
    const anonKey = cleanEnv(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
    const apiKey = serviceRoleKey || anonKey
    if (!supabaseUrl || !apiKey) return NextResponse.json([], { headers: { "Cache-Control": "no-store" } })

    const supabase = createClient(supabaseUrl, apiKey)
    const rows = await loadGruposDrive(supabase, linea, gerencia, vendedor, year, meses)
    return NextResponse.json(rows, { headers: { "Cache-Control": "no-store" } })
  } catch (err) {
    const detail = err instanceof Error ? err.message : "unknown"
    return NextResponse.json({ error: "grupos_failed", detail }, { status: 500 })
  }
}
