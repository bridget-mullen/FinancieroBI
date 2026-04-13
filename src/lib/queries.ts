import { supabase } from "./supabase"

/**
 * Fetch ALL rows using pagination with a query factory.
 * CRITICAL: We use a factory function (not a reused builder) because
 * Supabase JS query builders are mutable and break when reused across .range() calls.
 * The factory creates a fresh builder for each page request.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchAll(queryFactory: () => any, pageSize = 1000): Promise<Record<string, unknown>[]> {
  const allRows: Record<string, unknown>[] = []
  let from = 0
  const maxRows = 200000 // safety cap
  // eslint-disable-next-line no-constant-condition
  while (from < maxRows) {
    const to = from + pageSize - 1
    // Create a FRESH query builder for each page
    const { data, error } = await queryFactory().range(from, to)
    if (error) {
      console.error("fetchAll page error at offset", from, error.message)
      break
    }
    if (!data || data.length === 0) break
    allRows.push(...(data as Record<string, unknown>[]))
    if (data.length < pageSize) break // last page
    from += pageSize
  }
  return allRows
}

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
// Primary source: bi_dashboard.* tables (real data only).
// ============================================================

export interface LineaRow {
  nombre: string
  primaNeta: number
  anioAnterior: number
  presupuesto: number
  pendiente?: number
}

export interface FxRates { usd: number; dop: number }

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

const MONTH_NUMBER_TO_NAME: Record<number, string> = {
  1: "Enero",
  2: "Febrero",
  3: "Marzo",
  4: "Abril",
  5: "Mayo",
  6: "Junio",
  7: "Julio",
  8: "Agosto",
  9: "Septiembre",
  10: "Octubre",
  11: "Noviembre",
  12: "Diciembre",
}

const MONTH_NAME_TO_NUMBER: Record<string, number> = Object.entries(MONTH_NUMBER_TO_NAME).reduce(
  (acc, [num, name]) => {
    acc[name] = parseInt(num, 10)
    return acc
  },
  {} as Record<string, number>
)

function monthNamesFromPeriodos(periodos?: number[]): string[] {
  const p = periodos ?? []
  return p
    .map((n) => MONTH_NUMBER_TO_NAME[n])
    .filter((m): m is string => Boolean(m))
}

// Global acumulado mode: a numeric periodo means months 1..periodo
function monthNamesFromAcumuladoPeriodo(periodo?: number): string[] {
  if (!periodo || !Number.isFinite(periodo)) return []
  const last = Math.min(Math.max(Math.trunc(periodo), 1), 12)
  const months = Array.from({ length: last }, (_, i) => i + 1)
  return monthNamesFromPeriodos(months)
}

function resolveMonths(periodoOrPeriodos?: number | number[]): string[] {
  if (Array.isArray(periodoOrPeriodos)) return monthNamesFromPeriodos(periodoOrPeriodos)
  return monthNamesFromAcumuladoPeriodo(periodoOrPeriodos)
}

/**
 * Fetch prima neta cobrada grouped by línea de negocio from bi_dashboard.fact_primas
 * Periodo 1-12 maps to month names in Spanish (Enero..Diciembre)
 */
export async function getLineasNegocio(periodo?: number, año?: string): Promise<{ linea: string; primaNeta: number }[] | null> {
  try {
    const months = monthNamesFromAcumuladoPeriodo(periodo)

    let query = supabase
      .schema("bi_dashboard")
      .from("fact_primas")
      .select("linea_negocio, prima_neta_cobrada")
      .is("gerencia", null)
      .is("vendedor", null)

    if (año) query = query.eq("año", parseInt(año))
    if (months.length > 0) query = query.in("mes", months)

    const { data, error } = await query
    if (error || !data?.length) return null

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (data as any[])
      .map((row) => ({
        linea: (row.linea_negocio as string) || "Sin clasificar",
        primaNeta: Math.round((row.prima_neta_cobrada as number) || 0),
      }))
      .sort((a, b) => b.primaNeta - a.primaNeta)
  } catch {
    return null
  }
}

/**
 * Fetch líneas with YoY comparison from the /api/lineas route.
 */
export async function getLineasWithYoY(
  periodos?: number[],
  año?: string
): Promise<LineaRow[] | null> {
  try {
    const year = año || new Date().getFullYear().toString()
    const meses = periodos?.join(",") || ""

    const url = `/api/lineas?year=${year}&meses=${meses}`
    const res = await fetch(url, { cache: "no-store" })
    if (!res.ok) throw new Error(`API error: ${res.status}`)

    const data: Array<{ nombre: string; primaNeta: number; anioAnterior: number; presupuesto?: number; pendiente?: number }> = await res.json()

    return data
      .map((item) => ({
        nombre: item.nombre,
        primaNeta: item.primaNeta,
        anioAnterior: item.anioAnterior,
        presupuesto: Math.round(item.presupuesto || 0),
        pendiente: Math.round(item.pendiente || 0),
      }))
      .sort((a, b) => b.primaNeta - a.primaNeta)
  } catch {
    return null
  }
}

/**
 * Fetch gerencias for a given línea de negocio with YoY comparison
 */
export interface GerenciaRow {
  gerencia: string
  primaNeta: number
  pnAnioAnt: number
  presupuesto?: number
}

export async function getGerencias(
  linea: string,
  periodoOrPeriodos?: number | number[],
  año?: string,
  _clasificacionAseguradoras?: string[] | null
): Promise<GerenciaRow[] | null> {
  try {
    const months = resolveMonths(periodoOrPeriodos)

    let query = supabase
      .schema("bi_dashboard")
      .from("fact_primas")
      .select("gerencia, prima_neta_cobrada, año_anterior, presupuesto")
      .eq("linea_negocio", linea)
      .not("gerencia", "is", null)

    if (año) query = query.eq("año", parseInt(año))
    if (months.length > 0) query = query.in("mes", months)

    const { data, error } = await query
    if (error || !data?.length) return null

    const map = new Map<string, { primaNeta: number; pnAnioAnt: number; presupuesto: number }>()
    for (const row of data as any[]) {
      const key = ((row.gerencia as string) || "Sin gerencia").trim() || "Sin gerencia"
      const cur = map.get(key) || { primaNeta: 0, pnAnioAnt: 0, presupuesto: 0 }
      cur.primaNeta += Number(row.prima_neta_cobrada) || 0
      cur.pnAnioAnt += Number(row["año_anterior"]) || 0
      cur.presupuesto += Number(row.presupuesto) || 0
      map.set(key, cur)
    }

    return Array.from(map.entries())
      .map(([gerencia, v]) => ({ gerencia, primaNeta: Math.round(v.primaNeta), pnAnioAnt: Math.round(v.pnAnioAnt), presupuesto: Math.round(v.presupuesto) }))
      .sort((a, b) => b.primaNeta - a.primaNeta)
  } catch {
    return null
  }
}

/**
 * Fetch vendedores for a given gerencia + línea with YoY comparison
 */
export interface VendedorRow {
  vendedor: string
  primaNeta: number
  pnAnioAnt: number
  presupuesto?: number
}

export async function getVendedores(
  gerencia: string,
  linea: string,
  periodoOrPeriodos?: number | number[],
  año?: string,
  _clasificacionAseguradoras?: string[] | null
): Promise<VendedorRow[] | null> {
  try {
    const months = resolveMonths(periodoOrPeriodos)

    let query = supabase
      .schema("bi_dashboard")
      .from("fact_primas")
      .select("vendedor, prima_neta_cobrada, año_anterior, presupuesto")
      .eq("linea_negocio", linea)
      .eq("gerencia", gerencia)
      .not("vendedor", "is", null)

    if (año) query = query.eq("año", parseInt(año))
    if (months.length > 0) query = query.in("mes", months)

    const { data, error } = await query
    if (error || !data?.length) return null

    const map = new Map<string, { primaNeta: number; pnAnioAnt: number; presupuesto: number }>()
    for (const row of data as any[]) {
      const key = ((row.vendedor as string) || "Sin vendedor").trim() || "Sin vendedor"
      const cur = map.get(key) || { primaNeta: 0, pnAnioAnt: 0, presupuesto: 0 }
      cur.primaNeta += Number(row.prima_neta_cobrada) || 0
      cur.pnAnioAnt += Number(row["año_anterior"]) || 0
      cur.presupuesto += Number(row.presupuesto) || 0
      map.set(key, cur)
    }

    return Array.from(map.entries())
      .map(([vendedor, v]) => ({ vendedor, primaNeta: Math.round(v.primaNeta), pnAnioAnt: Math.round(v.pnAnioAnt), presupuesto: Math.round(v.presupuesto) }))
      .sort((a, b) => b.primaNeta - a.primaNeta)
  } catch {
    return null
  }
}

/**
 * Fetch exchange rates from bi_dashboard.dim_tipo_cambio
 */
export async function getTipoCambio(): Promise<FxRates & { fechaActualizacion?: string } | null> {
  try {
    const { data, error } = await supabase
      .schema("bi_dashboard")
      .from("dim_tipo_cambio")
      .select("moneda, valor, fecha")

    if (error || !data?.length) return null

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = data as any[]
    const usdRow = rows.find((r: Record<string, unknown>) => r.moneda === "USD")
    const dopRow = rows.find((r: Record<string, unknown>) => r.moneda === "DOP")
    return {
      usd: usdRow?.valor ?? 0,
      dop: dopRow?.valor ?? 0,
      fechaActualizacion: usdRow?.fecha,
    }
  } catch {
    return null
  }
}

/**
 * Fetch grupos for a given vendedor + gerencia + línea with YoY comparison
 */
export interface GrupoRow {
  grupo: string
  cliente: string
  primaNeta: number
  pnAnioAnt: number
  presupuesto?: number
}

export async function getGrupos(
  vendedor: string,
  gerencia: string,
  linea: string,
  periodoOrPeriodos?: number | number[],
  año?: string,
  _clasificacionAseguradoras?: string[] | null
): Promise<GrupoRow[] | null> {
  try {
    const months = resolveMonths(periodoOrPeriodos)

    let query = supabase
      .schema("bi_dashboard")
      .from("fact_primas")
      .select("grupo:vendedor, prima_neta_cobrada, año_anterior, presupuesto")
      .eq("linea_negocio", linea)
      .eq("gerencia", gerencia)
      .eq("vendedor", vendedor)

    if (año) query = query.eq("año", parseInt(año))
    if (months.length > 0) query = query.in("mes", months)

    const { data, error } = await query
    if (error || !data?.length) return null

    const map = new Map<string, { primaNeta: number; pnAnioAnt: number; presupuesto: number }>()
    for (const row of data as any[]) {
      const key = ((row.grupo as string) || vendedor || "Sin grupo").trim() || "Sin grupo"
      const cur = map.get(key) || { primaNeta: 0, pnAnioAnt: 0, presupuesto: 0 }
      cur.primaNeta += Number(row.prima_neta_cobrada) || 0
      cur.pnAnioAnt += Number(row["año_anterior"]) || 0
      cur.presupuesto += Number(row.presupuesto) || 0
      map.set(key, cur)
    }

    return Array.from(map.entries())
      .map(([grupo, v]) => ({ grupo, cliente: grupo, primaNeta: Math.round(v.primaNeta), pnAnioAnt: Math.round(v.pnAnioAnt), presupuesto: Math.round(v.presupuesto) }))
      .sort((a, b) => b.primaNeta - a.primaNeta)
  } catch {
    return null
  }
}

/**
 * Fetch clientes for a given grupo + vendedor + gerencia + línea with YoY
 */
export interface ClienteRow {
  cliente: string
  primaNeta: number
  pnAnioAnt: number
  presupuesto?: number
}

export async function getClientes(
  grupo: string,
  vendedor: string,
  gerencia: string,
  linea: string,
  periodoOrPeriodos?: number | number[],
  año?: string,
  _clasificacionAseguradoras?: string[] | null
): Promise<ClienteRow[] | null> {
  try {
    const months = resolveMonths(periodoOrPeriodos)
    const vendedorRef = vendedor || grupo

    let query = supabase
      .schema("bi_dashboard")
      .from("fact_primas")
      .select("cliente:vendedor, prima_neta_cobrada, año_anterior, presupuesto")
      .eq("linea_negocio", linea)
      .eq("gerencia", gerencia)
      .eq("vendedor", vendedorRef)

    if (año) query = query.eq("año", parseInt(año))
    if (months.length > 0) query = query.in("mes", months)

    const { data, error } = await query
    if (error || !data?.length) return null

    const map = new Map<string, { primaNeta: number; pnAnioAnt: number; presupuesto: number }>()
    for (const row of data as any[]) {
      const key = ((row.cliente as string) || grupo || vendedorRef || "Sin cliente").trim() || "Sin cliente"
      const cur = map.get(key) || { primaNeta: 0, pnAnioAnt: 0, presupuesto: 0 }
      cur.primaNeta += Number(row.prima_neta_cobrada) || 0
      cur.pnAnioAnt += Number(row["año_anterior"]) || 0
      cur.presupuesto += Number(row.presupuesto) || 0
      map.set(key, cur)
    }

    return Array.from(map.entries())
      .map(([cliente, v]) => ({ cliente, primaNeta: Math.round(v.primaNeta), pnAnioAnt: Math.round(v.pnAnioAnt), presupuesto: Math.round(v.presupuesto) }))
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
  _grupo: string,
  _vendedor: string,
  gerencia: string,
  _linea: string,
  _periodo?: number,
  _año?: string,
  _clasificacionAseguradoras?: string[] | null
): Promise<PolizaRow[] | null> {
  try {
    let query = supabase
      .schema("bi_dashboard")
      .from("fact_cobranza_pendiente")
      .select("poliza, cliente, gerencia, prima_pendiente, fecha_vencimiento, status")
      .eq("gerencia", gerencia)

    if (cliente) query = query.eq("cliente", cliente)

    const { data, error } = await query.limit(500)
    if (error || !data?.length) return null

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (data as any[])
      .map((row) => ({
        documento: (row.poliza as string) || "",
        aseguradora: (row.status as string) || "",
        ramo: "",
        subramo: "",
        fechaLiquidacion: (row.fecha_vencimiento as string) || "",
        fechaLimPago: (row.fecha_vencimiento as string) || "",
        primaNeta: Math.round((row.prima_pendiente as number) || 0),
      }))
      .sort((a, b) => b.primaNeta - a.primaNeta)
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
    const months = monthNamesFromAcumuladoPeriodo(periodo)

    let query = supabase
      .schema("bi_dashboard")
      .from("fact_primas")
      .select("vendedor, prima_neta_cobrada")
      .not("vendedor", "is", null)

    if (año) query = query.eq("año", parseInt(año))
    if (months.length > 0) query = query.in("mes", months)

    const { data, error } = await query.limit(10000)
    if (error || !data?.length) return null

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const grouped: Record<string, number> = {}
    for (const row of data as any[]) {
      const vendedor = String(row.vendedor || "Sin vendedor")
      grouped[vendedor] = (grouped[vendedor] || 0) + (Number(row.prima_neta_cobrada) || 0)
    }

    return Object.entries(grouped)
      .map(([vendedor, prima]) => ({ vendedor, primaNeta: Math.round(prima) }))
      .sort((a, b) => b.primaNeta - a.primaNeta)
  } catch { return null }
}

/**
 * Fetch aseguradoras ranked by prima with optional clasificación filter
 */
export async function getRankedAseguradoras(
  periodo?: number,
  año?: string,
  _clasificacion?: string
): Promise<{ aseguradora: string; primaNeta: number }[] | null> {
  try {
    const months = monthNamesFromAcumuladoPeriodo(periodo)

    // bi_dashboard currently does not expose insurer-level dimension.
    // We use linea_negocio buckets as the ranking source.
    let query = supabase
      .schema("bi_dashboard")
      .from("fact_primas")
      .select("linea_negocio, prima_neta_cobrada")

    if (año) query = query.eq("año", parseInt(año))
    if (months.length > 0) query = query.in("mes", months)

    const { data, error } = await query.limit(10000)
    if (error || !data?.length) return null

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const grouped: Record<string, number> = {}
    for (const row of data as any[]) {
      const key = String(row.linea_negocio || "Sin clasificar")
      grouped[key] = (grouped[key] || 0) + (Number(row.prima_neta_cobrada) || 0)
    }

    return Object.entries(grouped)
      .map(([aseguradora, prima]) => ({ aseguradora, primaNeta: Math.round(prima) }))
      .sort((a, b) => b.primaNeta - a.primaNeta)
  } catch { return null }
}

/**
 * Get the last data date from bi_dashboard.fact_primas
 */
export async function getLastDataDate(): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .schema("bi_dashboard")
      .from("fact_primas")
      .select("año, mes")
      .not("año", "is", null)
      .not("mes", "is", null)
      .order("año", { ascending: false })
      .limit(200)

    if (error || !data?.length) return null

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = data as any[]
    let bestYear = -1
    let bestMonth = -1

    for (const row of rows) {
      const y = Number(row["año"] || 0)
      const m = MONTH_NAME_TO_NUMBER[String(row.mes || "")] || 0
      if (y > bestYear || (y === bestYear && m > bestMonth)) {
        bestYear = y
        bestMonth = m
      }
    }

    if (bestYear <= 0 || bestMonth <= 0) return null

    const lastDay = new Date(bestYear, bestMonth, 0).getDate()
    const dd = String(lastDay).padStart(2, "0")
    const mm = String(bestMonth).padStart(2, "0")
    return `${dd}/${mm}/${bestYear}`
  } catch {
    return null
  }
}

/**
 * Check data freshness — returns hours since last tipo_cambio update
 */
export async function getDataFreshness(): Promise<number | null> {
  try {
    const { data, error } = await supabase
      .schema("bi_dashboard")
      .from("dim_tipo_cambio")
      .select("fecha")
      .order("fecha", { ascending: false })
      .limit(1)

    if (error || !data?.length) return null

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const lastUpdate = new Date((data as any[])[0].fecha)
    const hoursAgo = (Date.now() - lastUpdate.getTime()) / (1000 * 60 * 60)
    return Math.round(hoursAgo * 10) / 10
  } catch {
    return null
  }
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
    const search = query.trim().toLowerCase()
    const months = monthNamesFromAcumuladoPeriodo(periodo)

    let q = supabase
      .schema("bi_dashboard")
      .from("fact_primas")
      .select("linea_negocio, gerencia, vendedor, prima_neta_cobrada")
      .or(`gerencia.ilike.%${query}%,vendedor.ilike.%${query}%,linea_negocio.ilike.%${query}%`)

    if (año) q = q.eq("año", parseInt(año))
    if (months.length > 0) q = q.in("mes", months)

    const { data, error } = await q.limit(200)
    if (error || !data?.length) return []

    const seen = new Set<string>()
    const results: SearchResult[] = []

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const row of data as any[]) {
      const linea = (row.linea_negocio as string) || "Sin línea"
      const gerencia = (row.gerencia as string) || ""
      const vendedor = (row.vendedor as string) || ""
      const prima = Math.round((row.prima_neta_cobrada as number) || 0)

      if (gerencia && gerencia.toLowerCase().includes(search) && !seen.has(`g:${gerencia}:${linea}`)) {
        seen.add(`g:${gerencia}:${linea}`)
        results.push({ type: "gerencia", value: gerencia, context: { linea }, primaNeta: prima })
      }

      if (vendedor && vendedor.toLowerCase().includes(search) && !seen.has(`v:${vendedor}:${linea}:${gerencia}`)) {
        seen.add(`v:${vendedor}:${linea}:${gerencia}`)
        results.push({ type: "vendedor", value: vendedor, context: { linea, gerencia }, primaNeta: prima })
      }
    }

    return results.slice(0, 20)
  } catch {
    return []
  }
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
    // Canonical source (must exist in DB): bi_dashboard.vw_ramos_prima
    // Columns expected: ramo, prima_oficial, polizas, anio, periodo
    let query = supabase
      .schema("bi_dashboard")
      .from("vw_ramos_prima")
      .select("ramo, prima_oficial, polizas, anio, periodo")

    if (año) query = query.eq("anio", parseInt(año))
    if (periodo) query = query.eq("periodo", periodo)

    const { data, error } = await query
    if (error || !data?.length) return null

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (data as any[])
      .map((row) => ({
        ramo: String(row.ramo || "Sin ramo"),
        primaNeta: Math.round(Number(row.prima_oficial) || 0),
        polizas: Number(row.polizas) || 0,
      }))
      .sort((a, b) => b.primaNeta - a.primaNeta)
  } catch {
    return null
  }
}

/**
 * Get available periodos from bi_dashboard.fact_primas
 */
export async function getPeriodos(): Promise<number[] | null> {
  try {
    const { data, error } = await supabase
      .schema("bi_dashboard")
      .from("fact_primas")
      .select("mes")
      .not("mes", "is", null)
      .limit(5000)

    if (error || !data?.length) return null

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const set = new Set<number>()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const r of data as any[]) {
      const num = MONTH_NAME_TO_NUMBER[String(r.mes || "")]
      if (num) set.add(num)
    }

    const unique = Array.from(set).sort((a, b) => a - b)
    return unique
  } catch {
    return null
  }
}

/**
 * Fetch vendedores grouped by tipo (Plata, Oro, Platino, etc.) for compromisos page
 * Requires JOIN with catalogos_agentes on VendNombre = NombreCompleto
 */
export interface VendedorByTipoRow {
  vendedor: string
  tipo: string
  primaNeta: number
}

// Full vendedor data including tier and all 9 columns
export interface VendedorFullRow {
  vendedor: string
  tipo: string
  primaNeta: number
  pnAnioAnt: number
  presupuesto: number | null
  diferencia: number | null
  pctDifPpto: number | null
  difYoY: number | null
  pctDifYoY: number | null
  pendiente: number | null
}

// Tier group with full vendedor data (all 9 columns per vendedor)
export interface TierGroup {
  tipo: string
  vendedores: VendedorFullRow[]
  // Tier totals (sums of all vendedores in tier)
  totalPrimaNeta: number
  totalPresupuesto: number | null
  totalDiferencia: number | null
  pctDifPpto: number | null
  totalPnAnioAnt: number | null
  totalDifYoY: number | null
  pctDifYoY: number | null
  totalPendiente: number | null
}

/**
 * Get aseguradoras by clasificación from catalogos_cias
 * Returns array of CiaAbreviacion values matching the classification
 */
export async function getAseguradorasByClasificacion(
  clasificacion: string
): Promise<string[] | null> {
  if (!clasificacion || clasificacion === "Todas") return null
  try {
    const { data, error } = await supabase
      .from("catalogos_cias")
      .select("CiaAbreviacion")
      .eq("ClasCia_TXT", clasificacion)

    if (error || !data?.length) return null
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (data as any[]).map(r => r.CiaAbreviacion)
  } catch {
    return null
  }
}

export async function getVendedoresByTipo(
  linea: string,
  periodo?: number,
  año?: string,
  gerencia?: string,
  _clasificacionAseguradoras?: string[] | null
): Promise<{ tipo: string; vendedores: VendedorByTipoRow[]; total: number }[] | null> {
  try {
    const months = monthNamesFromAcumuladoPeriodo(periodo)

    // Fetch vendedores from bi_dashboard source
    let query = supabase
      .schema("bi_dashboard")
      .from("fact_primas")
      .select("vendedor, prima_neta_cobrada")
      .eq("linea_negocio", linea)
      .not("vendedor", "is", null)

    if (gerencia) query = query.eq("gerencia", gerencia)
    if (año) query = query.eq("año", parseInt(año))
    if (months.length > 0) query = query.in("mes", months)

    const { data, error } = await query.limit(10000)
    if (error || !data?.length) return null

    // Group by vendedor first
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const vendedorMap: Record<string, number> = {}
    for (const row of data as any[]) {
      const vendedor = String(row.vendedor || "Sin vendedor")
      vendedorMap[vendedor] = (vendedorMap[vendedor] || 0) + (Number(row.prima_neta_cobrada) || 0)
    }

    // Fetch tipo for each vendedor from catalogos_agentes
    const vendedores = Object.keys(vendedorMap)
    const { data: catData } = await supabase
      .from("catalogos_agentes")
      .select("NombreCompleto, TipoVend_TXT")
      .in("NombreCompleto", vendedores)

    // Map vendedor -> tipo
    const tipoMap: Record<string, string> = {}
    if (catData) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const cat of catData as any[]) {
        tipoMap[cat.NombreCompleto] = cat.TipoVend_TXT || "Sin clasificar"
      }
    }

    // Group by tipo
    const byTipo: Record<string, VendedorByTipoRow[]> = {}
    for (const [vendedor, prima] of Object.entries(vendedorMap)) {
      const tipo = tipoMap[vendedor] || "Sin clasificar"
      if (!byTipo[tipo]) byTipo[tipo] = []
      byTipo[tipo].push({ vendedor, tipo, primaNeta: Math.round(prima) })
    }

    // Sort vendedores within each tipo by primaNeta desc
    for (const tipo in byTipo) {
      byTipo[tipo].sort((a, b) => b.primaNeta - a.primaNeta)
    }

    // Return as array with totals
    return Object.entries(byTipo)
      .map(([tipo, vendedores]) => ({
        tipo,
        vendedores,
        total: vendedores.reduce((s, v) => s + v.primaNeta, 0)
      }))
      .sort((a, b) => b.total - a.total)
  } catch {
    return null
  }
}

/**
 * Fetch vendedores with full data (all 9 columns) grouped by tier.
 * This merges getVendedores (full data with YoY) with tier mapping from catalogos_agentes.
 * Used for Click Franquicias and Click Promotorías tier grouper.
 *
 * RESILIENCE STRATEGY:
 * 1. If prior year data for specific period is empty, fetch ALL periods of prior year
 * 2. If prior year total is still 0, use CURRENT year share for presupuesto allocation
 * 3. If no share data at all, fall back to equal distribution among vendedores
 */
export async function getVendedoresWithTipo(
  gerencia: string,
  linea: string,
  periodo?: number,
  año?: string,
  _clasificacionAseguradoras?: string[] | null,
  lineaPpto?: number,
  lineaPendiente?: number
): Promise<TierGroup[] | null> {
  try {
    const months = monthNamesFromAcumuladoPeriodo(periodo)

    // 1) Current year vendedor data from bi_dashboard
    let query = supabase
      .schema("bi_dashboard")
      .from("fact_primas")
      .select("vendedor, prima_neta_cobrada")
      .eq("gerencia", gerencia)
      .eq("linea_negocio", linea)
      .not("vendedor", "is", null)
      .limit(10000)

    if (año) query = query.eq("año", parseInt(año))
    if (months.length > 0) query = query.in("mes", months)

    const { data, error } = await query
    if (error || !data?.length) return null

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const grouped: Record<string, number> = {}
    for (const row of data as any[]) {
      const vendedor = String(row.vendedor || "Sin vendedor")
      grouped[vendedor] = (grouped[vendedor] || 0) + (Number(row.prima_neta_cobrada) || 0)
    }

    // 2) Prior year data for YoY
    const priorYear = año ? String(parseInt(año) - 1) : String(new Date().getFullYear() - 1)

    let queryPY = supabase
      .schema("bi_dashboard")
      .from("fact_primas")
      .select("vendedor, prima_neta_cobrada")
      .eq("gerencia", gerencia)
      .eq("linea_negocio", linea)
      .eq("año", parseInt(priorYear))
      .not("vendedor", "is", null)
      .limit(10000)

    if (months.length > 0) queryPY = queryPY.in("mes", months)

    let { data: dataPY } = await queryPY
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let groupedPY: Record<string, number> = {}
    if (dataPY && dataPY.length > 0) {
      for (const row of dataPY as any[]) {
        const vendedor = String(row.vendedor || "Sin vendedor")
        groupedPY[vendedor] = (groupedPY[vendedor] || 0) + (Number(row.prima_neta_cobrada) || 0)
      }
    }

    let pnAnioAntTotal = Object.values(groupedPY).reduce((s, v) => s + v, 0)

    // FALLBACK 1: if period-specific prior year is empty, use full prior year and scale
    if (pnAnioAntTotal === 0 && periodo) {
      const { data: dataPYFull } = await supabase
        .schema("bi_dashboard")
        .from("fact_primas")
        .select("vendedor, prima_neta_cobrada")
        .eq("gerencia", gerencia)
        .eq("linea_negocio", linea)
        .eq("año", parseInt(priorYear))
        .not("vendedor", "is", null)
        .limit(20000)

      if (dataPYFull && dataPYFull.length > 0) {
        groupedPY = {}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        for (const row of dataPYFull as any[]) {
          const vendedor = String(row.vendedor || "Sin vendedor")
          groupedPY[vendedor] = (groupedPY[vendedor] || 0) + (Number(row.prima_neta_cobrada) || 0)
        }

        pnAnioAntTotal = Object.values(groupedPY).reduce((s, v) => s + v, 0)
        if (pnAnioAntTotal > 0) {
          const scaleFactor = 1 / 12
          for (const key of Object.keys(groupedPY)) {
            groupedPY[key] = groupedPY[key] * scaleFactor
          }
          pnAnioAntTotal = pnAnioAntTotal * scaleFactor
        }
      }
    }

    // 3) Fetch tier mapping from catalogos_agentes
    const vendedorNames = Object.keys(grouped)
    const { data: catData } = await supabase
      .from("catalogos_agentes")
      .select("NombreCompleto, TipoVend_TXT")
      .in("NombreCompleto", vendedorNames)

    const tipoMap: Record<string, string> = {}
    if (catData) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const cat of catData as any[]) {
        tipoMap[cat.NombreCompleto] = cat.TipoVend_TXT || "Sin clasificar"
      }
    }

    // 4) Calculate totals for budget allocation
    const ppto = lineaPpto ?? 0
    const pendienteTotal = lineaPendiente ?? 0

    // FALLBACK 2: If prior year total is still 0, use CURRENT year share
    const pnCurrentTotal = Object.values(grouped).reduce((s, v) => s + v, 0)
    const useCurrentYearShare = pnAnioAntTotal === 0 && pnCurrentTotal > 0
    const shareTotal = useCurrentYearShare ? pnCurrentTotal : pnAnioAntTotal

    // FALLBACK 3: If no share data at all, use equal distribution
    const vendedorCount = vendedorNames.length
    const useEqualDistribution = shareTotal === 0 && ppto > 0 && vendedorCount > 0

    const byTipo: Record<string, VendedorFullRow[]> = {}

    for (const [vendedor, primaNeta] of Object.entries(grouped)) {
      const tipo = tipoMap[vendedor] || "Sin clasificar"
      const pnAnioAnt = groupedPY[vendedor] || 0

      let share: number
      if (useEqualDistribution) {
        share = 1 / vendedorCount
      } else if (useCurrentYearShare) {
        share = pnCurrentTotal > 0 ? primaNeta / pnCurrentTotal : 0
      } else {
        share = pnAnioAntTotal > 0 ? pnAnioAnt / pnAnioAntTotal : 0
      }

      const presupuesto = ppto > 0 && share > 0 ? Math.round(ppto * share) : (ppto > 0 && useEqualDistribution ? Math.round(ppto / vendedorCount) : null)
      const diferencia = presupuesto !== null && presupuesto > 0 ? Math.round(primaNeta) - presupuesto : null
      const pctDifPpto = presupuesto !== null && presupuesto > 0 && diferencia !== null
        ? Math.round((diferencia / presupuesto) * 1000) / 10
        : null
      const difYoY = pnAnioAnt > 0 ? Math.round(primaNeta) - Math.round(pnAnioAnt) : (pnAnioAnt === 0 && primaNeta > 0 ? Math.round(primaNeta) : null)
      const pctDifYoY = pnAnioAnt > 0 && difYoY !== null
        ? Math.round((difYoY / pnAnioAnt) * 10000) / 100
        : null
      const pendiente = pendienteTotal > 0 && share > 0 ? Math.round(pendienteTotal * share) : null

      if (!byTipo[tipo]) byTipo[tipo] = []
      byTipo[tipo].push({
        vendedor,
        tipo,
        primaNeta: Math.round(primaNeta),
        pnAnioAnt: Math.round(pnAnioAnt),
        presupuesto,
        diferencia,
        pctDifPpto,
        difYoY,
        pctDifYoY,
        pendiente
      })
    }

    const result: TierGroup[] = []

    for (const [tipo, vendedores] of Object.entries(byTipo)) {
      vendedores.sort((a, b) => b.primaNeta - a.primaNeta)

      const totalPrimaNeta = vendedores.reduce((s, v) => s + v.primaNeta, 0)
      const totalPresupuestoSum = vendedores.reduce((s, v) => s + (v.presupuesto ?? 0), 0)
      const totalPnAnioAntSum = vendedores.reduce((s, v) => s + v.pnAnioAnt, 0)
      const totalPendienteSum = vendedores.reduce((s, v) => s + (v.pendiente ?? 0), 0)

      const totalDiferencia = totalPresupuestoSum > 0 ? totalPrimaNeta - totalPresupuestoSum : null
      const tierPctDifPpto = totalPresupuestoSum > 0 && totalDiferencia !== null
        ? Math.round((totalDiferencia / totalPresupuestoSum) * 1000) / 10
        : null
      const totalDifYoY = totalPnAnioAntSum > 0 ? totalPrimaNeta - totalPnAnioAntSum : null
      const tierPctDifYoY = totalPnAnioAntSum > 0 && totalDifYoY !== null
        ? Math.round((totalDifYoY / totalPnAnioAntSum) * 10000) / 100
        : null

      result.push({
        tipo,
        vendedores,
        totalPrimaNeta,
        totalPresupuesto: totalPresupuestoSum > 0 ? totalPresupuestoSum : null,
        totalDiferencia,
        pctDifPpto: tierPctDifPpto,
        totalPnAnioAnt: totalPnAnioAntSum > 0 ? totalPnAnioAntSum : null,
        totalDifYoY,
        pctDifYoY: tierPctDifYoY,
        totalPendiente: totalPendienteSum > 0 ? totalPendienteSum : null
      })
    }

    result.sort((a, b) => b.totalPrimaNeta - a.totalPrimaNeta)
    return result
  } catch {
    return null
  }
}
