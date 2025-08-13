import { getClient, cors } from '../_lib/supaClient.js';

function auth(req){
  const tok = (req.headers['authorization']||'').toString();
  const want = process.env.ADMIN_TOKEN || '';
  return !!want && tok.startsWith('Bearer ') && tok.substring(7) === want;
}

export default async function handler(req, res){
  cors(res);
  if(req.method === 'OPTIONS'){ res.status(200).end(); return; }
  if(!auth(req)){ res.status(401).json({ok:false, error:'UNAUTHORIZED'}); return; }
  if(req.method !== 'GET'){ res.status(405).json({ok:false, error:'METHOD_NOT_ALLOWED'}); return; }

  try{
    const supa = getClient();
    const url = new URL(req.url, 'http://x');
    const topic = (url.searchParams.get('topic')||'').toLowerCase().trim();
    const q = (url.searchParams.get('q')||'').trim();
    const active = url.searchParams.get('active');
    const limit = Math.min(500, parseInt(url.searchParams.get('limit')||'200',10));

    let query = supa.from('questions')
      .select('id, topic, prompt, choices, answer_index, difficulty, active, created_at, source')
      .order('created_at', {ascending:false})
      .limit(limit);

    if(['algebra','logico','lectura'].includes(topic)) query = query.eq('topic', topic);
    if(active === '1') query = query.eq('active', true);
    if(active === '0') query = query.eq('active', false);
    if(q) query = query.ilike('prompt','%'+q+'%');

    const { data, error } = await query;
    if(error) throw error;
    res.status(200).json({ok:true, items:data||[]});
  }catch(e){
    res.status(500).json({ok:false, error:'SERVER_ERROR', detail:e.message});
  }
}
