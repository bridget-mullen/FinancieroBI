import type { Metadata } from "next"
import { Lato } from "next/font/google"
import "./globals.css"
import { AuthProvider } from "@/lib/auth-context"
import { SplashScreen } from "@/components/splash-screen"

const lato = Lato({ subsets: ["latin"], weight: ["300", "400", "700", "900"] })

export const metadata: Metadata = {
  title: "CLK BI Dashboard",
  description: "Dashboard de inteligencia de negocios — Click Seguros",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className={lato.className}>
        <AuthProvider>
          <SplashScreen>
            {/* NO SIDEBAR - Full width like Power BI */}
            <main className="min-h-screen bg-[#F5F5F5]">
              {children}
            </main>
          </SplashScreen>
        </AuthProvider>
      </body>
    </html>
  )
}
// Force rebuild Sun Mar  1 17:40:28 CST 2026
