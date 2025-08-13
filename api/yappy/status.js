import { getClient, cors } from '../_lib/supaClient.js';

export default async function handler(req, res){
  cors(res);
  if(req.method==='OPTIONS'){ res.status(200).end(); return; }
  if(req.method!=='GET'){ res.status(405).json({ok:false, error:'METHOD_NOT_ALLOWED'}); return; }

  try{
    const url = new URL(req.url, 'http://x');
    const id = (url.searchParams.get('request_id')||'').toString();
    if(!id){ res.status(400).json({ok:false, error:'MISSING_REQUEST_ID'}); return; }

    const supa = getClient();
    const { data, error } = await supa
      .from('yappy_requests')
      .select('status, issued_code, email, plan')
      .eq('id', id)
      .maybeSingle();
    if(error) throw error;
    if(!data){ res.status(200).json({ok:false, error:'NOT_FOUND'}); return; }

    res.status(200).json({ok:true, status:data.status, issued_code:data.issued_code||null, email:data.email, plan:data.plan});
  }catch(e){
    res.status(500).json({ok:false, error:'SERVER_ERROR', detail:e.message});
  }
}
