import { getClient, cors, parseBody } from '../../api/_lib/supaClient.js';

function auth(req){
  const tok = (req.headers['authorization']||'').toString();
  const want = process.env.ADMIN_TOKEN || '';
  return !!want && tok.startsWith('Bearer ') && tok.substring(7)===want;
}

export default async function handler(req, res){
  cors(res);
  if(req.method==='OPTIONS'){ res.status(200).end(); return; }
  if(!auth(req)){ res.status(401).json({ok:false, error:'UNAUTHORIZED'}); return; }
  if(req.method!=='POST'){ res.status(405).json({ok:false, error:'METHOD_NOT_ALLOWED'}); return; }

  const b = await parseBody(req);
  const id = (b.request_id||'').toString();
  const notes = (b.notes||'').toString();
  if(!id){ res.status(400).json({ok:false, error:'MISSING_REQUEST_ID'}); return; }

  try{
    const supa = getClient();
    const { error } = await supa
      .from('yappy_requests')
      .update({ status:'rejected', rejected_at: new Date().toISOString(), notes })
      .eq('id', id);
    if(error) throw error;
    res.status(200).json({ok:true});
  }catch(e){
    res.status(500).json({ok:false, error:'SERVER_ERROR', detail:e.message});
  }
}
