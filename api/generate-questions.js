// /api/generate-questions.js
import { cors, parseBody, getClient } from './_lib/supaClient.js';
import OpenAI from 'openai';

const ALLOWED_TOPICS = ['algebra','logico','lectura'];
const DEFAULT_COUNT = 10;
const MAX_COUNT = 30;

// ENV
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const OPENAI_MODEL   = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const OPENAI_BASE_URL = process.env.OPENAI_BASE_URL || null;

function clamp(n, lo, hi){ return Math.max(lo, Math.min(hi, n)); }
function shuffle(a){ for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; } return a; }

// Fallback determinístico (jamás falla)
function makeFallback(topic, n=10){
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
        prompt:`En el texto: "Juan estudia porque quiere aprobar el examen". ¿Cuál es la causa?`,
        choices:['Quiere aprobar el examen','Juan estudia','El examen es mañana'],
        answer_index:0,
        explanation:`La causa es el motivo: "quiere aprobar el examen".`
      });
    }
  }
  return items;
}

// Validación de esquema mínimo
function validateQuestions(items){
  if(!Array.isArray(items)) return [];
  const out=[];
  for(const q of items){
    if(!q || typeof q!=='object') continue;
    const prompt = (q.prompt||'').toString().trim();
    const choices = Array.isArray(q.choices) ? q.choices.map(x=>x.toString()) : [];
    const answer_index = Number.isInteger(q.answer_index) ? q.answer_index : -1;
    const explanation = (q.explanation||'').toString();
    if(!prompt || choices.length<2 || choices.length>6) continue;
    if(answer_index<0 || answer_index>=choices.length) continue;
    out.push({ id:q.id||null, prompt, choices, answer_index, explanation });
  }
  return out;
}

async function aiGenerate({topic, count, variant, difficulty}){
  if(!OPENAI_API_KEY) return { ok:false, reason:'NO_API_KEY' };

  const client = new OpenAI({
    apiKey: OPENAI_API_KEY,
    ...(OPENAI_BASE_URL ? { baseURL: OPENAI_BASE_URL } : {})
  });

  // Semilla variable: si no viene, deriva de tiempo (minuto actual) + un aleatorio
  const seed = Number.isInteger(variant) ? variant : (Math.floor(Date.now()/60000) ^ Math.floor(Math.random()*1e9));

  const schema = {
    type: "object",
    properties: {
      items: {
        type: "array",
        items: {
          type: "object",
          properties: {
            prompt: { type: "string" },
            choices: { type: "array", items: { type: "string" }, minItems: 3, maxItems: 5 },
            answer_index: { type: "integer" },
            explanation: { type: "string" }
          },
          required: ["prompt","choices","answer_index"]
        }
      }
    },
    required: ["items"],
    additionalProperties: false
  };

  const system = `Eres un generador de ítems de opción múltiple para un simulador de ingreso universitario en Panamá (UTP/UP).
- Español claro y sin ambigüedad.
- 3–5 opciones, exactamente 1 correcta.
- Devuelve SOLO JSON con el esquema pedido.
- Incluye breve "explanation" pedagógica.
- Temas: algebra, logico, lectura.`;

  const user = `Genera ${count} preguntas para el tema "${topic}"${difficulty?` con dificultad ${difficulty}`:''}.
Requisitos:
- Mezcla de tipos de pregunta y números razonables.
- Estilo examen de admisión (razonamiento y conceptos).
- Sin texto con copyright; crea enunciados originales.
Devuelve {"items":[...]} cumpliendo el esquema.`;

  const resp = await client.chat.completions.create({
    model: OPENAI_MODEL,
    temperature: 0.6,
    seed,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: system },
      { role: "user", content: user }
    ]
  });

  const txt = resp.choices?.[0]?.message?.content || '';
  let parsed=null; try{ parsed = JSON.parse(txt); }catch{ return { ok:false, reason:'BAD_JSON' }; }
  const vetted = validateQuestions(parsed.items).slice(0, count);
  if(vetted.length===0) return { ok:false, reason:'EMPTY' };
  return { ok:true, items:vetted, seed };
}

export default async function handler(req, res){
  cors(res);
  if(req.method==='OPTIONS'){ res.status(200).end(); return; }
  if(req.method!=='POST'){ res.status(405).json({ok:false,error:'METHOD_NOT_ALLOWED'}); return; }

  try{
    const b = await parseBody(req);
    const topic = (b.topic||'').toString().trim();
    const difficulty = (b.difficulty||'').toString().trim() || null;
    const debug = !!b.debug;
    const variant = Number.isInteger(b.variant) ? b.variant : null;

    let count = clamp(parseInt(b.count||DEFAULT_COUNT,10)||DEFAULT_COUNT, 1, MAX_COUNT);
    if(!ALLOWED_TOPICS.includes(topic)){
      return res.status(400).json({ok:false, error:'INVALID_TOPIC'});
    }

    let items = [];
    let meta = { from_ai:0, from_db:0, from_fallback:0, reason:null };

    // 1) IA
    try{
      const ai = await aiGenerate({topic, count, variant, difficulty});
      if(ai.ok){ items = ai.items; meta.from_ai = items.length; meta.seed = ai.seed; }
      else { meta.reason = ai.reason || meta.reason; }
    }catch(e){ meta.reason = 'AI_EXCEPTION'; }

    // 2) DB (solo si faltan)
    try{
      if(items.length < count){
        const supa = getClient();
        const selCols = 'id,prompt,choices,answer_index,explanation'; // si no existe 'explanation', Supabase lanzará error
        const { data } = await supa
          .from('questions')
          .select(selCols)
          .eq('topic', topic)
          .eq('active', true)
          .order('created_at',{ascending:false})
          .limit(100);

        if(Array.isArray(data) && data.length){
          const db = shuffle(data.slice());
          for(const q of db){
            if(items.length>=count) break;
            items.push(q);
            meta.from_db++;
          }
        }
      }
    }catch(_e){
      // No bloquees la respuesta si la tabla difiere (p.ej., falta columna explanation)
      // Continuaremos con fallback
    }

    // 3) Fallback si aún faltan
    if(items.length < count){
      const miss = count - items.length;
      items = items.concat( makeFallback(topic, miss) );
      meta.from_fallback = miss;
    }else{
      items = items.slice(0, count);
    }

    if(debug) return res.status(200).json({ok:true, items, meta});
    return res.status(200).json({ok:true, items});
  }catch(e){
    return res.status(200).json({ok:true, items: makeFallback('algebra', DEFAULT_COUNT), meta:{from_ai:0,from_db:0,from_fallback:DEFAULT_COUNT,reason:'HARD_FALLBACK',detail:e.message} });
  }
}
