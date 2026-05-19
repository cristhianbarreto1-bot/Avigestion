'use client'
import { useState } from 'react'

const ITEMS = [
  { tag: 'Sanidad', color: 'bg-blue-50 text-blue-700', title: 'Calendario de vacunación — pollo parrillero', body: `Día 1 (planta de incubación): Vacuna Marek.
Día 7-10: Newcastle + Bronquitis infecciosa (vía agua o spray).
Día 14-16: Gumboro (vía agua de bebida).
Día 21-24: Newcastle + Bronquitis refuerzo.
Día 28-30: Gumboro refuerzo (en zonas de alto riesgo).

Nota: los calendarios varían según zona geográfica y recomendación del veterinario de área. Siempre consultar antes de modificar el plan.` },
  { tag: 'Nutrición', color: 'bg-emerald-50 text-emerald-700', title: 'Fases de alimentación en pollos de engorde', body: `Fase 1 – Iniciador (0 a 10 días): 22-23% proteína bruta.
Fase 2 – Crecimiento (11 a 24 días): 19-20% proteína bruta.
Fase 3 – Terminación (25 a 35 días): 17-18% proteína bruta.
Fase 4 – Pre-faena (35+ días): 16% proteína, sin coccidiostatos.

El consumo de agua debe ser al menos el doble del consumo de alimento. Controlar siempre bebederos.` },
  { tag: 'Bioseguridad', color: 'bg-amber-50 text-amber-700', title: 'Protocolo de ingreso al establecimiento', body: `1. Ducharse antes de ingresar al predio.
2. Usar ropa y calzado exclusivo del establecimiento.
3. Pasar por pediluvio con solución desinfectante activa (cambiar solución cada 24 hs).
4. No visitar otras granjas avícolas el mismo día.
5. Vehículos: desinfección de ruedas y parte inferior antes de ingreso.
6. Registrar nombre, hora y motivo de visita en el libro de ingresos.
7. Personal con síntomas respiratorios no debe ingresar.` },
  { tag: 'Manejo', color: 'bg-blue-50 text-blue-700', title: 'Control ambiental en galpones cerrados', body: `Temperatura por semana:
Sem 1: 32-34°C  |  Sem 2: 30-32°C  |  Sem 3: 28-30°C  |  Sem 4+: 24-26°C

Humedad relativa ideal: 50-70%.
Ventilación mínima: 0.1 m³/hora por kg de ave viva.
Niveles de amoníaco: mantener por debajo de 25 ppm.
Niveles de CO₂: no superar 3000 ppm.

Monitorear al menos 3 veces por día en las primeras 2 semanas.` },
  { tag: 'Registros', color: 'bg-emerald-50 text-emerald-700', title: 'Registro diario de producción — qué anotar', body: `Los registros básicos que debe tener cada galpón:
✓ Mortandad: cantidad de bajas y descripción del cuadro.
✓ Consumo de alimento (kg totales consumidos).
✓ Consumo de agua (litros totales).
✓ Temperatura mínima y máxima del galpón.
✓ Peso promedio (registro semanal con muestra mínima de 50 aves).
✓ Observaciones sanitarias relevantes.
✓ Visitas veterinarias y tratamientos realizados.` },
  { tag: 'Economía', color: 'bg-amber-50 text-amber-700', title: 'Cómo interpretar el Índice de Conversión Alimenticia (ICA)', body: `El ICA indica cuántos kg de alimento se necesitan para producir 1 kg de peso vivo.

Rangos de referencia en pollo parrillero:
- ICA < 1.7: Excelente
- ICA 1.7 - 1.9: Bueno
- ICA 1.9 - 2.1: Aceptable
- ICA > 2.1: Revisar alimentación, sanidad y manejo

Factores que elevan el ICA: temperatura inadecuada, baja calidad del alimento, enfermedades subclínicas, mal manejo de bebederos.` },
  { tag: 'Sanidad', color: 'bg-blue-50 text-blue-700', title: 'Manejo sanitario en pollos parrilleros', body: `Limpiar y desinfectar el galpón 15 días antes del ingreso. Aplicar cal viva en pisos.
Vacunar al día 1 contra Newcastle/Bronquitis y repetir a los 14 días.
Controlar cama seca, temperatura (34°C semana 1, reducir 3°C/semana) y ventilación.

Mortalidad diaria normal: 0.1-0.3%. Si supera 0.5%, revisar temperatura, ventilación, agua y sanidad.` },
  { tag: 'Nutrición', color: 'bg-emerald-50 text-emerald-700', title: 'Control de conversión alimenticia en lotes de engorde', body: `ICA = alimento consumido total (kg) / peso vivo ganado (kg).
Un ICA de 1.8 es excelente para parrilleros. Por encima de 2.2 indica problemas.

Pesaje semanal recomendado desde el día 7.
Muestra mínima: 50 aves para representatividad estadística.
Registrar siempre el consumo de alimento diario por galpón.` },
]

export default function InstructivosPage() {
  const [open, setOpen] = useState<number | null>(null)
  const [filtro, setFiltro] = useState('')

  const filtrados = filtro ? ITEMS.filter(i => i.tag === filtro) : ITEMS

  return (
    <div className="p-7">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-gray-900">Instructivos técnicos</h1>
        <p className="text-sm text-gray-500 mt-1">Material de referencia para la gestión sanitaria, nutricional y productiva</p>
      </div>

      {/* Filtros */}
      <div className="flex gap-2 flex-wrap mb-5">
        {['', 'Sanidad', 'Nutrición', 'Manejo', 'Bioseguridad', 'Registros', 'Economía'].map(f => (
          <button key={f} onClick={() => setFiltro(f)}
            className={`text-xs px-3 py-1.5 rounded-full font-semibold transition-all ${
              filtro === f ? 'bg-emerald-700 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}>
            {f || 'Todos'}
          </button>
        ))}
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        {filtrados.map((item, i) => (
          <div key={i} className="border-b border-gray-100 last:border-0">
            <button
              onClick={() => setOpen(open === i ? null : i)}
              className="w-full flex items-center justify-between p-4 text-left hover:bg-gray-50 transition-colors">
              <div className="flex items-center gap-3">
                <span className={`text-xs px-2.5 py-1 rounded-full font-semibold shrink-0 ${item.color}`}>{item.tag}</span>
                <span className="text-sm font-medium text-gray-800">{item.title}</span>
              </div>
              <span className="text-gray-400 text-lg ml-4 shrink-0">{open === i ? '−' : '+'}</span>
            </button>
            {open === i && (
              <div className="px-4 pb-5 bg-gray-50">
                <div className="text-sm text-gray-600 leading-relaxed whitespace-pre-line border-l-2 border-emerald-300 pl-4">
                  {item.body}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
