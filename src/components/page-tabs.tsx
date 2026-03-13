"use client"

import React, { useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { ChevronDown } from "lucide-react"

const TABS = [
  { href: "/", label: "Tacómetro" },
  { href: "/tabla-detalle", label: "Tabla detalle" },
  { href: "/compromisos", label: "Vendedores" },
  { href: "/internacional", label: "Aseguradoras" },
  { href: "/corporate", label: "Corporate" },
  { href: "/cobranza", label: "Convenios" },
]

export function PageTabs() {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const current = TABS.find(t => t.href === pathname) || TABS[0]

  return (
    <>
      {/* Mobile: dropdown selector */}
      <div className="md:hidden relative w-full">
        <button
          onClick={() => setOpen(!open)}
          className="w-full flex items-center justify-between bg-white border border-gray-200 rounded-lg px-3 py-2.5 text-sm font-bold text-gray-900 shadow-sm"
        >
          <span>{current.label}</span>
          <ChevronDown className={`w-4 h-4 text-gray-500 transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
        {open && (
          <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 overflow-hidden">
            {TABS.map((tab) => (
              <Link
                key={tab.href}
                href={tab.href}
                onClick={() => setOpen(false)}
                className={`block px-3 py-2.5 text-sm font-medium transition-colors ${
                  pathname === tab.href
                    ? "bg-gray-100 text-gray-900 font-bold"
                    : "text-gray-600 hover:bg-gray-50"
                }`}
              >
                {tab.label}
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Desktop: horizontal tabs */}
      <div className="hidden md:flex items-center">
        {TABS.map((tab, i) => (
          <React.Fragment key={tab.href}>
            {i > 0 && <span className="text-gray-300 mx-2">|</span>}
            <Link href={tab.href} className={`text-sm tracking-wide font-medium ${pathname === tab.href ? "text-gray-900 font-bold" : "text-gray-500 hover:text-gray-700"}`}>
              {tab.label}
            </Link>
          </React.Fragment>
        ))}
      </div>
    </>
  )
}
