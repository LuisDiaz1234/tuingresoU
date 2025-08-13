// /api/generate-questions.js
import { cors, parseBody, getClient } from './_lib/supaClient.js';

// ------- Config ----------
const ALLOWED_TOPICS = ['algebra','logico','lectura'];
const DEFAULT_COUNT = 10;
const MAX_COUNT = 30;

// IA
import OpenAI from 'openai';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const OPENAI_MODEL   = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const OPENAI_BASE_URL = process.env.OPENAI_BASE_URL || null;

// --------- Utiles ----------
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

// Validación mínima del esquema
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

// Llamada a OpenAI con JSON estricto
async function aiGenerate({topic, count}){
  if(!OPENAI_API_KEY) return { ok:false, reason:'NO_API_KEY' };

  const client = new OpenAI({
    apiKey: OPENAI_API_KEY,
    ...(OPENAI_BASE_URL ? { baseURL: OPENAI_BASE_URL } : {})
  });

  const schema = {
    type: "object",
    properties: {
      items: {
        type: "array",
        items: {
          type: "object",
          properties: {
            prompt: { type: "string" },
            choices: { type: "array", items: { type: "string" }, minItems: 2, maxItems: 6 },
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

  const system = `Eres un generador de ítems tipo opción múltiple para un simulador de ingreso universitario en Panamá (UTP y UP).
- Produce preguntas en español, claras y sin ambigüedad.
- Cada pregunta debe tener de 3 a 5 alternativas, con EXACTAMENTE una correcta.
- Devuelve SOLO JSON con el esquema indicado. Nada de texto fuera del JSON.
- Incluye explicación pedagógica breve y correcta (campo "explanation").
- Temas válidos: algebra, logico, lectura.`;

  const user = `Genera ${count} preguntas para el tema "${topic}".
Requisitos:
- Dificultad mixta (básica-media-alta).
- Formato seguro (no cifras astronómicas ni prompts peligrosos).
- Evita copiar texto con copyright; crea tus propios enunciados.
- Ajuste al estilo de examen de admisión (razonamiento y conceptos concretos).
Devuelve {"items":[...]} cumpliendo el esquema.`;

  // Modo JSON estricto
  const response = await client.chat.completions.create({
    model: OPENAI_MODEL,
    temperature: 0.6,
    seed: 42,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: system },
      { role: "user", content: user }
    ]
  });

  const txt = response.choices?.[0]?.message?.content || '';
  let parsed=null;
  try{ parsed = JSON.parse(txt); }catch{ return { ok:false, reason:'BAD_JSON' }; }

  const vetted = validateQuestions(parsed.items).slice(0, count);
  if(vetted.length===0) return { ok:false, reason:'EMPTY' };
  return { ok:true, items:vetted };
}

export default async function handler(req, res){
  cors(res);
  if(req.method==='OPTIONS'){ res.status(200).end(); return; }
  if(req.method!=='POST'){ res.status(405).json({ok:false,error:'METHOD_NOT_ALLOWED'}); return; }

  try{
    const b = await parseBody(req);
    const topic = (b.topic||'').toString().trim();
    let count = clamp(parseInt(b.count||DEFAULT_COUNT,10)||DEFAULT_COUNT, 1, MAX_COUNT);

    if(!ALLOWED_TOPICS.includes(topic)){
      return res.status(400).json({ok:false, error:'INVALID_TOPIC'});
    }

    // 1) Intentar IA
    let iaItems = [];
    try{
      const ai = await aiGenerate({topic, count});
      if(ai.ok) iaItems = ai.items;
    }catch(_e){ /* ignora y cae a DB/fallback */ }

    // 2) Intentar DB (si existe y faltan)
    const supa = getClient();
    let dbItems = [];
    try{
      const { data } = await supa
        .from('questions')
        .select('id,prompt,choices,answer_index,explanation')
        .eq('topic', topic).eq('active', true)
        .order('created_at',{ascending:false})
        .limit(100);

      if(Array.isArray(data) && data.length){
        dbItems = shuffle(data.slice());
      }
    }catch(_e){ /* no bloquear */ }

    // 3) Mezclar IA+DB y completar con fallback
    let mix = [...iaItems];
    for(const q of dbItems){
      if(mix.length>=count) break;
      mix.push(q);
    }
    if(mix.length<count){
      mix = mix.concat(makeFallback(topic, count - mix.length));
    }else{
      mix = mix.slice(0, count);
    }

    return res.status(200).json({ok:true, items: mix});
  }catch(e){
    return res.status(500).json({ok:false, error:'SERVER_ERROR', detail:e.message});
  }
}
