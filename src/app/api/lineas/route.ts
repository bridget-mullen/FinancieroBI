import { createClient } from "@supabase/supabase-js"
import { NextRequest, NextResponse } from "next/server"

// Server-side Supabase client with service_role key (bypasses row limits)
const supabase = createClient(
  "https://ktqelgafkywncetxiosd.supabase.co",
  process.env.SUPABASE_SERVICE_ROLE_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt0cWVsZ2Fma3l3bmNldHhpb3NkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTQ1NTkzNSwiZXhwIjoyMDg3MDMxOTM1fQ.LpqL_ufAcygIc8CWs8W_cmTG0bnLR327JxQZVmL3WlI"
)

function calcPrima(row: Record<string, unknown>): number {
  const prima = (row.PrimaNeta as number) || 0
  const tc = (row.TCPago as number) || 1
  const desc = parseFloat(row.Descuento as string) || 0
  return (prima - desc) * tc
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const year = parseInt(searchParams.get("year") || "2026")
  const mesesParam = searchParams.get("meses") // comma-separated: "1,2,3"
  const meses = mesesParam ? mesesParam.split(",").map(Number) : null

  try {
    // Fetch current year + prior year in parallel using service_role (no 1000 row limit)
    const buildQuery = (yr: number) => {
      let q = supabase
        .from("dashboard_data")
        .select("LBussinesNombre, PrimaNeta, TCPago, Descuento")
        .eq("anio", yr)
      if (meses && meses.length > 0) {
        q = q.in("mes", meses)
      }
      return q.limit(50000) // service_role allows this
    }

    const [currentRes, priorRes] = await Promise.all([
      buildQuery(year),
      buildQuery(year - 1),
    ])

    // Aggregate by LBussinesNombre
    const groupBy = (rows: Record<string, unknown>[]) => {
      const grouped: Record<string, number> = {}
      for (const row of rows) {
        const k = (row.LBussinesNombre as string) || "?"
        grouped[k] = (grouped[k] || 0) + calcPrima(row)
      }
      return grouped
    }

    const currentGrouped = currentRes.data ? groupBy(currentRes.data as Record<string, unknown>[]) : {}
    const priorGrouped = priorRes.data ? groupBy(priorRes.data as Record<string, unknown>[]) : {}

    const allLineas = new Set([...Object.keys(currentGrouped), ...Object.keys(priorGrouped)])

    const result = Array.from(allLineas).map(nombre => ({
      nombre,
      primaNeta: Math.round(currentGrouped[nombre] || 0),
      anioAnterior: Math.round(priorGrouped[nombre] || 0),
    })).sort((a, b) => b.primaNeta - a.primaNeta)

    return NextResponse.json(result, {
      headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" }
    })
  } catch (err) {
    return NextResponse.json({ error: "Failed to fetch" }, { status: 500 })
  }
}
