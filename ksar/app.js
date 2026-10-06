/* L'Ardoise — the app: landing + account, adaptive questionnaire, tutorial, daily logging, weekly table,
   score + character, points, triggered advice, settings, admin weighting matrix.
   Data lives in Supabase (ardoise_* tables, RLS = own rows only); the logic lives in core.js.
   Every user-provided string goes through esc() or textContent. */
(() => {
  'use strict';

  const C = window.ArdoiseCore;
  const AV = window.ArdoiseAvatar;
  const CFG = window.ARDOISE_CONFIG || {};
  const APP_URL = location.origin + location.pathname;

  // ---------------------------------------------------------------- helpers
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ESC[c]);
  const fmt = v => (Math.round(v * 10) / 10).toLocaleString('fr-BE');
  const fmtInt = v => Math.round(v).toLocaleString('fr-BE');
  const plural = (n, one, many) => (Math.abs(n) >= 2 ? many : one);
  const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
  const todayISO = () => C.iso(new Date());
  const { addDays, parse, mondayOf, num } = C;
  const fDayShort = new Intl.DateTimeFormat('fr-BE', { weekday: 'short' });
  const fDayLong = new Intl.DateTimeFormat('fr-BE', { weekday: 'long', day: 'numeric', month: 'long' });
  const fShort = new Intl.DateTimeFormat('fr-BE', { day: 'numeric', month: 'short' });
  const fYear = new Intl.DateTimeFormat('fr-BE', { year: 'numeric' });
  const longDay = s => cap(fDayLong.format(parse(s)));
  const weekRange = m => `${fShort.format(parse(m))} – ${fShort.format(parse(addDays(m, 6)))}`;
  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
  const WEEKDAYS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];

  function el(tag, cls, text) { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }
  const S_LABEL = { ok: 'Raisonnable', warn: 'Proche du repère', over: 'Au-dessus', wait: 'En cours' };
  const S_ICON = { ok: '✓', warn: '!', over: '✕', wait: '…' };
  function pill(s, text, small) {
    const p = el('span', 'pill' + (small ? ' small' : '')); p.dataset.s = s;
    p.append(el('span', 'pill-i', S_ICON[s]), document.createTextNode(text || S_LABEL[s]));
    return p;
  }
  function stateChip(state, label) {
    const c = el('span', 'state-chip'); c.dataset.k = state.key;
    c.append(el('i'), document.createTextNode(label || state.label));
    return c;
  }
  function setStatus(target, msg, kind) {
    const s = typeof target === 'string' ? $(target) : target;
    if (!s) return;
    s.textContent = msg || '';
    s.className = `status ${kind || ''}`;
  }
  function brandMark() {
    return `<div class="brand-mark" aria-hidden="true"><svg width="26" height="20" viewBox="0 0 26 20"><g stroke="#eef2ee" stroke-width="2.2" stroke-linecap="round"><path d="M4 3v14M9 2.5v14.5M14 3v14M19 2.5v14.5"/><path d="M1.5 14 22.5 5.5" stroke="#e3a52b"/></g></svg></div>`;
  }
  const partState = p => (p.pts >= p.max * 0.7 ? 'ok' : p.pts >= p.max * 0.4 ? 'warn' : 'over');
  function partsHTML(parts) {
    return `<ul class="parts">${parts.map(p => `<li><span>${esc(p.label)}</span><span>${fmt(p.pts100)}/${fmt(p.max100)}</span><div class="meter"><span class="meter-fill" data-s="${partState(p)}" style="width:${(p.pts / p.max) * 100}%"></span></div></li>`).join('')}</ul>`;
  }

  const HELP_HTML = `<p><strong>Besoin d’en parler ?</strong> Infor-Drogues : <a href="tel:022275252">02 227 52 52</a> (24 h/24) · <a href="https://aide-alcool.be" target="_blank" rel="noopener">aide-alcool.be</a> · Tabacstop : <a href="tel:080011100">0800 111 00</a> · en Flandre, De DrugLijn : <a href="tel:078151020">078 15 10 20</a> · urgence : <a href="tel:112">112</a>.</p>
    <p>En cas de forte dépendance à l’alcool, n’arrête pas d’un coup : le sevrage brutal peut être dangereux. Parles-en d’abord à ton médecin.</p>`;

  function dbError(e) {
    const m = String((e && (e.message || e.error_description)) || '');
    const code = e && e.code;
    if (code === '42P01' || code === 'PGRST205' || /does not exist|Could not find the table/i.test(m)) return 'La base n’est pas initialisée : lance ksar/schema.sql dans Supabase.';
    if (/JWT|token|not authenticated/i.test(m)) return 'Ta session a expiré : reconnecte-toi.';
    if (/Failed to fetch|NetworkError|network/i.test(m)) return 'Connexion impossible. Vérifie ton réseau et réessaie.';
    return `Enregistrement impossible${m ? ` : ${m}` : ''}.`;
  }
  function authError(e) {
    const m = String((e && e.message) || '');
    if (/Invalid login credentials/i.test(m)) return 'E-mail ou mot de passe incorrect.';
    if (/Email not confirmed/i.test(m)) return 'Confirme d’abord ton adresse avec le lien reçu par e-mail.';
    if (/already registered|already exists/i.test(m)) return 'Un compte existe déjà avec cette adresse, peut-être pour un autre outil ndashiz.be. Connecte-toi avec ce mot de passe, ou « Mot de passe oublié ».';
    if (/Password should be|password.*characters/i.test(m)) return 'Le mot de passe doit faire au moins 8 caractères.';
    if (/rate limit|too many/i.test(m)) return 'Trop d’essais d’affilée. Réessaie dans quelques minutes.';
    if (/valid email|invalid.*email/i.test(m)) return 'Cette adresse e-mail n’est pas valide.';
    if (/Failed to fetch|NetworkError/i.test(m)) return 'Connexion impossible. Vérifie ton réseau et réessaie.';
    return m || 'Une erreur est survenue. Réessaie.';
  }

  // ---------------------------------------------------------------- state
  const S = {
    sb: null, session: null, profile: null, isAdmin: false,
    entries: new Map(), weeks: new Map(),
    poids: Object.assign({}, C.DEFAULT_POIDS),
    obj: Object.assign({}, C.DEFAULT_OBJECTIFS),
    tracks: C.SUBSTANCE_KEYS.slice(),
    look: Object.assign({}, AV.DEFAULT_LOOK),
    viewWeek: mondayOf(todayISO()),
    range: 'weeks', weekMode: 'slate', formDirty: false, view: null,
  };
  const app = () => $('#app');
  const uid = () => S.session && S.session.user && S.session.user.id;
  const tracked = k => S.tracks.includes(k);

  function applyProfile(p) {
    S.profile = p;
    S.obj = C.mergeNumbers(C.DEFAULT_OBJECTIFS, p && p.objectifs);
    S.look = AV.normLook(p && p.look);
    S.tracks = C.tracksOf(p && p.habits);
  }

  // ---------------------------------------------------------------- generic stepper
  function stepperHTML(id, value, max, label) {
    return `<div class="stepper"><button type="button" data-step="${esc(id)}" data-d="-1" aria-label="${esc(label)} : un de moins">−</button>`
      + `<input type="number" id="${esc(id)}" min="0" max="${max}" step="1" inputmode="numeric" value="${Number(value) || 0}">`
      + `<button type="button" data-step="${esc(id)}" data-d="1" aria-label="${esc(label)} : un de plus">+</button></div>`;
  }
  function wireSteppers(root, onChange) {
    root.addEventListener('click', ev => {
      const b = ev.target.closest('button[data-step]');
      if (!b || !root.contains(b)) return;
      const inp = document.getElementById(b.dataset.step);
      const max = Number(inp.max) || 199;
      inp.value = String(Math.max(0, Math.min(max, Math.floor(num(inp.value)) + Number(b.dataset.d))));
      onChange(inp);
    });
    root.addEventListener('input', ev => { if (ev.target.matches('.stepper input')) onChange(ev.target); });
  }
  const intVal = (id, max = 199) => Math.min(max, Math.floor(num((document.getElementById(id) || {}).value)));

  function chipsHTML(name, options, current) {
    return `<div class="chips" role="radiogroup" data-chips="${esc(name)}">${options.map(([v, l]) => { const on = String(current) === String(v); return `<button type="button" class="chip" role="radio" data-v="${esc(v)}" aria-checked="${on}" aria-pressed="${on}">${esc(l)}</button>`; }).join('')}</div>`;
  }
  function wireChips(root, onPick) {
    root.addEventListener('click', ev => {
      const b = ev.target.closest('[data-chips] .chip');
      if (!b) return;
      const group = b.parentElement;
      for (const x of $$('.chip', group)) { const on = x === b; x.setAttribute('aria-pressed', String(on)); x.setAttribute('aria-checked', String(on)); }
      onPick(group.dataset.chips, b.dataset.v);
    });
  }

  // ---------------------------------------------------------------- character picker
  function lookPickerHTML(prefix) {
    const skins = AV.SKINS.map((c, i) => `<button type="button" class="swatch" data-look="skin" data-v="${i}" style="background:${c}" aria-label="Teint ${i + 1}"></button>`).join('');
    const hairs = AV.HAIRS.map((c, i) => `<button type="button" class="swatch" data-look="hair" data-v="${i}" style="background:${c}" aria-label="Cheveux, couleur ${i + 1}"></button>`).join('');
    const styles = AV.STYLES.map(s => `<button type="button" class="chip" data-look="style" data-v="${s.key}">${s.label}</button>`).join('');
    return `<div class="picker" id="${prefix}-pick">
      <span class="lbl">Teint</span><div class="swatches">${skins}</div>
      <span class="lbl">Cheveux</span><div class="swatches">${hairs}</div>
      <span class="lbl">Coiffure</span><div class="chips">${styles}</div></div>`;
  }
  function wireLookPicker(root, look, onChange) {
    const sync = () => {
      for (const b of $$('[data-look]', root)) {
        const k = b.dataset.look, v = k === 'style' ? b.dataset.v : Number(b.dataset.v);
        b.setAttribute('aria-pressed', String(look[k] === v));
      }
    };
    root.addEventListener('click', ev => {
      const b = ev.target.closest('[data-look]');
      if (!b) return;
      const k = b.dataset.look;
      look[k] = k === 'style' ? b.dataset.v : Number(b.dataset.v);
      sync(); onChange(look);
    });
    sync();
  }

  // ================================================================ BOOT / ROUTING
  async function boot() {
    if (window.ardoiseClient) S.sb = window.ardoiseClient;
    else if (CFG.supabaseUrl && CFG.supabaseAnonKey && window.supabase) {
      S.sb = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseAnonKey, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: 'ardoise-auth' },
      });
    } else {
      return renderMessage('Configuration manquante', 'Renseigne l’URL et la clé publique du projet Supabase dans ksar/config.js.');
    }

    // Never await Supabase calls inside this callback: defer them (supabase-js auth lock).
    S.sb.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') { S.session = session; setTimeout(renderNewPassword, 0); return; }
      if (event === 'SIGNED_OUT') { S.session = null; resetData(); setTimeout(() => renderLanding(), 0); return; }
      if (event === 'SIGNED_IN' && session && (!S.session || S.session.user.id !== session.user.id)) {
        S.session = session; setTimeout(route, 0);
        return;
      }
      if (session) S.session = session;
    });

    const { data } = await S.sb.auth.getSession();
    if (S.view === 'recovery') return;
    S.session = data && data.session;
    route();
  }

  function resetData() {
    S.profile = null; S.isAdmin = false; S.entries = new Map(); S.weeks = new Map(); applyProfile(null);
    S.viewWeek = mondayOf(todayISO()); S.formDirty = false; S.weekMode = 'slate';
  }

  let routing = false;
  async function route() {
    if (routing) return;
    routing = true;
    try {
      if (!S.session) return renderLanding();
      renderMessage('Chargement…', 'On sort ton ardoise.');
      const [prof, conf, adm] = await Promise.all([
        S.sb.from('ardoise_profiles').select('*').eq('user_id', uid()).maybeSingle(),
        S.sb.from('ardoise_config').select('*').eq('key', 'poids').maybeSingle(),
        S.sb.from('ardoise_admins').select('user_id').eq('user_id', uid()).maybeSingle(),
      ]);
      if (S.view === 'recovery') return;
      if (prof.error) return renderMessage('Impossible de charger ton profil', dbError(prof.error), true);
      S.poids = C.mergeNumbers(C.DEFAULT_POIDS, conf.data && conf.data.value);
      S.isAdmin = !!(adm.data && adm.data.user_id);
      if (!prof.data || !prof.data.onboarded_at) return renderOnboarding(prof.data);
      applyProfile(prof.data);
      if (!(await loadData()) || S.view === 'recovery') return;
      renderMain();
      if (!prof.data.tutorial_done_at) startTutorial();
      else maybeShowBilan();
    } finally { routing = false; }
  }

  async function loadData() {
    const [ent, wk] = await Promise.all([
      S.sb.from('ardoise_entries').select('*').order('date', { ascending: false }).limit(1000),
      S.sb.from('ardoise_weeks').select('*').order('week', { ascending: false }).limit(260),
    ]);
    if (ent.error) { renderMessage('Impossible de charger tes données', dbError(ent.error), true); return false; }
    S.entries = new Map((ent.data || []).filter(r => C.isISODate(r.date)).map(r => [r.date, r]));
    S.weeks = new Map(((wk && wk.data) || []).filter(r => C.isISODate(r.week)).map(r => [r.week, r]));
    return true;
  }

  function renderMessage(title, text, withLogout) {
    S.view = 'message';
    app().innerHTML = `<div class="center-msg">${brandMark()}<h2>${esc(title)}</h2><p class="sub">${esc(text)}</p>
      ${withLogout ? '<div class="entry-actions"><button type="button" class="ghost" id="msg-retry">Réessayer</button><button type="button" class="ghost" id="msg-out">Se déconnecter</button></div>' : ''}</div>`;
    if (withLogout) {
      $('#msg-retry').addEventListener('click', () => route());
      $('#msg-out').addEventListener('click', () => S.sb.auth.signOut());
    }
  }

  // ================================================================ LANDING + ACCOUNT (FR1)
  const GALLERY_LOOKS = [{ skin: 1, hair: 0, style: 'court' }, { skin: 0, hair: 2, style: 'long' }, { skin: 3, hair: 0, style: 'boucle' }, { skin: 2, hair: 1, style: 'court' }];

  function renderLanding(mode, notice) {
    S.view = 'auth';
    mode = mode || 'signup';
    const gallery = C.STATES.map((s, i) => {
      const range = i === 0 ? '80 à 100' : `${s.min} à ${C.STATES[i - 1].min - 1}`;
      return `<figure>${AV.svg(s.key, GALLERY_LOOKS[i])}<figcaption>${esc(s.label)}<span>${range}</span></figcaption></figure>`;
    }).join('');
    app().innerHTML = `
      <div class="auth-wrap">
        <section class="auth-intro">
          <div class="brand">${brandMark()}<div><div class="brand-name">L'Ardoise</div><p>Alcool, tabac, drogues : réduire, semaine après semaine</p></div></div>
          <h1>Ton personnage vit comme tu consommes.</h1>
          <p>Tu notes tes journées en quelques secondes. L’Ardoise compare ta semaine aux repères santé et à tes objectifs, te donne un score sur 100, des points pour chaque effort et des conseils concrets. Ton personnage suit : du cabriolet au caddie.</p>
          <ul class="ob-points">
            <li><span class="n">1</span><span><b>Un questionnaire de deux minutes</b>Tu choisis ce que tu veux réduire, et seulement ça.</span></li>
            <li><span class="n">2</span><span><b>Une semaine de référence</b>On mesure d’abord, sans juger. Tes objectifs partent ensuite de ta vraie semaine.</span></li>
            <li><span class="n">3</span><span><b>Des points pour l’effort</b>Noter, faire du sport, appliquer un conseil : tout compte, même après une semaine difficile.</span></li>
          </ul>
          <div class="gallery">${gallery}</div>
          <p class="auth-foot">L’Ardoise aide à réduire une consommation légère à modérée. Ce n’est ni un diagnostic ni un traitement.</p>
        </section>
        <section class="panel auth-card" id="auth-card" aria-label="Compte">
          <div class="tabs" role="tablist">
            <button type="button" role="tab" id="tab-signup" aria-selected="${mode === 'signup'}">Commencer</button>
            <button type="button" role="tab" id="tab-login" aria-selected="${mode === 'login'}">J’ai un compte</button>
          </div>
          <form class="auth-form" id="auth-form" novalidate></form>
          <p class="status" id="auth-status" role="status" aria-live="polite"></p>
          <p class="auth-foot">Tes données restent privées : personne d’autre que toi ne peut les lire. Tu peux les télécharger ou tout supprimer à tout moment.</p>
        </section>
      </div>`;
    $('#tab-login').addEventListener('click', () => renderLanding('login'));
    $('#tab-signup').addEventListener('click', () => renderLanding('signup'));
    const f = $('#auth-form');
    if (mode === 'forgot') {
      $('#tab-login').setAttribute('aria-selected', 'false');
      f.innerHTML = `<h2>Mot de passe oublié</h2>
        <p class="sub">On t’envoie un lien pour en choisir un nouveau.</p>
        <div class="field"><label for="a-email">E-mail</label><input type="email" id="a-email" autocomplete="email" required></div>
        <button type="submit" class="primary">Envoyer le lien</button>
        <button type="button" class="link" id="a-back">Retour à la connexion</button>`;
      $('#a-back').addEventListener('click', () => renderLanding('login'));
    } else {
      const signup = mode === 'signup';
      f.innerHTML = `
        ${signup ? '<h2>Crée ton ardoise</h2><p class="sub">Un compte pour garder tes données d’une semaine à l’autre.</p>' : '<h2>Content de te revoir</h2>'}
        <div class="field"><label for="a-email">E-mail</label><input type="email" id="a-email" autocomplete="email" required></div>
        <div class="field"><label for="a-pass">Mot de passe</label><input type="password" id="a-pass" autocomplete="${signup ? 'new-password' : 'current-password'}" minlength="8" required>
          ${signup ? '<p class="hint">8 caractères au moins.</p>' : ''}</div>
        ${signup ? '<label class="check"><input type="checkbox" id="a-consent"><span>J’accepte que L’Ardoise enregistre ma consommation pour me fournir ce suivi. Ces données sont privées et je peux les supprimer à tout moment.</span></label>' : ''}
        <button type="submit" class="primary">${signup ? 'Créer mon compte' : 'Se connecter'}</button>
        ${signup ? '' : '<button type="button" class="link" id="a-forgot">Mot de passe oublié ?</button>'}`;
      if (!signup) $('#a-forgot').addEventListener('click', () => renderLanding('forgot'));
    }
    if (notice) setStatus('#auth-status', notice, 'ok');
    f.addEventListener('submit', ev => { ev.preventDefault(); submitAuth(mode); });
  }

  async function submitAuth(mode) {
    const email = $('#a-email').value.trim();
    const btn = $('#auth-form .primary');
    if (!EMAIL_RE.test(email)) return setStatus('#auth-status', 'Entre une adresse e-mail valide.', 'err');
    btn.disabled = true;
    setStatus('#auth-status', '');
    try {
      if (mode === 'forgot') {
        const { error } = await S.sb.auth.resetPasswordForEmail(email, { redirectTo: APP_URL });
        if (error) throw error;
        return setStatus('#auth-status', 'Si un compte existe pour cette adresse, un lien vient de partir. Pense à regarder les indésirables.', 'ok');
      }
      const password = $('#a-pass').value;
      if (password.length < 8) return setStatus('#auth-status', 'Le mot de passe doit faire au moins 8 caractères.', 'err');
      if (mode === 'signup') {
        if (!$('#a-consent').checked) return setStatus('#auth-status', 'Coche l’accord sur tes données : sans lui, on ne peut rien enregistrer.', 'err');
        const { data, error } = await S.sb.auth.signUp({ email, password, options: { emailRedirectTo: APP_URL, data: { app: 'ksar', consent_at: new Date().toISOString() } } });
        if (error) throw error;
        if (data && data.session) return; // confirmations off: SIGNED_IN routes
        if (data && data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
          return setStatus('#auth-status', 'Un compte existe déjà avec cette adresse, peut-être pour un autre outil ndashiz.be. Connecte-toi avec ce mot de passe, ou « Mot de passe oublié ».', 'err');
        }
        return renderLanding('login', 'Compte créé. Clique sur le lien de confirmation reçu par e-mail, puis connecte-toi ici.');
      }
      const { error } = await S.sb.auth.signInWithPassword({ email, password });
      if (error) throw error;
    } catch (e) {
      setStatus('#auth-status', authError(e), 'err');
    } finally { if (btn.isConnected) btn.disabled = false; }
  }

  function renderNewPassword() {
    S.view = 'recovery';
    app().innerHTML = `<div class="center-msg" style="text-align:left;justify-items:stretch">
      <div class="brand">${brandMark()}<div class="brand-name">L'Ardoise</div></div>
      <form class="panel auth-form" id="np-form" novalidate>
        <h2>Nouveau mot de passe</h2>
        <div class="field"><label for="np-1">Nouveau mot de passe</label><input type="password" id="np-1" autocomplete="new-password" minlength="8"></div>
        <div class="field"><label for="np-2">Confirme-le</label><input type="password" id="np-2" autocomplete="new-password" minlength="8"></div>
        <button type="submit" class="primary">Enregistrer</button>
        <p class="status" id="np-status" role="status" aria-live="polite"></p>
      </form></div>`;
    $('#np-form').addEventListener('submit', async ev => {
      ev.preventDefault();
      const a = $('#np-1').value, b = $('#np-2').value;
      if (a.length < 8) return setStatus('#np-status', 'Le mot de passe doit faire au moins 8 caractères.', 'err');
      if (a !== b) return setStatus('#np-status', 'Les deux mots de passe ne correspondent pas.', 'err');
      const { error } = await S.sb.auth.updateUser({ password: a });
      if (error) return setStatus('#np-status', authError(error), 'err');
      history.replaceState(null, '', APP_URL);
      S.view = null;
      route();
    });
  }

  // ================================================================ QUESTIONNAIRE (FR2)
  const FREQ_ALC = [['0', 'Jamais'], ['1', 'Une fois par semaine ou moins'], ['3', '2 à 3 fois par semaine'], ['5', '4 à 6 fois par semaine'], ['7', 'Tous les jours']];
  const FREQ_DRUG = [['1', 'Une fois par semaine ou moins'], ['3', '2 à 3 fois par semaine'], ['5', '4 à 6 fois par semaine'], ['7', 'Tous les jours']];
  const YESNO = [['1', 'Oui'], ['0', 'Non']];
  const ISSUE = [['1', 'Oui, je veux réduire'], ['0', 'Non, pas vraiment']];
  const OBJ_FIELDS = [
    ['alcool', 'semaine', 'Alcool par semaine, au plus', 'en verres standard · repère santé : 10', 70],
    ['alcool', 'jours_sans', 'Jours sans alcool par semaine, au moins', 'repère : ne pas boire tous les jours', 7],
    ['alcool', 'soiree', 'Verres par soirée, au plus', 'au-delà, la soirée compte comme chargée', 30],
    ['cigarettes', 'cigarettes_jour', 'Cigarettes par jour, au plus', 'il n’existe pas de seuil sans risque', 60],
    ['drogues', 'drogues_semaine', 'Prises par semaine, au plus', 'un joint = 1, une autre drogue = 2 · pas de repère officiel', 30],
  ];

  function renderOnboarding(existing) {
    S.view = 'onboarding';
    const h0 = (existing && existing.habits) || {};
    const ob = {
      step: 0,
      pseudo: (existing && existing.pseudo) || '',
      look: AV.normLook(existing && existing.look),
      habits: {
        alcool: Object.assign({ use: null, issue: null, jours: 0, pils: 0, vin: 0, speciale: 0, cocktail: 0, shot: 0 }, h0.alcool || {}),
        cigarettes: Object.assign({ use: null, issue: null, par_jour: 0 }, h0.cigarettes || {}),
        drogues: Object.assign({ use: null, issue: null, freq: 0, joint: 0, autre_drogue: 0 }, h0.drogues || {}),
      },
      obj: null,
      email: (existing && existing.reminder_email) || (S.session.user && S.session.user.email) || '',
      remind: existing ? !!existing.reminder_enabled || !existing.onboarded_at : true,
      day: (existing && existing.reminder_day) || 1,
    };
    const STEPS = 8;
    app().innerHTML = `
      <div class="ob-wrap">
        <section class="panel ob-card">
          <div class="brand">${brandMark()}<div class="brand-name">L'Ardoise</div></div>
          <div class="ob-progress"><span id="ob-count"></span><div class="ob-bar"><i id="ob-bar"></i></div></div>
          <form class="ob-body" id="ob-body" novalidate></form>
          <p class="status" id="ob-status" role="status" aria-live="polite"></p>
          <div class="ob-nav"><button type="button" class="ghost" id="ob-back">Retour</button><button type="button" class="primary" id="ob-next">Continuer</button></div>
        </section>
        <aside class="ob-preview" aria-live="polite"><div id="ob-scene"></div><div class="ob-preview-cap" id="ob-cap"></div></aside>
      </div>`;
    let body = $('#ob-body');
    // C.tracksOf() falls back to "everything" when nothing was answered yet: here we want the strict answer.
    const flagged = () => C.SUBSTANCE_KEYS.filter(k => ob.habits[k].use && ob.habits[k].issue);
    const habitScore = () => {
      const tr = flagged();
      return tr.length ? C.scoreWeek(C.habitsStats(ob.habits, S.poids), ob.obj || C.suggestObjectifs(ob.habits, S.poids), false, tr) : null;
    };

    function preview() {
      let state = C.stateByKey('ok'), cap = ob.pseudo ? `Salut ${ob.pseudo} !` : 'Ton personnage, à ton image.';
      if (ob.step >= 2) {
        const sc = habitScore();
        if (sc) { state = sc.state; cap = ob.step >= 7 ? `${sc.total}/100 d’après tes réponses.` : 'Ton personnage d’après ce que tu nous dis.'; }
      }
      $('#ob-scene').innerHTML = AV.svg(state.key, ob.look, { title: `Ton personnage : ${state.label}` });
      const capEl = $('#ob-cap'); capEl.textContent = '';
      capEl.append(stateChip(state), el('p', null, cap));
    }

    function qty(sub, fields) {
      return `<div>${fields.map(([k, label, unit, max]) => `<div class="obj-row"><label for="h-${sub}-${k}">${label}<small>${unit}</small></label>${stepperHTML(`h-${sub}-${k}`, ob.habits[sub][k], max || 199, label)}</div>`).join('')}</div>`;
    }
    function readStep() {
      if (ob.step === 0) ob.pseudo = $('#ob-pseudo').value.trim().slice(0, 40);
      const readQty = (sub, keys) => { for (const k of keys) if (document.getElementById(`h-${sub}-${k}`)) ob.habits[sub][k] = intVal(`h-${sub}-${k}`); };
      if (ob.step === 2) readQty('alcool', ['pils', 'vin', 'speciale', 'cocktail', 'shot']);
      if (ob.step === 3) readQty('cigarettes', ['par_jour']);
      if (ob.step === 4) readQty('drogues', ['joint', 'autre_drogue']);
      if (ob.step === 5) for (const [sub, k, , , max] of OBJ_FIELDS) if (flagged().includes(sub)) ob.obj[k] = intVal(`o-${k}`, max);
      if (ob.step === 6) { ob.email = $('#ob-email').value.trim(); ob.remind = $('#ob-remind').checked; }
    }
    function alcSummary() {
      const u = C.alcUnits(ob.habits.alcool, S.poids);
      return `<div class="ob-summary"><strong>≈ ${fmt(u)} ${plural(u, 'verre', 'verres')} standard par semaine</strong>
        <span>${u > 10 ? `Au-dessus du repère santé de 10 verres, de ${fmt(u - 10)}.` : 'Dans le repère santé de 10 verres par semaine.'}</span></div>`;
    }

    function draw() {
      // A fresh form per step: listeners from the previous step must not fire twice.
      const fresh = body.cloneNode(false);
      body.replaceWith(fresh);
      body = fresh;
      body.addEventListener('submit', ev => { ev.preventDefault(); $('#ob-next').click(); });
      $('#ob-count').textContent = `Étape ${ob.step + 1} sur ${STEPS}`;
      $('#ob-bar').style.width = `${((ob.step + 1) / STEPS) * 100}%`;
      $('#ob-back').hidden = ob.step === 0;
      $('#ob-next').textContent = ob.step === STEPS - 1 ? 'Découvrir mon ardoise' : 'Continuer';
      setStatus('#ob-status', '');
      const a = ob.habits.alcool, c = ob.habits.cigarettes, d = ob.habits.drogues;
      if (ob.step === 0) {
        body.innerHTML = `<h1>Bienvenue sur L'Ardoise</h1>
          <p>Quelques questions pour régler ton ardoise, puis un petit tour du propriétaire. Compte deux minutes. Personne d’autre que toi ne verra tes réponses.</p>
          <div class="field"><label for="ob-pseudo">Ton prénom ou pseudo</label><input type="text" id="ob-pseudo" maxlength="40" autocomplete="nickname" value="${esc(ob.pseudo)}"></div>`;
        $('#ob-pseudo').addEventListener('input', () => { ob.pseudo = $('#ob-pseudo').value.trim().slice(0, 40); preview(); });
      } else if (ob.step === 1) {
        body.innerHTML = `<h1>Ton personnage</h1><p>Il te ressemble et réagit à ta semaine. Tu pourras le changer plus tard dans les réglages.</p>${lookPickerHTML('ob')}`;
        wireLookPicker($('#ob-pick'), ob.look, preview);
      } else if (ob.step === 2) {
        body.innerHTML = `<h1>L'alcool</h1>
          <div class="field"><span class="lbl">À quelle fréquence bois-tu de l’alcool ?</span>${chipsHTML('a-freq', FREQ_ALC, a.use === false ? '0' : a.use ? String(a.jours) : '')}</div>
          <div class="ob-more" id="a-more" ${a.use ? '' : 'hidden'}>
            <div class="field"><span class="lbl">Est-ce un sujet pour toi ?</span>${chipsHTML('a-issue', ISSUE, a.issue == null ? '' : a.issue ? '1' : '0')}</div>
            <div class="field"><span class="lbl">Sur une semaine typique, combien de…</span>${qty('alcool', [['pils', 'Bières', 'pils, 25 cl'], ['vin', 'Verres de vin', '10 cl'], ['speciale', 'Bières spéciales', '33 cl, 8 %'], ['cocktail', 'Cocktails', 'avec alcool fort'], ['shot', 'Shots', '3 à 4 cl']])}</div>
            <div id="ob-asum">${alcSummary()}</div>
          </div>`;
        wireChips(body, (g, v) => {
          if (g === 'a-freq') { a.use = v !== '0'; a.jours = Number(v); if (!a.use) a.issue = false; $('#a-more').hidden = !a.use; }
          if (g === 'a-issue') a.issue = v === '1';
          ob.obj = null; preview();
        });
        wireSteppers(body, () => { readStep(); ob.obj = null; $('#ob-asum').innerHTML = alcSummary(); preview(); });
      } else if (ob.step === 3) {
        body.innerHTML = `<h1>Les cigarettes</h1>
          <div class="field"><span class="lbl">Fumes-tu des cigarettes ?</span>${chipsHTML('c-use', YESNO, c.use == null ? '' : c.use ? '1' : '0')}</div>
          <div class="ob-more" id="c-more" ${c.use ? '' : 'hidden'}>
            <div class="field"><span class="lbl">Est-ce un sujet pour toi ?</span>${chipsHTML('c-issue', ISSUE, c.issue == null ? '' : c.issue ? '1' : '0')}</div>
            ${qty('cigarettes', [['par_jour', 'Cigarettes par jour', 'en moyenne', 99]])}
          </div>`;
        wireChips(body, (g, v) => {
          if (g === 'c-use') { c.use = v === '1'; if (!c.use) c.issue = false; $('#c-more').hidden = !c.use; }
          if (g === 'c-issue') c.issue = v === '1';
          ob.obj = null; preview();
        });
        wireSteppers(body, () => { readStep(); ob.obj = null; preview(); });
      } else if (ob.step === 4) {
        body.innerHTML = `<h1>Les drogues</h1>
          <div class="field"><span class="lbl">Consommes-tu des drogues, cannabis compris ?</span>${chipsHTML('d-use', YESNO, d.use == null ? '' : d.use ? '1' : '0')}</div>
          <div class="ob-more" id="d-more" ${d.use ? '' : 'hidden'}>
            <div class="field"><span class="lbl">À quelle fréquence ?</span>${chipsHTML('d-freq', FREQ_DRUG, d.freq ? String(d.freq) : '')}</div>
            <div class="field"><span class="lbl">Est-ce un sujet pour toi ?</span>${chipsHTML('d-issue', ISSUE, d.issue == null ? '' : d.issue ? '1' : '0')}</div>
            <div class="field"><span class="lbl">Sur une semaine typique</span>${qty('drogues', [['joint', 'Joints', 'cannabis'], ['autre_drogue', 'Autres prises', 'ecstasy, cocaïne, speed…']])}</div>
          </div>`;
        wireChips(body, (g, v) => {
          if (g === 'd-use') { d.use = v === '1'; if (!d.use) d.issue = false; $('#d-more').hidden = !d.use; }
          if (g === 'd-freq') d.freq = Number(v);
          if (g === 'd-issue') d.issue = v === '1';
          ob.obj = null; preview();
        });
        wireSteppers(body, () => { readStep(); ob.obj = null; preview(); });
      } else if (ob.step === 5) {
        if (!ob.obj) ob.obj = C.suggestObjectifs(ob.habits, S.poids);
        body.innerHTML = `<h1>Tes objectifs</h1><p>Une première marche à partir de tes réponses, sans dépasser les repères santé. Après ta semaine de référence, on te proposera de les recaler sur −20 % de ce que tu as vraiment consommé.</p>
          ${flagged().map(sub => `<fieldset class="group"><legend>${esc(C.SUBSTANCES[sub].label)}</legend>${OBJ_FIELDS.filter(f => f[0] === sub).map(([, k, label, hint, max]) => `<div class="obj-row"><label for="o-${k}">${label}<small>${hint}</small></label>${stepperHTML(`o-${k}`, ob.obj[k], max, label)}</div>`).join('')}</fieldset>`).join('')}`;
        wireSteppers(body, () => { readStep(); preview(); });
      } else if (ob.step === 6) {
        body.innerHTML = `<h1>Un rappel chaque semaine</h1>
          <p>Si ta semaine précédente n’est pas complète, on t’envoie un e-mail le jour de ton choix, avec ton bilan en deux lignes. Après quatre rappels sans réponse, on te laisse tranquille.</p>
          <label class="check"><input type="checkbox" id="ob-remind" ${ob.remind ? 'checked' : ''}><span>M’envoyer ce rappel par e-mail</span></label>
          <div class="field"><label for="ob-email">Adresse pour les rappels</label><input type="email" id="ob-email" autocomplete="email" value="${esc(ob.email)}"></div>
          <div class="field"><span class="lbl">Le jour du rappel</span>${chipsHTML('day', WEEKDAYS.map((w, i) => [String(i + 1), w]), String(ob.day))}</div>`;
        wireChips(body, (g, v) => { if (g === 'day') ob.day = Number(v); });
      } else {
        const sc = habitScore();
        const heavy = C.needsHelp(C.habitsStats(ob.habits, S.poids));
        body.innerHTML = `<h1>Ton point de départ</h1>
          <p>D’après tes réponses, une semaine typique vaudrait <strong>${sc.total}/100</strong> : ton personnage serait <strong>${esc(sc.state.label.toLowerCase())}</strong>.</p>
          ${partsHTML(sc.parts)}
          <div class="ob-summary"><strong>Ta première semaine sert de référence</strong><span>On mesure sans juger : ton personnage reste neutre et tes points s’accumulent déjà. Dimanche soir, on te propose des objectifs calés sur ta vraie semaine.</span></div>
          ${heavy ? `<div class="help-box">${HELP_HTML}</div>` : ''}`;
      }
      preview();
      if (ob.step > 0) { const h = body.querySelector('h1'); h.tabIndex = -1; h.focus({ preventScroll: true }); }
    }

    function check() {
      const a = ob.habits.alcool, c = ob.habits.cigarettes, d = ob.habits.drogues;
      if (ob.step === 0 && !ob.pseudo) return 'Choisis un prénom ou un pseudo pour ton personnage.';
      if (ob.step === 2 && a.use == null) return 'Choisis une fréquence, même « jamais ».';
      if (ob.step === 2 && a.use && a.issue == null) return 'Dis-nous si l’alcool est un sujet pour toi.';
      if (ob.step === 3 && c.use == null) return 'Réponds oui ou non.';
      if (ob.step === 3 && c.use && c.issue == null) return 'Dis-nous si les cigarettes sont un sujet pour toi.';
      if (ob.step === 4 && d.use == null) return 'Réponds oui ou non.';
      if (ob.step === 4 && d.use && (!d.freq || d.issue == null)) return 'Indique la fréquence et si c’est un sujet pour toi.';
      if (ob.step === 4 && !flagged().length) return 'L’Ardoise suit seulement ce que tu veux réduire : réponds « oui, je veux réduire » pour au moins une consommation.';
      if (ob.step === 6 && ob.remind && !EMAIL_RE.test(ob.email)) return 'Entre une adresse e-mail valide, ou décoche le rappel.';
      return '';
    }

    $('#ob-back').addEventListener('click', () => { readStep(); ob.step = Math.max(0, ob.step - 1); draw(); });
    $('#ob-next').addEventListener('click', async () => {
      readStep();
      const err = check();
      if (err) return setStatus('#ob-status', err, 'err');
      if (ob.step < STEPS - 1) { ob.step++; return draw(); }
      const btn = $('#ob-next'); btn.disabled = true;
      setStatus('#ob-status', 'Enregistrement…');
      const meta = (S.session.user && S.session.user.user_metadata) || {};
      const row = {
        user_id: uid(), pseudo: ob.pseudo, look: ob.look, habits: ob.habits, objectifs: ob.obj,
        reminder_email: ob.email || null, reminder_enabled: ob.remind && EMAIL_RE.test(ob.email), reminder_day: ob.day,
        consent_at: meta.consent_at || new Date().toISOString(),
        onboarded_at: new Date().toISOString(), baseline_week: mondayOf(todayISO()),
      };
      const { data, error } = await S.sb.from('ardoise_profiles').upsert(row, { onConflict: 'user_id' }).select().single();
      btn.disabled = false;
      if (error) return setStatus('#ob-status', dbError(error), 'err');
      applyProfile(data);
      if (!(await loadData())) return;
      renderMain();
      startTutorial();
    });
    draw();
  }

  // ================================================================ COMPUTATIONS
  function weekStats(m) { return C.weekStats(S.entries, m, S.poids, todayISO()); }
  const isBaseline = m => !!(S.profile && S.profile.baseline_week === m);
  function scoreOf(m) {
    const t = todayISO();
    if (m > t) return null;
    return C.scoreWeek(weekStats(m), S.obj, t <= addDays(m, 6), S.tracks);
  }
  const extrasOf = m => { const w = S.weeks.get(m); return { sport: w ? num(w.sport) : 0, advice: w && Array.isArray(w.advice) ? w.advice : [] }; };
  function pointsOf(m) { return C.pointsWeek(weekStats(m), S.obj, S.tracks, extrasOf(m)); }
  function firstWeek() {
    const p = S.profile || {};
    let first = p.baseline_week || (p.onboarded_at ? mondayOf(String(p.onboarded_at).slice(0, 10)) : mondayOf(todayISO()));
    for (const d of S.entries.keys()) if (mondayOf(d) < first) first = mondayOf(d);
    return first;
  }
  function totalPoints() {
    const end = mondayOf(todayISO());
    let total = 0, guard = 0;
    for (let m = firstWeek(); m <= end && guard < 520; m = addDays(m, 7), guard++) total += pointsOf(m).total;
    return total;
  }
  /** Which score drives the character for week m. Baseline week: neutral, no judgment (P3). */
  function avatarFor(m) {
    if (isBaseline(m)) return { sc: scoreOf(m), source: 'baseline', state: C.stateByKey('ok') };
    const sc = scoreOf(m);
    if (sc) return { sc, source: 'week', state: sc.state };
    const pm = addDays(m, -7), prev = scoreOf(pm);
    if (prev && !isBaseline(pm)) return { sc: prev, source: 'previous', state: prev.state };
    return { sc: null, source: 'none', state: C.stateByKey('ok') };
  }
  function trendFor(m) {
    const sc = scoreOf(m);
    if (!sc || isBaseline(m)) return null;
    const prev = [1, 2, 3, 4].map(i => addDays(m, -7 * i)).filter(w => !isBaseline(w)).map(w => { const s = scoreOf(w); return s ? s.total : null; });
    return C.trendOf(sc.total, prev);
  }

  // ================================================================ MAIN VIEW
  function renderMain() {
    S.view = 'main';
    const pseudo = (S.profile && S.profile.pseudo) || '';
    app().innerHTML = `
    <div class="wrap">
      <header class="top">
        <div class="brand">${brandMark()}<div><div class="brand-name">L'Ardoise</div><p>${pseudo ? `Salut ${esc(pseudo)}` : 'Ton ardoise'}</p></div></div>
        <div class="top-right">
          <nav class="weeknav" aria-label="Semaine affichée">
            <button type="button" class="arrow" id="prev-week" aria-label="Semaine précédente">‹</button>
            <div class="week-label" aria-live="polite"><strong id="week-range"></strong><span id="week-tag"></span></div>
            <button type="button" class="arrow" id="next-week" aria-label="Semaine suivante">›</button>
          </nav>
          <button type="button" class="ghost" id="this-week">Cette semaine</button>
          <button type="button" class="ghost" id="btn-settings">Réglages</button>
        </div>
      </header>

      <div class="layout" id="layout">
        <section class="hero" id="avatar-card" aria-labelledby="score-label">
          <div class="scene" id="scene"></div>
          <div class="hero-side">
            <div class="hero-head"><h2 class="eyebrow" id="score-label">Score de la semaine</h2><span class="tag" id="score-kind"></span></div>
            <div class="score-fig"><span class="score-num" id="score-num">–</span><span class="score-of">/100</span><span class="trend" id="trend"></span></div>
            <div id="state-chip"></div>
            <p class="hero-msg" id="state-msg"></p>
            <div class="hero-stats">
              <div class="hstat" id="points-card"><span class="hstat-l">Points</span><strong id="pts-total">0</strong><span id="pts-week"></span></div>
              <div class="hstat" id="alc-card"><span class="hstat-l">Alcool</span><strong id="alc-num">0</strong><span id="alc-limit"></span></div>
            </div>
            <div class="glasses" id="glasses" role="img"></div>
          </div>
        </section>

        <section class="panel cmp-panel" id="cmp-panel" aria-labelledby="h-cmp">
          <div class="panel-head" style="margin-bottom:0"><h2 id="h-cmp">Par rapport au raisonnable</h2><p class="sub">Chaque ligne pèse dans le score sur 100</p></div>
          <ul class="cmp" id="cmp"></ul>
        </section>

        <section class="panel advice-panel" id="advice-panel" aria-labelledby="h-advice">
          <div class="panel-head" style="margin-bottom:6px"><h2 id="h-advice">Conseils pour toi</h2><p class="sub" id="advice-sub"></p></div>
          <ul class="advice" id="advice"></ul>
          <div class="help-box" id="help-box" hidden>${HELP_HTML}</div>
        </section>

        <aside class="side">
          <form class="panel entry" id="entry" novalidate>
            <h2>Noter une journée</h2>
            <div class="field">
              <label for="f-date">Date</label>
              <input type="date" id="f-date">
              <p class="hint" id="f-when"></p>
            </div>
            <div class="steppers" id="steppers"></div>
            <div class="field"><label for="f-note">Note (facultatif)</label><textarea id="f-note" rows="2" maxlength="500" placeholder="Concert, resto, anniversaire…"></textarea></div>
            <div class="entry-total" id="f-total-box"><span id="f-total"></span><span id="f-flag"></span></div>
            <div class="entry-actions">
              <button type="submit" class="primary" id="f-save">Enregistrer</button>
              <button type="button" class="ghost" id="f-zero">Rien du tout ce jour-là</button>
              <button type="button" class="ghost danger" id="f-del" hidden>Effacer ce jour</button>
            </div>
            <p class="status" id="f-status" role="status" aria-live="polite"></p>
          </form>
        </aside>

        <section class="panel week-panel" id="week-panel" aria-labelledby="h-week">
          <div class="panel-head">
            <h2 id="h-week">La semaine</h2>
            <div class="seg" role="group" aria-label="Affichage de la semaine">
              <button type="button" id="w-slate" aria-pressed="true">Ardoise</button>
              <button type="button" id="w-table" aria-pressed="false">Tableau à compléter</button>
            </div>
          </div>
          <p class="empty-note" id="empty-note" hidden>Ton ardoise est vierge. Note ta première journée avec le formulaire : même « rien du tout » compte.</p>
          <ol class="days" id="days"></ol>
          <div id="week-table" hidden></div>
          <div class="sport" id="sport-box">
            <label for="w-sport"><span class="step-name">Séances de sport cette semaine</span><span class="step-sub">+${C.POINTS.sport} points chacune</span></label>
            ${stepperHTML('w-sport', 0, 21, 'Séances de sport')}
            <p class="status" id="sport-status" role="status" aria-live="polite"></p>
          </div>
        </section>

        <section class="panel curves" id="curves" aria-labelledby="h-curves">
          <div class="panel-head">
            <h2 id="h-curves">Courbes</h2>
            <div class="seg" role="group" aria-label="Période des courbes">
              <button type="button" id="r-weeks" aria-pressed="true">12 semaines</button>
              <button type="button" id="r-days" aria-pressed="false">30 jours</button>
            </div>
          </div>
          <div class="chart-block" id="cb-alc"><div class="chart-title"><h3>Alcool</h3><span class="chart-unit" id="u-alc"></span></div><div class="chart" id="ch-alc"></div></div>
          <div class="chart-block"><div class="chart-title"><h3>Score de la semaine</h3><span class="chart-unit">sur 100, 12 dernières semaines</span></div><div class="chart" id="ch-score"></div></div>
          <div class="multiples" id="multiples">
            <div class="chart-block"><div class="chart-title"><h3>Points</h3><span class="chart-unit">gagnés par semaine</span></div><div class="chart" id="ch-pts"></div></div>
            <div class="chart-block" id="cb-cig"><div class="chart-title"><h3>Cigarettes</h3><span class="chart-unit" id="u-cig"></span></div><div class="chart" id="ch-cig"></div></div>
            <div class="chart-block" id="cb-drug"><div class="chart-title"><h3>Drogues</h3><span class="chart-unit" id="u-drug"></span></div><div class="chart" id="ch-drug"></div></div>
          </div>
          <details class="table-view"><summary>Voir les chiffres en tableau</summary><div class="table-scroll"><table id="tbl"></table></div></details>
        </section>
      </div>

      <footer class="notes">
        <p><strong>1 verre standard = 10 g d'alcool pur</strong> : une pils de 25 cl, un verre de vin de 10 cl, un shot de 3 cl d'alcool fort. Une bière spéciale de 33 cl à 8 % en vaut environ 2.</p>
        <p><strong>Repère belge</strong> (Conseil Supérieur de la Santé, 2018) : au maximum 10 verres standard par semaine, sans boire tous les jours. Moins, c'est mieux. <strong>Excès ponctuel</strong> : 6 verres ou plus en une occasion (OMS).</p>
        <p><strong>Score sur 100</strong> : ta semaine face à tes objectifs, il fait vivre ton personnage (80 : en pleine forme · 60 : ça roule · 40 : en déclin · en dessous : à la rue). <strong>Points</strong> : ils récompensent l'effort (jours notés, sport, objectifs tenus, conseils appliqués) et ne baissent jamais.</p>
        <div class="help-foot">${HELP_HTML}</div>
      </footer>
    </div>
    <dialog id="dlg-settings" aria-labelledby="set-title"></dialog>
    <dialog id="dlg-bilan" aria-labelledby="bilan-title"></dialog>`;

    buildSteppers();
    wireMain();
    const now = new Date();
    loadForm(now.getHours() < 12 ? addDays(todayISO(), -1) : todayISO());
    renderAll();
  }

  function renderAll() {
    if (S.view !== 'main') return;
    const st = weekStats(S.viewWeek);
    renderWeekLabel();
    renderHero(st);
    renderCmp(st);
    renderAdvice(st);
    renderWeek(st);
    renderCharts();
    updateSubs();
    updateTotal();
  }

  function renderWeekLabel() {
    const t = todayISO(), sun = addDays(S.viewWeek, 6);
    $('#week-range').textContent = `${weekRange(S.viewWeek)} ${fYear.format(parse(sun))}`;
    let tag = t < S.viewWeek ? 'Semaine à venir' : t > sun ? 'Semaine terminée' : 'Semaine en cours';
    if (isBaseline(S.viewWeek)) tag += ' · référence';
    $('#week-tag').textContent = tag;
    $('#this-week').disabled = S.viewWeek === mondayOf(t);
  }

  // ---------------------------------------------------------------- hero
  function renderHero(st) {
    const t = todayISO();
    const { sc, source, state } = avatarFor(S.viewWeek);
    $('#scene').innerHTML = AV.svg(state.key, S.look, { title: `Ton personnage : ${source === 'baseline' ? 'neutre, semaine de référence' : state.label}` });
    const chip = $('#state-chip'); chip.textContent = '';
    chip.append(stateChip(state, source === 'baseline' ? 'Semaine de référence' : null));

    let big = '–', kind = '', msg;
    if (S.viewWeek > t) { kind = 'à venir'; msg = 'Cette semaine n’a pas encore commencé.'; }
    else if (source === 'baseline') {
      kind = 'référence';
      msg = 'Ta première semaine sert de référence : on mesure, sans juger. Note tout honnêtement. Dimanche soir, on te propose des objectifs calés sur ta vraie semaine.';
    } else if (source === 'week') {
      big = String(sc.total); kind = sc.provisional ? 'provisoire' : 'final';
      msg = state.msg + (sc.provisional ? ' Le score devient final dimanche soir.' : '');
    } else if (source === 'previous') {
      kind = 'pas encore de données';
      msg = `Rien de noté cette semaine. Ton personnage garde l’allure de la semaine précédente (${sc.total}/100).`;
    } else msg = 'Note ta première journée pour que ton personnage réagisse.';
    $('#score-num').textContent = big;
    $('#score-num').parentElement.hidden = big === '–';
    $('#score-kind').textContent = kind;
    $('#score-kind').hidden = !kind;
    $('#state-msg').textContent = msg;

    const tr = trendFor(S.viewWeek), trEl = $('#trend');
    trEl.textContent = tr ? `${tr.delta > 0 ? '↑ +' : tr.delta < 0 ? '↓ −' : '= '}${Math.abs(tr.delta)} vs ta moyenne` : '';
    trEl.dataset.dir = tr ? (tr.delta > 0 ? 'up' : tr.delta < 0 ? 'down' : 'flat') : '';
    trEl.title = tr ? `Moyenne des 4 semaines précédentes : ${tr.avg}/100` : '';

    const pw = pointsOf(S.viewWeek);
    $('#pts-total').textContent = fmtInt(totalPoints());
    $('#pts-week').textContent = S.viewWeek > t ? 'au total' : `+${fmtInt(pw.total)} cette semaine`;

    const showAlc = tracked('alcool');
    $('#alc-card').hidden = !showAlc;
    $('#glasses').hidden = !showAlc;
    if (!showAlc) return;
    const L = S.obj.semaine, u = st.units;
    $('#alc-num').textContent = fmt(u);
    $('#alc-limit').textContent = `sur ${fmt(L)} verres standard`;
    const g = $('#glasses'); g.textContent = '';
    const slots = Math.max(1, Math.min(30, Math.round(L) || 1));
    const overSlots = Math.min(20, Math.max(0, Math.ceil(u - slots)));
    for (let i = 0; i < slots + overSlots; i++) {
      if (i === slots && overSlots) g.append(el('span', 'glass-gap'));
      const c = el('span', 'glass' + (i >= slots ? ' over' : ''));
      const fill = el('i'); fill.style.height = `${Math.max(0, Math.min(1, u - i)) * 100}%`;
      c.append(fill); g.append(c);
    }
    g.setAttribute('aria-label', `${fmt(u)} verres standard sur un objectif de ${fmt(L)}`);
  }

  // ---------------------------------------------------------------- comparison
  function sWeek(u) { const L = S.obj.semaine; if (u > L) return 'over'; if (u > 0 && u >= 0.8 * L) return 'warn'; return 'ok'; }
  function sEvening(u) { if (u > 0 && u >= S.obj.exces) return 'over'; if (u > S.obj.soiree) return 'warn'; return 'ok'; }

  function cmpRow(o) {
    const li = el('li');
    const head = el('div', 'cmp-head');
    const lab = el('span', 'cmp-label', o.label);
    if (o.part) lab.append(el('span', 'cmp-pts', `${fmt(o.part.pts100)}/${fmt(o.part.max100)}`));
    head.append(lab, pill(o.s, o.sLabel, true));
    const val = el('div', 'cmp-val');
    val.append(el('strong', null, o.value), el('span', null, o.ref));
    const meter = el('div', 'meter');
    const fill = el('span', 'meter-fill'); fill.dataset.s = o.s;
    fill.style.width = `${Math.max(0, Math.min(100, (o.v / o.max) * 100))}%`;
    meter.append(fill);
    for (const [tv, soft] of o.ticks) {
      const tk = el('span', 'meter-tick' + (soft ? ' soft' : ''));
      tk.style.left = `${Math.max(0, Math.min(100, (tv / o.max) * 100))}%`;
      meter.append(tk);
    }
    li.append(head, val, meter, el('p', 'cmp-note', o.note));
    return li;
  }

  function renderCmp(st) {
    const ob = S.obj, host = $('#cmp');
    host.textContent = '';
    const t = todayISO();
    const finished = t > addDays(S.viewWeek, 6);
    const sc = S.viewWeek > t ? null : C.scoreWeek(st, ob, !finished, S.tracks);
    const part = k => (sc ? sc.parts.find(p => p.key === k) : null);

    if (tracked('alcool')) {
      const sw = sWeek(st.units);
      host.append(cmpRow({
        label: 'Alcool sur la semaine', part: part('alcool'), s: sw, sLabel: S_LABEL[sw],
        value: `${fmt(st.units)} ${plural(st.units, 'verre', 'verres')}`, ref: `pour un objectif de ${fmt(ob.semaine)}`,
        v: st.units, max: Math.max(ob.semaine * 1.5, st.units, 1), ticks: [[ob.semaine, false]],
        note: 'Repère belge : 10 verres standard par semaine au maximum.',
      }));
      let sd, sdl;
      if (st.dry >= ob.jours_sans) { sd = 'ok'; sdl = 'Objectif tenu'; }
      else if (st.dry + st.future >= ob.jours_sans && !finished) { sd = 'wait'; sdl = 'Encore jouable'; }
      else { sd = 'over'; sdl = 'Objectif manqué'; }
      host.append(cmpRow({
        label: 'Jours sans alcool', part: part('jours_sans'), s: sd, sLabel: sdl,
        value: `${st.dry} ${plural(st.dry, 'jour', 'jours')}`, ref: `pour au moins ${fmt(ob.jours_sans)}`,
        v: st.dry, max: 7, ticks: [[ob.jours_sans, false]],
        note: st.future ? `${st.future} ${plural(st.future, 'jour', 'jours')} encore à venir. Ne pas boire tous les jours.` : 'Ne pas boire tous les jours, c’est le deuxième repère.',
      }));
      const se = sEvening(st.maxU);
      host.append(cmpRow({
        label: 'Soirée la plus chargée', part: part('soirees'), s: se, sLabel: se === 'over' ? 'Excès ponctuel' : se === 'warn' ? 'Soirée chargée' : 'Raisonnable',
        value: `${fmt(st.maxU)} ${plural(st.maxU, 'verre', 'verres')}`, ref: `pour un maximum de ${fmt(ob.soiree)}`,
        v: st.maxU, max: Math.max(ob.exces * 1.25, st.maxU, 1), ticks: [[ob.soiree, false], [ob.exces, true]],
        note: (st.maxD ? `${longDay(st.maxD)}. ` : '') + `Excès ponctuel dès ${fmt(ob.exces)} verres en une occasion.`,
      }));
    }
    if (tracked('cigarettes')) {
      const s = st.cigAvg > ob.cigarettes_jour ? 'over' : 'ok';
      host.append(cmpRow({
        label: 'Cigarettes par jour', part: part('cigarettes'), s, sLabel: s === 'over' ? 'Au-dessus de l’objectif' : 'Dans l’objectif',
        value: `${fmt(st.cigAvg)} en moyenne`, ref: `pour un objectif de ${fmt(ob.cigarettes_jour)}`,
        v: st.cigAvg, max: Math.max(ob.cigarettes_jour * 2, st.cigAvg, 1), ticks: [[ob.cigarettes_jour, false]],
        note: `${st.cigs} ${plural(st.cigs, 'cigarette', 'cigarettes')} sur ${st.logged} ${plural(st.logged, 'jour noté', 'jours notés')}. Pas de seuil sans risque pour le tabac.`,
      }));
    }
    if (tracked('drogues')) {
      const s = st.drugs > ob.drogues_semaine ? 'over' : 'ok';
      host.append(cmpRow({
        label: 'Drogues sur la semaine', part: part('drogues'), s, sLabel: s === 'over' ? 'Au-dessus de l’objectif' : 'Dans l’objectif',
        value: `${fmt(st.drugs)} ${plural(st.drugs, 'prise', 'prises')}`, ref: `pour un objectif de ${fmt(ob.drogues_semaine)}`,
        v: st.drugs, max: Math.max(ob.drogues_semaine * 2, st.drugs, 1), ticks: [[ob.drogues_semaine, false]],
        note: `${st.counts.joint} ${plural(st.counts.joint, 'joint', 'joints')} et ${st.counts.autre_drogue} autre${st.counts.autre_drogue >= 2 ? 's prises' : ' prise'} (comptée${st.counts.autre_drogue >= 2 ? 's' : ''} ×${fmt(S.poids.autre_drogue)}). Pas de repère officiel.`,
      }));
    }
    const need = finished ? 4 : Math.min(4, st.elapsed);
    const sr = st.logged >= need ? 'ok' : finished ? 'warn' : 'wait';
    host.append(cmpRow({
      label: 'Régularité', part: part('regularite'), s: sr, sLabel: sr === 'ok' ? 'Bien suivi' : sr === 'warn' ? 'Trop peu de jours' : 'À compléter',
      value: `${st.logged} ${plural(st.logged, 'jour noté', 'jours notés')}`, ref: 'pour 4 attendus par semaine',
      v: st.logged, max: 7, ticks: [[4, false]],
      note: '« Rien du tout ce jour-là » compte aussi : un jour vide n’est pas un jour noté.',
    }));
  }

  // ---------------------------------------------------------------- advice (FR8, P4, P5)
  function renderAdvice(st) {
    const t = todayISO();
    // Early in a week there is little data: tips then look at the week before.
    const src = st.logged || S.viewWeek > t ? st : weekStats(addDays(S.viewWeek, -7));
    const tips = C.adviceFor(src.logged ? src : null, S.obj, S.tracks, 3);
    const { state, source } = avatarFor(S.viewWeek);
    const tr = trendFor(S.viewWeek);
    const declining = source === 'week' && ((tr && tr.declining) || state.key === 'decline' || state.key === 'street');
    $('#layout').classList.toggle('is-declining', declining);
    $('#h-advice').textContent = declining ? 'Ta semaine décroche : des pistes concrètes' : 'Conseils pour toi';
    $('#advice-sub').textContent = tips.some(x => !x.generic) ? 'Tirés de ta semaine. Coche celui que tu appliques : +10 points' : 'Une habitude à essayer : +10 points si tu la coches';
    const applied = extrasOf(S.viewWeek).advice;
    const canApply = S.viewWeek <= t;
    const host = $('#advice'); host.textContent = '';
    for (const a of tips) {
      const li = el('li', 'advice-item');
      const body = el('div', 'advice-body');
      body.append(el('strong', null, a.title), el('p', null, a.text));
      const b = el('button', 'advice-btn');
      b.type = 'button'; b.dataset.advice = a.id;
      const on = applied.includes(a.id);
      b.setAttribute('aria-pressed', String(on));
      b.textContent = on ? '✓ Je l’applique' : 'Je l’applique cette semaine';
      b.disabled = !canApply;
      li.append(body, b);
      host.append(li);
    }
    $('#help-box').hidden = !(C.needsHelp(st) || C.needsHelp(src));
  }

  async function saveWeek(m, patch, statusEl) {
    const cur = S.weeks.get(m) || { sport: 0, advice: [] };
    const row = Object.assign({ user_id: uid(), week: m, sport: num(cur.sport), advice: Array.isArray(cur.advice) ? cur.advice : [] }, patch);
    const { data, error } = await S.sb.from('ardoise_weeks').upsert(row, { onConflict: 'user_id,week' }).select().single();
    if (error) { if (statusEl) setStatus(statusEl, dbError(error), 'err'); return false; }
    S.weeks.set(m, data || row);
    return true;
  }

  // ---------------------------------------------------------------- tally marks
  function hash(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function rng(seed) { let a = seed; return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  const NS = 'http://www.w3.org/2000/svg';
  function sv(tag, attrs, parent) { const n = document.createElementNS(NS, tag); for (const k in attrs) n.setAttribute(k, attrs[k]); if (parent) parent.append(n); return n; }
  function tally(n, seed) {
    const r = rng(hash(seed)), j = () => (r() - 0.5) * 1.6;
    const shown = Math.min(n, 25), H = 18, gapS = 4.6, gapG = 7;
    const svg = sv('svg', { height: H, 'aria-hidden': 'true' });
    const g = sv('g', { stroke: 'currentColor', 'stroke-width': '1.9', 'stroke-linecap': 'round', fill: 'none' }, svg);
    let x = 2.5;
    for (let start = 0; start < shown; start += 5) {
      const inG = Math.min(5, shown - start), x0 = x;
      for (let i = 0; i < Math.min(inG, 4); i++) {
        const xi = x0 + i * gapS;
        sv('path', { d: `M${(xi + j() * 0.4).toFixed(1)} ${(2 + j() * 0.6).toFixed(1)}L${(xi + j() * 0.5).toFixed(1)} ${(H - 2 + j() * 0.6).toFixed(1)}` }, g);
      }
      if (inG === 5) sv('path', { d: `M${(x0 - 2).toFixed(1)} ${(H - 5 + j()).toFixed(1)}L${(x0 + 3 * gapS + 2).toFixed(1)} ${(5 + j()).toFixed(1)}` }, g);
      x = x0 + (Math.min(inG, 4) - 1) * gapS + gapG + 2;
    }
    const W = Math.max(8, x - gapG + 1);
    svg.setAttribute('width', W.toFixed(0));
    svg.setAttribute('viewBox', `0 0 ${W.toFixed(0)} ${H}`);
    return svg;
  }

  // ---------------------------------------------------------------- week: slate, table (FR3.2), sport (FR5.2.1)
  const pickCounts = e => Object.fromEntries(C.COUNT_KEYS.map(k => [k, Math.floor(num(e[k]))]));

  function renderWeek(st) {
    $('#empty-note').hidden = S.entries.size !== 0;
    const slate = S.weekMode === 'slate';
    $('#days').hidden = !slate;
    $('#week-table').hidden = slate;
    if (slate) renderDays(st); else renderWeekTable(st);
    $('#sport-box').hidden = S.viewWeek > todayISO();
    $('#w-sport').value = String(extrasOf(S.viewWeek).sport);
  }

  function renderDays(st) {
    const host = $('#days'), t = todayISO(), formDate = $('#f-date').value;
    const types = C.typesFor(S.tracks);
    host.textContent = '';
    for (const { d, e, u, fut, a } of st.days) {
      const li = el('li');
      const b = el('button', 'day'); b.type = 'button'; b.dataset.date = d;
      if (d === t) b.classList.add('is-today');
      if (fut) b.classList.add('is-future');
      if (d === formDate) b.classList.add('is-selected');
      b.setAttribute('aria-label', `${longDay(d)}, modifier`);
      const date = parse(d);
      const dt = el('span', 'day-date');
      dt.append(el('span', 'day-name', fDayShort.format(date).replace('.', '')), el('span', 'day-num', String(date.getDate())));
      const items = el('span', 'day-items');
      if (e) {
        for (const ty of types) {
          const c = num(e[ty.k]);
          if (!c) continue;
          const it = el('span', 'item');
          it.append(el('span', null, ty.label), tally(c, d + ty.k), el('span', 'item-n', String(c)));
          items.append(it);
        }
        if (typeof e.note === 'string' && e.note.trim()) items.append(el('span', 'item-note', e.note.trim()));
        if (!items.childNodes.length) items.append(el('span', 'day-empty', 'Rien du tout'));
      }
      if (!items.childNodes.length) items.append(el('span', 'day-empty', fut ? 'À venir' : d === t ? 'Rien de noté pour l’instant' : 'Rien de noté'));
      const right = el('span', 'day-right');
      if (tracked('alcool') && u > 0) {
        const un = el('span', 'day-units', fmt(u));
        un.append(el('small', null, ` ${plural(u, 'verre', 'verres')}`));
        right.append(un);
        const s = sEvening(u);
        if (s === 'over') right.append(pill('over', 'excès', true));
        else if (s === 'warn') right.append(pill('warn', 'chargée', true));
      } else if (tracked('alcool') && !fut && a === 0 && e) right.append(pill('ok', 'sans alcool', true));
      else if (!tracked('alcool') && e && !fut) right.append(pill('ok', 'noté', true));
      b.append(dt, items, right);
      li.append(b);
      host.append(li);
    }
  }

  function renderWeekTable(st) {
    const host = $('#week-table');
    const types = C.typesFor(S.tracks);
    const rows = st.days.map(({ d, e, fut }) => {
      const date = parse(d);
      const cells = types.map(ty => `<td><input class="cell" type="number" min="0" max="199" inputmode="numeric" id="t-${d}-${ty.k}" data-d="${d}" value="${e ? Math.floor(num(e[ty.k])) : ''}" placeholder="${e ? '0' : '·'}" ${fut ? 'disabled' : ''} aria-label="${esc(ty.label)}, ${esc(longDay(d))}"></td>`).join('');
      const label = `${cap(fDayShort.format(date).replace('.', ''))} ${date.getDate()}`;
      return `<tr class="${e ? 'is-logged' : ''}${fut ? ' is-future' : ''}"><th scope="row">${esc(label)}${e ? ' <span class="dot" title="noté"></span>' : ''}</th>${cells}</tr>`;
    }).join('');
    host.innerHTML = `<p class="hint" style="margin-bottom:8px">Complète d’un coup les jours oubliés. Un point vert marque les jours déjà notés.</p>
      <div class="table-scroll"><table class="wtable"><thead><tr><th scope="col">Jour</th>${types.map(ty => `<th scope="col">${esc(ty.label)}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div>
      <label class="check" style="margin-top:10px"><input type="checkbox" id="t-fill"><span>Compter les jours passés laissés vides comme « rien du tout »</span></label>
      <div class="entry-actions" style="margin-top:10px"><button type="button" class="primary" id="t-save">Enregistrer la semaine</button></div>
      <p class="status" id="t-status" role="status" aria-live="polite"></p>`;
    const dirty = new Set();
    host.oninput = ev => { if (ev.target.matches('.cell')) dirty.add(ev.target.dataset.d); };
    $('#t-save').addEventListener('click', async () => {
      const fill = $('#t-fill').checked, today = todayISO(), rowsOut = [];
      for (const { d, e, fut } of st.days) {
        if (fut || d > today) continue;
        if (!dirty.has(d) && !(fill && !e)) continue;
        const base = Object.assign(Object.fromEntries(C.COUNT_KEYS.map(k => [k, 0])), e ? pickCounts(e) : {});
        for (const ty of types) base[ty.k] = intVal(`t-${d}-${ty.k}`);
        rowsOut.push(Object.assign({ user_id: uid(), date: d, note: e && e.note ? e.note : null }, base));
      }
      if (!rowsOut.length) return setStatus('#t-status', 'Rien à enregistrer : modifie une case ou coche l’option des jours vides.', 'err');
      const btn = $('#t-save'); btn.disabled = true;
      const { data, error } = await S.sb.from('ardoise_entries').upsert(rowsOut, { onConflict: 'user_id,date' }).select();
      btn.disabled = false;
      if (error) return setStatus('#t-status', dbError(error), 'err');
      for (const r of (Array.isArray(data) && data.length ? data : rowsOut)) S.entries.set(r.date, r);
      renderAll();
      setStatus('#t-status', `${rowsOut.length} ${plural(rowsOut.length, 'jour enregistré', 'jours enregistrés')}.`, 'ok');
    });
  }

  // ---------------------------------------------------------------- charts
  function niceTicks(max, int) {
    const raw = max / 4, p = Math.pow(10, Math.floor(Math.log10(raw))), f = raw / p;
    let step = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p;
    if (int) step = Math.max(1, Math.round(step));
    const count = Math.ceil(max / step - 1e-9), ticks = [];
    for (let i = 0; i <= count; i++) ticks.push(+(i * step).toFixed(4));
    return { ticks, top: count * step };
  }

  function drawChart(host, pts, o) {
    host.textContent = '';
    const W = Math.max(260, Math.round(host.clientWidth || 600)), H = o.h;
    const m = { l: 38, r: 34, t: 12, b: 26 };
    const iw = W - m.l - m.r, ih = H - m.t - m.b, n = pts.length;
    const hasRef = o.ref != null && o.ref > 0;
    const vals = pts.map(p => p.v).filter(v => v != null);
    const vmax = Math.max(hasRef ? o.ref * 1.25 : 0, ...vals, o.int ? 2 : 1);
    const { ticks, top } = o.top ? { ticks: [0, 20, 40, 60, 80, 100], top: 100 } : niceTicks(vmax, o.int);
    const X = i => m.l + (n <= 1 ? iw / 2 : (i * iw) / (n - 1));
    const Y = v => m.t + ih - (v / top) * ih;
    const svg = sv('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, tabindex: '0', role: 'img', 'aria-label': o.aria });
    if (hasRef && o.zone !== false && o.ref < top) {
      sv('rect', { x: m.l, y: m.t, width: iw, height: Math.max(0, Y(o.ref) - m.t), class: 'g-zone' }, svg);
      if (Y(o.ref) - m.t >= 16 && o.zoneLabel) sv('text', { x: m.l + 6, y: m.t + 12, class: 'g-zone-l' }, svg).textContent = o.zoneLabel;
    }
    for (const t of ticks) {
      sv('line', { x1: m.l, x2: W - m.r, y1: Y(t), y2: Y(t), class: t === 0 ? 'g-axis' : 'g-grid' }, svg);
      sv('text', { x: m.l - 8, y: Y(t) + 4, class: 'g-tick', 'text-anchor': 'end' }, svg).textContent = Number.isInteger(t) ? fmtInt(t) : fmt(t);
    }
    const every = Math.max(1, Math.ceil(n / (W < 420 ? 4 : W < 700 ? 6 : 8)));
    for (let i = n - 1; i >= 0; i -= every) {
      const anchor = i === n - 1 ? 'end' : i === 0 ? 'start' : 'middle';
      sv('text', { x: X(i), y: H - 6, class: 'g-tick', 'text-anchor': anchor }, svg).textContent = pts[i].label;
    }
    const segs = []; let cur = [];
    pts.forEach((p, i) => { if (p.v == null) { if (cur.length) segs.push(cur); cur = []; } else cur.push(i); });
    if (cur.length) segs.push(cur);
    const path = sg => sg.map((i, k) => `${k ? 'L' : 'M'}${X(i).toFixed(1)} ${Y(pts[i].v).toFixed(1)}`).join('');
    for (const sg of segs) if (sg.length > 1) sv('path', { d: `${path(sg)}L${X(sg[sg.length - 1]).toFixed(1)} ${Y(0)}L${X(sg[0]).toFixed(1)} ${Y(0)}Z`, class: 'g-area', style: `fill:${o.color}` }, svg);
    if (hasRef) {
      sv('line', { x1: m.l, x2: W - m.r, y1: Y(o.ref), y2: Y(o.ref), class: 'g-ref' }, svg);
      sv('text', { x: W - m.r - 4, y: Y(o.ref) - 6, class: 'g-ref-l', 'text-anchor': 'end' }, svg).textContent = o.refLabel;
    }
    for (const sg of segs) {
      if (sg.length > 1) sv('path', { d: path(sg), class: 'g-line', style: `stroke:${o.color}` }, svg);
      else sv('circle', { cx: X(sg[0]), cy: Y(pts[sg[0]].v), r: 4, class: 'g-dot', style: `fill:${o.color}` }, svg);
    }
    let lastI = -1;
    for (let i = n - 1; i >= 0; i--) if (pts[i].v != null) { lastI = i; break; }
    if (lastI >= 0) {
      sv('circle', { cx: X(lastI), cy: Y(pts[lastI].v), r: 4.5, class: 'g-dot', style: `fill:${o.color}` }, svg);
      sv('text', { x: X(lastI) + 8, y: Y(pts[lastI].v) + 4, class: 'g-end' }, svg).textContent = o.int ? fmtInt(pts[lastI].v) : fmt(pts[lastI].v);
    }
    const cross = sv('line', { x1: 0, x2: 0, y1: m.t, y2: m.t + ih, class: 'g-cross', visibility: 'hidden' }, svg);
    const hdot = sv('circle', { r: 5, class: 'g-dot', style: `fill:${o.color}`, visibility: 'hidden' }, svg);
    sv('rect', { x: 0, y: 0, width: W, height: H, fill: 'transparent' }, svg);
    host.append(svg);

    const tip = el('div', 'tip'); tip.hidden = true; host.append(tip);
    let curI = -1;
    function show(i) {
      if (!n) return;
      i = Math.max(0, Math.min(n - 1, i)); curI = i;
      const p = pts[i], x = X(i), has = p.v != null, y = has ? Y(p.v) : Y(0);
      cross.setAttribute('x1', x); cross.setAttribute('x2', x); cross.setAttribute('visibility', 'visible');
      hdot.setAttribute('cx', x); hdot.setAttribute('cy', y); hdot.setAttribute('visibility', has ? 'visible' : 'hidden');
      tip.textContent = '';
      const v = el('div', 'tip-v'), key = el('span', 'tip-key'); key.style.background = o.color;
      v.append(key, document.createTextNode(has ? `${o.int ? fmtInt(p.v) : fmt(p.v)} ${o.unit(p.v)}` : 'Pas de données'));
      tip.append(v, el('div', 'tip-l', p.sub));
      if (p.extra && has) tip.append(el('div', 'tip-x', p.extra));
      tip.hidden = false;
      const scale = svg.getBoundingClientRect().width / W || 1;
      const px = x * scale, tw = tip.offsetWidth, hw = host.clientWidth;
      let left = px + 14; if (left + tw > hw) left = px - tw - 14; if (left < 0) left = 0;
      tip.style.left = `${left}px`;
      tip.style.top = `${Math.max(0, Math.min(H * scale - tip.offsetHeight, y * scale - tip.offsetHeight / 2))}px`;
    }
    function hide() { cross.setAttribute('visibility', 'hidden'); hdot.setAttribute('visibility', 'hidden'); tip.hidden = true; }
    const pick = ev => { const r = svg.getBoundingClientRect(); const x = ((ev.clientX - r.left) * W) / r.width; show(n <= 1 ? 0 : Math.round((x - m.l) / (iw / (n - 1)))); };
    svg.addEventListener('pointermove', pick);
    svg.addEventListener('pointerdown', pick);
    svg.addEventListener('pointerleave', hide);
    svg.addEventListener('focus', () => show(curI < 0 ? n - 1 : curI));
    svg.addEventListener('blur', hide);
    svg.addEventListener('keydown', ev => {
      if (ev.key === 'ArrowLeft') { show(curI - 1); ev.preventDefault(); }
      else if (ev.key === 'ArrowRight') { show(curI + 1); ev.preventDefault(); }
      else if (ev.key === 'Escape') hide();
    });
  }

  function breakdown(counts) {
    const parts = [];
    for (const t of C.TYPES) {
      if (t.sub !== 'alcool') continue;
      const c = num(counts && counts[t.k]);
      if (c) parts.push(`${c} ${plural(c, t.one, t.many)}`);
    }
    return parts.length ? parts.join(' · ') : 'Rien d’alcoolisé';
  }

  function chartData() {
    const t = todayISO(), rows = [], alc = [], cig = [], drug = [], score = [], pts = [];
    for (let i = 11; i >= 0; i--) {
      const m = addDays(S.viewWeek, -7 * i), sc = scoreOf(m), label = fShort.format(parse(m)), sub = `Semaine du ${weekRange(m)}`;
      score.push({ label, sub, v: sc ? sc.total : null, extra: sc ? (isBaseline(m) ? 'Semaine de référence' : `${sc.state.label}${sc.provisional ? ' · provisoire' : ''}`) : '' });
      const pw = m > t ? null : pointsOf(m);
      pts.push({ label, sub, v: pw ? pw.total : null, extra: pw ? pw.items.map(x => `${x.label} (+${x.pts})`).join(' · ') : '' });
    }
    if (S.range === 'weeks') {
      for (let i = 11; i >= 0; i--) {
        const m = addDays(S.viewWeek, -7 * i), st = weekStats(m), label = fShort.format(parse(m)), sub = `Semaine du ${weekRange(m)}`;
        alc.push({ label, sub, v: st.units, extra: breakdown(st.counts) });
        cig.push({ label, sub, v: st.cigAvg, extra: `${st.cigs} sur ${st.logged} ${plural(st.logged, 'jour noté', 'jours notés')}` });
        drug.push({ label, sub, v: st.drugs, extra: `${st.counts.joint} ${plural(st.counts.joint, 'joint', 'joints')}, ${st.counts.autre_drogue} autre(s)` });
        rows.push({ p: weekRange(m), alc: st.units, over: st.units > S.obj.semaine, cig: st.cigs, cigAvg: st.cigAvg, drug: st.drugs, score: score[11 - i].v, pts: pts[11 - i].v, logged: st.logged });
      }
    } else {
      const sun = addDays(S.viewWeek, 6), end = sun < t ? sun : t;
      for (let i = 29; i >= 0; i--) {
        const d = addDays(end, -i), e = S.entries.get(d) || null, u = C.alcUnits(e, S.poids), label = fShort.format(parse(d)), sub = longDay(d);
        alc.push({ label, sub, v: u, extra: e ? breakdown(e) : 'Rien de noté' });
        cig.push({ label, sub, v: num(e && e.cigarettes) });
        drug.push({ label, sub, v: C.drugUnits(e, S.poids) });
        rows.push({ p: longDay(d), alc: u, over: u > S.obj.soiree, cig: num(e && e.cigarettes), cigAvg: null, drug: C.drugUnits(e, S.poids), score: null, pts: null, logged: e ? 1 : 0 });
      }
    }
    return { alc, cig, drug, score, pts, rows };
  }

  function renderCharts() {
    if (S.view !== 'main') return;
    const w = S.range === 'weeks', d = chartData(), ob = S.obj;
    $('#cb-alc').hidden = !tracked('alcool');
    $('#cb-cig').hidden = !tracked('cigarettes');
    $('#cb-drug').hidden = !tracked('drogues');
    $('#multiples').dataset.n = String(1 + (tracked('cigarettes') ? 1 : 0) + (tracked('drogues') ? 1 : 0));
    if (tracked('alcool')) {
      $('#u-alc').textContent = w ? 'verres standard par semaine' : 'verres standard par jour';
      drawChart($('#ch-alc'), d.alc, {
        h: 220, color: 'var(--c-alc)', unit: v => `${plural(v, 'verre', 'verres')} standard`,
        ref: w ? ob.semaine : ob.soiree, refLabel: w ? `objectif ${fmt(ob.semaine)}` : `max. soirée ${fmt(ob.soiree)}`, zoneLabel: 'au-dessus de l’objectif',
        aria: w ? 'Courbe des verres standard par semaine sur 12 semaines' : 'Courbe des verres standard par jour sur 30 jours',
      });
    }
    drawChart($('#ch-score'), d.score, {
      h: 170, color: 'var(--c-score)', unit: () => 'sur 100', top: 100, zone: false, int: true,
      ref: 80, refLabel: 'pleine forme dès 80', aria: 'Courbe du score hebdomadaire sur 12 semaines',
    });
    drawChart($('#ch-pts'), d.pts, {
      h: 160, color: 'var(--c-pts)', unit: () => 'points', int: true, zone: false, aria: 'Courbe des points gagnés par semaine sur 12 semaines',
    });
    if (tracked('cigarettes')) {
      $('#u-cig').textContent = w ? 'moyenne par jour noté' : 'par jour';
      drawChart($('#ch-cig'), d.cig, {
        h: 160, color: 'var(--c-cig)', int: !w, unit: v => (w ? `${plural(v, 'cigarette', 'cigarettes')} par jour` : plural(v, 'cigarette', 'cigarettes')),
        ref: ob.cigarettes_jour, refLabel: `objectif ${fmt(ob.cigarettes_jour)}`, aria: 'Courbe des cigarettes par jour',
      });
    }
    if (tracked('drogues')) {
      $('#u-drug').textContent = w ? 'prises pondérées par semaine' : 'prises pondérées par jour';
      drawChart($('#ch-drug'), d.drug, {
        h: 160, color: 'var(--c-joint)', unit: v => plural(v, 'prise', 'prises'),
        ref: w ? ob.drogues_semaine : null, refLabel: `objectif ${fmt(ob.drogues_semaine)}`,
        aria: w ? 'Courbe des prises de drogues par semaine' : 'Courbe des prises de drogues par jour',
      });
    }
    renderTable(d.rows, w);
  }

  function renderTable(rows, w) {
    const tb = $('#tbl'); tb.textContent = '';
    const cols = [[w ? 'Semaine' : 'Jour', r => r.p]];
    if (tracked('alcool')) cols.push(['Alcool (verres std)', r => fmt(r.alc), r => (r.over ? 'over' : null)]);
    if (tracked('cigarettes')) cols.push([w ? 'Cigarettes (moy.)' : 'Cigarettes', r => (w ? `${r.cig} (${fmt(r.cigAvg)})` : String(r.cig))]);
    if (tracked('drogues')) cols.push(['Drogues (prises)', r => fmt(r.drug)]);
    if (w) cols.push(['Jours notés', r => String(r.logged)], ['Score', r => (r.score == null ? '–' : String(r.score))], ['Points', r => (r.pts == null ? '–' : fmtInt(r.pts))]);
    const thead = el('thead'), hr = el('tr');
    for (const [h] of cols) hr.append(el('th', null, h));
    thead.append(hr); tb.append(thead);
    const body = el('tbody');
    for (const r of rows.slice().reverse()) {
      const tr = el('tr');
      for (const [, f, c] of cols) tr.append(el('td', c ? c(r) : null, f(r)));
      body.append(tr);
    }
    tb.append(body);
  }

  // ---------------------------------------------------------------- entry form (FR3.1)
  function buildSteppers() {
    const host = $('#steppers');
    let html = '';
    for (const sub of S.tracks) {
      html += `<fieldset class="group"><legend>${esc(C.SUBSTANCES[sub].label)}</legend>`;
      for (const t of C.TYPES.filter(x => x.sub === sub)) {
        html += `<div class="step"><label for="f-${t.k}"><span class="step-name">${t.label}</span><span class="step-sub" id="sub-${t.k}"></span></label>${stepperHTML(`f-${t.k}`, 0, 199, t.label)}</div>`;
      }
      html += '</fieldset>';
    }
    host.innerHTML = html;
    wireSteppers(host, () => { S.formDirty = true; updateTotal(); });
  }

  function updateSubs() {
    for (const t of C.typesFor(S.tracks)) {
      const w = num(S.poids[t.k]);
      let txt = t.size;
      if (t.sub === 'alcool' && (!t.soft || w > 0)) txt += `${txt ? ' · ' : ''}≈ ${fmt(w)} ${plural(w, 'verre', 'verres')}`;
      if (t.sub === 'drogues' && w !== 1) txt += ` · compte ${fmt(w)}`;
      const n = $(`#sub-${t.k}`); if (n) n.textContent = txt;
    }
  }

  function formValues() {
    const d = $('#f-date').value, e = S.entries.get(d);
    const v = Object.assign(Object.fromEntries(C.COUNT_KEYS.map(k => [k, 0])), e ? pickCounts(e) : {});
    for (const t of C.typesFor(S.tracks)) v[t.k] = intVal(`f-${t.k}`);
    return v;
  }

  function updateTotal() {
    if (!$('#f-total')) return;
    $('#f-total-box').hidden = !tracked('alcool');
    if (!tracked('alcool')) return;
    const u = C.alcUnits(formValues(), S.poids);
    $('#f-total').textContent = `= ${fmt(u)} ${plural(u, 'verre', 'verres')} standard`;
    const f = $('#f-flag'); f.textContent = '';
    if (u > 0) { const s = sEvening(u); f.append(pill(s, s === 'over' ? 'excès ponctuel' : s === 'warn' ? 'soirée chargée' : 'raisonnable', true)); }
  }

  function loadForm(d) {
    $('#f-date').value = d;
    const e = S.entries.get(d) || null;
    for (const t of C.typesFor(S.tracks)) $(`#f-${t.k}`).value = String(e ? Math.floor(num(e[t.k])) : 0);
    $('#f-note').value = e && typeof e.note === 'string' ? e.note : '';
    $('#f-save').textContent = e ? 'Mettre à jour' : 'Enregistrer';
    $('#f-del').hidden = !e;
    disarm();
    $('#f-when').textContent = `${longDay(d)}. Après minuit, ça compte pour la soirée de la veille.`;
    S.formDirty = false;
    updateTotal();
  }

  let armTimer = null;
  function disarm() { const b = $('#f-del'); if (!b) return; b.classList.remove('armed'); b.textContent = 'Effacer ce jour'; clearTimeout(armTimer); }

  async function saveEntry(zero) {
    const d = $('#f-date').value;
    if (!C.isISODate(d)) return setStatus('#f-status', 'Choisis une date.', 'err');
    if (d > todayISO()) return setStatus('#f-status', 'On ne note pas une journée qui n’a pas encore eu lieu.', 'err');
    const counts = zero ? Object.fromEntries(C.COUNT_KEYS.map(k => [k, 0])) : formValues();
    const row = Object.assign({ user_id: uid(), date: d }, counts, { note: $('#f-note').value.trim().slice(0, 500) || null });
    const btns = ['#f-save', '#f-zero'].map(s => $(s));
    btns.forEach(b => { b.disabled = true; });
    const m = mondayOf(d), before = scoreOf(m), ptsBefore = pointsOf(m).total;
    try {
      const { data, error } = await S.sb.from('ardoise_entries').upsert(row, { onConflict: 'user_id,date' }).select().single();
      if (error) throw error;
      S.entries.set(d, data || row);
      S.formDirty = false;
      if (m !== S.viewWeek) S.viewWeek = m;
      loadForm(d);
      renderAll();
      const after = scoreOf(m), gained = pointsOf(m).total - ptsBefore;
      let msg = `${longDay(d)} enregistré.`;
      if (gained > 0) msg += ` +${gained} points.`;
      if (!isBaseline(m) && after && before && after.state.key !== before.state.key) msg += ` Ton personnage passe à « ${after.state.label} ».`;
      setStatus('#f-status', msg, 'ok');
    } catch (e) {
      setStatus('#f-status', dbError(e), 'err');
    } finally { btns.forEach(b => { b.disabled = false; }); }
  }

  async function deleteEntry() {
    const b = $('#f-del');
    if (!b.classList.contains('armed')) {
      b.classList.add('armed'); b.textContent = 'Confirmer l’effacement';
      armTimer = setTimeout(disarm, 4000);
      return;
    }
    disarm();
    const d = $('#f-date').value;
    b.disabled = true;
    try {
      const { error } = await S.sb.from('ardoise_entries').delete().eq('user_id', uid()).eq('date', d);
      if (error) throw error;
      S.entries.delete(d);
      loadForm(d);
      renderAll();
      setStatus('#f-status', `${longDay(d)} effacé.`, 'ok');
    } catch (e) { setStatus('#f-status', dbError(e), 'err'); }
    finally { b.disabled = false; }
  }

  function wireMain() {
    $('#prev-week').addEventListener('click', () => { S.viewWeek = addDays(S.viewWeek, -7); renderAll(); });
    $('#next-week').addEventListener('click', () => { S.viewWeek = addDays(S.viewWeek, 7); renderAll(); });
    $('#this-week').addEventListener('click', () => { S.viewWeek = mondayOf(todayISO()); renderAll(); });
    $('#btn-settings').addEventListener('click', () => openSettings());
    const seg = (a, b, key, val, after) => {
      $(a).addEventListener('click', () => { S[key] = val; $(a).setAttribute('aria-pressed', 'true'); $(b).setAttribute('aria-pressed', 'false'); after(); });
    };
    seg('#r-weeks', '#r-days', 'range', 'weeks', renderCharts);
    seg('#r-days', '#r-weeks', 'range', 'days', renderCharts);
    seg('#w-slate', '#w-table', 'weekMode', 'slate', () => renderWeek(weekStats(S.viewWeek)));
    seg('#w-table', '#w-slate', 'weekMode', 'table', () => renderWeek(weekStats(S.viewWeek)));
    $('#days').addEventListener('click', ev => {
      const b = ev.target.closest('button[data-date]');
      if (!b) return;
      loadForm(b.dataset.date);
      setStatus('#f-status', '');
      renderDays(weekStats(S.viewWeek));
      if (window.innerWidth < 980) $('#entry').scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block: 'start' });
    });
    $('#f-date').addEventListener('change', () => {
      const d = $('#f-date').value;
      if (!C.isISODate(d)) return;
      loadForm(d);
      if (mondayOf(d) !== S.viewWeek) { S.viewWeek = mondayOf(d); renderAll(); } else renderWeek(weekStats(S.viewWeek));
    });
    $('#f-note').addEventListener('input', () => { S.formDirty = true; });
    $('#entry').addEventListener('submit', ev => { ev.preventDefault(); saveEntry(false); });
    $('#f-zero').addEventListener('click', () => saveEntry(true));
    $('#f-del').addEventListener('click', deleteEntry);

    // Sport: one write per pause, so a burst of + taps is a single upsert.
    let sportTimer = null;
    wireSteppers($('#sport-box'), () => {
      clearTimeout(sportTimer);
      const m = S.viewWeek;
      sportTimer = setTimeout(async () => {
        const v = intVal('w-sport', 21);
        if (await saveWeek(m, { sport: v }, '#sport-status')) {
          setStatus('#sport-status', `${v} ${plural(v, 'séance enregistrée', 'séances enregistrées')}.`, 'ok');
          renderHero(weekStats(S.viewWeek)); renderCharts();
        }
      }, 600);
    });

    $('#advice').addEventListener('click', async ev => {
      const b = ev.target.closest('button[data-advice]');
      if (!b) return;
      const m = S.viewWeek, id = b.dataset.advice;
      const cur = extrasOf(m).advice;
      const next = cur.includes(id) ? cur.filter(x => x !== id) : cur.concat(id);
      b.disabled = true;
      if (await saveWeek(m, { advice: next })) { renderAdvice(weekStats(m)); renderHero(weekStats(m)); renderCharts(); }
      else b.disabled = false;
    });

    let lastW = 0, raf = 0;
    const ro = new ResizeObserver(() => {
      const ch = $('#ch-score'); if (!ch) return;
      const w = ch.clientWidth;
      if (Math.abs(w - lastW) < 2) return;
      lastW = w; cancelAnimationFrame(raf); raf = requestAnimationFrame(renderCharts);
    });
    ro.observe($('#ch-score'));
  }

  // ================================================================ SETTINGS
  const OBJ_SET_FIELDS = [
    ['alcool', 'semaine', 'Alcool par semaine', 'au plus, en verres standard', 1],
    ['alcool', 'jours_sans', 'Jours sans alcool par semaine', 'au moins', 1],
    ['alcool', 'soiree', 'Verres par soirée', 'au plus', 0.5],
    ['alcool', 'exces', 'Seuil d’excès ponctuel', 'en verres standard en une occasion', 1],
    ['cigarettes', 'cigarettes_jour', 'Cigarettes par jour', 'au plus, en moyenne', 1],
    ['drogues', 'drogues_semaine', 'Prises de drogues par semaine', 'au plus, pondérées', 1],
  ];

  function openSettings() {
    const dlg = $('#dlg-settings');
    const p = S.profile || {};
    const look = Object.assign({}, S.look);
    const habits = JSON.parse(JSON.stringify(p.habits || {}));
    let day = p.reminder_day || 1;
    const row = (id, label, hint, val, step) => `<label class="cfg-row" for="${id}"><span>${label}<small>${hint}</small></span><input class="num-in" type="number" id="${id}" min="0" step="${step}" inputmode="decimal" value="${val}"></label>`;
    dlg.innerHTML = `<form class="dlg" id="set-form" novalidate>
      <div class="dlg-head"><h2 id="set-title">Réglages</h2><button type="button" class="dlg-x" id="set-x" aria-label="Fermer">×</button></div>
      <div class="dlg-body">
        <section><h3>Ce que je veux réduire</h3>
          ${C.SUBSTANCE_KEYS.map(k => `<label class="check"><input type="checkbox" id="set-tr-${k}" ${S.tracks.includes(k) ? 'checked' : ''}><span>${esc(C.SUBSTANCES[k].label)}</span></label>`).join('')}
          <p class="hint">Seules les consommations cochées apparaissent dans la saisie, le score, les points et les conseils.</p>
        </section>
        <section><h3>Mes objectifs</h3>${OBJ_SET_FIELDS.map(([sub, k, l, h, st]) => `<div data-sub="${sub}">${row(`so-${k}`, l, h, S.obj[k], st)}</div>`).join('')}</section>
        <section><h3>Mon personnage</h3>
          <div class="field"><label for="set-pseudo">Prénom ou pseudo</label><input type="text" id="set-pseudo" maxlength="40" value="${esc(p.pseudo || '')}"></div>
          <div class="look-grid">${lookPickerHTML('set')}<div class="look-prev" id="set-prev"></div></div>
        </section>
        <section><h3>Rappels par e-mail</h3>
          <label class="check"><input type="checkbox" id="set-remind" ${p.reminder_enabled ? 'checked' : ''}><span>M’envoyer un rappel si ma semaine précédente n’est pas complète</span></label>
          <div class="field"><label for="set-email">Adresse pour les rappels</label><input type="email" id="set-email" autocomplete="email" value="${esc(p.reminder_email || (S.session.user && S.session.user.email) || '')}"></div>
          <div class="field"><span class="lbl">Le jour du rappel</span>${chipsHTML('day', WEEKDAYS.map((w, i) => [String(i + 1), w]), String(day))}</div>
        </section>
        ${S.isAdmin ? `<section><h3>Administration : matrice de pondération</h3><p class="hint">S’applique à tous les utilisateurs. Alcool en verres standard (10 g), drogues en prises, cigarettes à l’unité.</p>
          ${C.TYPES.map(t => row(`sw-${t.k}`, t.label, t.size, S.poids[t.k], 0.1)).join('')}
          <div class="entry-actions"><button type="button" class="ghost" id="sw-save">Enregistrer la matrice</button></div><p class="status" id="sw-status" role="status" aria-live="polite"></p></section>` : ''}
        <section><h3>Mon compte et mes données</h3>
          <p class="sub">Connecté avec ${esc((S.session.user && S.session.user.email) || '')}</p>
          <div class="account-actions">
            <button type="button" class="ghost" id="set-tuto">Revoir le tutoriel</button>
            <button type="button" class="ghost" id="set-export">Télécharger mes données</button>
            <button type="button" class="ghost" id="set-out">Se déconnecter</button>
            <button type="button" class="ghost danger" id="set-del">Supprimer mon compte</button>
          </div>
          <p class="status" id="set-del-status" role="status" aria-live="polite"></p>
        </section>
      </div>
      <div class="dlg-foot"><p class="status" id="set-status" role="status" aria-live="polite"></p><button type="submit" class="primary" id="set-save">Enregistrer</button></div>
    </form>`;
    const cur = avatarFor(S.viewWeek).state;
    const prev = () => { $('#set-prev').innerHTML = AV.svg(cur.key, look); };
    wireLookPicker($('#set-pick'), look, prev);
    prev();
    wireChips($('#set-form'), (g, v) => { if (g === 'day') day = Number(v); });
    const syncObj = () => { for (const k of C.SUBSTANCE_KEYS) for (const n of $$(`[data-sub="${k}"]`, dlg)) n.hidden = !$(`#set-tr-${k}`).checked; };
    for (const k of C.SUBSTANCE_KEYS) $(`#set-tr-${k}`).addEventListener('change', syncObj);
    syncObj();
    $('#set-x').addEventListener('click', () => dlg.close());
    $('#set-tuto').addEventListener('click', () => { dlg.close(); startTutorial(); });
    $('#set-out').addEventListener('click', async () => { dlg.close(); await S.sb.auth.signOut(); });
    $('#set-export').addEventListener('click', exportData);
    if (S.isAdmin) $('#sw-save').addEventListener('click', async () => {
      const value = {};
      for (const t of C.TYPES) {
        const v = Number($(`#sw-${t.k}`).value);
        if (!Number.isFinite(v) || v < 0) return setStatus('#sw-status', 'Chaque poids doit être un nombre positif.', 'err');
        value[t.k] = v;
      }
      const { error } = await S.sb.from('ardoise_config').update({ value }).eq('key', 'poids').select().single();
      if (error) return setStatus('#sw-status', dbError(error), 'err');
      S.poids = C.mergeNumbers(C.DEFAULT_POIDS, value);
      setStatus('#sw-status', 'Matrice enregistrée pour tout le monde.', 'ok');
      renderAll();
    });
    let delArmed = false;
    $('#set-del').addEventListener('click', async () => {
      const b = $('#set-del');
      if (!delArmed) {
        delArmed = true; b.classList.add('armed'); b.textContent = 'Oui, tout supprimer définitivement';
        setStatus('#set-del-status', 'Ton personnage, tes réglages et tout ton historique L\u2019Ardoise seront effacés. Impossible de revenir en arrière.', 'err');
        return;
      }
      b.disabled = true;
      const { error } = await S.sb.rpc('ardoise_delete_me');
      if (error) { b.disabled = false; return setStatus('#set-del-status', dbError(error), 'err'); }
      dlg.close();
      await S.sb.auth.signOut();
      renderLanding('signup', 'Tes données L\u2019Ardoise ont été supprimées.');
    });
    $('#set-form').addEventListener('submit', async ev => {
      ev.preventDefault();
      const tr = C.SUBSTANCE_KEYS.filter(k => $(`#set-tr-${k}`).checked);
      if (!tr.length) return setStatus('#set-status', 'Coche au moins une consommation à suivre.', 'err');
      for (const k of C.SUBSTANCE_KEYS) {
        habits[k] = Object.assign({}, habits[k] || {}, tr.includes(k) ? { use: true, issue: true } : { issue: false });
      }
      const objectifs = Object.assign({}, S.obj);
      for (const [, k] of OBJ_SET_FIELDS) {
        const v = Number($(`#so-${k}`).value);
        if (!Number.isFinite(v) || v < 0) return setStatus('#set-status', 'Chaque objectif doit être un nombre positif.', 'err');
        objectifs[k] = v;
      }
      const pseudo = $('#set-pseudo').value.trim().slice(0, 40);
      if (!pseudo) return setStatus('#set-status', 'Ton personnage a besoin d’un prénom ou d’un pseudo.', 'err');
      const remind = $('#set-remind').checked, email = $('#set-email').value.trim();
      if (remind && !EMAIL_RE.test(email)) return setStatus('#set-status', 'Entre une adresse e-mail valide pour les rappels, ou décoche-les.', 'err');
      const btn = $('#set-save'); btn.disabled = true;
      const { data, error } = await S.sb.from('ardoise_profiles')
        .update({ objectifs, pseudo, look, habits, reminder_enabled: remind, reminder_email: email || null, reminder_day: day })
        .eq('user_id', uid()).select().single();
      btn.disabled = false;
      if (error) return setStatus('#set-status', dbError(error), 'err');
      applyProfile(data);
      dlg.close();
      renderMain();
    });
    dlg.showModal();
  }

  function exportData() {
    const payload = {
      exported_at: new Date().toISOString(),
      account: { email: S.session.user && S.session.user.email },
      profile: S.profile,
      entries: Array.from(S.entries.values()).sort((a, b) => (a.date < b.date ? -1 : 1)),
      weeks: Array.from(S.weeks.values()),
      weighting: S.poids,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `ardoise-${todayISO()}.json`;
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  // ================================================================ WEEKLY SUMMARY
  function maybeShowBilan() {
    const last = addDays(mondayOf(todayISO()), -7);
    if (!S.profile || S.profile.last_bilan_week === last) return;
    const st = weekStats(last);
    if (!st.logged) return;
    const sc = scoreOf(last), pw = pointsOf(last);
    const baseline = isBaseline(last);
    const prevM = addDays(last, -7), prev = isBaseline(prevM) ? null : scoreOf(prevM);
    const dlg = $('#dlg-bilan');
    const delta = prev && !baseline ? sc.total - prev.total : null;
    const deltaTxt = delta == null ? '' : delta === 0 ? 'Pareil que la semaine d’avant.' : `${delta > 0 ? '+' : '−'}${Math.abs(delta)} points de score par rapport à la semaine d’avant.`;
    const proposal = baseline ? C.objectifsFromBaseline(st, S.obj) : null;
    const sportAnswered = S.weeks.has(last);
    const propRows = proposal ? [
      ['alcool', `Alcool : ${fmt(proposal.semaine)} verres standard par semaine (mesuré : ${fmt(st.units)})`],
      ['alcool', `Jours sans alcool : ${proposal.jours_sans} au moins (mesuré : ${st.dry})`],
      ['cigarettes', `Cigarettes : ${proposal.cigarettes_jour} par jour (mesuré : ${fmt(st.cigAvg)})`],
      ['drogues', `Drogues : ${proposal.drogues_semaine} prises par semaine (mesuré : ${fmt(st.drugs)})`],
    ].filter(r => tracked(r[0])).map(r => `<li>${esc(r[1])}</li>`).join('') : '';
    dlg.innerHTML = `<div class="dlg">
      <div class="dlg-head"><h2 id="bilan-title">${baseline ? 'Ta semaine de référence' : 'Bilan de la semaine'} du ${esc(weekRange(last))}</h2><button type="button" class="dlg-x" id="bilan-x" aria-label="Fermer">×</button></div>
      <div class="dlg-body">
        <div class="bilan-scene">${AV.svg(baseline ? 'ok' : sc.state.key, S.look, { title: 'Ton personnage' })}</div>
        ${baseline ? `<p>Merci d’avoir tout noté. Voici des objectifs calés sur ta vraie semaine, à −20 % :</p><ul class="proposal">${propRows}</ul>
          <div class="entry-actions"><button type="button" class="primary" id="bilan-adopt">Adopter ces objectifs</button><button type="button" class="ghost" id="bilan-keep">Garder les miens</button></div>
          <p class="status" id="bilan-status" role="status" aria-live="polite"></p>`
        : `<div class="bilan-score"><strong>${sc.total}/100</strong><span id="bilan-chip"></span></div><p>${esc(sc.state.msg)} ${esc(deltaTxt)}</p>${partsHTML(sc.parts)}`}
        <div class="bilan-points"><strong>+${fmtInt(pw.total)} points</strong><span>${esc(pw.items.map(x => `${x.label} (+${x.pts})`).join(' · ') || 'Aucun point cette semaine')}</span></div>
        ${sportAnswered ? '' : `<div class="sport"><label for="b-sport"><span class="step-name">Combien de séances de sport la semaine dernière ?</span><span class="step-sub">+${C.POINTS.sport} points chacune</span></label>${stepperHTML('b-sport', 0, 21, 'Séances de sport')}</div>`}
        ${C.needsHelp(st) ? `<div class="help-box">${HELP_HTML}</div>` : ''}
      </div>
      <div class="dlg-foot"><span></span><button type="button" class="primary" id="bilan-ok">C'est noté</button></div></div>`;
    if (!baseline) $('#bilan-chip').append(stateChip(sc.state));
    if (!sportAnswered) wireSteppers($('.dlg', dlg), () => {});
    let closed = false;
    const done = async () => {
      if (closed) return;
      closed = true;
      if (!sportAnswered && $('#b-sport')) await saveWeek(last, { sport: intVal('b-sport', 21) });
      if (dlg.open) dlg.close();
      const { data } = await S.sb.from('ardoise_profiles').update({ last_bilan_week: last }).eq('user_id', uid()).select().single();
      if (data) S.profile = data;
      renderAll();
    };
    if (baseline) {
      $('#bilan-adopt').addEventListener('click', async () => {
        const objectifs = Object.assign({}, S.obj, proposal);
        const { data, error } = await S.sb.from('ardoise_profiles').update({ objectifs }).eq('user_id', uid()).select().single();
        if (error) return setStatus('#bilan-status', dbError(error), 'err');
        applyProfile(data);
        setStatus('#bilan-status', 'Objectifs mis à jour.', 'ok');
        $('#bilan-adopt').disabled = true;
      });
      $('#bilan-keep').addEventListener('click', done);
    }
    $('#bilan-ok').addEventListener('click', done);
    $('#bilan-x').addEventListener('click', done);
    dlg.addEventListener('cancel', ev => { ev.preventDefault(); done(); });
    dlg.showModal();
  }

  // ================================================================ TUTORIAL
  const TUTO = [
    { sel: '#avatar-card', title: 'Ton personnage et ton score', text: 'Ton score de la semaine, sur 100, fait vivre ton personnage : cabriolet au-dessus de 80, citadine dès 60, voiture qui fume dès 40, à la rue en dessous. Pendant ta semaine de référence, il reste neutre.' },
    { sel: '#points-card', title: 'Tes points', text: 'Ils récompensent l’effort : chaque jour noté, le sport, les objectifs tenus, les conseils appliqués. Ils ne baissent jamais, même après une semaine difficile.' },
    { sel: '#entry', title: 'Noter une journée', text: 'Chaque jour, ou le lendemain matin, note ce que tu as consommé avec les + et −. Une journée sans rien ? Un seul bouton : « Rien du tout ce jour-là ».' },
    { sel: '#cmp-panel', title: 'Par rapport au raisonnable', text: 'Ta semaine face aux repères santé et à tes objectifs, ligne par ligne, avec le poids de chacune dans le score.' },
    { sel: '#advice-panel', title: 'Des conseils qui te ressemblent', text: 'Ils partent de tes données. Coche celui que tu appliques cette semaine : +10 points. Quand ta semaine décroche, ils remontent en haut de la page.' },
    { sel: '#week-panel', title: 'La semaine', text: 'Tes jours en bâtons, comme sur un sous-bock. Le mode tableau permet de compléter les jours oubliés d’un coup. Note aussi tes séances de sport ici.' },
    { sel: '#curves', title: 'Les courbes', text: 'La tendance sur 12 semaines ou 30 jours : consommation, score et points.' },
    { sel: '#btn-settings', title: 'Réglages', text: 'Ce que tu suis, tes objectifs, ton personnage, le jour du rappel par e-mail, l’export et la suppression de tes données. Le tutoriel se relance d’ici.' },
  ];
  let tutoState = null;

  function startTutorial() {
    endTutorial(false);
    const block = el('div', 'tuto-block');
    const spot = el('div', 'tuto-spot');
    const card = el('div', 'tuto-card');
    card.setAttribute('role', 'dialog'); card.setAttribute('aria-modal', 'true'); card.setAttribute('aria-labelledby', 'tuto-title');
    document.body.append(block, spot, card);
    tutoState = { i: 0, block, spot, card };
    tutoState.onKey = ev => { if (ev.key === 'Escape') endTutorial(true); };
    tutoState.onMove = () => placeTuto();
    document.addEventListener('keydown', tutoState.onKey);
    window.addEventListener('resize', tutoState.onMove);
    window.addEventListener('scroll', tutoState.onMove, { passive: true });
    showTuto(0);
  }

  function showTuto(i) {
    const ts = tutoState; if (!ts) return;
    ts.i = i;
    const step = TUTO[i];
    const target = $(step.sel);
    ts.card.innerHTML = `<span class="tuto-count">${i + 1} / ${TUTO.length}</span><h3 id="tuto-title">${esc(step.title)}</h3><p>${esc(step.text)}</p>
      <div class="tuto-nav"><button type="button" class="link" id="tuto-skip">Passer le tutoriel</button>
      <span class="entry-actions">${i > 0 ? '<button type="button" class="ghost" id="tuto-prev">Précédent</button>' : ''}<button type="button" class="primary" id="tuto-next">${i === TUTO.length - 1 ? 'Terminer' : 'Suivant'}</button></span></div>`;
    $('#tuto-skip').addEventListener('click', () => endTutorial(true));
    if (i > 0) $('#tuto-prev').addEventListener('click', () => showTuto(i - 1));
    $('#tuto-next').addEventListener('click', () => (i === TUTO.length - 1 ? endTutorial(true) : showTuto(i + 1)));
    if (target) {
      const r = target.getBoundingClientRect();
      // Instant jump: the spotlight is measured right after, whatever the browser does with smooth scrolling.
      target.scrollIntoView({ behavior: 'auto', block: r.height < window.innerHeight - 220 ? 'center' : 'start' });
    }
    placeTuto();
    requestAnimationFrame(placeTuto);
    $('#tuto-next').focus({ preventScroll: true });
  }

  function placeTuto() {
    const ts = tutoState; if (!ts) return;
    const target = $(TUTO[ts.i].sel);
    const vw = window.innerWidth, vh = window.innerHeight, pad = 8;
    const r = target ? target.getBoundingClientRect() : { top: vh / 2, left: vw / 2, width: 0, height: 0, bottom: vh / 2 };
    const top = Math.max(4, r.top - pad), left = Math.max(4, r.left - pad);
    const width = Math.min(vw - 4 - left, r.width + pad * 2);
    const height = Math.min(vh - 4 - top, r.bottom + pad - top);
    Object.assign(ts.spot.style, { top: `${top}px`, left: `${left}px`, width: `${Math.max(0, width)}px`, height: `${Math.max(0, height)}px` });
    const card = ts.card, ch = card.offsetHeight, cw = card.offsetWidth;
    let ct;
    if (r.bottom + pad + 12 + ch < vh) ct = r.bottom + pad + 12;
    else if (r.top - pad - 12 - ch > 0) ct = r.top - pad - 12 - ch;
    else ct = vh - ch - 16;
    const cl = Math.min(vw - cw - 16, Math.max(16, r.left));
    Object.assign(card.style, { top: `${ct}px`, left: `${cl}px` });
  }

  function endTutorial(done) {
    const ts = tutoState; if (!ts) return;
    document.removeEventListener('keydown', ts.onKey);
    window.removeEventListener('resize', ts.onMove);
    window.removeEventListener('scroll', ts.onMove);
    ts.block.remove(); ts.spot.remove(); ts.card.remove();
    tutoState = null;
    if (done && S.profile && !S.profile.tutorial_done_at) {
      S.sb.from('ardoise_profiles').update({ tutorial_done_at: new Date().toISOString() }).eq('user_id', uid()).select().single()
        .then(({ data }) => { if (data) S.profile = data; });
    }
    if (done) window.scrollTo({ top: 0, behavior: reduced() ? 'auto' : 'smooth' });
  }

  boot().catch(e => renderMessage('Erreur au démarrage', String((e && e.message) || e)));
})();
