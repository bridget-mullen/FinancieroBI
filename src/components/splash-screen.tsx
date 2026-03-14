"use client"

import { useState, useEffect } from "react"

export function SplashScreen({ children }: { children: React.ReactNode }) {
  const [isVisible, setIsVisible] = useState(true)
  const [isFading, setIsFading] = useState(false)
  const [isRemoved, setIsRemoved] = useState(false)

  useEffect(() => {
    // Start fade out after 1.5 seconds
    const fadeTimer = setTimeout(() => {
      setIsFading(true)
    }, 1500)

    // Remove from DOM after fade completes (1.5s + 300ms)
    const removeTimer = setTimeout(() => {
      setIsVisible(false)
      setIsRemoved(true)
    }, 1800)

    return () => {
      clearTimeout(fadeTimer)
      clearTimeout(removeTimer)
    }
  }, [])

  return (
    <>
      {!isRemoved && isVisible && (
        <div
          className={`fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-[#041224] transition-opacity duration-300 ${
            isFading ? "opacity-0" : "opacity-100"
          }`}
        >
          {/* CKL C Logosymbol */}
          <div className="animate-scale-in mb-6">
            <svg
              width="120"
              height="120"
              viewBox="0 0 120 120"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              {/* Top half of C - Red */}
              <path
                d="M60 10C32.4 10 10 32.4 10 60H20C20 37.9 37.9 20 60 20C71.5 20 81.8 24.7 89.1 32.1L96.2 25C87.1 15.8 74.2 10 60 10Z"
                fill="#E62800"
              />
              {/* Bottom half of C - Navy with lighter stroke */}
              <path
                d="M60 110C87.6 110 110 87.6 110 60H100C100 82.1 82.1 100 60 100C48.5 100 38.2 95.3 30.9 87.9L23.8 95C32.9 104.2 45.8 110 60 110Z"
                fill="#041224"
                stroke="#2a3d52"
                strokeWidth="1.5"
              />
              {/* Left side of C - connects both halves */}
              <path
                d="M10 60C10 87.6 32.4 110 60 110L60 100C37.9 100 20 82.1 20 60H10Z"
                fill="#E62800"
              />
              <path
                d="M110 60C110 32.4 87.6 10 60 10L60 20C82.1 20 100 37.9 100 60H110Z"
                fill="#041224"
                stroke="#2a3d52"
                strokeWidth="1.5"
              />
            </svg>
          </div>

          {/* Click SEGUROS text */}
          <div className="mb-8 text-center">
            <div className="text-3xl font-bold tracking-wide">
              <span className="text-[#E62800]">C</span>
              <span className="text-white">lick</span>
            </div>
            <div className="text-xl font-bold tracking-[0.3em] text-[#E62800]">
              SEGUROS
            </div>
          </div>

          {/* Loading dots */}
          <div className="flex gap-2">
            <div className="h-2 w-2 rounded-full bg-[#E62800] animate-pulse-dot [animation-delay:0ms]" />
            <div className="h-2 w-2 rounded-full bg-[#E62800] animate-pulse-dot [animation-delay:200ms]" />
            <div className="h-2 w-2 rounded-full bg-[#E62800] animate-pulse-dot [animation-delay:400ms]" />
          </div>

          {/* BI Dashboard text at bottom */}
          <div className="absolute bottom-8 text-white/60 text-sm tracking-wider">
            BI Dashboard
          </div>
        </div>
      )}

      {/* Animations in style tag */}
      <style jsx global>{`
        @keyframes scale-in {
          0% {
            transform: scale(0.8);
            opacity: 0;
          }
          100% {
            transform: scale(1);
            opacity: 1;
          }
        }

        @keyframes pulse-dot {
          0%,
          100% {
            opacity: 0.3;
          }
          50% {
            opacity: 1;
          }
        }

        .animate-scale-in {
          animation: scale-in 500ms ease-out forwards;
        }

        .animate-pulse-dot {
          animation: pulse-dot 800ms ease-in-out infinite;
        }
      `}</style>

      {children}
    </>
  )
}
