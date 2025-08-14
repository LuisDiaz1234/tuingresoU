// /api/profile.js
import { createClient } from '@supabase/supabase-js';

const supa = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok:false, error:'METHOD_NOT_ALLOWED' });
  try {
    const { action, email, display_name, device } = req.body || {};
    if (!email) return res.status(400).json({ ok:false, error:'EMAIL_REQUIRED' });

    if (action === 'get') {
      const { data, error } = await supa.from('profiles').select('*').eq('email', email.toLowerCase()).single();
      if (error && error.code !== 'PGRST116') throw error; // not found is ok
      return res.json({ ok:true, profile: data || null });
    }

    if (action === 'upsert') {
      const payload = { email: email.toLowerCase() };
      if (display_name) payload.display_name = display_name;
      if (device) payload.last_device = device;
      const { data, error } = await supa.from('profiles').upsert(payload, { onConflict: 'email' }).select().single();
      if (error) throw error;
      return res.json({ ok:true, profile: data });
    }

    return res.status(400).json({ ok:false, error:'UNKNOWN_ACTION' });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ ok:false, error:'SERVER_ERROR', detail: e.message });
  }
}
