
(function(){
  const b = document.getElementById('renewalBanner');
  if(!b || !b.dataset.expiresAt) return;
  try{
    const exp = new Date(b.dataset.expiresAt);
    const now = new Date();
    const ms = exp - now;
    const days = Math.ceil(ms/86400000);
    if(days <= 7){
      b.innerHTML = '<strong>Tu plan expira en '+days+' día(s).</strong> Si necesitas renovar, contacta a soporte.';
    }else{
      b.classList.add('hidden');
    }
  }catch(e){}
})();
