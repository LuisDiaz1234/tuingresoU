// /api/generate-exam.js
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE;
const supa = (SUPABASE_URL && SUPABASE_SERVICE_ROLE)
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE)
  : null;

const MAP = {
  paa: ['lectura','algebra','logico'],
  pca: ['espanol','matematicas'], // ojo: en DB puedes tener 'espanol' como 'lectura'; se normaliza abajo
  pcg: ['biologia','quimica','fisica','matematicas']
};

function norm(t){
  t = (t||'').toLowerCase();
  if (t==='espanol' || t==='español') return 'lectura';
  if (t==='logico'||t==='razonamiento') return 'logico';
  if (t==='matemáticas'||t==='matematicas'||t==='algebra') return 'algebra';
  return t;
}

function timeByMode(m){ return (m==='paa')?120*60 : (m==='pca')?120*60 : (m==='pcg')?120*60 : 60*60; }
function sectionsByMode(m){ return (m==='pcg')?4 : (m==='paa'||m==='pca')?2 : 1; }

async function fetchFromDB(topic, n){
  if (!supa) return [];
  const { data, error } = await supa
    .from('questions')
    .select('prompt,choices,answer_index,explanation,topic,active')
    .eq('active', true)
    .eq('topic', topic)
    .limit(n*2);
  if (error || !data?.length) return [];
  // barajar y cortar
  for (let i=data.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [data[i],data[j]]=[data[j],data[i]]; }
  return data.slice(0,n).map(r=>({
    prompt:r.prompt,
    choices: Array.isArray(r.choices)? r.choices : r.choices?.options || r.choices,
    answer_index:r.answer_index,
    explanation:r.explanation||'',
    topic:topic
  }));
}

// importamos localmente el generador de preguntas (misma lógica que /api/generate-questions)
async function localGen(topic, count, difficulty, seed){
  const r = await fetch(process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}/api/generate-questions` : 'http://localhost:3000/api/generate-questions', {
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ topic, count, difficulty, seed })
  }).then(r=>r.json()).catch(()=>[]);
  return Array.isArray(r)? r : [];
}

export default async function handler(req,res){
  try{
    if (req.method!=='POST') return res.status(405).json({ok:false,error:'METHOD'});
    const { mode='paa', difficulty='medium', count_per_section=10, variant=Date.now()%1e6 } = req.body||{};
    const m = (mode||'paa').toLowerCase();
    const topics = (MAP[m]||['algebra']).map(norm);
    const sections = sectionsByMode(m);
    const perSec = Math.max(5, Math.min(100, Number(count_per_section)||10));
    const seed = Number(variant)||0;

    const outSections = [];
    for (let s=0; s<sections; s++){
      // reparto simple entre tópicos
      const title =
        (m==='paa') ? (s===0?'Lectura':'Matemáticas y Lógico') :
        (m==='pca') ? (s===0?'Español':'Matemáticas') :
        `Sección ${s+1}`;

      const qs = [];
      const each = Math.max(1, Math.round(perSec / topics.length));
      for (const t of topics){
        let chunk = await fetchFromDB(t, each);
        if (chunk.length < each){
          const faltan = each - chunk.length;
          const gen = await localGen(t, faltan, difficulty, seed + s);
          chunk = chunk.concat(gen);
        }
        qs.push(...chunk.slice(0, each));
      }
      while (qs.length < perSec){
        // relleno final si aún falta
        const gen = await localGen('algebra', 1, difficulty, seed+s+qs.length);
        qs.push(...gen);
      }
      outSections.push({ title, questions: qs.slice(0, perSec) });
    }

    return res.status(200).json({
      ok:true,
      mode:m,
      duration: timeByMode(m),
      seed,
      sections: outSections
    });
  }catch(e){
    return res.status(200).json({ ok:false, sections:[] });
  }
}
