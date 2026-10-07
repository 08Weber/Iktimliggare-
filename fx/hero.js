// Klockkortets 3D-scen: klättraren från ikonen hänger i repet vid en fasad.
// När ett pass pågår firar han sig ned – en våning per timme, i små ryck var femte minut.
import * as THREE from 'three';
import {
    createView, makeEnvironment, dotTexture, canvasTexture, textTexture, fontsReady,
    damp, easeInOutCubic, COLORS,
} from './common.js';
import { buildMembers, buildRope, buildCarabiner, loadClimberGeometry } from './models.js';

const FLOOR = 3;          // höjd per timme
const STEP_MINUTES = 5;   // ett ryck nedåt var femte minut
const WALL_X = 1.78;      // fötterna når väggen här (räknat från repet)
const ROOF_Y = 2.5;
const SCALE = 0.0062;     // SVG-pixlar → världsenheter
const ANCHOR_Y = ROOF_Y + 2.45;
const GOAL_HOURS = 8;

const stepY = n => -n * (STEP_MINUTES / 60) * FLOOR;

export function createHero(canvas, state) {
    let busyUntil = 0;
    const view = createView(canvas, {
        alpha: true,
        fps: () => (state.reduced ? 2 : performance.now() < busyUntil ? 60 : 40),
        paused: () => state.introRunning,
    });
    const { renderer } = view;
    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog('#09090c', 8, 24);
    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 120);
    const env = makeEnvironment(renderer);
    const dot = dotTexture();

    // ---------- Ljus ----------
    scene.add(new THREE.HemisphereLight('#9aa8d0', '#140c05', 0.6));
    const key = new THREE.DirectionalLight('#fff1dc', 2.4);
    key.position.set(-4, 6, 8);
    scene.add(key);
    const rim = new THREE.DirectionalLight(COLORS.amber.clone(), 3.2);
    rim.position.set(3, 3, -6);
    scene.add(rim);

    // ---------- Fasaden ----------
    scene.add(buildFacade());

    const steel = new THREE.MeshStandardMaterial({ color: '#9a9aa4', metalness: 0.7, roughness: 0.35, envMap: env, envMapIntensity: 0.6 });
    const parapet = new THREE.Mesh(
        new THREE.BoxGeometry(0.6, 0.5, 26),
        new THREE.MeshStandardMaterial({ color: '#2a2a31', roughness: 0.9 })
    );
    parapet.position.set(WALL_X + 0.2, ROOF_Y + 0.25, -7);
    scene.add(parapet);
    const flashing = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.06, 26), steel);
    flashing.position.set(WALL_X + 0.2, ROOF_Y + 0.52, -7);
    scene.add(flashing);

    // Davit (takbom) som repen hänger i
    const V = (x, y, z = 0) => new THREE.Vector3(x, y, z);
    scene.add(buildMembers([
        [V(WALL_X + 1.6, ROOF_Y + 0.5), V(WALL_X + 1.25, ANCHOR_Y + 0.05), 0.07],
        [V(WALL_X + 1.25, ANCHOR_Y + 0.05), V(-0.1, ANCHOR_Y + 0.1), 0.06],
        [V(WALL_X + 1.5, ROOF_Y + 1.1), V(WALL_X + 0.1, ANCHOR_Y + 0.08), 0.04],
    ], steel, 8));
    const pulley = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.035, 8, 20), steel);
    pulley.position.set(0, ANCHOR_Y, 0);
    scene.add(pulley);

    // ---------- Repen (rör sig som en pendel från davitens spets) ----------
    const ropes = new THREE.Group();
    ropes.position.set(0, ANCHOR_Y, 0);
    scene.add(ropes);
    const ropeA = buildRope({ length: 90, radius: 0.032, base: '#f59e0b', stripe: '#7c2d12', wobble: 0 });
    ropeA.position.z = 0.05;
    const ropeB = buildRope({ length: 90, radius: 0.03, base: '#e4e4e7', stripe: '#1d4ed8', wobble: 0 });
    ropeB.position.z = -0.07;
    ropes.add(ropeA, ropeB);

    // ---------- Timmarkeringar på väggen: "1 h", "2 h" … ----------
    const markers = new THREE.Group();
    scene.add(markers);
    fontsReady().then(() => {
        for (let h = 1; h <= 16; h++) {
            const goal = h === GOAL_HOURS;
            const color = goal ? COLORS.emeraldLight : COLORS.amberLight;
            const label = new THREE.Mesh(
                new THREE.PlaneGeometry(1.4, 0.7),
                new THREE.MeshBasicMaterial({
                    map: textTexture(goal ? `${h} h ✓` : `${h} h`), color, transparent: true,
                    opacity: 0.95, toneMapped: false, depthWrite: false,
                })
            );
            label.rotation.y = -Math.PI / 2;
            label.position.set(WALL_X - 0.02, -h * FLOOR + 0.42, -1.5);
            const line = new THREE.Mesh(
                new THREE.PlaneGeometry(26, goal ? 0.06 : 0.035),
                new THREE.MeshBasicMaterial({ color, transparent: true, opacity: goal ? 0.8 : 0.45, toneMapped: false, depthWrite: false })
            );
            line.rotation.y = -Math.PI / 2;
            line.position.set(WALL_X - 0.015, -h * FLOOR, -7);
            markers.add(label, line);
        }
    });

    // ---------- Klättraren ----------
    const climber = new THREE.Group();
    scene.add(climber);
    const climberMat = new THREE.MeshStandardMaterial({
        color: '#f59e0b', metalness: 0.78, roughness: 0.3, envMap: env, envMapIntensity: 0.95,
        emissive: '#f59e0b', emissiveIntensity: 0,
    });
    loadClimberGeometry('assets/climber.svg').then(geometry => {
        const mesh = new THREE.Mesh(geometry, climberMat);
        mesh.scale.set(SCALE, -SCALE, SCALE);
        climber.add(mesh);
        view.force = true;
    }).catch(err => console.warn('Kunde inte ladda klättraren', err));

    // Pannlampa som lyser upp väggen och följer med nedåt
    const headlamp = new THREE.SpotLight('#ffe8c2', 26, 9, 0.5, 0.7, 1.4);
    headlamp.position.set(0.1, 1.55, 0.15);
    headlamp.target.position.set(WALL_X, 0.6, 0);
    climber.add(headlamp, headlamp.target);

    // Karbinen i selen som klickar när du stämplar in
    const biner = buildCarabiner(env);
    biner.group.scale.setScalar(0.85);
    biner.group.position.set(0.02, -0.05, 0.3);
    biner.group.rotation.set(0.2, -0.4, 0.15);
    climber.add(biner.group);

    // ---------- Effekter: gnistor och en ring som expanderar ----------
    const sparks = makeSparks(dot, 120);
    scene.add(sparks.points);
    const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.3, 0.36, 48),
        new THREE.MeshBasicMaterial({
            color: COLORS.emerald, transparent: true, opacity: 0, side: THREE.DoubleSide,
            toneMapped: false, depthWrite: false, blending: THREE.AdditiveBlending,
        })
    );
    scene.add(ring);
    let ringT = -1;

    // ---------- Klättringens tillstånd ----------
    const climb = { y: 0, step: 0, hop: null, ascend: null };
    const stepsNow = () => (state.active
        ? Math.max(0, Math.floor((Date.now() - state.startMs) / 60000 / STEP_MINUTES))
        : 0);
    const startHop = (to, amp, dur) => { climb.hop = { from: climb.y, to, amp, dur, t: 0 }; };

    function updateClimb(dt, t) {
        let swing = 0;
        if (climb.ascend) {
            const a = climb.ascend;
            a.t += dt;
            const p = Math.min(1, Math.max(0, a.t / a.dur));
            climb.y = a.from * (1 - easeInOutCubic(p));
            swing = Math.sin(p * Math.PI) * 0.35;
            if (p >= 1) climb.ascend = null;
        } else if (climb.hop) {
            const h = climb.hop;
            h.t += dt;
            const p = Math.min(1, h.t / h.dur);
            climb.y = h.from + (h.to - h.from) * easeInOutCubic(p);
            swing = Math.sin(p * Math.PI) * h.amp;
            if (p >= 1) climb.hop = null;
        } else if (state.active) {
            const n = stepsNow();
            if (n !== climb.step) {
                if (state.reduced || Math.abs(n - climb.step) > 2) climb.y = stepY(n);
                else {
                    startHop(stepY(n), 0.35, 1.1);
                    busyUntil = performance.now() + 1500;
                }
                climb.step = n;
            }
        }

        // Avspark: kroppen svänger ut från väggen och repet följer med som en pendel
        const sway = state.reduced ? 0 : Math.sin(t * 0.7) * 0.03;
        const x = -swing + sway;
        climber.position.set(x, climb.y + (state.reduced ? 0 : Math.sin(t * 1.3) * 0.015), 0);
        climber.rotation.z = -swing * 0.18 + (state.reduced ? 0 : Math.sin(t * 0.9) * 0.02);
        const ropeLen = Math.max(1, ANCHOR_Y - climb.y);
        ropes.rotation.z = Math.asin(THREE.MathUtils.clamp(x / ropeLen, -0.5, 0.5));
    }

    // ---------- Kameran följer klättraren ----------
    const camPos = new THREE.Vector3();
    const camLook = new THREE.Vector3();
    const goalPos = new THREE.Vector3();
    const goalLook = new THREE.Vector3();
    let firstFrame = true;

    function frameCamera(dt) {
        const aspect = view.width / Math.max(1, view.height);
        const narrow = THREE.MathUtils.clamp((1.3 - aspect) / 0.6, 0, 1);
        const lift = (1 - state.mode) * 0.6; // i vila syns takkanten ovanför
        goalPos.set(-2.4 - narrow * 0.7, climb.y + 0.75 + lift, 8.4 + narrow * 2.6);
        goalLook.set(0.45, climb.y - 0.8 + lift, 0);
        goalPos.x += (state.pointer.x + state.gyro.x) * 0.5;
        goalPos.y += (state.pointer.y + state.gyro.y) * 0.3;
        const k = firstFrame || state.reduced ? 1 : damp(dt, 3);
        camPos.lerp(goalPos, k);
        camLook.lerp(goalLook, k);
        firstFrame = false;
        camera.position.copy(camPos);
        camera.lookAt(camLook);
    }

    view.resize = (w, h) => {
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
    };
    view.measure();

    view.frame = (dt, t) => {
        rim.color.lerpColors(COLORS.amber, COLORS.emerald, state.mode);
        updateClimb(dt, t);
        frameCamera(dt);
        sparks.update(dt);
        if (ringT >= 0) {
            ringT += dt;
            const p = Math.min(1, ringT / 0.8);
            ring.scale.setScalar(1 + p * 7);
            ring.material.opacity = (1 - p) * 0.9;
            ring.quaternion.copy(camera.quaternion);
            if (p >= 1) ringT = -1;
        }
        renderer.render(scene, camera);
    };

    const harnessWorld = () => climber.localToWorld(new THREE.Vector3(0, 0.1, 0.3));

    return {
        tick: view.tick,
        // Sidan laddades med ett pågående pass: ställ klättraren direkt på rätt höjd.
        syncInitial() {
            climb.step = stepsNow();
            climb.y = stepY(climb.step);
        },
        clockIn() {
            busyUntil = performance.now() + 2600;
            climb.ascend = null;
            climb.step = stepsNow();
            startHop(stepY(climb.step), 0.6, 1.6);
            ring.position.copy(harnessWorld());
            ring.material.color.copy(COLORS.emerald);
            ringT = 0;
            sparks.burst(harnessWorld(), COLORS.emeraldLight, 40, 2.6);
            // Karbinen i selen klickar igen
            biner.gate.rotation.z = biner.openAngle;
            const start = performance.now();
            const close = () => {
                const p = Math.min(1, (performance.now() - start) / 260);
                biner.gate.rotation.z = biner.openAngle + (biner.closedAngle - biner.openAngle) * (p * p);
                if (p < 1) requestAnimationFrame(close);
            };
            requestAnimationFrame(close);
        },
        clockOut() {
            busyUntil = performance.now() + 3600;
            climb.hop = null;
            climb.ascend = { from: climb.y, t: -0.7, dur: 1.9 };
            climb.step = 0;
            sparks.burst(harnessWorld(), COLORS.amberLight, 110, 4);
            ring.position.copy(harnessWorld());
            ring.material.color.copy(COLORS.amber);
            ringT = 0;
            climberMat.emissiveIntensity = 1.2;
            const start = performance.now();
            const fade = () => {
                const p = Math.min(1, (performance.now() - start) / 900);
                climberMat.emissiveIntensity = 1.2 * (1 - p);
                if (p < 1) requestAnimationFrame(fade);
            };
            requestAnimationFrame(fade);
        },
    };
}

// Fasad med fönster, våningsband och några tända fönster. En våning = en timme.
function buildFacade() {
    const TILE_W = 6, TILE_H = 12;  // texturen täcker 2 fönster × 4 våningar
    const W = 26, BOTTOM = -72;      // botten på en jämn våningsgräns så att banden hamnar på timmarna
    const H = ROOF_Y - BOTTOM;
    const lit = [];

    const map = canvasTexture(256, 512, (ctx, w, h) => {
        ctx.fillStyle = '#1c1c22';
        ctx.fillRect(0, 0, w, h);
        for (let i = 0; i < 2200; i++) {
            ctx.fillStyle = `rgba(255,255,255,${Math.random() * 0.035})`;
            ctx.fillRect(Math.random() * w, Math.random() * h, 2, 2);
        }
        for (let f = 0; f < 4; f++) {
            const y0 = f * 128;
            ctx.fillStyle = '#2d2d35';
            ctx.fillRect(0, y0 + 116, w, 12);
            for (let k = 0; k < 2; k++) {
                const x = 22 + k * 128, y = y0 + 22, ww = 84, wh = 82;
                ctx.fillStyle = '#0b0e14';
                ctx.fillRect(x, y, ww, wh);
                const g = ctx.createLinearGradient(x, y, x + ww, y + wh);
                g.addColorStop(0, 'rgba(130,150,190,0.22)');
                g.addColorStop(0.5, 'rgba(130,150,190,0)');
                ctx.fillStyle = g;
                ctx.fillRect(x, y, ww, wh);
                ctx.strokeStyle = '#3c3c46';
                ctx.lineWidth = 4;
                ctx.strokeRect(x, y, ww, wh);
                ctx.beginPath();
                ctx.moveTo(x + ww / 2, y);
                ctx.lineTo(x + ww / 2, y + wh);
                ctx.stroke();
                lit.push({ x, y, ww, wh, on: Math.random() < 0.3 });
            }
        }
    });
    const emissiveMap = canvasTexture(256, 512, (ctx, w, h) => {
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, w, h);
        lit.filter(l => l.on).forEach(({ x, y, ww, wh }) => {
            const g = ctx.createLinearGradient(x, y, x, y + wh);
            g.addColorStop(0, '#ffcf87');
            g.addColorStop(1, '#a8621c');
            ctx.fillStyle = g;
            ctx.fillRect(x + 3, y + 3, ww - 6, wh - 6);
        });
    });
    [map, emissiveMap].forEach(t => {
        t.wrapS = t.wrapT = THREE.RepeatWrapping;
        t.repeat.set(W / TILE_W, H / TILE_H);
    });

    const wall = new THREE.Mesh(
        new THREE.PlaneGeometry(W, H),
        new THREE.MeshStandardMaterial({ map, emissiveMap, emissive: '#ffffff', emissiveIntensity: 0.9, roughness: 0.92, metalness: 0.05 })
    );
    wall.rotation.y = -Math.PI / 2; // vänd mot klättraren (−x)
    wall.position.set(WALL_X, BOTTOM + H / 2, -W / 2 + 6);
    return wall;
}

function makeSparks(dot, count) {
    const positions = new Float32Array(count * 3).fill(-9999);
    const velocity = new Float32Array(count * 3);
    const life = new Float32Array(count);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const material = new THREE.PointsMaterial({
        map: dot, size: 0.16, color: '#ffd27a', transparent: true, depthWrite: false,
        blending: THREE.AdditiveBlending, toneMapped: false,
    });
    const points = new THREE.Points(geometry, material);
    points.frustumCulled = false;
    let next = 0;
    let alive = 0;

    return {
        points,
        burst(origin, color, n, speed) {
            material.color.copy(color);
            for (let i = 0; i < n; i++) {
                const j = next * 3;
                positions[j] = origin.x;
                positions[j + 1] = origin.y;
                positions[j + 2] = origin.z;
                const a = Math.random() * Math.PI * 2;
                const up = 0.3 + Math.random() * 0.9;
                const s = speed * (0.35 + Math.random() * 0.65);
                velocity[j] = Math.cos(a) * s * 0.8 - 0.6;  // bort från väggen
                velocity[j + 1] = up * s;
                velocity[j + 2] = Math.sin(a) * s * 0.8;
                life[next] = 0.9 + Math.random() * 0.8;
                next = (next + 1) % count;
            }
            alive = 2;
        },
        update(dt) {
            if (alive <= 0) return;
            alive -= dt;
            for (let i = 0; i < count; i++) {
                if (life[i] <= 0) continue;
                const j = i * 3;
                life[i] -= dt;
                velocity[j + 1] -= 6 * dt;
                positions[j] += velocity[j] * dt;
                positions[j + 1] += velocity[j + 1] * dt;
                positions[j + 2] += velocity[j + 2] * dt;
                if (life[i] <= 0) positions[j + 1] = -9999;
            }
            geometry.attributes.position.needsUpdate = true;
        },
    };
}
