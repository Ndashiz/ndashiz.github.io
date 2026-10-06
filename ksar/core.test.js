// Run: node ksar/core.test.js
'use strict';
const assert = require('node:assert/strict');
const C = require('./core.js');

const P = C.DEFAULT_POIDS, O = C.DEFAULT_OBJECTIFS, ALL = C.SUBSTANCE_KEYS;
const week = rows => new Map(rows.map(r => [r.date, r]));
const MON = '2026-10-05', NEXT = '2026-10-12';
const days = n => Array.from({ length: n }, (_, i) => C.addDays(MON, i));

// Dates: Monday detection across a month boundary and a DST change.
assert.equal(C.mondayOf('2026-10-11'), MON);
assert.equal(C.mondayOf('2026-10-01'), '2026-09-28');
assert.equal(C.addDays('2026-10-25', 1), '2026-10-26');

// Weighting matrix: standard drinks for alcohol, occasions for drugs.
const mix = { pils: 4, vin: 1, speciale: 1, shot: 2, sans_alcool: 3, joint: 1, autre_drogue: 1 };
assert.equal(C.alcUnits(mix, P), 9);
assert.equal(C.drugUnits(mix, P), 3);

// Tracks: only substances flagged as an issue (FR2.3); no answers at all means everything.
assert.deepEqual(C.tracksOf(null), ALL);
assert.deepEqual(C.tracksOf({ alcool: { use: true, issue: true }, cigarettes: { use: true, issue: false }, drogues: { use: false } }), ['alcool']);

// Nothing logged → no score, no points beyond zero.
const empty = C.weekStats(new Map(), MON, P, NEXT);
assert.equal(C.scoreWeek(empty, O, false, ALL), null);
assert.equal(C.pointsWeek(empty, O, ALL, {}).total, 0);

// A clean finished week: 4 beers on Saturday, four days logged.
const clean = week(['2026-10-05', '2026-10-07', '2026-10-09', '2026-10-10'].map(d => ({ date: d, pils: d === '2026-10-10' ? 4 : 0 })));
const s1 = C.scoreWeek(C.weekStats(clean, MON, P, NEXT), O, false, ALL);
assert.equal(s1.state.key, 'top');
assert.ok(s1.total >= 90, `clean week scored ${s1.total}`);

// A heavy week: binges, a pack a day, joints every night → lowest state, help line on.
const heavyRows = week(days(7).map((d, i) => ({ date: d, pils: i % 2 ? 8 : 2, shot: i % 2 ? 3 : 0, cigarettes: 20, joint: 2 })));
const heavySt = C.weekStats(heavyRows, MON, P, NEXT);
const s2 = C.scoreWeek(heavySt, O, false, ALL);
assert.equal(s2.state.key, 'street', `heavy week scored ${s2.total}`);
assert.equal(C.needsHelp(heavySt), true);
assert.equal(C.needsHelp(C.weekStats(clean, MON, P, NEXT)), false);

// Score only looks at tracked substances: the same heavy smoking is ignored for an alcohol-only user.
const smoker = week(days(5).map(d => ({ date: d, cigarettes: 25 })));
assert.equal(C.scoreWeek(C.weekStats(smoker, MON, P, NEXT), O, false, ['alcool']).state.key, 'top');
assert.notEqual(C.scoreWeek(C.weekStats(smoker, MON, P, NEXT), O, false, ['cigarettes']).state.key, 'top');

// Thresholds.
assert.equal(C.stateOf(80).key, 'top');
assert.equal(C.stateOf(79).key, 'ok');
assert.equal(C.stateOf(59).key, 'decline');
assert.equal(C.stateOf(39).key, 'street');

// Provisional: a Monday with one quiet logged day is not punished for days still to come.
const s3 = C.scoreWeek(C.weekStats(week([{ date: MON, cigarettes: 3 }]), MON, P, MON), O, true, ALL);
assert.ok(s3.total >= 85, `provisional Monday scored ${s3.total}`);

// Points reward effort: a heavy but fully logged week with sport still earns points, never negative.
const ptsHeavy = C.pointsWeek(heavySt, O, ALL, { sport: 3, advice: ['A3'] });
assert.ok(ptsHeavy.total >= 70 + 30 + 45 + 10, `heavy week points ${ptsHeavy.total}`);
const ptsClean = C.pointsWeek(C.weekStats(clean, MON, P, NEXT), O, ALL, { sport: 2 });
assert.ok(ptsClean.items.some(i => i.key === 'obj-alc'));
assert.ok(ptsClean.total > 100);

// Advice is triggered by the data (P4).
const ids = C.adviceFor(heavySt, O, ALL, 20).map(a => a.id);
for (const id of ['A3', 'A4', 'C1', 'D1', 'D2']) assert.ok(ids.includes(id), `missing ${id} in ${ids}`);
assert.ok(C.adviceFor(heavySt, O, ['cigarettes'], 20).every(a => a.sub === 'cigarettes'));
assert.ok(C.adviceFor(C.weekStats(clean, MON, P, NEXT), O, ['alcool'], 3).some(a => a.id === 'A3')); // 4 beers in one evening
const quiet = week([{ date: MON, pils: 2 }]);
assert.equal(C.adviceFor(C.weekStats(quiet, MON, P, NEXT), O, ['alcool'], 3)[0].generic, true);

// Trend.
assert.deepEqual(C.trendOf(50, [70, 80, null]), { avg: 75, delta: -25, declining: true });
assert.equal(C.trendOf(50, [null]), null);

// Onboarding suggestions: a step down, never above the weekly health limit when already under it.
const h1 = { alcool: { use: true, issue: true, jours: 2, pils: 6 }, cigarettes: { use: true, issue: true, par_jour: 8 }, drogues: { use: true, issue: true, joint: 1 } };
const sug = C.suggestObjectifs(h1, P);
assert.equal(sug.semaine, 6);
assert.equal(sug.jours_sans, 5);
assert.equal(sug.cigarettes_jour, 6);
assert.equal(sug.drogues_semaine, 0);
const h2 = { alcool: { use: true, issue: true, jours: 5, pils: 20, speciale: 4 }, cigarettes: { use: true, issue: true, par_jour: 15 } };
assert.equal(C.suggestObjectifs(h2, P).semaine, 21);
assert.equal(C.scoreWeek(C.habitsStats(h2, P), O, false, ALL).state.key, 'street');

// Baseline (P3): objectives become a 20 % cut of the measured week.
const base = C.objectifsFromBaseline(C.weekStats(heavyRows, MON, P, NEXT), O);
assert.equal(base.semaine, Math.round(heavySt.units * 0.8));
assert.equal(base.cigarettes_jour, 16);

console.log('core.js: all assertions passed', { clean: s1.total, heavy: s2.total, monday: s3.total, pointsHeavy: ptsHeavy.total, pointsClean: ptsClean.total });
