// /public/assets/onboarding.js
(function(){
  const $ = (s,el=document)=>el.querySelector(s);

  function deviceFingerprint(){
    try{
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'NA';
      const raw = [navigator.userAgent, tz, screen.width, screen.height, screen.colorDepth].join('|');
      let h=0; for (let i=0;i<raw.length;i++) h=(h*31 + raw.charCodeAt(i))|0;
      return 'd'+Math.abs(h);
    }catch(_){ return 'd0'; }
  }

  async function api(url, body){
    const r = await fetch(url,{ method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body||{}) });
    return r.json();
  }

  async function ensureProfile(email){
    return api('/api/profile', { action:'upsert', email, device: deviceFingerprint() });
  }

  async function pingStreak(email){
    return api('/api/profile-ping', { email, device: deviceFingerprint() });
  }

  async function fetchProfile(email){
    const r = await api('/api/profile', { action:'get', email });
    return r.profile || null;
  }

  function renderHeaderChips(profile){
    const hdr = document.querySelector('.header .container');
    if(!hdr || document.querySelector('#hud-chips')) return;
    const wrap = document.createElement('div');
    wrap.id = 'hud-chips';
    wrap.style.marginLeft = 'auto';
    wrap.innerHTML = `
      <div class="row" style="gap:8px;">
        <span class="pill" style="animation:pop .6s ease">🔥 Racha: <b>${profile?.streak||0}</b></span>
        <span class="pill">⭐ XP: <b>${profile?.xp||0}</b></span>
      </div>
    `;
    hdr.appendChild(wrap);
  }

  function showOnboarding(email){
    if (localStorage.getItem('ingresou_onboarded')) return;

    const back = document.createElement('div');
    back.className = 'modal-backdrop'; back.style.display='flex'; back.id='ob-back';
    back.innerHTML = `
      <div class="modal" style="max-width:560px" onclick="event.stopPropagation()">
        <div class="head"><strong>¡Bienvenido a IngresoU!</strong>
          <button class="btn ghost" id="ob-close">Cerrar</button>
        </div>
        <div class="body">
          <p>Tu cuenta guarda <b>racha diaria</b>, <b>XP</b> y <b>ranking</b>. Si compartes tu cuenta, <u>podrías perder tu racha</u> y afectar tus estadísticas.</p>
          <ol class="p">
            <li>1) Haz ping diario (solo entrar a la plataforma) para mantener tu 🔥 racha.</li>
            <li>2) Gana ⭐ XP completando prácticas y simulacros.</li>
            <li>3) Sube en el ranking y desbloquea logros.</li>
          </ol>
          <div class="kv"><div class="k">Sugerencia</div><div class="v">Activa recordatorio diario para no perder tu racha.</div></div>
        </div>
        <div class="foot">
          <button class="btn" id="ob-remind">Recordarme cada día</button>
          <a class="btn brand" id="ob-first" href="/exam.html?mode=paa">Hacer mi primer simulacro</a>
        </div>
      </div>`;
    back.addEventListener('click', ()=> back.remove());
    document.body.appendChild(back);
    document.getElementById('ob-close').onclick = ()=> back.remove();
    document.getElementById('ob-remind').onclick = ()=>{
      try{
        Notification.requestPermission && Notification.requestPermission();
      }catch(_){}
      alert('¡Listo! Te recomendaremos revisar IngresoU cada día para conservar tu racha.');
    };

    localStorage.setItem('ingresou_onboarded','1');
  }

  // Bootstrap al cargar cualquier página
  document.addEventListener('DOMContentLoaded', async ()=>{
    const email = (localStorage.getItem('ingresou_email')||'').toLowerCase();
    if(!email) return;

    await ensureProfile(email);
    await pingStreak(email);
    const pr = await fetchProfile(email);
    if (pr) renderHeaderChips(pr);
    showOnboarding(email);
  });

  // Exponer helpers para otros módulos
  window.IngresoU = window.IngresoU || {};
  window.IngresoU.fetchProfile = fetchProfile;
})();
