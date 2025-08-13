
(function(){
  const form = document.getElementById('loginForm');
  if(!form || form.__wired) return;
  form.__wired = true;
  const status = document.getElementById('status');
  async function callJson(url, method='POST', body=null){
    const res = await fetch(url, { method, headers: {'Content-Type':'application/json'}, body: body ? JSON.stringify(body) : null });
    return res.json();
  }
  async function handleLogin(email, code){
    status.textContent = 'Verificando suscripción (fallback JS)...';
    const payload = { email: (email||'').toLowerCase().trim(), code: (code||'').toUpperCase().trim() };
    let r = await callJson('/api/get-subscription','POST',payload);
    if(!r.ok && r.error==='NOT_REDEEMED'){
      await callJson('/api/redeem-key','POST',payload);
      r = await callJson('/api/get-subscription','POST',payload);
    }
    if(!r.ok){ status.textContent = 'Error: '+(r.error||''); return; }
    const s = r.subscription;
    localStorage.setItem('ingresou_email', payload.email);
    localStorage.setItem('ingresou_key', payload.code);
    localStorage.setItem('ingresou_plan', s.plan||'');
    localStorage.setItem('ingresou_university', s.university||'');
    localStorage.setItem('ingresou_expires_at', s.expires_at||'');
    location.href='/premium.html';
  }
  form.addEventListener('submit', (e)=>{
    e.preventDefault();
    handleLogin(document.getElementById('email').value, document.getElementById('code').value);
  });
})();
