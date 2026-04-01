import { supabase } from "./supabase"

/**
 * Fetch ALL rows from a Supabase query using pagination.
 * Supabase anon key caps at 1000 rows per request, so we paginate with .range().
 * IMPORTANT: .range() on a Supabase query builder is safe to call multiple times.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchAll(queryBuilder: any, pageSize = 1000): Promise<Record<string, unknown>[]> {
  const allRows: Record<string, unknown>[] = []
  let from = 0
  const maxRows = 200000 // safety cap
  // eslint-disable-next-line no-constant-condition
  while (from < maxRows) {
    const to = from + pageSize - 1
    const { data, error } = await queryBuilder.range(from, to)
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
  { nombre: "Click Franquicias", primaNeta: 40408947, anioAnterior: 34942381, presupuesto: 68989976 },
  { nombre: "Click Promotorías", primaNeta: 15085498, anioAnterior: 15564029, presupuesto: 25534211 },
  { nombre: "Corporate", primaNeta: 7510534, anioAnterior: 11522043, presupuesto: 16242717 },
  { nombre: "Cartera Tradicional", primaNeta: 7487717, anioAnterior: 8369169, presupuesto: 12322087 },
  { nombre: "Call Center", primaNeta: 2064472, anioAnterior: 696810, presupuesto: 6398081 },
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

    if (periodo) query = query.eq("mes", periodo)
    if (año) query = query.eq("anio", parseInt(año))

    // Use pagination to fetch ALL rows for accurate aggregation
    const allData = await fetchAll(query)
    if (!allData.length) return null

    const grouped = groupBySum(allData, "LBussinesNombre")

    return Object.entries(grouped)
      .map(([linea, prima]) => ({ linea, primaNeta: Math.round(prima) }))
      .sort((a, b) => b.primaNeta - a.primaNeta)
  } catch {
    return null
  }
}

/**
 * Fetch líneas with YoY comparison (current year + prior year).
 * Returns LineaRow[] compatible with the home page gauge/table.
 * Presupuesto is taken from SEED if no presupuestos table exists.
 */
export async function getLineasWithYoY(
  periodos?: number[],
  año?: string
): Promise<LineaRow[] | null> {
  try {
    const currentYear = año ? parseInt(año) : new Date().getFullYear()
    const priorYear = currentYear - 1

    // Build month filter: support multiple periodos
    const buildQuery = (yr: number) => {
      let q = supabase
        .from("dashboard_data")
        .select("LBussinesNombre, PrimaNeta, TCPago, Descuento, FLiquidacion")
        .eq("anio", yr)
      if (periodos && periodos.length > 0) {
        q = q.in("mes", periodos)
      }
      return q
    }

    const [currentRows, priorRows] = await Promise.all([
      fetchAll(buildQuery(currentYear)),
      fetchAll(buildQuery(priorYear)),
    ])

    const groupedCurrent = groupBySum(currentRows, "LBussinesNombre")
    const groupedPrior = groupBySum(priorRows, "LBussinesNombre")

    // Merge all líneas from both years
    const allLineas = new Set([...Object.keys(groupedCurrent), ...Object.keys(groupedPrior)])

    // Map seed presupuestos by name for fallback
    const seedMap: Record<string, number> = {}
    for (const s of SEED_LINEAS) seedMap[s.nombre] = s.presupuesto

    const result: LineaRow[] = Array.from(allLineas).map(nombre => ({
      nombre,
      primaNeta: Math.round(groupedCurrent[nombre] || 0),
      anioAnterior: Math.round(groupedPrior[nombre] || 0),
      presupuesto: seedMap[nombre] || 0,
    }))

    return result.sort((a, b) => b.primaNeta - a.primaNeta)
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
}

export async function getGerencias(
  linea: string,
  periodo?: number,
  año?: string,
  clasificacionAseguradoras?: string[] | null
): Promise<GerenciaRow[] | null> {
  try {
    // Current year query
    let query = supabase
      .from("dashboard_data")
      .select("GerenciaNombre, PrimaNeta, TCPago, Descuento, FLiquidacion, CiaAbreviacion")
      .eq("LBussinesNombre", linea)
      .limit(5000)

    if (periodo) query = query.eq("mes", periodo)
    if (año) query = query.eq("anio", parseInt(año))
    if (clasificacionAseguradoras?.length) query = query.in("CiaAbreviacion", clasificacionAseguradoras)

    const { data, error } = await query
    if (error || !data?.length) return null

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const grouped = groupBySum(data as any[], "GerenciaNombre")

    // Prior year query for YoY comparison
    const priorYear = año ? String(parseInt(año) - 1) : String(new Date().getFullYear() - 1)
    let queryPY = supabase
      .from("dashboard_data")
      .select("GerenciaNombre, PrimaNeta, TCPago, Descuento, FLiquidacion, CiaAbreviacion")
      .eq("LBussinesNombre", linea)
      .eq("anio", parseInt(priorYear))
      .limit(5000)

    if (periodo) queryPY = queryPY.eq("mes", periodo)
    if (clasificacionAseguradoras?.length) queryPY = queryPY.in("CiaAbreviacion", clasificacionAseguradoras)

    const { data: dataPY } = await queryPY
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const groupedPY = dataPY ? groupBySum(dataPY as any[], "GerenciaNombre") : {}

    return Object.entries(grouped)
      .map(([gerencia, prima]) => ({
        gerencia,
        primaNeta: Math.round(prima),
        pnAnioAnt: Math.round(groupedPY[gerencia] || 0)
      }))
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
}

export async function getVendedores(
  gerencia: string,
  linea: string,
  periodo?: number,
  año?: string,
  clasificacionAseguradoras?: string[] | null
): Promise<VendedorRow[] | null> {
  try {
    let query = supabase
      .from("dashboard_data")
      .select("VendNombre, PrimaNeta, TCPago, Descuento, FLiquidacion, CiaAbreviacion")
      .eq("GerenciaNombre", gerencia)
      .eq("LBussinesNombre", linea)
      .limit(5000)

    if (periodo) query = query.eq("mes", periodo)
    if (año) query = query.eq("anio", parseInt(año))
    if (clasificacionAseguradoras?.length) query = query.in("CiaAbreviacion", clasificacionAseguradoras)

    const { data, error } = await query
    if (error || !data?.length) return null

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const grouped = groupBySum(data as any[], "VendNombre")

    // Prior year query for YoY
    const priorYear = año ? String(parseInt(año) - 1) : String(new Date().getFullYear() - 1)
    let queryPY = supabase
      .from("dashboard_data")
      .select("VendNombre, PrimaNeta, TCPago, Descuento, FLiquidacion, CiaAbreviacion")
      .eq("GerenciaNombre", gerencia)
      .eq("LBussinesNombre", linea)
      .eq("anio", parseInt(priorYear))
      .limit(5000)

    if (periodo) queryPY = queryPY.eq("mes", periodo)
    if (clasificacionAseguradoras?.length) queryPY = queryPY.in("CiaAbreviacion", clasificacionAseguradoras)

    const { data: dataPY } = await queryPY
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const groupedPY = dataPY ? groupBySum(dataPY as any[], "VendNombre") : {}

    return Object.entries(grouped)
      .map(([vendedor, prima]) => ({
        vendedor,
        primaNeta: Math.round(prima),
        pnAnioAnt: Math.round(groupedPY[vendedor] || 0)
      }))
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
 * Fetch grupos for a given vendedor + gerencia + línea with YoY comparison
 */
export interface GrupoRow {
  grupo: string
  cliente: string
  primaNeta: number
  pnAnioAnt: number
}

export async function getGrupos(
  vendedor: string,
  gerencia: string,
  linea: string,
  periodo?: number,
  año?: string,
  clasificacionAseguradoras?: string[] | null
): Promise<GrupoRow[] | null> {
  try {
    let query = supabase
      .from("dashboard_data")
      .select("Grupo, NombreCompleto, PrimaNeta, TCPago, Descuento, FLiquidacion, CiaAbreviacion")
      .eq("VendNombre", vendedor)
      .eq("GerenciaNombre", gerencia)
      .eq("LBussinesNombre", linea)

    if (periodo) query = query.eq("mes", periodo)
    if (año) query = query.eq("anio", parseInt(año))
    if (clasificacionAseguradoras?.length) query = query.in("CiaAbreviacion", clasificacionAseguradoras)

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

    // Prior year query for YoY
    const priorYear = año ? String(parseInt(año) - 1) : String(new Date().getFullYear() - 1)
    let queryPY = supabase
      .from("dashboard_data")
      .select("Grupo, PrimaNeta, TCPago, Descuento, FLiquidacion, CiaAbreviacion")
      .eq("VendNombre", vendedor)
      .eq("GerenciaNombre", gerencia)
      .eq("LBussinesNombre", linea)
      .eq("anio", parseInt(priorYear))

    if (periodo) queryPY = queryPY.eq("mes", periodo)
    if (clasificacionAseguradoras?.length) queryPY = queryPY.in("CiaAbreviacion", clasificacionAseguradoras)

    const { data: dataPY } = await queryPY
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const groupedPY: Record<string, number> = {}
    if (dataPY) {
      for (const row of dataPY as any[]) {
        const g = (row.Grupo as string) || "Sin grupo"
        groupedPY[g] = (groupedPY[g] || 0) + calcPrima(row)
      }
    }

    return Object.entries(grouped)
      .map(([grupo, d]) => ({
        grupo,
        cliente: d.cliente,
        primaNeta: Math.round(d.prima),
        pnAnioAnt: Math.round(groupedPY[grupo] || 0)
      }))
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
}

export async function getClientes(
  grupo: string,
  vendedor: string,
  gerencia: string,
  linea: string,
  periodo?: number,
  año?: string,
  clasificacionAseguradoras?: string[] | null
): Promise<ClienteRow[] | null> {
  try {
    let query = supabase
      .from("dashboard_data")
      .select("NombreCompleto, PrimaNeta, TCPago, Descuento, FLiquidacion, CiaAbreviacion")
      .eq("Grupo", grupo)
      .eq("VendNombre", vendedor)
      .eq("GerenciaNombre", gerencia)
      .eq("LBussinesNombre", linea)

    if (periodo) query = query.eq("mes", periodo)
    if (año) query = query.eq("anio", parseInt(año))
    if (clasificacionAseguradoras?.length) query = query.in("CiaAbreviacion", clasificacionAseguradoras)

    const { data, error } = await query
    if (error || !data?.length) return null

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const grouped = groupBySum(data as any[], "NombreCompleto")

    // Prior year query for YoY
    const priorYear = año ? String(parseInt(año) - 1) : String(new Date().getFullYear() - 1)
    let queryPY = supabase
      .from("dashboard_data")
      .select("NombreCompleto, PrimaNeta, TCPago, Descuento, FLiquidacion, CiaAbreviacion")
      .eq("Grupo", grupo)
      .eq("VendNombre", vendedor)
      .eq("GerenciaNombre", gerencia)
      .eq("LBussinesNombre", linea)
      .eq("anio", parseInt(priorYear))

    if (periodo) queryPY = queryPY.eq("mes", periodo)
    if (clasificacionAseguradoras?.length) queryPY = queryPY.in("CiaAbreviacion", clasificacionAseguradoras)

    const { data: dataPY } = await queryPY
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const groupedPY = dataPY ? groupBySum(dataPY as any[], "NombreCompleto") : {}

    return Object.entries(grouped)
      .map(([cliente, prima]) => ({
        cliente,
        primaNeta: Math.round(prima),
        pnAnioAnt: Math.round(groupedPY[cliente] || 0)
      }))
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
  año?: string,
  clasificacionAseguradoras?: string[] | null
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

    if (periodo) query = query.eq("mes", periodo)
    if (año) query = query.eq("anio", parseInt(año))
    if (clasificacionAseguradoras?.length) query = query.in("CiaAbreviacion", clasificacionAseguradoras)

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
    if (periodo) query = query.eq("mes", periodo)
    if (año) query = query.eq("anio", parseInt(año))
    const allData = await fetchAll(query)
    if (!allData.length) return null
    const grouped = groupBySum(allData, "VendNombre")
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
  clasificacion?: string
): Promise<{ aseguradora: string; primaNeta: number }[] | null> {
  try {
    let query = supabase
      .from("dashboard_data")
      .select("CiaAbreviacion, PrimaNeta, TCPago, Descuento, FLiquidacion")
    if (periodo) query = query.eq("mes", periodo)
    if (año) query = query.eq("anio", parseInt(año))
    const allData = await fetchAll(query)
    if (!allData.length) return null
    const grouped = groupBySum(allData, "CiaAbreviacion")

    // If clasificación filter is set, filter aseguradoras by ClasCia_TXT from catalogos_cias
    if (clasificacion && clasificacion !== "Todas") {
      const aseguradoras = Object.keys(grouped)
      const { data: ciaData } = await supabase
        .from("catalogos_cias")
        .select("CiaAbreviacion, ClasCia_TXT")
        .in("CiaAbreviacion", aseguradoras)
        .eq("ClasCia_TXT", clasificacion)

      if (ciaData) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const filteredCias = new Set((ciaData as any[]).map(c => c.CiaAbreviacion))
        const filtered: Record<string, number> = {}
        for (const [cia, prima] of Object.entries(grouped)) {
          if (filteredCias.has(cia)) filtered[cia] = prima
        }
        return Object.entries(filtered)
          .map(([aseguradora, prima]) => ({ aseguradora, primaNeta: Math.round(prima) }))
          .sort((a, b) => b.primaNeta - a.primaNeta)
      }
      return []
    }

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
    // Use anio + mes columns for accurate last date detection
    const { data, error } = await supabase
      .from("dashboard_data")
      .select("anio, mes")
      .not("anio", "is", null)
      .not("mes", "is", null)
      .order("anio", { ascending: false })
      .order("mes", { ascending: false })
      .limit(1)
    if (error || !data?.length) return null
    const row = data[0] as Record<string, unknown>
    const anio = row.anio as number
    const mes = row.mes as number
    // Last day of that month
    const lastDay = new Date(anio, mes, 0).getDate()
    const dd = String(lastDay).padStart(2, "0")
    const mm = String(mes).padStart(2, "0")
    return `${dd}/${mm}/${anio}`
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
    if (año) q = q.eq("anio", parseInt(año))
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
    if (periodo) query = query.eq("mes", periodo)
    if (año) query = query.eq("anio", parseInt(año))
    const allData = await fetchAll(query)
    if (!allData.length) return null
    const grouped: Record<string, { prima: number; count: number }> = {}
    for (const row of allData) {
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
    const { data, error} = await supabase
      .from("dashboard_data")
      .select("mes")
      .not("mes", "is", null)
      .limit(5000)

    if (error || !data?.length) return null

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const set = new Set<number>()
    for (const r of data as any[]) { set.add(r.mes as number) }
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
  clasificacionAseguradoras?: string[] | null
): Promise<{ tipo: string; vendedores: VendedorByTipoRow[]; total: number }[] | null> {
  try {
    // Fetch vendedores with tipo from catalogos_agentes
    // Note: This requires catalogos_agentes table with columns: NombreCompleto, TipoVend_TXT
    let query = supabase
      .from("dashboard_data")
      .select(`
        VendNombre,
        PrimaNeta,
        TCPago,
        Descuento,
        FLiquidacion,
        CiaAbreviacion
      `)
      .eq("LBussinesNombre", linea)

    if (gerencia) query = query.eq("GerenciaNombre", gerencia)
    if (periodo) query = query.eq("mes", periodo)
    if (año) query = query.eq("anio", parseInt(año))
    if (clasificacionAseguradoras?.length) query = query.in("CiaAbreviacion", clasificacionAseguradoras)

    const { data, error } = await query.limit(10000)

    if (error || !data?.length) return null

    // Group by vendedor first
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const vendedorMap = groupBySum(data as any[], "VendNombre")

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
  clasificacionAseguradoras?: string[] | null,
  lineaPpto?: number,
  lineaPendiente?: number
): Promise<TierGroup[] | null> {
  try {
    // 1. Fetch full vendedor data (current year)
    let query = supabase
      .from("dashboard_data")
      .select("VendNombre, PrimaNeta, TCPago, Descuento, FLiquidacion, CiaAbreviacion")
      .eq("GerenciaNombre", gerencia)
      .eq("LBussinesNombre", linea)
      .limit(5000)

    if (periodo) query = query.eq("mes", periodo)
    if (año) query = query.eq("anio", parseInt(año))
    if (clasificacionAseguradoras?.length) query = query.in("CiaAbreviacion", clasificacionAseguradoras)

    const { data, error } = await query
    if (error || !data?.length) return null

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const grouped = groupBySum(data as any[], "VendNombre")

    // 2. Fetch prior year data for YoY comparison — with fallback strategy
    const priorYear = año ? String(parseInt(año) - 1) : String(new Date().getFullYear() - 1)

    // First try: fetch prior year with same period filter
    let queryPY = supabase
      .from("dashboard_data")
      .select("VendNombre, PrimaNeta, TCPago, Descuento, FLiquidacion, CiaAbreviacion")
      .eq("GerenciaNombre", gerencia)
      .eq("LBussinesNombre", linea)
      .eq("anio", parseInt(priorYear))
      .limit(5000)

    if (periodo) queryPY = queryPY.eq("mes", periodo)
    if (clasificacionAseguradoras?.length) queryPY = queryPY.in("CiaAbreviacion", clasificacionAseguradoras)

    let { data: dataPY } = await queryPY
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let groupedPY = dataPY ? groupBySum(dataPY as any[], "VendNombre") : {}
    let pnAnioAntTotal = Object.values(groupedPY).reduce((s, v) => s + v, 0)

    // FALLBACK 1: If period-specific prior year data is empty, try fetching ALL periods of prior year
    if (pnAnioAntTotal === 0 && periodo) {
      const queryPYFull = supabase
        .from("dashboard_data")
        .select("VendNombre, PrimaNeta, TCPago, Descuento, FLiquidacion, CiaAbreviacion")
        .eq("GerenciaNombre", gerencia)
        .eq("LBussinesNombre", linea)
        .eq("anio", parseInt(priorYear))
        .limit(10000)

      const { data: dataPYFull } = await queryPYFull
      if (dataPYFull && dataPYFull.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        groupedPY = groupBySum(dataPYFull as any[], "VendNombre")
        pnAnioAntTotal = Object.values(groupedPY).reduce((s, v) => s + v, 0)
        // Scale the full-year data proportionally to match selected period count
        // If user selected 1 month, divide by 12 to approximate single-month share
        if (pnAnioAntTotal > 0) {
          const scaleFactor = 1 / 12 // Approximate: single month vs full year
          for (const key of Object.keys(groupedPY)) {
            groupedPY[key] = groupedPY[key] * scaleFactor
          }
          pnAnioAntTotal = pnAnioAntTotal * scaleFactor
        }
      }
    }

    // 3. Fetch tier mapping from catalogos_agentes
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

    // 4. Calculate totals for budget allocation
    const ppto = lineaPpto ?? 0
    const pendienteTotal = lineaPendiente ?? 0

    // FALLBACK 2: If prior year total is still 0, use CURRENT year total for share calculation
    const pnCurrentTotal = Object.values(grouped).reduce((s, v) => s + v, 0)
    const useCurrentYearShare = pnAnioAntTotal === 0 && pnCurrentTotal > 0
    const shareTotal = useCurrentYearShare ? pnCurrentTotal : pnAnioAntTotal

    // FALLBACK 3: If no share data at all, use equal distribution
    const vendedorCount = vendedorNames.length
    const useEqualDistribution = shareTotal === 0 && ppto > 0 && vendedorCount > 0

    // 5. Build full vendedor rows with all columns and group by tier
    const byTipo: Record<string, VendedorFullRow[]> = {}

    for (const [vendedor, primaNeta] of Object.entries(grouped)) {
      const tipo = tipoMap[vendedor] || "Sin clasificar"
      const pnAnioAnt = groupedPY[vendedor] || 0

      // Calculate share based on available data (prior year, current year, or equal)
      let share: number
      if (useEqualDistribution) {
        share = 1 / vendedorCount
      } else if (useCurrentYearShare) {
        share = pnCurrentTotal > 0 ? primaNeta / pnCurrentTotal : 0
      } else {
        share = pnAnioAntTotal > 0 ? pnAnioAnt / pnAnioAntTotal : 0
      }

      // Allocate presupuesto based on calculated share
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

    // 6. Sort vendedores within each tier and calculate tier totals
    const result: TierGroup[] = []

    for (const [tipo, vendedores] of Object.entries(byTipo)) {
      vendedores.sort((a, b) => b.primaNeta - a.primaNeta)

      // Calculate tier sums
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

    // Sort tiers by total prima descending
    result.sort((a, b) => b.totalPrimaNeta - a.totalPrimaNeta)

    return result
  } catch {
    return null
  }
}
