(function(){
  const $ = (s,el=document)=>el.querySelector(s);
  const $$= (s,el=document)=>Array.from(el.querySelectorAll(s));

  let CONFIG = {
    currency:'PAB',
    yappy_display_name:'IngresoU',
    yappy_phone:'+50760000000',
    prices:{mensual_cents:999,trimestral_cents:2499,anual_cents:6900}
  };

  async function loadConfig(){
    try{
      const r = await fetch('/api/public-config',{cache:'no-store'});
      const j = await r.json();
      if(j && j.ok) CONFIG = {...CONFIG, ...j, prices:{...CONFIG.prices, ...j.prices}};
    }catch(_){}
    paintPrices();
  }
  function money(cents,ccy){ return (Number(cents||0)/100).toLocaleString('es-PA',{style:'currency',currency:ccy||CONFIG.currency}); }
  function paintPrices(){
    const m=$('#price-mensual');  if(m) m.textContent=money(CONFIG.prices.mensual_cents,CONFIG.currency);
    const t=$('#price-trimestral');if(t) t.textContent=money(CONFIG.prices.trimestral_cents,CONFIG.currency);
    const a=$('#price-anual');    if(a) a.textContent=money(CONFIG.prices.anual_cents,CONFIG.currency);
  }

  function openBuy(plan){
    const modal = $('.modal-backdrop'); if(!modal) return;
    const cents = plan==='anual' ? CONFIG.prices.anual_cents
                : plan==='trimestral' ? CONFIG.prices.trimestral_cents
                : CONFIG.prices.mensual_cents;
    $('#buy-plan').textContent = plan.toUpperCase();
    $('#buy-amount').textContent = money(cents, CONFIG.currency);
    $('#buy-display').textContent = CONFIG.yappy_display_name||'IngresoU';
    const email = (localStorage.getItem('ingresou_email')||'').toLowerCase();
    $('#buy-email').value = email;
    const msg = encodeURIComponent(`Hola, quiero comprar el plan ${plan.toUpperCase()} (${money(cents,CONFIG.currency)}) para IngresoU. Mi correo: ${email||'(escribe tu correo aquí)'}`);
    const wa  = `https://wa.me/${(CONFIG.yappy_phone||'+50760000000').replace(/[^\d]/g,'')}?text=${msg}`;
    $('#buy-wa').setAttribute('href', wa);
    modal.style.display = 'flex';
  }
  function closeBuy(){ const m=$('.modal-backdrop'); if(m) m.style.display='none'; }

  function haveSession(){ return !!(localStorage.getItem('ingresou_email') && localStorage.getItem('ingresou_key')); }
  function scrollToLogin(){ const f=$('#login-form'); if(f){ f.scrollIntoView({behavior:'smooth'}); $('#login-code')?.focus(); } }

  // Presets (si no sesión, scrollean al login)
  $$('[data-preset]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const mode=btn.getAttribute('data-preset');
      if(haveSession()) location.href=`/exam.html?mode=${encodeURIComponent(mode)}`;
      else scrollToLogin();
    });
  });

  window.IngresoU = { openBuy, closeBuy };

  loadConfig();
})();
