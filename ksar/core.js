/* L'Ardoise — pure logic: dates, weighting matrix, weekly stats, score, points, advice.
   No DOM, no network: tested under Node (`node ksar/core.test.js`).

   Two numbers, two jobs (requirements FR5/FR6, proposal P2):
   - the weekly SCORE (/100) measures consumption against the user's objectives and drives the character;
   - POINTS reward effort (logging, sport, staying under objective, applying a tip). They only ever add up,
     so a bad week costs the character, never the points already earned. */
(function (root) {
  'use strict';

  // ---------------------------------------------------------------- catalogue
  const SUBSTANCES = {
    alcool: { label: 'Alcool', short: 'alcool' },
    cigarettes: { label: 'Cigarettes', short: 'tabac' },
    drogues: { label: 'Drogues', short: 'drogues' },
  };
  const SUBSTANCE_KEYS = Object.keys(SUBSTANCES);

  const TYPES = [
    { k: 'pils', label: 'Bière', one: 'bière', many: 'bières', size: 'pils 25 cl · 5 %', sub: 'alcool', beer: true },
    { k: 'vin', label: 'Vin', one: 'verre de vin', many: 'verres de vin', size: 'verre de 10 cl', sub: 'alcool' },
    { k: 'speciale', label: 'Bière spéciale', one: 'spéciale', many: 'spéciales', size: '33 cl · 8 %', sub: 'alcool', beer: true },
    { k: 'cocktail', label: 'Cocktail', one: 'cocktail', many: 'cocktails', size: '4 à 6 cl d’alcool fort', sub: 'alcool' },
    { k: 'shot', label: 'Shot', one: 'shot', many: 'shots', size: '3 à 4 cl · 40 %', sub: 'alcool' },
    { k: 'sans_alcool', label: 'Sans alcool', one: 'sans alcool', many: 'sans alcool', size: 'bière ou cocktail 0,0 %', sub: 'alcool', soft: true },
    { k: 'cigarettes', label: 'Cigarettes', one: 'cigarette', many: 'cigarettes', size: 'sur toute la journée', sub: 'cigarettes' },
    { k: 'joint', label: 'Joint', one: 'joint', many: 'joints', size: 'cannabis', sub: 'drogues' },
    { k: 'autre_drogue', label: 'Autre drogue', one: 'prise', many: 'prises', size: 'par prise', sub: 'drogues' },
  ];
  const COUNT_KEYS = TYPES.map(t => t.k);
  const ALC_KEYS = TYPES.filter(t => t.sub === 'alcool' && !t.soft).map(t => t.k);
  const DRUG_KEYS = TYPES.filter(t => t.sub === 'drogues').map(t => t.k);
  const BEER_KEYS = TYPES.filter(t => t.beer).map(t => t.k);

  // Weighting matrix (FR4). Alcohol in Belgian standard drinks (10 g of pure alcohol);
  // drugs in "occasions"; cigarettes one by one. Admin-editable via ardoise_config.poids.
  const DEFAULT_POIDS = { pils: 1, vin: 1, speciale: 2, cocktail: 1.5, shot: 1, sans_alcool: 0, cigarettes: 1, joint: 1, autre_drogue: 2 };
  const DEFAULT_OBJECTIFS = { semaine: 10, soiree: 4, exces: 6, jours_sans: 2, cigarettes_jour: 5, drogues_semaine: 2 };
  const HEALTH = { semaine: 10, exces: 6 };

  // Character states, best first. `min` is the lowest weekly score that earns the state.
  const STATES = [
    { key: 'top', min: 80, label: 'En pleine forme', msg: 'Costume repassé, cabriolet lustré. Continue comme ça.' },
    { key: 'ok', min: 60, label: 'Ça roule', msg: 'Une citadine fiable, rien à signaler. Garde le cap.' },
    { key: 'decline', min: 40, label: 'En déclin', msg: 'La voiture fume, les cernes se creusent. Deux ou trois ajustements suffisent pour remonter.' },
    { key: 'street', min: 0, label: 'À la rue', msg: 'Semaine difficile. Ça arrive : on regarde ce qui a coincé et on repart dès lundi.' },
  ];

  // ---------------------------------------------------------------- dates
  const pad = n => String(n).padStart(2, '0');
  const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parse = s => { const [y, m, d] = String(s).slice(0, 10).split('-').map(Number); return new Date(y, m - 1, d); };
  const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return iso(d); };
  const mondayOf = s => addDays(s, -((parse(s).getDay() + 6) % 7));
  const isISODate = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);

  // ---------------------------------------------------------------- numbers & settings
  const num = v => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : 0; };
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  function mergeNumbers(defaults, given) {
    const out = Object.assign({}, defaults);
    if (given && typeof given === 'object') {
      for (const k of Object.keys(defaults)) {
        const v = Number(given[k]);
        if (Number.isFinite(v) && v >= 0) out[k] = v;
      }
    }
    return out;
  }
  /** Substances the user flagged as an issue (FR2.3). Defaults to all three for a profile without answers. */
  function tracksOf(habits) {
    if (!habits || typeof habits !== 'object' || !SUBSTANCE_KEYS.some(k => habits[k])) return SUBSTANCE_KEYS.slice();
    return SUBSTANCE_KEYS.filter(k => habits[k] && habits[k].use && habits[k].issue);
  }
  const typesFor = tracks => TYPES.filter(t => tracks.includes(t.sub));

  const alcUnits = (e, p) => (e ? ALC_KEYS.reduce((a, k) => a + num(e[k]) * num(p[k]), 0) + num(e.sans_alcool) * num(p.sans_alcool) : 0);
  const drugUnits = (e, p) => (e ? DRUG_KEYS.reduce((a, k) => a + num(e[k]) * num(p[k]), 0) : 0);
  const alcCount = e => (e ? ALC_KEYS.reduce((a, k) => a + num(e[k]), 0) : 0);
  const unitsOf = alcUnits;

  // ---------------------------------------------------------------- weekly stats
  /**
   * Stats for the week starting on Monday `m`. entries: Map(date -> row).
   * A day without a row counts as alcohol-free but not as logged.
   */
  function weekStats(entries, m, poids, today) {
    const st = {
      m, units: 0, drugs: 0, dry: 0, loggedDry: 0, future: 0, elapsed: 0, logged: 0, occasions: 0, mixDays: 0,
      maxU: 0, maxD: null, maxBeers: 0, evenings: [], counts: {}, days: [],
    };
    for (const k of COUNT_KEYS) st.counts[k] = 0;
    for (let i = 0; i < 7; i++) {
      const d = addDays(m, i);
      const e = entries.get(d) || null;
      const u = alcUnits(e, poids), dr = drugUnits(e, poids), a = alcCount(e);
      const fut = d > today;
      st.days.push({ d, e, u, dr, fut, a });
      if (e) {
        st.logged++;
        for (const k of COUNT_KEYS) st.counts[k] += num(e[k]);
        st.maxBeers = Math.max(st.maxBeers, BEER_KEYS.reduce((s, k) => s + num(e[k]), 0));
        if (a > 0 && dr > 0) st.mixDays++;
        if (a === 0 && !fut) st.loggedDry++;
      }
      st.units += u;
      st.drugs += dr;
      if (a > 0) { st.occasions++; st.evenings.push(u); }
      if (u > st.maxU) { st.maxU = u; st.maxD = d; }
      if (fut) st.future++;
      else { st.elapsed++; if (a === 0) st.dry++; }
    }
    st.cigs = st.counts.cigarettes;
    st.soft = st.counts.sans_alcool;
    st.drinks = ALC_KEYS.reduce((s, k) => s + st.counts[k], 0);
    // Cigarettes are averaged over the days actually logged: an empty day is "not told", not "zero".
    st.cigAvg = st.logged ? st.cigs / st.logged : 0;
    return st;
  }

  // ---------------------------------------------------------------- score (drives the character)
  /**
   * Weekly score out of 100, against the objectives, for the tracked substances only.
   * `provisional` = the week is still running: days to come still count as possible alcohol-free
   * days and regularity only asks for the days already lived. Returns null when nothing was logged.
   */
  function scoreWeek(st, o, provisional, tracks) {
    if (!st || !st.logged) return null;
    tracks = tracks || SUBSTANCE_KEYS;
    const parts = [];

    if (tracks.includes('alcool')) {
      const T = num(o.semaine), u = st.units;
      let alc;
      if (T <= 0) alc = u === 0 ? 40 : Math.max(0, 40 - 8 * u);
      else if (u <= T) alc = 40 - 12 * (u / T);
      else alc = 28 * Math.max(0, 1 - (u - T) / T);
      parts.push({ key: 'alcool', label: 'Alcool sur la semaine', pts: alc, max: 40 });

      const dryBase = provisional ? Math.min(7, st.dry + st.future) : st.dry;
      parts.push({ key: 'jours_sans', label: 'Jours sans alcool', pts: 15 * Math.min(1, dryBase / (num(o.jours_sans) + 1)), max: 15 });

      let binges = 0, heavy = 0;
      for (const ev of st.evenings) {
        if (ev >= num(o.exces) && ev > 0) binges++;
        else if (ev > num(o.soiree)) heavy++;
      }
      parts.push({ key: 'soirees', label: 'Soirées', pts: Math.max(0, 15 - 8 * binges - 3 * heavy), max: 15, binges, heavy });
    }

    if (tracks.includes('cigarettes')) {
      const c = st.cigAvg, Cg = num(o.cigarettes_jour);
      let cig;
      if (c === 0) cig = 15;
      else if (Cg > 0 && c <= Cg) cig = 15 - 5 * (c / Cg);
      else cig = 10 * Math.max(0, 1 - (Cg > 0 ? (c - Cg) / Cg : c / 5));
      parts.push({ key: 'cigarettes', label: 'Cigarettes', pts: cig, max: 15 });
    }

    if (tracks.includes('drogues')) {
      const j = st.drugs, J = num(o.drogues_semaine);
      let dr;
      if (j === 0) dr = 10;
      else if (J > 0 && j <= J) dr = 10 - 3 * (j / J);
      else dr = 7 * Math.max(0, 1 - (J > 0 ? (j - J) / J : j / 3));
      parts.push({ key: 'drogues', label: 'Drogues', pts: dr, max: 10 });
    }

    const need = provisional ? Math.min(4, st.elapsed) : 4;
    parts.push({ key: 'regularite', label: 'Régularité', pts: need ? 5 * Math.min(1, st.logged / need) : 5, max: 5 });

    for (const p of parts) p.pts = Math.round(clamp(p.pts, 0, p.max) * 10) / 10;
    const got = parts.reduce((a, p) => a + p.pts, 0), max = parts.reduce((a, p) => a + p.max, 0);
    const total = Math.round((got / max) * 100);
    // Parts are displayed on the same 100-point scale the total uses.
    const k = 100 / max;
    for (const p of parts) { p.max100 = Math.round(p.max * k * 10) / 10; p.pts100 = Math.round(p.pts * k * 10) / 10; }
    return { total, parts, state: stateOf(total), provisional: !!provisional };
  }

  function stateOf(score) {
    for (const s of STATES) if (score >= s.min) return s;
    return STATES[STATES.length - 1];
  }
  const stateByKey = k => STATES.find(s => s.key === k) || STATES[1];

  /** Trend: this score against the mean of up to four previous weekly scores (null when no history). */
  function trendOf(score, previous) {
    const prev = previous.filter(v => v != null);
    if (score == null || !prev.length) return null;
    const avg = prev.reduce((a, v) => a + v, 0) / prev.length;
    const delta = Math.round(score - avg);
    return { avg: Math.round(avg), delta, declining: delta <= -5 };
  }

  // ---------------------------------------------------------------- points (reward effort)
  const POINTS = { logDay: 10, fullWeek: 30, sport: 15, sportMax: 7, objective: 40, dryDay: 5, advice: 10, adviceMax: 3 };

  /** Points earned in a week. extras = { sport, advice: [ids applied] }. */
  function pointsWeek(st, o, tracks, extras) {
    tracks = tracks || SUBSTANCE_KEYS;
    extras = extras || {};
    const items = [];
    const add = (key, label, pts) => { if (pts > 0) items.push({ key, label, pts: Math.round(pts) }); };
    add('log', `${st.logged} ${st.logged >= 2 ? 'jours notés' : 'jour noté'}`, st.logged * POINTS.logDay);
    if (st.logged === 7) add('full', 'Semaine complète', POINTS.fullWeek);
    const sport = clamp(Math.round(num(extras.sport)), 0, POINTS.sportMax);
    add('sport', `${sport} ${sport >= 2 ? 'séances' : 'séance'} de sport`, sport * POINTS.sport);
    const applied = Array.isArray(extras.advice) ? Math.min(POINTS.adviceMax, extras.advice.length) : 0;
    add('advice', `${applied} ${applied >= 2 ? 'conseils appliqués' : 'conseil appliqué'}`, applied * POINTS.advice);
    if (st.logged) {
      if (tracks.includes('alcool')) {
        if (st.units <= num(o.semaine)) add('obj-alc', 'Objectif alcool tenu', POINTS.objective);
        add('sober-alc', 'Verres en moins sous l’objectif', Math.max(0, num(o.semaine) - st.units) * 4);
        add('dry', `${st.loggedDry} ${st.loggedDry >= 2 ? 'jours notés' : 'jour noté'} sans alcool`, st.loggedDry * POINTS.dryDay);
      }
      if (tracks.includes('cigarettes')) {
        if (st.cigAvg <= num(o.cigarettes_jour)) add('obj-cig', 'Objectif cigarettes tenu', POINTS.objective);
        add('sober-cig', 'Cigarettes en moins sous l’objectif', Math.max(0, num(o.cigarettes_jour) * st.logged - st.cigs));
      }
      if (tracks.includes('drogues')) {
        if (st.drugs <= num(o.drogues_semaine)) add('obj-dr', 'Objectif drogues tenu', POINTS.objective);
        add('sober-dr', 'Prises en moins sous l’objectif', Math.max(0, num(o.drogues_semaine) - st.drugs) * 8);
      }
    }
    return { total: items.reduce((a, i) => a + i.pts, 0), items };
  }

  // ---------------------------------------------------------------- advice library (FR8, P4)
  // Each tip is tied to the data that makes it relevant. `when` receives (st, o).
  const ADVICE = [
    { id: 'A1', sub: 'alcool', title: 'Remplace, ne te prive pas', text: 'Alterne avec des boissons sans alcool : tu gardes un verre en main sans te sentir à l’écart.',
      when: (st, o) => st.units > num(o.semaine) * 0.8 && st.soft < st.drinks / 4 },
    { id: 'A2', sub: 'alcool', title: 'Du sans alcool au frigo', text: 'Garde toujours des bières sans alcool au frais : une visite imprévue ne tourne plus automatiquement à l’apéro.',
      when: st => st.soft === 0 && st.occasions >= 2 },
    { id: 'A3', sub: 'alcool', title: 'La règle des trois', text: 'En soirée, après trois bières, passe à une boisson sans alcool. Tu restes dans la fête, sans la suite.',
      when: st => st.maxBeers > 3 },
    { id: 'A4', sub: 'alcool', title: 'Deux occasions par semaine', text: 'Choisis à l’avance deux soirées où tu bois, au lieu de boire au fil des occasions.',
      when: st => st.occasions > 2 },
    { id: 'A5', sub: 'alcool', title: 'Une soirée légère', text: 'Sur tes deux occasions, désigne d’avance celle où tu boiras moins, et tiens-t’y.',
      when: (st, o) => st.occasions >= 2 && st.maxU > num(o.soiree) },
    { id: 'C1', sub: 'cigarettes', title: 'Recule la première', text: 'Repousse ta première cigarette de 30 minutes, puis d’une heure la semaine suivante.',
      when: (st, o) => st.cigAvg > num(o.cigarettes_jour) },
    { id: 'C2', sub: 'cigarettes', title: 'Un lieu, pas un moment', text: 'Fume uniquement dehors et jamais avec le café : tu casses l’automatisme.',
      when: (st, o) => st.cigAvg > num(o.cigarettes_jour) * 0.8 && st.cigAvg > 0 },
    { id: 'C3', sub: 'cigarettes', title: 'Un paquet à la fois', text: 'Ne rachète pas avant d’avoir fini le paquet en cours, et garde-le hors de ta poche.',
      when: st => st.cigAvg >= 10 },
    { id: 'D1', sub: 'drogues', title: 'Décide à l’avance', text: 'Fixe les soirées où tu fumes, et laisse le matériel à la maison les autres jours.',
      when: (st, o) => st.drugs > num(o.drogues_semaine) },
    { id: 'D2', sub: 'drogues', title: 'Pas de mélange', text: 'Évite l’alcool et le joint le même soir : les effets s’additionnent et tu consommes plus des deux.',
      when: st => st.mixDays > 0 },
    { id: 'D3', sub: 'drogues', title: 'Des nuits sans', text: 'Une semaine sans joint avant de dormir : le sommeil revient vite et l’envie du soir baisse.',
      when: st => st.counts.joint >= 3 },
  ];
  const FALLBACK = { alcool: 'A4', cigarettes: 'C1', drogues: 'D1' };

  /** Tips relevant to this week's data, tracked substances only. Never empty when something is tracked. */
  function adviceFor(st, o, tracks, limit) {
    tracks = tracks || SUBSTANCE_KEYS;
    const hits = st ? ADVICE.filter(a => tracks.includes(a.sub) && a.when(st, o)) : [];
    if (!hits.length) for (const s of tracks) { const a = ADVICE.find(x => x.id === FALLBACK[s]); if (a) hits.push(Object.assign({ generic: true }, a)); }
    return hits.slice(0, limit || 3);
  }

  // ---------------------------------------------------------------- safety line (P5)
  /** Heavy use that deserves the professional-help message. */
  function needsHelp(st) {
    if (!st) return false;
    return st.units >= 35 || (st.occasions >= 6 && st.units >= 21) || st.maxU >= 15 || st.counts.autre_drogue >= 3;
  }

  // ---------------------------------------------------------------- onboarding
  /** A synthetic "typical week" built from the onboarding answers. */
  function habitsStats(h, poids) {
    h = h || {};
    const counts = {};
    for (const k of COUNT_KEYS) counts[k] = 0;
    const a = h.alcool && h.alcool.use ? h.alcool : {};
    const c = h.cigarettes && h.cigarettes.use ? h.cigarettes : {};
    const d = h.drogues && h.drogues.use ? h.drogues : {};
    for (const k of ALC_KEYS) counts[k] = num(a[k]);
    counts.joint = num(d.joint);
    counts.autre_drogue = num(d.autre_drogue);
    const units = alcUnits(counts, poids);
    const days = clamp(Math.round(num(a.jours)), units > 0 ? 1 : 0, 7);
    const per = days ? units / days : 0;
    const cig = num(c.par_jour);
    counts.cigarettes = cig * 7;
    const beers = BEER_KEYS.reduce((s, k) => s + counts[k], 0);
    return {
      units, drugs: drugUnits(counts, poids), dry: 7 - days, loggedDry: 7 - days, future: 0, elapsed: 7, logged: 7,
      occasions: days, mixDays: 0, maxU: per, maxBeers: days ? beers / days : 0, evenings: Array.from({ length: days }, () => per),
      cigAvg: cig, cigs: cig * 7, soft: 0, drinks: ALC_KEYS.reduce((s, k) => s + counts[k], 0), counts,
    };
  }

  /** Objectives proposed after the questionnaire: a first step down from today, never above the health limits. */
  function suggestObjectifs(h, poids) {
    const st = habitsStats(h, poids);
    const o = Object.assign({}, DEFAULT_OBJECTIFS);
    o.semaine = st.units > HEALTH.semaine ? Math.max(HEALTH.semaine, Math.round(st.units * 0.75)) : Math.min(HEALTH.semaine, Math.ceil(st.units));
    o.jours_sans = clamp(7 - st.occasions, 2, 7);
    o.cigarettes_jour = st.cigAvg > 0 ? Math.floor(st.cigAvg * 0.75) : 0;
    o.drogues_semaine = st.drugs > 0 ? Math.max(0, Math.round(st.drugs) - 1) : 0;
    return o;
  }

  /** After the baseline week (P3): objectives as a 20 % reduction of what was actually measured. */
  function objectifsFromBaseline(st, current) {
    const o = Object.assign({}, current);
    o.semaine = Math.max(0, Math.round(st.units * 0.8));
    o.jours_sans = clamp(Math.max(num(current.jours_sans), st.dry + 1), 1, 7);
    o.cigarettes_jour = Math.max(0, Math.floor(st.cigAvg * 0.8));
    o.drogues_semaine = Math.max(0, Math.floor(st.drugs * 0.8));
    return o;
  }

  // ---------------------------------------------------------------- Belgian benchmarks by age
  // Sciensano, Health Interview Survey 2023-2024 (tables_al / tables_ta / tables_id, crude %, Belgium).
  // One value per age band; drug questions stop at 64 (null after).
  const AGE_BANDS = ['15-24', '25-34', '35-44', '45-54', '55-64', '65-74', '75+'];
  const BE_HIS = {
    source: 'Sciensano, Enquête de santé 2023-2024',
    alcohol: {
      drinkers: [66.9, 80.9, 80.7, 83.2, 81.5, 79.4, 68.4],   // drank in the past 12 months (%)
      over10: [13.4, 16.6, 15.7, 17.7, 15.7, 20.5, 11.2],     // more than 10 standard drinks a week (%)
      binge: [18.3, 13.9, 10.6, 11.8, 9.3, 8.3, 3.6],         // binge (F 4+ / M 6+ in 2 h) at least monthly (%)
      daily: [1.3, 1.9, 4.5, 7.2, 9.9, 15.7, 15.8],           // drinks every day (%)
      avgWeekly: [12.9, 9.3, 10.0, 11.0, 10.3, 10.8, 8.4],     // standard drinks a week, among weekly drinkers
      lowRisk: [20.0, 26.6, 35.8, 37.8, 38.8, 40.2, 44.1],     // drinkers who respect all 4 recommendations (%)
    },
    tobacco: {
      daily: [7.7, 12.7, 17.0, 15.1, 17.2, 10.9, 3.6],         // daily smokers (%)
      perDay: [10.6, 12.0, 14.5, 15.1, 15.3, 15.3, 12.7],      // cigarettes a day, among daily smokers
    },
    drugs: {
      cannabis: [17.9, 12.0, 10.6, 4.6, 1.8, null, null],      // cannabis in the past 12 months (%)
      other: [3.9, 6.3, 5.2, 1.4, 0.6, null, null],            // another drug in the past 12 months (%)
    },
    all: { over10: 16.0, binge: 11.0, daily: 7.7, avgWeekly: 10.3, lowRisk: 34.8, tobaccoDaily: 12.8, perDay: 14.1, cannabis: 8.8, other: 3.5 },
  };

  /** Index into AGE_BANDS, or -1 when the age is unknown. */
  function ageBandIndex(age) {
    const a = Number(age);
    if (!Number.isFinite(a) || a <= 0) return -1;
    if (a < 25) return 0;
    if (a >= 75) return 6;
    return Math.floor((a - 15) / 10);
  }
  /** Age today from the year of birth kept in the profile (habits.birth_year). */
  function ageFromBirthYear(year, today) {
    const y = Number(year);
    if (!Number.isFinite(y) || y < 1900) return null;
    return (today ? parse(today) : new Date()).getFullYear() - y;
  }
  /** The benchmarks of one age band, as plain numbers. Null when the age is unknown. */
  function ageStats(age) {
    const i = ageBandIndex(age);
    if (i < 0) return null;
    const pick = group => Object.fromEntries(Object.entries(group).map(([k, v]) => [k, v[i]]));
    return { band: AGE_BANDS[i], index: i, alcohol: pick(BE_HIS.alcohol), tobacco: pick(BE_HIS.tobacco), drugs: pick(BE_HIS.drugs) };
  }

  const api = {
    SUBSTANCES, SUBSTANCE_KEYS, TYPES, COUNT_KEYS, ALC_KEYS, DRUG_KEYS, DEFAULT_POIDS, DEFAULT_OBJECTIFS, HEALTH, STATES, POINTS, ADVICE,
    AGE_BANDS, BE_HIS, ageBandIndex, ageFromBirthYear, ageStats,
    iso, parse, addDays, mondayOf, isISODate, num, clamp, mergeNumbers, tracksOf, typesFor,
    unitsOf, alcUnits, drugUnits, alcCount, weekStats, scoreWeek, stateOf, stateByKey, trendOf,
    pointsWeek, adviceFor, needsHelp, habitsStats, suggestObjectifs, objectifsFromBaseline,
  };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ArdoiseCore = api;
})(typeof self !== 'undefined' ? self : this);
