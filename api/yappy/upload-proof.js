import { getClient, cors, parseBody } from '../_lib/supaClient.js';

export default async function handler(req, res){
  cors(res);
  if(req.method==='OPTIONS'){ res.status(200).end(); return; }
  if(req.method!=='POST'){ res.status(405).json({ok:false, error:'METHOD_NOT_ALLOWED'}); return; }

  const b = await parseBody(req);
  const id = (b.request_id||'').toString();
  const reference = (b.reference||'').toString().trim();
  const proof_data_url = (b.proof_data_url||'').toString();

  if(!id){ res.status(400).json({ok:false, error:'MISSING_REQUEST_ID'}); return; }
  if(proof_data_url && !proof_data_url.startsWith('data:image/')){
    res.status(400).json({ok:false, error:'INVALID_PROOF_FORMAT'}); return;
  }
  if(proof_data_url && proof_data_url.length > 2_000_000){
    res.status(400).json({ok:false, error:'PROOF_TOO_BIG'}); return;
  }

  try{
    const supa = getClient();
    const { error } = await supa
      .from('yappy_requests')
      .update({ reference, proof_data_url })
      .eq('id', id);
    if(error) throw error;
    res.status(200).json({ok:true});
  }catch(e){
    res.status(500).json({ok:false, error:'SERVER_ERROR', detail:e.message});
  }
}
