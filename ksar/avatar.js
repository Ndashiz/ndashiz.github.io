/* L'Ardoise — the character. One flat-vector scene per state:
   top (suit + convertible), ok (casual + city car), decline (tired + smoking wreck),
   street (sitting on cardboard, shopping cart, rain).
   ArdoiseAvatar.svg(stateKey, look, {title}) returns an SVG string; every value it interpolates
   is a number or comes from the fixed palettes below, never from user input. */
(function (root) {
  'use strict';

  const SKINS = ['#f6d3b8', '#e3ae86', '#b97b52', '#7b4a2c'];
  const HAIRS = ['#2a1c15', '#6b3d1e', '#c9a35c', '#a8452a', '#9ca3a9'];
  const STYLES = [
    { key: 'court', label: 'Court' },
    { key: 'long', label: 'Long' },
    { key: 'boucle', label: 'Bouclé' },
  ];
  const DEFAULT_LOOK = { skin: 1, hair: 0, style: 'court' };

  function normLook(look) {
    const l = Object.assign({}, DEFAULT_LOOK, look || {});
    l.skin = Math.max(0, Math.min(SKINS.length - 1, Math.round(Number(l.skin)) || 0));
    l.hair = Math.max(0, Math.min(HAIRS.length - 1, Math.round(Number(l.hair)) || 0));
    if (!STYLES.some(s => s.key === l.style)) l.style = DEFAULT_LOOK.style;
    return l;
  }

  function shade(hex, f) {
    const n = parseInt(hex.slice(1), 16);
    const ch = s => Math.max(0, Math.min(255, Math.round(((n >> s) & 255) * f)));
    return `#${[16, 8, 0].map(s => ch(s).toString(16).padStart(2, '0')).join('')}`;
  }

  // ---------- backgrounds ----------
  const SKY = {
    top: ['#7cc8f2', '#d9f0fb'],
    ok: ['#a9d6ee', '#eaf5f9'],
    decline: ['#b7bdc4', '#e2e4e6'],
    street: ['#5d6873', '#8f99a3'],
  };

  function cloud(x, y, s, fill, op) {
    return `<g transform="translate(${x} ${y}) scale(${s})" fill="${fill}" opacity="${op}">
      <circle cx="0" cy="0" r="14"/><circle cx="16" cy="-6" r="17"/><circle cx="34" cy="0" r="13"/><rect x="-8" y="0" width="48" height="12" rx="6"/></g>`;
  }

  function background(state, id) {
    const [a, b] = SKY[state];
    let s = `<defs><linearGradient id="sky-${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs>
      <rect width="400" height="250" fill="url(#sky-${id})"/>`;
    // skyline
    const bOp = state === 'street' ? .32 : .16;
    s += `<g fill="#3b4a55" opacity="${bOp}">
      <rect x="0" y="118" width="46" height="104"/><rect x="50" y="92" width="38" height="130"/><rect x="92" y="132" width="52" height="90"/>
      <rect x="150" y="104" width="34" height="118"/><rect x="190" y="124" width="58" height="98"/><rect x="254" y="84" width="40" height="138"/>
      <rect x="300" y="116" width="50" height="106"/><rect x="354" y="98" width="46" height="124"/></g>`;
    if (state === 'top') {
      s += `<g transform="translate(338 52)"><circle r="24" fill="#ffd45a"/><g stroke="#ffd45a" stroke-width="3" stroke-linecap="round" opacity=".7">
        <path d="M0-34V-42M0 34V42M-34 0H-42M34 0H42M24-24L30-30M-24 24L-30 30M24 24L30 30M-24-24L-30-30"/></g></g>`;
      s += cloud(70, 44, .9, '#fff', .9);
    } else if (state === 'ok') {
      s += `<circle cx="340" cy="54" r="20" fill="#ffe08a" opacity=".9"/>`;
      s += cloud(300, 66, .8, '#fff', .95) + cloud(60, 40, 1, '#fff', .85);
    } else if (state === 'decline') {
      s += cloud(30, 40, 1.2, '#a3a9b0', .9) + cloud(200, 30, 1.4, '#9aa1a8', .85) + cloud(320, 52, 1.1, '#a8aeb4', .9);
    } else {
      s += cloud(60, 34, 1.5, '#4b545d', .95) + cloud(230, 24, 1.7, '#454e57', .95);
      s += `<g stroke="#c9d3dc" stroke-width="1.6" stroke-linecap="round" opacity=".55">`;
      for (let i = 0; i < 26; i++) {
        const x = (i * 37) % 400 + 6, y = 60 + ((i * 53) % 150);
        s += `<path d="M${x} ${y}l-5 12"/>`;
      }
      s += `</g>`;
    }
    // pavement
    const pave = state === 'street' ? '#8e8a83' : state === 'decline' ? '#b9b4ab' : '#d3cdc2';
    s += `<rect y="222" width="400" height="28" fill="${pave}"/><rect y="222" width="400" height="3" fill="${shade(pave, .82)}"/>`;
    if (state === 'street') s += `<ellipse cx="300" cy="238" rx="48" ry="5" fill="#a9b4be" opacity=".5"/>`;
    return s;
  }

  // ---------- hair ----------
  function hairBack(style, hair, cy) {
    if (style !== 'long') return '';
    return `<path d="M-25 ${cy} Q-27 ${cy - 30} 0 ${cy - 28} Q27 ${cy - 30} 25 ${cy} L27 ${cy + 34} Q20 ${cy + 38} 14 ${cy + 34} L15 ${cy + 2} L-15 ${cy + 2} L-14 ${cy + 34} Q-20 ${cy + 38} -27 ${cy + 34} Z" fill="${hair}"/>`;
  }
  function hairFront(style, hair, cy, messy) {
    let s;
    if (style === 'boucle') {
      s = `<g fill="${hair}">`;
      for (let i = 0; i <= 8; i++) {
        const a = Math.PI * (1.05 + i * 0.1125);
        s += `<circle cx="${(Math.cos(a) * 21).toFixed(1)}" cy="${(cy - 3 + Math.sin(a) * 20).toFixed(1)}" r="8.5"/>`;
      }
      s += `</g>`;
    } else if (style === 'long') {
      s = `<path d="M-23 ${cy} Q-22 ${cy - 26} 0 ${cy - 25} Q22 ${cy - 26} 23 ${cy} Q12 ${cy - 14} -3 ${cy - 13} Q-15 ${cy - 12} -23 ${cy} Z" fill="${hair}"/>`;
    } else {
      s = `<path d="M-23 ${cy + 1} Q-25 ${cy - 26} 0 ${cy - 25} Q25 ${cy - 26} 23 ${cy + 1} L21 ${cy - 7} Q13 ${cy - 15} -1 ${cy - 13} Q-13 ${cy - 15} -20 ${cy - 5} Z" fill="${hair}"/>`;
    }
    if (messy) {
      s += `<g stroke="${hair}" stroke-width="3" stroke-linecap="round" fill="none">
        <path d="M-6 ${cy - 23} q-3 -5 -8 -6"/><path d="M4 ${cy - 24} q2 -5 7 -7"/><path d="M15 ${cy - 19} q5 -2 8 0"/></g>`;
    }
    return s;
  }

  // ---------- face ----------
  function face(state, cy) {
    const eye = '#2b2b2b';
    let s = `<circle cx="-8" cy="${cy - 1}" r="2.5" fill="${eye}"/><circle cx="8" cy="${cy - 1}" r="2.5" fill="${eye}"/>`;
    const brow = (y1, y2) => `<g stroke="#2b2b2b" stroke-width="2" stroke-linecap="round" fill="none"><path d="M-12 ${cy - 8 + y1}L-4 ${cy - 9 + y2}"/><path d="M12 ${cy - 8 + y1}L4 ${cy - 9 + y2}"/></g>`;
    if (state === 'top') {
      s += brow(-1, -2);
      s += `<path d="M-8 ${cy + 8} Q0 ${cy + 17} 8 ${cy + 8} Z" fill="#fff" stroke="#7a3b2e" stroke-width="1.6" stroke-linejoin="round"/>`;
      s += `<circle cx="-14" cy="${cy + 6}" r="3.5" fill="#f08f80" opacity=".45"/><circle cx="14" cy="${cy + 6}" r="3.5" fill="#f08f80" opacity=".45"/>`;
    } else if (state === 'ok') {
      s += brow(0, 0);
      s += `<path d="M-6 ${cy + 9} Q0 ${cy + 14} 6 ${cy + 9}" fill="none" stroke="#7a3b2e" stroke-width="2" stroke-linecap="round"/>`;
    } else if (state === 'decline') {
      s += brow(1, 3);
      s += `<g stroke="#8a6a5a" stroke-width="1.4" fill="none" stroke-linecap="round" opacity=".8"><path d="M-12 ${cy + 3} Q-8 ${cy + 6} -4 ${cy + 3}"/><path d="M4 ${cy + 3} Q8 ${cy + 6} 12 ${cy + 3}"/></g>`;
      s += `<path d="M-6 ${cy + 11} q3 -2 6 0 q3 2 6 0" fill="none" stroke="#7a3b2e" stroke-width="2" stroke-linecap="round"/>`;
    } else {
      s += brow(3, 1);
      s += `<g stroke="#6a5048" stroke-width="1.4" fill="none" stroke-linecap="round" opacity=".85"><path d="M-12 ${cy + 3} Q-8 ${cy + 6} -4 ${cy + 3}"/><path d="M4 ${cy + 3} Q8 ${cy + 6} 12 ${cy + 3}"/></g>`;
    }
    return s;
  }

  // ---------- standing person (top / ok / decline) ----------
  function standing(state, look) {
    const skin = SKINS[look.skin], hair = HAIRS[look.hair];
    const outfit = {
      top: { top: '#22395e', pants: '#2c3440', shoes: '#141414' },
      ok: { top: '#2f8f83', pants: '#3e5d8a', shoes: '#f3f3f1' },
      decline: { top: '#cbc2a9', pants: '#5d6166', shoes: '#6b4c33' },
    }[state];
    const cy = -152;
    let s = `<ellipse cx="0" cy="0" rx="40" ry="5" fill="#000" opacity=".12"/>`;
    // legs + shoes
    s += `<rect x="-17" y="-64" width="14" height="60" rx="6" fill="${outfit.pants}"/><rect x="3" y="-64" width="14" height="60" rx="6" fill="${outfit.pants}"/>`;
    s += `<ellipse cx="-11" cy="-4" rx="11" ry="5.5" fill="${outfit.shoes}"/><ellipse cx="11" cy="-4" rx="11" ry="5.5" fill="${outfit.shoes}"/>`;
    if (state === 'ok') s += `<path d="M-20 -6h18M2 -6h18" stroke="#c9ccd0" stroke-width="1.5"/>`;
    // arms (behind the torso edges)
    s += `<rect x="-38" y="-120" width="13" height="56" rx="6.5" fill="${outfit.top}"/><rect x="25" y="-120" width="13" height="56" rx="6.5" fill="${outfit.top}"/>`;
    s += `<circle cx="-31.5" cy="-62" r="6.5" fill="${skin}"/><circle cx="31.5" cy="-62" r="6.5" fill="${skin}"/>`;
    // neck + long hair behind
    s += hairBack(look.style, hair, cy);
    s += `<rect x="-6" y="-136" width="12" height="16" fill="${shade(skin, .92)}"/>`;
    // torso
    if (state === 'decline') {
      s += `<path d="M-26 -110 Q-26 -124 -12 -124 L12 -124 Q26 -124 26 -110 L27 -54 L19 -50 L12 -55 L4 -50 L-4 -55 L-12 -50 L-20 -55 L-27 -52 Z" fill="${outfit.top}"/>`;
      s += `<circle cx="9" cy="-86" r="5" fill="#9b7b45" opacity=".45"/><circle cx="14" cy="-80" r="2.5" fill="#9b7b45" opacity=".4"/>`;
      s += `<path d="M-3 -122 L2 -122 L7 -98 L3 -94 L0 -98 Z" fill="#7d2f2a" transform="rotate(14 0 -118)"/>`;
      s += `<path d="M-16 -100 q6 6 2 14M14 -112 q-4 6 0 10" stroke="${shade(outfit.top, .8)}" stroke-width="1.5" fill="none"/>`;
    } else {
      s += `<rect x="-26" y="-124" width="52" height="68" rx="14" fill="${outfit.top}"/>`;
    }
    if (state === 'top') {
      s += `<path d="M-10 -124 L10 -124 L0 -98 Z" fill="#fff"/>`;
      s += `<path d="M-2.6 -120 L2.6 -120 L4.2 -100 L0 -95 L-4.2 -100 Z" fill="#c0392b"/>`;
      s += `<path d="M-12 -124 L0 -97 L-16 -108 Z M12 -124 L0 -97 L16 -108 Z" fill="${shade(outfit.top, .78)}"/>`;
      s += `<circle cx="0" cy="-80" r="1.8" fill="#d6c27a"/><circle cx="0" cy="-70" r="1.8" fill="#d6c27a"/>`;
      s += `<rect x="-37" y="-74" width="11" height="5" rx="1.5" fill="#d6b45a"/>`;
    }
    if (state === 'ok') s += `<path d="M-9 -124 Q0 -114 9 -124" fill="none" stroke="${shade(outfit.top, .75)}" stroke-width="3"/>`;
    // head
    const tilt = state === 'decline' ? 'rotate(-6 0 -140)' : '';
    s += `<g transform="${tilt}">`;
    s += `<circle cx="-22" cy="${cy + 2}" r="5" fill="${shade(skin, .94)}"/><circle cx="22" cy="${cy + 2}" r="5" fill="${shade(skin, .94)}"/>`;
    s += `<circle cx="0" cy="${cy}" r="22" fill="${skin}"/>`;
    s += hairFront(look.style, hair, cy, state === 'decline');
    s += face(state, cy);
    s += `</g>`;
    return `<g transform="translate(100 222)">${s}</g>`;
  }

  // ---------- sitting person (street) ----------
  function sitting(look) {
    const skin = SKINS[look.skin], hair = HAIRS[look.hair];
    const coat = '#6b5442', pants = '#574d46', beard = shade(hair, 1.12);
    const cy = -118;
    let s = `<rect x="-58" y="-9" width="116" height="10" fill="#b48c5a"/><path d="M-50 -5h40M4 -5h44" stroke="#8f6c43" stroke-width="1.5"/>`;
    // crossed legs
    s += `<path d="M-44 -8 Q-46 -36 -10 -36 L10 -36 Q46 -36 44 -8 Z" fill="${pants}"/>`;
    s += `<rect x="16" y="-28" width="12" height="10" fill="#7a6a58" transform="rotate(-8 22 -23)"/>`;
    s += `<ellipse cx="-44" cy="-10" rx="10" ry="6" fill="#3c3530"/><ellipse cx="44" cy="-10" rx="10" ry="6" fill="#3c3530"/>`;
    // arms resting on the knees
    s += `<rect x="-38" y="-90" width="13" height="52" rx="6.5" fill="${coat}"/><rect x="25" y="-90" width="13" height="52" rx="6.5" fill="${coat}"/>`;
    s += `<circle cx="-31" cy="-38" r="6.5" fill="${skin}"/><circle cx="31" cy="-38" r="6.5" fill="${skin}"/>`;
    // torso + patches + torn hem
    s += hairBack(look.style === 'long' ? 'long' : '', hair, cy);
    s += `<rect x="-6" y="-102" width="12" height="14" fill="${shade(skin, .92)}"/>`;
    s += `<path d="M-26 -82 Q-26 -96 -12 -96 L12 -96 Q26 -96 26 -82 L26 -40 L18 -36 L10 -41 L0 -36 L-9 -41 L-18 -36 L-26 -40 Z" fill="${coat}"/>`;
    s += `<rect x="-19" y="-74" width="12" height="11" fill="#8d7a52" transform="rotate(-10 -13 -68)"/><rect x="8" y="-60" width="10" height="9" fill="#5f6f5a" transform="rotate(8 13 -55)"/>`;
    s += `<path d="M-13 -74h10M-13 -69h10" stroke="#6f5f3f" stroke-width="1" transform="rotate(-10 -13 -68)"/>`;
    // head, beard, beanie
    s += `<g transform="rotate(5 0 -104)">`;
    s += `<circle cx="-22" cy="${cy + 2}" r="5" fill="${shade(skin, .94)}"/><circle cx="22" cy="${cy + 2}" r="5" fill="${shade(skin, .94)}"/>`;
    s += `<circle cx="0" cy="${cy}" r="22" fill="${skin}"/>`;
    s += `<path d="M-21 ${cy + 2} Q-22 ${cy + 26} 0 ${cy + 28} Q22 ${cy + 26} 21 ${cy + 2} Q15 ${cy + 13} 0 ${cy + 12} Q-15 ${cy + 13} -21 ${cy + 2} Z" fill="${beard}"/>`;
    s += `<path d="M-6 ${cy + 14} Q0 ${cy + 10} 6 ${cy + 14}" fill="none" stroke="#3a2a24" stroke-width="2" stroke-linecap="round"/>`;
    s += face('street', cy);
    s += `<path d="M-24 ${cy - 9} Q-23 ${cy - 36} 0 ${cy - 36} Q23 ${cy - 36} 24 ${cy - 9} Z" fill="#8a3b3b"/>`;
    s += `<rect x="-25" y="${cy - 14}" width="50" height="8" rx="3" fill="#6e2d2d"/><circle cx="0" cy="${cy - 38}" r="5" fill="#a85454"/>`;
    s += `</g>`;
    return `<g transform="translate(96 222)">${s}</g>`;
  }

  // ---------- vehicles (local frame: facing left, ground at y = 60) ----------
  function wheel(x, y, r, flat) {
    if (flat) return `<ellipse cx="${x}" cy="${y + 3}" rx="${r + 1}" ry="${r - 3}" fill="#202326"/><ellipse cx="${x}" cy="${y + 3}" rx="${r * .45}" ry="${r * .32}" fill="#8d9399"/>`;
    return `<circle cx="${x}" cy="${y}" r="${r}" fill="#202326"/><circle cx="${x}" cy="${y}" r="${r * .5}" fill="#c9ced3"/><circle cx="${x}" cy="${y}" r="${r * .16}" fill="#6f767c"/>`;
  }
  function sportsCar() {
    return `<ellipse cx="72" cy="60" rx="74" ry="4" fill="#000" opacity=".14"/>
      <path d="M2 50 L4 40 Q8 33 26 31 L50 29 L64 19 Q71 14 86 15 L96 17 Q104 19 110 27 L130 30 Q140 32 142 41 L142 50 Z" fill="#d93a3f"/>
      <path d="M61 28 L70 20 Q75 17 86 18 L93 19 L99 28 Z" fill="#bfe4f7"/>
      <path d="M76 18 L74 28" stroke="#d93a3f" stroke-width="2"/>
      <path d="M12 41 L136 41" stroke="#fff" stroke-width="2" opacity=".55"/>
      <path d="M30 33 Q70 27 108 30" stroke="#fff" stroke-width="2" opacity=".45" fill="none"/>
      <ellipse cx="6" cy="38" rx="3.5" ry="2.3" fill="#ffe7a1"/><rect x="138" y="34" width="4" height="5" fill="#8f1418"/>
      ${wheel(28, 49, 11)}${wheel(118, 49, 11)}
      <g fill="#fff6c9"><path d="M150 6l2 5 5 2-5 2-2 5-2-5-5-2 5-2z"/><path d="M40 6l1.5 3.5 3.5 1.5-3.5 1.5-1.5 3.5-1.5-3.5-3.5-1.5 3.5-1.5z"/></g>`;
  }
  function cityCar() {
    return `<ellipse cx="72" cy="60" rx="70" ry="4" fill="#000" opacity=".13"/>
      <path d="M4 50 L4 36 Q6 28 18 27 L36 26 L50 8 Q53 4 62 4 L104 4 Q112 4 116 10 L130 26 Q138 28 138 36 L138 50 Z" fill="#3f7cc4"/>
      <path d="M42 26 L54 10 Q56 8 62 8 L80 8 L80 26 Z" fill="#cfe8f6"/><path d="M86 8 L102 8 Q108 8 111 13 L122 26 L86 26 Z" fill="#cfe8f6"/>
      <path d="M83 26 L83 46" stroke="#2f5f98" stroke-width="1.6"/><rect x="88" y="31" width="8" height="2.5" rx="1" fill="#2f5f98"/>
      <ellipse cx="7" cy="34" rx="3" ry="2.4" fill="#fff1c2"/><rect x="134" y="31" width="4" height="6" fill="#a12a2a"/>
      ${wheel(30, 49, 11)}${wheel(112, 49, 11)}`;
  }
  function oldCar() {
    return `<ellipse cx="72" cy="61" rx="72" ry="4" fill="#000" opacity=".14"/>
      <path d="M2 50 L2 34 L26 30 L40 10 L98 10 L114 30 L138 32 L142 50 Z" fill="#a19d77"/>
      <path d="M44 28 L54 14 L70 14 L70 28 Z" fill="#aeb8bd"/><path d="M76 14 L94 14 L104 28 L76 28 Z" fill="#aeb8bd"/>
      <path d="M80 15 L86 21 L84 24 L90 27" stroke="#5f6b70" stroke-width="1.2" fill="none"/>
      <circle cx="20" cy="42" r="4" fill="#8a5a35"/><circle cx="102" cy="44" r="3" fill="#8a5a35"/><circle cx="127" cy="38" r="3.5" fill="#8a5a35" opacity=".85"/>
      <path d="M58 38 q7 5 14 0" stroke="#7e7a58" stroke-width="2" fill="none"/>
      <path d="M137 46 L146 53" stroke="#6d7175" stroke-width="3" stroke-linecap="round"/>
      <ellipse cx="5" cy="37" rx="3" ry="2.2" fill="#d8d2b4"/>
      ${wheel(28, 49, 11, true)}${wheel(116, 49, 11)}
      <g fill="#8d939a" opacity=".55"><circle cx="150" cy="40" r="6"/><circle cx="160" cy="29" r="8"/><circle cx="173" cy="16" r="10"/></g>`;
  }
  function cart() {
    return `<ellipse cx="70" cy="60" rx="52" ry="3.5" fill="#000" opacity=".16"/>
      <path d="M38 14 Q36 -2 50 -4 Q63 -2 61 14 Z" fill="#c4473d"/>
      <path d="M62 14 Q62 -8 80 -6 Q96 -4 94 14 Z" fill="#4d6c9a"/>
      <path d="M93 14 L95 0 L112 0 L114 14 Z" fill="#6d7d3b"/><path d="M95 0 L112 0" stroke="#55622d" stroke-width="2"/>
      <path d="M20 14 L120 14 L110 44 L32 44 Z" fill="#cdd4d9" fill-opacity=".18" stroke="#7d8790" stroke-width="2.5" stroke-linejoin="round"/>
      <g stroke="#7d8790" stroke-width="1.5"><path d="M42 14 L46 44M62 14 L64 44M82 14 L82 44M102 14 L98 44M26 29 L115 29"/></g>
      <path d="M120 14 L131 3 L141 3" stroke="#7d8790" stroke-width="3" stroke-linecap="round" fill="none"/>
      <path d="M32 44 L36 52 L108 52 L110 44" stroke="#7d8790" stroke-width="2.5" fill="none"/>
      <circle cx="42" cy="56" r="4.2" fill="#2d3136"/><circle cx="102" cy="56" r="4.2" fill="#2d3136"/>`;
  }

  let uid = 0;
  function svg(state, look, opts) {
    if (!['top', 'ok', 'decline', 'street'].includes(state)) state = 'ok';
    look = normLook(look);
    const id = `a${++uid}`;
    const title = opts && opts.title ? String(opts.title).replace(/[<>&"]/g, '') : '';
    let body = background(state, id);
    if (state === 'top') body += `<g transform="translate(168 135) scale(1.45)">${sportsCar()}</g>`;
    if (state === 'ok') body += `<g transform="translate(172 135) scale(1.42)">${cityCar()}</g>`;
    if (state === 'decline') body += `<g transform="translate(166 136) scale(1.42)">${oldCar()}</g>`;
    if (state === 'street') body += `<g transform="translate(205 149) scale(1.22)">${cart()}</g>`;
    body += state === 'street' ? sitting(look) : standing(state, look);
    return `<svg viewBox="0 0 400 250" xmlns="http://www.w3.org/2000/svg" role="img"${title ? ` aria-label="${title}"` : ' aria-hidden="true"'} preserveAspectRatio="xMidYMid slice">${body}</svg>`;
  }

  root.ArdoiseAvatar = { svg, SKINS, HAIRS, STYLES, DEFAULT_LOOK, normLook };
})(self);
