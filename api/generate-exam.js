// /api/generate-exam.js
import { cors, parseBody } from './_lib/supaClient.js';

function clamp(n, lo, hi){ return Math.max(lo, Math.min(hi, n)); }
function fmtOrigin(req){
  // Construye origen confiable (https + host)
  const proto = (req.headers['x-forwarded-proto'] || 'https').toString();
  const host  = (req.headers.host || process.env.VERCEL_URL || '').toString();
  return `${proto}://${host}`;
}

// Fallback determinístico por tema (por si todo lo demás falla)
function fallbackQuestions(topic, n=10){
  const items=[];
  for(let i=1;i<=n;i++){
    if(topic==='algebra'){
      const a=i+1,b=i+2,correct=a+b;
      items.push({
        id:null,
        prompt:`¿Cuánto es ${a} + ${b}?`,
        choices:[String(correct), String(correct+1), String(correct-1), String(correct+2)],
        answer_index:0,
        explanation:`Suma directa: ${a} + ${b} = ${correct}.`
      });
    }else if(topic==='logico'){
      const s0=i,s1=i+1,s2=i+2,s3=i+3;
      items.push({
        id:null,
        prompt:`Completa la secuencia: ${s0}, ${s1}, ${s2}, __`,
        choices:[String(s3), String(s2+2), String(s1+3)],
        answer_index:0,
        explanation:`Secuencia +1: el siguiente es ${s3}.`
      });
    }else{ // lectura
      items.push({
        id:null,
        prompt:`En el texto: "María estudia porque quiere ingresar a la universidad". ¿Cuál es la causa?`,
        choices:['Quiere ingresar a la universidad','María estudia','La universidad es exigente'],
        answer_index:0,
        explanation:`La causa es el motivo: "quiere ingresar a la universidad".`
      });
    }
  }
  return items;
}

async function fetchJSON(url, opts){
  const r = await fetch(url, opts);
  const text = await r.text(); // leemos como texto primero
  const ct = (r.headers.get('content-type') || '').toLowerCase();
  if(!ct.includes('application/json')){
    throw new Error(`Non-JSON response (${r.status}): ${text.slice(0,120)}`);
  }
  try { return JSON.parse(text); }
  catch(e){ throw new Error(`Bad JSON (${r.status}): ${e.message}`); }
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

    const origin = fmtOrigin(req); // ej. https://tuingreso-xxxx.vercel.app

    async function pull(topic, offset){
      // Llama a /api/generate-questions en el MISMO despliegue
      const body = { topic, count: countPerSection };
      if (difficulty) body.difficulty = difficulty;
      if (variant !== null) body.variant = (variant + offset);
      try{
        const d = await fetchJSON(`${origin}/api/generate-questions`, {
          method:'POST',
          headers:{'Content-Type':'application/json','Accept':'application/json'},
          body: JSON.stringify(body)
        });
        if(d && d.ok && Array.isArray(d.items) && d.items.length>0) return d.items;
      }catch(_e){
        // si falla, devolvemos vacío para que el caller complete con fallback
      }
      return [];
    }

    const sections = [];
    for (let i=0;i<topics.length;i++){
      const t = topics[i];
      let items = await pull(t, i*1000);
      if(items.length < countPerSection){
        const miss = countPerSection - items.length;
        items = items.concat( fallbackQuestions(t, miss) );
      }
      sections.push({ topic:t, title:titles[t], items });
    }

    const exam = {
      version: 1,
      seed: variant ?? Math.floor(Date.now()/60000),
      difficulty: difficulty || 'mixed',
      sections,
      total_questions: sections.reduce((s,sec)=>s+sec.items.length,0),
      time_limit_seconds: timeLimit
    };

    res.status(200).json({ ok:true, exam });
  }catch(e){
    // Pase lo que pase, devolvemos examen 100% fallback para no romper el front
    const count = clamp(parseInt((req.body?.count_per_section)||10,10)||10, 5, 30);
    const sections = ['algebra','logico','lectura'].map(t=>({
      topic:t,
      title: t==='algebra'?'Álgebra':t==='logico'?'Razonamiento Lógico':'Comprensión Lectora',
      items: fallbackQuestions(t, count)
    }));
    res.status(200).json({
      ok:true,
      exam:{
        version:1,
        seed: Math.floor(Date.now()/60000),
        difficulty:'mixed',
        sections,
        total_questions: sections.reduce((s,sec)=>s+sec.items.length,0),
        time_limit_seconds: 30*60
      },
      meta:{ fallback:true, reason:e.message }
    });
  }
}
