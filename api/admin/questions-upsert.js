import { getClient, cors, parseBody } from '../_lib/supaClient.js';

function auth(req){
  const tok = (req.headers['authorization']||'').toString();
  const want = process.env.ADMIN_TOKEN || '';
  return !!want && tok.startsWith('Bearer ') && tok.substring(7) === want;
}

export default async function handler(req, res){
  cors(res);
  if(req.method === 'OPTIONS'){ res.status(200).end(); return; }
  if(!auth(req)){ res.status(401).json({ok:false, error:'UNAUTHORIZED'}); return; }
  if(!['POST','PUT'].includes(req.method)){ res.status(405).json({ok:false, error:'METHOD_NOT_ALLOWED'}); return; }

  const b = await parseBody(req);
  const id = b.id || null;
  const topic = (b.topic||'').toString().toLowerCase().trim();
  const prompt = (b.prompt||'').toString().trim();
  const choices = Array.isArray(b.choices) ? b.choices.map(String) : [];
  const answer_index = parseInt(b.answer_index,10);
  const difficulty = (b.difficulty||null);
  const active = (b.active === false) ? false : true;
  const source = (b.source||null);

  if(!['algebra','logico','lectura'].includes(topic) || !prompt || choices.length<2 || choices.length>6 ||
     !Number.isInteger(answer_index) || answer_index<0 || answer_index>=choices.length){
    res.status(400).json({ok:false, error:'INVALID_PARAMS'}); return;
  }

  const supa = getClient();
  try{
    if(id){
      const { error } = await supa
        .from('questions')
        .update({ topic, prompt, choices, answer_index, difficulty, active, source })
        .eq('id', id);
      if(error) throw error;
      res.status(200).json({ok:true, id});
    }else{
      const { data, error } = await supa
        .from('questions')
        .insert({ topic, prompt, choices, answer_index, difficulty, active, source })
        .select('id')
        .single();
      if(error) throw error;
      res.status(200).json({ok:true, id:data.id});
    }
  }catch(e){
    res.status(500).json({ok:false, error:'SERVER_ERROR', detail:e.message});
  }
}
