import { getClient, cors, parseBody, normalizeCode, normalizeEmail } from '../_lib/supaClient.js';
export default async function handler(req, res){
  cors(res);
  if(req.method === 'OPTIONS'){ res.status(200).end(); return; }
  if(req.method !== 'POST'){ res.status(405).json({ok:false, error:'METHOD_NOT_ALLOWED'}); return; }
  const body = await parseBody(req);
  const code = normalizeCode(body.code);
  const email = normalizeEmail(body.email);
  if(!code || !email){ res.status(400).json({ok:false, error:'MISSING_PARAMS'}); return; }
  try{
    const supa = getClient();
    const { data, error } = await supa.from('keys').select('*').eq('code', code).maybeSingle();
    if(error) throw error;
    if(!data){ res.status(200).json({ok:false, error:'NOT_FOUND'}); return; }
    if(data.redeemed && (data.redeemed_by_email || '').toLowerCase() !== email){
      res.status(200).json({ok:false, error:'ALREADY_REDEEMED'}); return;
    }
    const upd = { redeemed: true, redeemed_by_email: email, redeemed_at: new Date().toISOString() };
    const { error: e2 } = await supa.from('keys').update(upd).eq('code', code);
    if(e2) throw e2;
    res.status(200).json({ok:true});
  }catch(e){ res.status(500).json({ok:false, error:'SERVER_ERROR', detail: e.message}); }
}
