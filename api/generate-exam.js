// /api/generate-exam.js — pide IA “high” y devuelve meta de calidad
import { cors, parseBody } from './_lib/supaClient.js';
function clamp(n, lo, hi){ return Math.max(lo, Math.min(hi, n)); }
function fmtOrigin(req){ const proto=(req.headers['x-forwarded-proto']||'https').toString(); const host=(req.headers.host||process.env.VERCEL_URL||'').toString(); return `${proto}://${host}`; }
function fallback(topic, n=10){
  const items=[]; for(let i=1;i<=n;i++){
    if(topic==='algebra'){ const a=i+2,b=i+3; items.push({id:null,prompt:`¿Cuánto es ${a}+${b}?`,choices:[String(a+b),String(a+b+1),String(a+b-1),String(a+b+2)],answer_index:0,explanation:`Suma: ${a+b}.`});}
    else if(topic==='logico'){ const s=[i,i+1,i+3,i+6]; items.push({id:null,prompt:`Completa: ${s[0]}, ${s[1]}, ${s[2]}, __`,choices:[String(s[3]),String(s[2]+2),String(s[2]-1)],answer_index:0,explanation:`Patrón creciente.`});}
    else { items.push({id:null,prompt:`Texto: Estudiar a diario mejora resultados. Pregunta: ¿Qué práctica menciona el texto?`,choices:['Estudiar a diario','Dormir tarde','No hacer ejercicios','No leer'],answer_index:0,explanation:`Lo dice explícito.`});}
  } return items;
}

async function fetchJSON(url, opts){
  const r = await fetch(url, opts);
  const t = await r.text();
  const ct=(r.headers.get('content-type')||'').toLowerCase();
  if(!ct.includes('application/json')) throw new Error(`Non-JSON ${r.status}: ${t.slice(0,100)}`);
  try{ return JSON.parse(t); }catch(e){ throw new Error(`Bad JSON: ${e.message}`); }
}

export default async function handler(req, res){
  cors(res);
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ok:false,error:'METHOD_NOT_ALLOWED'}); return; }

  try{
    const b = await parseBody(req);
    const countPerSection = clamp(parseInt(b.count_per_section||10,10)||10, 5, 30);
    const difficulty = (b.difficulty||'').toString().trim() || null;
    const variant = Number.isInteger(b.variant) ? b.variant : null;
    const timeLimit = b.time_limit_seconds || 30*60;

    const topics = ['algebra','logico','lectura'];
    const titles = { algebra:'Álgebra', logico:'Razonamiento Lógico', lectura:'Comprensión Lectora' };

    const origin = fmtOrigin(req);
    const metaSections = [];

    async function pull(topic, offset){
      const body = { topic, count: countPerSection, difficulty: difficulty||'mixed', quality:'high', debug:true };
      if (variant !== null) body.variant = (variant + offset);
      try{
        const d = await fetchJSON(`${origin}/api/generate-questions`, {
          method:'POST', headers:{'Content-Type':'application/json','Accept':'application/json'},
          body: JSON.stringify(body)
        });
        const from_ai = d?.meta?.from_ai || 0;
        const from_fb = d?.meta?.from_fallback || 0;
        metaSections.push({ topic, from_ai, from_fallback: from_fb });
        if(d && d.ok && Array.isArray(d.items) && d.items.length) return d.items;
      }catch(_e){}
      metaSections.push({ topic, from_ai:0, from_fallback: countPerSection });
      return fallback(topic, countPerSection);
    }

    const sections = [];
    for(let i=0;i<topics.length;i++){
      const t = topics[i];
      const items = await pull(t, i*1000);
      sections.push({ topic:t, title:titles[t], items });
    }

    const exam = {
      version: 2,
      seed: variant ?? Math.floor(Date.now()/60000),
      difficulty: difficulty || 'mixed',
      sections,
      total_questions: sections.reduce((s,sec)=>s+sec.items.length,0),
      time_limit_seconds: timeLimit
    };
    const ai_total = metaSections.reduce((s,m)=>s+m.from_ai,0);
    const fb_total = metaSections.reduce((s,m)=>s+m.from_fallback,0);
    const ai_ratio = exam.total_questions ? ai_total / exam.total_questions : 0;

    res.status(200).json({ ok:true, exam, meta:{ sections: metaSections, ai_ratio, ai_total, fb_total } });
  }catch(e){
    const sections = ['algebra','logico','lectura'].map(t=>({ topic:t, title: t==='algebra'?'Álgebra':t==='logico'?'Razonamiento Lógico':'Comprensión Lectora', items: fallback(t, 10) }));
    res.status(200).json({ ok:true, exam:{version:2,seed:Math.floor(Date.now()/60000),difficulty:'mixed',sections,total_questions:30,time_limit_seconds:30*60}, meta:{sections:[],ai_ratio:0,ai_total:0,fb_total:30,fallback:true,reason:e.message} });
  }
}
