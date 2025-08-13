import { getClient, cors, parseBody, normalizeCode, normalizeEmail } from './_lib/supaClient.js';

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
    const now = new Date(); const exp = new Date(data.expires_at);
    if(exp < now){ res.status(200).json({ok:false, error:'EXPIRED'}); return; }
    if(!data.redeemed){ res.status(200).json({ok:false, error:'NOT_REDEEMED'}); return; }
    if(data.redeemed_by_email && data.redeemed_by_email.toLowerCase() !== email){
      res.status(200).json({ok:false, error:'EMAIL_MISMATCH'}); return;
    }
    const subscription = { code: data.code, university: data.university, plan: data.plan, expires_at: data.expires_at };
    res.status(200).json({ok:true, subscription});
  }catch(e){
    res.status(500).json({ok:false, error:'SERVER_ERROR', detail: e.message});
  }
}
