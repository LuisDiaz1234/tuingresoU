import { getClient, cors, parseBody, normalizeEmail } from '../_lib/supaClient.js';

function priceOf(plan){
  const m = parseInt(process.env.PRICE_MENSUAL_CENTS||'999',10);
  const t = parseInt(process.env.PRICE_TRIMESTRAL_CENTS||'2499',10);
  const a = parseInt(process.env.PRICE_ANUAL_CENTS||'6900',10);
  if(plan==='mensual') return m;
  if(plan==='trimestral') return t;
  if(plan==='anual') return a;
  return m;
}

export default async function handler(req, res){
  cors(res);
  if(req.method==='OPTIONS'){ res.status(200).end(); return; }
  if(req.method!=='POST'){ res.status(405).json({ok:false, error:'METHOD_NOT_ALLOWED'}); return; }

  const b = await parseBody(req);
  const email = normalizeEmail(b.email);
  const name = (b.name||'').toString().trim();
  const plan = (b.plan||'').toString().trim();
  const university = (b.university||'').toString().trim().toUpperCase();
  if(!email || !plan){ res.status(400).json({ok:false, error:'MISSING_PARAMS'}); return; }
  if(!['UTP','UP'].includes(university)){ res.status(400).json({ok:false, error:'INVALID_UNIVERSITY'}); return; }
  if(!['mensual','trimestral','anual'].includes(plan)){ res.status(400).json({ok:false, error:'INVALID_PLAN'}); return; }

  const amount_cents = priceOf(plan);
  const currency = (process.env.CURRENCY||'PAB').toUpperCase();
  try{
    const supa = getClient();
    const { data, error } = await supa.from('yappy_requests').insert({
      email, name, university, plan, amount_cents, currency, status:'pending'
    }).select('id').single();
    if(error) throw error;

    res.status(200).json({
      ok:true,
      request_id: data.id,
      amount_cents, currency,
      yappy: {
        display_name: process.env.YAPPY_DISPLAY_NAME || 'Tu negocio',
        phone: process.env.YAPPY_PHONE || '',
        link: process.env.YAPPY_LINK || '',
        qr_url: process.env.YAPPY_QR_URL || '',
      }
    });
  }catch(e){
    res.status(500).json({ok:false, error:'SERVER_ERROR', detail:e.message});
  }
}
