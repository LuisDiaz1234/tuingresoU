(function(){
  const $ = (sel, el=document) => el.querySelector(sel);
  const $$ = (sel, el=document) => Array.from(el.querySelectorAll(sel));

  // Estado de config
  let CONFIG = {
    currency: 'USD',
    yappy_display_name: 'IngresoU',
    yappy_phone: '+50760000000',
    prices: { mensual_cents: 599, trimestral_cents: 1499, anual_cents: 3999 }
  };

  async function loadConfig(){
    try{
      const r = await fetch('/api/public-config');
      const j = await r.json();
      if(j && j.ok){
        CONFIG = { ...CONFIG, ...j, prices: { ...CONFIG.prices, ...j.prices } };
      }
    }catch(e){ /* fallback */ }
    renderPrices();
  }

  function money(cents, ccy){
    const n = Number.isFinite(cents) ? cents/100 : cents;
    return new Intl.NumberFormat('es-PA',{ style:'currency', currency:ccy || CONFIG.currency }).format(n);
  }

  function renderPrices(){
    const m = $('#price-mensual');  if(m) m.textContent = money(CONFIG.prices.mensual_cents, CONFIG.currency);
    const t = $('#price-trimestral');if(t) t.textContent = money(CONFIG.prices.trimestral_cents, CONFIG.currency);
    const a = $('#price-anual');    if(a) a.textContent = money(CONFIG.prices.anual_cents, CONFIG.currency);
  }

  // Modal compra (WhatsApp/Yappy)
  function openBuy(plan){
    const modal = $('#buy-modal'); if(!modal) return;
    const phone = CONFIG.yappy_phone || '+50760000000';
    const planName = plan || 'mensual';
    const priceCents = CONFIG.prices[`${planName}_cents`] || 0;
    const priceText = money(priceCents, CONFIG.currency);
    $('#buy-plan').textContent = planName.toUpperCase();
    $('#buy-amount').textContent = priceText;
    $('#buy-display').textContent = CONFIG.yappy_display_name;
    const email = (localStorage.getItem('ingresou_email')||'').toLowerCase();
    $('#buy-email').value = email;

    const msg = encodeURIComponent(
      `Hola, quiero comprar el plan ${planName.toUpperCase()} (${priceText}) para IngresoU. `+
      `Mi correo: ${email||'(escribe tu correo aquí)'}`
    );
    const wa = `https://wa.me/${phone.replace(/[^\d]/g,'')}?text=${msg}`;
    $('#buy-wa').setAttribute('href', wa);
    $('.modal-backdrop').style.display = 'flex';
  }
  function closeBuy(){ $('.modal-backdrop').style.display = 'none'; }

  // Exponer a botones
  window.IngresoU = {
    openBuy, closeBuy
  };

  // Nav chips de presets
  $$('[data-preset]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const mode = btn.getAttribute('data-preset');
      window.location.href = `/exam.html?mode=${encodeURIComponent(mode)}`;
    });
  });

  // Login quick inline (si falla el asset oficial)
  //  - Normaliza code/email
  //  - Auto-redeem si NOT_REDEEMED
  async function quickLogin(e){
    e.preventDefault?.();
    const email = ($('#login-email')?.value||'').trim().toLowerCase();
    const code  = ($('#login-code')?.value||'').trim().toUpperCase();
    const out = $('#login-out');
    const say = (m,bad=false)=>{ if(out){ out.textContent=m; out.className='inline-note '+(bad?'bad':'good'); } };

    if(!email || !code){ return say('Completa correo y KEY.', true); }

    try{
      const send = async (url, body) => {
        const r = await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
        return r.json();
      };
      let r = await send('/api/get-subscription',{ email, code });
      if(!r.ok && r.error === 'NOT_REDEEMED'){
        const rr = await send('/api/redeem-key',{ email, code });
        if(rr.ok){ r = await send('/api/get-subscription',{ email, code }); }
      }
      if(r.ok && r.subscription){
        const s = r.subscription;
        localStorage.setItem('ingresou_email', email);
        localStorage.setItem('ingresou_key', code);
        localStorage.setItem('ingresou_plan', s.plan||'mensual');
        localStorage.setItem('ingresou_university', s.university||'');
        localStorage.setItem('ingresou_expires_at', s.expires_at||'');
        say('¡Listo! Redirigiendo…');
        setTimeout(()=> location.href='/premium.html', 300);
      }else{
        const msg = r?.error || 'Error de acceso';
        say(msg, true);
      }
    }catch(err){
      say('No se pudo conectar. Intenta de nuevo.', true);
    }
  }

  // Hook al form
  const f = $('#login-form');
  if(f){ f.addEventListener('submit', quickLogin); }

  // Carga de precios
  loadConfig();

})();
