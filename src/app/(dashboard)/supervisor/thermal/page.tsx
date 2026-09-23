'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Thermometer, Droplets, Wind, Info, ChevronLeft } from 'lucide-react'
import { calculateThermalComfort, THERMAL_STATUS_COLORS, formatThermalStatusLabel } from '@/lib/thermal-comfort'

export default function ThermalComfortCalculator() {
  const router = useRouter()
  
  const [ageDays, setAgeDays] = useState<number>(15)
  const [tempC, setTempC] = useState<number>(28)
  const [hrPct, setHrPct] = useState<number>(65)
  const [airVelocityMs, setAirVelocityMs] = useState<number>(0.5)

  const result = calculateThermalComfort({ tempC, hrPct, airVelocityMs, ageDays })
  const colors = THERMAL_STATUS_COLORS[result.effectiveTempStatus]

  return (
    <div className="min-h-screen bg-[#070d0a] text-[#f0fdf4] font-sans p-4 md:p-8">
      <div className="max-w-md mx-auto mt-4">
        
        <button 
          onClick={() => router.back()}
          className="flex items-center text-[#94a3b8] hover:text-white mb-6 transition-colors"
        >
          <ChevronLeft className="w-5 h-5 mr-1" /> Volver
        </button>

        <h1 className="text-2xl font-extrabold text-white mb-2">Calculadora de Confort</h1>
        <p className="text-[#94a3b8] text-sm mb-6">
          Calcula la Temperatura Mágica (T+HR) y Sensación Térmica.
        </p>

        {/* CONTROLES */}
        <div className="bg-[#0d1810] border border-[#1a3022] rounded-2xl p-5 mb-6 space-y-6">
          
          <div>
            <label className="block text-xs font-bold text-[#94a3b8] uppercase mb-2">Edad del lote (días): {ageDays}</label>
            <input 
              type="range" min="0" max="56" value={ageDays}
              onChange={(e) => setAgeDays(Number(e.target.value))}
              className="w-full accent-[#22c55e]"
            />
          </div>

          <div>
            <label className="flex items-center text-xs font-bold text-[#94a3b8] uppercase mb-2">
              <Thermometer className="w-4 h-4 mr-1 text-[#f97316]" /> Temp. Ambiente (°C): {tempC.toFixed(1)}
            </label>
            <input 
              type="range" min="15" max="45" step="0.5" value={tempC}
              onChange={(e) => setTempC(Number(e.target.value))}
              className="w-full accent-[#f97316]"
            />
          </div>

          <div>
            <label className="flex items-center text-xs font-bold text-[#94a3b8] uppercase mb-2">
              <Droplets className="w-4 h-4 mr-1 text-[#3b82f6]" /> Humedad Relativa (%): {hrPct}
            </label>
            <input 
              type="range" min="20" max="100" step="5" value={hrPct}
              onChange={(e) => setHrPct(Number(e.target.value))}
              className="w-full accent-[#3b82f6]"
            />
          </div>

          <div>
            <label className="flex items-center text-xs font-bold text-[#94a3b8] uppercase mb-2">
              <Wind className="w-4 h-4 mr-1 text-[#a855f7]" /> Velocidad del Aire (m/s): {airVelocityMs.toFixed(1)}
            </label>
            <input 
              type="range" min="0" max="4" step="0.5" value={airVelocityMs}
              onChange={(e) => setAirVelocityMs(Number(e.target.value))}
              className="w-full accent-[#a855f7]"
            />
            <div className="text-[10px] text-[#4b5563] mt-1 text-right">{result.windChillStage}</div>
          </div>
        </div>

        {/* RESULTADO */}
        <div 
          className="rounded-2xl p-6 border transition-colors"
          style={{ backgroundColor: colors.bg, borderColor: colors.border }}
        >
          <div className="flex justify-between items-start mb-4">
            <div>
              <p className="text-sm font-semibold opacity-80" style={{ color: colors.text }}>
                Sensación Térmica (Efectiva)
              </p>
              <h2 className="text-5xl font-black mt-1 tracking-tighter text-white">
                {result.effectiveTemp.toFixed(1)}°C
              </h2>
            </div>
            <div className="text-right">
              <span className="inline-block px-3 py-1 rounded-full text-xs font-bold bg-black/30 text-white">
                {formatThermalStatusLabel(result.effectiveTempStatus)}
              </span>
            </div>
          </div>

          <p className="text-sm font-medium mt-4 leading-relaxed text-white/90">
            {result.recommendation}
          </p>

          <div className="mt-6 pt-4 border-t border-black/10 grid grid-cols-2 gap-4">
            <div>
              <p className="text-[10px] uppercase font-bold opacity-70 mb-1" style={{ color: colors.text }}>Temp. Mágica (T+HR)</p>
              <p className="text-lg font-bold text-white">{result.magicSum}</p>
              <p className="text-[10px] text-white/70">Objetivo: {result.magicSumIdeal}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase font-bold opacity-70 mb-1" style={{ color: colors.text }}>Efecto Viento</p>
              <p className="text-lg font-bold text-white">{result.windChill > 0 ? '+' : ''}{result.windChill.toFixed(1)}°C</p>
              <p className="text-[10px] text-white/70">Efecto Humedad: {result.hrCorrection > 0 ? '+' : ''}{result.hrCorrection}°C</p>
            </div>
          </div>
        </div>

      </div>
    </div>
  )
}
