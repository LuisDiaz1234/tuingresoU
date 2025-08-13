// /api/generate-questions.js — PRO+ (IA fuerte + fallback variado y más difícil)
import { cors, parseBody, getClient } from './_lib/supaClient.js';
import OpenAI from 'openai';

const ALLOWED_TOPICS = ['algebra','logico','lectura'];
const DEFAULT_COUNT = 10;
const MAX_COUNT = 30;

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const OPENAI_MODEL   = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const OPENAI_BASE_URL = process.env.OPENAI_BASE_URL || null;

function clamp(n, lo, hi){ return Math.max(lo, Math.min(hi, n)); }
function shuffle(a){ for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; } return a; }
function pick(arr, rnd){ return arr[Math.floor(rnd()*arr.length)] }
function mulberry32(seed){ return function(){ let t = seed += 0x6D2B79F5; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

// ---------- IA prompts (más exigentes) ----------
function iaPrompts(topic, count, difficulty='mixed', sub=null, quality='high'){
  const base = `
- Español claro, **una sola correcta**.
- 4 opciones por ítem (3–5 permitido, apunta a 4).
- Devuelve **solo JSON** del esquema.
- Incluye "explanation" breve y docente (por qué la correcta y por qué no las otras).
- Nivel: admisión UTP/UP. Dificultad: ${difficulty}. ${sub?`Subtema: ${sub}.`:''}
- Calidad: ${quality==='high'?'razonamiento de 2 pasos mínimo y distractores plausibles.':''}`;

  if(topic==='algebra'){
    return {
      system: `Genera ítems de Álgebra de admisión. ${base}
- Alterna: ecuaciones cuadráticas (con raíces enteras), sistemas 2x2, factoración, desigualdades y evaluación de f(x) o composición g(f(x)).`,
      user: `Genera ${count} preguntas de Álgebra con opciones múltiples.`
    };
  }
  if(topic==='logico'){
    return {
      system: `Genera ítems de Razonamiento Lógico. ${base}
- Mezcla: secuencias no triviales (patrones alternantes y mixtos), analogías semánticas, silogismos formales, conteo/combinatoria simple (permutaciones/comb), tablas de verdad/implicaciones.
- Evita secuencias +1 repetitivas. Usa reglas combinadas (p.ej., +2, ×2, -3...).`,
      user: `Genera ${count} preguntas de Lógico con opciones múltiples.`
    };
  }
  return {
    system: `Genera ítems de Comprensión Lectora. ${base}
- Cada ítem debe incluir **un mini-texto (1–3 frases)** dentro del "prompt" con el prefijo "Texto:" y luego una pregunta.
- Alterna: idea principal, detalle explícito, inferencia, propósito del autor, vocabulario en contexto.`,
    user: `Genera ${count} preguntas de Lectura (cada una con su mini-texto).`
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

async function aiGenerate({topic, count, variant, difficulty='mixed', sub=null, quality='high'}){
  if(!OPENAI_API_KEY) return { ok:false, reason:'NO_API_KEY' };
  const openai = new OpenAI({ apiKey: OPENAI_API_KEY, ...(OPENAI_BASE_URL?{baseURL:OPENAI_BASE_URL}:{}) });

  const seed = Number.isInteger(variant) ? variant : (Math.floor(Date.now()/60000) ^ Math.floor(Math.random()*1e9));
  const {system, user} = iaPrompts(topic, count, difficulty, sub, quality);
  const temperature = topic==='algebra' ? 0.5 : 0.7;

  const resp = await openai.chat.completions.create({
    model: OPENAI_MODEL,
    temperature,
    seed,
    response_format: { type: "json_object" },
    messages: [{ role:'system', content: system }, { role:'user', content: user }],
  });

  const txt = resp.choices?.[0]?.message?.content || '';
  let parsed=null; try{ parsed = JSON.parse(txt); }catch{ return { ok:false, reason:'BAD_JSON' }; }
  const items = Array.isArray(parsed.items)?parsed.items:[];

  const vetted = items.filter(q=>{
    if(!q || typeof q!=='object') return false;
    const p = (q.prompt||'').toString().trim();
    const ch = Array.isArray(q.choices)?q.choices.map(x=>x.toString()):[];
    const ai = Number.isInteger(q.answer_index)?q.answer_index:-1;
    return p && ch.length>=3 && ch.length<=5 && ai>=0 && ai<ch.length;
  }).map(q=>({ id:null, prompt:q.prompt, choices:q.choices, answer_index:q.answer_index, explanation:(q.explanation||'').toString() })).slice(0,count);

  if(vetted.length===0) return { ok:false, reason:'EMPTY' };
  return { ok:true, items:vetted, seed };
}

// ---------- Fallbacks más desafiantes ----------
function fb_algebra(n, rnd){
  const out=[];
  const quad = ()=>{
    // Genera raíces enteras r1≠r2 → x^2 - (r1+r2)x + (r1*r2) = 0
    const r1 = 1+Math.floor(rnd()*5), r2 = (rnd()<.5? -1:1)*(2+Math.floor(rnd()*5));
    const b = -(r1+r2), c = r1*r2;
    const ans = `x=${r1} y x=${r2}`;
    const distract = shuffle([`x=${r1} y x=${-r2}`, `x=${-r1} y x=${r2}`, `x=${-r1} y x=${-r2}`]);
    return {
      prompt:`Resuelve: x^2 ${b>=0?'+':''}${b}x ${c>=0?'+':''}${c} = 0`,
      choices: shuffle([ans, ...distract]),
      answer_index: 0,
      explanation:`Ecuación cuadrática con raíces r1=${r1}, r2=${r2}; sum=${r1+r2}, prod=${r1*r2}.`
    };
  };
  const sistema = ()=>{
    // ax+by=e ; cx+dy=f con solución entera pequeña
    const x = 1+Math.floor(rnd()*4), y= -2+Math.floor(rnd()*5);
    let a=1+Math.floor(rnd()*5), b=1+Math.floor(rnd()*5), c=1+Math.floor(rnd()*5), d=1+Math.floor(rnd()*5);
    const e = a*x + b*y, f = c*x + d*y;
    const ans = `x=${x}, y=${y}`;
    const distract = shuffle([`x=${x+1}, y=${y}`, `x=${x}, y=${y+1}`, `x=${x-1}, y=${y-1}`]);
    return {
      prompt:`Resuelve el sistema: ${a}x+${b}y=${e} y ${c}x+${d}y=${f}`,
      choices: shuffle([ans, ...distract]),
      answer_index: 0,
      explanation:`Sustitución o eliminación → solución (${x},${y}).`
    };
  };
  const compos = ()=>{
    const a=2+Math.floor(rnd()*4), b=1+Math.floor(rnd()*6), c=1+Math.floor(rnd()*4), d=1+Math.floor(rnd()*6), t=1+Math.floor(rnd()*6);
    const val = c*(a*t+b)+d;
    const wrong = shuffle([val+1, val-1, val+2].map(String));
    return {
      prompt:`Sean f(x)=${a}x+${b} y g(x)=${c}x+${d}. ¿Cuánto vale g(f(${t}))?`,
      choices: shuffle([String(val), ...wrong]),
      answer_index: 0,
      explanation:`g(f(t)) = c·(a t + b)+d = ${val}.`
    };
  };
  const makers=[quad,sistema,compos];
  for(let i=0;i<n;i++) out.push(pick(makers, rnd)());
  return out;
}

function fb_logico(n, rnd){
  const out=[];
  const seq_mixta = ()=>{
    // alterna +k y ×m
    const start = 2+Math.floor(rnd()*4), k = 2+Math.floor(rnd()*3), m = 2+Math.floor(rnd()*2);
    const s=[start];
    for(let i=1;i<=4;i++) s.push( i%2? s[i-1]+k : s[i-1]*m );
    const ans = (s[4]%2? s[4]+k : s[4]*m); // regla siguiente igual a la usada para obtener s4
    const d = shuffle([ans+k, ans-1, ans*m].map(String));
    return {
      prompt:`Completa la secuencia: ${s[0]}, ${s[1]}, ${s[2]}, ${s[3]}, ${s[4]}, __`,
      choices: shuffle([String(ans), ...d]),
      answer_index: 0,
      explanation:`Patrón alternante: +${k}, ×${m}.`
    };
  };
  const combi = ()=>{
    // Permutaciones pequeñas
    const n0 = 3+Math.floor(rnd()*3); // 3..5
    let fact=1; for(let i=2;i<=n0;i++) fact*=i;
    const wrong = shuffle([fact-1, fact+1, (n0-1)*(n0-1)].map(String));
    return {
      prompt:`¿De cuántas formas distintas se pueden ordenar ${n0} libros diferentes en un estante?`,
      choices: shuffle([String(fact), ...wrong]),
      answer_index: 0,
      explanation:`Permutaciones de ${n0} → ${n0}! = ${fact}.`
    };
  };
  const logica = ()=>{
    // verdad de p→q con valores
    const p = rnd()<.5, q = rnd()<.5;
    const ans = (!p || q);
    const opts = shuffle(['Verdadero','Falso','Indeterminado','No se puede saber']);
    return {
      prompt:`Si p→q. Con p=${p?'V':'F'} y q=${q?'V':'F'}, el valor de p→q es:`,
      choices: opts,
      answer_index: opts.indexOf(ans?'Verdadero':'Falso'),
      explanation:`p→q ≡ ¬p ∨ q → ${(!p)} ∨ ${q} = ${ans?'V':'F'}.`
    };
  };
  const analogia = ()=>{
    const pares = [
      ['médico','hospital','profesor','escuela','paciente','aula'],
      ['abeja','colmena','soldado','cuartel','jardín','nido'],
      ['autor','libro','pintor','cuadro','galería','poema']
    ];
    const p = pares[Math.floor(rnd()*pares.length)];
    const correcta = p[3];
    const opts = shuffle([p[3],p[4],p[5],p[1]]);
    return {
      prompt:`Analogía: ${p[0]} es a ${p[1]} como ${p[2]} es a __`,
      choices: opts,
      answer_index: opts.indexOf(correcta),
      explanation:`Relación lugar/obra/función → ${p[2]}:${p[3]}.`
    };
  };
  const makers=[seq_mixta, combi, logica, analogia];
  for(let i=0;i<n;i++) out.push(pick(makers, rnd)());
  return out;
}

function fb_lectura(n, rnd){
  const out=[];
  const textos = [
    `En un barrio cercano al mar, la biblioteca abrió más temprano durante el verano. A pesar del calor, los estudiantes acudían cada mañana para preparar el examen de ingreso.`,
    `El equipo decidió cambiar de estrategia a mitad del proyecto. Aunque implicó rehacer tareas, el resultado final fue más claro y útil para la comunidad.`,
    `La estación lluviosa retrasó varias actividades al aire libre. Sin embargo, los instructores adaptaron las prácticas para aprovechar espacios cubiertos.`
  ];
  const vocab = [['meticuloso','cuidadoso'],['efímero','breve'],['riguroso','exigente'],['tenaz','persistente']];

  while(out.length<n){
    const t = pick(textos, rnd);

    // idea principal
    out.push({
      id:null,
      prompt:`Texto: ${t} Pregunta: ¿Cuál es la idea principal del texto?`,
      choices: shuffle([
        'Se describe la idea central de la situación',
        'Se afirma un dato ajeno al texto',
        'Se relaciona un hecho no mencionado',
        'Se plantea una opinión sin sustento'
      ]),
      answer_index: 0,
      explanation:`La opción correcta resume el núcleo del texto.`
    }); if(out.length===n) break;

    // inferencia
    out.push({
      id:null,
      prompt:`Texto: ${t} Pregunta: ¿Qué se puede deducir del texto?`,
      choices: shuffle([
        'Hubo un ajuste para conseguir un mejor resultado',
        'Todo se mantuvo igual desde el inicio',
        'La gente dejó de asistir por completo',
        'No hubo cambios en el entorno'
      ]),
      answer_index: 0,
      explanation:`La narración sugiere adaptación y mejora.`
    }); if(out.length===n) break;

    // vocabulario
    const [pal, sinon] = pick(vocab, rnd);
    out.push({
      id:null,
      prompt:`Texto: ${t} Pregunta: En el contexto, la palabra "${pal}" significa…`,
      choices: shuffle([sinon,'descuidado','irrelevante','aleatorio']),
      answer_index: 0,
      explanation:`En el contexto dado, "${pal}" ≈ "${sinon}".`
    });
  }
  return out.slice(0,n);
}

// ---------- Handler ----------
export default async function handler(req,res){
  cors(res);
  if(req.method==='OPTIONS'){ res.status(200).end(); return; }
  if(req.method!=='POST'){ res.status(405).json({ok:false,error:'METHOD_NOT_ALLOWED'}); return; }

  try{
    const b = await parseBody(req);
    const topic = (b.topic||'').toString().trim();
    const difficulty = (b.difficulty||'mixed').toString().trim() || 'mixed';
    const quality = (b.quality||'high').toString().trim() || 'high';
    const sub = (b.topic_sub||'').toString().trim() || null;
    const debug = !!b.debug;
    const variant = Number.isInteger(b.variant) ? b.variant : null;

    let count = clamp(parseInt(b.count||DEFAULT_COUNT,10)||DEFAULT_COUNT, 1, MAX_COUNT);
    if(!ALLOWED_TOPICS.includes(topic)){
      return res.status(400).json({ok:false, error:'INVALID_TOPIC'});
    }

    let items = [];
    let meta = { from_ai:0, from_db:0, from_fallback:0, reason:null, seed:null };

    // IA primero
    try{
      const ai = await aiGenerate({topic, count, variant, difficulty, sub, quality});
      if(ai.ok){ items = ai.items; meta.from_ai = items.length; meta.seed = ai.seed; }
      else { meta.reason = ai.reason || meta.reason; }
    }catch{ meta.reason = 'AI_EXCEPTION'; }

    // DB curada (si tienes banco)
    try{
      if(items.length < count){
        const supa = getClient();
        const { data } = await supa
          .from('questions')
          .select('id,prompt,choices,answer_index,explanation')
          .eq('topic', topic).eq('active', true)
          .order('created_at',{ascending:false}).limit(200);
        if(Array.isArray(data) && data.length){
          const db = shuffle(data.slice());
          for(const q of db){ if(items.length>=count) break; items.push(q); meta.from_db++; }
        }
      }
    }catch(_e){}

    // Fallback difícil si aún falta
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
    const rnd = mulberry32(Math.floor(Date.now()/1000));
    const items = fb_logico(DEFAULT_COUNT, rnd); // último recurso: lógico variado
    return res.status(200).json({ok:true, items, meta:{from_ai:0,from_db:0,from_fallback:items.length,reason:'HARD_FALLBACK',detail:e.message}});
  }
}

