import { getClient, cors, parseBody } from '../_lib/supaClient.js';

function auth(req){
  const tok = (req.headers['authorization']||'').toString();
  const want = process.env.ADMIN_TOKEN || '';
  return !!want && tok.startsWith('Bearer ') && tok.substring(7)===want;
}
const ALLOWED_TOPICS = ['algebra','logico','lectura'];

export default async function handler(req,res){
  cors(res);
  if(req.method==='OPTIONS'){ res.status(200).end(); return; }
  if(!auth(req)){ res.status(401).json({ok:false,error:'UNAUTHORIZED'}); return; }
  if(req.method!=='POST' && req.method!=='PUT'){ res.status(405).json({ok:false,error:'METHOD_NOT_ALLOWED'}); return; }

  try{
    const b = await parseBody(req);
    const id = (b.id||null);
    const topic = (b.topic||'').toString().trim();
    const prompt = (b.prompt||'').toString().trim();
    const choices = Array.isArray(b.choices) ? b.choices.map(c=>c.toString()) : [];
    const answer_index = Number.isInteger(b.answer_index) ? b.answer_index : 0;
    const difficulty = (b.difficulty||null) ? b.difficulty.toString().trim() : null;
    const active = !!b.active;
    const explanation = (b.explanation||null) ? b.explanation.toString() : null;

    if(!ALLOWED_TOPICS.includes(topic)) return res.status(400).json({ok:false,error:'INVALID_TOPIC'});
    if(!prompt) return res.status(400).json({ok:false,error:'MISSING_PROMPT'});
    if(choices.length<2 || choices.length>6) return res.status(400).json({ok:false,error:'CHOICES_RANGE'});
    if(answer_index<0 || answer_index>=choices.length) return res.status(400).json({ok:false,error:'ANSWER_OUT_OF_RANGE'});

    const supa = getClient();
    if(req.method==='POST'){
      const { data, error } = await supa.from('questions').insert({
        topic, prompt, choices, answer_index, difficulty, active, explanation
      }).select('id').single();
      if(error) throw error;
      return res.status(200).json({ok:true, id:data.id});
    }else{
      if(!id) return res.status(400).json({ok:false,error:'MISSING_ID'});
      const { data, error } = await supa.from('questions').update({
        topic, prompt, choices, answer_index, difficulty, active, explanation
      }).eq('id', id).select('id').single();
      if(error) throw error;
      return res.status(200).json({ok:true, id:data.id});
    }
  }catch(e){
    res.status(500).json({ok:false,error:'SERVER_ERROR',detail:e.message});
  }
}
