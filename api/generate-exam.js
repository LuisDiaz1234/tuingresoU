// /api/generate-exam.js
import { cors, parseBody } from './_lib/supaClient.js';

function clamp(n, lo, hi){ return Math.max(lo, Math.min(hi, n)); }

export default async function handler(req, res){
  cors(res);
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ok:false,error:'METHOD_NOT_ALLOWED'}); return; }

  try{
    const b = await parseBody(req);
    const countPerSection = clamp(parseInt(b.count_per_section||10,10)||10, 5, 30);
    const difficulty = (b.difficulty||'').toString().trim() || null; // 'basic'|'medium'|'hard' opcional
    const variant = Number.isInteger(b.variant) ? b.variant : null;
    const topics = ['algebra','logico','lectura'];
    const titles = { algebra:'Álgebra', logico:'Razonamiento Lógico', lectura:'Comprensión Lectora' };

    const base = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : `https://${req.headers.host}`;

    async function pull(topic, offset){
      const body = { topic, count: countPerSection };
      if (difficulty) body.difficulty = difficulty;
      if (variant !== null) body.variant = variant + offset; // variantes distintas por sección
      const r = await fetch(`${base}/api/generate-questions`, {
        method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body)
      });
      const d = await r.json();
      return d.ok ? d.items : [];
    }

    const sections = [];
    for (let i=0;i<topics.length;i++){
      const t = topics[i];
      const items = await pull(t, i*1000);
      sections.push({ topic:t, title:titles[t], items });
    }

    const exam = {
      version: 1,
      seed: variant ?? Math.floor(Date.now()/60000),
      difficulty: difficulty || 'mixed',
      sections,
      total_questions: sections.reduce((s,sec)=>s+sec.items.length,0),
      time_limit_seconds: b.time_limit_seconds || 30*60  // 30 minutos
    };

    res.status(200).json({ ok:true, exam });
  }catch(e){
    res.status(500).json({ ok:false, error:'SERVER_ERROR', detail:e.message });
  }
}
