import { createClient } from '@supabase/supabase-js';

export function getClient(){
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE;
  if(!url || !serviceKey) throw new Error('Faltan env SUPABASE_URL o SUPABASE_SERVICE_ROLE');
  return createClient(url, serviceKey, { auth: { autoRefreshToken:false, persistSession:false } });
}
export function cors(res){
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}
export function parseBody(req){
  return new Promise((resolve)=>{
    let data=''; req.on('data', c => data+=c);
    req.on('end', ()=>{ try{ resolve(JSON.parse(data||'{}')); } catch{ resolve({}); } });
  });
}
export const normalizeEmail = v => (v||'').toString().trim().toLowerCase();
export const normalizeCode  = v => (v||'').toString().trim().toUpperCase();
