import { supabase } from "./supabase"

// ============================================================
// RBAC — Role-Based Access Control (preparation, always returns true)
// user_role: 'director' | 'gerente' | 'vendedor' | 'admin'
// ============================================================
export type UserRole = "director" | "gerente" | "vendedor" | "admin"

export interface AppUser {
  id: number
  email: string
  nombre: string
  user_role: UserRole
  gerencia_id?: string
  vendedor_id?: string
}

/**
 * Check if user has permission for a resource.
 * Currently always returns true — will be implemented when auth is active.
 */
export function hasPermission(_user: AppUser | null, _resource: string): boolean {
  return true // Phase 1: no restrictions
}

// ============================================================
// PRIMARY SOURCE: public.dashboard_data (10,566 rows)
// Columns: LBussinesNombre, GerenciaNombre, VendNombre,
// PrimaNeta, Descuento (text), TCPago, FLiquidacion (text),
// CiaAbreviacion, Grupo, NombreCompleto, Documento,
// RamosNombre, Sub_Ramo, DeptosNombre, Periodo (1-12)
// ============================================================

export interface LineaRow {
  nombre: string
  primaNeta: number
  anioAnterior: number
  presupuesto: number
}

// Seed data — fallback when Supabase fails
export const SEED_LINEAS: LineaRow[] = [
  { nombre: "Vendedores", primaNeta: 72595322, anioAnterior: 64461188, presupuesto: 94524187 },
  { nombre: "Aseguradoras", primaNeta: 25943097, anioAnterior: 24450735, presupuesto: 34962885 },
]

export const SEED_PRESUPUESTO = 129487071

export interface FxRates { usd: number; dop: number }
export const SEED_FX: FxRates = { usd: 17.22, dop: 56.85 }

// Helper: compute prima from a row
// Fórmula oficial: (Prima Neta cobrada - descuento) × Tipo de cambio
function calcPrima(row: Record<string, unknown>): number {
  const prima = (row.PrimaNeta as number) || 0
  const tc = (row.TCPago as number) || 1
  const desc = parseFloat(row.Descuento as string) || 0
  return (prima - desc) * tc
}

// Helper: group rows by a key and sum prima
function groupBySum(rows: Record<string, unknown>[], key: string): Record<string, number> {
  const grouped: Record<string, number> = {}
  for (const row of rows) {
    const k = (row[key] as string) || "Sin clasificar"
    grouped[k] = (grouped[k] || 0) + calcPrima(row)
  }
  return grouped
}

/**
 * Fetch prima neta cobrada grouped by línea de negocio from dashboard_data
 * Periodo 1-12 maps to payment periods in the data
 */
export async function getLineasNegocio(periodo?: number, año?: string): Promise<{ linea: string; primaNeta: number }[] | null> {
  try {
    let query = supabase
      .from("dashboard_data")
      .select("LBussinesNombre, PrimaNeta, TCPago, Descuento, FLiquidacion")

    if (periodo) query = query.eq("Periodo", periodo)
    if (año) query = query.ilike("FLiquidacion", `%/${año.slice(2)} %`)

    // Supabase default limit is 1000 — we need ALL rows for accurate aggregation
    const { data, error } = await query.limit(50000)
    if (error || !data?.length) return null

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const grouped = groupBySum(data as any[], "LBussinesNombre")

    return Object.entries(grouped)
      .map(([linea, prima]) => ({ linea, primaNeta: Math.round(prima) }))
      .sort((a, b) => b.primaNeta - a.primaNeta)
  } catch {
    return null
  }
}

/**
 * Fetch gerencias for a given línea de negocio
 */
export async function getGerencias(
  linea: string,
  periodo?: number,
  año?: string
): Promise<{ gerencia: string; primaNeta: number }[] | null> {
  try {
    let query = supabase
      .from("dashboard_data")
      .select("GerenciaNombre, PrimaNeta, TCPago, Descuento, FLiquidacion")
      .eq("LBussinesNombre", linea)
      .limit(5000)

    if (periodo) query = query.eq("Periodo", periodo)
    if (año) query = query.ilike("FLiquidacion", `%/${año.slice(2)} %`)

    const { data, error } = await query
    if (error || !data?.length) return null

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const grouped = groupBySum(data as any[], "GerenciaNombre")

    return Object.entries(grouped)
      .map(([gerencia, prima]) => ({ gerencia, primaNeta: Math.round(prima) }))
      .sort((a, b) => b.primaNeta - a.primaNeta)
  } catch {
    return null
  }
}

/**
 * Fetch vendedores for a given gerencia + línea
 */
export async function getVendedores(
  gerencia: string,
  linea: string,
  periodo?: number,
  año?: string
): Promise<{ vendedor: string; primaNeta: number }[] | null> {
  try {
    let query = supabase
      .from("dashboard_data")
      .select("VendNombre, PrimaNeta, TCPago, Descuento, FLiquidacion")
      .eq("GerenciaNombre", gerencia)
      .eq("LBussinesNombre", linea)
      .limit(5000)

    if (periodo) query = query.eq("Periodo", periodo)
    if (año) query = query.ilike("FLiquidacion", `%/${año.slice(2)} %`)

    const { data, error } = await query
    if (error || !data?.length) return null

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const grouped = groupBySum(data as any[], "VendNombre")

    return Object.entries(grouped)
      .map(([vendedor, prima]) => ({ vendedor, primaNeta: Math.round(prima) }))
      .sort((a, b) => b.primaNeta - a.primaNeta)
  } catch {
    return null
  }
}

/**
 * Fetch exchange rates from public.tipo_cambio (real-time from edge function)
 */
export async function getTipoCambio(): Promise<FxRates & { fechaActualizacion?: string } | null> {
  try {
    const { data, error } = await supabase
      .from("tipo_cambio")
      .select("moneda, valor, fecha_actualizacion")

    if (error || !data?.length) return null

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = data as any[]
    const usdRow = rows.find((r: Record<string, unknown>) => r.moneda === "USD")
    const dopRow = rows.find((r: Record<string, unknown>) => r.moneda === "DOP")
    return {
      usd: usdRow?.valor ?? 17.22,
      dop: dopRow?.valor ?? 56.85,
      fechaActualizacion: usdRow?.fecha_actualizacion,
    }
  } catch {
    return null
  }
}

/**
 * Fetch grupos for a given vendedor + gerencia + línea
 */
export async function getGrupos(
  vendedor: string,
  gerencia: string,
  linea: string,
  periodo?: number,
  año?: string
): Promise<{ grupo: string; cliente: string; primaNeta: number }[] | null> {
  try {
    let query = supabase
      .from("dashboard_data")
      .select("Grupo, NombreCompleto, PrimaNeta, TCPago, Descuento, FLiquidacion")
      .eq("VendNombre", vendedor)
      .eq("GerenciaNombre", gerencia)
      .eq("LBussinesNombre", linea)

    if (periodo) query = query.eq("Periodo", periodo)
    if (año) query = query.ilike("FLiquidacion", `%/${año.slice(2)} %`)

    const { data, error } = await query
    if (error || !data?.length) return null

    // Group by Grupo, keep first NombreCompleto
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = data as any[]
    const grouped: Record<string, { cliente: string; prima: number }> = {}
    for (const row of rows) {
      const g = (row.Grupo as string) || "Sin grupo"
      const c = (row.NombreCompleto as string) || ""
      if (!grouped[g]) grouped[g] = { cliente: c, prima: 0 }
      grouped[g].prima += calcPrima(row)
    }

    return Object.entries(grouped)
      .map(([grupo, d]) => ({ grupo, cliente: d.cliente, primaNeta: Math.round(d.prima) }))
      .sort((a, b) => b.primaNeta - a.primaNeta)
  } catch {
    return null
  }
}

/**
 * Fetch clientes for a given grupo + vendedor + gerencia + línea
 */
export async function getClientes(
  grupo: string,
  vendedor: string,
  gerencia: string,
  linea: string,
  periodo?: number,
  año?: string
): Promise<{ cliente: string; primaNeta: number }[] | null> {
  try {
    let query = supabase
      .from("dashboard_data")
      .select("NombreCompleto, PrimaNeta, TCPago, Descuento, FLiquidacion")
      .eq("Grupo", grupo)
      .eq("VendNombre", vendedor)
      .eq("GerenciaNombre", gerencia)
      .eq("LBussinesNombre", linea)

    if (periodo) query = query.eq("Periodo", periodo)
    if (año) query = query.ilike("FLiquidacion", `%/${año.slice(2)} %`)

    const { data, error } = await query
    if (error || !data?.length) return null

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const grouped = groupBySum(data as any[], "NombreCompleto")
    return Object.entries(grouped)
      .map(([cliente, prima]) => ({ cliente, primaNeta: Math.round(prima) }))
      .sort((a, b) => b.primaNeta - a.primaNeta)
  } catch {
    return null
  }
}

/**
 * Fetch pólizas for a given cliente + grupo + vendedor + gerencia + línea
 */
export interface PolizaRow {
  documento: string
  aseguradora: string
  ramo: string
  subramo: string
  fechaLiquidacion: string
  fechaLimPago: string
  primaNeta: number
}

export async function getPolizas(
  cliente: string,
  grupo: string,
  vendedor: string,
  gerencia: string,
  linea: string,
  periodo?: number,
  año?: string
): Promise<PolizaRow[] | null> {
  try {
    let query = supabase
      .from("dashboard_data")
      .select("Documento, CiaAbreviacion, RamosNombre, Sub_Ramo, FLiquidacion, FLimPago, PrimaNeta, TCPago, Descuento")
      .eq("NombreCompleto", cliente)
      .eq("Grupo", grupo)
      .eq("VendNombre", vendedor)
      .eq("GerenciaNombre", gerencia)
      .eq("LBussinesNombre", linea)

    if (periodo) query = query.eq("Periodo", periodo)
    if (año) query = query.ilike("FLiquidacion", `%/${año.slice(2)} %`)

    const { data, error } = await query
    if (error || !data?.length) return null

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (data as any[]).map(row => ({
      documento: (row.Documento as string) || "",
      aseguradora: (row.CiaAbreviacion as string) || "",
      ramo: (row.RamosNombre as string) || "",
      subramo: (row.Sub_Ramo as string) || "",
      fechaLiquidacion: (row.FLiquidacion as string) || "",
      fechaLimPago: (row.FLimPago as string) || "",
      primaNeta: Math.round(calcPrima(row)),
    })).sort((a, b) => b.primaNeta - a.primaNeta)
  } catch {
    return null
  }
}

/**
 * Fetch all vendedores ranked by prima (for rankings)
 */
export async function getRankedVendedores(
  periodo?: number,
  año?: string
): Promise<{ vendedor: string; primaNeta: number }[] | null> {
  try {
    let query = supabase
      .from("dashboard_data")
      .select("VendNombre, PrimaNeta, TCPago, Descuento, FLiquidacion")
    if (periodo) query = query.eq("Periodo", periodo)
    if (año) query = query.ilike("FLiquidacion", `%/${año.slice(2)} %`)
    const { data, error } = await query
    if (error || !data?.length) return null
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const grouped = groupBySum(data as any[], "VendNombre")
    return Object.entries(grouped)
      .map(([vendedor, prima]) => ({ vendedor, primaNeta: Math.round(prima) }))
      .sort((a, b) => b.primaNeta - a.primaNeta)
  } catch { return null }
}

/**
 * Fetch aseguradoras ranked by prima
 */
export async function getRankedAseguradoras(
  periodo?: number,
  año?: string
): Promise<{ aseguradora: string; primaNeta: number }[] | null> {
  try {
    let query = supabase
      .from("dashboard_data")
      .select("CiaAbreviacion, PrimaNeta, TCPago, Descuento, FLiquidacion")
    if (periodo) query = query.eq("Periodo", periodo)
    if (año) query = query.ilike("FLiquidacion", `%/${año.slice(2)} %`)
    const { data, error } = await query
    if (error || !data?.length) return null
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const grouped = groupBySum(data as any[], "CiaAbreviacion")
    return Object.entries(grouped)
      .map(([aseguradora, prima]) => ({ aseguradora, primaNeta: Math.round(prima) }))
      .sort((a, b) => b.primaNeta - a.primaNeta)
  } catch { return null }
}

/**
 * Get the last data date from dashboard_data (MAX FLiquidacion)
 */
export async function getLastDataDate(): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from("dashboard_data")
      .select("FLiquidacion")
      .order("FLiquidacion", { ascending: false })
      .limit(50)
    if (error || !data?.length) return null
    // FLiquidacion is text like "DD/MM/YY HH:MM" — find the max date
    let maxDate: Date | null = null
    let maxStr = ""
    for (const row of data) {
      const raw = (row as Record<string, unknown>).FLiquidacion as string
      if (!raw) continue
      // Parse DD/MM/YY or DD/MM/YYYY
      const parts = raw.trim().split(/[\s]+/)[0].split("/")
      if (parts.length >= 3) {
        const day = parseInt(parts[0]), month = parseInt(parts[1])
        let yr = parseInt(parts[2])
        if (yr < 100) yr += 2000
        const d = new Date(yr, month - 1, day)
        if (!maxDate || d > maxDate) { maxDate = d; maxStr = raw }
      }
    }
    if (!maxDate) return null
    // Return as DD/MM/YYYY
    const dd = String(maxDate.getDate()).padStart(2, "0")
    const mm = String(maxDate.getMonth() + 1).padStart(2, "0")
    const yyyy = maxDate.getFullYear()
    return `${dd}/${mm}/${yyyy}`
  } catch { return null }
}

/**
 * Check data freshness — returns hours since last tipo_cambio update
 */
export async function getDataFreshness(): Promise<number | null> {
  try {
    const { data, error } = await supabase
      .from("tipo_cambio")
      .select("fecha_actualizacion")
      .order("fecha_actualizacion", { ascending: false })
      .limit(1)
    if (error || !data?.length) return null
    const lastUpdate = new Date(data[0].fecha_actualizacion)
    const hoursAgo = (Date.now() - lastUpdate.getTime()) / (1000 * 60 * 60)
    return Math.round(hoursAgo * 10) / 10
  } catch { return null }
}

/**
 * Global search across vendedores, clientes, documentos, gerencias
 */
export interface SearchResult {
  type: "gerencia" | "vendedor" | "cliente" | "poliza"
  value: string
  context: { linea: string; gerencia?: string; vendedor?: string; grupo?: string }
  primaNeta: number
}

export async function globalSearch(
  query: string,
  periodo?: number,
  año?: string
): Promise<SearchResult[]> {
  if (!query || query.length < 2) return []
  try {
    let q = supabase
      .from("dashboard_data")
      .select("LBussinesNombre, GerenciaNombre, VendNombre, NombreCompleto, Grupo, Documento, PrimaNeta, TCPago, Descuento, FLiquidacion")
      .or(`GerenciaNombre.ilike.%${query}%,VendNombre.ilike.%${query}%,NombreCompleto.ilike.%${query}%,Documento.ilike.%${query}%`)
    if (periodo) q = q.eq("Periodo", periodo)
    if (año) q = q.ilike("FLiquidacion", `%/${año.slice(2)} %`)
    q = q.limit(100)

    const { data, error } = await q
    if (error || !data?.length) return []

    // Deduplicate by type + value
    const seen = new Set<string>()
    const results: SearchResult[] = []
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const row of data as any[]) {
      const linea = row.LBussinesNombre as string
      const gerencia = row.GerenciaNombre as string
      const vendedor = row.VendNombre as string
      const cliente = row.NombreCompleto as string
      const doc = row.Documento as string
      const grupo = row.Grupo as string
      const prima = calcPrima(row)

      if (gerencia?.toLowerCase().includes(query.toLowerCase()) && !seen.has(`g:${gerencia}`)) {
        seen.add(`g:${gerencia}`)
        results.push({ type: "gerencia", value: gerencia, context: { linea }, primaNeta: Math.round(prima) })
      }
      if (vendedor?.toLowerCase().includes(query.toLowerCase()) && !seen.has(`v:${vendedor}`)) {
        seen.add(`v:${vendedor}`)
        results.push({ type: "vendedor", value: vendedor, context: { linea, gerencia }, primaNeta: Math.round(prima) })
      }
      if (cliente?.toLowerCase().includes(query.toLowerCase()) && !seen.has(`c:${cliente}`)) {
        seen.add(`c:${cliente}`)
        results.push({ type: "cliente", value: cliente, context: { linea, gerencia, vendedor, grupo }, primaNeta: Math.round(prima) })
      }
      if (doc?.toLowerCase().includes(query.toLowerCase()) && !seen.has(`d:${doc}`)) {
        seen.add(`d:${doc}`)
        results.push({ type: "poliza", value: doc, context: { linea, gerencia, vendedor, grupo }, primaNeta: Math.round(prima) })
      }
    }
    return results.slice(0, 20)
  } catch { return [] }
}

/**
 * Fetch compromisos de venta
 */
export interface CompromisoRow {
  vendedor: string; meta: number; primaActual: number; pctAvance: number
}
export async function getCompromisos(anio: number, mes: number): Promise<CompromisoRow[] | null> {
  try {
    const { data, error } = await supabase
      .from("compromisos")
      .select("vendedor, meta, prima_actual")
      .eq("anio", anio)
      .eq("mes", mes)
      .order("meta", { ascending: false })
    if (error || !data?.length) return null
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (data as any[]).map(r => ({
      vendedor: r.vendedor,
      meta: r.meta,
      primaActual: r.prima_actual,
      pctAvance: r.meta > 0 ? Math.round((r.prima_actual / r.meta) * 1000) / 10 : 0,
    }))
  } catch { return null }
}

/**
 * Fetch prima neta grouped by ramo (RamosNombre) + row count as polizas proxy
 */
export async function getRamos(
  periodo?: number,
  año?: string
): Promise<{ ramo: string; primaNeta: number; polizas: number }[] | null> {
  try {
    let query = supabase
      .from("dashboard_data")
      .select("RamosNombre, PrimaNeta, TCPago, Descuento, FLiquidacion")
    if (periodo) query = query.eq("Periodo", periodo)
    if (año) query = query.ilike("FLiquidacion", `%/${año.slice(2)} %`)
    const { data, error } = await query
    if (error || !data?.length) return null
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = data as any[]
    const grouped: Record<string, { prima: number; count: number }> = {}
    for (const row of rows) {
      const ramo = (row.RamosNombre as string) || "Otros"
      if (!grouped[ramo]) grouped[ramo] = { prima: 0, count: 0 }
      grouped[ramo].prima += calcPrima(row)
      grouped[ramo].count += 1
    }
    return Object.entries(grouped)
      .map(([ramo, d]) => ({ ramo, primaNeta: Math.round(d.prima), polizas: d.count }))
      .sort((a, b) => b.primaNeta - a.primaNeta)
  } catch { return null }
}

/**
 * Get available periodos from dashboard_data
 */
export async function getPeriodos(): Promise<number[] | null> {
  try {
    const { data, error } = await supabase
      .from("dashboard_data")
      .select("Periodo")

    if (error || !data?.length) return null

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const set = new Set<number>()
    for (const r of data as any[]) { set.add(r.Periodo as number) }
    const unique = Array.from(set).sort((a, b) => a - b)
    return unique
  } catch {
    return null
  }
}
