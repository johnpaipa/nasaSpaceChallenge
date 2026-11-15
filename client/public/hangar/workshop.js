/* Workshop UI uses the hangar's scene, parts, ORDER and single render loop.
   Rewards belong to this assembly session; mission simulation stays authoritative. */
(function () {
  var selected = null, answered = new Set(), installed = new Set(), points = 0;
  var hints = 0, ghost = null, outline = null, gesture = null, animating = null;
  var reducedQuery = matchMedia('(prefers-reduced-motion: reduce)');
  var reduced = reducedQuery.matches;
  try { reduced = reduced || localStorage.getItem('smd-hangar-motion') === '0'; } catch (_) {}
  var sequence = [6,4,1,0,3,5,2];
  var connections = ['en la base del cohete','sobre el motor','entre la primera y la segunda etapa','sobre la interetapa','sobre la segunda etapa','alrededor de la carga útil','a los lados de la primera etapa'];
  var questions = [
    '¿Qué pieza expulsa gases para producir empuje?',
    '¿Qué pieza almacena el propelente que alimenta los motores principales?',
    '¿Qué pieza conecta las etapas del cohete?',
    '¿Qué pieza mantiene el impulso tras separar la primera etapa?',
    '¿Qué elemento realiza el objetivo de la misión?',
    '¿Qué pieza protege la carga durante el ascenso?',
    '¿Qué piezas proporcionan empuje adicional al despegar?'
  ];
  var distractors = [5,4,0,5,2,3,4];
  var paths = {
    trophy:'M7 3h10v6a5 5 0 0 1-10 0ZM7 5H3v3a4 4 0 0 0 4 4M17 5h4v3a4 4 0 0 1-4 4M12 14v6M7 21h10',
    star:'m12 2 3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1Z',
    gear:'M9 3h6l1 4 4 1v7l-4 1-1 5H9l-1-5-4-1V8l4-1ZM15 12a3 3 0 1 0-6 0 3 3 0 0 0 6 0',
    motor:'M7 3h10v4l-2 2 4 12H5L9 9 7 7ZM7 7h10',
    s1:'M7 4h10v17H7ZM7 8h10M7 16h10M8 2h8',
    s2:'M7 4h10v14H7ZM7 8h10M9 18l-2 4h10l-2-4',
    inter:'M3 8c0-4 18-4 18 0v9c0 4-18 4-18 0ZM3 8c0 4 18 4 18 0M7 12v6M17 12v6',
    fair:'M5 21C5 10 8 5 12 2c4 3 7 8 7 19ZM8 21C8 12 10 7 12 2',
    pay:'M9 7h6v10H9ZM1 9h6v6H1ZM17 9h6v6h-6M7 12h2M15 12h2M12 7V3',
    srb:'M4 21V7l3-5 3 5v14ZM14 21V7l3-5 3 5v14ZM4 17h6M14 17h6'
  };
  var EN_SPEECH={
    '¿Qué pieza expulsa gases para producir empuje?':'Which part expels gas to produce thrust?',
    '¿Qué pieza almacena el propelente que alimenta los motores principales?':'Which part stores the propellant that feeds the main engines?',
    '¿Qué pieza conecta las etapas del cohete?':'Which part connects the rocket stages?',
    '¿Qué pieza mantiene el impulso tras separar la primera etapa?':'Which part keeps pushing after the first stage separates?',
    '¿Qué elemento realiza el objetivo de la misión?':'Which part carries out the mission objective?',
    '¿Qué pieza protege la carga durante el ascenso?':'Which part protects the payload during ascent?',
    '¿Qué piezas proporcionan empuje adicional al despegar?':'Which parts provide extra thrust at liftoff?',
    'Motor y tobera':'Engine and nozzle','Primera etapa':'First stage','Satélite':'Satellite','Interetapa':'Interstage','Segunda etapa':'Second stage','Cofia':'Fairing','Propulsores sólidos':'Solid rocket boosters','Carga útil':'Payload',
    'Cuenta regresiva y revisión final':'Countdown and final checks','Ignición de los motores':'Engine ignition','Despegue: se sueltan las sujeciones':'Liftoff: release the hold-downs','Max Q':'Max Q','Soltar los propulsores sólidos':'Separate the solid rocket boosters','La cofia protectora':'Jettison the protective fairing','Inserción orbital':'Orbital insertion','Separar la carga útil':'Separate the payload',
    'El cohete está armado. ¿Qué hacemos primero?':'The rocket is assembled. What do we do first?','Llegamos a cero. ¿Qué sigue?':'We reached zero. What comes next?','El empuje ya supera al peso. ¿Qué pasa ahora?':'Thrust now exceeds the rocket’s weight. What happens next?','Subimos tan rápido que el aire presiona la estructura al máximo. ¿Cómo se llama ese momento?':'The air is pressing on the rocket structure as hard as it will during ascent. What is this moment called?','Los propulsores sólidos ya quemaron todo su propelente. ¿Qué hacemos con ellos?':'The solid boosters have used all their propellant. What should we do with them?','Casi no hay atmósfera. ¿Qué descartamos?':'There is almost no atmosphere. What do we discard?','La segunda etapa alcanza la velocidad orbital y apaga sus motores. ¿Cómo se llama esa fase?':'The second stage reaches orbital speed and shuts down its engines. What is this phase called?','Estamos en órbita. ¿Último paso?':'We are in orbit. What is the final step?',
    '¿Qué pieza mantiene el impulso tras separar la primera etapa?':'Which part keeps accelerating the spacecraft after the first stage separates?',
    'El empuje crece con el cohete aún sujeto.':'Thrust builds while the rocket is still held down.','El cohete abandona la plataforma.':'The rocket lifts off the launch pad.','Es el punto de máxima presión dinámica.':'This is the point of maximum dynamic pressure.','Vacíos solo son peso muerto a los lados del cohete.':'Once empty, the boosters are dead weight on the sides of the rocket.','Protege la carga del aire.':'It protects the payload from the atmosphere.','El cohete queda moviéndose alrededor de la Tierra.':'The rocket is now moving around Earth.','La misión es dejar el satélite en su órbita.':'The mission is to release the satellite into its orbit.',
    'El combustible de la primera etapa se acaba. ¿Qué hacemos?':'The first stage has run out of propellant. What should we do?','Pieza':'Part','Antes de encender nada, el equipo confirma que todo esté bien.':'Before ignition, the team checks that everything is ready.','Hay que generar empuje.':'We need to generate thrust.','Ya no sirve y solo agrega peso.':'It is no longer useful and only adds weight.','Pista:':'Hint:','Ensamblaje completado: 7 piezas instaladas y':'Assembly complete: all 7 parts installed and','puntos en este taller.':'points in this workshop.','Primero responde:':'Answer first:','Esta pieza ya está instalada.':'This part is already installed.','Busca la silueta de la pieza actual.':'Look for the outline of the current part.','Selecciona una pieza para conocer su función.':'Select a part to learn what it does.','Esta pieza se conecta':'This part connects','Colócala':'Place it','alrededor de la carga útil.':'around the payload.','a los lados de la primera etapa.':'on the sides of the first stage.','en la base del cohete.':'at the base of the rocket.','entre la primera y la segunda etapa.':'between the first and second stages.','sobre la interetapa.':'above the interstage.','sobre la segunda etapa.':'above the second stage.',
    '¿Qué pieza expulsa gases para producir empuje?':'Which part expels exhaust to produce thrust?','¿Qué pieza almacena el propelente que alimenta los motores principales?':'Which part stores the propellant that feeds the main engines?','¿Qué pieza conecta las etapas del cohete?':'Which part connects the rocket stages?','¿Qué elemento realiza el objetivo de la misión?':'Which component carries out the mission objective?','¿Qué pieza protege la carga durante el ascenso?':'Which part protects the payload during ascent?','¿Qué piezas proporcionan empuje adicional al despegar?':'Which parts provide extra thrust at liftoff?',
    'Control de misión: misión a':'Mission control: mission to','confirmada. Vamos a armar el cohete pieza por pieza, de abajo hacia arriba. Primero mira la guía: te muestra las siete piezas y en qué orden van.':'confirmed. We will assemble the rocket piece by piece, from the bottom up. First, check the guide to see the seven parts and their order.','Estás en primera persona: camina con W A S D, las flechas o los botones, y arrastra para mirar. Te pediré cada pieza según lo que hace.':'You are in first person. Move with W A S D, the arrow keys, or the on-screen buttons, and drag to look around. I will ask for each part by its function.','¡Cohete ensamblado! Ahora lo llevamos a la plataforma de lanzamiento.':'Rocket assembled! Now we are moving it to the launch pad.','¡Misión cumplida! Ensamblaste el cohete y completaste todas las fases de la misión:':'Mission complete! You assembled the rocket and completed every mission phase:','En tránsito hacia':'In transit to','Observa cómo se acerca el destino.':'Watch as we approach our destination.','El cohete está armado. ¿Qué hacemos primero?':'The rocket is assembled. What do we do first?','Llegamos a cero. ¿Qué sigue?':'We reached zero. What comes next?','El empuje ya supera al peso. ¿Qué pasa ahora?':'Thrust now exceeds the rocket’s weight. What happens next?','Subimos tan rápido que el aire presiona la estructura al máximo. ¿Cómo se llama ese momento?':'The air is pressing on the rocket structure as hard as it will during ascent. What is this moment called?','Los propulsores sólidos ya quemaron todo su propelente. ¿Qué hacemos con ellos?':'The solid boosters have used all their propellant. What should we do with them?','Casi no hay atmósfera. ¿Qué descartamos?':'There is almost no atmosphere. What do we discard?','La segunda etapa alcanza la velocidad orbital y apaga sus motores. ¿Cómo se llama esa fase?':'The second stage reaches orbital speed and shuts down its engines. What is this phase called?','Estamos en órbita. ¿Último paso?':'We are in orbit. What is the final step?',
    '¡Error! Los propulsores todavía empujan. Al soltarlos ahora, el cohete pierde empuje, pierde altura y cae. Se reinicia esta fase para que lo intentes de nuevo.':'Incorrect. The solid boosters are still providing thrust. Releasing them now makes the rocket lose thrust and altitude, causing it to fall. This phase will restart so you can try again.','¡Error!':'Incorrect.','Observa la consecuencia: el cohete pierde estabilidad y altura antes de quedar fuera de peligro.':'Watch the consequence: the rocket loses stability and altitude before it is out of danger.','Control de misión cancela el lanzamiento: una revisión final encontró un problema en el diseño que no se resolvió a tiempo. El cohete se queda en la plataforma.':'Mission control has cancelled the launch. A final check found a design issue that was not resolved in time, so the rocket remains on the launch pad.','¡Anomalía! El lanzador falló poco después del despegue: la misión se perdió antes de llegar a órbita.':'Anomaly! The launch vehicle failed shortly after liftoff. The mission was lost before reaching orbit.','El cohete dejó la nave en una órbita de transferencia, pero sin el quemado de circularización se queda ahí: nunca llegó a su órbita final.':'The rocket placed the spacecraft in a transfer orbit, but without a circularization burn it stayed there and never reached its final orbit.','pero bajó demasiado rápido y se estrelló contra la superficie. Aterrizar es la parte más difícil del viaje.':'but descended too quickly and crashed into the surface. Landing is the hardest part of the journey.',
    'quema el combustible y expulsa los gases hacia abajo para generar empuje':'burns propellant and directs exhaust downward to produce thrust','guarda el combustible y da el mayor empuje para salir de la atmósfera densa':'stores propellant and provides most of the thrust needed to leave the dense atmosphere','une las dos etapas y contiene el mecanismo que las separa':'connects the two stages and houses the separation mechanism','sigue acelerando en el vacío y lleva la carga hasta la órbita':'continues accelerating in space and carries the payload to orbit','es el satélite o instrumento que queremos llevar al espacio':'is the satellite or instrument we want to take into space','protege la carga durante el ascenso y se abre al salir de la atmósfera':'protects the payload during ascent and opens after leaving the atmosphere','se sujetan a los lados, dan casi todo el empuje del despegue y se sueltan cuando se les acaba el propelente':'attach to the sides, provide most of the thrust at liftoff, and separate when their propellant is used up','une las dos etapas y contiene el mecanismo que las separa':'connects the two stages and contains their separation mechanism','El motor se reenciende para alcanzar la velocidad de escape y viajar hacia':'The engine restarts to reach escape velocity and travel to','Hay que reencender el motor para ganar velocidad y salir de la órbita terrestre.':'We need to restart the engine to gain speed and leave Earth orbit.','La misión es dejar la carga en su destino.':'The goal is to release the payload at its destination.','El módulo lunar':'The lunar module','El rover marciano':'The Mars rover','es el satélite que queremos dejar en órbita alrededor de la Tierra':'is the satellite we want to place in orbit around Earth','es el módulo que descenderá sobre la superficie de la Luna':'is the module that will descend to the lunar surface','es el rover que explorará la superficie de Marte':'is the rover that will explore the surface of Mars','Inyección translunar':'Translunar injection','Inyección transmarciana':'Trans-Mars injection','Hacer el quemado de circularización':'Perform the circularization burn','Llegamos a la órbita de transferencia. Para quedar en':'We have reached transfer orbit. To enter','hace falta un quemado más. ¿Qué hacemos?':'we need one more engine burn. What should we do?','Sin un segundo encendido del motor la nave se queda en la órbita de transferencia.':'Without a second engine burn, the spacecraft remains in transfer orbit.','El motor se reenciende para circularizar y quedar establemente en':'The engine restarts to circularize the orbit and remain stably in','la superficie de':'the surface of','queda libre, frena con sus motores y se posa sobre la superficie de':'is released, slows down with its engines, and lands on the surface of','Marte':'Mars','la Luna':'the Moon','la Tierra':'Earth','Órbita terrestre':'Earth orbit'
  };
  function translateFragments(text){var out=text;Object.keys(EN_SPEECH).sort(function(a,b){return b.length-a.length}).forEach(function(es){if(out.indexOf(es)!==-1)out=out.split(es).join(EN_SPEECH[es])});return out
    .replace(/Part (\d+) de (\d+)\./g,'Part $1 of $2.').replace(/Pieza (\d+) de (\d+)\./g,'Part $1 of $2.').replace(/Necesito la pieza que /g,'I need the part that ').replace(/Elígela en el catálogo o tócala en la mesa\. Si dudas, abre la guía\./g,'Choose it from the catalog or click it on the workbench. If you are unsure, open the guide.').replace(/Seguimos en órbita terrestre y queremos viajar a /g,'We are in Earth orbit and want to travel to ').replace(/\. ¿Qué maniobra hacemos\?/g,'. Which maneuver should we perform?').replace(/Llegamos a /g,'We have reached ').replace(/¿Qué hacemos con el /g,'What should we do with the ').replace(/a Marte/g,'to Mars').replace(/a la Luna/g,'to the Moon').replace(/a la Tierra/g,'to Earth').replace(/el satélite/g,'the satellite').replace(/el rover/g,'the rover').replace(/Colócala/g,'Place it').replace(/\binstalada\./g,'installed.').replace(/Instalando/g,'Installing').replace(/\+50 puntos\./g,'plus 50 points.')}
  window.workshopSpeech=function(text,lang){if(lang!=='en')return {text:text,lang:'es'};var translated=EN_SPEECH[text];
    if(!translated&&text.indexOf('¡Correcto! ')===0)translated='Correct! '+translateFragments(text.slice(11));
    if(!translated)translated=translateFragments(text);
    if(translated.indexOf('Seleccionada: ')===0)translated=translated.replace('Seleccionada: ','Selected: ');
    return {text:translated,lang:'en'}};
  function icon(name) { return '<svg viewBox="0 0 24 24" width="23" height="23" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" aria-hidden="true"><path d="'+paths[name]+'"/></svg>'; }
  var header = document.createElement('header'); header.id='workshop-header';
  header.innerHTML='<b>MISIÓN: <span>BEYOND</span></b><strong>ASISTENTE DE MISIÓN</strong><div class="workshop-rewards"><span id="workshop-achievements"></span><span id="workshop-points"></span></div><button id="workshop-help" aria-label="Ayuda">?</button><button id="workshop-settings" aria-label="Configuración">'+icon('gear')+'</button>';
  app.appendChild(header);
  var tools=document.createElement('div');tools.id='workshop-tools';
  tools.innerHTML='<button id="workshop-hint">Dame una pista</button><button id="workshop-listen">Escuchar</button><details id="workshop-fact"><summary>Dato de ingeniería</summary><p></p></details>';
  document.getElementById('dlg').appendChild(tools);
  var selection=document.createElement('div');selection.id='workshop-selection';selection.hidden=true;
  selection.innerHTML='<b></b><img alt=""><small class="workshop-credit"></small><p class="workshop-real"></p><a target="_blank" rel="noopener noreferrer">Fuente oficial ↗</a><button>Inspeccionar</button>';app.appendChild(selection);
  selection.querySelector('button').onclick=function(){if(selected!==null)inspectPart(selected)};
  var target=document.createElement('button');target.id='workshop-target';target.hidden=true;app.appendChild(target);
  target.onclick=function(){placeSelected(true)};
  var toggle=document.createElement('button');toggle.id='workshop-catalog-toggle';toggle.textContent='Catálogo de piezas';toggle.setAttribute('aria-expanded','false');app.appendChild(toggle);
  toggle.onclick=function(){var open=catEl.classList.toggle('expanded');toggle.setAttribute('aria-expanded',String(open))};
  var settings=document.createElement('dialog');settings.id='workshop-dialog';app.appendChild(settings);
  function dialog(title,content) {
    keys={};settings.innerHTML='<h2>'+title+'</h2>'+content+'<button id="workshop-close">Volver</button>';
    settings.querySelector('#workshop-close').onclick=function(){settings.close()};settings.showModal();
  }
  document.getElementById('workshop-help').onclick=function(){
    dialog('Controles del taller','<p>Responde la pregunta, selecciona la pieza y colócala en la silueta ámbar.</p><p>Arrastra una pieza para moverla; arrastra el fondo para mirar. Camina con W A S D o las flechas.</p><p>También puedes usar Tab y Enter para seleccionar desde el catálogo y activar «Colocar en conexión». Inspeccionar abre la ficha real. Esc cierra las fichas.</p><p>Recompensas de esta sesión: 20 puntos por pregunta y 50 por pieza instalada. Cada recompensa se entrega una sola vez.</p>');
  };
  document.getElementById('workshop-settings').onclick=function(){
    dialog('Configuración','<label><input id="workshop-audio" type="checkbox"> Sonido y voz</label><label>Idioma de voz<select id="workshop-voice-lang"><option value="es">Español</option><option value="en">English</option></select></label><label><input id="workshop-motion" type="checkbox"> Animaciones de ensamblaje</label>');
    var audio=settings.querySelector('#workshop-audio');audio.checked=VOICE;
    var voiceChoice=settings.querySelector('#workshop-voice-lang');try{voiceLang=localStorage.getItem('smd-hangar-voice-lang')||voiceLang}catch(_){}voiceChoice.value=voiceLang;
    voiceChoice.onchange=function(){voiceLang=voiceChoice.value;lastSaid='';try{localStorage.setItem('smd-hangar-voice-lang',voiceLang)}catch(_){};if(VOICE)speak(sayEl.textContent)};
    audio.onchange=function(){VOICE=audio.checked;lastSaid='';clearTimeout(voiceTimer);if(!VOICE){speechRun++;if(window.speechSynthesis)speechSynthesis.cancel();document.getElementById('workshop-listen').textContent='Escuchar'}try{localStorage.setItem('smd-muted',VOICE?'0':'1');localStorage.setItem('smd-voice',VOICE?'1':'0')}catch(_){};if(VOICE)speak(sayEl.textContent)};
    document.getElementById('workshop-audio-status').textContent=voiceError;
    var motion=settings.querySelector('#workshop-motion');motion.checked=!reduced;motion.disabled=reducedQuery.matches;
    motion.onchange=function(){reduced=!motion.checked;try{localStorage.setItem('smd-hangar-motion',reduced?'0':'1')}catch(_){}};
  };
  reducedQuery.addEventListener('change',function(e){if(e.matches)reduced=true});
  document.getElementById('workshop-listen').onclick=function(){
    if(!window.speechSynthesis){document.getElementById('workshop-audio-status').textContent='Este navegador no permite síntesis de voz.';return}
    if(speechSynthesis.speaking||speechSynthesis.pending){speechRun++;clearTimeout(voiceTimer);speechSynthesis.cancel();this.textContent='Escuchar';document.getElementById('workshop-audio-status').textContent='';return}
    if(!VOICE){document.getElementById('workshop-audio-status').textContent='Activa «Sonido y voz» en Configuración para escuchar.';return}
    lastSaid='';if(speak(sayEl.textContent,true))this.textContent='Detener';
  };
  document.getElementById('workshop-hint').onclick=function(){
    if(mode!=='assembly'||busy||ai>=ORDER.length)return;
    hints++;var i=ORDER[ai];
    if(hints===1) say('Pista: '+DEF[i].fn+'.',answerOptions());
    else {select(i);say('Busca «'+DEF[i].name+'». Su conexión está '+connections[i]+'.',answered.has(i)?placementOptions():answerOptions())}
  };
  function status() {
    document.getElementById('workshop-points').innerHTML=icon('star')+' '+points+' puntos';
    var badges=(answered.size===7?1:0)+(installed.size===7?1:0);
    var achievements=document.getElementById('workshop-achievements');
    achievements.innerHTML=icon('trophy')+' '+badges+' / 2';
    achievements.title='Logros: responder las siete preguntas y ensamblar las siete piezas';
    if(mode==='assembly')stepEl.textContent=installed.size===7?'Ensamblaje completado':'Ensamblaje '+installed.size+' de 7';
    sequence.forEach(function(i,k){
      chips[i].disabled=false;
      parts[i].userData.l.textContent=(k+1)+'. '+DEF[i].name;
      chips[i].classList.toggle('selected',i===selected);
      chips[i].classList.toggle('completed',installed.has(i));
      chips[i].classList.toggle('objective',i===ORDER[ai]);
      chips[i].setAttribute('aria-pressed',String(i===selected));
      chips[i].innerHTML=icon(DEF[i].id)+'<span>'+(k+1)+'. '+DEF[i].name+(installed.has(i)?' ✓':'')+'</span>';
      chips[i].onclick=function(){select(i)};
    });
  }
  sequence.forEach(function(i){catEl.appendChild(chips[i])});
  function clearGhost(){
    if(ghost){scene.remove(ghost);ghost.traverse(function(o){if(o.isMesh)o.material.dispose()});ghost=null}
    target.hidden=true;
  }
  function mark(i) {
    if(outline){scene.remove(outline);outline.geometry.dispose();outline.material.dispose()}
    outline=new THREE.BoxHelper(parts[i],0xe7b947);scene.add(outline);
  }
  function makeGhost(i){
    clearGhost();if(installed.has(i)||i!==ORDER[ai]||!answered.has(i))return;
    ghost=parts[i].clone(true);
    ghost.traverse(function(o){if(o.isMesh)o.material=new THREE.MeshBasicMaterial({color:0xe7b947,transparent:true,opacity:.24,depthWrite:false})});
    ghost.position.set(0,bases[i],RZ0);ghost.scale.setScalar(K);scene.add(ghost);
    target.textContent='Colocar aquí: '+DEF[i].name;target.hidden=false;
  }
  function select(i) {
    if(mode!=='assembly'||busy)return;
    selected=i;mark(i);makeGhost(i);status();
    selection.hidden=false;selection.querySelector('b').textContent=DEF[i].name;
    var card=PART_CARDS[DEF[i].id],photo=selection.querySelector('img');
    photo.src='/hangar/'+card.image;photo.alt=card.credit;photo.hidden=false;
    photo.onerror=function(){this.hidden=true};
    selection.querySelector('.workshop-credit').textContent=card.credit;
    selection.querySelector('.workshop-real').textContent=card.body;
    selection.querySelector('a').href=card.source;
    var fact=document.getElementById('workshop-fact');fact.open=false;fact.querySelector('p').textContent=PART_CARDS[DEF[i].id].body;
    catEl.classList.remove('expanded');toggle.setAttribute('aria-expanded','false');
    if(answered.has(ORDER[ai]))say('Seleccionada: '+DEF[i].name+'. '+(i===ORDER[ai]?'Colócala '+connections[i]+'.':'Esta pieza va '+connections[i]+'.'),placementOptions());
  }
  function placementOptions(){return [['Colocar en conexión',function(){placeSelected(true)}]]}
  function answerOptions(){
    if(ai>=ORDER.length)return [];
    var needed=ORDER[ai];if(answered.has(needed))return placementOptions();
    return [needed,distractors[needed]].sort(function(a,b){return a-b}).map(function(i){return [DEF[i].name,function(){
      if(answered.has(needed)||busy)return;
      if(i!==needed){say('Todavía no: '+DEF[i].name+' '+DEF[i].fn+'. Inténtalo de nuevo.',answerOptions());return}
      answered.add(needed);points+=20;select(needed);
      say('¡Correcto! '+DEF[needed].name+' '+DEF[needed].fn+'. Colócala '+connections[needed]+'.',placementOptions());status();
    }]});
  }
  askAssembly=function(){
    mode='assembly';busy=false;hints=0;
    px=0;pz=26;yaw=0;pitch=.25;infoEl.style.display='none';tools.hidden=false;selection.hidden=true;selected=null;clearGhost();
    if(outline){scene.remove(outline);outline.geometry.dispose();outline.material.dispose();outline=null}
    updGuide();status();
    if(ai>=ORDER.length){document.getElementById('workshop-hint').disabled=true;say('Ensamblaje completado: 7 piezas instaladas y '+points+' puntos en este taller.',[['Continuar a la plataforma',function(){tools.hidden=true;clearGhost();selection.hidden=true;mode='transition';startLaunch()}]]);return}
    document.getElementById('workshop-fact').open=false;
    document.getElementById('workshop-fact').querySelector('p').textContent='Selecciona una pieza para conocer su función.';
    say(questions[ORDER[ai]],answerOptions());
  };
  function placeSelected(valid){
    if(mode!=='assembly'||busy||selected===null)return;
    var i=selected;
    if(installed.has(i)){say('Esta pieza ya está instalada.',answerOptions());return}
    if(!answered.has(ORDER[ai])){say('Primero responde: '+questions[ORDER[ai]],answerOptions());return}
    if(i!==ORDER[ai]||!valid){say('Esta pieza se conecta '+connections[i]+'. Busca la silueta de la pieza actual.',placementOptions());return}
    clearGhost();busy=true;selection.hidden=true;tools.hidden=true;
    var o=parts[i];o.userData.l.style.display='none';
    o.userData.tw={t:0,p0:o.position.clone(),p1:new THREE.Vector3(0,bases[i],RZ0)};
    animating=i;say('Instalando '+DEF[i].name+'…');
  }
  // Legacy inspection now returns to selection; it cannot bypass question or placement validation.
  choose=function(i){select(i);placeSelected(true)};
  var originalInspect=inspectPart;
  inspectPart=function(i){
    originalInspect(i);
    if(!partCard.open)return;
    var button=partCard.querySelector('.part-assemble');
    button.disabled=false;button.textContent='Volver al ensamblaje';
    button.onclick=function(){partCard.close();select(i)};
  };
  function hitPart(e){
    var r=cv.getBoundingClientRect();mouse.set((e.clientX-r.left)/r.width*2-1,-((e.clientY-r.top)/r.height)*2+1);ray.setFromCamera(mouse,cam);
    var hit=ray.intersectObjects(parts,true)[0];if(!hit)return null;
    var o=hit.object;while(o&&o.userData.i===undefined)o=o.parent;return o?o.userData.i:null;
  }
  cv.addEventListener('pointerdown',function(e){
    if(mode!=='assembly')return;
    var i=hitPart(e);if(i===null||busy)return;
    e.stopImmediatePropagation();e.preventDefault();select(i);
    gesture={i:i,x:e.clientX,y:e.clientY,moved:false,start:parts[i].position.clone()};
    cv.setPointerCapture(e.pointerId);
  },true);
  cv.addEventListener('pointermove',function(e){
    if(!gesture)return;e.stopImmediatePropagation();
    if(Math.hypot(e.clientX-gesture.x,e.clientY-gesture.y)<7&&!gesture.moved)return;
    gesture.moved=true;
    if(!ghost||gesture.i!==ORDER[ai])return;
    var r=cv.getBoundingClientRect();mouse.set((e.clientX-r.left)/r.width*2-1,-((e.clientY-r.top)/r.height)*2+1);ray.setFromCamera(mouse,cam);
    var point=new THREE.Vector3();
    if(ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0,0,1),-RZ0),point))parts[gesture.i].position.copy(point);
  },true);
  function release(e,cancel){
    if(!gesture)return;e.stopImmediatePropagation();
    var g=gesture;gesture=null;var p=parts[g.i];
    var valid=!!ghost&&p.position.distanceTo(ghost.position)<Math.max(1.5,DEF[g.i].h*K*.55);
    p.position.copy(g.start);
    if(g.moved&&!cancel)placeSelected(valid);
    if(cv.hasPointerCapture(e.pointerId))cv.releasePointerCapture(e.pointerId);
  }
  cv.addEventListener('pointerup',function(e){release(e,false)},true);
  cv.addEventListener('pointercancel',function(e){release(e,true)},true);
  window.addEventListener('blur',function(){keys={};if(gesture){parts[gesture.i].position.copy(gesture.start);gesture=null}});
  settings.addEventListener('close',function(){keys={}});
  window.addEventListener('keydown',function(e){if(settings.open||partCard.open){keys={};e.stopImmediatePropagation()}},true);
  // Called by the existing frame loop, after its assembly tween has completed.
  window.workshopTick=function(){
    if(outline)outline.update();
    if(animating!==null){
      var p=parts[animating];
      if(reduced&&p.userData.tw)p.userData.tw.t=1;
      if(!p.userData.tw){
        var i=animating;animating=null;p.userData.done=true;installed.add(i);points+=50;ai=installed.size;
        status();updGuide();tools.hidden=false;
        say(DEF[i].name+' instalada. +50 puntos.',[[ai===7?'Ver resumen':'Siguiente pieza',askAssembly]]);
      }
    }
    if(ghost&&!target.hidden){
      var pos=ghost.position.clone();pos.y+=DEF[selected].h*K/2;pos.project(cam);
      target.style.left=clamp((pos.x*.5+.5)*app.clientWidth,20,app.clientWidth-240)+'px';
      target.style.top=clamp((-pos.y*.5+.5)*app.clientHeight,110,app.clientHeight-280)+'px';
      target.style.visibility=pos.z>1?'hidden':'visible';
    }
    if(mode!=='assembly'){tools.hidden=true;selection.hidden=true;target.hidden=true}
    if(!window.speechSynthesis||(!speechSynthesis.speaking&&!speechSynthesis.pending))document.getElementById('workshop-listen').textContent='Escuchar';
  };
  status();
})();
