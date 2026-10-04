'use strict';
// The Thirteenth Chime — game logic (deterministic state machines). Rendering lives in render3d.js.
// Map coordinates are 2D (x, y); the renderer maps y onto the 3D z axis.

const $ = (id) => document.getElementById(id);

const LOOP_LEN = 240;
const POISON_DURATION = 5;
const PLAYER_SPEED = 170;
const NPC_SPEED = 95;
const R = 11;
const INTERACT_DIST = 55;

// ---------------------------------------------------------------- map
const ROOMS = {
  conservatory: { x: 20, y: 40, w: 280, h: 250, label: 'Conservatory', floor: '#3d5a45' },
  study: { x: 340, y: 40, w: 280, h: 250, label: 'Study', floor: '#5a3e2b' },
  kitchen: { x: 660, y: 40, w: 280, h: 250, label: 'Kitchen & Service Passage', floor: '#6b6a60' },
  dining: { x: 20, y: 330, w: 280, h: 250, label: 'Dining Room', floor: '#5e3438' },
  hall: { x: 340, y: 330, w: 600, h: 250, label: 'Entrance Hall', floor: '#4a4650' },
};
// Each door has an approach point just inside each room so NPCs route cleanly.
const DOORS = [
  { id: 'cons-study', a: 'conservatory', b: 'study', x: 300, y: 150, w: 40, h: 40, pa: [285, 170], pb: [355, 170] },
  { id: 'service', a: 'study', b: 'kitchen', x: 620, y: 200, w: 40, h: 40, pa: [605, 220], pb: [675, 220] },
  { id: 'study-hall', a: 'study', b: 'hall', x: 460, y: 290, w: 40, h: 40, pa: [480, 275], pb: [480, 345] },
  { id: 'kitchen-hall', a: 'kitchen', b: 'hall', x: 780, y: 290, w: 40, h: 40, pa: [800, 275], pb: [800, 345] },
  { id: 'cons-dining', a: 'conservatory', b: 'dining', x: 140, y: 290, w: 40, h: 40, pa: [160, 275], pb: [160, 345] },
  { id: 'dining-hall', a: 'dining', b: 'hall', x: 300, y: 440, w: 40, h: 40, pa: [285, 460], pb: [355, 460] },
];
// Furniture the player cannot walk through. NPC routes are laid out to avoid these.
const BLOCKERS = [
  { id: 'desk', x: 370, y: 45, w: 80, h: 30 },
  { id: 'fireplace', x: 565, y: 40, w: 50, h: 16 },
  { id: 'drinkTable', x: 547, y: 137, w: 26, h: 26 },
  { id: 'cupboard', x: 875, y: 42, w: 50, h: 24 },
  { id: 'worktable', x: 740, y: 130, w: 80, h: 40 },
  { id: 'hooks', x: 860, y: 278, w: 40, h: 12 },
  { id: 'sideboard', x: 22, y: 355, w: 24, h: 70 },
  { id: 'diningTable', x: 100, y: 490, w: 140, h: 50 },
  { id: 'clock', x: 895, y: 332, w: 22, h: 18 },
  { id: 'lectern', x: 850, y: 334, w: 20, h: 14 },
  { id: 'photoTable', x: 585, y: 334, w: 30, h: 14 },
  { id: 'coatStand', x: 352, y: 550, w: 16, h: 16 },
  { id: 'bench', x: 60, y: 62, w: 60, h: 24 },
];

const inRect = (px, py, r) => px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h;
function walkable(px, py) {
  for (const k in ROOMS) if (inRect(px, py, ROOMS[k])) return true;
  for (const d of DOORS) if (inRect(px, py, d)) return true;
  return false;
}
function boxWalkable(x, y) {
  if (!(walkable(x - R, y - R) && walkable(x + R, y - R) && walkable(x - R, y + R) && walkable(x + R, y + R))) return false;
  for (const b of BLOCKERS) {
    if (x + R > b.x && x - R < b.x + b.w && y + R > b.y && y - R < b.y + b.h) return false;
  }
  return true;
}
function roomAt(x, y) {
  for (const k in ROOMS) if (inRect(x, y, ROOMS[k])) return k;
  return null;
}

function roomRoute(from, to, avoid = []) {
  if (from === to) return [];
  const prev = { [from]: null };
  const queue = [from];
  while (queue.length) {
    const cur = queue.shift();
    for (const d of DOORS) {
      if (avoid.includes(d.id)) continue;
      let next = null, fromPt, toPt;
      if (d.a === cur) { next = d.b; fromPt = d.pa; toPt = d.pb; }
      else if (d.b === cur) { next = d.a; fromPt = d.pb; toPt = d.pa; }
      if (!next || next in prev) continue;
      prev[next] = { room: cur, fromPt, toPt };
      if (next === to) {
        const pts = [];
        let r = to;
        while (prev[r]) { pts.unshift(prev[r].fromPt, prev[r].toPt); r = prev[r].room; }
        return pts;
      }
      queue.push(next);
    }
  }
  return [];
}

// ---------------------------------------------------------------- spots (interaction points & NPC marks)
const SPOT = {
  start: { room: 'hall', x: 420, y: 520 },
  edmund: { room: 'study', x: 448, y: 100 },
  drinkTable: { room: 'study', x: 560, y: 150 },
  julianAtTable: { room: 'study', x: 585, y: 180 },
  thomasAtTable: { room: 'study', x: 535, y: 185 },
  helenByEdmund: { room: 'study', x: 450, y: 170 },
  cupboard: { room: 'kitchen', x: 900, y: 85 },
  hooks: { room: 'kitchen', x: 880, y: 255 },
  hatch: { room: 'kitchen', x: 690, y: 120 },
  sideboard: { room: 'dining', x: 70, y: 390 },
  diningTable: { room: 'dining', x: 170, y: 470 },
  conservatory: { room: 'conservatory', x: 150, y: 160 },
  hallJulian: { room: 'hall', x: 640, y: 470 },
  hallThomas: { room: 'hall', x: 560, y: 400 },
  hallHelen: { room: 'hall', x: 760, y: 500 },
  diningClara: { room: 'dining', x: 220, y: 420 },
  clock: { room: 'hall', x: 905, y: 372 },
  note: { room: 'hall', x: 860, y: 368 },
  photo: { room: 'hall', x: 600, y: 368 },
  desk: { room: 'study', x: 372, y: 92 },
  will: { room: 'dining', x: 262, y: 515 },
  bench: { room: 'conservatory', x: 90, y: 105 },
};

// ---------------------------------------------------------------- persistent state (survives loops)
let P; // persistent
let L; // per-loop

function freshPersistent() {
  return {
    loop: 1,
    evidence: {}, // id -> {title, desc, loop, time}
    timeline: [], // {loop, time, kind: 'Observed' | 'Reported', text}
    julianKnows: { statement: false, vial: false, poison: false },
    adaptations: 0,
    tipsShown: {},
    started: false,
    firstResetSeen: false,
    solved: false,
    ended: false,
  };
}

const EVIDENCE_TEXT = {
  A: ["Edmund's Unsigned Statement",
    "Edmund intends to correct the record of the boathouse fire and disclose who falsified it. It names Julian Ashcroft as the person who handled the original legal account. Whoever the statement exposes has reason to stop it being signed tonight."],
  F: ['The Suspicious Vial',
    'A small stoppered vial with a faint, bitter residue. Suspicious by itself — but owning a bottle is not the same as using it.'],
  G: ['Witnessed Poisoning',
    'You saw Julian Ashcroft empty the vial into Edmund\'s evening drink.'],
  H: ["Julian's Self-Incriminating Response",
    'Confronted with the vial, Julian said: "Then Edmund hasn\'t drunk—" and stopped. He could only have known the vial was meant for Edmund\'s drink if he intended to use it.'],
  I: ['Clock Restoration Note',
    '"The movement and its companion watch were cut from a single plate. Should watch and winding key both be parted from it at the stroke of twelve, the clock is apt to repeat itself." Not evidence of murder — but it explains your watch.'],
  M: ['Julian Remembers',
    'Julian referred to you standing by the study door "last time" — a loop no one else recalls. He keeps his memories, as you do.'],
  W: ["Edmund's Revised Will",
    'A large sum is set aside for Daniel Price\'s family. Clara\'s inheritance is sharply reduced. A motive for Clara — on paper.'],
  T: ["Thomas Prepares the Drink",
    'Thomas makes Edmund\'s evening drink every night and carries it to the Study himself. He has the opportunity — but does he do anything to it?'],
  E: ["Dr Ward's Medical Knowledge",
    'Helen is a doctor and carries a medical bag. She would know how to poison someone — but knowing how is not doing it.'],
  P: ['Memorial Photograph',
    'Daniel Price, aged nineteen, beside the old boathouse. Someone keeps the frame polished. The house has not forgotten him.'],
  C: ['Clara and Daniel',
    'Clara speaks of the fire with real grief. The money seems to matter less to her than the night Daniel died.'],
  R: ["Julian's Account of the Old Case",
    'Julian says he only wrote down what the witnesses told him at the inquest. Compare that with what Edmund\'s statement says about him.'],
};
const TOTAL_CLUES = Object.keys(EVIDENCE_TEXT).length;

function award(id, extra) {
  if (P.evidence[id]) return false;
  const [title, desc] = EVIDENCE_TEXT[id];
  P.evidence[id] = { title, desc: extra ? desc + ' ' + extra : desc, loop: P.loop, time: clockString(L.t) };
  cue(`Journal updated: ${title}`);
  onEvidence(id);
  updateObjective();
  return true;
}

// Timeline: what Morgan saw with their own eyes vs. what someone told them.
function logTimeline(kind, text) {
  if (P.timeline.some((e) => e.loop === P.loop && e.text === text)) return;
  P.timeline.push({ loop: P.loop, time: clockString(L.t), kind, text });
}
function observe(room, text) {
  if (playerRoom() === room || (room === 'study' && nearHatch())) logTimeline('Observed', text);
}

// ---------------------------------------------------------------- guidance
// The "Next step" panel always shows guide(); one-off tips appear beneath it for a while.
let noteText = '', noteUntil = 0;
function showTip(id, text) {
  if (P.tipsShown[id]) return;
  P.tipsShown[id] = true;
  noteText = text;
  noteUntil = performance.now() + 15000;
}
$('tip-close').onclick = () => $('tip').classList.add('hidden');

function guide() {
  const j = L.npcs.julian;
  const sawJulian = P.timeline.some((e) => e.kind === 'Observed' && e.text.startsWith('Julian'));
  if (P.solved) return { text: 'Walk to the grandfather clock on the east side of the Entrance Hall and press E to return the key and your watch.', target: SPOT.clock };
  if (P.evidence.G || P.evidence.H) {
    if (L.drink.state === 'onTable' && L.drink.poisoned && !L.edmundDead) {
      return { text: 'Quick — the drink is poisoned! Go to the drink table in the Study, press E and take the glass before Edmund drinks at 11:59:30.', target: SPOT.drinkTable };
    }
    return {
      text: 'You have proof. Press J (or the Accuse button below) and open the Accusation tab. Choose: Suspect — Julian Ashcroft · Motive — Edmund\'s Unsigned Statement · Action — ' +
        (P.evidence.G ? 'Witnessed Poisoning' : 'Julian\'s Self-Incriminating Response') + '. Then click "Make the accusation".',
      target: null,
    };
  }
  if (!P.evidence.A) return { text: 'Go north into the Study. Stand at the left end of Edmund\'s desk (the gold arrow) and press E to read the statement he will sign at midnight.', target: SPOT.desk };
  if (j.state === 'poisoning' && playerSeesStudy()) return { text: 'Julian is doing something to the glass. Keep watching to see it clearly — or walk up to him and press E to stop him.', target: null };
  if (L.edmundDead) return { text: 'Edmund has been poisoned. Wait for midnight: the clock will strike thirteen, time rewinds to 11:56, and you keep everything you learned.', target: null };
  if (L.strategy === 'C') {
    return L.t < 168
      ? { text: 'Julian saw you last time, so he has changed his plan. Until about 11:58:00 his coat hangs on the Kitchen hooks while he is in the Dining Room. Search the coat (E) while he is away — or skip it and go watch through the serving hatch.', target: SPOT.hooks }
      : { text: 'Julian now enters the Study through the service door. Stand at the Kitchen serving hatch and watch the drink table — he cannot see you there.', target: SPOT.hatch };
  }
  if (P.loop === 1) {
    return L.t < 150
      ? { text: 'Talk to the guests if you like (walk up to someone, press E). Before 11:58:30 be in the Study: Thomas brings Edmund\'s drink, and someone else will come to the drink table.', target: SPOT.drinkTable }
      : { text: 'Stay in the Study near the drink table. Watch who comes near it.', target: SPOT.drinkTable };
  }
  return {
    text: (sawJulian ? 'Last time, Julian went to the drink table at about 11:59.' : 'Someone goes to the drink table at about 11:59.') +
      ' This time watch from the serving hatch on the left wall of the Kitchen — you can see the table, and no one can see you. Be there before 11:59.',
    target: SPOT.hatch,
  };
}

function onEvidence(id) {
  if (id === 'A') showTip('watch', 'Everyone in the house keeps to a routine. Watch who goes near Edmund\'s drink table before midnight. (Reading and talking pause the clock.)');
  if (id === 'F') showTip('vial', 'A vial is suspicious, not proof. Try showing it — with a motive — to the person you suspect. Careful: if Julian sees you take it, he will remember.');
  if (id === 'G') showTip('save', 'You saw it. Take the glass from the drink table before Edmund drinks at 11:59:30 — then press J → Accusation.');
  if (id === 'H') showTip('accuse', 'That slip is as good as a confession. Press J → Accusation: suspect, motive, and the action you can prove.');
  if (id === 'M') showTip('memory2', 'Julian remembers the loops, as you do. Not every secret explains tonight\'s death — but his does.');
}

function loopStartTips() {
  if (L.strategy === 'C') showTip('adapt', 'Julian\'s routine has changed. He adapts only to what he has seen you do. Someone changes only what they know you have discovered.');
  if (P.julianKnows.poison && !P.evidence.M) showTip('memory', 'Julian saw you at the drink table last loop. Nobody else remembers that. Try talking to him.');
  if (P.loop >= 2 && !P.evidence.G && !P.evidence.H) showTip('hatch', 'Tip: the Kitchen has a serving hatch overlooking the Study\'s drink table. From there you can watch without being seen.');
}

// ---------------------------------------------------------------- characters
function makeNpc(id, name, color, spot) {
  return { id, name, color, x: spot.x, y: spot.y, room: spot.room, path: [], onArrive: null, state: 'idle', actionT: 0, doing: '', doingPublic: null };
}

function strategyFor(knows) {
  // Priority: C, then B, then A. B (document concealment) is not built yet, so it falls back to A.
  if (knows.vial || knows.poison) return 'C';
  return 'A';
}

function freshLoop() {
  const strategy = strategyFor(P.julianKnows);
  const npcs = {
    edmund: makeNpc('edmund', 'Sir Edmund Blackthorn', '#d8d2c4', SPOT.edmund),
    julian: makeNpc('julian', 'Julian Ashcroft', '#2f3d55', SPOT.hallJulian),
    thomas: makeNpc('thomas', 'Thomas Reed', '#1e1e22', SPOT.hallThomas),
    clara: makeNpc('clara', 'Clara Blackthorn', '#8c2f45', SPOT.diningClara),
    helen: makeNpc('helen', 'Dr Helen Ward', '#4f7f6a', SPOT.hallHelen),
  };
  return {
    t: 0,
    strategy,
    player: { x: SPOT.start.x, y: SPOT.start.y, room: 'hall' },
    holdsVial: false,
    holdsGlass: false,
    vial: strategy === 'C' ? 'coat' : 'cupboard', // cupboard | coat | julian | player | used
    drink: { state: 'none', poisoned: false }, // none | carried | onTable | taken | drunk
    edmundDead: false,
    npcs,
    julianHasVial: false,
    julianAttempted: false,
    seen: { statement: false, vial: false, poison: false }, // what Julian observed this loop
    events: buildSchedule(strategy, npcs),
    frozen: false,
  };
}

// What a character is doing, shown under their name. A secret action also has a public
// version, which is all the player sees unless they can see into that room.
function doing(npc, text, publicText = null) {
  npc.doing = text;
  npc.doingPublic = publicText;
}
function canSeeRoom(room) { return playerRoom() === room || (room === 'study' && nearHatch()); }
function captionFor(npc) {
  if (npc.doingPublic !== null && npc.doingPublic !== undefined && !canSeeRoom(npc.room)) return npc.doingPublic;
  return npc.doing || '';
}

function goTo(npc, spot, opts = {}, onArrive = null) {
  const pts = roomRoute(npc.room, spot.room, opts.avoid || []);
  npc.path = [...pts, [spot.x, spot.y]];
  npc.onArrive = onArrive;
  doing(npc, opts.caption || (spot.room === npc.room ? 'Walking across the room' : `Going to the ${ROOMS[spot.room].label}`));
}

function buildSchedule(strategy, n) {
  const ev = [];
  const at = (t, fn) => ev.push({ t, fn, done: false });
  // walk: go somewhere, then do something there (caption) and log it if the player is watching (note).
  const walk = (t, npc, room, x, y, caption, note) =>
    at(t, () => goTo(npc, { room, x, y }, {}, () => {
      doing(npc, caption || '');
      if (note) observe(room, note);
    }));

  doing(n.edmund, 'Rereading his statement');
  doing(n.julian, 'Waiting politely in the Hall');
  doing(n.thomas, 'Waiting to be called');
  doing(n.clara, 'Sitting in silence');
  doing(n.helen, 'Warming up after the storm');

  at(35, () => {
    observe('dining', 'Clara leaves the Dining Room for the Conservatory.');
    goTo(n.clara, SPOT.conservatory, {}, () => doing(n.clara, 'Looking out at the storm'));
  });

  at(60, () => goTo(n.thomas, SPOT.sideboard, {}, () => {
    n.thomas.state = 'preparing';
    doing(n.thomas, 'Preparing Edmund\'s evening drink');
    observe('dining', 'Thomas prepares Edmund\'s evening drink at the sideboard.');
  }));
  at(65, () => { L.drink.state = 'carried'; });
  at(122, () => {
    n.thomas.state = 'idle';
    goTo(n.thomas, SPOT.thomasAtTable, { avoid: ['service'], caption: 'Carrying Edmund\'s drink to the Study' }, () => {
      if (L.drink.state === 'carried') L.drink.state = 'onTable';
      observe('study', 'Thomas sets Edmund\'s drink on the drink table and leaves.');
      goTo(n.thomas, SPOT.hallThomas, {}, () => doing(n.thomas, 'Back on duty in the Hall'));
    });
  });

  at(150, () => goTo(n.helen, SPOT.helenByEdmund, {}, () => {
    doing(n.helen, 'Checking on Edmund\'s health');
    observe('study', 'Helen checks on Edmund.');
  }));
  at(165, () => goTo(n.helen, { room: 'hall', x: 600, y: 420 }, {}, () => doing(n.helen, 'Looking for Thomas')));

  // Background routines: everyone keeps busy. None of these affect the murder.
  walk(40, n.edmund, 'study', 585, 82, 'Warming his hands by the fire', 'Edmund leaves his desk to warm his hands at the fire.');
  walk(75, n.edmund, 'study', SPOT.edmund.x, SPOT.edmund.y, 'Rereading his statement', 'Edmund returns to his desk and rereads the statement.');

  walk(8, n.clara, 'dining', 80, 440, 'Pacing the room');
  walk(20, n.clara, 'dining', 250, 435, 'Pacing the room', 'Clara paces the Dining Room.');
  walk(55, n.clara, 'conservatory', 140, 100, 'Watching the rain', 'Clara sits by the glass, watching the rain.');
  walk(85, n.clara, 'hall', 870, 400, 'Staring at the grandfather clock', 'Clara stops in front of the grandfather clock.');
  walk(110, n.clara, 'hall', 630, 380, 'Looking at Daniel\'s photograph', 'Clara looks at Daniel\'s photograph for a long time.');
  walk(140, n.clara, 'conservatory', 200, 200, 'Lost in thought');
  walk(190, n.clara, 'dining', 220, 420, 'Sitting in silence', 'Clara returns to the Dining Room.');
  walk(225, n.clara, 'dining', 90, 440, 'Pacing the room');

  walk(12, n.helen, 'hall', 700, 380, 'Studying the portraits', 'Helen studies the portraits in the Hall.');
  walk(40, n.helen, 'dining', 200, 400, 'Pouring a glass of water', 'Helen pours herself a glass of water in the Dining Room.');
  walk(75, n.helen, 'kitchen', 760, 230, 'Looking for some ice', 'Helen looks for something in the Kitchen.');
  walk(120, n.helen, 'hall', 650, 420, 'Waiting in the Hall');
  walk(195, n.helen, 'conservatory', 200, 150, 'Getting some air', 'Helen steps into the Conservatory for some air.');
  walk(225, n.helen, 'hall', 760, 500, 'Waiting in the Hall');

  walk(15, n.thomas, 'kitchen', 840, 200, 'Tidying the Kitchen', 'Thomas tidies the Kitchen.');
  walk(40, n.thomas, 'hall', 520, 500, 'Checking the front door', 'Thomas checks the front door against the storm.');
  walk(150, n.thomas, 'hall', 400, 420, 'Lighting another lamp', 'Thomas lights another lamp in the Hall.');
  walk(175, n.thomas, 'kitchen', 840, 200, 'Washing up', 'Thomas washes up in the Kitchen.');
  walk(215, n.thomas, 'hall', 560, 400, 'Back on duty in the Hall');

  walk(10, n.julian, 'dining', 250, 455, 'Talking quietly with Clara', 'Julian speaks quietly with Clara in the Dining Room.');
  walk(45, n.julian, 'hall', 630, 385, 'Straightening Daniel\'s photograph', 'Julian pauses at Daniel\'s photograph and straightens the frame.');
  walk(70, n.julian, 'hall', 700, 470, 'Waiting politely in the Hall');

  if (strategy === 'C') {
    // Leaves the coat on the hooks while he checks papers, then collects it and uses the service passage.
    at(95, () => goTo(n.julian, SPOT.diningTable, {}, () => {
      doing(n.julian, 'Checking papers (his coat is on the Kitchen hooks)');
      observe('dining', 'Julian checks papers at the dining table — without his coat.');
    }));
    at(120, () => goTo(n.julian, SPOT.hooks, {}, () => {
      const had = L.vial === 'coat';
      if (had) { L.vial = 'julian'; L.julianHasVial = true; }
      doing(n.julian, had ? 'Putting on his coat — with the vial inside' : 'Feeling his coat pockets — something is missing', 'Fetching his coat');
      observe('kitchen', 'Julian collects his coat from the hooks.');
    }));
    at(168, () => goTo(n.julian, SPOT.julianAtTable, { caption: 'Slipping into the Study by the service door' }, () => {
      n.julian.state = 'atTable';
      doing(n.julian, 'Standing by Edmund\'s drink table', 'In the Study');
      observe('study', 'Julian arrives at the drink table through the service door.');
    }));
  } else {
    at(95, () => goTo(n.julian, SPOT.cupboard, {}, () => {
      if (L.vial === 'cupboard') {
        L.vial = 'julian'; L.julianHasVial = true;
        doing(n.julian, 'Takes a small vial from behind a tin!', 'Looking in the kitchen cupboard');
        observe('kitchen', 'Julian takes something from behind a tin in the kitchen cupboard.');
      } else {
        doing(n.julian, 'Searching the cupboard — something is missing', 'Looking in the kitchen cupboard');
        observe('kitchen', 'Julian searches the kitchen cupboard and finds nothing.');
      }
    }));
    walk(125, n.julian, 'hall', 860, 420, 'Checking his watch against the clock', 'Julian checks his pocket watch against the grandfather clock.');
    at(160, () => goTo(n.julian, SPOT.julianAtTable, { avoid: ['service'] }, () => {
      n.julian.state = 'atTable';
      doing(n.julian, 'Standing by Edmund\'s drink table', 'In the Study');
      observe('study', 'Julian comes into the Study from the Hall and lingers by the drink table.');
    }));
  }

  at(210, () => {
    if (L.drink.state === 'onTable') {
      L.drink.state = 'drunk';
      doing(n.edmund, L.drink.poisoned ? 'Collapsed over the desk' : 'Drinking his evening drink');
      observe('study', 'Edmund drinks his evening drink.');
      if (L.drink.poisoned) {
        L.edmundDead = true;
        cue(playerRoom() === 'study' ? '[Edmund drinks. The glass falls. He slumps over the desk.]' : '[A glass breaks somewhere in the house. Then a cry from the Study.]');
        showTip('death', 'Edmund is dead — for now. At midnight the clock will strike thirteen and the four minutes will begin again. Remember what you saw.');
      }
    } else if (!L.edmundDead) {
      doing(n.edmund, 'Looking for his evening drink');
    }
  });
  at(120, () => { if (P.loop === 1) showTip('drink', 'Thomas is about to take Edmund\'s drink to the Study. Something happens at that table before midnight. Be there.'); });
  return ev;
}

// ---------------------------------------------------------------- visibility
function playerRoom() { return roomAt(L.player.x, L.player.y) || L.player.room; }
function nearHatch() { return playerRoom() === 'kitchen' && dist(L.player, SPOT.hatch) < 45; }
function playerSeesStudy() { return playerRoom() === 'study' || nearHatch(); }
// Julian notices the player only when they share a room. The hatch is discreet.
function julianSeesPlayer() { return L.npcs.julian.room === playerRoom(); }
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

// ---------------------------------------------------------------- time helpers
function clockString(t) {
  const total = 56 * 60 + Math.floor(t);
  const m = Math.floor(total / 60), s = total % 60;
  return `11:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')} PM`;
}

// ---------------------------------------------------------------- input
const keys = {};
const touchKeys = {};
addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) e.preventDefault();
  if (e.repeat) return;
  keys[k] = true;
  ensureAudio();
  if (k === 'escape') closePanels();
  else if (k === 'e') interact();
  else if (k === 'j') toggleJournal();
  else if (k === 'h') toggleHelp();
});
addEventListener('keyup', (e) => { keys[e.key.toLowerCase()] = false; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; });
document.querySelectorAll('#touch [data-key]').forEach((b) => {
  const k = b.dataset.key;
  const on = (e) => { e.preventDefault(); touchKeys[k] = true; ensureAudio(); };
  const off = () => { touchKeys[k] = false; };
  b.addEventListener('pointerdown', on);
  b.addEventListener('pointerup', off);
  b.addEventListener('pointerleave', off);
  b.addEventListener('pointercancel', off);
});
$('btn-e').onclick = () => { ensureAudio(); interact(); };
$('btn-j').onclick = () => toggleJournal();
$('btn-h').onclick = () => toggleHelp();
$('help-close').onclick = () => $('help').classList.add('hidden');

const isOpen = (id) => !$(id).classList.contains('hidden');
function paused() {
  return isOpen('dialog') || isOpen('journal') || isOpen('overlay') || isOpen('help') || isOpen('tutorial') || L.frozen;
}

// ---------------------------------------------------------------- audio
let audio = null;
function ensureAudio() {
  if (audio) return;
  try { audio = new (window.AudioContext || window.webkitAudioContext)(); } catch (_) { audio = null; return; }
  // Rain: looping filtered noise.
  const buf = audio.createBuffer(1, audio.sampleRate * 2, audio.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const src = audio.createBufferSource(); src.buffer = buf; src.loop = true;
  const f = audio.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 900;
  const g = audio.createGain(); g.gain.value = 0.035;
  src.connect(f).connect(g).connect(audio.destination);
  src.start();
}
function tone(freq, dur, vol = 0.08, type = 'sine', delay = 0) {
  if (!audio) return;
  const o = audio.createOscillator(), g = audio.createGain();
  o.type = type; o.frequency.value = freq;
  const t0 = audio.currentTime + delay;
  g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(audio.destination);
  o.start(t0); o.stop(t0 + dur + 0.05);
}
function chime(n) { for (let i = 0; i < n; i++) tone(i === 12 ? 196 : 262, 1.6, 0.12, 'triangle', i * 0.45); }

// ---------------------------------------------------------------- UI helpers
let cueTimer = null;
function cue(text) {
  const el = $('subtitle');
  el.textContent = text;
  el.classList.remove('hidden');
  clearTimeout(cueTimer);
  cueTimer = setTimeout(() => el.classList.add('hidden'), 3500);
}

function say(speaker, text, choices) {
  $('dialog').classList.remove('hidden');
  $('dlg-speaker').textContent = speaker;
  $('dlg-text').textContent = text;
  const box = $('dlg-choices');
  box.innerHTML = '';
  for (const c of choices || [{ label: 'Continue', fn: closeDialog }]) {
    const b = document.createElement('button');
    b.textContent = c.label;
    b.onclick = () => c.fn();
    box.appendChild(b);
  }
  box.firstChild && box.firstChild.focus();
}
// Chain of lines: [[speaker, text, sideEffect?], ...] then optional final callback.
function sequence(lines, done) {
  const step = (i) => {
    if (i >= lines.length) { closeDialog(); if (done) done(); return; }
    const [sp, tx, fx] = lines[i];
    if (fx) fx();
    say(sp, tx, [{ label: 'Continue', fn: () => step(i + 1) }]);
  };
  step(0);
}
function closeDialog() { $('dialog').classList.add('hidden'); }
function closePanels() { closeDialog(); $('journal').classList.add('hidden'); $('help').classList.add('hidden'); }

function overlay(text, buttons, title = '', kind = '') {
  $('overlay').classList.remove('hidden');
  $('ov-title').textContent = title;
  $('ov-title').className = kind;
  $('ov-title').classList.toggle('hidden', !title);
  $('ov-text').textContent = text;
  const box = $('ov-buttons');
  box.innerHTML = '';
  for (const b of buttons) {
    const el = document.createElement('button');
    el.textContent = b.label;
    el.onclick = () => { $('overlay').classList.add('hidden'); b.fn && b.fn(); };
    box.appendChild(el);
  }
  box.firstChild && box.firstChild.focus();
}

function toggleHelp() {
  if (isOpen('overlay') || isOpen('tutorial')) return;
  $('help').classList.toggle('hidden');
}

// ---------------------------------------------------------------- interactions
function interactables() {
  const list = [];
  const n = L.npcs;
  for (const id in n) {
    const c = n[id];
    list.push({ x: c.x, y: c.y, room: c.room, label: `Talk to ${c.name}`, fn: () => talk(id) });
  }
  const obj = (spot, label, fn) => list.push({ x: spot.x, y: spot.y, room: spot.room, label, fn });
  obj(SPOT.clock, 'Examine the grandfather clock', useClock);
  obj(SPOT.note, 'Read the restoration note', () => {
    award('I');
    say('Restoration note', EVIDENCE_TEXT.I[1].split(' Not evidence')[0]);
  });
  obj(SPOT.photo, "Look at Daniel's photograph", () => {
    award('P');
    say('Memorial photograph', 'Daniel Price, aged nineteen, squinting into the sun beside the old boathouse. Someone has kept the frame polished.');
  });
  obj(SPOT.desk, "Read Edmund's statement on the desk", readStatement);
  obj(SPOT.drinkTable, 'Examine the drink table', drinkTable);
  obj(SPOT.cupboard, 'Search the cupboard', searchCupboard);
  obj(SPOT.hooks, 'Search the coats on the hooks', searchHooks);
  obj(SPOT.hatch, 'Serving hatch — watch the Study', () => say('Serving hatch',
    'Through the hatch you can see the drink table clearly. From the Study, this corner is in shadow.\n\nStand here and anything that happens at the drink table will be seen — and you will not be.'));
  obj(SPOT.sideboard, 'Examine the sideboard', () => say('Sideboard',
    L.drink.state === 'none' ? 'A decanter, a clean glass, a silver tray.' : 'The decanter has been used. A ring of damp where the glass stood.'));
  obj(SPOT.will, 'Read the revised will', () => {
    award('W');
    say('Revised will', 'A draft revision. A substantial sum is set aside "for the family of Daniel Price". Clara\'s share is markedly reduced.');
  });
  obj(SPOT.bench, 'Sit by the glass', () => say('Conservatory',
    'Rain on the glass roof. The lamps make the garden look further away than it is.'));
  return list;
}

function nearest() {
  const pr = playerRoom();
  let best = null, bd = INTERACT_DIST;
  for (const it of interactables()) {
    if (it.room !== pr) continue;
    const d = Math.hypot(it.x - L.player.x, it.y - L.player.y);
    if (d < bd) { bd = d; best = it; }
  }
  return best;
}

function interact() {
  if (isOpen('dialog') || isOpen('journal') || isOpen('overlay') || isOpen('help') || isOpen('tutorial')) return;
  const it = nearest();
  if (it) it.fn();
}

function readStatement() {
  const fresh = award('A');
  if (julianSeesPlayer()) L.seen.statement = true;
  say("Edmund's statement",
    '"…the account given at the inquest was not true. The boathouse had failed inspection twice. The exit was chained. ' +
    'The legal account was prepared by Mr Julian Ashcroft, who I now believe knew all of this…"\n\nIt awaits a signature at midnight.' +
    (fresh ? '' : '\n\n(Already recorded in your journal.)'));
}

function searchCupboard() {
  if (L.vial === 'cupboard') {
    L.vial = 'player'; L.holdsVial = true;
    award('F');
    if (julianSeesPlayer()) { L.seen.vial = true; cue('[Julian watches you close the cupboard.]'); }
    say('Kitchen cupboard', 'Behind a tea tin: a small stoppered vial. You pocket it.');
  } else {
    say('Kitchen cupboard', 'Tea tins, a biscuit barrel, and a clean gap in the dust behind the largest tin.');
  }
}

function searchHooks() {
  if (L.vial === 'coat') {
    L.vial = 'player'; L.holdsVial = true;
    award('F');
    if (julianSeesPlayer()) { L.seen.vial = true; cue('[Julian sees you at his coat.]'); }
    say('Cloak hooks', 'A charcoal overcoat, monogrammed J.A. In the inside pocket, a small stoppered vial. You take it.');
  } else {
    say('Cloak hooks', 'Damp coats and an umbrella that has given up.');
  }
}

function drinkTable() {
  const d = L.drink;
  if (d.state === 'onTable') {
    say('Drink table', 'Edmund\'s evening drink, poured and waiting.', [
      { label: 'Take the glass away', fn: () => {
        d.state = 'taken'; L.holdsGlass = true;
        say('Drink table', d.poisoned
          ? 'You lift the glass. There is a faint bitterness on the air. Edmund will not be drinking this.'
          : 'You take the glass. Edmund will have to do without tonight.');
      } },
      { label: 'Leave it', fn: closeDialog },
    ]);
  } else if (d.state === 'taken') say('Drink table', 'The tray is empty. You have the glass.');
  else if (d.state === 'drunk') say('Drink table', 'An empty glass.');
  else say('Drink table', 'A silver tray, waiting for Edmund\'s evening drink. Thomas usually brings it just before midnight.');
}

function useClock() {
  if (P.solved) {
    sequence([
      ['', 'Thomas places the brass winding key in your hand. You open the case of the grandfather clock.'],
      ['', 'You set the key into the mechanism. Then the watch, beside it.'],
      ['', '[The clock strikes twelve. Only twelve.]', () => chime(12)],
    ], showEnding);
    return;
  }
  say('Grandfather clock', 'The case is old walnut. The pendulum swings; the keyhole for the winding key is empty.' +
    (P.evidence.I ? '\n\nYour pocket watch ticks in exact time with it.' : '\n\nA handwritten note is pinned to a stand beside it.'));
}

// ---------------------------------------------------------------- dialogue
function talk(id) {
  if (id === 'edmund') {
    if (L.edmundDead) return say('Sir Edmund Blackthorn', '(He does not answer. He will not answer again — not in this loop.)');
    return say('Sir Edmund Blackthorn',
      P.loop === 1 && !P.evidence.A
        ? 'At midnight, I shall sign it. Until then, Mr—or Ms—Morgan, I would appreciate your discretion.'
        : 'Morgan. Four minutes, and then it\'s done. I find I\'m rather looking forward to it.',
      [
        { label: 'May I read the statement?', fn: () => {
          closeDialog();
          readStatement();
        } },
        { label: 'Who else knows what it says?', fn: () => {
          logTimeline('Reported', 'Edmund says Julian drafted the statement\'s wording with him.');
          say('Sir Edmund Blackthorn',
            'Julian drafted the wording with me. Helen came because I asked her to. Thomas… Thomas has served this house for thirty years.');
        } },
        { label: 'Leave him to his papers.', fn: closeDialog },
      ]);
  }
  if (id === 'clara') return say('Clara Blackthorn', 'You\'re the investigator. Uncle Edmund does like an audience.', [
    { label: 'Direct: The new will costs you a great deal.', fn: () => say('Clara Blackthorn',
      'You\'ve read it, then. Everyone has, apparently. Money is the least interesting thing about tonight.') },
    { label: 'Sympathetic: You seem far away.', fn: () => {
      award('C');
      say('Clara Blackthorn', 'Twelve years. You\'d think the house would stop smelling of smoke.');
    } },
    { label: 'Leave.', fn: closeDialog },
  ]);
  if (id === 'thomas') return say('Thomas Reed', 'Can I fetch you anything, Morgan?', [
    { label: 'Direct: You prepare Sir Edmund\'s drink?', fn: () => {
      logTimeline('Reported', 'Thomas says he prepares Edmund\'s drink at the same time every night and takes it to the Study.');
      award('T');
      say('Thomas Reed', 'Every night, at the same time. I take it through to the Study myself. He likes things to happen when they are supposed to.');
    } },
    { label: 'Sympathetic: You knew Daniel Price?', fn: () => say('Thomas Reed',
      'Everyone knew Daniel. There are things one learns not to say in a house like this.') },
    { label: 'Leave.', fn: closeDialog },
  ]);
  if (id === 'helen') return say('Dr Helen Ward', 'Morgan. Is Edmund well? He looked tired at dinner.', [
    { label: 'Direct: You\'d know about poisons.', fn: () => {
      award('E');
      say('Dr Helen Ward', 'I\'d know enough not to discuss them with a stranger in a corridor.');
    } },
    { label: 'Sympathetic: Why come back tonight?', fn: () => say('Dr Helen Ward',
      'Because Edmund asked. And because I owe it.') },
    { label: 'Leave.', fn: closeDialog },
  ]);
  if (id === 'julian') return talkJulian();
}

function talkJulian() {
  const j = L.npcs.julian;
  if (j.state === 'poisoning') return interruptJulian();
  const opening = L.strategy === 'C'
    ? 'Morgan. You do turn up in the most unexpected places.'
    : 'If you find anything unclear, do ask. These old papers can be rather misleading.';
  const choices = [];
  if (P.evidence.A) choices.push({ label: 'Ask about the old legal account.', fn: () => {
    L.seen.statement = true;
    logTimeline('Reported', 'Julian says he only wrote down what the witnesses told him.');
    award('R');
    say('Julian Ashcroft', 'I drafted what the witnesses told me. If the witnesses were mistaken, I can hardly be blamed for writing it down accurately.');
  } });
  if (L.holdsVial && P.evidence.A && !P.evidence.H) choices.push({ label: 'Present the vial and Edmund\'s statement.', fn: confrontVial });
  if (P.julianKnows.poison && !P.evidence.M) choices.push({ label: 'Press him: where were you at ten to midnight?', fn: memoryReveal });
  choices.push({ label: 'Leave.', fn: closeDialog });
  say('Julian Ashcroft', opening, choices);
}

function interruptJulian() {
  const j = L.npcs.julian;
  j.state = 'interrupted';
  doing(j, 'Caught with his hand above the glass');
  L.seen.poison = true;
  cue('[Julian\'s hand stops above the glass.]');
  logTimeline('Observed', 'You interrupt Julian with his hand above Edmund\'s glass.');
  say('Julian Ashcroft', 'Morgan. I was only seeing whether Edmund wanted anything else before midnight.', [
    { label: 'Take the glass away from him.', fn: () => {
      L.drink.state = 'taken'; L.holdsGlass = true;
      goTo(j, SPOT.hallJulian, { caption: 'Leaving the Study — he knows you saw' }, () => doing(j, 'Watching you from across the Hall'));
      say('Julian Ashcroft', 'As you wish. How very attentive you are.');
      showTip('interrupted', 'You saved Edmund this time — but Julian saw you. He will remember, and next loop he will do things differently. To prove what he does, you may need to watch without being seen.');
    } },
  ]);
}

function confrontVial() {
  L.seen.vial = true;
  say('Julian Ashcroft', 'That? Something of Helen\'s, I should think. Quite harmless.', [
    { label: '"I took it before anyone used it."', fn: () => sequence([
      ['Julian Ashcroft', 'Then Edmund hasn\'t drunk—'],
      ['', '(He stops.)'],
      ['Morgan', 'Hasn\'t drunk what, Mr Ashcroft?'],
      ['Julian Ashcroft', '…Edmund calls it the truth. He has never had to consider what the truth costs.', () => award('H')],
    ]) },
    { label: 'Say nothing more.', fn: closeDialog },
  ]);
}

function memoryReveal() {
  sequence([
    ['Julian Ashcroft', 'You were by the study door last time.'],
    ['Morgan', 'I haven\'t mentioned the study.'],
    ['', '(A pause. Somewhere in the hall, the clock ticks.)', () => tone(880, 0.15, 0.08, 'square')],
    ['Julian Ashcroft', 'No. I suppose you haven\'t.', () => award('M')],
  ]);
}

// ---------------------------------------------------------------- journal & accusation
let jnTab = 'evidence';
function toggleJournal() {
  if (isOpen('overlay') || isOpen('tutorial')) return;
  const j = $('journal');
  if (j.classList.contains('hidden')) { j.classList.remove('hidden'); renderJournal(); }
  else j.classList.add('hidden');
}
document.querySelectorAll('.tabs [data-tab]').forEach((b) => b.onclick = () => { jnTab = b.dataset.tab; renderJournal(); });
$('jn-close').onclick = () => $('journal').classList.add('hidden');

function renderJournal() {
  document.querySelectorAll('.tabs [data-tab]').forEach((b) => b.classList.toggle('active', b.dataset.tab === jnTab));
  const body = $('jn-body');
  if (jnTab === 'evidence') {
    const ids = Object.keys(P.evidence);
    let html = `<p class="hint">Clues found: <b>${ids.length} of ${TOTAL_CLUES}</b>. Evidence stays with you across loops. Physical items do not — you must pick them up again each loop.</p>`;
    if (!ids.length) html += '<p>Nothing recorded yet. Look for the floating <b>?</b> markers, and talk to people.</p>';
    for (const id of ids) {
      const e = P.evidence[id];
      const held = id === 'F' && L.holdsVial ? 'Physical item held this loop' : 'Recorded knowledge';
      html += `<div class="ev"><h4>${e.title}</h4><div class="tag">${held} · found in loop ${e.loop} at ${e.time}</div><p>${e.desc}</p></div>`;
    }
    if (L.holdsGlass) html += '<div class="ev"><h4>Edmund\'s glass</h4><div class="tag">Physical item held this loop</div></div>';
    body.innerHTML = html;
    return;
  }
  if (jnTab === 'timeline') {
    let html = '<p class="hint"><b>Observed</b> = you saw it yourself. <b>Reported</b> = someone told you. Compare a person\'s account with their actual route.</p>';
    if (!P.timeline.length) html += '<p>Nothing yet. Events are recorded when you are in the room to see them.</p>';
    const sorted = [...P.timeline].sort((a, b) => a.loop - b.loop || a.time.localeCompare(b.time));
    for (const e of sorted) html += `<div class="ev"><div class="tag">Loop ${e.loop} · ${e.time} · ${e.kind}</div><p>${e.text}</p></div>`;
    body.innerHTML = html;
    return;
  }
  const evOpts = Object.keys(P.evidence).map((id) => `<option value="${id}">${P.evidence[id].title}</option>`).join('');
  body.innerHTML = `
    <p class="hint">Name the murderer, then back it up: <b>Motive</b> = why they would kill tonight. <b>Action</b> = evidence that they actually did it. Suspicion alone is not enough.</p>
    <p class="hint">The lists below contain only the clues you have found: <b>${Object.keys(P.evidence).length} of ${TOTAL_CLUES}</b>. Examine objects, talk to everyone (try different questions), and watch events to find more. Clues stay with you across loops.</p>
    <div class="row"><label>Suspect</label><select id="acc-who">
      <option value="clara">Clara Blackthorn</option><option value="thomas">Thomas Reed</option>
      <option value="helen">Dr Helen Ward</option><option value="julian">Julian Ashcroft</option></select></div>
    <div class="row"><label>Motive</label><select id="acc-motive"><option value="">— choose evidence —</option>${evOpts}</select></div>
    <div class="row"><label>Action</label><select id="acc-act"><option value="">— choose evidence —</option>${evOpts}</select></div>
    <div class="row"><button id="acc-go">Make the accusation</button></div>
    <div id="acc-msg"></div>`;
  $('acc-go').onclick = () => accuse($('acc-who').value, $('acc-motive').value, $('acc-act').value);
}

function accuse(who, motive, act) {
  if (P.solved) return;
  if (who !== 'julian') {
    $('acc-msg').innerHTML = 'This will end the current attempt. Are you certain? <button id="acc-yes">Yes, accuse</button>';
    $('acc-yes').onclick = () => wrongAccusation(who);
    return;
  }
  if (motive !== 'A' || !(act === 'G' || act === 'H')) {
    const missing = [];
    if (motive !== 'A') missing.push(P.evidence.A
      ? 'Motive must be "Edmund\'s Unsigned Statement" — it shows why he would kill tonight.'
      : 'Motive: you have not read Edmund\'s statement yet (on his desk in the Study).');
    if (!(act === 'G' || act === 'H')) missing.push(P.evidence.G || P.evidence.H
      ? 'Action must be evidence that he actually did it: "Witnessed Poisoning" or "Julian\'s Self-Incriminating Response".'
      : 'Action: you do not have proof of the act yet. A vial alone is not enough — you need to see him poison the drink (try the Kitchen serving hatch), or get him to give himself away.');
    $('acc-msg').innerHTML = '<b>Right suspect — but not enough proof yet.</b> Nothing has been lost; keep playing.<br>• ' + missing.join('<br>• ');
    return;
  }
  $('journal').classList.add('hidden');
  L.frozen = true;
  P.solved = true;
  chime(1);
  overlay('Julian Ashcroft poisoned Edmund\'s drink to stop the statement being signed.\n\nNow confront him.',
    [{ label: 'Confront Julian', fn: confrontation }], '✔ CORRECT — Julian Ashcroft is the murderer', 'good');
}

function confrontation() {
  const act = P.evidence.G ? 'G' : 'H';
  sequence([
    ['Morgan', act === 'G'
      ? 'I watched you empty that vial into Edmund\'s glass, Mr Ashcroft.'
      : 'You told me yourself. "Then Edmund hasn\'t drunk—" Hasn\'t drunk what?'],
    ['Julian Ashcroft', 'Twelve years I kept this family\'s name out of the papers. And this is the gratitude.'],
    ['', 'Thomas closes the study door. Helen stands by it. Clara does not look away.'],
    ['Thomas Reed', 'The key, Mr Ashcroft. The one you keep in your waistcoat.'],
    ['', 'Julian hesitates — then places a small brass winding key on the table.'],
  ], () => {
    updateObjective();
    showTip('clock', 'Time is holding still. Take the brass key and your watch to the grandfather clock in the Entrance Hall and press E.');
  });
}

const ACCUSED_NAMES = { clara: 'Clara Blackthorn', thomas: 'Thomas Reed', helen: 'Dr Helen Ward' };
const WHY_INNOCENT = {
  clara: 'Clara loses money under the new will — but she was Daniel\'s friend and wanted the truth told. She never went near the drink.',
  thomas: 'Thomas made the drink, but he poured it clean, set it down and left. He has his own secret about Daniel — not this one.',
  helen: 'Helen checked on Edmund, but never touched the glass. She has something to answer for — but not tonight\'s poison.',
};
function wrongAccusation(who) {
  $('journal').classList.add('hidden');
  chime(13);
  overlay(`${WHY_INNOCENT[who]}\n\nThe real murderer was Julian Ashcroft. He poisoned the drink at about 11:59 to stop Edmund's statement being signed.\n\n` +
    'To win, accuse Julian with proof:\n• Motive — Edmund\'s Unsigned Statement\n• Action — Witnessed Poisoning (watch from the Kitchen serving hatch), or Julian\'s Self-Incriminating Response\n\n[The clock strikes thirteen.]', [
    { label: 'Go back and keep investigating', fn: () => {} },
    { label: 'Restart the entire game', fn: restartGame },
  ], `✘ WRONG — ${ACCUSED_NAMES[who]} is not the murderer`, 'bad');
}

function showEnding() {
  P.ended = true;
  const saved = !L.edmundDead;
  const clues = Object.keys(P.evidence).length;
  const text = saved
    ? 'Edmund signs the statement at one minute past midnight.\nThomas is finally able to speak openly. Clara agrees to testify. Helen accepts her part.\n\n"For the first time in twelve years, the house has nothing left to wait for."'
    : 'Edmund does not wake. But the clock strikes twelve, and only twelve.\nThe survivors agree to release his statement.\n\n"The truth arrived too late for one man. It need not arrive too late for everyone."';
  overlay(`${text}\n\n— Loops experienced: ${P.loop} · Clues discovered: ${clues} · Adaptations triggered: ${P.adaptations} · Edmund saved: ${saved ? 'Yes' : 'No'} —`,
    [{ label: 'Play again', fn: restartGame }], saved ? 'CASE SOLVED — Edmund saved' : 'CASE SOLVED — but too late for Edmund', 'end');
}

// ---------------------------------------------------------------- loop control
function resetLoop() {
  chime(13);
  const k = P.julianKnows;
  k.statement ||= L.seen.statement;
  k.vial ||= L.seen.vial;
  k.poison ||= L.seen.poison;
  P.loop += 1;
  L = freshLoop();
  if (L.strategy !== 'A') P.adaptations += 1;
  updateObjective();
  if (!P.firstResetSeen) {
    P.firstResetSeen = true;
    overlay('[The clock strikes thirteen.]\n\nThe hall lamps steady. Rain against the windows.\nYour watch reads 11:56.\n\nEdmund is alive in his study. Nobody else seems to have noticed anything.\n\n' +
      'HOW THE LOOP WORKS\n• You keep everything in your journal: evidence, and what you saw.\n• Everyone else forgets — and does exactly the same things again.\n• Physical items (like a vial or a glass) go back where they were.\n\nUse what you know. Be where it matters.',
      [{ label: 'Continue', fn: loopStartTips }]);
  } else {
    cue('[The clock strikes thirteen.] — Loop ' + P.loop);
    loopStartTips();
  }
}

function restartGame() {
  P = freshPersistent();
  L = freshLoop();
  P.started = true;
  $('tip').classList.add('hidden');
  updateObjective();
  showStartTip();
}

function showStartTip() {
  showTip('start', 'Follow the gold arrow (and the blinking dot on the map). Reading and talking pause the clock. Press H any time for the full rules.');
}

function updateObjective() {
  let o;
  if (P.solved) o = 'Return the watch and the key to the grandfather clock in the Entrance Hall.';
  else if (!P.evidence.A) o = 'Speak to the guests. Examine Edmund\'s statement in the Study.';
  else if (!P.evidence.G && !P.evidence.H) o = 'Find out how Edmund\'s drink is poisoned — and by whom.';
  else o = 'Open the journal (J) → Accusation, and name the murderer.';
  $('hud-obj').textContent = 'Objective: ' + o;
}

// ---------------------------------------------------------------- update
function update(dt) {
  if (paused() || !P.started) return;
  L.t += dt;

  // Player movement (screen-relative: W is "up" the screen, i.e. north)
  const p = L.player;
  let dx = 0, dy = 0;
  if (keys.w || keys.arrowup || touchKeys.up) dy -= 1;
  if (keys.s || keys.arrowdown || touchKeys.down) dy += 1;
  if (keys.a || keys.arrowleft || touchKeys.left) dx -= 1;
  if (keys.d || keys.arrowright || touchKeys.right) dx += 1;
  p.moving = !!(dx || dy);
  if (dx || dy) {
    const len = Math.hypot(dx, dy);
    const nx = p.x + (dx / len) * PLAYER_SPEED * dt, ny = p.y + (dy / len) * PLAYER_SPEED * dt;
    if (boxWalkable(nx, p.y)) p.x = nx;
    if (boxWalkable(p.x, ny)) p.y = ny;
    p.room = roomAt(p.x, p.y) || p.room;
    p.face = Math.atan2(dx, dy);
  }

  // Scheduled events
  for (const e of L.events) if (!e.done && L.t >= e.t) { e.done = true; e.fn(); }

  // NPC movement
  for (const id in L.npcs) {
    const c = L.npcs[id];
    c.moving = false;
    if (c.state === 'poisoning') continue;
    if (c.path.length) {
      const [tx, ty] = c.path[0];
      const ddx = tx - c.x, ddy = ty - c.y, d = Math.hypot(ddx, ddy);
      const step = NPC_SPEED * dt;
      c.moving = true;
      c.face = Math.atan2(ddx, ddy);
      if (d <= step) { c.x = tx; c.y = ty; c.path.shift(); }
      else { c.x += (ddx / d) * step; c.y += (ddy / d) * step; }
      c.room = roomAt(c.x, c.y) || c.room;
      if (!c.path.length && c.onArrive) { const f = c.onArrive; c.onArrive = null; f(); }
    }
  }

  updateJulianAttempt(dt);

  if (L.t >= LOOP_LEN) resetLoop();
}

function updateJulianAttempt(dt) {
  const j = L.npcs.julian;
  if (j.state === 'atTable' && L.t >= 185 && !L.julianAttempted) {
    L.julianAttempted = true;
    // The attempt needs the vial, the drink, and Julian physically at the table.
    if (L.julianHasVial && L.drink.state === 'onTable' && dist(j, SPOT.julianAtTable) < 5) {
      j.state = 'poisoning'; j.actionT = 0;
      j.face = Math.atan2(SPOT.drinkTable.x - j.x, SPOT.drinkTable.y - j.y);
      doing(j, 'Pouring something into Edmund\'s glass!', 'In the Study');
    } else {
      j.state = 'idle';
      observe('study', 'Julian stands at the drink table a moment, then leaves without touching anything.');
      goTo(j, SPOT.hallJulian, { caption: 'Leaving the Study, empty-handed' });
    }
  }
  if (j.state === 'poisoning') {
    if (L.drink.state !== 'onTable') { j.state = 'idle'; goTo(j, SPOT.hallJulian, { caption: 'Leaving the Study, empty-handed' }); return; }
    j.actionT += dt;
    if (j.actionT >= POISON_DURATION) {
      L.drink.poisoned = true;
      L.julianHasVial = false; L.vial = 'used';
      j.state = 'done';
      if (playerSeesStudy()) {
        logTimeline('Observed', 'Julian empties a small vial into Edmund\'s glass.');
        award('G', `Seen at ${clockString(L.t)} ${nearHatch() ? 'through the serving hatch' : 'in the study'}.`);
        cue('[You saw it. There is still time to take the glass.]');
      }
      if (julianSeesPlayer()) L.seen.poison = true;
      goTo(j, SPOT.hallJulian, { avoid: L.strategy === 'C' ? [] : ['service'], caption: 'Leaving the Study quickly' },
        () => doing(j, 'Waiting politely in the Hall'));
    }
  }
}

// ---------------------------------------------------------------- HUD
let lastTick = 0, lastGuide = '';
const mini = $('minimap').getContext('2d');
const MS = 0.2;
function drawMinimap(target) {
  mini.clearRect(0, 0, 192, 116);
  mini.fillStyle = 'rgba(8,9,13,.85)'; mini.fillRect(0, 0, 192, 116);
  const pr = playerRoom();
  for (const k in ROOMS) {
    const r = ROOMS[k];
    mini.fillStyle = k === pr ? '#6a5a3a' : '#2c2f3a';
    mini.fillRect(r.x * MS, r.y * MS - 4, r.w * MS, r.h * MS);
    mini.fillStyle = '#d8ccb0'; mini.font = '9px Georgia';
    mini.fillText(k === 'kitchen' ? 'Kitchen' : r.label.replace('Entrance ', ''), r.x * MS + 3, r.y * MS + 7);
  }
  mini.fillStyle = '#2c2f3a';
  for (const d of DOORS) mini.fillRect(d.x * MS, d.y * MS - 4, d.w * MS, d.h * MS);
  if (target) {
    const blink = Math.floor(performance.now() / 400) % 2;
    mini.fillStyle = blink ? '#ffdf7a' : '#c99a3a';
    mini.beginPath(); mini.arc(target.x * MS, target.y * MS - 4, 4, 0, Math.PI * 2); mini.fill();
  }
  mini.fillStyle = '#e2bf74'; mini.strokeStyle = '#000';
  mini.beginPath(); mini.arc(L.player.x * MS, L.player.y * MS - 4, 3.5, 0, Math.PI * 2); mini.fill(); mini.stroke();
}
function openAccusation() {
  if (isOpen('overlay')) return;
  jnTab = 'accuse';
  $('journal').classList.remove('hidden');
  renderJournal();
}
$('btn-accuse').onclick = openAccusation;
function hud() {
  $('hud-loop').textContent = `Loop ${P.loop}`;
  $('hud-time').textContent = clockString(Math.min(L.t, LOOP_LEN - 0.01));
  const left = Math.max(0, LOOP_LEN - L.t);
  $('hud-left').textContent = P.solved ? 'Time is holding still.' : `${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, '0')} until midnight`;
  $('hud-left').classList.toggle('urgent', !P.solved && left < 60);
  const it = paused() ? null : nearest();
  const pr = $('prompt');
  if (it) { pr.textContent = `Press E — ${it.label}`; pr.classList.remove('hidden'); } else pr.classList.add('hidden');

  // Next-step panel (reappears whenever the step changes, even if dismissed)
  const g = guide();
  if (g.text !== lastGuide) {
    lastGuide = g.text;
    $('tip-text').textContent = g.text;
    $('tip').classList.remove('hidden');
  }
  const showNote = performance.now() < noteUntil;
  $('tip-note').textContent = showNote ? noteText : '';
  $('tip-note').classList.toggle('hidden', !showNote);
  $('btn-accuse').classList.toggle('ready', !!(P.evidence.G || P.evidence.H) && !P.solved);
  drawMinimap(g.target);
  // Ticking clock, audible in the hall
  const sec = Math.floor(L.t);
  if (!paused() && sec !== lastTick) { lastTick = sec; if (playerRoom() === 'hall') tone(1400, 0.03, 0.03, 'square'); }
}

let prev = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - prev) / 1000);
  prev = now;
  update(dt);
  if (window.Render) window.Render.draw(dt);
  hud();
  requestAnimationFrame(frame);
}

// ---------------------------------------------------------------- boot
// ---------------------------------------------------------------- tutorial (shown before play, replayable from Help)
const tutPages = [...document.querySelectorAll('.tut-page')];
let tutIndex = 0, tutDone = null;
function showTutorial(onDone) {
  tutDone = onDone;
  tutIndex = 0;
  $('help').classList.add('hidden');
  $('tutorial').classList.remove('hidden');
  renderTutorial();
}
function renderTutorial() {
  tutPages.forEach((p, i) => p.classList.toggle('active', i === tutIndex));
  $('tut-dots').innerHTML = tutPages.map((_, i) => `<span class="${i === tutIndex ? 'on' : ''}"></span>`).join('');
  $('tut-back').disabled = tutIndex === 0;
  const last = tutIndex === tutPages.length - 1;
  $('tut-next').textContent = last ? (P.started ? 'Back to the game' : 'Start the investigation') : 'Next';
  $('tut-skip').classList.toggle('hidden', last);
  $('tut-next').focus();
}
function finishTutorial() {
  $('tutorial').classList.add('hidden');
  const f = tutDone; tutDone = null;
  if (f) f();
}
function tutStep(d) {
  if (tutIndex + d >= tutPages.length) return finishTutorial();
  tutIndex = Math.max(0, tutIndex + d);
  renderTutorial();
}
$('tut-next').onclick = () => tutStep(1);
$('tut-back').onclick = () => tutStep(-1);
$('tut-skip').onclick = finishTutorial;
$('help-tutorial').onclick = () => showTutorial(null);
addEventListener('keydown', (e) => {
  if (!isOpen('tutorial')) return;
  if (e.key === 'ArrowRight') tutStep(1);
  else if (e.key === 'ArrowLeft') tutStep(-1);
});

P = freshPersistent();
L = freshLoop();
updateObjective();
showTutorial(() => { ensureAudio(); P.started = true; showStartTip(); });
requestAnimationFrame(frame);

// Debug hooks for automated checks. ?dev skips the intro and shows script errors on screen.
window.__game = { get P() { return P; }, get L() { return L; }, update, resetLoop };
if (location.search.includes('dev')) {
  window.onerror = (msg, src, line) => { $('hud-obj').textContent = `ERROR: ${msg} (${src}:${line})`; };
  $('overlay').classList.add('hidden');
  $('tutorial').classList.add('hidden'); tutDone = null;
  P.started = true;
  showStartTip();
  const q = new URLSearchParams(location.search);
  if (q.get('x')) { L.player.x = +q.get('x'); L.player.y = +q.get('y'); L.player.room = roomAt(L.player.x, L.player.y); }
  if (q.get('t')) {
    const px = L.player.x, py = L.player.y;
    while (L.t < +q.get('t') && !paused()) { update(0.05); L.player.x = px; L.player.y = py; }
  }
}
