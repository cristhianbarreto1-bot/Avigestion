// @ts-nocheck
"use client"
import { useState, useEffect } from "react";

// ── PALETA & TOKENS ─────────────────────────────────────────
const C = {
  bg:        "#070d0a",
  surface:   "#0d1810",
  card:      "#111f16",
  border:    "#1a3022",
  borderHi:  "#234d32",
  green:     "#22c55e",
  greenDim:  "#166534",
  greenGlow: "#22c55e33",
  teal:      "#14b8a6",
  amber:     "#f59e0b",
  red:       "#ef4444",
  slate:     "#94a3b8",
  muted:     "#4b5563",
  white:     "#f0fdf4",
  gridLine:  "#0f2018",
};

// ── DATOS MOCK (simulan Supabase Realtime) ───────────────────
const FARMS = ["El Rancho Norte", "La Pampa Sur", "Don Juancho"];
const GENETICS = ["Cobb 500", "Ross 308", "Ross 308", "Cobb 500"];
const HOUSES_PER_FARM = [
  ["G-01","G-02","G-03","G-04"],
  ["Galpón A","Galpón B","Galpón C"],
  ["Norte 1","Norte 2","Sur 1","Sur 2","Sur 3"],
];

const SUPERVISORS_INIT = [
  { id:"s1", name:"Carlos Vega",    avatar:"CV", farm:0, house:1, online:true,  role:"supervisor", startedAt: Date.now()-41*60000 },
  { id:"s2", name:"Ana Ríos",       avatar:"AR", farm:1, house:0, online:true,  role:"supervisor", startedAt: Date.now()-18*60000 },
  { id:"s3", name:"Martín Godoy",   avatar:"MG", farm:2, house:3, online:true,  role:"supervisor", startedAt: Date.now()-7*60000  },
  { id:"s4", name:"Lucía Peralta",  avatar:"LP", farm:0, house:2, online:false, role:"supervisor", startedAt: Date.now()-200*60000},
];

const SECTIONS = [
  { id:"env",   icon:"🌡", label:"Ambiental" },
  { id:"water", icon:"💧", label:"Agua"      },
  { id:"feed",  icon:"🌾", label:"Alimento"  },
  { id:"health",icon:"🩺", label:"Sanidad"   },
  { id:"weight",icon:"⚖",  label:"Pesos"    },
];

function makeInspection(supId, farm, house, progress) {
  const score = 55 + Math.random() * 45;
  return {
    id: supId,
    farmName: FARMS[farm],
    houseName: HOUSES_PER_FARM[farm][house],
    genetic: GENETICS[farm],
    ageDays: 14 + Math.floor(Math.random() * 20),
    birdCount: 18000 + Math.floor(Math.random() * 7000),
    progress,
    completedSections: SECTIONS.slice(0, progress),
    score: Math.round(score),
    scoreLabel: score>=80?"Aprobado":score>=60?"Observado":"Crítico",
    mortality: +(Math.random()*0.6).toFixed(2),
    tempActual: +(22 + Math.random()*6).toFixed(1),
    tempOk: Math.random()>0.25,
    waterOk: Math.random()>0.2,
    lastUpdate: Date.now(),
  };
}

const INSPECTIONS_INIT = [
  makeInspection("s1", 0, 1, 4),
  makeInspection("s2", 1, 0, 2),
  makeInspection("s3", 2, 3, 1),
];

// Historial de alertas
const ALERTS_INIT = [
  { id:1, sev:"critical", farm:"El Rancho Norte", house:"G-02", msg:"Mortalidad 1.2% — supera umbral crítico", ts: Date.now()-4*60000,  sup:"Carlos Vega"   },
  { id:2, sev:"warning",  farm:"La Pampa Sur",    house:"Galpón A", msg:"Temperatura 29.4°C — fuera de rango", ts: Date.now()-11*60000, sup:"Ana Ríos"      },
  { id:3, sev:"warning",  farm:"Don Juancho",     house:"Sur 1", msg:"Consumo de agua 78% del estándar",  ts: Date.now()-23*60000, sup:"Martín Godoy"  },
  { id:4, sev:"info",     farm:"El Rancho Norte", house:"G-04", msg:"Inspección completada — Score 91%",  ts: Date.now()-55*60000, sup:"Lucía Peralta" },
  { id:5, sev:"critical", farm:"La Pampa Sur",    house:"Galpón B", msg:"Signos respiratorios detectados",ts: Date.now()-88*60000, sup:"Ana Ríos"      },
];

// Datos de gráficos
const MORTALITY_DATA = [
  {day:"D-6",ranch:0.18,pampa:0.22,juan:0.31},
  {day:"D-5",ranch:0.21,pampa:0.19,juan:0.28},
  {day:"D-4",ranch:0.15,pampa:0.35,juan:0.25},
  {day:"D-3",ranch:0.19,pampa:0.28,juan:0.33},
  {day:"D-2",ranch:0.24,pampa:0.31,juan:0.27},
  {day:"D-1",ranch:0.31,pampa:0.22,juan:0.19},
  {day:"Hoy",ranch:0.42,pampa:0.18,juan:0.22},
];

const WEIGHT_DATA = [
  {day:7, std:186, real:192}, {day:14, std:471, real:458},
  {day:21, std:930, real:915}, {day:28, std:1520, real:1490},
  {day:35, std:2250, real:2210},
];

// ── UTILIDADES ───────────────────────────────────────────────
function elapsed(ms) {
  const m = Math.floor((Date.now()-ms)/60000);
  if (m < 1) return "ahora";
  if (m < 60) return `${m}m`;
  return `${Math.floor(m/60)}h ${m%60}m`;
}
function scoreColor(s) {
  return s>=80 ? C.green : s>=60 ? C.amber : C.red;
}
function sevColor(s) {
  return s==="critical" ? C.red : s==="warning" ? C.amber : C.teal;
}

// ── MINI SPARKLINE ───────────────────────────────────────────
function Spark({ data, color="#22c55e", height=32 }) {
  const max = Math.max(...data), min = Math.min(...data);
  const norm = v => height - ((v-min)/(max-min+0.001))*(height-4);
  const pts = data.map((v,i)=>`${(i/(data.length-1))*100},${norm(v)}`).join(" ");
  return (
    <svg width="100%" height={height} viewBox={`0 0 100 ${height}`} preserveAspectRatio="none">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round"/>
      <polygon points={`0,${height} ${pts} 100,${height}`} fill={color} opacity="0.12"/>
    </svg>
  );
}

// ── BAR CHART MORTALIDAD ─────────────────────────────────────
function MortalityChart({ data }) {
  const colors = [C.green, C.teal, C.amber];
  const keys = ["ranch","pampa","juan"];
  const labels = ["El Rancho","La Pampa","Don Juancho"];
  const max = 0.5;
  return (
    <div style={{width:"100%"}}>
      {data.map((d,i)=>(
        <div key={i} style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
          <span style={{color:C.muted,fontSize:10,width:28,textAlign:"right",fontFamily:"monospace"}}>{d.day}</span>
          <div style={{flex:1,display:"flex",gap:2,height:14}}>
            {keys.map((k,j)=>(
              <div key={k} style={{
                height:"100%",background:colors[j],
                width:`${(d[k]/max)*100}%`,
                borderRadius:2,opacity:0.85,
                transition:"width 0.6s ease",
                minWidth:2,
              }}/>
            ))}
          </div>
          <span style={{color:C.muted,fontSize:10,width:28,fontFamily:"monospace"}}>
            {(d.ranch+d.pampa+d.juan).toFixed(2)}
          </span>
        </div>
      ))}
      <div style={{display:"flex",gap:12,marginTop:8,paddingLeft:36}}>
        {labels.map((l,i)=>(
          <div key={l} style={{display:"flex",alignItems:"center",gap:4}}>
            <div style={{width:8,height:8,borderRadius:2,background:colors[i]}}/>
            <span style={{color:C.muted,fontSize:10}}>{l}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── WEIGHT CHART ─────────────────────────────────────────────
function WeightChart({ data }) {
  const maxW = 2500, minW = 0;
  const W = 100, H = 70;
  const x = i => (i/(data.length-1))*W;
  const y = v => H - ((v-minW)/(maxW-minW))*H;
  const stdPts = data.map((d,i)=>`${x(i)},${y(d.std)}`).join(" ");
  const realPts = data.map((d,i)=>`${x(i)},${y(d.real)}`).join(" ");
  return (
    <svg width="100%" height={H+20} viewBox={`0 0 ${W} ${H+20}`} preserveAspectRatio="none">
      <polyline points={stdPts} fill="none" stroke={C.muted} strokeWidth="1" strokeDasharray="2,2"/>
      <polyline points={realPts} fill="none" stroke={C.green} strokeWidth="1.5"/>
      <polygon points={`0,${H} ${realPts} ${W},${H}`} fill={C.green} opacity="0.1"/>
      {data.map((d,i)=>(
        <circle key={i} cx={x(i)} cy={y(d.real)} r="1.5" fill={C.green}/>
      ))}
      {data.map((d,i)=>(
        <text key={i} x={x(i)} y={H+14} textAnchor="middle" fill={C.muted} fontSize="6">{`D${d.day}`}</text>
      ))}
    </svg>
  );
}

// ── SUPERVISOR CARD ──────────────────────────────────────────
function SupervisorCard({ sup, inspection, now }) {
  const pct = inspection ? (inspection.completedSections.length/5)*100 : 0;
  const isInspecting = !!inspection;
  const dur = Math.floor((now - sup.startedAt)/60000);

  return (
    <div style={{
      background:C.card, border:`1px solid ${C.border}`,
      borderRadius:14, padding:16, position:"relative", overflow:"hidden",
      boxShadow: sup.online && isInspecting ? `0 0 20px ${C.greenGlow}` : "none",
      transition:"box-shadow 0.5s ease",
    }}>
      {/* Pulso online */}
      {sup.online && (
        <div style={{
          position:"absolute",top:12,right:12,
          width:8,height:8,borderRadius:"50%",background:C.green,
          boxShadow:`0 0 8px ${C.green}`,
          animation:"pulse 2s infinite",
        }}/>
      )}
      {!sup.online && (
        <div style={{position:"absolute",top:12,right:12,width:8,height:8,borderRadius:"50%",background:C.muted}}/>
      )}

      {/* Header */}
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12}}>
        <div style={{
          width:38,height:38,borderRadius:10,
          background:`linear-gradient(135deg,${C.greenDim},${C.teal}33)`,
          border:`1px solid ${C.borderHi}`,
          display:"flex",alignItems:"center",justifyContent:"center",
          color:C.green,fontSize:12,fontWeight:800,letterSpacing:1,
        }}>{sup.avatar}</div>
        <div>
          <div style={{color:C.white,fontSize:13,fontWeight:700}}>{sup.name}</div>
          <div style={{color:C.slate,fontSize:11}}>
            {sup.online ? (isInspecting ? `Inspeccionando · ${dur}min` : "En línea") : "Desconectado"}
          </div>
        </div>
      </div>

      {isInspecting && (
        <>
          {/* Granja/Galpón */}
          <div style={{
            background:C.surface,borderRadius:8,padding:"8px 10px",marginBottom:10,
            border:`1px solid ${C.border}`,
          }}>
            <div style={{color:C.slate,fontSize:10,marginBottom:2}}>Ubicación actual</div>
            <div style={{color:C.white,fontSize:12,fontWeight:600}}>{inspection.farmName}</div>
            <div style={{color:C.green,fontSize:11}}>{inspection.houseName} · Lote día {inspection.ageDays} · {inspection.genetic}</div>
          </div>

          {/* Progreso de secciones */}
          <div style={{marginBottom:10}}>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
              <span style={{color:C.slate,fontSize:10}}>Progreso inspección</span>
              <span style={{color:C.green,fontSize:10,fontWeight:700}}>
                {inspection.completedSections.length}/5
              </span>
            </div>
            <div style={{display:"flex",gap:3}}>
              {SECTIONS.map((s,i)=>{
                const done = i < inspection.completedSections.length;
                const active = i === inspection.completedSections.length;
                return (
                  <div key={s.id} style={{
                    flex:1,height:6,borderRadius:3,
                    background: done ? C.green : active ? C.amber : C.border,
                    transition:"background 0.4s ease",
                    position:"relative",
                  }}>
                    {active && (
                      <div style={{
                        position:"absolute",inset:0,borderRadius:3,
                        background:`linear-gradient(90deg,${C.amber},transparent)`,
                        animation:"shimmer 1.5s infinite",
                      }}/>
                    )}
                  </div>
                );
              })}
            </div>
            <div style={{display:"flex",gap:3,marginTop:4}}>
              {SECTIONS.map((s,i)=>(
                <div key={s.id} style={{flex:1,textAlign:"center",fontSize:8,color:i<inspection.completedSections.length?C.green:C.muted}}>
                  {s.icon}
                </div>
              ))}
            </div>
          </div>

          {/* Datos en vivo */}
          {inspection.completedSections.length > 0 && (
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6}}>
              <div style={{background:C.surface,borderRadius:7,padding:"6px 8px",border:`1px solid ${C.border}`}}>
                <div style={{color:C.muted,fontSize:9}}>Mortalidad diaria</div>
                <div style={{color: inspection.mortality>0.5?C.red:inspection.mortality>0.3?C.amber:C.green, fontSize:14,fontWeight:800}}>
                  {inspection.mortality}%
                </div>
              </div>
              <div style={{background:C.surface,borderRadius:7,padding:"6px 8px",border:`1px solid ${C.border}`}}>
                <div style={{color:C.muted,fontSize:9}}>Temperatura</div>
                <div style={{color:inspection.tempOk?C.green:C.red,fontSize:14,fontWeight:800}}>
                  {inspection.tempActual}°C
                </div>
              </div>
            </div>
          )}

          {/* Score si completó */}
          {inspection.completedSections.length === 5 && (
            <div style={{
              marginTop:10,padding:"8px 12px",borderRadius:8,
              background:`${scoreColor(inspection.score)}18`,
              border:`1px solid ${scoreColor(inspection.score)}44`,
              display:"flex",justifyContent:"space-between",alignItems:"center",
            }}>
              <span style={{color:C.slate,fontSize:11}}>Score final</span>
              <span style={{color:scoreColor(inspection.score),fontSize:18,fontWeight:900}}>
                {inspection.score}% {inspection.scoreLabel}
              </span>
            </div>
          )}
        </>
      )}

      {!isInspecting && sup.online && (
        <div style={{color:C.muted,fontSize:11,textAlign:"center",padding:"8px 0"}}>
          Sin inspección activa
        </div>
      )}
      {!sup.online && (
        <div style={{color:C.muted,fontSize:11,textAlign:"center",padding:"8px 0"}}>
          Última conexión hace {elapsed(sup.startedAt)}
        </div>
      )}
    </div>
  );
}

// ── COMPONENTE PRINCIPAL ──────────────────────────────────────
export default function GerencialPage() {
  const [now, setNow] = useState(Date.now());
  const [supervisors] = useState(SUPERVISORS_INIT);
  const [inspections, setInspections] = useState(INSPECTIONS_INIT);
  const [alerts, setAlerts] = useState(ALERTS_INIT);
  const [activeTab, setActiveTab] = useState("overview");
  const [kpis, setKpis] = useState({
    activeBirds: 87400,
    activeLots: 9,
    avgMortality: 0.28,
    openAlerts: 3,
    criticalAlerts: 1,
    inspectionsToday: 6,
    avgScore: 78,
    mortalityTrend: [0.31,0.28,0.26,0.29,0.28,0.25,0.28],
    scoreTrend: [72,74,75,78,76,79,78],
  });

  // Simular actualizaciones en tiempo real (Supabase Realtime en prod)
  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 10000);
    return () => clearInterval(tick);
  }, []);

  // Simular avance de inspecciones
  useEffect(() => {
    const interval = setInterval(() => {
      setInspections(prev => prev.map(insp => {
        if (insp.progress < 5 && Math.random() > 0.6) {
          const newProg = insp.progress + 1;
          return {
            ...insp,
            progress: newProg,
            completedSections: SECTIONS.slice(0, newProg),
            lastUpdate: Date.now(),
          };
        }
        return insp;
      }));
      // Fluctuar mortalidad levemente
      setKpis(k => ({
        ...k,
        avgMortality: +(k.avgMortality + (Math.random()-0.5)*0.03).toFixed(3),
      }));
    }, 8000);
    return () => clearInterval(interval);
  }, []);

  // Simular nueva alerta ocasional
  useEffect(() => {
    const t = setTimeout(() => {
      const msgs = [
        {sev:"warning", farm:"El Rancho Norte", house:"G-01", msg:"CV de pesos 9.2% — baja uniformidad", sup:"Carlos Vega"},
        {sev:"info", farm:"La Pampa Sur", house:"Galpón B", msg:"Inspección iniciada", sup:"Ana Ríos"},
      ];
      const m = msgs[Math.floor(Math.random()*msgs.length)];
      setAlerts(a => [{id:Date.now(),...m,ts:Date.now()}, ...a].slice(0,12));
      setKpis(k=>({...k, openAlerts: k.openAlerts+(m.sev==="critical"?1:0)}));
    }, 20000);
    return () => clearTimeout(t);
  }, [alerts]);

  const onlineSups = supervisors.filter(s=>s.online);
  const activeSups = supervisors.filter(s=>s.online && inspections.find(i=>i.id===s.id));

  const tabs = [
    {id:"overview", label:"Vista General"},
    {id:"supervisors", label:"Supervisores en Campo"},
    {id:"analytics", label:"Análisis"},
    {id:"alerts", label:`Alertas ${kpis.openAlerts>0?`(${kpis.openAlerts})`:""}`, urgent: kpis.criticalAlerts>0},
  ];

  return (
    <div style={{
      minHeight:"100vh", background:C.bg, color:C.white,
      fontFamily:"'DM Sans', 'Segoe UI', system-ui, sans-serif",
      fontSize:14,
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700;800&family=DM+Mono:wght@400;500&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 4px; background: ${C.surface}; }
        ::-webkit-scrollbar-thumb { background: ${C.border}; border-radius: 4px; }
        @keyframes pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.6;transform:scale(1.3)} }
        @keyframes shimmer { 0%{opacity:0.3} 50%{opacity:1} 100%{opacity:0.3} }
        @keyframes fadeIn { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:translateY(0)} }
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0.3} }
        .tab-btn:hover { background: ${C.surface} !important; }
        .alert-row:hover { background: ${C.surface} !important; }
      `}</style>

      {/* ── HEADER ── */}
      <div style={{
        borderBottom:`1px solid ${C.border}`,
        padding:"0 24px",
        background:C.surface,
        position:"sticky",top:0,zIndex:100,
      }}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",height:56}}>
          {/* Logo */}
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <div style={{
              width:32,height:32,borderRadius:8,
              background:`linear-gradient(135deg,${C.greenDim},${C.teal}44)`,
              border:`1px solid ${C.borderHi}`,
              display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,
            }}>🐔</div>
            <div>
              <div style={{color:C.white,fontWeight:800,fontSize:15,letterSpacing:"-0.5px"}}>AviGestión</div>
              <div style={{color:C.green,fontSize:10,letterSpacing:"0.5px"}}>PANEL GERENCIAL</div>
            </div>
          </div>

          {/* Indicadores header */}
          <div style={{display:"flex",alignItems:"center",gap:20}}>
            <div style={{display:"flex",alignItems:"center",gap:6}}>
              <div style={{width:6,height:6,borderRadius:"50%",background:C.green,boxShadow:`0 0 6px ${C.green}`,animation:"pulse 2s infinite"}}/>
              <span style={{color:C.green,fontSize:12,fontWeight:600}}>
                {onlineSups.length} supervisores en línea
              </span>
            </div>
            {kpis.criticalAlerts > 0 && (
              <div style={{
                display:"flex",alignItems:"center",gap:6,
                background:`${C.red}18`,border:`1px solid ${C.red}44`,
                borderRadius:8,padding:"4px 10px",
                animation:"blink 2s infinite",
              }}>
                <span style={{fontSize:12}}>🔴</span>
                <span style={{color:C.red,fontSize:12,fontWeight:700}}>
                  {kpis.criticalAlerts} alerta crítica
                </span>
              </div>
            )}
            <div style={{
              background:C.card,border:`1px solid ${C.border}`,
              borderRadius:8,padding:"4px 12px",color:C.slate,fontSize:11,
              fontFamily:"'DM Mono', monospace",
            }}>
              {new Date().toLocaleTimeString("es-AR",{hour:"2-digit",minute:"2-digit"})} hs
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div style={{display:"flex",gap:4,paddingBottom:1}}>
          {tabs.map(t=>(
            <button key={t.id} className="tab-btn" onClick={()=>setActiveTab(t.id)} style={{
              background:"transparent",border:"none",cursor:"pointer",
              color: activeTab===t.id ? C.green : C.slate,
              fontFamily:"inherit",fontSize:13,fontWeight:activeTab===t.id?700:400,
              padding:"10px 14px",borderBottom:`2px solid ${activeTab===t.id?C.green:"transparent"}`,
              transition:"all 0.2s",position:"relative",
            }}>
              {t.label}
              {t.urgent && <span style={{
                position:"absolute",top:8,right:6,width:5,height:5,
                borderRadius:"50%",background:C.red,boxShadow:`0 0 6px ${C.red}`,
                animation:"pulse 1.5s infinite",
              }}/>}
            </button>
          ))}
        </div>
      </div>

      <div style={{padding:20,maxWidth:1400,margin:"0 auto"}}>

        {/* ══ TAB: VISTA GENERAL ══ */}
        {activeTab==="overview" && (
          <div style={{animation:"fadeIn 0.3s ease"}}>

            {/* KPI Cards */}
            <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12,marginBottom:20}}>
              {[
                { label:"Aves activas", value: kpis.activeBirds.toLocaleString("es"), sub:"en 9 lotes activos", icon:"🐔", color:C.green, trend:kpis.mortalityTrend },
                { label:"Mortalidad hoy", value:`${kpis.avgMortality.toFixed(2)}%`, sub:"promedio del día", icon:"📊", color:kpis.avgMortality>0.5?C.red:kpis.avgMortality>0.3?C.amber:C.green, trend:kpis.mortalityTrend },
                { label:"Score promedio", value:`${kpis.avgScore}%`, sub:"últimas 7 días", icon:"⭐", color:scoreColor(kpis.avgScore), trend:kpis.scoreTrend },
                { label:"Inspecciones hoy", value:kpis.inspectionsToday, sub:`${activeSups.length} en progreso`, icon:"✅", color:C.teal, trend:[3,4,5,6,6,7,6] },
              ].map((k,i)=>(
                <div key={i} style={{
                  background:C.card,border:`1px solid ${C.border}`,
                  borderRadius:14,padding:16,
                }}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}}>
                    <div>
                      <div style={{color:C.muted,fontSize:11,marginBottom:4}}>{k.label}</div>
                      <div style={{color:k.color,fontSize:24,fontWeight:900,letterSpacing:"-1px"}}>{k.value}</div>
                      <div style={{color:C.muted,fontSize:10,marginTop:2}}>{k.sub}</div>
                    </div>
                    <div style={{fontSize:22}}>{k.icon}</div>
                  </div>
                  <Spark data={k.trend} color={k.color}/>
                </div>
              ))}
            </div>

            {/* Segunda fila */}
            <div style={{display:"grid",gridTemplateColumns:"2fr 1fr",gap:12,marginBottom:20}}>

              {/* Supervisores activos — vista compacta */}
              <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:14,padding:16}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
                  <h3 style={{color:C.white,fontSize:13,fontWeight:700}}>Supervisores en campo ahora</h3>
                  <span style={{color:C.green,fontSize:11,background:`${C.green}18`,padding:"2px 8px",borderRadius:20}}>
                    {onlineSups.length} online
                  </span>
                </div>
                <div style={{display:"flex",flexDirection:"column",gap:8}}>
                  {supervisors.map(sup=>{
                    const insp = inspections.find(i=>i.id===sup.id);
                    const pct = insp ? (insp.completedSections.length/5)*100 : null;
                    return (
                      <div key={sup.id} style={{
                        display:"flex",alignItems:"center",gap:10,
                        background:C.surface,borderRadius:10,padding:"10px 12px",
                        border:`1px solid ${sup.online?C.border:"transparent"}`,
                        opacity: sup.online ? 1 : 0.5,
                      }}>
                        <div style={{
                          width:32,height:32,borderRadius:8,flexShrink:0,
                          background:`linear-gradient(135deg,${C.greenDim},${C.teal}22)`,
                          border:`1px solid ${C.borderHi}`,
                          display:"flex",alignItems:"center",justifyContent:"center",
                          color:C.green,fontSize:11,fontWeight:800,
                        }}>{sup.avatar}</div>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{color:C.white,fontSize:12,fontWeight:600}}>{sup.name}</div>
                          {insp && (
                            <div style={{color:C.slate,fontSize:11,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                              {insp.farmName} · {insp.houseName}
                            </div>
                          )}
                          {!insp && <div style={{color:C.muted,fontSize:11}}>{sup.online?"Sin inspección activa":"Desconectado"}</div>}
                        </div>
                        {pct !== null && (
                          <div style={{width:80,flexShrink:0}}>
                            <div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}>
                              <span style={{color:C.muted,fontSize:9}}>Progreso</span>
                              <span style={{color:C.green,fontSize:9,fontWeight:700}}>{Math.round(pct)}%</span>
                            </div>
                            <div style={{height:4,background:C.border,borderRadius:2,overflow:"hidden"}}>
                              <div style={{
                                height:"100%",width:`${pct}%`,
                                background:`linear-gradient(90deg,${C.greenDim},${C.green})`,
                                borderRadius:2,transition:"width 0.5s ease",
                              }}/>
                            </div>
                          </div>
                        )}
                        <div style={{
                          width:6,height:6,borderRadius:"50%",flexShrink:0,
                          background:sup.online?C.green:C.muted,
                          boxShadow:sup.online?`0 0 6px ${C.green}`:"none",
                        }}/>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Alertas recientes */}
              <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:14,padding:16}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
                  <h3 style={{color:C.white,fontSize:13,fontWeight:700}}>Alertas recientes</h3>
                  {kpis.openAlerts>0 && (
                    <span style={{color:C.red,fontSize:11,background:`${C.red}18`,padding:"2px 8px",borderRadius:20,animation:"blink 2s infinite"}}>
                      {kpis.openAlerts} abiertas
                    </span>
                  )}
                </div>
                <div style={{display:"flex",flexDirection:"column",gap:6}}>
                  {alerts.slice(0,6).map(a=>(
                    <div key={a.id} className="alert-row" style={{
                      borderRadius:8,padding:"8px 10px",cursor:"pointer",
                      background:C.surface,border:`1px solid ${sevColor(a.sev)}22`,
                      borderLeft:`3px solid ${sevColor(a.sev)}`,
                      transition:"background 0.2s",
                    }}>
                      <div style={{display:"flex",justifyContent:"space-between",marginBottom:2}}>
                        <span style={{color:sevColor(a.sev),fontSize:10,fontWeight:700,textTransform:"uppercase"}}>{a.sev}</span>
                        <span style={{color:C.muted,fontSize:9}}>{elapsed(a.ts)}</span>
                      </div>
                      <div style={{color:C.white,fontSize:11,marginBottom:1}}>{a.msg}</div>
                      <div style={{color:C.muted,fontSize:10}}>{a.farm} · {a.house}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Mortalidad por granja */}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
              <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:14,padding:16}}>
                <h3 style={{color:C.white,fontSize:13,fontWeight:700,marginBottom:14}}>
                  Mortalidad últimos 7 días — por granja
                </h3>
                <MortalityChart data={MORTALITY_DATA}/>
              </div>
              <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:14,padding:16}}>
                <h3 style={{color:C.white,fontSize:13,fontWeight:700,marginBottom:4}}>
                  Curva de peso — G-02 · El Rancho Norte
                </h3>
                <div style={{display:"flex",gap:12,marginBottom:10}}>
                  <div style={{display:"flex",alignItems:"center",gap:4}}>
                    <div style={{width:16,height:2,background:C.muted,borderStyle:"dashed"}}/>
                    <span style={{color:C.muted,fontSize:10}}>Estándar Cobb 500</span>
                  </div>
                  <div style={{display:"flex",alignItems:"center",gap:4}}>
                    <div style={{width:16,height:2,background:C.green}}/>
                    <span style={{color:C.slate,fontSize:10}}>Peso real lote</span>
                  </div>
                </div>
                <WeightChart data={WEIGHT_DATA}/>
                <div style={{
                  marginTop:10,padding:"8px 10px",borderRadius:8,
                  background:`${C.amber}12`,border:`1px solid ${C.amber}33`,
                }}>
                  <span style={{color:C.amber,fontSize:11}}>⚠ Lote 2.1% por debajo del estándar al día 35</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ══ TAB: SUPERVISORES EN CAMPO ══ */}
        {activeTab==="supervisors" && (
          <div style={{animation:"fadeIn 0.3s ease"}}>
            <div style={{
              display:"flex",alignItems:"center",gap:8,marginBottom:16,
              padding:"10px 14px",background:C.card,borderRadius:10,border:`1px solid ${C.border}`,
            }}>
              <div style={{width:8,height:8,borderRadius:"50%",background:C.green,animation:"pulse 2s infinite"}}/>
              <span style={{color:C.slate,fontSize:12}}>
                Actualización en tiempo real vía Supabase Realtime ·
                <span style={{color:C.green,fontWeight:600}}> {activeSups.length} inspecciones en curso</span>
              </span>
            </div>

            <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:14}}>
              {supervisors.map(sup => (
                <SupervisorCard
                  key={sup.id}
                  sup={sup}
                  inspection={inspections.find(i=>i.id===sup.id)}
                  now={now}
                />
              ))}
            </div>

            {/* Control de visitas */}
            <div style={{marginTop:16,background:C.card,border:`1px solid ${C.border}`,borderRadius:14,padding:16}}>
              <h3 style={{color:C.white,fontSize:13,fontWeight:700,marginBottom:14}}>Control de visitas — Semana actual</h3>
              <div style={{overflowX:"auto"}}>
                <table style={{width:"100%",borderCollapse:"collapse"}}>
                  <thead>
                    <tr>
                      {["Supervisor","Granja","Galpones","Lunes","Martes","Miércoles","Jueves","Viernes"].map(h=>(
                        <th key={h} style={{
                          color:C.muted,fontSize:10,fontWeight:600,textAlign:"left",
                          padding:"6px 10px",borderBottom:`1px solid ${C.border}`,
                          textTransform:"uppercase",letterSpacing:"0.5px",
                        }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      {name:"Carlos Vega", farm:"El Rancho Norte", houses:4, days:[1,1,1,1,0]},
                      {name:"Ana Ríos",    farm:"La Pampa Sur",    houses:3, days:[1,1,0,1,0]},
                      {name:"Martín Godoy",farm:"Don Juancho",     houses:5, days:[1,1,1,0,0]},
                      {name:"Lucía Peralta",farm:"El Rancho Norte",houses:2, days:[1,0,1,0,0]},
                    ].map((r,i)=>(
                      <tr key={i}>
                        <td style={{padding:"10px",color:C.white,fontSize:12,fontWeight:600}}>{r.name}</td>
                        <td style={{padding:"10px",color:C.slate,fontSize:11}}>{r.farm}</td>
                        <td style={{padding:"10px",color:C.teal,fontSize:11,textAlign:"center"}}>{r.houses}</td>
                        {r.days.map((d,j)=>(
                          <td key={j} style={{padding:"10px",textAlign:"center"}}>
                            <span style={{fontSize:14}}>{d?"✅":"—"}</span>
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ══ TAB: ANÁLISIS ══ */}
        {activeTab==="analytics" && (
          <div style={{animation:"fadeIn 0.3s ease"}}>
            <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12,marginBottom:16}}>
              {[
                {label:"FCR promedio del período", value:"1.74", unit:"", trend:"↓ mejor", color:C.green},
                {label:"Uniformidad promedio", value:"87.3", unit:"%", trend:"↑ vs semana anterior", color:C.teal},
                {label:"Aves producidas (30d)", value:"142.800", unit:"", trend:"4 lotes cerrados", color:C.amber},
              ].map((m,i)=>(
                <div key={i} style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:14,padding:16}}>
                  <div style={{color:C.muted,fontSize:11,marginBottom:8}}>{m.label}</div>
                  <div style={{color:m.color,fontSize:28,fontWeight:900,letterSpacing:"-1px"}}>
                    {m.value}<span style={{fontSize:14,fontWeight:400}}>{m.unit}</span>
                  </div>
                  <div style={{color:C.slate,fontSize:11,marginTop:4}}>{m.trend}</div>
                </div>
              ))}
            </div>

            {/* Tabla de lotes activos */}
            <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:14,padding:16}}>
              <h3 style={{color:C.white,fontSize:13,fontWeight:700,marginBottom:14}}>Estado de lotes activos</h3>
              <table style={{width:"100%",borderCollapse:"collapse"}}>
                <thead>
                  <tr>
                    {["Lote","Granja","Galpón","Genética","Edad","Aves","Mortalidad","Peso prom.","Score últ.","Estado"].map(h=>(
                      <th key={h} style={{color:C.muted,fontSize:10,textAlign:"left",padding:"6px 10px",
                        borderBottom:`1px solid ${C.border}`,textTransform:"uppercase",letterSpacing:"0.5px"}}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[
                    {code:"L-045",farm:"El Rancho",house:"G-01",gen:"Cobb 500",age:28,birds:22000,mort:0.21,weight:1510,score:88,st:"Aprobado"},
                    {code:"L-046",farm:"El Rancho",house:"G-02",gen:"Cobb 500",age:35,birds:21400,mort:0.42,weight:2185,score:72,st:"Observado"},
                    {code:"L-047",farm:"La Pampa", house:"G-A", gen:"Ross 308",age:18,birds:19800,mort:0.18,weight:640, score:91,st:"Aprobado"},
                    {code:"L-048",farm:"La Pampa", house:"G-B", gen:"Ross 308",age:21,birds:18900,mort:0.31,weight:900, score:65,st:"Observado"},
                    {code:"L-049",farm:"Don Juancho",house:"N-1",gen:"Cobb 500",age:7, birds:25000,mort:0.09,weight:182, score:95,st:"Aprobado"},
                  ].map((r,i)=>(
                    <tr key={i} style={{borderBottom:`1px solid ${C.border}`}}>
                      <td style={{padding:"10px",color:C.white,fontSize:12,fontWeight:700,fontFamily:"monospace"}}>{r.code}</td>
                      <td style={{padding:"10px",color:C.slate,fontSize:11}}>{r.farm}</td>
                      <td style={{padding:"10px",color:C.slate,fontSize:11}}>{r.house}</td>
                      <td style={{padding:"10px",color:C.teal,fontSize:11}}>{r.gen}</td>
                      <td style={{padding:"10px",color:C.white,fontSize:11,textAlign:"center"}}>{r.age}d</td>
                      <td style={{padding:"10px",color:C.white,fontSize:11,textAlign:"right"}}>{r.birds.toLocaleString()}</td>
                      <td style={{padding:"10px",fontSize:11,textAlign:"right",
                        color:r.mort>0.5?C.red:r.mort>0.3?C.amber:C.green,fontWeight:700}}>
                        {r.mort.toFixed(2)}%
                      </td>
                      <td style={{padding:"10px",color:C.white,fontSize:11,textAlign:"right"}}>{r.weight}g</td>
                      <td style={{padding:"10px",textAlign:"right"}}>
                        <span style={{
                          color:scoreColor(r.score),fontSize:11,fontWeight:700,
                          background:`${scoreColor(r.score)}18`,padding:"2px 8px",borderRadius:6,
                        }}>{r.score}%</span>
                      </td>
                      <td style={{padding:"10px"}}>
                        <span style={{
                          fontSize:10,fontWeight:600,padding:"3px 8px",borderRadius:6,
                          background: r.st==="Aprobado"?`${C.green}18`:r.st==="Observado"?`${C.amber}18`:`${C.red}18`,
                          color: r.st==="Aprobado"?C.green:r.st==="Observado"?C.amber:C.red,
                        }}>{r.st}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ══ TAB: ALERTAS ══ */}
        {activeTab==="alerts" && (
          <div style={{animation:"fadeIn 0.3s ease"}}>
            <div style={{display:"flex",gap:10,marginBottom:16}}>
              {["Todas","Críticas","Advertencias","Informativas"].map((f,i)=>(
                <button key={f} style={{
                  background: i===0?C.card:C.surface,
                  border:`1px solid ${i===0?C.borderHi:C.border}`,
                  color:i===0?C.white:C.muted,borderRadius:8,
                  padding:"6px 14px",cursor:"pointer",fontSize:12,
                  fontFamily:"inherit",fontWeight:i===0?600:400,
                }}>{f}</button>
              ))}
              <div style={{flex:1}}/>
              <button style={{
                background:C.card,border:`1px solid ${C.border}`,color:C.slate,
                borderRadius:8,padding:"6px 14px",cursor:"pointer",fontSize:12,
                fontFamily:"inherit",
              }}>Marcar todas como leídas</button>
            </div>

            <div style={{display:"flex",flexDirection:"column",gap:8}}>
              {alerts.map(a=>(
                <div key={a.id} style={{
                  background:C.card,border:`1px solid ${sevColor(a.sev)}22`,
                  borderLeft:`4px solid ${sevColor(a.sev)}`,
                  borderRadius:12,padding:"14px 16px",
                  display:"flex",alignItems:"center",gap:14,
                }}>
                  <div style={{
                    fontSize:20,width:36,height:36,display:"flex",
                    alignItems:"center",justifyContent:"center",
                    background:`${sevColor(a.sev)}18`,borderRadius:10,flexShrink:0,
                  }}>
                    {a.sev==="critical"?"🔴":a.sev==="warning"?"🟡":"🔵"}
                  </div>
                  <div style={{flex:1}}>
                    <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
                      <span style={{
                        color:sevColor(a.sev),fontSize:10,fontWeight:700,
                        textTransform:"uppercase",letterSpacing:"0.5px",
                        background:`${sevColor(a.sev)}18`,padding:"1px 6px",borderRadius:4,
                      }}>{a.sev==="critical"?"Crítico":a.sev==="warning"?"Advertencia":"Info"}</span>
                      <span style={{color:C.muted,fontSize:11}}>{elapsed(a.ts)} · {a.sup}</span>
                    </div>
                    <div style={{color:C.white,fontSize:13,fontWeight:500,marginBottom:2}}>{a.msg}</div>
                    <div style={{color:C.muted,fontSize:11}}>{a.farm} — {a.house}</div>
                  </div>
                  <div style={{display:"flex",gap:6,flexShrink:0}}>
                    <button style={{
                      background:C.surface,border:`1px solid ${C.border}`,color:C.slate,
                      borderRadius:8,padding:"6px 12px",cursor:"pointer",fontSize:11,fontFamily:"inherit",
                    }}>Ver detalle</button>
                    <button style={{
                      background:`${C.green}18`,border:`1px solid ${C.greenDim}`,color:C.green,
                      borderRadius:8,padding:"6px 12px",cursor:"pointer",fontSize:11,fontFamily:"inherit",
                    }}>Resolver</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
