import { getClient, cors } from '../../api/_lib/supaClient.js';

function auth(req){
  const tok = (req.headers['authorization']||'').toString();
  const want = process.env.ADMIN_TOKEN || '';
  return !!want && tok.startsWith('Bearer ') && tok.substring(7)===want;
}

export default async function handler(req, res){
  cors(res);
  if(req.method==='OPTIONS'){ res.status(200).end(); return; }
  if(!auth(req)){ res.status(401).json({ok:false, error:'UNAUTHORIZED'}); return; }
  if(req.method!=='GET'){ res.status(405).json({ok:false, error:'METHOD_NOT_ALLOWED'}); return; }

  try{
    const supa = getClient();
    const url = new URL(req.url, 'http://x');
    const status = (url.searchParams.get('status')||'').toLowerCase().trim();

    let q = supa.from('yappy_requests')
      .select('id, email, name, university, plan, amount_cents, currency, reference, status, issued_code, created_at, approved_at, rejected_at')
      .order('created_at', {ascending:false})
      .limit(200);

    if(['pending','approved','rejected'].includes(status)) q = q.eq('status', status);

    const { data, error } = await q;
    if(error) throw error;
    res.status(200).json({ok:true, items:data||[]});
  }catch(e){
    res.status(500).json({ok:false, error:'SERVER_ERROR', detail:e.message});
  }
}
