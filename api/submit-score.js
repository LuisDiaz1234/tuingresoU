import { getClient, cors, parseBody, normalizeCode, normalizeEmail } from './_lib/supaClient.js';

export default async function handler(req, res){
  cors(res);
  if(req.method === 'OPTIONS'){ res.status(200).end(); return; }
  if(req.method !== 'POST'){ res.status(405).json({ok:false, error:'METHOD_NOT_ALLOWED'}); return; }

  const body = await parseBody(req);
  const email = normalizeEmail(body.email);
  const code = normalizeCode(body.code);
  const topic = (body.topic||'').toString().toLowerCase().trim();
  const score = parseInt(body.score,10);
  const duration = parseInt(body.duration,10);
  if(!email || !code || !['algebra','logico','lectura'].includes(topic) || !Number.isInteger(score) || !Number.isInteger(duration)){
    res.status(400).json({ok:false, error:'MISSING_OR_INVALID_PARAMS'}); return;
  }
  try{
    const supa = getClient();
    const { data: k, error: ek } = await supa.from('keys').select('university').eq('code', code).maybeSingle();
    if(ek) throw ek;
    const university = k ? k.university : null;
    const { error } = await supa.from('scores').insert({ email, code, topic, score, duration, university });
    if(error) throw error;
    res.status(200).json({ok:true});
  }catch(e){
    res.status(500).json({ok:false, error:'SERVER_ERROR', detail: e.message});
  }
}
