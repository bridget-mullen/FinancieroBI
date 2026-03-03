"use client"

import React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"

const TABS = [
  { href: "/", label: "Tacómetro" },
  { href: "/tabla-detalle", label: "Tabla detalle" },
  { href: "/compromisos", label: "Vendedores" },
  { href: "/internacional", label: "Aseguradoras" },
  { href: "/corporate", label: "Corporate" },
  { href: "/cobranza", label: "Convenios" },
]

interface PageTabsProps {
  alertCount?: number // Badge for Tabla detalle
}

export function PageTabs({ alertCount }: PageTabsProps) {
  const pathname = usePathname()

  return (
    <div className="flex items-center">
      {TABS.map((tab, i) => (
        <React.Fragment key={tab.href}>
          {i > 0 && <span className="text-gray-300 mx-2">|</span>}
          <Link href={tab.href} className={`text-sm tracking-wide font-medium ${pathname === tab.href ? "text-gray-900 font-bold" : "text-gray-500 hover:text-gray-700"}`}>
            {tab.label}
            {tab.href === "/tabla-detalle" && alertCount !== undefined && alertCount > 0 && (
              <span className="inline-flex items-center justify-center w-4 h-4 text-[9px] font-bold bg-red-600 text-white rounded-full ml-1">
                {alertCount}
              </span>
            )}
          </Link>
        </React.Fragment>
      ))}
    </div>
  )
}
