// /api/generate-questions.js
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE;

const supa = (SUPABASE_URL && SUPABASE_SERVICE_ROLE)
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE)
  : null;

function normTopic(t='') {
  const x = (t||'').toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu,'');
  if (['espanol','español','lectura','comprension','comprension lectora','reading'].includes(x)) return 'lectura';
  if (['logico','razonamiento','razonamiento logico','logic'].includes(x)) return 'logico';
  if (['algebra','matematicas','matemáticas','math','mate'].includes(x)) return 'algebra';
  if (['biologia'].includes(x)) return 'biologia';
  if (['quimica'].includes(x)) return 'quimica';
  if (['fisica','física'].includes(x)) return 'fisica';
  return x || 'algebra';
}

function pick(arr, n) {
  const a = [...arr];
  for (let i=a.length-1;i>0;i--) { const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]] }
  return a.slice(0, n);
}

/* ---------- Generadores determinísticos (mejor calidad) ---------- */

function genLectura(k=10, seed=0) {
  const textos = [
    {
      p: 'El canal de Panamá es una vía de navegación interoceánica que conecta el Atlántico con el Pacífico. Su construcción transformó el comercio mundial al reducir significativamente los tiempos de viaje.',
      qs: [
        {q:'¿Cuál es la idea principal del texto?', opts:['Describir la fauna de Panamá','Explicar la función del canal de Panamá','Relatar la historia de un barco','Enumerar puertos del Atlántico'], a:1, e:'La idea central es la función del canal: conectar océanos y reducir tiempos.'},
        {q:'“Transformó el comercio mundial” sugiere…', opts:['Un cambio irrelevante','Un impacto notable','Un efecto local','Una consecuencia negativa'], a:1, e:'“Transformó” implica impacto notable, no menor ni negativo.'},
      ]
    },
    {
      p: 'La lectura frecuente mejora el vocabulario y la comprensión. Además, fortalece la memoria de trabajo al exigir relacionar ideas y anticipar significados según el contexto.',
      qs: [
        {q:'Según el texto, la lectura ayuda principalmente a…', opts:['Aumentar vocabulario y comprensión','Mejorar solo la velocidad','Recordar datos aislados','Evitar el contexto'], a:0, e:'Se menciona vocabulario, comprensión y memoria de trabajo.'},
        {q:'“Anticipar significados según el contexto” alude a…', opts:['Adivinar al azar','Inferir por pistas','Repetir definiciones','Traducir literalmente'], a:1, e:'Es una inferencia apoyada en el contexto.'},
      ]
    },
    {
      p: 'Un hábito sostenible de estudio incluye pausas regulares. Las pausas cortas permiten consolidar lo aprendido y reducen la fatiga cognitiva, lo que mejora el rendimiento.',
      qs: [
        {q:'El propósito de las pausas es…', opts:['Distraerse completamente','Aumentar la fatiga','Consolidar y reducir cansancio','Evitar estudiar'], a:2, e:'Pausas cortas consolidan aprendizajes y reducen fatiga.'},
      ]
    }
  ];
  const out = [];
  let si = seed % 997;
  while (out.length < k) {
    const t = textos[si % textos.length];
    for (const item of t.qs) {
      if (out.length >= k) break;
      out.push({
        prompt: `${item.q}\n\n[Texto] ${t.p}`,
        choices: item.opts,
        answer_index: item.a,
        explanation: item.e,
        topic: 'lectura'
      });
    }
    si++;
  }
  return out;
}

function genLogico(k=10, seed=0){
  const out=[];
  for (let i=0;i<k;i++){
    const v = (seed+i)%3;
    if (v===0){
      // Secuencias aritméticas
      const start = 2 + ((seed+i)%5);
      const step  = 3 + ((seed>>1)%4);
      const seq = [start, start+step, start+2*step, start+3*step];
      const ans = start+4*step;
      out.push({
        prompt:`Completa la secuencia: ${seq.join(', ')}, __`,
        choices:[String(ans-1), String(ans), String(ans+1), String(ans+2)],
        answer_index:1,
        explanation:`Progresión con diferencia constante ${step}.`,
        topic:'logico'
      });
    } else if (v===1){
      // Analogías
      const pairs = [
        ['Agua','Río','Arena','Desierto'],
        ['Libro','Biblioteca','País','Mapa'],
        ['Semilla','Árbol','Ladrillo','Casa'],
      ];
      const p = pairs[(seed+i)%pairs.length];
      out.push({
        prompt:`${p[0]} es a ${p[1]} como ${p[2]} es a:`,
        choices:['Edificio','Jardín','Casa','Calle'],
        answer_index:2,
        explanation:`Semilla:Árbol :: Ladrillo:Casa (parte-todo / componente).`,
        topic:'logico'
      });
    } else {
      // Deducción breve
      out.push({
        prompt:`Todos los mamíferos respiran aire. Los delfines respiran aire. Por lo tanto, los delfines son:`,
        choices:['Peces','Mamíferos','Reptiles','Aves'],
        answer_index:1,
        explanation:`Silogismo: si todos los mamíferos respiran aire y los delfines lo hacen, entonces son mamíferos.`,
        topic:'logico'
      });
    }
  }
  return out;
}

function genAlgebra(k=10, seed=0){
  const out=[];
  for(let i=0;i<k;i++){
    const a=2+((seed+i)%5), b=3+((seed+2*i)%7);
    const ans = (b - 1)/a; // ecuación a x + 1 = b
    out.push({
      prompt:`Resuelve para x: ${a}x + 1 = ${b}`,
      choices:[(ans-1).toFixed(2), ans.toFixed(2), (ans+1).toFixed(2), (ans+2).toFixed(2)],
      answer_index:1,
      explanation:`${a}x = ${b}-1 → x = ${(b-1)}/${a} = ${ans.toFixed(2)}.`,
      topic:'algebra'
    });
  }
  return out;
}

function genCiencia(k=10, seed=0, area='biologia'){
  const bank = {
    biologia: [
      ['Las células vegetales poseen:', ['Cloroplastos','Lisosomas exclusivamente','Núcleo ausente','ADN ausente'], 0, 'Los cloroplastos realizan fotosíntesis.'],
      ['La unidad básica de la vida es la:', ['Tejido','Órgano','Célula','Sistema'], 2, 'La célula es la unidad estructural y funcional.'],
    ],
    quimica: [
      ['pH=2 indica una disolución:', ['Ácida','Neutra','Básica','Salina'], 0, 'pH<7 → ácida.'],
      ['Número atómico Z representa:', ['Neutrones','Protones','Electrones de valencia','Masa molar'], 1, 'Z = protones.'],
    ],
    fisica: [
      ['Unidad de fuerza SI:', ['W','Pa','N','J'], 2, 'Newton (N).'],
      ['Velocidad es:', ['Fuerza/tiempo','Desplazamiento/tiempo','Trabajo/distancia','Masa/aceleración'], 1, 'Definición v=Δx/Δt.'],
    ],
    matematicas: [
      ['Derivada de x^2:', ['2x','x','x^3','2x^2'], 0, 'd/dx x^2 = 2x.'],
    ],
  };
  const base = bank[area] || bank.biologia;
  const out=[];
  let s=seed;
  while(out.length<k){
    const [q,opts,a,e] = base[s%base.length];
    out.push({ prompt:q, choices:opts, answer_index:a, explanation:e, topic:area });
    s++;
  }
  return out;
}

export default async function handler(req,res){
  try{
    if (req.method!=='POST') return res.status(405).json({ok:false,error:'METHOD'});
    const { topic, count=10, difficulty='medium', seed=Date.now()%1e6 } = req.body||{};
    const t = normTopic(topic);
    let need = Math.max(1, Math.min(100, Number(count)));
    const out = [];

    // 1) Intentar desde Supabase
    if (supa){
      const { data, error } = await supa
        .from('questions')
        .select('prompt,choices,answer_index,explanation,topic,active')
        .eq('active', true)
        .eq('topic', t)
        .limit(need*2); // traigo de más para randomizar
      if (!error && data?.length){
        const shuffled = pick(data, Math.min(data.length, need));
        shuffled.forEach(r=> out.push({
          prompt: r.prompt,
          choices: Array.isArray(r.choices)? r.choices : r.choices?.options || r.choices,
          answer_index: r.answer_index,
          explanation: r.explanation || '',
          topic: t
        }));
      }
    }

    // 2) Si faltan, completar con generadores
    if (out.length < need){
      const faltan = need - out.length;
      let gen = [];
      if (t==='lectura') gen = genLectura(faltan, seed);
      else if (t==='logico') gen = genLogico(faltan, seed);
      else if (t==='algebra') gen = genAlgebra(faltan, seed);
      else gen = genCiencia(faltan, seed, t);
      out.push(...gen);
    }

    return res.status(200).json(out.slice(0, need));
  } catch(e){
    return res.status(200).json([]); // nunca 500 para que el front no explote
  }
}


