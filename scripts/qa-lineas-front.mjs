#!/usr/bin/env node

const BASE_URL = process.env.LINEAS_BASE_URL || "https://financiero-bi-dashboard.vercel.app"

const EXPECTED_LINEAS = new Set([
  "Click Franquicias",
  "Click Promotorías",
  "Cartera Tradicional",
  "Corporate",
  "Call Center",
])

const BASELINES = {
  "2026|2": {
    primaNeta: 107_957_790,
    anioAnterior: 97_203_356,
    presupuesto: 129_487_071,
  },
  "2026|3": {
    primaNeta: 123_265_505,
    anioAnterior: 93_406_660,
    presupuesto: 125_689_028,
  },
  "2026|1,2,3": {
    primaNeta: 342_549_519,
    anioAnterior: 298_146_434,
    presupuesto: 395_523_484,
  },
}

function sum(rows, key) {
  return rows.reduce((acc, row) => acc + (Number(row?.[key]) || 0), 0)
}

function fail(message) {
  console.error(`❌ ${message}`)
  process.exitCode = 1
}

async function fetchLineas(year, meses) {
  const mesesParam = meses.join(",")
  const url = `${BASE_URL}/api/lineas?year=${year}&meses=${mesesParam}`

  const t0 = Date.now()
  const response = await fetch(url, { cache: "no-store" })
  const elapsedMs = Date.now() - t0

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}`)
  }

  const data = await response.json()

  return {
    url,
    elapsedMs,
    source: response.headers.get("x-lineas-source") || "unknown",
    data,
  }
}

function validateShape(label, rows) {
  if (!Array.isArray(rows)) {
    fail(`${label}: response is not an array`)
    return
  }

  if (rows.length !== 5) {
    fail(`${label}: expected 5 rows, got ${rows.length}`)
  }

  const gotLineas = new Set(rows.map((r) => String(r?.nombre || "")))
  for (const expected of EXPECTED_LINEAS) {
    if (!gotLineas.has(expected)) {
      fail(`${label}: missing línea '${expected}'`)
    }
  }
}

function validateBaseline(label, key, rows) {
  const baseline = BASELINES[key]
  if (!baseline) return

  const totals = {
    primaNeta: sum(rows, "primaNeta"),
    anioAnterior: sum(rows, "anioAnterior"),
    presupuesto: sum(rows, "presupuesto"),
  }

  for (const metric of Object.keys(baseline)) {
    if (totals[metric] !== baseline[metric]) {
      fail(`${label}: ${metric} expected ${baseline[metric]}, got ${totals[metric]}`)
    }
  }
}

async function run() {
  console.log(`Running lineas QA against ${BASE_URL}`)

  const checks = [
    { label: "Feb 2026", year: 2026, meses: [2] },
    { label: "Mar 2026", year: 2026, meses: [3] },
    { label: "Acum Ene-Mar 2026", year: 2026, meses: [1, 2, 3] },
  ]

  for (const check of checks) {
    const { data, elapsedMs, source } = await fetchLineas(check.year, check.meses)
    const key = `${check.year}|${check.meses.join(",")}`

    validateShape(check.label, data)
    validateBaseline(check.label, key, data)

    console.log(
      `✅ ${check.label}: source=${source} time=${elapsedMs}ms totals pn=${sum(data, "primaNeta")} aa=${sum(data, "anioAnterior")} ppto=${sum(data, "presupuesto")}`
    )
  }

  // Stability smoke: 3 sequential calls on the most-used filter
  for (let i = 1; i <= 3; i += 1) {
    const { elapsedMs, source } = await fetchLineas(2026, [2])
    console.log(`✅ Smoke #${i}: source=${source} time=${elapsedMs}ms`)

    if (elapsedMs > 2500) {
      fail(`Smoke #${i}: slow response (${elapsedMs}ms > 2500ms)`)
    }
  }

  if (process.exitCode && process.exitCode !== 0) {
    console.error("\nQA finished with issues.")
    process.exit(process.exitCode)
  }

  console.log("\nQA passed.")
}

run().catch((error) => {
  console.error(`❌ QA crashed: ${error.message}`)
  process.exit(1)
})
