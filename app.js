(function () {
  'use strict';

  // ---------- Utilidades ----------
  var D = null;
  var $ = function (id) { return document.getElementById(id); };
  function sget(k, def) { try { var v = localStorage.getItem('sv_' + k); return v === null ? def : JSON.parse(v); } catch (e) { return def; } }
  function sset(k, v) { try { localStorage.setItem('sv_' + k, JSON.stringify(v)); } catch (e) { toast('No se pudo guardar (almacenamiento lleno)'); } }
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function md(s) { return esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\*(.+?)\*/g, '<i>$1</i>'); }
  function plain(s) { return String(s).replace(/\*\*/g, '').replace(/\*/g, ''); }
  function ic(sym, color, size) {
    var u = 'sym/' + sym + '.webp';
    return '<i class="ic" style="-webkit-mask-image:url(\'' + u + '\');mask-image:url(\'' + u + '\');' + (color ? 'color:' + color + ';' : '') + (size ? 'width:' + size + 'px;height:' + size + 'px;' : '') + '"></i>';
  }
  function alpha(hex, a) {
    var n = parseInt(hex.slice(1), 16);
    return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
  }
  var toastT;
  function toast(msg) { var t = $('toast'); t.textContent = msg; t.className = 'toast show'; clearTimeout(toastT); toastT = setTimeout(function () { t.className = 'toast'; }, 2000); }
  function levelTint(l) { return l === 'Fácil' ? '#4C7D38' : l === 'Medio' ? '#B98A0C' : '#D23B38'; }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function hz(f) {
    if (f < 1000) return Math.round(f) + ' Hz';
    var k = (f / 1000).toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
    return k.replace('.', ',') + ' kHz';
  }
  function share(text) {
    if (navigator.share) { navigator.share({ text: text }).catch(function () {}); }
    else copy(text);
  }
  function copy(text) {
    if (navigator.clipboard) navigator.clipboard.writeText(text).then(function () { toast('Copiado'); }, function () { toast('No se pudo copiar'); });
  }

  // ---------- Tema y visión nocturna ----------
  var root = document.documentElement;
  function applyTheme(t) { root.setAttribute('data-theme', t); sset('theme', t); }
  applyTheme(sget('theme', window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
  $('themeTrack').addEventListener('click', function () { applyTheme(root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark'); });
  if (sget('night', false)) root.setAttribute('data-night', '1');
  $('nightBtn').addEventListener('click', function () {
    var on = root.getAttribute('data-night') !== '1';
    if (on) root.setAttribute('data-night', '1'); else root.removeAttribute('data-night');
    sset('night', on);
    toast(on ? 'Visión nocturna: conserva tu adaptación a la oscuridad' : 'Visión nocturna desactivada');
  });

  // ---------- Pantalla siempre encendida ----------
  var wakeLock = null, wakeWanted = 0, keepAwake = sget('awake', false);
  function wake(on) {
    wakeWanted += on ? 1 : -1; if (wakeWanted < 0) wakeWanted = 0;
    var need = wakeWanted > 0 || keepAwake;
    if (need && !wakeLock && navigator.wakeLock) navigator.wakeLock.request('screen').then(function (l) { wakeLock = l; l.addEventListener('release', function () { wakeLock = null; }); }).catch(function () {});
    if (!need && wakeLock) { wakeLock.release(); wakeLock = null; }
  }
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible' && (wakeWanted > 0 || keepAwake)) { wakeLock = null; wake(true); wake(false); } });

  // ---------- Fotos (IndexedDB) ----------
  var db = null;
  function openDB(cb) {
    if (db) return cb(db);
    try {
      var r = indexedDB.open('supervivencia', 1);
      r.onupgradeneeded = function () { r.result.createObjectStore('fotos'); };
      r.onsuccess = function () { db = r.result; cb(db); };
      r.onerror = function () { cb(null); };
    } catch (e) { cb(null); }
  }
  function photoGet(id, cb) { openDB(function (d) { if (!d) return cb(null); var q = d.transaction('fotos').objectStore('fotos').get(id); q.onsuccess = function () { cb(q.result || null); }; q.onerror = function () { cb(null); }; }); }
  function photoSet(id, data) { openDB(function (d) { if (d) d.transaction('fotos', 'readwrite').objectStore('fotos').put(data, id); }); }
  function photoDel(id) { openDB(function (d) { if (d) d.transaction('fotos', 'readwrite').objectStore('fotos').delete(id); }); }

  // ---------- Navegación ----------
  var TABS = [
    { id: 'manual', name: 'Manual', sym: 'books.vertical.fill' },
    { id: 'guia', name: 'Guía', sym: 'book.fill' },
    { id: 'silbato', name: 'Silbato', sym: 'megaphone.fill' },
    { id: 'sos', name: 'SOS', sym: 'exclamationmark.triangle.fill' },
    { id: 'brujula', name: 'Brújula', sym: 'safari.fill' }
  ];
  var tab = sget('tab', 'manual');
  var stacks = { manual: [{ s: 'home' }], guia: [{ s: 'home' }], silbato: [{ s: 'home' }], sos: [{ s: 'home' }], brujula: [{ s: 'home' }] };
  var scrolls = {};

  function renderTabs() {
    $('tabs').innerHTML = TABS.map(function (t) {
      return '<button data-tab="' + t.id + '" class="' + (t.id === tab ? 'on' : '') + '">' + ic(t.sym) + t.name + '</button>';
    }).join('');
  }
  $('tabs').addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b) return;
    unlockAudio();
    var t = b.getAttribute('data-tab');
    if (t === tab) { stacks[t] = [stacks[t][0]]; render(); window.scrollTo(0, 0); return; }
    go(t);
  });
  function go(t) {
    scrolls[tab] = window.scrollY;
    if (tab === 'silbato' && t !== 'silbato') W.shutdown();
    if (tab === 'sos' && t !== 'sos') W.shutdown();
    tab = t; sset('tab', t); renderTabs(); render();
    window.scrollTo(0, scrolls[t] || 0);
  }
  function push(screen) { scrolls[tab + stacks[tab].length] = window.scrollY; stacks[tab].push(screen); render(); window.scrollTo(0, 0); }
  function pop() {
    if (stacks[tab].length > 1) { stacks[tab].pop(); render(); window.scrollTo(0, scrolls[tab + stacks[tab].length] || 0); }
  }
  $('backBtn').addEventListener('click', pop);

  function render() {
    TABS.forEach(function (t) { $('v-' + t.id).className = 'view' + (t.id === tab ? ' on' : ''); });
    var st = stacks[tab], top = st[st.length - 1];
    $('backBtn').style.display = st.length > 1 ? '' : 'none';
    var title = 'Supervivencia<span>.</span>';
    var el = $('v-' + tab);
    if (tab === 'manual') {
      if (top.s === 'home') el.innerHTML = manualHome();
      else if (top.s === 'chapter') { var c = chapterById(top.id); title = esc(c.title); el.innerHTML = chapterView(c); }
      else if (top.s === 'topic') { var tp = findTopic(top.id); title = tp ? esc(tp.t.title) : ''; el.innerHTML = tp ? topicView(tp.t, tp.c) : '<p class="muted">Técnica eliminada.</p>'; afterTopic(tp && tp.t); }
      else if (top.s === 'guide') { var g = D.guide.filter(function (x) { return x.id === top.id; })[0]; title = esc(g.title); el.innerHTML = '<div class="card">' + blocks(g.blocks) + '</div>'; }
      if (top.s === 'home') { bindManualHome(); }
    } else if (tab === 'guia') { title = 'Guía rápida'; el.innerHTML = guideView(); }
    else if (tab === 'silbato') { title = 'Silbato'; el.innerHTML = whistleView(); W.bindFull(); }
    else if (tab === 'sos') { title = 'SOS'; el.innerHTML = sosView(); W.bindCompact(); startGPS(); }
    else if (tab === 'brujula') { title = 'Brújula y GPS'; el.innerHTML = compassView(); startGPS(); updateCompass(); }
    $('title').innerHTML = title;
  }

  // ---------- Contenido ----------
  function blocks(bs) {
    return (bs || []).map(function (b) {
      if (b.t === 'h') return '<div class="blk-h">' + md(b.s) + '</div>';
      if (b.t === 'p') return '<div class="blk-p">' + md(b.s) + '</div>';
      if (b.t === 'li') return '<div class="blk-li' + (/^\d/.test(b.s) ? ' n' : '') + '"><span>' + md(b.s) + '</span></div>';
      return '<div class="note ' + b.t + '">' + md(b.s) + '</div>';
    }).join('');
  }
  function diagram(id) {
    if (!id) return '';
    return '<div class="diagram"><img loading="lazy" src="img/' + id + '.webp" alt="' + esc(D.diagrams[id]) + '"></div><div class="cap">' + esc(D.diagrams[id]) + '</div>';
  }

  // Técnicas propias
  function customs() { return sget('tecnicas', []); }
  function customTopic(c) {
    var notes = [];
    if (c.warning) notes.push({ t: 'warn', s: c.warning });
    if (c.tip) notes.push({ t: 'tip', s: c.tip });
    return {
      id: c.id, title: c.title || 'Sin título', summary: c.summary || '', symbol: c.symbol || 'star.fill', level: c.level || 'Medio',
      materials: (c.materials || '').split(',').map(function (x) { return x.trim(); }).filter(Boolean),
      steps: (c.steps || []).filter(function (x) { return x.trim(); }).map(function (x) { return { text: x }; }),
      notes: notes, custom: c
    };
  }
  function chapters() {
    var cs = customs();
    var out = D.chapters.map(function (c) {
      return { id: c.id, title: c.title, subtitle: c.subtitle, symbol: c.symbol, tint: c.tint,
        topics: c.topics.concat(cs.filter(function (x) { return x.chapter === c.id; }).map(customTopic)) };
    });
    out.push({ id: 'propias', title: 'Mis técnicas', subtitle: 'lo que tú agregas', symbol: 'person.crop.circle.badge.plus', tint: '#2D7EA8',
      topics: cs.filter(function (x) { return x.chapter === 'propias'; }).map(customTopic) });
    return out;
  }
  function chapterById(id) { return chapters().filter(function (c) { return c.id === id; })[0]; }
  function findTopic(id) {
    var cs = chapters();
    for (var i = 0; i < cs.length; i++) for (var j = 0; j < cs[i].topics.length; j++) if (cs[i].topics[j].id === id) return { t: cs[i].topics[j], c: cs[i] };
    return null;
  }
  function topicCount() { return D.chapters.reduce(function (a, c) { return a + c.topics.length; }, 0); }

  // ---------- Búsqueda ----------
  var SYN = {
    potabilizar: ['purificar', 'desinfectar', 'hervir', 'filtro'], purificar: ['potabilizar', 'desinfectar', 'hervir'],
    fogata: ['fuego', 'hoguera'], hoguera: ['fuego'], encender: ['fuego', 'yesca'], prender: ['fuego', 'encender'],
    comer: ['comestible', 'alimento', 'comida'], comida: ['alimento', 'comestible'], planta: ['hoja', 'fruto', 'raiz'],
    veneno: ['toxica', 'toxico', 'venenosa', 'peligrosa'], venenoso: ['toxica', 'toxico', 'peligrosa'],
    herida: ['hemorragia', 'sangrado', 'vendaje'], sangre: ['hemorragia', 'sangrado'],
    cuerda: ['nudo', 'cordaje', 'amarre'], soga: ['nudo', 'cordaje'], amarrar: ['nudo', 'amarre'],
    casa: ['refugio'], carpa: ['refugio', 'lona'], dormir: ['refugio', 'cama'],
    norte: ['orientacion', 'brujula'], perdido: ['orientacion', 'stop', 'senal'],
    rescate: ['senal', 'sos', 'silbato'], frio: ['hipotermia', 'nieve'], calor: ['golpe de calor', 'desierto'],
    pescar: ['pesca', 'anzuelo'], cazar: ['trampa', 'lazo'], cuchillo: ['piedra', 'lasca'],
    hueso: ['fractura', 'ferula'], quebradura: ['fractura', 'ferula'], serpiente: ['mordedura', 'culebra'],
    arana: ['picadura', 'rincon'], rio: ['cruzar', 'corriente'], sed: ['agua'], espantar: ['ahuyentar', 'silbato'], ahuyentar: ['silbato', 'espantar']
  };
  function normc(ch) { return ch.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().charAt(0) || ch; }
  function norm(s) { s = String(s); var o = ''; for (var i = 0; i < s.length; i++) o += normc(s.charAt(i)); return o; }
  function terms(q) {
    return norm(q).split(/\s+/).filter(function (w) { return w.length > 1; }).map(function (w) { return [w].concat((SYN[w] || []).map(norm)); });
  }
  function topicText(t) {
    return [t.title, t.summary].concat(t.materials || [], (t.steps || []).map(function (s) { return s.text; }), (t.notes || []).map(function (n) { return n.s; })).join(' ');
  }
  function score(t, ts, extra) {
    if (!ts.length) return 0;
    var title = norm(t.title), sum = norm(t.summary), body = norm(topicText(t) + ' ' + (extra || ''));
    var total = 0;
    for (var i = 0; i < ts.length; i++) {
      var best = 0;
      for (var j = 0; j < ts[i].length; j++) {
        var w = ts[i][j], k = j === 0 ? 1 : 2;
        if (title.indexOf(w) >= 0) best = Math.max(best, 30 / k);
        else if (sum.indexOf(w) >= 0) best = Math.max(best, 12 / k);
        else if (body.indexOf(w) >= 0) best = Math.max(best, 5 / k);
      }
      if (!best) return 0;
      total += best;
    }
    return total;
  }
  function snippet(t, ts) {
    var src = (t.steps || []).map(function (s) { return s.text; }).concat((t.notes || []).map(function (n) { return n.s; }), t.materials || []);
    for (var i = 0; i < ts.length; i++) for (var j = 0; j < ts[i].length; j++) {
      var w = ts[i][j];
      if (norm(t.title).indexOf(w) >= 0 || norm(t.summary).indexOf(w) >= 0) return null;
      for (var k = 0; k < src.length; k++) if (norm(src[k]).indexOf(w) >= 0) { var c = plain(src[k]); return c.length > 150 ? c.slice(0, 150) + '…' : c; }
    }
    return null;
  }
  function highlight(s, ts) {
    var n = norm(s), mark = [];
    ts.forEach(function (alts) { alts.forEach(function (w) { var from = 0, p; while (w && (p = n.indexOf(w, from)) >= 0) { for (var i = p; i < p + w.length; i++) mark[i] = 1; from = p + w.length; } }); });
    var o = '', inM = false;
    for (var i = 0; i < s.length; i++) {
      if (mark[i] && !inM) { o += '<span class="hl">'; inM = true; }
      if (!mark[i] && inM) { o += '</span>'; inM = false; }
      o += esc(s.charAt(i));
    }
    return o + (inM ? '</span>' : '');
  }

  // ---------- Manual ----------
  var query = '', scope = 'Todo';
  var SUGG = ['fuego sin fósforos', 'potabilizar', 'as de guía', 'refugio nieve', 'comestibles', 'hongos', 'hemorragia', 'fractura', 'norte de noche', 'señales', 'trampa', 'cruzar río', 'hipotermia', 'cuchillo de piedra', 'espantar'];

  function topicRow(t, tint, chapterName, ts, snip) {
    var hasImg = t.diagram || (t.steps || []).some(function (s) { return s.diagram; });
    return '<button class="row tap" data-topic="' + esc(t.id) + '"><span class="badge" style="background-color:' + alpha(tint, 0.14) + '">' + ic(t.symbol, tint, 20) + '</span><span class="tx">' +
      (chapterName ? '<div class="kk" style="color:' + tint + '">' + esc(chapterName) + '</div>' : '') +
      '<div class="tt">' + (ts ? highlight(t.title, ts) : esc(t.title)) + '</div>' +
      (t.summary ? '<div class="ss">' + esc(plain(t.summary)) + '</div>' : '') +
      (snip ? '<div class="ss" style="margin-top:6px">' + highlight(snip, ts) + '</div>' : '') +
      '</span>' + (hasImg ? '<span class="faint">' + ic('photo', null, 16) + '</span>' : '') + '<span class="chev">›</span></button>';
  }

  function manualHome() {
    var h = '<div class="search">' + ic('magnifyingglass') + '<input id="q" type="search" placeholder="Buscar técnica, material, síntoma…" value="' + esc(query) + '" autocomplete="off" autocorrect="off"><button class="x" id="qx">✕</button></div>';
    h += '<div class="chips" id="scopes">' + ['Todo', 'Manual', 'Guía', 'Mías'].map(function (s) { return '<button class="chip' + (s === scope ? ' on' : '') + '" data-scope="' + s + '">' + s + '</button>'; }).join('') + '</div>';
    h += '<div id="mres">' + (query.trim() ? results() : homeBody()) + '</div>';
    return h;
  }
  function homeBody() {
    var rec = sget('recientes', []);
    var items = rec.length ? rec.concat(SUGG.slice(0, 6)) : SUGG;
    var h = '<div class="sec">' + (rec.length ? 'Búsquedas recientes' : 'Prueba buscar') + '</div><div class="chips">' + items.map(function (s) { return '<button class="chip" data-q="' + esc(s) + '">' + esc(s) + '</button>'; }).join('') + '</div>';
    h += '<div class="grid">';
    chapters().forEach(function (c) {
      if (!c.topics.length && c.id !== 'propias') return;
      h += '<button class="chap tap" data-chapter="' + c.id + '" style="border-color:' + alpha(c.tint, 0.4) + '"><span class="badge" style="background-color:' + alpha(c.tint, 0.15) + '">' + ic(c.symbol, c.tint, 24) + '</span><span class="t">' + esc(c.title) + '</span><span class="s">' + esc(c.subtitle) + '</span><span class="n" style="color:' + c.tint + '">' + c.topics.length + ' técnicas</span></button>';
    });
    h += '<button class="chap tap" data-gotab="silbato" style="border-color:' + alpha('#C9780F', 0.4) + '"><span class="badge" style="background-color:' + alpha('#C9780F', 0.15) + '">' + ic('megaphone.fill', '#C9780F', 24) + '</span><span class="t">Silbato</span><span class="s">frecuencias, ahuyentar animales</span><span class="n" style="color:#C9780F">abrir</span></button>';
    h += '</div>';
    var cs = customs();
    h += '<div class="card" style="margin-top:10px"><div class="ctitle"><span>Mis técnicas</span>' + cs.length + '</div>';
    if (!cs.length) h += '<div class="small muted">Agrega técnicas que aprendas: pasos, materiales, advertencias y una foto. Se guardan en este dispositivo y aparecen en el buscador.</div>';
    cs.slice().sort(function (a, b) { return b.date - a.date; }).forEach(function (c) { h += topicRow(customTopic(c), '#2D7EA8'); });
    h += '<button class="pill primary" data-new="propias">＋ Agregar técnica</button></div>';
    h += '<p class="xs faint" style="margin:10px 2px">Contenido de referencia basado en manuales de supervivencia y primeros auxilios reconocidos. No reemplaza formación práctica: ensaya las técnicas antes de necesitarlas. Funciona sin conexión.</p>';
    return h;
  }
  function results() {
    var ts = terms(query), hits = [];
    if (scope !== 'Guía') chapters().forEach(function (c) {
      c.topics.forEach(function (t) {
        if (scope === 'Mías' && !t.custom) return;
        if (scope === 'Manual' && t.custom) return;
        var s = score(t, ts, c.title + ' ' + c.subtitle);
        if (s) hits.push({ t: t, c: c, s: s });
      });
    });
    hits.sort(function (a, b) { return b.s - a.s; });
    var gh = (scope === 'Todo' || scope === 'Guía') ? D.guide.filter(function (g) { return score({ title: g.title, summary: g.subtitle, notes: g.blocks }, ts); }) : [];
    var n = hits.length + gh.length;
    var h = '<div class="sec">' + n + ' resultado' + (n === 1 ? '' : 's') + '</div>';
    hits.forEach(function (x) { h += topicRow(x.t, x.c.tint, x.c.title, ts, snippet(x.t, ts)); });
    if (gh.length) {
      h += '<div class="sec">En la guía rápida</div>';
      gh.forEach(function (g) { h += '<button class="row tap" data-guide="' + g.id + '"><span class="badge" style="background-color:' + alpha('#C9780F', 0.14) + '">' + ic(g.symbol, '#C9780F', 20) + '</span><span class="tx"><div class="kk" style="color:#C9780F">Guía</div><div class="tt">' + highlight(g.title, ts) + '</div><div class="ss">' + esc(g.subtitle) + '</div></span><span class="chev">›</span></button>'; });
    }
    if (!n) h += '<div style="text-align:center;padding:30px 0"><p class="muted">Sin resultados para “' + esc(query) + '”.</p><button class="pill primary" data-new="propias" data-title="' + esc(query) + '">＋ Agregar “' + esc(query) + '” como técnica</button></div>';
    return h;
  }
  function remember(q) {
    q = q.trim(); if (q.length < 2) return;
    var r = sget('recientes', []).filter(function (x) { return x.toLowerCase() !== q.toLowerCase(); });
    r.unshift(q); sset('recientes', r.slice(0, 8));
  }
  function bindManualHome() {
    var q = $('q'), qx = $('qx');
    qx.style.display = query ? 'block' : 'none';
    q.addEventListener('input', function () { query = q.value; qx.style.display = query ? 'block' : 'none'; $('mres').innerHTML = query.trim() ? results() : homeBody(); });
    q.addEventListener('keydown', function (e) { if (e.key === 'Enter') { remember(query); q.blur(); } });
    qx.addEventListener('click', function () { query = ''; q.value = ''; qx.style.display = 'none'; $('mres').innerHTML = homeBody(); });
  }

  function chapterView(c) {
    var h = '<p class="muted small" style="margin:4px 2px 12px">' + esc(c.subtitle) + '</p>';
    c.topics.forEach(function (t) { h += topicRow(t, c.tint); });
    h += '<button class="pill" data-new="' + c.id + '">＋ Agregar técnica a ' + esc(c.title) + '</button>';
    return h;
  }

  function topicView(t, c) {
    var tint = t.custom ? '#2D7EA8' : c.tint, h = '';
    if (t.custom && t.custom.hasPhoto) h += '<img class="photo" id="tphoto" alt="">';
    if (t.diagram) h += diagram(t.diagram);
    h += '<p style="font-size:17px;line-height:1.4;margin:6px 2px">' + md(t.summary) + '</p>';
    h += '<div class="badges"><span class="bdg" style="color:' + levelTint(t.level) + ';background-color:' + alpha(levelTint(t.level), 0.14) + '">' + esc(t.level) + '</span>' +
      (t.time ? '<span class="bdg" style="color:#2D7EA8;background-color:' + alpha('#2D7EA8', 0.14) + '">⏱ ' + esc(t.time) + '</span>' : '') +
      (t.custom ? '<span class="bdg" style="color:#2D7EA8;background-color:' + alpha('#2D7EA8', 0.14) + '">Mía</span>' : '') + '</div>';
    if (t.materials && t.materials.length) h += '<div class="card"><div class="ctitle"><span>Necesitas</span></div>' + t.materials.map(function (m) { return '<span class="mat" style="background-color:' + alpha(tint, 0.13) + '">' + esc(m) + '</span>'; }).join('') + '</div>';
    if (t.steps && t.steps.length) {
      h += '<div class="sec">Paso a paso</div>';
      t.steps.forEach(function (s, i) { h += '<div class="step"><div class="h"><span class="num" style="background-color:' + tint + '">' + (i + 1) + '</span><div class="blk-p" style="margin:2px 0">' + md(s.text) + '</div></div>' + (s.diagram ? '<div style="margin-top:10px">' + diagram(s.diagram) + '</div>' : '') + '</div>'; });
    }
    if (t.notes && t.notes.length) h += '<div style="margin-top:6px">' + blocks(t.notes) + '</div>';
    h += '<div class="prow"><button class="pill" data-share="' + esc(t.id) + '">Compartir</button>' + (t.custom ? '<button class="pill" data-edit="' + esc(t.id) + '">Editar</button><button class="pill" data-del="' + esc(t.id) + '" style="color:var(--danger)">Eliminar</button>' : '') + '</div>';
    return h;
  }
  function afterTopic(t) {
    if (t && t.custom && t.custom.hasPhoto) photoGet(t.id, function (d) { var im = $('tphoto'); if (im && d) im.src = d; });
  }
  function shareTopic(t) {
    var s = [t.title.toUpperCase(), plain(t.summary)];
    if (t.materials.length) s.push('Necesitas: ' + t.materials.join(', '));
    t.steps.forEach(function (x, i) { s.push((i + 1) + '. ' + plain(x.text)); });
    t.notes.forEach(function (n) { s.push('• ' + plain(n.s)); });
    share(s.join('\n'));
  }

  // Clicks del manual
  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-topic],[data-chapter],[data-guide],[data-q],[data-scope],[data-new],[data-edit],[data-del],[data-share],[data-gotab]');
    if (!b) return;
    if (b.hasAttribute('data-topic')) { if (query.trim()) remember(query); push({ s: 'topic', id: b.getAttribute('data-topic') }); }
    else if (b.hasAttribute('data-chapter')) push({ s: 'chapter', id: b.getAttribute('data-chapter') });
    else if (b.hasAttribute('data-guide')) push({ s: 'guide', id: b.getAttribute('data-guide') });
    else if (b.hasAttribute('data-q')) { query = b.getAttribute('data-q'); render(); }
    else if (b.hasAttribute('data-scope')) { scope = b.getAttribute('data-scope'); render(); }
    else if (b.hasAttribute('data-new')) editor({ id: uid(), chapter: b.getAttribute('data-new'), title: b.getAttribute('data-title') || '', summary: '', symbol: 'star.fill', level: 'Medio', materials: '', steps: [], warning: '', tip: '', hasPhoto: false });
    else if (b.hasAttribute('data-edit')) { var c = customs().filter(function (x) { return x.id === b.getAttribute('data-edit'); })[0]; if (c) editor(JSON.parse(JSON.stringify(c))); }
    else if (b.hasAttribute('data-del')) {
      if (confirm('¿Eliminar esta técnica?')) { var id = b.getAttribute('data-del'); sset('tecnicas', customs().filter(function (x) { return x.id !== id; })); photoDel(id); pop(); }
    }
    else if (b.hasAttribute('data-share')) { var f = findTopic(b.getAttribute('data-share')); if (f) shareTopic(f.t); }
    else if (b.hasAttribute('data-gotab')) go(b.getAttribute('data-gotab'));
  });

  // ---------- Editor de técnicas ----------
  var SYMS = ['star.fill', 'flame.fill', 'drop.fill', 'tent.fill', 'leaf.fill', 'lasso', 'hammer.fill', 'cross.case.fill', 'fish.fill', 'pawprint.fill', 'safari.fill', 'snowflake', 'sun.max.fill', 'mountain.2.fill', 'water.waves', 'bolt.fill'];
  function editor(c) {
    var isNew = !customs().some(function (x) { return x.id === c.id; });
    var newPhoto = null, removePhoto = false;
    var opts = '<option value="propias">Mis técnicas</option>' + D.chapters.map(function (ch) { return '<option value="' + ch.id + '"' + (ch.id === c.chapter ? ' selected' : '') + '>' + esc(ch.title) + '</option>'; }).join('');
    var sh = $('sheet');
    sh.innerHTML = '<div class="bar2"><button class="back" id="edCancel">Cancelar</button><h2>' + (isNew ? 'Nueva técnica' : 'Editar técnica') + '</h2><button class="back" id="edSave" style="font-weight:700">Guardar</button></div>' +
      '<div class="lbl2">Título</div><input id="edTitle" value="' + esc(c.title) + '">' +
      '<div class="lbl2">Resumen (para qué sirve)</div><textarea id="edSum" style="min-height:60px">' + esc(c.summary) + '</textarea>' +
      '<div class="lbl2">Capítulo</div><select id="edChap">' + opts + '</select>' +
      '<div class="lbl2">Dificultad</div><div class="seg" id="edLevel">' + ['Fácil', 'Medio', 'Difícil'].map(function (l) { return '<button data-l="' + l + '" class="' + (l === c.level ? 'on' : '') + '">' + l + '</button>'; }).join('') + '</div>' +
      '<div class="lbl2">Ícono</div><div class="chips" id="edSym">' + SYMS.map(function (s) { return '<button class="chip' + (s === c.symbol ? ' on' : '') + '" data-sym="' + s + '">' + ic(s, null, 20) + '</button>'; }).join('') + '</div>' +
      '<div class="lbl2">Foto o dibujo</div><img class="photo" id="edPh" style="display:none" alt=""><div class="prow" style="margin-top:-8px"><label class="pill" style="margin-top:8px">Elegir foto<input type="file" accept="image/*" id="edFile" style="display:none"></label><button class="pill" id="edNoPh" style="display:none;color:var(--danger)">Quitar foto</button></div>' +
      '<div class="lbl2">Materiales (separados por coma)</div><input id="edMat" placeholder="Ej: rama seca, cordel, piedra plana" value="' + esc(c.materials) + '">' +
      '<div class="lbl2">Pasos (uno por línea)</div><textarea id="edSteps" style="min-height:140px">' + esc((c.steps || []).join('\n')) + '</textarea>' +
      '<div class="lbl2">Advertencia</div><textarea id="edWarn" style="min-height:60px" placeholder="Peligros, cuándo no hacerlo">' + esc(c.warning) + '</textarea>' +
      '<div class="lbl2">Consejo</div><textarea id="edTip" style="min-height:60px">' + esc(c.tip) + '</textarea>';
    sh.className = 'sheet on'; sh.scrollTop = 0;
    var ph = $('edPh'), noPh = $('edNoPh');
    function showPh(src) { ph.src = src; ph.style.display = 'block'; noPh.style.display = 'block'; }
    if (c.hasPhoto) photoGet(c.id, function (d) { if (d) showPh(d); });
    $('edLevel').addEventListener('click', function (e) { var b = e.target.closest('button'); if (!b) return; c.level = b.getAttribute('data-l'); [].forEach.call(this.children, function (x) { x.className = x === b ? 'on' : ''; }); });
    $('edSym').addEventListener('click', function (e) { var b = e.target.closest('button'); if (!b) return; c.symbol = b.getAttribute('data-sym'); [].forEach.call(this.children, function (x) { x.className = 'chip' + (x === b ? ' on' : ''); }); });
    $('edFile').addEventListener('change', function () {
      var f = this.files && this.files[0]; if (!f) return;
      var r = new FileReader();
      r.onload = function () {
        var im = new Image();
        im.onload = function () {
          var k = Math.min(1, 1200 / Math.max(im.width, im.height)), cv = document.createElement('canvas');
          cv.width = Math.round(im.width * k); cv.height = Math.round(im.height * k);
          cv.getContext('2d').drawImage(im, 0, 0, cv.width, cv.height);
          newPhoto = cv.toDataURL('image/jpeg', 0.8); removePhoto = false; showPh(newPhoto);
        };
        im.src = r.result;
      };
      r.readAsDataURL(f);
    });
    noPh.addEventListener('click', function () { newPhoto = null; removePhoto = true; ph.style.display = 'none'; noPh.style.display = 'none'; });
    $('edCancel').addEventListener('click', function () { sh.className = 'sheet'; });
    $('edSave').addEventListener('click', function () {
      c.title = $('edTitle').value.trim();
      if (!c.title) { toast('Escribe un título'); return; }
      c.summary = $('edSum').value.trim(); c.chapter = $('edChap').value; c.materials = $('edMat').value;
      c.steps = $('edSteps').value.split('\n').map(function (x) { return x.trim(); }).filter(Boolean);
      c.warning = $('edWarn').value.trim(); c.tip = $('edTip').value.trim(); c.date = Date.now();
      if (newPhoto) { photoSet(c.id, newPhoto); c.hasPhoto = true; }
      if (removePhoto) { photoDel(c.id); c.hasPhoto = false; }
      var all = customs().filter(function (x) { return x.id !== c.id; }); all.push(c); sset('tecnicas', all);
      sh.className = 'sheet'; toast('Técnica guardada');
      if (isNew) { if (tab !== 'manual') go('manual'); push({ s: 'topic', id: c.id }); } else render();
    });
  }

  // ---------- Guía rápida ----------
  var gquery = '', gopen = {};
  function guideView() {
    var h = '<div class="grid" style="margin-bottom:6px"><button class="chap tap" data-gotab="manual" style="min-height:110px;background-color:' + alpha('#4C7D38', 0.12) + ';border-color:' + alpha('#4C7D38', 0.45) + '">' + ic('books.vertical.fill', '#4C7D38', 26) + '<span class="t" style="margin-top:6px">Manual visual</span><span class="s">' + topicCount() + ' técnicas con dibujos</span></button>' +
      '<button class="chap tap" data-gotab="silbato" style="min-height:110px;background-color:' + alpha('#C9780F', 0.12) + ';border-color:' + alpha('#C9780F', 0.45) + '">' + ic('megaphone.fill', '#C9780F', 26) + '<span class="t" style="margin-top:6px">Silbato</span><span class="s">frecuencias y patrones</span></button></div>';
    h += '<div class="search">' + ic('magnifyingglass') + '<input id="gq" type="search" placeholder="Agua, hipotermia, fuego…" value="' + esc(gquery) + '"></div><div id="glist">' + guideList() + '</div>';
    h += kitCard();
    h += '<p class="xs faint" style="margin:10px 2px">La guía no reemplaza formación ni atención profesional.</p>';
    setTimeout(function () {
      var g = $('gq'); if (!g) return;
      g.addEventListener('input', function () { gquery = g.value; $('glist').innerHTML = guideList(); });
    }, 0);
    return h;
  }
  function guideList() {
    var q = norm(gquery.trim());
    var list = D.guide.filter(function (s) { return !q || norm(s.title + ' ' + s.subtitle + ' ' + s.blocks.map(function (b) { return b.s; }).join(' ')).indexOf(q) >= 0; });
    if (!list.length) return '<p class="muted" style="padding:16px">Sin resultados.</p>';
    return list.map(function (s) {
      var open = gopen[s.id] || !!q;
      return '<div class="card acc' + (open ? ' open' : '') + '" style="padding:0"><button class="row" data-acc="' + s.id + '" style="border:0;margin:0;background:none"><span class="badge" style="background-color:var(--surface2)">' + ic(s.symbol, '#C9780F', 20) + '</span><span class="tx"><div class="tt">' + esc(s.title) + '</div><div class="ss">' + esc(s.subtitle) + '</div></span><span class="chev rot">›</span></button><div class="body" style="padding:0 16px 14px">' + blocks(s.blocks) + '</div></div>';
    }).join('');
  }
  function kitCard() {
    var kit = sget('kit', []);
    var h = '<div class="card" id="kitCard" style="margin-top:8px"><div class="ctitle"><span>Mi kit de supervivencia</span>' + kit.length + ' / ' + D.kit.length + '</div><div class="bar"><div style="width:' + (kit.length / D.kit.length * 100) + '%"></div></div>';
    D.kit.forEach(function (k, i) { var on = kit.indexOf(i) >= 0; h += '<button class="check' + (on ? ' on' : '') + '" data-kit="' + i + '"><span class="box"></span><span>' + esc(k) + '</span></button>'; });
    return h + '<button class="pill" data-kitreset="1">Desmarcar todo</button></div>';
  }
  document.addEventListener('click', function (e) {
    var a = e.target.closest('[data-acc]');
    if (a) { var id = a.getAttribute('data-acc'); gopen[id] = !gopen[id]; a.parentNode.className = 'card acc' + (gopen[id] ? ' open' : ''); return; }
    var k = e.target.closest('[data-kit],[data-kitreset]');
    if (k) {
      var kit = sget('kit', []);
      if (k.hasAttribute('data-kitreset')) kit = [];
      else { var i = +k.getAttribute('data-kit'), p = kit.indexOf(i); if (p >= 0) kit.splice(p, 1); else kit.push(i); }
      sset('kit', kit); $('kitCard').outerHTML = kitCard();
    }
  });

  // ---------- Audio ----------
  var AC = null;
  function unlockAudio() {
    try {
      if (navigator.audioSession) navigator.audioSession.type = 'playback'; // suena aunque el iPhone esté en silencio (iOS 17+)
      if (!AC) AC = new (window.AudioContext || window.webkitAudioContext)();
      if (AC.state === 'suspended') AC.resume();
    } catch (e) {}
  }
  document.addEventListener('touchend', unlockAudio, true);
  document.addEventListener('click', unlockAudio, true);

  function morseSteps(text, u) {
    var T = { A: '.-', B: '-...', C: '-.-.', D: '-..', E: '.', F: '..-.', G: '--.', H: '....', I: '..', J: '.---', K: '-.-', L: '.-..', M: '--', N: '-.', 'Ñ': '--.--', O: '---', P: '.--.', Q: '--.-', R: '.-.', S: '...', T: '-', U: '..-', V: '...-', W: '.--', X: '-..-', Y: '-.--', Z: '--..',
      '0': '-----', '1': '.----', '2': '..---', '3': '...--', '4': '....-', '5': '.....', '6': '-....', '7': '--...', '8': '---..', '9': '----.', '.': '.-.-.-', ',': '--..--', '?': '..--..', '/': '-..-.' };
    var s = String(text).toUpperCase().replace(/[ÁÀ]/g, 'A').replace(/[ÉÈ]/g, 'E').replace(/[ÍÌ]/g, 'I').replace(/[ÓÒ]/g, 'O').replace(/[ÚÜÙ]/g, 'U'), st = [];
    for (var i = 0; i < s.length; i++) {
      var c = s.charAt(i);
      if (c === ' ') { st.push([false, 4 * u]); continue; }
      var code = T[c]; if (!code) continue;
      for (var j = 0; j < code.length; j++) { st.push([true, code.charAt(j) === '.' ? u : 3 * u]); st.push([false, u]); }
      st.push([false, 2 * u]);
    }
    st.push([false, 4 * u]);
    return st.length > 1 ? st : [[false, 1]];
  }
  function morseCode(text) {
    var T = { A: '.-', B: '-...', C: '-.-.', D: '-..', E: '.', F: '..-.', G: '--.', H: '....', I: '..', J: '.---', K: '-.-', L: '.-..', M: '--', N: '-.', O: '---', P: '.--.', Q: '--.-', R: '.-.', S: '...', T: '-', U: '..-', V: '...-', W: '.--', X: '-..-', Y: '-.--', Z: '--..' };
    return String(text).toUpperCase().split('').map(function (c) { return c === ' ' ? '/' : (T[c] || ''); }).filter(Boolean).join(' ').replace(/\./g, '·').replace(/-/g, '—');
  }

  // ---------- Silbato ----------
  var PATTERNS = {
    'Continuo': null,
    '3 pitidos': [[true, 1], [false, 0.5], [true, 1], [false, 0.5], [true, 1], [false, 3]],
    'SOS': morseSteps('SOS', 0.2),
    'Alpina': (function () { var a = []; for (var i = 0; i < 6; i++) { a.push([true, 2]); a.push([false, 8]); } a.push([false, 60]); return a; }())
  };
  var PTEXT = {
    'Continuo': 'Suena mientras mantienes presionado (o fijado).',
    '3 pitidos': '3 pitidos largos y pausa: señal internacional de socorro. Respuesta: 2 pitidos.',
    'SOS': '· · · — — — · · · en Morse, en bucle.',
    'Alpina': 'Señal alpina: 6 pitidos por minuto (uno cada 10 s) y 1 minuto de pausa. Respuesta: 3 por minuto.'
  };
  var W = {
    preset: null, custom: null, pattern: 'Continuo', pressing: false, locked: false, open: null,
    osc: null, gain: null, timer: null, t0: 0,
    all: function () { return D.whistle.signal.concat(D.whistle.repel); },
    sounding: function () { return this.pressing || this.locked; },
    freq: function () { return this.custom || this.preset.freq; },
    update: function () {
      var on = this.sounding();
      if (on) { unlockAudio(); if (flash) stopFlash(true); this.start(); }
      else this.stop();
      this.paint();
    },
    start: function () {
      if (!AC || this.timer) return;
      var self = this, p = this.preset, f0 = this.freq();
      this.osc = AC.createOscillator(); this.gain = AC.createGain();
      this.osc.type = f0 > 6000 ? 'sine' : 'square';
      this.osc.frequency.value = f0; this.gain.gain.value = 0;
      this.osc.connect(this.gain); this.gain.connect(AC.destination); this.osc.start();
      this.t0 = AC.currentTime;
      wake(true);
      this.timer = setInterval(function () {
        var now = AC.currentTime, t = now - self.t0, f = self.freq();
        if (!self.custom && p.sweep !== 'none') {
          if (p.sweep === 'wail') f = p.low + (p.high - p.low) * (0.5 - 0.5 * Math.cos(2 * Math.PI * t / 3));
          else if (p.sweep === 'yelp') f = p.low + (p.high - p.low) * ((t / 0.22) % 1);
          else f = ((t / 1.1) % 1) < 0.5 ? p.high : p.low;
        }
        var on = true, st = PATTERNS[self.pattern];
        if (st) {
          var tot = 0, i; for (i = 0; i < st.length; i++) tot += st[i][1];
          var pos = t % tot;
          for (i = 0; i < st.length; i++) { if (pos < st[i][1]) { on = st[i][0]; break; } pos -= st[i][1]; }
        }
        self.osc.frequency.setTargetAtTime(f, now, 0.002);
        self.gain.gain.setTargetAtTime(on ? (self.osc.type === 'square' ? 0.5 : 0.9) : 0, now, 0.005);
      }, 15);
    },
    stop: function () {
      if (!this.timer) return;
      clearInterval(this.timer); this.timer = null;
      var o = this.osc, g = this.gain;
      try { g.gain.setTargetAtTime(0, AC.currentTime, 0.01); setTimeout(function () { try { o.stop(); o.disconnect(); } catch (e) {} }, 80); } catch (e) {}
      this.osc = null; wake(false);
    },
    restart: function () { if (this.timer) { this.stop(); this.start(); } },
    shutdown: function () { this.pressing = false; this.locked = false; this.stop(); },
    paint: function () {
      var on = this.sounding();
      [].forEach.call(document.querySelectorAll('.hold'), function (b) {
        b.className = 'hold' + (b.classList.contains('sm') ? ' sm' : '') + (on ? ' on' : '');
        b.querySelector('.lbl').innerHTML = on ? (W.locked ? 'SONANDO<br>fijado' : 'SONANDO') : 'MANTÉN<br>PRESIONADO';
      });
      [].forEach.call(document.querySelectorAll('[data-lock]'), function (s) { s.className = 'switch' + (W.locked ? ' on' : ''); });
    },
    setPreset: function (p) { this.custom = null; this.preset = p; sset('preset', p.id); this.restart(); },
    holdHTML: function (sm) {
      return '<button class="hold' + (sm ? ' sm' : '') + (this.sounding() ? ' on' : '') + '" aria-label="Silbato, mantén presionado">' + ic(this.sounding() ? 'speaker.wave.3.fill' : 'hand.point.up.left.fill') + '<span class="lbl">MANTÉN<br>PRESIONADO</span></button>';
    },
    bindHold: function () {
      var self = this;
      [].forEach.call(document.querySelectorAll('.hold'), function (b) {
        function down(e) { e.preventDefault(); if (self.custom === null && self.preset.infoOnly) return; self.pressing = true; self.update(); }
        function up(e) { if (e) e.preventDefault(); if (!self.pressing) return; self.pressing = false; self.update(); }
        b.addEventListener('touchstart', down, { passive: false });
        b.addEventListener('touchend', up); b.addEventListener('touchcancel', up);
        b.addEventListener('mousedown', down); b.addEventListener('mouseup', up); b.addEventListener('mouseleave', up);
        b.addEventListener('contextmenu', function (e) { e.preventDefault(); });
      });
      [].forEach.call(document.querySelectorAll('[data-lock]'), function (s) {
        s.addEventListener('click', function () { if (self.custom === null && self.preset.infoOnly) return; self.locked = !self.locked; self.update(); });
      });
      this.paint();
    },
    bindFull: function () {
      var self = this;
      this.bindHold();
      $('wPat').addEventListener('click', function (e) { var b = e.target.closest('button'); if (!b) return; self.pattern = b.getAttribute('data-p'); render(); });
      var sl = $('wFree');
      sl.addEventListener('input', function () { self.custom = Math.round(Math.pow(10, +sl.value) / 10) * 10; $('wHead').innerHTML = self.head(); $('wFreeV').textContent = hz(self.custom); });
      sl.addEventListener('change', function () { self.restart(); render(); });
    },
    bindCompact: function () {
      var self = this;
      this.bindHold();
      $('wSel').addEventListener('change', function () { var id = this.value; self.setPreset(self.all().filter(function (p) { return p.id === id; })[0]); render(); });
      $('wPatSel').addEventListener('change', function () { self.pattern = this.value; });
    },
    head: function () {
      var p = this.preset, f = this.freq();
      return '<div style="text-align:center;font-weight:600">' + (this.custom ? 'Frecuencia libre' : esc(p.name)) + '</div><div class="big" style="color:' + (this.custom ? 'var(--accent)' : p.tint) + '">' + (this.custom ? hz(this.custom) : esc(p.range)) + '</div>' +
        ((this.custom || p.sweep === 'none') && !p.infoOnly ? '<div class="small muted" style="text-align:center">longitud de onda ' + (343 / f).toFixed(2).replace('.', ',') + ' m</div>' : '');
    }
  };

  function presetCard(p) {
    var sel = !W.custom && W.preset.id === p.id, open = W.open === p.id;
    return '<div class="preset' + (sel ? ' sel' : '') + (open ? ' open' : '') + '" style="' + (sel ? 'border-color:' + p.tint + ';background-color:' + alpha(p.tint, 0.1) : '') + '"><button class="lrow" data-preset="' + p.id + '" style="width:100%;text-align:left">' +
      '<span class="badge" style="width:38px;height:38px;border-radius:11px;display:-webkit-flex;display:flex;-webkit-align-items:center;align-items:center;-webkit-justify-content:center;justify-content:center;margin-right:12px;background-color:' + alpha(p.tint, 0.15) + '">' + ic(p.symbol, p.tint, 19) + '</span>' +
      '<span class="grow"><b style="font-size:15px">' + esc(p.name) + '</b> <span style="font-size:12px;font-weight:700;color:' + p.tint + '">' + esc(p.range) + '</span><div class="small muted">' + esc(p.use) + '</div></span>' +
      '<span style="color:' + (sel ? 'var(--accent)' : 'var(--faint)') + ';font-size:20px;margin-left:6px">' + (sel ? '●' : '○') + '</span></button>' +
      '<div class="d"><span class="tag" style="color:' + p.tint + ';background-color:' + alpha(p.tint, 0.18) + '">' + esc(p.band) + '</span>' +
      (p.evidence ? '<span class="tag" style="color:' + p.evidenceTint + ';background-color:' + alpha(p.evidenceTint, 0.15) + '">' + esc(p.evidence) + '</span>' : '') +
      (p.infoOnly ? '<span class="tag" style="color:#D23B38;background-color:' + alpha('#D23B38', 0.15) + '">No reproducible en el teléfono</span>' : '') +
      '<div>' + md(p.detail) + '</div></div></div>';
  }
  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-preset]'); if (!b) return;
    var id = b.getAttribute('data-preset'), p = W.all().filter(function (x) { return x.id === id; })[0];
    W.open = W.open === id ? null : id;
    W.setPreset(p);
    if (p.infoOnly) W.shutdown();
    render();
  });

  function spectrum() {
    var lo = 0, hi = Math.log(200000) / Math.LN10, w = 320;
    function x(f) { return ((Math.log(f) / Math.LN10 - lo) / (hi - lo)) * w; }
    var s = '<svg viewBox="0 0 320 120" style="width:100%;height:auto;display:block" font-family="-apple-system,sans-serif">';
    [[1, 20, '#6FB3D9', 'Infra'], [20, 20000, '#F0A53A', 'Audible humano'], [20000, 200000, '#EF5350', 'Ultra']].forEach(function (b) {
      s += '<rect x="' + x(b[0]) + '" y="2" width="' + (x(b[1]) - x(b[0])) + '" height="22" fill="' + b[2] + '" opacity=".45"/><text x="' + (x(b[0]) + x(b[1])) / 2 + '" y="17" font-size="10" font-weight="700" text-anchor="middle" fill="currentColor">' + b[3] + '</text>';
    });
    [[400, 19000, 'iPhone / iPad', '#4C7D38'], [2000, 5000, 'oído + sensible', '#888'], [14, 12000, 'elefante', '#888'], [67, 45000, 'perro', '#888'], [20000, 120000, 'murciélago', '#888']].forEach(function (r, i) {
      var y = 36 + i * 14, right = x(r[1]) + 4 > 260;
      s += '<line x1="' + x(r[0]) + '" y1="' + y + '" x2="' + x(r[1]) + '" y2="' + y + '" stroke="' + r[3] + '" stroke-width="' + (i ? 3 : 5) + '" stroke-linecap="round"/>' +
        '<text x="' + (right ? x(r[0]) - 4 : x(r[1]) + 4) + '" y="' + (y + 3) + '" font-size="9" text-anchor="' + (right ? 'end' : 'start') + '" fill="' + r[3] + '">' + r[2] + '</text>';
    });
    [10, 100, 1000, 10000, 100000].forEach(function (f) { s += '<text x="' + x(f) + '" y="116" font-size="8" text-anchor="middle" fill="#9AA39E">' + hz(f) + '</text>'; });
    if (!W.preset.infoOnly || W.custom) s += '<line x1="' + x(W.freq() || 1000) + '" y1="0" x2="' + x(W.freq() || 1000) + '" y2="106" stroke="currentColor" stroke-width="1.5" stroke-dasharray="4 3"/>';
    return s + '</svg>';
  }

  function whistleView() {
    var dis = !W.custom && W.preset.infoOnly;
    var h = '<div id="wHead">' + W.head() + '</div><div style="' + (dis ? 'opacity:.4' : '') + '">' + W.holdHTML(false) + '</div>';
    h += '<div class="card"><div class="lrow"><span class="grow" style="font-weight:600">' + ic('lock.fill', null, 16) + ' Fijar: sonar sin mantener presionado</span><button class="switch" data-lock="1" aria-label="Fijar"></button></div>' +
      '<div class="seg" id="wPat">' + Object.keys(PATTERNS).map(function (k) { return '<button data-p="' + k + '" class="' + (k === W.pattern ? 'on' : '') + '">' + k + '</button>'; }).join('') + '</div>' +
      '<div class="xs muted" style="margin-top:8px">' + PTEXT[W.pattern] + '</div><div class="xs muted" style="margin-top:8px">Sube el volumen con los botones laterales. En iOS 17 o posterior suena aunque el interruptor de silencio esté activado.</div></div>';
    h += '<div class="card"><div class="ctitle"><span>Espectro del sonido</span></div>' + spectrum() + '</div>';
    h += '<div class="sec">Frecuencias y para qué sirven</div>' + D.whistle.signal.map(presetCard).join('');
    h += '<div class="sec">Ahuyentar animales e insectos</div><p class="xs muted" style="margin:0 2px 8px">Cada tono indica lo que dice la evidencia. Que un sonido no funcione no es falla de la app: es lo que muestran los estudios.</p>' + D.whistle.repel.map(presetCard).join('');
    var mx = Math.log(19500) / Math.LN10;
    h += '<div class="card"><div class="ctitle"><span>Frecuencia libre</span><b id="wFreeV" style="color:var(--accent)">' + (W.custom ? hz(W.custom) : 'desactivada') + '</b></div><input type="range" id="wFree" min="' + (Math.log(20) / Math.LN10) + '" max="' + mx + '" step="0.001" value="' + Math.log(W.custom || 3150) / Math.LN10 + '"><div class="lrow xs faint"><span class="grow">20 Hz</span><span>19,5 kHz</span></div><div class="xs muted" style="margin-top:6px">Bajo ~300 Hz el parlante casi no suena; el rango útil va de ~400 Hz a ~19 kHz.</div></div>';
    h += '<div class="card"><div class="ctitle"><span>Para que se oiga más lejos</span></div>' + [
      'Volumen al máximo y sin fundas que tapen el parlante; apunta el **borde inferior** hacia donde esperas al rescatista.',
      'Sube a un punto alto y despejado. Un valle, una pared de roca o el agua devuelven el sonido.',
      'De noche y con aire frío el sonido viaja más lejos que a pleno sol.',
      'Pita en grupos de **3** y escucha entre series: la respuesta estándar son 2 pitidos.',
      'Un silbato físico sin bolita llega a ~120 dB y no gasta batería; el teléfono suena menos. Úsalo cuando no tengas otro.'
    ].map(function (t) { return '<div class="blk-li"><span>' + md(t) + '</span></div>'; }).join('') + '</div>';
    return h;
  }

  // ---------- Destellos (SOS, estroboscopio, luz) ----------
  var flash = null;
  function startFlash(mode, text) {
    stopFlash(true); W.shutdown(); unlockAudio();
    var ov = $('overlay'), lbl = $('ovLbl'), red = mode === 'red', steps = null, tone = false, f = 1200;
    if (mode === 'sos') { steps = morseSteps('SOS', 0.22); tone = true; lbl.textContent = 'SOS  · · · — — — · · ·  — toca para detener'; }
    else if (mode === 'morse') { steps = morseSteps(text, 0.2); tone = true; f = 880; lbl.textContent = text.toUpperCase() + ' — toca para detener'; }
    else if (mode === 'strobe') { steps = [[true, 0.08], [false, 0.42]]; lbl.textContent = 'Estroboscopio — toca para detener'; }
    else lbl.textContent = (red ? 'Luz roja' : 'Luz blanca') + ' — toca para detener';
    ov.style.display = 'block'; wake(true);
    flash = { timer: null, osc: null, gain: null, mode: mode };
    if (tone && AC) {
      flash.osc = AC.createOscillator(); flash.gain = AC.createGain(); flash.osc.type = 'square'; flash.osc.frequency.value = f; flash.gain.gain.value = 0;
      flash.osc.connect(flash.gain); flash.gain.connect(AC.destination); flash.osc.start();
    }
    function set(on) { ov.style.backgroundColor = on ? (red ? '#FF0000' : '#FFFFFF') : '#000000'; if (flash.gain) flash.gain.gain.setTargetAtTime(on ? 0.5 : 0, AC.currentTime, 0.004); }
    if (!steps) { set(true); return; }
    var i = 0;
    (function tick() { if (!flash) return; set(steps[i][0]); flash.timer = setTimeout(tick, steps[i][1] * 1000); i = (i + 1) % steps.length; }());
  }
  function stopFlash(noRender) {
    if (!flash) return;
    clearTimeout(flash.timer);
    if (flash.osc) { try { flash.osc.stop(); flash.osc.disconnect(); } catch (e) {} }
    flash = null; $('overlay').style.display = 'none'; wake(false);
    if (tab === 'sos' && !noRender) render();
  }
  $('overlay').addEventListener('click', function () { stopFlash(); });

  // ---------- SOS ----------
  var med = sget('ficha', {});
  var MEDF = [['name', 'Nombre'], ['dob', 'Nacimiento'], ['doc', 'RUT / documento'], ['blood', 'Grupo sanguíneo'], ['allergies', 'Alergias'], ['conditions', 'Enfermedades'], ['meds', 'Medicamentos'], ['c1n', 'Contacto 1 (nombre)'], ['c1p', 'Contacto 1 (teléfono)'], ['c2n', 'Contacto 2 (nombre)'], ['c2p', 'Contacto 2 (teléfono)'], ['notes', 'Notas']];
  function sosMessage() {
    var l = ['SOS — NECESITO AYUDA'];
    if (med.name) l.push('Nombre: ' + med.name);
    if (pos) {
      var c = pos.coords;
      l.push('Ubicación: ' + c.latitude.toFixed(5) + ', ' + c.longitude.toFixed(5) + ' (±' + Math.round(c.accuracy) + ' m)');
      l.push('UTM: ' + utmText(c.latitude, c.longitude));
      if (c.altitude != null) l.push('Altitud: ' + Math.round(c.altitude) + ' m');
      l.push('Mapa: https://maps.apple.com/?ll=' + c.latitude.toFixed(5) + ',' + c.longitude.toFixed(5) + '&q=SOS');
    } else l.push('Ubicación: sin señal GPS');
    var hs = [med.blood ? 'grupo ' + med.blood : '', med.allergies ? 'alergias: ' + med.allergies : '', med.conditions || ''].filter(Boolean);
    if (hs.length) l.push('Salud: ' + hs.join(' · '));
    l.push('Hora: ' + new Date().toLocaleString('es-CL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }));
    return l.join('\n');
  }
  function sosView() {
    var on = function (m) { return flash && flash.mode === m ? ' on' : ''; };
    var h = '<button class="sosbtn" data-flash="sos"><b>SOS</b><span class="xs" style="font-weight:600">pantalla + sonido</span></button>';
    h += '<div class="grid tools">' +
      tool('strobe', 'Estroboscopio', 'baliza con la pantalla', 'bolt.fill') +
      '<button class="tool tap" data-whistle3="1">' + ic('speaker.wave.3.fill') + '<div style="font-weight:600">Silbato</div><div class="xs muted">3 pitidos de socorro</div></button>' +
      tool('red', 'Luz roja', 'pantalla, no ciega', 'light.max') +
      tool('white', 'Pantalla blanca', 'linterna de pantalla', 'iphone.gen3') +
      '<button class="tool tap" data-morse="1">' + ic('ellipsis.bubble.fill') + '<div style="font-weight:600">Morse</div><div class="xs muted">mensaje propio</div></button>' +
      '<button class="tool tap' + (keepAwake ? ' on' : '') + '" data-awake="1">' + ic('sun.max.fill') + '<div style="font-weight:600">Pantalla activa</div><div class="xs muted">' + (keepAwake ? 'no se apaga' : 'se bloquea normal') + '</div></button></div>';
    h += '<p class="xs muted" style="margin:6px 2px 10px">El navegador no puede encender el flash del teléfono: usa la pantalla al máximo brillo o la app Vigía.</p>';
    // Silbato compacto
    var opt = function (p) { return '<option value="' + p.id + '"' + (!W.custom && W.preset.id === p.id ? ' selected' : '') + '>' + esc(p.name) + ' · ' + esc(p.range) + '</option>'; };
    h += '<div class="card"><div class="ctitle"><span>Silbato</span>' + esc(W.preset.range) + '</div>' +
      '<select id="wSel"><optgroup label="Señales y rescate">' + D.whistle.signal.filter(function (p) { return !p.infoOnly; }).map(opt).join('') + '</optgroup><optgroup label="Ahuyentar animales e insectos">' + D.whistle.repel.map(opt).join('') + '</optgroup></select>' +
      '<div class="lrow" style="margin-top:12px">' + W.holdHTML(true) + '<div class="grow" style="margin-left:14px"><div class="lrow"><span class="grow" style="font-weight:600">Fijar</span><button class="switch" data-lock="1"></button></div>' +
      '<select id="wPatSel" style="margin-top:10px">' + Object.keys(PATTERNS).map(function (k) { return '<option' + (k === W.pattern ? ' selected' : '') + '>' + k + '</option>'; }).join('') + '</select></div></div>' +
      '<div class="small" style="margin-top:10px">' + md(W.preset.use) + '</div>' +
      (W.preset.evidence ? '<span class="tag" style="margin-top:6px;color:' + W.preset.evidenceTint + ';background-color:' + alpha(W.preset.evidenceTint, 0.15) + '">' + esc(W.preset.evidence) + '</span>' : '') +
      '<button class="pill" data-gotab="silbato">Todas las frecuencias y qué dice la evidencia</button></div>';
    h += '<div class="card"><div class="ctitle"><span>Mensaje de emergencia</span></div><div class="mono" id="sosMsg">' + esc(sosMessage()) + '</div>' +
      '<div class="prow"><button class="pill danger" data-msg="share">Compartir</button><button class="pill" data-msg="sms">SMS</button><button class="pill" data-msg="copy">Copiar</button></div>' +
      '<p class="xs muted" style="margin-top:8px">El SMS sale con muy poca señal. iPhone 14 o posterior: sin cobertura usa <b>Emergencia SOS vía satélite</b> llamando al 112.</p></div>';
    h += '<div class="card"><div class="ctitle"><span>Números de emergencia (Chile)</span></div><div class="prow">' +
      [['131', 'Ambulancia'], ['132', 'Bomberos'], ['133', 'Carabineros'], ['112', 'Internacional']].map(function (n) { return '<a class="pill" style="text-decoration:none;color:inherit" href="tel:' + n[0] + '"><b style="font-size:20px">' + n[0] + '</b><div class="xs muted">' + n[1] + '</div></a>'; }).join('') + '</div></div>';
    h += '<div class="card"><div class="ctitle"><span>Ficha médica</span></div>';
    var filled = MEDF.filter(function (f) { return med[f[0]]; });
    if (!filled.length) h += '<p class="small muted">Completa tu ficha: los rescatistas la verán aquí y se incluye en el mensaje de emergencia.</p>';
    filled.forEach(function (f) { h += '<div class="lrow small" style="padding:4px 0"><span class="grow muted">' + f[1] + '</span><b style="-webkit-user-select:text;user-select:text;text-align:right">' + esc(med[f[0]]) + '</b></div>'; });
    h += '<button class="pill" data-med="1">' + (filled.length ? 'Editar ficha' : 'Completar ficha') + '</button></div>';
    h += '<div class="card"><div class="ctitle"><span>Señales tierra-aire</span></div><div class="sig">' +
      [['V', 'necesito ayuda'], ['X', 'ayuda médica'], ['N', 'no'], ['Y', 'sí'], ['↑', 'voy en esta dirección'], ['SOS', 'socorro'], ['LL', 'todo bien'], ['□', 'necesito mapa y brújula']].map(function (s) { return '<div><b>' + s[0] + '</b>' + s[1] + '</div>'; }).join('') +
      '</div><p class="xs muted" style="margin-top:8px">Letras de <b>≥3 m</b> de alto con gran contraste. Brazos en <b>Y</b> = necesito ayuda; un brazo arriba y otro abajo = no necesito.</p></div>';
    return h;
    function tool(m, t, s, sym) { return '<button class="tool tap' + on(m) + '" data-flash="' + m + '">' + ic(sym) + '<div style="font-weight:600">' + t + '</div><div class="xs muted">' + s + '</div></button>'; }
  }
  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-flash],[data-morse],[data-awake],[data-msg],[data-med],[data-whistle3]'); if (!b) return;
    if (b.hasAttribute('data-flash')) startFlash(b.getAttribute('data-flash'));
    else if (b.hasAttribute('data-morse')) { var t = prompt('Mensaje en Morse (letras y números):', sget('morse', 'SOS')); if (t) { sset('morse', t); startFlash('morse', t); toast(morseCode(t)); } }
    else if (b.hasAttribute('data-awake')) { keepAwake = !keepAwake; sset('awake', keepAwake); wake(true); wake(false); if (keepAwake && !navigator.wakeLock) toast('Este Safari no permite mantener la pantalla encendida'); render(); }
    else if (b.hasAttribute('data-whistle3')) {
      var p = D.whistle.signal.filter(function (x) { return x.id === 'socorro'; })[0];
      if (W.locked && W.pattern === '3 pitidos' && W.preset.id === 'socorro') { W.shutdown(); }
      else { W.setPreset(p); W.pattern = '3 pitidos'; W.locked = true; W.update(); }
      render();
    }
    else if (b.hasAttribute('data-msg')) {
      var m = sosMessage(), k = b.getAttribute('data-msg');
      if (k === 'share') share(m);
      else if (k === 'copy') copy(m);
      else location.href = 'sms:' + (med.c1p || '').replace(/[^+\d]/g, '') + '&body=' + encodeURIComponent(m);
    }
    else if (b.hasAttribute('data-med')) medEditor();
  });
  function medEditor() {
    var sh = $('sheet');
    sh.innerHTML = '<div class="bar2"><button class="back" id="mdCancel">Cancelar</button><h2>Ficha médica</h2><button class="back" id="mdSave" style="font-weight:700">Guardar</button></div>' +
      MEDF.map(function (f) { return '<div class="lbl2">' + f[1] + '</div>' + (f[0] === 'notes' ? '<textarea id="md_' + f[0] + '">' + esc(med[f[0]] || '') + '</textarea>' : '<input id="md_' + f[0] + '" value="' + esc(med[f[0]] || '') + '"' + (/p$/.test(f[0]) ? ' inputmode="tel"' : '') + '>'); }).join('') +
      '<p class="xs muted" style="margin-top:12px">Se guarda solo en este dispositivo.</p>';
    sh.className = 'sheet on'; sh.scrollTop = 0;
    $('mdCancel').addEventListener('click', function () { sh.className = 'sheet'; });
    $('mdSave').addEventListener('click', function () { MEDF.forEach(function (f) { med[f[0]] = $('md_' + f[0]).value.trim(); }); sset('ficha', med); sh.className = 'sheet'; render(); toast('Ficha guardada'); });
  }

  // ---------- GPS ----------
  var pos = null, gpsWatch = null, gpsErr = '';
  function startGPS() {
    if (gpsWatch !== null || !navigator.geolocation) return;
    gpsWatch = navigator.geolocation.watchPosition(function (p) {
      pos = p; gpsErr = '';
      if (tab === 'brujula') updateGPS();
      if (tab === 'sos' && $('sosMsg')) $('sosMsg').textContent = sosMessage();
    }, function (e) { gpsErr = e.code === 1 ? 'Permiso de ubicación denegado (Ajustes › Privacidad › Localización › Safari)' : 'Buscando señal GPS…'; if (tab === 'brujula') updateGPS(); },
    { enableHighAccuracy: true, maximumAge: 5000, timeout: 30000 });
  }
  function rad(d) { return d * Math.PI / 180; }
  function deg(r) { return r * 180 / Math.PI; }
  function utm(lat, lon) {
    var a = 6378137, f = 1 / 298.257223563, k0 = 0.9996, e2 = f * (2 - f), ep2 = e2 / (1 - e2);
    var zone = Math.floor((lon + 180) / 6) + 1;
    if (lat >= 56 && lat < 64 && lon >= 3 && lon < 12) zone = 32;
    var l0 = rad((zone - 1) * 6 - 180 + 3), p = rad(lat), l = rad(lon);
    var sp = Math.sin(p), cp = Math.cos(p), tp = Math.tan(p);
    var N = a / Math.sqrt(1 - e2 * sp * sp), T = tp * tp, C = ep2 * cp * cp, A = cp * (l - l0), e4 = e2 * e2, e6 = e4 * e2;
    var M = a * ((1 - e2 / 4 - 3 * e4 / 64 - 5 * e6 / 256) * p - (3 * e2 / 8 + 3 * e4 / 32 + 45 * e6 / 1024) * Math.sin(2 * p) + (15 * e4 / 256 + 45 * e6 / 1024) * Math.sin(4 * p) - (35 * e6 / 3072) * Math.sin(6 * p));
    var x = k0 * N * (A + (1 - T + C) * Math.pow(A, 3) / 6 + (5 - 18 * T + T * T + 72 * C - 58 * ep2) * Math.pow(A, 5) / 120) + 500000;
    var y = k0 * (M + N * tp * (A * A / 2 + (5 - T + 9 * C + 4 * C * C) * Math.pow(A, 4) / 24 + (61 - 58 * T + T * T + 600 * C - 330 * ep2) * Math.pow(A, 6) / 720));
    if (lat < 0) y += 10000000;
    var band = 'CDEFGHJKLMNPQRSTUVWXX'.charAt(Math.max(0, Math.min(20, Math.floor((lat + 80) / 8))));
    return { zone: zone, band: band, e: x, n: y };
  }
  function utmText(lat, lon) { var u = utm(lat, lon); return u.zone + u.band + ' ' + Math.round(u.e) + ' E ' + Math.round(u.n) + ' N'; }
  function dms(v, pos_, neg) { var a = Math.abs(v), d = Math.floor(a), m = Math.floor((a - d) * 60), s = ((a - d) * 60 - m) * 60; return d + '° ' + m + '′ ' + s.toFixed(1).replace('.', ',') + '″ ' + (v >= 0 ? pos_ : neg); }
  function distance(a1, o1, a2, o2) { var R = 6371000, dA = rad(a2 - a1), dO = rad(o2 - o1), x = Math.sin(dA / 2) * Math.sin(dA / 2) + Math.cos(rad(a1)) * Math.cos(rad(a2)) * Math.sin(dO / 2) * Math.sin(dO / 2); return 2 * R * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x)); }
  function bearing(a1, o1, a2, o2) { var y = Math.sin(rad(o2 - o1)) * Math.cos(rad(a2)), x = Math.cos(rad(a1)) * Math.sin(rad(a2)) - Math.sin(rad(a1)) * Math.cos(rad(a2)) * Math.cos(rad(o2 - o1)); return (deg(Math.atan2(y, x)) + 360) % 360; }
  function cardinal(h) { return ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSO', 'SO', 'OSO', 'O', 'ONO', 'NO', 'NNO'][Math.round(h / 22.5) % 16]; }
  function km(m) { return m < 1000 ? Math.round(m) + ' m' : (m / 1000).toFixed(m < 10000 ? 2 : 1).replace('.', ',') + ' km'; }

  // ---------- Brújula ----------
  var heading = null, tilt = null, compassOn = false, decl = sget('decl', 0), target = sget('objetivo', null);
  function startCompass() {
    function listen() {
      compassOn = true;
      window.addEventListener('deviceorientation', function (e) {
        var h = null;
        if (typeof e.webkitCompassHeading === 'number') h = e.webkitCompassHeading;
        else if (e.absolute && e.alpha != null) h = 360 - e.alpha;
        if (h != null) heading = (h + decl + 360) % 360;
        if (e.beta != null && e.gamma != null) tilt = deg(Math.acos(Math.max(-1, Math.min(1, Math.cos(rad(e.beta)) * Math.cos(rad(e.gamma))))));
        if (tab === 'brujula') updateCompass();
      }, true);
      if (tab === 'brujula') render();
    }
    if (window.DeviceOrientationEvent && typeof DeviceOrientationEvent.requestPermission === 'function') {
      DeviceOrientationEvent.requestPermission().then(function (r) { if (r === 'granted') { sset('compassOK', true); listen(); } else toast('Permiso de orientación denegado'); }).catch(function () { toast('Toca de nuevo para permitir la brújula'); });
    } else listen();
  }
  function roseSVG() {
    var s = '<svg viewBox="-135 -135 270 270"><g id="roseG">';
    s += '<circle r="128" fill="var(--surface)" stroke="var(--line)" stroke-width="2"/>';
    for (var i = 0; i < 72; i++) {
      var a = i * 5, big = a % 30 === 0, r1 = big ? 108 : 116;
      s += '<line x1="0" y1="-' + r1 + '" x2="0" y2="-124" stroke="' + (a === 0 ? '#D23B38' : 'var(--muted)') + '" stroke-width="' + (big ? 2.5 : 1) + '" transform="rotate(' + a + ')"/>';
      if (big && a % 90) s += '<text x="0" y="-92" font-size="11" text-anchor="middle" fill="var(--muted)" transform="rotate(' + a + ')">' + a + '</text>';
    }
    [['N', 0, '#D23B38'], ['E', 90], ['S', 180], ['O', 270]].forEach(function (c) { s += '<text x="0" y="-84" font-size="22" font-weight="800" text-anchor="middle" fill="' + (c[2] || 'var(--text)') + '" transform="rotate(' + c[1] + ')">' + c[0] + '</text>'; });
    s += '<g id="tgt" style="display:none"><path d="M0,-126 L9,-104 L-9,-104 Z" fill="#4C7D38"/></g>';
    s += '</g><path d="M0,-132 L10,-112 L-10,-112 Z" fill="var(--accent)"/><circle r="5" fill="var(--accent)"/></svg>';
    return s;
  }
  function compassView() {
    var h = '';
    if (!compassOn) h += '<button class="pill primary" data-compass="1" style="margin-bottom:10px">Activar brújula</button>';
    h += '<div class="rose">' + roseSVG() + '</div><div class="hdg" id="hdg">—</div><div class="small muted" style="text-align:center" id="hdgS">' + (compassOn ? 'gira el teléfono plano' : 'toca “Activar brújula”') + '</div>';
    h += '<div class="card" style="margin-top:12px"><div class="lrow"><span class="grow small">Declinación magnética (° , + Este / − Oeste)</span><input id="decl" inputmode="decimal" style="width:90px;text-align:center" value="' + decl + '"></div><div class="xs muted" style="margin-top:6px">Con 0 la brújula marca el norte magnético. Para el norte verdadero, ingresa la declinación de tu zona (aparece en las cartas topográficas; la app Vigía la calcula sola).</div></div>';
    h += '<div class="metrics" id="gpsM"></div>';
    h += '<div class="card"><div class="ctitle"><span>Puntos guardados</span></div><div id="wps"></div><div class="prow"><button class="pill primary" data-wp="add">Guardar posición</button><button class="pill" data-wp="share">Compartir posición</button></div></div>';
    h += '<div class="card"><div class="ctitle"><span>Inclinómetro</span><b id="tilt" style="color:var(--accent)">—</b></div><div class="xs muted">Apoya el teléfono sobre la pendiente. Las avalanchas se desprenden sobre todo entre 30° y 45°.</div></div>';
    setTimeout(function () {
      var d = $('decl'); if (d) d.addEventListener('change', function () { decl = parseFloat(d.value.replace(',', '.')) || 0; sset('decl', decl); toast('Declinación ' + decl + '°'); });
      updateGPS();
    }, 0);
    return h;
  }
  function updateCompass() {
    var g = $('roseG'); if (!g) return;
    if (heading != null) {
      g.setAttribute('transform', 'rotate(' + (-heading) + ')');
      $('hdg').textContent = Math.round(heading) + '° ' + cardinal(heading);
      $('hdgS').textContent = decl ? 'norte verdadero (declinación ' + decl + '°)' : 'norte magnético';
    }
    var tg = $('tgt');
    if (tg && target && pos) { tg.style.display = ''; tg.setAttribute('transform', 'rotate(' + bearing(pos.coords.latitude, pos.coords.longitude, target.lat, target.lon) + ')'); }
    else if (tg) tg.style.display = 'none';
    if (tilt != null && $('tilt')) $('tilt').textContent = Math.round(tilt) + '°';
  }
  function updateGPS() {
    var m = $('gpsM'); if (!m) return;
    var h = '';
    if (!pos) h = '<div class="metric" style="width:calc(100% - 10px)"><div class="l">GPS</div><div class="v" style="font-size:16px">' + esc(gpsErr || 'Buscando señal GPS… (funciona sin internet)') + '</div></div>';
    else {
      var c = pos.coords;
      h += met('Latitud', c.latitude.toFixed(5) + '°', dms(c.latitude, 'N', 'S'));
      h += met('Longitud', c.longitude.toFixed(5) + '°', dms(c.longitude, 'E', 'O'));
      h += met('UTM', utmText(c.latitude, c.longitude), 'WGS84');
      h += met('Altitud GPS', c.altitude != null ? Math.round(c.altitude) + ' m' : '—', c.altitudeAccuracy ? '±' + Math.round(c.altitudeAccuracy) + ' m' : '');
      h += met('Precisión', '±' + Math.round(c.accuracy) + ' m', new Date(pos.timestamp).toLocaleTimeString('es-CL'));
      h += met('Velocidad', c.speed != null && c.speed >= 0 ? (c.speed * 3.6).toFixed(1).replace('.', ',') + ' km/h' : '—', c.heading != null && !isNaN(c.heading) ? 'rumbo ' + Math.round(c.heading) + '°' : '');
      if (target) { var dd = distance(c.latitude, c.longitude, target.lat, target.lon), bb = bearing(c.latitude, c.longitude, target.lat, target.lon); h += '<div class="metric" style="width:calc(100% - 10px);border-color:#4C7D38"><div class="l">Hacia ' + esc(target.name) + '</div><div class="v" style="color:#4C7D38">' + km(dd) + ' · ' + Math.round(bb) + '° ' + cardinal(bb) + '</div><div class="h">flecha verde en la brújula</div></div>'; }
    }
    m.innerHTML = h;
    var wps = sget('puntos', []), w = $('wps');
    if (w) w.innerHTML = wps.length ? wps.map(function (p, i) {
      var info = pos ? km(distance(pos.coords.latitude, pos.coords.longitude, p.lat, p.lon)) + ' · ' + cardinal(bearing(pos.coords.latitude, pos.coords.longitude, p.lat, p.lon)) : p.lat.toFixed(4) + ', ' + p.lon.toFixed(4);
      var on = target && target.id === p.id;
      return '<div class="lrow" style="padding:7px 0;border-bottom:1px solid var(--line)"><button class="grow" data-wp="go" data-i="' + i + '" style="text-align:left"><b style="color:' + (on ? '#4C7D38' : 'inherit') + '">' + (on ? '➤ ' : '') + esc(p.name) + '</b><div class="xs muted">' + info + (p.alt != null ? ' · ' + Math.round(p.alt) + ' m' : '') + '</div></button><button data-wp="del" data-i="' + i + '" class="faint" style="padding:6px 10px">✕</button></div>';
    }).join('') : '<p class="small muted">Guarda tu campamento, el auto o una fuente de agua para volver a ellos.</p>';
    updateCompass();
    function met(l, v, s) { return '<div class="metric"><div class="l">' + l + '</div><div class="v" style="font-size:' + (v.length > 12 ? 15 : 22) + 'px">' + v + '</div><div class="h">' + s + '</div></div>'; }
  }
  document.addEventListener('click', function (e) {
    if (e.target.closest('[data-compass]')) { startCompass(); return; }
    var b = e.target.closest('[data-wp]'); if (!b) return;
    var k = b.getAttribute('data-wp'), wps = sget('puntos', []), i = +b.getAttribute('data-i');
    if (k === 'add') {
      if (!pos) { toast('Aún no hay señal GPS'); return; }
      var n = prompt('Nombre del punto:', 'Punto ' + (wps.length + 1)); if (n === null) return;
      wps.push({ id: uid(), name: n || 'Punto', lat: pos.coords.latitude, lon: pos.coords.longitude, alt: pos.coords.altitude, date: Date.now() });
      sset('puntos', wps); updateGPS(); toast('Punto guardado');
    } else if (k === 'share') {
      if (!pos) { toast('Aún no hay señal GPS'); return; }
      var c = pos.coords; share('Mi posición: ' + c.latitude.toFixed(5) + ', ' + c.longitude.toFixed(5) + ' (±' + Math.round(c.accuracy) + ' m)\nUTM ' + utmText(c.latitude, c.longitude) + '\nhttps://maps.apple.com/?ll=' + c.latitude.toFixed(5) + ',' + c.longitude.toFixed(5));
    } else if (k === 'go') { target = target && target.id === wps[i].id ? null : wps[i]; sset('objetivo', target); updateGPS(); }
    else if (k === 'del') { if (!confirm('¿Eliminar “' + wps[i].name + '”?')) return; if (target && target.id === wps[i].id) { target = null; sset('objetivo', null); } wps.splice(i, 1); sset('puntos', wps); updateGPS(); }
  });

  // ---------- Inicio ----------
  fetch('data.json').then(function (r) { return r.json(); }).then(function (d) {
    D = d;
    var saved = sget('preset', 'socorro');
    W.preset = W.all().filter(function (p) { return p.id === saved; })[0] || D.whistle.signal[3];
    if (stacks[tab] === undefined) tab = 'manual';
    renderTabs(); render();
    if (sget('compassOK', false) && !(window.DeviceOrientationEvent && typeof DeviceOrientationEvent.requestPermission === 'function')) startCompass();
  }).catch(function () { $('v-manual').innerHTML = '<p class="muted">No se pudo cargar el contenido. Abre la app una vez con conexión.</p>'; $('v-manual').className = 'view on'; });

  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(function () {});
}());
