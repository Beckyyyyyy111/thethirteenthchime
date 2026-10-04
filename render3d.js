'use strict';
// 3D view of Blackthorn Hall (Three.js r128). Reads game state from game.js; never changes it.
// Map x -> world x, map y -> world z. 1 map unit = 1 world unit.

(function () {
  const stage = $('stage');
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  stage.prepend(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x05060a);
  scene.fog = new THREE.Fog(0x05060a, 700, 1400);
  const camera = new THREE.PerspectiveCamera(40, 16 / 10, 1, 3000);

  function resize() {
    const w = stage.clientWidth;
    const h = Math.max(260, Math.min(Math.round(w * 0.6), window.innerHeight - 300));
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  addEventListener('resize', resize);
  resize();

  // ------------------------------------------------------------ materials
  const mats = {};
  function mat(color, opts = {}) {
    const key = color + JSON.stringify(opts);
    if (!mats[key]) mats[key] = new THREE.MeshStandardMaterial(Object.assign({ color, roughness: 0.8, metalness: 0.05 }, opts));
    return mats[key];
  }
  function box(w, h, d, color, x, y, z, opts) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color, opts));
    m.position.set(x, y, z);
    m.castShadow = true; m.receiveShadow = true;
    scene.add(m);
    return m;
  }
  function cyl(rt, rb, h, color, x, y, z, opts, seg = 16) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat(color, opts));
    m.position.set(x, y, z);
    m.castShadow = true; m.receiveShadow = true;
    scene.add(m);
    return m;
  }

  // ------------------------------------------------------------ floors & rugs
  function floorTexture(base, kind) {
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const g = c.getContext('2d');
    g.fillStyle = base; g.fillRect(0, 0, 256, 256);
    if (kind === 'boards') {
      for (let i = 0; i < 8; i++) {
        g.fillStyle = `rgba(0,0,0,${0.08 + (i % 3) * 0.04})`;
        g.fillRect(0, i * 32, 256, 2);
        g.fillRect(((i * 97) % 256), i * 32, 2, 32);
      }
    } else if (kind === 'tiles') {
      for (let x = 0; x < 8; x++) for (let y = 0; y < 8; y++) {
        g.fillStyle = (x + y) % 2 ? 'rgba(255,255,255,.07)' : 'rgba(0,0,0,.12)';
        g.fillRect(x * 32, y * 32, 32, 32);
      }
    } else {
      for (let i = 0; i < 400; i++) { g.fillStyle = `rgba(0,0,0,${Math.random() * 0.08})`; g.fillRect(Math.random() * 256, Math.random() * 256, 3, 3); }
    }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.encoding = THREE.sRGBEncoding;
    return t;
  }
  const FLOOR_KIND = { conservatory: 'tiles', study: 'boards', kitchen: 'tiles', dining: 'boards', hall: 'boards' };
  for (const k in ROOMS) {
    const r = ROOMS[k];
    const tex = floorTexture(r.floor, FLOOR_KIND[k]);
    tex.repeat.set(r.w / 80, r.h / 80);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(r.w, r.h), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 }));
    m.rotation.x = -Math.PI / 2;
    m.position.set(r.x + r.w / 2, 0, r.y + r.h / 2);
    m.receiveShadow = true;
    scene.add(m);
  }
  for (const d of DOORS) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(d.w, d.h), mat('#3a2a1c'));
    m.rotation.x = -Math.PI / 2; m.position.set(d.x + d.w / 2, 0.2, d.y + d.h / 2); m.receiveShadow = true;
    scene.add(m);
  }
  function rug(x, z, w, d, color) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat(color));
    m.rotation.x = -Math.PI / 2; m.position.set(x, 0.4, z); m.receiveShadow = true;
    scene.add(m);
  }
  rug(470, 170, 150, 110, '#6b2424');
  rug(640, 455, 260, 120, '#3b2a4a');
  rug(170, 515, 190, 90, '#4a3020');

  // Room name painted on the floor
  function floorLabel(text, x, z) {
    const c = document.createElement('canvas'); c.width = 512; c.height = 64;
    const g = c.getContext('2d');
    g.font = 'italic 40px Georgia'; g.fillStyle = 'rgba(241,235,221,.75)'; g.textAlign = 'center';
    g.fillText(text, 256, 46);
    const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(200, 25), new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false }));
    m.rotation.x = -Math.PI / 2; m.position.set(x, 0.6, z);
    scene.add(m);
  }
  for (const k in ROOMS) { const r = ROOMS[k]; floorLabel(r.label, r.x + r.w / 2, r.y + r.h - 18); }

  // ------------------------------------------------------------ walls (everything inside the house footprint that is not floor)
  const WALL_H = 55, HATCH_H = 24, CELL = 10;
  const walls = [];
  const wallTex = (() => {
    const c = document.createElement('canvas'); c.width = 64; c.height = 64;
    const g = c.getContext('2d');
    g.fillStyle = '#6a5848'; g.fillRect(0, 0, 64, 64);
    g.fillStyle = '#4a3c30'; g.fillRect(0, 44, 64, 20); // wainscot
    g.fillStyle = '#2e251d'; g.fillRect(0, 42, 64, 3);
    const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; return t;
  })();
  function addWall(x0, x1, z0, z1, h) {
    const w = x1 - x0, d = z1 - z0;
    const side = new THREE.MeshStandardMaterial({ map: wallTex, transparent: true });
    const top = new THREE.MeshStandardMaterial({ color: '#1b1612', transparent: true });
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), [side, side, top, top, side, side]);
    m.position.set(x0 + w / 2, h / 2, z0 + d / 2);
    m.castShadow = true; m.receiveShadow = true;
    scene.add(m);
    walls.push({ mesh: m, mats: [side, top], cx: x0 + w / 2, z0, w, opacity: 1 });
  }
  // Scan the footprint in rows, then merge identical runs in consecutive rows into single blocks.
  const isHatch = (gx, gy) => gx >= 620 && gx < 660 && gy >= 100 && gy < 140;
  const runs = [];
  for (let gy = 20; gy < 600; gy += CELL) {
    let start = null, type = null;
    for (let gx = 0; gx <= 960; gx += CELL) {
      const solid = gx < 960 && !walkable(gx + CELL / 2, gy + CELL / 2);
      const t = solid ? (isHatch(gx, gy) ? 'h' : 'w') : null;
      if (t !== type) {
        if (type) runs.push({ x0: start, x1: gx, z0: gy, z1: gy + CELL, h: type === 'h' ? HATCH_H : WALL_H });
        start = gx; type = t;
      }
    }
  }
  const merged = [];
  for (const r of runs) {
    const m = merged.find((o) => o.x0 === r.x0 && o.x1 === r.x1 && o.h === r.h && o.z1 === r.z0);
    if (m) m.z1 = r.z1; else merged.push({ ...r });
  }
  for (const r of merged) addWall(r.x0, r.x1, r.z0, r.z1, r.h);
  // Windows along the north wall (cold blue glass) and lightning behind them
  for (const x of [80, 220, 400, 540, 720, 860]) {
    box(50, 30, 2, '#1d2c44', x, 34, 21, { emissive: new THREE.Color('#1a2a48'), emissiveIntensity: 0.6, roughness: 0.2 });
  }

  // ------------------------------------------------------------ lights
  const ambient = new THREE.AmbientLight(0x6070a0, 0.45);
  scene.add(ambient);
  const hemi = new THREE.HemisphereLight(0x8899cc, 0x1a120c, 0.35);
  scene.add(hemi);
  const moon = new THREE.DirectionalLight(0x9fb0e0, 0.35);
  moon.position.set(300, 600, -200);
  moon.target.position.set(480, 0, 310);
  moon.castShadow = true;
  moon.shadow.mapSize.set(2048, 2048);
  Object.assign(moon.shadow.camera, { left: -600, right: 600, top: 400, bottom: -400, near: 10, far: 1500 });
  scene.add(moon, moon.target);
  function lamp(x, z, color, intensity, dist) {
    const l = new THREE.PointLight(color, intensity, dist, 1.6);
    l.position.set(x, 110, z);
    scene.add(l);
    return l;
  }
  lamp(160, 165, 0xbcd4ff, 1.0, 380);  // conservatory: cool
  const studyLamp = lamp(430, 120, 0xffc27a, 1.2, 380);
  lamp(800, 165, 0xfff0d0, 1.0, 380);  // kitchen
  lamp(160, 455, 0xffb070, 1.1, 380);  // dining
  lamp(500, 455, 0xffc890, 1.0, 420);  // hall west
  lamp(800, 455, 0xffc890, 1.0, 420);  // hall east
  const fire = new THREE.PointLight(0xff7a2a, 1.4, 260, 1.8);
  fire.position.set(590, 30, 70);
  scene.add(fire);

  // ------------------------------------------------------------ furniture
  // Study
  box(80, 22, 30, '#4a2e1a', 410, 11, 60);                 // desk
  box(28, 1, 20, '#efe6cf', 385, 22.6, 62);                // statement
  cyl(2, 4, 14, '#c9a45c', 435, 29, 55);                   // desk lamp
  box(22, 26, 20, '#3a1f14', 448, 13, 114);                // Edmund's chair
  box(50, 34, 16, '#3b3330', 590, 17, 48);                 // fireplace surround
  const fireGlow = box(30, 14, 4, '#ff7a2a', 590, 9, 57, { emissive: new THREE.Color('#ff5a10'), emissiveIntensity: 1.5 });
  cyl(13, 11, 22, '#4a2e1a', 560, 11, 150);                // drink table
  box(28, 1, 18, '#b8b8c0', 560, 22.6, 150, { metalness: 0.8, roughness: 0.3 }); // tray
  const glass = cyl(3, 2.5, 8, '#c8862c', 560, 27, 150, { transparent: true, opacity: 0.85, roughness: 0.1, emissive: new THREE.Color('#5a3000'), emissiveIntensity: 0.4 });
  // Kitchen
  box(50, 50, 22, '#6b5a40', 900, 25, 54);                 // cupboard
  box(80, 20, 40, '#8a7a60', 780, 10, 150);                // worktable
  box(40, 6, 4, '#5a4a30', 880, 44, 287);                  // coat rail
  const julianCoat = box(14, 34, 6, '#2b2b30', 870, 26, 283);
  box(14, 30, 6, '#5a4632', 892, 28, 283);                 // someone else's coat
  // Dining
  box(22, 26, 68, '#4a2e1a', 34, 13, 390);                 // sideboard
  cyl(4, 6, 12, '#7a2a2a', 34, 32, 380, { transparent: true, opacity: 0.8 }); // decanter
  box(140, 20, 50, '#3e2416', 170, 10, 515);               // dining table
  for (const x of [120, 170, 220]) { box(14, 24, 14, '#2e1a10', x, 12, 482); box(14, 24, 14, '#2e1a10', x, 12, 548); }
  box(20, 1, 14, '#efe6cf', 228, 20.6, 512);               // revised will
  // Hall
  const clockCase = box(20, 86, 14, '#5a3416', 905, 43, 341);
  const clockFace = cyl(8, 8, 2, '#e8dcb8', 905, 70, 348.5, { emissive: new THREE.Color('#40382a'), emissiveIntensity: 0.6 }, 24);
  clockFace.rotation.x = Math.PI / 2;
  const pendulum = new THREE.Group();
  const rod = new THREE.Mesh(new THREE.BoxGeometry(1, 26, 1), mat('#c9a45c', { metalness: 0.8 }));
  rod.position.y = -13; pendulum.add(rod);
  const bob = new THREE.Mesh(new THREE.SphereGeometry(3, 12, 8), mat('#c9a45c', { metalness: 0.8, roughness: 0.3 }));
  bob.position.y = -26; pendulum.add(bob);
  pendulum.position.set(905, 58, 348.5);
  scene.add(pendulum);
  box(16, 30, 12, '#4a2e1a', 860, 15, 341);                // lectern
  box(12, 1, 9, '#efe6cf', 860, 30.6, 341);                // restoration note
  box(30, 22, 14, '#4a2e1a', 600, 11, 341);                // photo table
  box(14, 18, 2, '#c9a45c', 600, 31, 340);                 // frame
  box(10, 13, 1, '#b0a890', 600, 31, 341.2);               // photo
  cyl(2, 5, 50, '#3a2414', 360, 25, 558);                  // coat stand
  // Conservatory
  box(60, 14, 24, '#7a6a50', 90, 7, 74);                   // bench
  for (const [x, z] of [[40, 60], [280, 60], [40, 270], [280, 270], [220, 120]]) {
    cyl(8, 6, 14, '#7a4a30', x, 7, z);
    const leaf = new THREE.Mesh(new THREE.SphereGeometry(16, 10, 8), mat('#2f5a34'));
    leaf.position.set(x, 26, z); leaf.castShadow = true; scene.add(leaf);
  }

  // ------------------------------------------------------------ characters
  function labelSprite(text, color = '#f1ebdd') {
    const c = document.createElement('canvas'); c.width = 256; c.height = 64;
    const g = c.getContext('2d');
    g.font = 'bold 30px Georgia'; g.textAlign = 'center';
    g.lineWidth = 6; g.strokeStyle = 'rgba(0,0,0,.85)'; g.strokeText(text, 128, 42);
    g.fillStyle = color; g.fillText(text, 128, 42);
    const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding;
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true }));
    s.scale.set(56, 14, 1);
    s.renderOrder = 10;
    return s;
  }
  const SKIN = '#e6c3a0';
  const LOOK = {
    edmund: { coat: '#5a2a2a', hair: '#d8d8d8', label: 'Edmund' },
    julian: { coat: '#2f3d55', hair: '#2a2018', label: 'Julian' },
    thomas: { coat: '#1e1e22', hair: '#8a8a8a', label: 'Thomas', shirt: '#f0f0f0' },
    clara: { coat: '#8c2f45', hair: '#6a3a1a', label: 'Clara', dress: true },
    helen: { coat: '#4f7f6a', hair: '#3a2a20', label: 'Helen' },
    player: { coat: '#8a6a2a', hair: '#2a1a10', label: 'You (Morgan)', hat: true },
  };
  function figure(id) {
    const look = LOOK[id];
    const g = new THREE.Group();
    const body = new THREE.Group(); g.add(body);
    const legs = [];
    for (const sx of [-3.5, 3.5]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(5, 14, 5), mat('#1a1a1e'));
      leg.position.set(sx, 7, 0); leg.castShadow = true; body.add(leg); legs.push(leg);
    }
    const torso = new THREE.Mesh(look.dress ? new THREE.CylinderGeometry(6, 11, 20, 12) : new THREE.BoxGeometry(15, 18, 9), mat(look.coat));
    torso.position.y = look.dress ? 22 : 23; torso.castShadow = true; body.add(torso);
    if (look.shirt) { const s = new THREE.Mesh(new THREE.BoxGeometry(5, 10, 1), mat(look.shirt)); s.position.set(0, 26, 4.6); body.add(s); }
    const head = new THREE.Mesh(new THREE.SphereGeometry(6.5, 16, 12), mat(SKIN));
    head.position.y = 38; head.castShadow = true; body.add(head);
    const hair = new THREE.Mesh(new THREE.SphereGeometry(6.8, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat(look.hair));
    hair.position.y = 38.5; hair.rotation.x = -0.25; body.add(hair);
    if (look.hat) {
      const brim = new THREE.Mesh(new THREE.CylinderGeometry(10, 10, 1, 20), mat('#3a2a14')); brim.position.y = 43; body.add(brim);
      const crown = new THREE.Mesh(new THREE.CylinderGeometry(6, 6.5, 6, 16), mat('#3a2a14')); crown.position.y = 46.5; body.add(crown);
    }
    const label = labelSprite(look.label, id === 'player' ? '#e2bf74' : '#f1ebdd');
    label.position.y = 60; g.add(label);
    // Caption: what this character is doing right now
    const capCanvas = document.createElement('canvas'); capCanvas.width = 1024; capCanvas.height = 96;
    const capTex = new THREE.CanvasTexture(capCanvas); capTex.encoding = THREE.sRGBEncoding;
    const caption = new THREE.Sprite(new THREE.SpriteMaterial({ map: capTex, depthTest: false, transparent: true }));
    caption.scale.set(185, 17.3, 1); caption.position.y = 80; caption.renderOrder = 10; caption.visible = false;
    g.add(caption);
    scene.add(g);
    return { g, body, legs, walk: 0, phase: Math.random() * 6, caption, capCanvas, capTex, capText: '' };
  }
  function setCaption(f, text) {
    if (text === f.capText) return;
    f.capText = text;
    f.caption.visible = !!text;
    if (!text) return;
    const g = f.capCanvas.getContext('2d');
    g.clearRect(0, 0, 1024, 96);
    g.font = 'italic 46px Georgia';
    const w = Math.min(1016, g.measureText(text).width + 40);
    const urgent = text.endsWith('!');
    g.fillStyle = urgent ? 'rgba(120,20,15,.92)' : 'rgba(12,12,18,.85)';
    g.fillRect(512 - w / 2, 8, w, 80);
    g.strokeStyle = urgent ? '#ff8a7a' : 'rgba(226,191,116,.75)'; g.lineWidth = 3;
    g.strokeRect(512 - w / 2, 8, w, 80);
    g.fillStyle = urgent ? '#ffe0da' : '#f1ebdd'; g.textAlign = 'center';
    g.fillText(text, 512, 63);
    f.capTex.needsUpdate = true;
  }
  const figs = {};
  for (const id of ['edmund', 'julian', 'thomas', 'clara', 'helen', 'player']) figs[id] = figure(id);
  // Glass carried on Thomas's tray
  const carried = cyl(3, 2.5, 8, '#c8862c', 0, 0, 0, { transparent: true, opacity: 0.85 });
  // Poisoning progress bar above Julian
  const barBg = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0x300000, depthTest: false }));
  const barFg = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0xdd3333, depthTest: false }));
  barBg.center.set(0, 0.5); barFg.center.set(0, 0.5);
  barBg.renderOrder = barFg.renderOrder = 11;
  scene.add(barBg, barFg);

  // ------------------------------------------------------------ markers
  const ring = new THREE.Mesh(new THREE.RingGeometry(14, 18, 32), new THREE.MeshBasicMaterial({ color: 0xe2bf74, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.8;
  scene.add(ring);
  function qSprite() {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d');
    g.fillStyle = '#e2bf74'; g.beginPath(); g.arc(32, 32, 28, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#1a1206'; g.font = 'bold 44px Georgia'; g.textAlign = 'center'; g.fillText('?', 32, 48);
    const t = new THREE.CanvasTexture(c);
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true }));
    s.scale.set(16, 16, 1); s.renderOrder = 9;
    scene.add(s);
    return s;
  }
  // Only things the player has not yet learned get a marker.
  const hints = [
    { spot: { x: 385, y: 62 }, h: 40, show: () => !P.evidence.A },
    { spot: { x: 860, y: 341 }, h: 46, show: () => !P.evidence.I },
    { spot: { x: 690, y: 118 }, h: 40, show: () => P.loop >= 2 && !P.evidence.G },
    { spot: { x: 905, y: 341 }, h: 100, show: () => P.solved },
  ].map((h) => Object.assign(h, { sprite: qSprite() }));
  // Gold arrow pointing down at the current "Next step" target
  const arrow = new THREE.Mesh(new THREE.ConeGeometry(8, 18, 4), new THREE.MeshBasicMaterial({ color: 0xffd36a, depthTest: false, transparent: true }));
  arrow.rotation.x = Math.PI; arrow.renderOrder = 12;
  scene.add(arrow);
  const targetDisc = new THREE.Mesh(new THREE.CircleGeometry(16, 32), new THREE.MeshBasicMaterial({ color: 0xffd36a, transparent: true, opacity: 0.25, depthWrite: false }));
  targetDisc.rotation.x = -Math.PI / 2; targetDisc.position.y = 0.7;
  scene.add(targetDisc);

  // ------------------------------------------------------------ camera
  let zoom = 1;
  renderer.domElement.addEventListener('wheel', (e) => {
    e.preventDefault();
    zoom = Math.min(1.6, Math.max(0.6, zoom * (e.deltaY > 0 ? 1.08 : 0.93)));
  }, { passive: false });
  const camTarget = new THREE.Vector3(L.player.x, 0, L.player.y);
  camera.position.set(L.player.x, 380, L.player.y + 300);

  // ------------------------------------------------------------ per-frame
  let time = 0, flash = 0;
  const lerp = (a, b, t) => a + (b - a) * t;
  const ROT_OFFSET = 0; // models face +z by default; atan2(dx, dy) already maps to that

  function placeFigure(f, x, z, face, moving, dt) {
    f.g.position.x = x; f.g.position.z = z;
    if (face !== undefined) {
      let diff = face + ROT_OFFSET - f.g.rotation.y;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      f.g.rotation.y += diff * Math.min(1, dt * 12);
    }
    if (moving) f.walk += dt * 10; else f.walk *= 0.8;
    const s = Math.sin(f.walk) * (moving ? 0.5 : 0);
    f.legs[0].rotation.x = s; f.legs[1].rotation.x = -s;
    f.body.position.y = moving ? Math.abs(Math.sin(f.walk)) * 1.5 : 0;
  }

  function draw(dt) {
    time += dt;
    const p = L.player;

    // Characters
    placeFigure(figs.player, p.x, p.y, p.face, p.moving && !uiOpen(), dt);
    setCaption(figs.player, nearHatch() ? 'Watching the Study through the hatch — unseen' : '');
    for (const id in L.npcs) {
      const c = L.npcs[id], f = figs[id];
      setCaption(f, captionFor(c));
      placeFigure(f, c.x, c.y, id === 'edmund' && !c.moving ? Math.PI : c.face, c.moving && !paused(), dt);
      // Idle characters glance around instead of standing frozen.
      const idle = !c.moving && c.state !== 'poisoning' && !(id === 'edmund' && L.edmundDead);
      f.body.rotation.y = lerp(f.body.rotation.y, idle ? Math.sin(time * 0.7 + f.phase) * 0.45 : 0, Math.min(1, dt * 3));
      if (id === 'edmund') {
        const dead = L.edmundDead;
        // Slumps forward over the desk (local +z faces the desk).
        f.body.rotation.x = lerp(f.body.rotation.x, dead ? 1.1 : 0, Math.min(1, dt * 4));
      }
    }
    // Julian leans in while poisoning; bar visible only to someone who can see the study
    const j = L.npcs.julian, fj = figs.julian;
    fj.body.rotation.x = lerp(fj.body.rotation.x, j.state === 'poisoning' ? 0.35 : 0, Math.min(1, dt * 6));
    const showBar = j.state === 'poisoning' && playerSeesStudy();
    barBg.visible = barFg.visible = showBar;
    if (showBar) {
      const prog = Math.min(1, j.actionT / POISON_DURATION);
      barBg.position.set(j.x - 20, 94, j.y); barBg.scale.set(40, 5, 1);
      barFg.position.set(j.x - 20, 94, j.y); barFg.scale.set(Math.max(0.01, 40 * prog), 5, 1);
    }

    // Drink
    glass.visible = L.drink.state === 'onTable';
    const th = L.npcs.thomas;
    carried.visible = L.drink.state === 'carried' && th.state !== 'preparing';
    if (carried.visible) carried.position.set(th.x + Math.sin(th.face || 0) * 9, 30, th.y + Math.cos(th.face || 0) * 9);
    julianCoat.visible = L.strategy === 'C' ? (L.vial === 'coat' || L.vial === 'player') : true;

    // Clock
    pendulum.rotation.z = Math.sin(time * Math.PI) * 0.25;

    // Fire flicker
    const fl = 1.2 + Math.sin(time * 11) * 0.15 + Math.sin(time * 17.3) * 0.1;
    fire.intensity = fl;
    fireGlow.material.emissiveIntensity = fl;

    // Lightning
    if (Math.random() < 0.0012) flash = 1;
    hemi.intensity = 0.35 + flash * 1.6;
    flash = Math.max(0, flash - dt * 2.5);

    // Interaction ring
    const it = uiOpen() ? null : nearest();
    ring.visible = !!it;
    if (it) {
      ring.position.x = it.x; ring.position.z = it.y;
      ring.scale.setScalar(1 + Math.sin(time * 5) * 0.08);
    }
    const target = guide().target;
    arrow.visible = targetDisc.visible = !!target;
    if (target) {
      arrow.position.set(target.x, 62 + Math.abs(Math.sin(time * 3)) * 10, target.y);
      arrow.rotation.y = time * 1.5;
      targetDisc.position.x = target.x; targetDisc.position.z = target.y;
    }
    // Hint markers
    for (const h of hints) {
      h.sprite.visible = h.show();
      h.sprite.position.set(h.spot.x, h.h + Math.sin(time * 3) * 3, h.spot.y);
    }

    // Camera follows the player; walls between camera and player fade out
    // Clamp so the view never drifts far past the edge of the house.
    const clampX = Math.min(780, Math.max(180, p.x)), clampZ = Math.min(420, Math.max(160, p.y));
    camTarget.x = lerp(camTarget.x, clampX, Math.min(1, dt * 5));
    camTarget.z = lerp(camTarget.z, clampZ, Math.min(1, dt * 5));
    const cx = camTarget.x, cz = camTarget.z;
    camera.position.set(lerp(camera.position.x, cx, 0.2), lerp(camera.position.y, 470 * zoom, 0.2), lerp(camera.position.z, cz + 300 * zoom, 0.2));
    camera.lookAt(cx, 0, cz - 25);
    for (const w of walls) {
      const inFront = w.z0 > p.y + 8 && w.z0 - p.y < 140 && Math.abs(w.cx - p.x) < w.w / 2 + 120;
      w.opacity = lerp(w.opacity, inFront ? 0.22 : 1, Math.min(1, dt * 8));
      for (const m of w.mats) m.opacity = w.opacity;
      w.mesh.castShadow = w.opacity > 0.9;
    }

    renderer.render(scene, camera);
  }

  window.Render = { draw };
})();
