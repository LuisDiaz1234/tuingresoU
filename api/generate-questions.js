// /api/generate-questions.js — versión PRO (IA + fallback sólido)
import { cors, parseBody, getClient } from './_lib/supaClient.js';
import OpenAI from 'openai';

/** ---------- Config ---------- */
const ALLOWED_TOPICS = ['algebra','logico','lectura'];
const DEFAULT_COUNT = 10;
const MAX_COUNT = 30;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const OPENAI_MODEL   = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const OPENAI_BASE_URL = process.env.OPENAI_BASE_URL || null;

/** ---------- Utils ---------- */
function clamp(n, lo, hi){ return Math.max(lo, Math.min(hi, n)); }
function shuffle(a){ for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; } return a; }
function pick(arr, rnd){ return arr[Math.floor(rnd()*arr.length)] }

// PRNG determinístico (para variedad reproducible)
function mulberry32(seed){
  return function(){ let t = seed += 0x6D2B79F5; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}

/** ---------- IA: prompts por tema ---------- */
function iaPrompts(topic, count, difficulty='mixed', sub=null){
  const baseRules = `
- Español claro, opciones bien redactadas, **una sola correcta**.
- Entre 3 y 5 opciones por ítem.
- Devuelve SOLO JSON con el esquema pedido (nada de texto suelto).
- Incluye una explicación docente concisa en "explanation".
- Grado objetivo: examen de admisión UTP/UP (preuniversitario).
- Dificultad objetivo: ${difficulty || 'mixta'}${sub?` · Subtema: ${sub}`:''}.`;

  if(topic==='algebra'){
    return {
      system: `Eres un generador de ítems de Álgebra de nivel admisión. ${baseRules}
- Alterna tipos: ecuaciones lineales/cuadráticas, desigualdades, factoración, funciones y evaluación de f(x), razones y proporciones.
- Evita preguntas triviales (2+3), exige uno o dos pasos de razonamiento.`,
      user: `Genera ${count} preguntas de Álgebra con opciones múltiples.`
    };
  }
  if(topic==='logico'){
    return {
      system: `Eres un generador de Razonamiento Lógico de nivel admisión. ${baseRules}
- Mezcla tipos: secuencias (aritméticas/geométricas/alternantes), analogías A:B::C:?, ordenamientos, conteo/combinatoria simple, tablas de verdad/implicaciones, silogismos breves.
- Evita que todas sean secuencias de +1; usa reglas mixtas y distracciones plausibles.
- Las secuencias pueden combinar reglas (p.ej., +2 luego ×2).`,
      user: `Genera ${count} preguntas de Razonamiento Lógico con opciones múltiples.`
    };
  }
  // lectura
  return {
    system: `Eres un generador de Comprensión Lectora de nivel admisión. ${baseRules}
- Para cada ítem incluye **un mini-texto (1–3 frases)** dentro del "prompt" precedido por "Texto:" y luego la pregunta. Ej.: "Texto: ... Pregunta: ¿...?" 
- Tipos a alternar: idea principal, detalle explícito, inferencia, propósito del autor, vocabulario en contexto (elige sinónimo).
- Evita textos obvios; que requieran leer para responder.`,
    user: `Genera ${count} preguntas de Comprensión Lectora (cada una con su mini-texto en el prompt).`
  };
}

function iaSchema(){
  return {
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
}

async function aiGenerate({topic, count, variant, difficulty='mixed', sub=null}){
  if(!OPENAI_API_KEY) return { ok:false, reason:'NO_API_KEY' };
  const openai = new OpenAI({ apiKey: OPENAI_API_KEY, ...(OPENAI_BASE_URL?{baseURL:OPENAI_BASE_URL}:{}) });

  const seed = Number.isInteger(variant) ? variant : (Math.floor(Date.now()/60000) ^ Math.floor(Math.random()*1e9));
  const {system, user} = iaPrompts(topic, count, difficulty, sub);

  const temperature = topic==='algebra' ? 0.6 : 0.75; // más creatividad en lógico/lectura

  const resp = await openai.chat.completions.create({
    model: OPENAI_MODEL,
    temperature,
    seed,
    response_format: { type: "json_object" },
    messages: [{ role:'system', content: system }, { role:'user', content: user }]
  });

  const txt = resp.choices?.[0]?.message?.content || '';
  let parsed=null; try{ parsed = JSON.parse(txt); }catch{ return { ok:false, reason:'BAD_JSON' }; }
  const items = Array.isArray(parsed.items)?parsed.items:[];

  const vetted = items.filter(q=>{
    if(!q || typeof q!=='object') return false;
    const prompt = (q.prompt||'').toString().trim();
    const ch = Array.isArray(q.choices)?q.choices.map(x=>x.toString()):[];
    const ai = Number.isInteger(q.answer_index)?q.answer_index:-1;
    return prompt && ch.length>=3 && ch.length<=5 && ai>=0 && ai<ch.length;
  }).map(q=>({ id:null, prompt:q.prompt, choices:q.choices, answer_index:q.answer_index, explanation:(q.explanation||'').toString() })).slice(0,count);

  if(vetted.length===0) return { ok:false, reason:'EMPTY' };
  return { ok:true, items:vetted, seed };
}

/** ---------- Fallback PRO ---------- */
function fb_algebra(n, rnd){
  const out=[];
  for(let i=0;i<n;i++){
    const a = 2 + Math.floor(rnd()*8), b = 1 + Math.floor(rnd()*9);
    const correct = a + b;
    out.push({
      id:null,
      prompt:`Resuelve: ¿cuánto es ${a} + ${b}?`,
      choices: shuffle([correct, correct+1, correct-1, correct+2].map(String)),
      answer_index: 0,
      explanation:`Suma: ${a}+${b}=${correct}.`
    });
  }
  return out;
}
function fb_logico(n, rnd){
  const gen = [];

  const seq_arit = ()=>{ // +k o alternante
    const start = 1+Math.floor(rnd()*5);
    const k = 2+Math.floor(rnd()*4);
    const alt = rnd()<0.5;
    const seq = [start];
    for(let i=1;i<5;i++){ seq.push( alt && i%2 ? seq[i-1]+k+1 : seq[i-1]+k ); }
    const ans = seq[4];
    const wrong = shuffle([ans+k, ans-1, ans+k+1].map(x=>String(Math.max(0,x))));
    return {
      prompt:`Completa la secuencia: ${seq[0]}, ${seq[1]}, ${seq[2]}, ${seq[3]}, __`,
      choices: shuffle([String(ans), ...wrong]),
      answer_index: 0,
      explanation:`Progresión ${alt?'alternante ':''}con paso ${k}${alt?'/'+(k+1):''}.`
    };
  };

  const seq_geom = ()=>{
    const start = 2+Math.floor(rnd()*3);
    const r = 2+Math.floor(rnd()*3);
    const seq=[start, start*r, start*r*r, start*r*r*r];
    const ans= start*r**4;
    const wrong=shuffle([ans*r, ans-1, ans+r].map(String));
    return {
      prompt:`Completa la secuencia geométrica: ${seq.join(', ')}, __`,
      choices: shuffle([String(ans), ...wrong]),
      answer_index:0,
      explanation:`Razón ${r}.`
    };
  };

  const analogia = ()=>{
    const pairs = [
      ['ave','nido','perro','caseta','jaula','cuerda'],
      ['pintor','cuadro','músico','partitura','piano','taller'],
      ['autor','libro','arquitecto','plano','ladrillo','ingeniero'],
      ['llave','cerradura','contraseña','acceso','candado','puerta']
    ];
    const p = pick(pairs, rnd);
    const correct = p[3];
    const opts = shuffle([p[3], p[4], p[5], p[1]].map(String));
    return {
      prompt:`Analogía: ${p[0]} es a ${p[1]} como ${p[2]} es a __`,
      choices: opts,
      answer_index: opts.indexOf(correct),
      explanation:`Relación de función/uso: ${p[2]}→${p[3]}.`
    };
  };

  const silog = ()=>{
    const a = pick(['Todos los','Algunos','Ningún'], rnd);
    const X = pick(['estudiantes','ingenieros','lectores','atletas'], rnd);
    const Y = pick(['organizados','puntuales','disciplinados','curiosos'], rnd);
    const concl = (a==='Todos los')?`Algunos ${X} son ${Y}`:(a==='Ningún')?`Ningún ${X} es ${Y}`:`Es posible que algunos ${X} no sean ${Y}`;
    const wrong = [
      `Todos los ${X} son ${Y}`,
      `Ningún ${X} es ${Y}`,
      `Todos los ${Y} son ${X}`
    ];
    const opts = shuffle([concl, ...wrong]);
    return {
      prompt:`${a} ${X} son ${Y}. ¿Cuál conclusión es correcta?`,
      choices: opts,
      answer_index: opts.indexOf(concl),
      explanation:`Validez lógica según cuantificador (${a}).`
    };
  };

  const makers = [seq_arit, seq_geom, analogia, silog];
  for(let i=0;i<n;i++) gen.push( pick(makers, rnd)() );
  return gen;
}

function fb_lectura(n, rnd){
  const out=[];
  const names = ['Ana','Luis','María','Carlos','Elena','Jorge'];
  const places = ['Colón','Panamá','David','Santiago','Chitré'];
  const goals = ['ingresar a la universidad','ganar una beca','mejorar su lectura','aprobar matemáticas'];
  const reasons = ['por disciplina','porque planifica bien','gracias al apoyo de su familia','por constancia diaria'];

  const vocab = [['exigente','riguroso'],['efímero','breve'],['meticuloso','cuidadoso'],['tenaz','persistente']];

  while(out.length<n){
    const nombre = pick(names, rnd);
    const ciudad = pick(places, rnd);
    const objetivo = pick(goals, rnd);
    const motivo = pick(reasons, rnd);
    const texto = `${nombre} vive en ${ciudad}. Se propuso ${objetivo} y organizó su tiempo; ${motivo} la/lo ayuda a sostener el plan. Aunque surgen contratiempos, adapta su rutina para no perder el ritmo.`;

    // idea principal
    out.push({
      id:null,
      prompt:`Texto: ${texto} Pregunta: ¿Cuál es la idea principal del texto?`,
      choices: shuffle([
        `${nombre} mantiene un plan para ${objetivo}`,
        `Los contratiempos impiden estudiar`,
        `${nombre} quiere mudarse de ${ciudad}`,
        `La familia decide por ${nombre}`
      ]),
      answer_index: 0,
      explanation:`La idea central es la constancia de ${nombre} para ${objetivo}.`
    }); if(out.length===n) break;

    // detalle explícito
    out.push({
      id:null,
      prompt:`Texto: ${texto} Pregunta: ¿Qué factor apoya el plan de ${nombre}?`,
      choices: shuffle([
        motivo.replace(' la/lo ',' '),
        'No dormir',
        'Cambiar de ciudad',
        'Abandonar las metas'
      ]),
      answer_index: 0,
      explanation:`El texto dice: "${motivo}".`
    }); if(out.length===n) break;

    // inferencia
    out.push({
      id:null,
      prompt:`Texto: ${texto} Pregunta: Se infiere que, ante un imprevisto, ${nombre}…`,
      choices: shuffle([
        'ajusta la rutina para continuar',
        'abandona el plan',
        'culpa a su familia',
        'deja de estudiar por semanas'
      ]),
      answer_index: 0,
      explanation:`"Adapta su rutina para no perder el ritmo" ⇒ ajusta la rutina.`
    }); if(out.length===n) break;

    // vocabulario en contexto
    const [pal, sinon] = pick(vocab, rnd);
    const texto2 = `El plan de ${nombre} es ${pal} pero flexible.`;
    out.push({
      id:null,
      prompt:`Texto: ${texto2} Pregunta: En el contexto, "${pal}" significa…`,
      choices: shuffle([sinon,'improvisado','inútil','desordenado']),
      answer_index: 0,
      explanation:`En este contexto, "${pal}" ≈ "${sinon}".`
    });
  }
  return out.slice(0,n);
}

/** ---------- Handler ---------- */
export default async function handler(req,res){
  cors(res);
  if(req.method==='OPTIONS'){ res.status(200).end(); return; }
  if(req.method!=='POST'){ res.status(405).json({ok:false,error:'METHOD_NOT_ALLOWED'}); return; }

  try{
    const b = await parseBody(req);
    const topic = (b.topic||'').toString().trim();
    const difficulty = (b.difficulty||'mixed').toString().trim() || 'mixed';
    const sub = (b.topic_sub||'').toString().trim() || null; // opcional
    const debug = !!b.debug;
    const variant = Number.isInteger(b.variant) ? b.variant : null;

    let count = clamp(parseInt(b.count||DEFAULT_COUNT,10)||DEFAULT_COUNT, 1, MAX_COUNT);
    if(!ALLOWED_TOPICS.includes(topic)){
      return res.status(400).json({ok:false, error:'INVALID_TOPIC'});
    }

    let items = [];
    let meta = { from_ai:0, from_db:0, from_fallback:0, reason:null, seed:null };

    // 1) IA
    try{
      const ai = await aiGenerate({topic, count, variant, difficulty, sub});
      if(ai.ok){ items = ai.items; meta.from_ai = items.length; meta.seed = ai.seed; }
      else { meta.reason = ai.reason || meta.reason; }
    }catch{ meta.reason = 'AI_EXCEPTION'; }

    // 2) DB (si faltan)
    try{
      if(items.length < count){
        const supa = getClient();
        const selCols = 'id,prompt,choices,answer_index,explanation';
        const { data } = await supa
          .from('questions')
          .select(selCols)
          .eq('topic', topic)
          .eq('active', true)
          .order('created_at',{ascending:false})
          .limit(150);
        if(Array.isArray(data) && data.length){
          const db = shuffle(data.slice());
          for(const q of db){
            if(items.length>=count) break;
            items.push(q); meta.from_db++;
          }
        }
      }
    }catch(_e){ /* no bloquea */ }

    // 3) Fallback PRO (si aún faltan)
    if(items.length < count){
      const seed = Number.isInteger(variant) ? variant : Math.floor(Date.now()/1000);
      const rnd = mulberry32(seed);
      const miss = count - items.length;
      let fb=[];
      if(topic==='algebra') fb = fb_algebra(miss, rnd);
      else if(topic==='logico') fb = fb_logico(miss, rnd);
      else fb = fb_lectura(miss, rnd);
      items = items.concat(fb);
      meta.from_fallback = fb.length;
    }else{
      items = items.slice(0, count);
    }

    if(debug) return res.status(200).json({ok:true, items, meta});
    return res.status(200).json({ok:true, items});
  }catch(e){
    // último recurso
    const rnd = mulberry32(Math.floor(Date.now()/1000));
    const topic = 'algebra';
    const items = fb_algebra(DEFAULT_COUNT, rnd);
    return res.status(200).json({ok:true, items, meta:{from_ai:0,from_db:0,from_fallback:items.length,reason:'HARD_FALLBACK',detail:e.message}});
  }
}
