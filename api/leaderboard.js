import { getClient, cors } from './_lib/supaClient.js';

export default async function handler(req, res){
  cors(res);
  if(req.method === 'OPTIONS'){ res.status(200).end(); return; }
  if(req.method !== 'GET'){ res.status(405).json({ok:false, error:'METHOD_NOT_ALLOWED'}); return; }

  try{
    const supa = getClient();
    const { data, error } = await supa
      .from('scores')
      .select('email, topic, score, duration, university, created_at')
      .order('score', {ascending:false})
      .order('duration', {ascending:true})
      .limit(50);
    if(error) throw error;
    res.status(200).json({ok:true, items: data||[]});
  }catch(e){
    res.status(500).json({ok:false, error:'SERVER_ERROR', detail: e.message});
  }
}
