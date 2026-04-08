import { createClient } from "@supabase/supabase-js"
import { NextRequest, NextResponse } from "next/server"

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

function cleanEnv(value?: string): string {
  return (value || "").replace(/\\n/g, "").trim()
}

interface FactPrimaLineaRow {
  linea_negocio: string | null
  prima_neta_cobrada: number | null
  presupuesto: number | null
  pendiente: number | null
  ["año_anterior"]: number | null
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const year = parseInt(searchParams.get("year") || "2026", 10)
  const mesesParam = searchParams.get("meses")
  const meses = mesesParam
    ? mesesParam
        .split(",")
        .map((m) => parseInt(m, 10))
        .filter((m) => Number.isFinite(m) && m >= 1 && m <= 12)
    : []

  const monthNames = meses
    .map((m) => MONTH_NUMBER_TO_NAME[m])
    .filter((m): m is string => Boolean(m))

  try {
    const supabaseUrl = cleanEnv(process.env.NEXT_PUBLIC_SUPABASE_URL)
    // IMPORTANT:
    // bi_dashboard is currently readable with anon key in production,
    // while service_role key is returning permission denied for that schema.
    const anonKey = cleanEnv(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
    const serviceRoleKey = cleanEnv(process.env.SUPABASE_SERVICE_ROLE_KEY)
    const apiKey = anonKey || serviceRoleKey

    if (!supabaseUrl || !apiKey) {
      return NextResponse.json(
        { error: "Supabase env not configured (NEXT_PUBLIC_SUPABASE_URL + key)" },
        { status: 500 }
      )
    }

    const supabase = createClient(supabaseUrl, apiKey)

    let query = supabase
      .schema("bi_dashboard")
      .from("fact_primas")
      .select("linea_negocio, prima_neta_cobrada, año_anterior, presupuesto, pendiente")
      .eq("año", year)
      .is("gerencia", null)
      .is("vendedor", null)

    if (monthNames.length > 0) {
      query = query.in("mes", monthNames)
    }

    const { data, error } = await query

    if (error) {
      throw new Error(`Supabase fact_primas error: ${error.message}`)
    }

    const rows = (data || []) as unknown as FactPrimaLineaRow[]

    const grouped = new Map<string, { primaNeta: number; anioAnterior: number; presupuesto: number; pendiente: number }>()
    for (const row of rows) {
      const nombre = row.linea_negocio || "Sin línea"
      const current = grouped.get(nombre) || { primaNeta: 0, anioAnterior: 0, presupuesto: 0, pendiente: 0 }
      current.primaNeta += row.prima_neta_cobrada || 0
      current.anioAnterior += row["año_anterior"] || 0
      current.presupuesto += row.presupuesto || 0
      current.pendiente += row.pendiente || 0
      grouped.set(nombre, current)
    }

    const result = Array.from(grouped.entries())
      .map(([nombre, values]) => ({
        nombre,
        primaNeta: Math.round(values.primaNeta),
        anioAnterior: Math.round(values.anioAnterior),
        presupuesto: Math.round(values.presupuesto),
        pendiente: Math.round(values.pendiente),
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
