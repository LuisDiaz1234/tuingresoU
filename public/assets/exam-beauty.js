/* Examen bonito: convierte radios+texto en labels .opt dentro de .q-card */
/* No toca tu lógica de examen, solo estiliza el DOM. */
(function beautifyExamV2(){
  console.log('[exam-beauty] loaded');

  function isBlock(el){
    if(!el) return false;
    const disp = getComputedStyle(el).display;
    return disp==='block' || disp==='list-item' || disp==='grid' || disp==='flex';
  }

  function makeLabelForRadio(r){
    // Si ya viene dentro de label, solo asegúralo
    let lab = r.closest('label');
    if (lab) { lab.classList.add('opt'); return lab; }

    // Crear label y envolver el radio
    lab = document.createElement('label');
    lab.className = 'opt';
    r.parentNode.insertBefore(lab, r);
    lab.appendChild(r);

    // Capturar el texto contiguo (nodos de texto y spans simples)
    let txt = '';
    while (lab.nextSibling && (
      lab.nextSibling.nodeType === 3 || // texto
      (lab.nextSibling.nodeType === 1 && !lab.nextSibling.matches('input, br, hr'))
    )) {
      const n = lab.nextSibling;
      if (n.nodeType === 3){
        txt += n.nodeValue;
        n.remove();
      } else if (n.nodeType === 1){
        txt += ' ' + n.textContent;
        n.remove();
      }
    }
    const span = document.createElement('span');
    span.textContent = (txt||'').trim();
    lab.appendChild(span);
    return lab;
  }

  function groupOptions(radios){
    if (!radios.length) return;

    // Contenedor block más cercano
    const first = radios[0];
    let container = first.closest('.q-card,.question,.q,li,.pregunta,.pregunta-item,div,p') || first.parentElement;
    while (container && !isBlock(container)) container = container.parentElement;
    if (!container) container = first.parentElement;

    // Marcar tarjeta
    container.classList.add('q-card');

    // Título de la pregunta (si había <b>/<strong>)
    const strong = container.querySelector('b,strong');
    if (strong && !container.querySelector('.q-title')){
      const t = document.createElement('div');
      t.className = 'q-title';
      t.textContent = strong.textContent.trim();
      strong.replaceWith(t);
    }

    // Crear o recuperar contenedor de opciones
    let opts = container.querySelector('.opts');
    if (!opts){
      opts = document.createElement('div');
      opts.className = 'opts';
      container.appendChild(opts);
    }

    // Pasar todas las opciones al contenedor .opts
    radios.forEach(r=>{
      const lab = makeLabelForRadio(r);
      if (lab.parentElement !== opts) opts.appendChild(lab);
      lab.addEventListener('click', ()=>{
        radios.forEach(x=>{
          const L = x.closest('label.opt'); if (L) L.classList.remove('sel');
        });
        r.checked = true;
        lab.classList.add('sel');
      });
    });
  }

  function run(){
    // Títulos de secciones
    document.querySelectorAll('h2, h3').forEach(h=>h.classList.add('section-title'));

    // Agrupar radios por "name"
    const allRadios = Array.from(document.querySelectorAll('input[type=radio]'));
    if (!allRadios.length) return;
    const byName = new Map();
    allRadios.forEach(r=>{
      const n = r.getAttribute('name') || ('__nn__' + Math.random());
      if(!byName.has(n)) byName.set(n, []);
      byName.get(n).push(r);
    });
    byName.forEach(group=> groupOptions(group));
  }

  // Ejecuta varias veces por si tu render es asíncrono
  document.addEventListener('DOMContentLoaded', run);
  setTimeout(run, 150);
  setTimeout(run, 600);
  setTimeout(run, 1200);
})();
