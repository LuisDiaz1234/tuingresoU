// /api/profile-ping.js
import { createClient } from '@supabase/supabase-js';
const supa = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE);

function dateUTC(d=new Date()){ return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())); }

export default async function handler(req, res){
  if (req.method !== 'POST') return res.status(405).json({ ok:false, error:'METHOD_NOT_ALLOWED' });
  try {
    const { email, device } = req.body || {};
    if (!email) return res.status(400).json({ ok:false, error:'EMAIL_REQUIRED' });

    const em = email.toLowerCase();
    const { data: pr } = await supa.from('profiles').select('*').eq('email', em).single();

    const today = dateUTC();
    const todayStr = today.toISOString().slice(0,10);

    if (!pr) {
      const { data, error } = await supa.from('profiles').insert({ email: em, streak:1, last_ping: todayStr, last_device: device || null }).select().single();
      if (error) throw error;
      return res.json({ ok:true, profile:data, message:'streak_started' });
    }

    // Calcular diferencia de días
    const last = pr.last_ping ? new Date(pr.last_ping+'T00:00:00Z') : null;
    let newStreak = pr.streak || 0;
    let message = 'streak_unchanged';

    if (!last) { newStreak = 1; message = 'streak_started'; }
    else {
      const diffDays = Math.round((today - last) / 86400000);
      if (diffDays === 0) { /* ya contó hoy */ }
      else if (diffDays === 1) { newStreak = (pr.streak||0) + 1; message = 'streak_increment'; }
      else { newStreak = 1; message = 'streak_reset'; }
    }

    // Warnings por cambio brusco de dispositivo (simple aviso suave)
    let warnings = pr.warnings||0;
    if (device && pr.last_device && pr.last_device !== device) warnings++;

    const updates = { streak: newStreak, last_ping: todayStr };
    if (device) updates.last_device = device;
    updates.warnings = warnings;

    const { data, error } = await supa.from('profiles').update(updates).eq('email', em).select().single();
    if (error) throw error;
    res.json({ ok:true, profile:data, message });
  } catch (e) {
    console.error(e); res.status(500).json({ ok:false, error:'SERVER_ERROR', detail:e.message });
  }
}
