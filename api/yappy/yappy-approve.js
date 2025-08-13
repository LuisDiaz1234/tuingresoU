import { getClient, cors, parseBody } from '../../api/_lib/supaClient.js';

function auth(req){
  const tok = (req.headers['authorization']||'').toString();
  const want = process.env.ADMIN_TOKEN || '';
  return !!want && tok.startsWith('Bearer ') && tok.substring(7)===want;
}
function addMonths(date, months){ const d = new Date(date); d.setMonth(d.getMonth()+months); return d; }
function genCode(prefix='YA'){
  const chars='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const pick = n => Array.from({length:n},()=>chars[Math.floor(Math.random()*chars.length)]).join('');
  return `${prefix}-${pick(4)}-${pick(4)}`;
}

export default async function handler(req, res){
  cors(res);
  if(req.method==='OPTIONS'){ res.status(200).end(); return; }
  if(!auth(req)){ res.status(401).json({ok:false, error:'UNAUTHORIZED'}); return; }
  if(req.method!=='POST'){ res.status(405).json({ok:false, error:'METHOD_NOT_ALLOWED'}); return; }

  const b = await parseBody(req);
  const id = (b.request_id||'').toString();
  if(!id){ res.status(400).json({ok:false, error:'MISSING_REQUEST_ID'}); return; }

  try{
    const supa = getClient();
    const { data:reqData, error:e1 } = await supa
      .from('yappy_requests').select('*').eq('id', id).maybeSingle();
    if(e1) throw e1;
    if(!reqData) return res.status(200).json({ok:false, error:'NOT_FOUND'});
    if(reqData.status!=='pending') return res.status(200).json({ok:false, error:'ALREADY_PROCESSED'});

    const now = new Date();
    const expires_at = reqData.plan==='mensual' ? addMonths(now,1)
                    : reqData.plan==='trimestral' ? addMonths(now,3)
                    : addMonths(now,12);

    const code = genCode('YA');
    const { error:e2 } = await supa.from('keys').insert({
      code, plan: reqData.plan, university: reqData.university,
      expires_at: expires_at.toISOString(),
      redeemed: true, redeemed_by_email: reqData.email, redeemed_at: now.toISOString()
    });
    if(e2){ if(e2.code==='23505') return res.status(200).json({ok:false, error:'CODE_COLLISION'}); throw e2; }

    const { error:e3 } = await supa
      .from('yappy_requests')
      .update({ status:'approved', issued_code: code, approved_at: now.toISOString() })
      .eq('id', id);
    if(e3) throw e3;

    res.status(200).json({ok:true, code});
  }catch(e){
    res.status(500).json({ok:false, error:'SERVER_ERROR', detail:e.message});
  }
}
