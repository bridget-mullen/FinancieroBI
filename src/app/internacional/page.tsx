"use client"

import { useEffect } from "react"
import { PageTabs } from "@/components/page-tabs"
import { PageFooter } from "@/components/page-footer"

export default function InternacionalPage() {
  useEffect(() => { document.title = "Internacional | CLK BI Dashboard" }, [])
  return (
    <div className="min-h-screen bg-[#FAFAFA] px-3 py-4 flex flex-col">
      <div className="max-w-[1200px] mx-auto w-full flex flex-col flex-1">
      <PageTabs />
      <div className="bg-white rounded-lg shadow flex flex-col items-center justify-center py-24 text-center">
        <div className="mb-6 text-[#041224] font-bold text-xl tracking-wide font-lato">
          Click<span className="text-[#E62800]">SEGUROS</span>
        </div>
        <p className="text-[#888] text-[16px] mb-1">Módulo en desarrollo</p>
        <p className="text-[#BBB] text-[14px]">Próximamente disponible</p>
      </div>
      <PageFooter />
      </div>
    </div>
  )
}
