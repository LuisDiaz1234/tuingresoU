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
    const url = new URL(req.url, 'http://x');
    const id = (url.searchParams.get('id')||'').toString();
    if(!id){ res.status(400).json({ok:false, error:'MISSING_ID'}); return; }

    const supa = getClient();
    const { data, error } = await supa
      .from('yappy_requests')
      .select('proof_data_url')
      .eq('id', id)
      .maybeSingle();
    if(error) throw error;
    if(!data){ res.status(200).json({ok:false, error:'NOT_FOUND'}); return; }

    res.status(200).json({ok:true, proof_data_url: data.proof_data_url || null});
  }catch(e){
    res.status(500).json({ok:false, error:'SERVER_ERROR', detail:e.message});
  }
}
