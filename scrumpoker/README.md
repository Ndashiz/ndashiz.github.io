# Scrum Poker — `ndashiz.be/scrumpoker/`

Real-time planning poker. Static, single-file app (`index.html`), no build step, no server code.

## How it works

- **Transport**: Supabase Realtime only — broadcast + presence channels. No tables, no SQL, no accounts.
  Sessions live in the admin's browser (`localStorage`) and die when the admin ends them.
- **Authority**: the admin's tab owns the session state and rebroadcasts a public snapshot on every change
  (`votes` are redacted to "who has voted" until the reveal). Players only send `join` / `vote` / `leave`.
- **Channel name = access control**: `poker:<sid>:<key>` with `key = sha256("scrumpoker:" + sid + ":" + password)[0:24]`.
  Wrong password → different channel → nobody answers → timeout. The QR link carries `?s=<sid>&t=<key>`.
- **Lobby**: global presence on `poker:lobby`; each admin tracks `{sid, name, players, phase}`. Sessions disappear
  from the list the moment the admin's tab closes (server presence timeout ≈ 1 min for a hard kill).
- **Countdown**: the admin pushes `countdown {n: 3|2|1}` one second apart, then the revealed state.
- **Identity**: nickname, unique per session (case-insensitive). Same nickname + same tab → silent rejoin.
  Same nickname from a new browser while the old one is disconnected → "Was that you?" confirmation, vote kept.
- **Spectators**: anyone joining while a vote is running; promoted to player when the admin starts a *new* feature
  (a re-vote keeps them spectators).

## Open points from the spec — decisions taken

1. **Admin disconnects** → session pauses (players see a banner). The admin reopens the same URL on the same
   browser and resumes with full state (`localStorage`). No handover.
2. **History export** → "Copy CSV" button on the History tab.
3. **Session expiry** → presence-based: gone from the lobby as soon as the admin tab is closed.

## Vendored libs

- `supabase.min.js` — **supabase-js 2.45.4** (UMD). Do not bump to 2.10x: its rewritten presence layer loses
  presence refs after the first diff, so leaves/untrack never apply client-side and the lobby fills with ghosts
  (verified 2026-09-16 against 2.108.2). The older client needs `presence: { enabled: true }` in the channel config.
- `qrcode.js` — qrcode-generator 1.4.4 (MIT, Kazuhiko Arase).

## Known limits

- Votes and the join password-derived key travel on the session channel; anyone who already knows the password
  (or scanned the QR) could sniff them with devtools. Fine for a team ritual, not a secret ballot.
- The QR token is equivalent to the password for the life of the session (no rotation).
- Two admin tabs of the same session in the same browser would both answer joins — keep one.
