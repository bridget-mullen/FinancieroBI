import { createClient } from "@supabase/supabase-js"
import { NextRequest, NextResponse } from "next/server"

function cleanEnv(value?: string): string {
  return (value || "").replace(/\n/g, "").trim()
}

function parseNum(v: unknown): number {
  if (v === null || v === undefined || v === "") return 0
  if (typeof v === "number") return Number.isFinite(v) ? v : 0
  let s = String(v).trim()
  if (!s) return 0
  s = s.replace(/[^\d,.-]/g, "")
  if (!s || s === "-" || s === ".") return 0
  const lc = s.lastIndexOf(",")
  const ld = s.lastIndexOf(".")
  if (lc !== -1 && ld !== -1) {
    if (ld > lc) s = s.replace(/,/g, "")
    else s = s.replace(/\./g, "").replace(",", ".")
  } else if (lc !== -1) {
    s = s.replace(",", ".")
  }
  const n = Number(s)
  return Number.isFinite(n) ? n : 0
}

function monthFromDateLike(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null
  if (typeof v === "number") {
    const d = new Date(Math.round((v - 25569) * 86400 * 1000))
    return Number.isNaN(d.getTime()) ? null : d.getMonth() + 1
  }
  const s = String(v).trim()
  const m1 = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/)
  if (m1) {
    const mm = parseInt(m1[1], 10)
    return mm >= 1 && mm <= 12 ? mm : null
  }
  const m2 = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (m2) {
    const mm = parseInt(m2[2], 10)
    return mm >= 1 && mm <= 12 ? mm : null
  }
  return null
}

function normalizeText(v: unknown): string {
  return String(v ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchAll(queryFactory: () => any, pageSize = 5000): Promise<Record<string, unknown>[]> {
  const allRows: Record<string, unknown>[] = []
  for (let from = 0; from < 300000; from += pageSize) {
    const to = from + pageSize - 1
    const { data, error } = await queryFactory().range(from, to)
    if (error) break
    if (!data || data.length === 0) break
    allRows.push(...(data as Record<string, unknown>[]))
    if (data.length < pageSize) break
  }
  return allRows
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const year = parseInt(searchParams.get("year") || `${new Date().getFullYear()}`, 10)
    const mesesParam = (searchParams.get("meses") || "").trim()
    const meses = (mesesParam ? mesesParam.split(",") : [`${new Date().getMonth() + 1}`])
      .map((m) => parseInt(m, 10))
      .filter((m) => Number.isFinite(m) && m >= 1 && m <= 12)
    const mesesSet = new Set<number>(meses)

    const supabaseUrl = cleanEnv(process.env.NEXT_PUBLIC_SUPABASE_URL)
    const serviceRoleKey = cleanEnv(process.env.SUPABASE_SERVICE_ROLE_KEY)
    const anonKey = cleanEnv(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
    const apiKey = serviceRoleKey || anonKey
    if (!supabaseUrl || !apiKey) return NextResponse.json([], { headers: { "Cache-Control": "no-store" } })

    const supabase = createClient(supabaseUrl, apiKey)

    const yearsForVendedores = [2024, 2025, 2026]
    const pptoTable = `presupuestos_${year}_drive`
    const lineaFilter = normalizeText(searchParams.get("linea"))
    const gerenciaFilter = normalizeText(searchParams.get("gerencia"))

    const catalogRows = await fetchAll(() =>
      supabase
        .from("catalogo_lineas_negocio_drive")
        .select("LBussinesNombre, Gerencia, Linea")
    )

    const catPair = new Map<string, { linea: string; gerencia: string }>()
    const catLB = new Map<string, { linea: string; gerencia: string }>()
    for (const r of catalogRows) {
      const lb = normalizeText(r.LBussinesNombre)
      const g = normalizeText(r.Gerencia)
      const linea = String(r.Linea || r.LBussinesNombre || "").trim()
      const gerencia = String(r.Gerencia || "").trim()
      if (lb && g) catPair.set(`${lb}|${g}`, { linea, gerencia })
      if (lb && !catLB.has(lb)) catLB.set(lb, { linea, gerencia })
    }

    const acc = new Map<string, { vendedor: string; meta: number; primaActual: number }>()
    const vendorsPassingFilters = new Set<string>()

    const upsertVendor = (vendNombre: unknown): { key: string; row: { vendedor: string; meta: number; primaActual: number } } | null => {
      const nn = normalizeText(vendNombre)
      if (!nn) return null
      const display = String(vendNombre || "Sin vendedor").trim()
      const key = `vend:${nn}`
      const row = acc.get(key) || { vendedor: display, meta: 0, primaActual: 0 }
      if (!acc.has(key)) acc.set(key, row)
      return { key, row }
    }

    for (const y of yearsForVendedores) {
      const effTable = `efectuada_${y}_drive`
      const effRows = await fetchAll(() =>
        supabase
          .from(effTable)
          .select("VendNombre, LBussinesNombre, GerenciaNombre, PrimaNeta, Descuento, TCPago, FLiquidacion, Periodo")
          .order("IDDocto", { ascending: true })
      )

      for (const r of effRows) {
        const m = monthFromDateLike(r.FLiquidacion) ?? parseNum(r.Periodo)
        if (!Number.isFinite(m) || !mesesSet.has(Number(m))) continue

        const lb = normalizeText(r.LBussinesNombre)
        const g = normalizeText(r.GerenciaNombre)
        const rel = catPair.get(`${lb}|${g}`) || catLB.get(lb)
        const lineaNorm = normalizeText(rel?.linea || r.LBussinesNombre)
        const gerNorm = normalizeText(rel?.gerencia || r.GerenciaNombre)

        if (lineaFilter && lineaNorm !== lineaFilter) continue
        if (gerenciaFilter && gerNorm !== gerenciaFilter) continue

        const upsert = upsertVendor(r.VendNombre)
        if (!upsert) continue
        vendorsPassingFilters.add(upsert.key)
        upsert.row.primaActual += (parseNum(r.PrimaNeta) - parseNum(r.Descuento)) * (parseNum(r.TCPago) || 1)
      }
    }

    const pptoRows = await fetchAll(() =>
      supabase
        .from(pptoTable)
        .select("Vendedor, Presupuesto, Fecha")
        .order("Fecha", { ascending: true })
    )

    for (const r of pptoRows) {
      const m = monthFromDateLike(r.Fecha)
      if (!Number.isFinite(m) || !mesesSet.has(Number(m))) continue
      const upsert = upsertVendor(r.Vendedor)
      if (!upsert) continue
      if ((lineaFilter || gerenciaFilter) && !vendorsPassingFilters.has(upsert.key)) continue
      upsert.row.meta += parseNum(r.Presupuesto)
    }

    const out = Array.from(acc.values())
      .map((r) => ({
        vendedor: r.vendedor,
        meta: Math.round(r.meta),
        primaActual: Math.round(r.primaActual),
        pctAvance: r.meta > 0 ? Math.round((r.primaActual / r.meta) * 1000) / 10 : 0,
      }))
      .filter((r) => r.primaActual !== 0)
      .sort((a, b) => b.primaActual - a.primaActual)

    return NextResponse.json(out, { headers: { "Cache-Control": "no-store" } })
  } catch {
    return NextResponse.json([], { headers: { "Cache-Control": "no-store" } })
  }
}
