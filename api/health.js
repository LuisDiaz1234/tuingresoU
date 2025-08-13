// /api/health.js
import { cors, getClient } from './_lib/supaClient.js';

export default async function handler(req, res){
  cors(res);
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'GET') { res.status(405).json({ok:false,error:'METHOD_NOT_ALLOWED'}); return; }

  const supa = getClient();
  const env = {
    supabase_url: !!process.env.SUPABASE_URL,
    supabase_service_role: !!process.env.SUPABASE_SERVICE_ROLE,
    openai_api_key: !!process.env.OPENAI_API_KEY
  };

  const db = { questions:false, scores:false };
  try { const { data } = await supa.from('questions').select('id').limit(1); db.questions = Array.isArray(data); } catch(_){}
  try { const { data } = await supa.from('scores').select('id').limit(1); db.scores = Array.isArray(data); } catch(_){}

  res.status(200).json({
    ok:true,
    env,
    db,
    now: new Date().toISOString()
  });
}
