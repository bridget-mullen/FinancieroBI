import { createClient } from "@supabase/supabase-js"
import { NextRequest, NextResponse } from "next/server"

function cleanEnv(value?: string): string {
  return (value || "").replace(/\n/g, "").trim()
}

const FALLBACK_SUPABASE_URL = "https://ktqelgafkywncetxiosd.supabase.co"
const FALLBACK_SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt0cWVsZ2Fma3l3bmNldHhpb3NkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTQ1NTkzNSwiZXhwIjoyMDg3MDMxOTM1fQ.LpqL_ufAcygIc8CWs8W_cmTG0bnLR327JxQZVmL3WlI"

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

    const envUrl = cleanEnv(process.env.NEXT_PUBLIC_SUPABASE_URL)
    const envServiceRoleKey = cleanEnv(process.env.SUPABASE_SERVICE_ROLE_KEY)
    const anonKey = cleanEnv(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)

    const supabaseUrl = envUrl.includes("ktqelgafkywncetxiosd") ? envUrl : FALLBACK_SUPABASE_URL
    const serviceRoleKey = envServiceRoleKey && envServiceRoleKey.length > 100 ? envServiceRoleKey : FALLBACK_SERVICE_ROLE_KEY
    const apiKey = serviceRoleKey || anonKey
    if (!supabaseUrl || !apiKey) return NextResponse.json({ lineas: [], gerenciasByLinea: {} }, { headers: { "Cache-Control": "no-store" } })

    const supabase = createClient(supabaseUrl, apiKey)
    const lineasSet = new Set<string>()
    const gerByLinea = new Map<string, Set<string>>()

    const rows = await fetchAll(() =>
      supabase
        .from(`efectuada_${year}_drive`)
        .select("LBussinesNombre, GerenciaNombre")
        .order("IDDocto", { ascending: true })
    )

    for (const r of rows) {
      const linea = String(r.LBussinesNombre || "").trim()
      const gerencia = String(r.GerenciaNombre || "").trim()
      if (!linea) continue
      lineasSet.add(linea)
      if (!gerByLinea.has(linea)) gerByLinea.set(linea, new Set<string>())
      if (gerencia) gerByLinea.get(linea)!.add(gerencia)
    }

    // Fallback merge from catalog to avoid missing options when source sync/policies lag.
    const catRows = await fetchAll(() =>
      supabase
        .from("catalogo_lineas_negocio_drive")
        .select("Linea, Gerencia")
    )
    for (const r of catRows) {
      const linea = String(r.Linea || "").trim()
      const gerencia = String(r.Gerencia || "").trim()
      if (!linea) continue
      lineasSet.add(linea)
      if (!gerByLinea.has(linea)) gerByLinea.set(linea, new Set<string>())
      if (gerencia) gerByLinea.get(linea)!.add(gerencia)
    }

    const lineas = Array.from(lineasSet).sort((a, b) => a.localeCompare(b, "es", { sensitivity: "base" }))
    const gerenciasByLinea: Record<string, string[]> = {}
    for (const l of lineas) {
      gerenciasByLinea[l] = Array.from(gerByLinea.get(l) || []).sort((a, b) => a.localeCompare(b, "es", { sensitivity: "base" }))
    }

    return NextResponse.json({ lineas, gerenciasByLinea }, { headers: { "Cache-Control": "no-store" } })
  } catch {
    return NextResponse.json({ lineas: [], gerenciasByLinea: {} }, { headers: { "Cache-Control": "no-store" } })
  }
}
