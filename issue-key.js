import { getClient, cors, parseBody, normalizeCode } from '../_lib/supaClient.js';
function checkAdmin(req){
  const tok = (req.headers['authorization']||'').toString();
  const want = process.env.ADMIN_TOKEN || '';
  if(!want) return false;
  if(tok.startsWith('Bearer ')){ return tok.substring(7) === want; }
  return false;
}
export default async function handler(req, res){
  cors(res);
  if(req.method === 'OPTIONS'){ res.status(200).end(); return; }
  if(!checkAdmin(req)){ res.status(401).json({ok:false, error:'UNAUTHORIZED'}); return; }
  const supa = getClient();
  if(req.method === 'GET'){
    const url = new URL(req.url, 'http://x');
    const q = (url.searchParams.get('q')||'').trim();
    const redeemed = url.searchParams.get('redeemed');
    const university = (url.searchParams.get('university')||'').trim().toUpperCase();
    let query = supa.from('keys').select('code, plan, university, expires_at, redeemed, redeemed_by_email, created_at').order('created_at', {ascending:false}).limit(200);
    if(q){ query = query.ilike('code', '%' + q + '%'); }
    if(redeemed === '1') query = query.eq('redeemed', true);
    if(redeemed === '0') query = query.eq('redeemed', false);
    if(university) query = query.eq('university', university);
    const { data, error } = await query;
    if(error) return res.status(500).json({ok:false, error:'SERVER_ERROR', detail:error.message});
    return res.status(200).json({ok:true, items: data||[]});
  }
  if(req.method === 'POST'){
    const body = await parseBody(req);
    const code = normalizeCode(body.code);
    const plan = (body.plan||'').toString().trim();
    const university = (body.university||'').toString().trim().toUpperCase();
    const expires_at = (body.expires_at||'').toString().trim();
    if(!code || !plan || !university || !expires_at){ res.status(400).json({ok:false, error:'MISSING_PARAMS'}); return; }
    if(!['UTP','UP'].includes(university)){ res.status(400).json({ok:false, error:'INVALID_UNIVERSITY'}); return; }
    try{
      const { error } = await supa.from('keys').insert({ code, plan, university, expires_at, redeemed:false, redeemed_by_email:null, redeemed_at:null });
      if(error){
        if(error.code == '23505'){ return res.status(200).json({ok:false, error:'ALREADY_EXISTS'}); }
        throw error;
      }
      res.status(200).json({ok:true});
    }catch(e){ res.status(500).json({ok:false, error:'SERVER_ERROR', detail: e.message}); }
    return;
  }
  res.status(405).json({ok:false, error:'METHOD_NOT_ALLOWED'});
}
