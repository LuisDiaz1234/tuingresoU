// /api/generate-exam.js — Presets oficiales (DB-only) + personalizado
import { cors, parseBody, getClient } from './_lib/supaClient.js';

function clamp(n, lo, hi){ return Math.max(lo, Math.min(hi, n)); }
async function takeFromDB({ exam=null, subject=null, topic=null, count=10 }){
  const supa = getClient();
  let q = supa.from('questions')
    .select('id,prompt,choices,answer_index,explanation,topic,exam,subject,active')
    .eq('active', true)
    .limit(500);
  if(exam) q = q.eq('exam', exam);
  if(subject) q = q.eq('subject', subject);
  if(topic) q = q.eq('topic', topic);

  const { data, error } = await q;
  if(error) throw new Error(error.message);
  const pool = Array.isArray(data)? data : [];
  // shuffle simple
  for(let i=pool.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [pool[i],pool[j]]=[pool[j],pool[i]]; }
  return pool.slice(0, count);
}

export default async function handler(req,res){
  cors(res);
  if(req.method==='OPTIONS'){ res.status(200).end(); return; }
  if(req.method!=='POST'){ res.status(405).json({ok:false,error:'METHOD_NOT_ALLOWED'}); return; }

  try{
    const b = await parseBody(req);
    const mode = (b.mode||'').toString().trim();       // 'paa' | 'pca' | 'pcg' | ''
    const source = (b.source||'').toString().trim();   // 'db_only' para presets
    const countPerSection = clamp(parseInt(b.count_per_section||10,10)||10, 5, 30);
    const difficulty = (b.difficulty||'medium').toString().trim();
    const variant = Number.isInteger(b.variant)? b.variant : null;
    const timeLimit = b.time_limit_seconds || 30*60;

    let sections = [];
    let examName = 'Personalizado';
    let totalTime = timeLimit;

    if(mode==='paa' && source==='db_only'){
      // PAA: 2 secciones (60+60)
      examName = 'PAA';
      totalTime = 120*60;
      const sec1 = await takeFromDB({ exam:'PAA', subject:'lectura', count: 30 });
      const sec2 = await takeFromDB({ exam:'PAA', subject:'matematicas', count: 30 });
      if(sec1.length<5 || sec2.length<5) return res.status(200).json({ok:false,error:'Banco PAA insuficiente'});
      sections.push({ topic:'lectura', title:'Comprensión Lectora', items: sec1 });
      sections.push({ topic:'matematicas', title:'Matemáticas', items: sec2 });
    }
    else if(mode==='pca' && source==='db_only'){
      // PCA: 2 secciones (120 min total)
      examName = 'PCA';
      totalTime = 120*60;
      const sec1 = await takeFromDB({ exam:'PCA', subject:'espanol', count: 50 });
      const sec2 = await takeFromDB({ exam:'PCA', subject:'matematicas', count: 50 });
      if(sec1.length<5 || sec2.length<5) return res.status(200).json({ok:false,error:'Banco PCA insuficiente'});
      sections.push({ topic:'espanol', title:'Español', items: sec1 });
      sections.push({ topic:'matematicas', title:'Matemáticas', items: sec2 });
    }
    else if(mode==='pcg' && source==='db_only'){
      // PCG: 4 secciones (120 min total)
      examName = 'PCG';
      totalTime = 120*60;
      const s1 = await takeFromDB({ exam:'PCG', subject:'biologia', count: 25 });
      const s2 = await takeFromDB({ exam:'PCG', subject:'quimica', count: 25 });
      const s3 = await takeFromDB({ exam:'PCG', subject:'fisica', count: 25 });
      const s4 = await takeFromDB({ exam:'PCG', subject:'matematicas', count: 25 });
      if(s1.length<5||s2.length<5||s3.length<5||s4.length<5) return res.status(200).json({ok:false,error:'Banco PCG insuficiente'});
      sections.push({ topic:'biologia', title:'Biología', items:s1 });
      sections.push({ topic:'quimica', title:'Química', items:s2 });
      sections.push({ topic:'fisica', title:'Física', items:s3 });
      sections.push({ topic:'matematicas', title:'Matemáticas', items:s4 });
    }
    else {
      // Personalizado genérico (usa topic existentes)
      const algebra = await takeFromDB({ topic:'algebra', count: countPerSection });
      const logico  = await takeFromDB({ topic:'logico', count: countPerSection });
      const lectura = await takeFromDB({ topic:'lectura', count: countPerSection });
      if(algebra.length<3 && logico.length<3 && lectura.length<3){
        return res.status(200).json({ok:false,error:'Banco general insuficiente'});
      }
      examName = 'Personalizado';
      totalTime = timeLimit;
      if(algebra.length) sections.push({topic:'algebra', title:'Álgebra', items:algebra});
      if(logico.length)  sections.push({topic:'logico',  title:'Razonamiento Lógico', items:logico});
      if(lectura.length) sections.push({topic:'lectura', title:'Comprensión Lectora', items:lectura});
    }

    const totalQ = sections.reduce((s,x)=>s+x.items.length,0);
    const exam = {
      version: 3,
      name: examName,
      variant: variant ?? Math.floor(Date.now()/60000),
      difficulty,
      sections,
      total_questions: totalQ,
      time_limit_seconds: totalTime
    };
    res.status(200).json({ ok:true, exam });
  }catch(e){
    res.status(200).json({ ok:false, error: e.message || 'SERVER_ERROR' });
  }
}
