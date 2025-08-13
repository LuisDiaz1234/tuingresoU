import { cors, parseBody } from './_lib/supaClient.js';
function deterministicAlgebra(){ return [
  {question:'Resuelve: 3x - 5 = 16', choices:['x=7','x=21','x=11/3','x=5'], answer_index:0},
  {question:'Factoriza: x^2 + 5x + 6', choices:['(x+2)(x+3)','(x+1)(x+6)','(x-2)(x-3)','(x+6)^2'], answer_index:0},
  {question:'Simplifica: (x^3/x)', choices:['x^2','x^4','x','1'], answer_index:0},
  {question:'Si f(x)=2x+1, f(4)=', choices:['7','9','5','3'], answer_index:1},
  {question:'Pendiente entre (1,2) y (3,6)', choices:['2','4','1','3'], answer_index:0},
  {question:'Raíces de x^2 - 1 = 0', choices:['-1 y 1','0 y 1','-1 y 0','1 y 2'], answer_index:0},
  {question:'(a-b)^2 =', choices:['a^2+b^2','a^2-2ab+b^2','a^2-ab+b^2','2a^2-2b^2'], answer_index:1},
  {question:'Derivada de 5x', choices:['5','x','5x^2','0'], answer_index:0},
  {question:'Log base 2 de 8', choices:['2','3','4','8'], answer_index:1},
  {question:'Matriz identidad de orden 2', choices:['[[1,0],[0,1]]','[[0,1],[1,0]]','[[2,0],[0,2]]','[[1,1],[1,1]]'], answer_index:0},
];}
function deterministicLogico(){ return [
  {question:'Si p ⇒ q y q es falsa, entonces:', choices:['p es verdadera','p es falsa','p no se puede determinar','p y q verdaderas'], answer_index:1},
  {question:'Serie: 1, 3, 6, 10, ...', choices:['12','13','14','15'], answer_index:2},
  {question:'Negación de: "Algunos estudian"', choices:['Todos estudian','Nadie estudia','Todos no estudian','Algunos no estudian'], answer_index:3},
  {question:'Silogismo válido es...', choices:['Falacia','Argumento correcto','Paradoja','Analogía'], answer_index:1},
  {question:'Analogía: Sol es a día como luna es a...', choices:['noche','estrella','cielo','mar'], answer_index:0},
  {question:'Conjuntos A⊂B significa...', choices:['A es igual a B','A es subconjunto de B','A no tiene elementos','B es subconjunto de A'], answer_index:1},
  {question:'SI 2⇒4 y 4⇒8, entonces 2⇒8 es...', choices:['Válido por transitividad','Falso','Contradicción','No se sabe'], answer_index:0},
  {question:'Verdadero/Falso: (p∧q) ⇒ p', choices:['Verdadero','Falso','Depende','Indeterminado'], answer_index:0},
  {question:'Si hoy es miércoles, pasado mañana es', choices:['Viernes','Sábado','Domingo','Lunes'], answer_index:0},
  {question:'Serie: 2, 5, 9, 14, ... suma incrementos', choices:['+3,+4,+5','+2,+3,+5','+1,+2,+3','+4,+5,+6'], answer_index:0},
];}
function deterministicLectura(){ return [
  {question:'La idea principal de un texto es...', choices:['Un ejemplo','El detalle menor','Lo más importante que comunica','La cita'], answer_index:2},
  {question:'Sinónimo de "feliz"', choices:['Triste','Contento','Serio','Sombrío'], answer_index:1},
  {question:'Inferir requiere...', choices:['Memorizar','Deducir lo implícito','Ignorar el contexto','Traducir'], answer_index:1},
  {question:'"Por lo tanto" indica...', choices:['Causa','Consecuencia','Contraste','Definición'], answer_index:1},
  {question:'Antónimo de "oscuro"', choices:['Tenue','Luminoso','Sombrío','Apagado'], answer_index:1},
  {question:'Un párrafo está formado por...', choices:['Palabras sueltas','Oraciones relacionadas','Sílabas','Citas'], answer_index:1},
  {question:'"Explícito" significa...', choices:['Dicho claramente','Sugiere','Oculto','Implicado'], answer_index:0},
  {question:'Moraleja suele aparecer en...', choices:['Fábulas','Noticias','Manuales','Enciclopedias'], answer_index:0},
  {question:'"Según el texto" exige...', choices:['Opinión personal','Dato textual','Hipótesis creativa','Resumen libre'], answer_index:1},
  {question:'Onomatopeya es...', choices:['Imitación de sonidos','Figura de imagen','Tropo numérico','Metáfora visual'], answer_index:0},
];}
export default async function handler(req, res){
  cors(res);
  if(req.method === 'OPTIONS'){ res.status(200).end(); return; }
  if(req.method !== 'POST'){ res.status(405).json({ok:false, error:'METHOD_NOT_ALLOWED'}); return; }
  const body = await parseBody(req);
  const topic = (body.topic||'').toString().toLowerCase().trim();
  const count = Math.min(10, Math.max(1, parseInt(body.count||10,10)));
  let pool = [];
  if(topic === 'algebra') pool = deterministicAlgebra();
  else if(topic === 'logico') pool = deterministicLogico();
  else if(topic === 'lectura') pool = deterministicLectura();
  else { res.status(400).json({ok:false, error:'INVALID_TOPIC'}); return; }
  const questions = pool.slice(0, count);
  res.status(200).json({ok:true, questions});
}
