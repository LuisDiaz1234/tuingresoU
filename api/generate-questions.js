// /api/generate-questions.js — STRICT QUALITY (IA + validación + reintentos + fallbacks exigentes)
import { cors, parseBody, getClient } from './_lib/supaClient.js';
import OpenAI from 'openai';

const ALLOWED_TOPICS = ['algebra','logico','lectura'];
const DEFAULT_COUNT = 10;
const MAX_COUNT = 30;

const OPENAI_API_KEY  = process.env.OPENAI_API_KEY || '';
const OPENAI_MODEL    = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const OPENAI_BASE_URL = process.env.OPENAI_BASE_URL || null;

// ---------- utils ----------
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const uniq  = arr => Array.from(new Set(arr));
function shuffle(a){ for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; } return a; }
function mulberry32(seed){ return function(){ let t = seed += 0x6D2B79F5; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const pick = (arr, rnd) => arr[Math.floor(rnd()*arr.length)];

// ---------- prompts IA (más duros) ----------
function iaPrompts(topic, count, difficulty='hard', sub=null, quality='strict'){
  const base = `
- Español claro, una sola correcta.
- 4 opciones por ítem (3–5 permitido; intenta 4). Distractores plausibles.
- Responde **solo JSON** con el esquema pedido.
- Explicación docente no trivial (por qué la correcta y por qué las otras no).
- Nivel: admisión UTP/UP. Dificultad: ${difficulty}. Calidad: ${quality}.
- Requiere al menos 2 pasos de razonamiento o una regla no trivial.`;

  if(topic==='algebra'){
    return {
      system: `Generador de Álgebra para admisión. ${base}
- Alterna: ecuaciones cuadráticas con raíces enteras distintas, sistemas 2×2 por eliminación o sustitución, desigualdades, factorización, evaluación/composición de funciones (g(f(x))). Evita sumas directas simples.`,
      user: `Genera ${count} preguntas de Álgebra con opciones múltiples.`
    };
  }
  if(topic==='logico'){
    return {
      system: `Generador de Razonamiento Lógico. ${base}
- Alterna: secuencias mixtas (p. ej., +2, ×2, −3, ...), analogías formales, silogismos con cuantificadores, conteo/combinatoria (permutaciones/variaciones sencillas), lógica proposicional (p→q, tablas de verdad).
- Prohíbe secuencias +1 repetitivas.`,
      user: `Genera ${count} preguntas de Lógico con opciones múltiples.`
    };
  }
  // lectura
  return {
    system: `Generador de Comprensión Lectora. ${base}
- Cada ítem debe incluir un **mini-texto (2–3 frases)** dentro de "prompt", iniciando con "Texto:", seguido de "Pregunta: ...".
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

// ---------- validadores de calidad (heurísticos pero duros) ----------
function cleanItem(q){
  if(!q) return null;
  const prompt = (q.prompt||'').toString().trim();
  let choices = Array.isArray(q.choices)? q.choices.map(x=>x.toString().trim()) : [];
  const idx = Number.isInteger(q.answer_index)? q.answer_index : -1;
  const explanation = (q.explanation||'').toString().trim();
  choices = choices.filter(Boolean);
  choices = uniq(choices);
  return { prompt, choices, answer_index: idx, explanation };
}

function isHardEnough(topic, qi){
  const p = qi.prompt || '';
  const exp = qi.explanation || '';
  if(qi.choices.length < 3 || qi.choices.length > 5) return false;
  if(qi.answer_index < 0 || qi.answer_index >= qi.choices.length) return false;
  if(exp.length < 40) return false; // explicación mínima

  if(topic==='algebra'){
    // debe ver variables o funciones; evitar “2+3”
    const hasMath = /[xy]|f\(|g\(|\^|≥|≤|=/.test(p);
    return hasMath && p.length >= 55;
  }
  if(topic==='logico'){
    const hasKey = /(secuencia|Analogía|silogismo|permut|combin|p→q|tabla)/i.test(p) || /→|⇒/.test(p);
    return hasKey && p.length >= 65;
  }
  // lectura
  const okTexto = /^Texto:/i.test(p) && p.split(/\s+/).length >= 40 && /Pregunta:/i.test(p);
  return okTexto;
}

// IA con reintentos hasta cumplir calidad
async function aiStrict({topic, count, difficulty='hard', sub=null, quality='strict', variant=null}){
  if(!OPENAI_API_KEY) return { ok:false, reason:'NO_API_KEY' };
  const openai = new OpenAI({ apiKey: OPENAI_API_KEY, ...(OPENAI_BASE_URL?{baseURL:OPENAI_BASE_URL}:{}) });
  const maxTries = 3;
  let items = [], seed = variant ?? Math.floor(Date.now()/60000);

  for(let t=0; t<maxTries && items.length<count; t++){
    const {system, user} = iaPrompts(topic, count, difficulty, sub, quality);
    const resp = await openai.chat.completions.create({
      model: OPENAI_MODEL,
      temperature: topic==='algebra'?0.45:0.65,
      seed,
      response_format: { type:'json_object' },
      messages: [{role:'system',content:system},{role:'user',content:user}],
    });
    const txt = resp.choices?.[0]?.message?.content || '';
    let parsed=null; try{ parsed = JSON.parse(txt); }catch{ parsed=null; }
    const raw = Array.isArray(parsed?.items)? parsed.items : [];
    const vetted = raw.map(cleanItem).filter(Boolean).filter(q=>isHardEnough(topic,qi(q)));
    function qi(q){ return q; } // alias
    items = items.concat(vetted).slice(0,count);
    seed += 77; // cambia semilla para la próxima
  }

  if(items.length===0) return { ok:false, reason:'EMPTY' };
  return { ok:true, items, seed };
}

// ---------- fallbacks exigentes ----------
function fb_algebra(n, rnd){
  const out=[];
  const quad=()=>{
    const r1 = 1+Math.floor(rnd()*5), r2 = (rnd()<.5?-1:1)*(2+Math.floor(rnd()*5));
    const b = -(r1+r2), c = r1*r2;
    const ans = `x=${r1} y x=${r2}`;
    const distract = shuffle([`x=${r1} y x=${-r2}`, `x=${-r1} y x=${r2}`, `x=${-r1} y x=${-r2}`]);
    return { prompt:`Resuelve: x^2 ${b>=0?'+':''}${b}x ${c>=0?'+':''}${c} = 0`,
      choices: shuffle([ans,...distract]), answer_index:0,
      explanation:`Sum=${r1+r2}, prod=${r1*r2}.` };
  };
  const sistema=()=>{
    const x = 1+Math.floor(rnd()*4), y = -2+Math.floor(rnd()*5);
    let a=1+Math.floor(rnd()*5), b=1+Math.floor(rnd()*5), c=1+Math.floor(rnd()*5), d=1+Math.floor(rnd()*5);
    const e=a*x+b*y, f=c*x+d*y;
    const ans=`x=${x}, y=${y}`;
    const distract=shuffle([`x=${x+1}, y=${y}`, `x=${x}, y=${y+1}`, `x=${x-1}, y=${y-1}`]);
    return { prompt:`Resuelve el sistema: ${a}x+${b}y=${e}; ${c}x+${d}y=${f}`,
      choices: shuffle([ans,...distract]), answer_index:0,
      explanation:`Eliminación o sustitución → (${x},${y}).` };
  };
  const comp=()=>{
    const a=2+Math.floor(rnd()*4), b=1+Math.floor(rnd()*6), c=1+Math.floor(rnd()*4), d=1+Math.floor(rnd()*6), t=1+Math.floor(rnd()*6);
    const val=c*(a*t+b)+d;
    const wrong=shuffle([val+1,val-1,val+2].map(String));
    return { prompt:`Sean f(x)=${a}x+${b} y g(x)=${c}x+${d}. ¿Cuánto vale g(f(${t}))?`,
      choices: shuffle([String(val),...wrong]), answer_index:0,
      explanation:`g(f(t)) = c·(a t + b)+d = ${val}.` };
  };
  const ineq=()=>{
    const k=2+Math.floor(rnd()*3), m=1+Math.floor(rnd()*5);
    const ans=`x>${(m/k).toFixed(2)}`;
    const wrong=shuffle([`x<${(m/k).toFixed(2)}`,`x>${(m/k+1).toFixed(2)}`,`x<${(m/k-1).toFixed(2)}`]);
    return { prompt:`Resuelve la desigualdad ${k}x > ${m}`,
      choices: shuffle([ans,...wrong]), answer_index:0,
      explanation:`Dividir por ${k}>0: x>${(m/k).toFixed(2)}.` };
  };
  const makers=[quad,sistema,comp,ineq];
  for(let i=0;i<n;i++) out.push(pick(makers,rnd)());
  return out;
}
function fb_logico(n, rnd){
  const out=[];
  const seqMixta=()=>{
    const start=2+Math.floor(rnd()*4), k=2+Math.floor(rnd()*3), m=2+Math.floor(rnd()*2);
    const s=[start]; for(let i=1;i<=4;i++) s.push(i%2? s[i-1]+k : s[i-1]*m);
    const ans= (s[4]%2? s[4]+k : s[4]*m);
    const wrong=shuffle([ans+k, ans-1, ans*m].map(String));
    return { prompt:`Completa la secuencia: ${s.join(', ')}, __`, choices:shuffle([String(ans),...wrong]), answer_index:0, explanation:`Patrón alternante +${k}, ×${m}.` };
  };
  const perm=()=>{
    const n0=4+Math.floor(rnd()*2); let fact=1; for(let i=2;i<=n0;i++) fact*=i;
    const wrong=shuffle([fact-1,fact+1,(n0-1)*(n0-1)].map(String));
    return { prompt:`¿De cuántas formas se ordenan ${n0} libros diferentes en un estante?`,
      choices:shuffle([String(fact),...wrong]), answer_index:0, explanation:`Permutaciones: ${n0}! = ${fact}.` };
  };
  const silog=()=>{
    const q = [['Todos los','Cada','Ningún','Algunos'],['estudiantes','atletas','lectores','ingenieros'],['puntuales','disciplinados','curiosos','organizados']];
    const a=pick(q[0],rnd), X=pick(q[1],rnd), Y=pick(q[2],rnd);
    const concl = (a==='Ningún')?`Ningún ${X} es ${Y}`:(a==='Todos los'||a==='Cada')?`Algunos ${X} son ${Y}`:`Es posible que algunos ${X} no sean ${Y}`;
    const wrong=shuffle([`Todos los ${X} son ${Y}`,`Ningún ${X} es ${Y}`,`Todos los ${Y} son ${X}`]);
    const opts=shuffle([concl,...wrong]);
    return { prompt:`${a} ${X} son ${Y}. ¿Cuál conclusión es válida?`, choices:opts, answer_index:opts.indexOf(concl), explanation:`Validez según cuantificador (${a}).` };
  };
  const logica=()=>{
    const p=rnd()<.5,q=rnd()<.5; const val=(!p||q);
    const opts=shuffle(['Verdadero','Falso','Indeterminado','No se puede saber']);
    return { prompt:`Si p→q. Con p=${p?'V':'F'} y q=${q?'V':'F'}, el valor de p→q es:`,
      choices:opts, answer_index:opts.indexOf(val?'Verdadero':'Falso'), explanation:`p→q ≡ ¬p ∨ q → ${(!p)} ∨ ${q}.` };
  };
  const makers=[seqMixta,perm,silog,logica];
  for(let i=0;i<n;i++) out.push(pick(makers,rnd)());
  return out;
}
function fb_lectura(n, rnd){
  const out=[];
  const bases = [
    `Durante la temporada lluviosa, el centro de estudio ajustó sus horarios. Aunque al inicio hubo confusión, la asistencia aumentó cuando los tutores coordinaron sesiones breves con materiales descargables.`,
    `El comité decidió reemplazar la guía con explicaciones más visuales. Si bien implicó rehacer parte del curso, los estudiantes reportaron mayor claridad para preparar el examen de ingreso.`,
    `En una comunidad costera, la biblioteca amplió su sala de lectura. Las familias comenzaron a asistir por la tarde, y los jóvenes organizaron clubes para mejorar comprensión lectora y razonamiento.`
  ];
  const vocab=[['meticuloso','cuidadoso'],['efímero','breve'],['riguroso','exigente'],['tenaz','persistente']];
  while(out.length<n){
    const t = pick(bases,rnd);
    // idea principal
    out.push({
      prompt:`Texto: ${t} Pregunta: ¿Cuál es la idea principal del texto?`,
      choices: shuffle(['Se describe un cambio que mejora resultados','El mal clima canceló toda actividad','No hubo ajustes en el proceso','Los estudiantes abandonaron el curso']),
      answer_index:0, explanation:`Resume el núcleo del texto.`
    }); if(out.length===n) break;
    // inferencia
    out.push({
      prompt:`Texto: ${t} Pregunta: ¿Qué se puede inferir sobre la reacción de los estudiantes?`,
      choices: shuffle(['Valoran los ajustes cuando clarifican el estudio','Prefieren no asistir a sesiones breves','Rechazan materiales descargables','No necesitan tutorías']),
      answer_index:0, explanation:`El texto sugiere mejora de asistencia/claridad.`
    }); if(out.length===n) break;
    // vocabulario
    const [pal,sin]=pick(vocab,rnd);
    out.push({
      prompt:`Texto: ${t} Pregunta: En el contexto, "${pal}" significa…`,
      choices: shuffle([sin,'improvisado','irrelevante','desordenado']),
      answer_index:0, explanation:`En contexto, "${pal}"≈"${sin}".`
    });
  }
  return out.slice(0,n);
}

// ---------- handler ----------
export default async function handler(req,res){
  cors(res);
  if(req.method==='OPTIONS'){ res.status(200).end(); return; }
  if(req.method!=='POST'){ res.status(405).json({ok:false,error:'METHOD_NOT_ALLOWED'}); return; }

  try{
    const b = await parseBody(req);
    const topic      = (b.topic||'').toString().trim();
    const difficulty = (b.difficulty||'hard').toString().trim() || 'hard';
    const quality    = (b.quality||'strict').toString().trim() || 'strict';
    const sub        = (b.topic_sub||'').toString().trim() || null;
    const variant    = Number.isInteger(b.variant) ? b.variant : null;
    const debug      = !!b.debug;

    let count = clamp(parseInt(b.count||DEFAULT_COUNT,10)||DEFAULT_COUNT, 1, MAX_COUNT);
    if(!ALLOWED_TOPICS.includes(topic)){
      return res.status(400).json({ok:false,error:'INVALID_TOPIC'});
    }

    let items = [];
    const meta = { from_ai:0, from_db:0, from_fallback:0, seed:null, reason:null };

    // 1) IA estricta con reintentos
    try{
      const ai = await aiStrict({topic, count, difficulty, sub, quality, variant});
      if(ai.ok){ items = ai.items; meta.from_ai = items.length; meta.seed = ai.seed; }
      else { meta.reason = ai.reason || meta.reason; }
    }catch(_e){ meta.reason = 'AI_EXCEPTION'; }

    // 2) Banco (si tienes curados)
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

    // 3) Fallback exigente
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
    // último recurso: lógico exigente
    const rnd = mulberry32(Math.floor(Date.now()/1000));
    const items = fb_logico(DEFAULT_COUNT, rnd);
    return res.status(200).json({ok:true, items, meta:{from_ai:0,from_db:0,from_fallback:items.length,reason:'HARD_FALLBACK',detail:e.message}});
  }
}


