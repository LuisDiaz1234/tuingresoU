import { getClient, cors, parseBody } from './_lib/supaClient.js';

const ALLOWED_TOPICS = ['algebra','logico','lectura'];

function makeFallback(topic, n=10){
  // Plantillas determinísticas y simples por tema (si la DB no tiene suficientes)
  const arr=[];
  for(let i=1;i<=n;i++){
    if(topic==='algebra'){
      const a=i+1,b=i+2; // 2..,3..
      const correct=a+b;
      arr.push({
        id:null,
        prompt:`¿Cuánto es ${a} + ${b}?`,
        choices:[String(correct), String(correct+1), String(correct-1), String(correct+2)],
        answer_index:0,
        explanation:`Suma directa: ${a} + ${b} = ${correct}.`
      });
    }else if(topic==='logico'){
      const seq=[i,i+1,i+2,i+3];
      arr.push({
        id:null,
        prompt:`Completa la secuencia: ${seq[0]}, ${seq[1]}, ${seq[2]}, __`,
        choices:[String(seq[3]), String(seq[2]+2), String(seq[1]+3)],
        answer_index:0,
        explanation:`Secuencia +1: el siguiente es ${seq[3]}.`
      });
    }else{ // lectura
      arr.push({
        id:null,
        prompt:`En el texto: "Juan estudia porque quiere aprobar el examen". ¿Cuál es la causa?`,
        choices:['Quiere aprobar el examen','Juan estudia','El examen es mañana'],
        answer_index:0,
        explanation:`La causa es el motivo: "quiere aprobar el examen".`
      });
    }
  }
  return arr;
}

function shuffle(a){ for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; } return a; }

export default async function handler(req,res){
  cors(res);
  if(req.method==='OPTIONS'){ res.status(200).end(); return; }
  if(req.method!=='POST'){ res.status(405).json({ok:false,error:'METHOD_NOT_ALLOWED'}); return; }

  try{
    const b = await parseBody(req);
    const topic = (b.topic||'').toString().trim();
    const count = Math.max(1, Math.min(parseInt(b.count||'10',10), 30));

    if(!ALLOWED_TOPICS.includes(topic)){ res.status(400).json({ok:false,error:'INVALID_TOPIC'}); return; }

    const supa = getClient();
    const { data, error } = await supa
      .from('questions')
      .select('id,prompt,choices,answer_index,explanation')
      .eq('topic', topic).eq('active', true)
      .order('created_at', {ascending:false})
      .limit(100);

    if(error) throw error;

    let items = Array.isArray(data) ? data.slice() : [];
    if(items.length>0) shuffle(items);
    if(items.length < count){
      const missing = count - items.length;
      items = items.concat(makeFallback(topic, missing));
    }else{
      items = items.slice(0, count);
    }

    res.status(200).json({ok:true, items});
  }catch(e){
    res.status(500).json({ok:false,error:'SERVER_ERROR',detail:e.message});
  }
}
