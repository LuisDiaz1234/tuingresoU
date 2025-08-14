// /api/submit-score.js
import { createClient } from '@supabase/supabase-js';
const supa = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE);

function xpFor(score){ return Math.max(5, Math.round(score/2)); } // regla simple: 50 => 25xp

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok:false, error:'METHOD_NOT_ALLOWED' });
  try {
    const { email, code, topic, score, duration, university } = req.body || {};
    if (!email || !code || !topic || typeof score!=='number') return res.status(400).json({ ok:false, error:'BAD_INPUT' });
    const em = email.toLowerCase().trim();
    const cd = code.toUpperCase().trim();

    // 1) Insert score
    const insert = {
      email: em,
      code: cd,
      topic,
      score: Math.round(score),
      duration: Number(duration||0),
      university: university || null
    };
    const { error: e1 } = await supa.from('scores').insert(insert);
    if (e1) throw e1;

    // 2) Upsert profile + xp + best topic
    const { data: pr0, error: e0 } = await supa.from('profiles').select('*').eq('email', em).single();
    if (e0 && e0.code !== 'PGRST116') throw e0; // not found allowed

    const xpAdd = xpFor(score);
    const up = { xp: (pr0?.xp || 0) + xpAdd };

    const bestField = topic==='algebra' ? 'best_algebra'
                    : topic==='logico' ? 'best_logico'
                    : topic==='lectura' ? 'best_lectura' : null;

    if (bestField && (score > (pr0?.[bestField] || 0))) up[bestField] = score;

    if (pr0) {
      const { error } = await supa.from('profiles').update(up).eq('email', em);
      if (error) throw error;
    } else {
      const { error } = await supa.from('profiles').insert({ email: em, ...up });
      if (error) throw error;
    }

    return res.json({ ok:true, xp_gained: xpAdd });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok:false, error:'SERVER_ERROR', detail: e.message });
  }
}
