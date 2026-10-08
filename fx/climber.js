// Klättrarna på riggen – riggade som i verkligheten (IRATA/SPRAT-repaccess):
//   • två rep från två separata förankringar: arbetsrep (orange) och säkerhetsrep (vitt), med kantskydd
//   • nedfirare på arbetsrepet, kopplad till selens bukinfästning med en skruvlåst karbin
//   • säkerhetsenhet på säkerhetsrepet med falldämpare till bukinfästningen
//   • två kortlinor: den ena sitter i förankringen medan han riggar, sedan på materialöglan
//   • bromshanden håller repet under nedfiraren, andra handen på handtaget
// Repen ritas alltid genom enheternas mitt och händerna greppar exakt på repen – inget klipper igenom.
import * as THREE from 'three';
import { ropeTexture } from './common.js';
import { buildCarabiner, buildDescender, buildBackupDevice, DESCENDER, BACKUP } from './models.js';
import { createFigure, bakeFigure } from './figure.js';
import { DECK_Y, HULL_FRONT, INTRO_X } from './rig.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const UP = V(0, 1, 0);
const smooth = t => t * t * (3 - 2 * t);
const ROPE_R = 0.009;
const BOTTOM_Y = 0.25; // där repen försvinner ned i havet

// ---------- Tidsspår för koreografin ----------
function num(keys) {
    return t => {
        if (t <= keys[0][0]) return keys[0][1];
        for (let i = 1; i < keys.length; i++) {
            const [t1, v1, mode] = keys[i];
            if (t <= t1) {
                const [t0, v0] = keys[i - 1];
                const u = (t - t0) / Math.max(1e-6, t1 - t0);
                return v0 + (v1 - v0) * (mode === 'lin' ? u : smooth(u));
            }
        }
        return keys[keys.length - 1][1];
    };
}
function vec(keys) {
    return (t, out) => {
        if (t <= keys[0][0]) return out.copy(keys[0][1]);
        for (let i = 1; i < keys.length; i++) {
            const [t1, v1, mode] = keys[i];
            if (t <= t1) {
                const [t0, v0] = keys[i - 1];
                const u = (t - t0) / Math.max(1e-6, t1 - t0);
                return out.lerpVectors(v0, v1, mode === 'lin' ? u : smooth(u));
            }
        }
        return out.copy(keys[keys.length - 1][1]);
    };
}
// Fotsteg: [start, slut, mål {pos, normal, toe}, kontrollpunkt för bågen (valfri)]
function steps(initial, list) {
    const bez = (a, c, b, u, out) => out.copy(a).multiplyScalar((1 - u) * (1 - u))
        .addScaledVector(c, 2 * u * (1 - u)).addScaledVector(b, u * u);
    const ctrl = V();
    return (t, out) => {
        let from = initial;
        for (const [t0, t1, to, control] of list) {
            if (t < t0) break;
            if (t <= t1) {
                const u = smooth((t - t0) / (t1 - t0));
                if (control) ctrl.copy(control);
                else ctrl.lerpVectors(from.pos, to.pos, 0.5).addScaledVector(to.normal, 0.12);
                bez(from.pos, ctrl, to.pos, u, out.pos);
                out.normal.lerpVectors(from.normal, to.normal, u).normalize();
                out.toe.lerpVectors(from.toe, to.toe, u).normalize();
                return out;
            }
            from = to;
        }
        out.pos.copy(from.pos);
        out.normal.copy(from.normal);
        out.toe.copy(from.toe);
        return out;
    };
}
// Handspår: [start, slut, mål] – handen glider från föregående mål till nästa
function handTrack(list) {
    return t => {
        let prev = list[0][2];
        for (const [t0, t1, spec] of list) {
            if (t < t0) return { a: prev, b: prev, u: 0 };
            if (t <= t1) return { a: prev, b: spec, u: smooth((t - t0) / (t1 - t0)) };
            prev = spec;
        }
        return { a: prev, b: prev, u: 0 };
    };
}

// ---------- Rep som raka bitar längs en bana ----------
function ropeLine(scene, base, stripe, radius = ROPE_R, count = 8) {
    const tex = ropeTexture(base, stripe);
    const meshes = [];
    for (let i = 0; i < count; i++) {
        const map = tex.clone();
        map.needsUpdate = true;
        const m = new THREE.Mesh(
            new THREE.CylinderGeometry(radius, radius, 1, 8, 1, true),
            new THREE.MeshStandardMaterial({ map, roughness: 0.8 })
        );
        m.visible = false;
        scene.add(m);
        meshes.push(m);
    }
    const d = V();
    return {
        draw(points) {
            meshes.forEach((m, i) => {
                const a = points[i], b = points[i + 1];
                if (!a || !b) { m.visible = false; return; }
                d.subVectors(b, a);
                const len = d.length();
                m.visible = len > 1e-3;
                if (!m.visible) return;
                m.position.addVectors(a, b).multiplyScalar(0.5);
                m.quaternion.setFromUnitVectors(UP, d.normalize());
                m.scale.set(1, len, 1);
                m.material.map.repeat.set(1, len / (radius * 14));
            });
        },
    };
}

// Vrid ett objekt så att lokala +Y pekar längs y och +Z så nära zHint som möjligt
const _m = new THREE.Matrix4(), _x = V(), _y = V(), _z = V();
function basisQuat(y, zHint, out) {
    _y.copy(y).normalize();
    _z.copy(zHint).addScaledVector(_y, -zHint.dot(_y));
    if (_z.lengthSq() < 1e-8) _z.set(1, 0, 0).cross(_y);
    _z.normalize();
    _x.crossVectors(_y, _z);
    return out.setFromRotationMatrix(_m.makeBasis(_x, _y, _z));
}

// Närmaste punkt på sträckan a–b
const _ab = V(), _ap = V();
function projectOnSegment(p, a, b, out) {
    _ab.subVectors(b, a);
    const t = THREE.MathUtils.clamp(_ap.subVectors(p, a).dot(_ab) / _ab.lengthSq(), 0, 1);
    return out.copy(a).addScaledVector(_ab, t);
}

// Repet viker sig över kanten bara om en rak linje från förankringen skulle gå under däcket
function wrapsEdge(anchor, p) {
    if (p.z <= HULL_FRONT) return false;
    const yAtEdge = anchor.y + (p.y - anchor.y) * ((HULL_FRONT - anchor.z) / (p.z - anchor.z));
    return yAtEdge < DECK_Y + 0.06;
}

// ---------- Placering av utrustningen på selen ----------
// Räknar ut nedfirare, huvudkarbin, säkerhetsenhet och kortlinor utifrån bukinfästningen M.
const _q = new THREE.Quaternion();
function placeGear(fig, gear, { uW, vB, pullB }, out) {
    const { axes } = fig;
    fig.maillon.getWorldPosition(out.M);
    const M = out.M;
    // Nedfiraren: Y längs repet, Z mot kroppen (så att handtaget hamnar på vänster sida)
    basisQuat(uW, _z.copy(axes.flatFwd).negate(), out.qDev);
    out.H.copy(M).addScaledVector(uW, 0.085);
    out.C.copy(DESCENDER.hole).negate().applyQuaternion(out.qDev).add(out.H);
    out.top.copy(DESCENDER.top).applyQuaternion(out.qDev).add(out.C);
    out.exit.copy(DESCENDER.exit).applyQuaternion(out.qDev).add(out.C);
    gear.descender.group.position.copy(out.C);
    gear.descender.group.quaternion.copy(out.qDev);
    gear.descender.group.updateMatrixWorld(true);
    // Huvudkarbinen mellan maillonen och nedfirarens fästhål
    out.devZ.set(0, 0, 1).applyQuaternion(out.qDev);
    gear.main.group.position.addVectors(M, out.H).multiplyScalar(0.5);
    basisQuat(uW, _x.crossVectors(out.devZ, uW), gear.main.group.quaternion);
    // Säkerhetsenheten: på repet en falldämparlängd från M (eller hängande vid höften före)
    out.rest.copy(M).addScaledVector(axes.right, -0.13).addScaledVector(axes.up, -0.12).addScaledVector(axes.fwd, 0.08);
    out.on.copy(M).addScaledVector(vB, 0.3);
    out.CB.lerpVectors(out.rest, out.on, pullB);
    _y.copy(axes.up).lerp(vB, pullB).normalize();
    basisQuat(_y, axes.flatFwd, out.qB);
    out.topB.copy(BACKUP.top).applyQuaternion(out.qB).add(out.CB);
    out.bottomB.copy(BACKUP.bottom).applyQuaternion(out.qB).add(out.CB);
    out.attachB.copy(BACKUP.attach).applyQuaternion(out.qB).add(out.CB);
    gear.backup.group.position.copy(out.CB);
    gear.backup.group.quaternion.copy(out.qB);
    return out;
}
const gearState = () => ({
    M: V(), H: V(), C: V(), top: V(), exit: V(), devZ: V(), qDev: new THREE.Quaternion(),
    rest: V(), on: V(), CB: V(), topB: V(), bottomB: V(), attachB: V(), qB: new THREE.Quaternion(),
});

// Utrustning som följer med klättraren
function buildGear(env) {
    const descender = buildDescender(env);
    const main = buildCarabiner(env);
    const backup = buildBackupDevice(env);
    const cowEnds = [buildCarabiner(env, { color: '#c4c9d0' }), buildCarabiner(env, { color: '#c4c9d0' })];
    return { descender, main, backup, cowEnds };
}

// Falldämpare och kortlinor: korta bitar mellan punkter
function strapLine(scene, color, radius, count) {
    const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.7 });
    const meshes = [];
    for (let i = 0; i < count; i++) {
        const m = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, 1, 8, 1, false), mat);
        scene.add(m);
        meshes.push(m);
    }
    const d = V();
    return {
        meshes,
        draw(points) {
            meshes.forEach((m, i) => {
                const a = points[i], b = points[i + 1];
                if (!a || !b) { m.visible = false; return; }
                d.subVectors(b, a);
                const len = d.length();
                m.visible = len > 1e-3;
                m.position.addVectors(a, b).multiplyScalar(0.5);
                m.quaternion.setFromUnitVectors(UP, d.normalize());
                m.scale.set(1, len, 1);
            });
        },
    };
}

// =====================================================================
// Introts klättrare
// =====================================================================
export function createIntroClimber(scene, env, dot) {
    const X = INTRO_X, D = DECK_Y, F = HULL_FRONT;
    const P = (x, y, z) => V(X + x, D + y, F + z);

    const fig = createFigure(env);
    scene.add(fig.root);
    const gear = buildGear(env);
    scene.add(gear.descender.group, gear.main.group, gear.backup.group, ...gear.cowEnds.map(c => c.group));

    // Pannlampa
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
        map: dot, color: '#fff1d6', transparent: true, opacity: 0.9, depthWrite: false,
        blending: THREE.AdditiveBlending, toneMapped: false,
    }));
    glow.scale.setScalar(0.4);
    fig.lampPoint.add(glow);
    const headlamp = new THREE.SpotLight('#ffe8c2', 8, 9, 0.45, 0.6, 2);
    const lampTarget = new THREE.Object3D();
    lampTarget.position.set(0, -0.6, 2);
    fig.lampPoint.add(headlamp, lampTarget);
    headlamp.target = lampTarget;

    // ---------- Förankringar på däck: stolpar med ögla, åttaknut och karbin ----------
    const steel = new THREE.MeshStandardMaterial({ color: '#9aa0a8', metalness: 0.8, roughness: 0.35, envMap: env });
    const anchors = [1, -1].map(s => {
        const base = P(0.5 * s, 0, -1.15);
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 1.05, 12), steel);
        post.position.copy(base).add(V(0, 0.525, 0));
        const plate = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.012, 0.16), steel);
        plate.position.copy(base).add(V(0, 0.006, 0));
        const eye = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.008, 8, 16), steel);
        eye.position.copy(base).add(V(0, 1.08, 0));
        scene.add(post, plate, eye);
        const eyeP = eye.position.clone();
        // Åttaknuten på repets ände och karbinen som håller den i öglan
        const knot = eyeP.clone().add(V(0, -0.02, 0.09));
        const cb = buildCarabiner(env, { color: '#c4c9d0' });
        cb.group.position.lerpVectors(eyeP, knot, 0.5);
        basisQuat(V().subVectors(eyeP, knot), V(1, 0, 0), cb.group.quaternion);
        scene.add(cb.group);
        const knotMat = new THREE.MeshStandardMaterial({ color: s > 0 ? '#f59e0b' : '#e4e4e7', roughness: 0.8 });
        [0, 1].forEach(k => {
            const loop = new THREE.Mesh(new THREE.TorusGeometry(0.018, 0.009, 6, 12), knotMat);
            loop.position.copy(knot).add(V(0, -0.01 - k * 0.022, 0.012 + k * 0.012));
            loop.rotation.set(0.6, k * 0.8, 0);
            scene.add(loop);
        });
        return { eye: eyeP, rope: knot.clone().add(V(0, -0.05, 0.03)) };
    });
    const A1 = anchors[0].rope, A2 = anchors[1].rope;     // arbetsrep till höger, säkerhetsrep till vänster
    const E1 = P(0.35, 0.05, 0.05), E2 = P(-0.35, 0.05, 0.05); // där repen går över kanten
    const cowClip = anchors[1].eye.clone().add(V(0.045, -0.01, 0));

    const ropeW = ropeLine(scene, '#f59e0b', '#7c2d12');
    const ropeB = ropeLine(scene, '#e4e4e7', '#1d4ed8');
    // Kantskydd (kanvas) där repen går över kanten
    const protectorMat = new THREE.MeshStandardMaterial({ color: '#b91c1c', roughness: 0.9 });
    const protectors = [0, 1, 2, 3].map(() => {
        const m = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.17, 10), protectorMat);
        scene.add(m);
        return m;
    });
    const absorber = strapLine(scene, '#dc2626', 0.007, 1);
    const cowW = strapLine(scene, '#1f2937', 0.0055, 2);
    const cowS = strapLine(scene, '#1f2937', 0.0055, 2);

    // ---------- Koreografi (sekunder) ----------
    const DECK = { normal: UP, toe: V(0, 0, -1) };
    const WALL = { normal: V(0, 0, 1), toe: UP };
    const foot = (x, y, z, s) => ({ pos: P(x, y, z), normal: s.normal, toe: s.toe });
    const HANG = P(0, -2.35, 0.75);
    const C = {
        pelvis: vec([
            [0, P(0, 1, -0.62)], [1.0, P(0, 1, -0.62)], [1.3, P(-0.04, 0.9, -0.6)], [1.62, P(0, 0.99, -0.62)],
            [1.8, P(0, 1, -0.62)], [2.05, P(0.04, 0.9, -0.6)], [2.4, P(0, 1, -0.62)], [3.6, P(0, 1, -0.62)],
            [3.85, P(-0.03, 0.96, -0.7)], [4.15, P(0, 1, -0.62)], [4.2, P(0, 1, -0.62)], [4.75, P(0, 1, -0.3)],
            [4.85, P(0, 1, -0.3)], [5.3, P(0, 0.62, 0.22)], [5.65, P(0, 0.28, 0.55)], [5.9, P(0, 0.28, 0.55)],
            [6.9, HANG, 'lin'],
        ]),
        pitch: num([[4.85, 0], [5.3, -0.55], [5.65, -0.35], [6.9, -0.12]]),
        spine: num([[0, 0.05], [1.0, 0.05], [1.3, 0.35], [1.62, 0.12], [1.8, 0.1], [2.05, 0.35], [2.4, 0.12],
            [2.6, 0.2], [3.2, 0.2], [3.6, 0.12], [3.85, 0.4], [4.15, 0.1], [4.85, 0.1], [5.3, 0.3], [5.65, 0.2], [6.9, 0.12]]),
        chest: num([[0, 0.02], [1.3, 0.2], [1.62, 0.05], [2.05, 0.2], [2.4, 0.05], [2.6, 0.12], [3.2, 0.12],
            [3.6, 0.05], [3.85, 0.2], [4.15, 0.04], [5.3, 0.15], [6.9, 0.08]]),
        neckX: num([[0, 0.1], [0.6, 0.35], [1.0, 0.35], [1.3, 0.45], [1.8, 0.4], [2.05, 0.45], [2.4, 0.45],
            [2.6, 0.65], [3.2, 0.65], [3.6, 0.3], [3.85, 0.35], [4.2, 0.2], [4.85, 0.2], [5.3, 0.25], [5.9, 0.35], [6.9, -0.1]]),
        neckY: num([[0, 0], [0.3, 0.6], [0.7, 0.6], [1.0, 0.35], [1.62, 0.35], [1.8, -0.35], [2.4, -0.35], [2.6, 0],
            [3.6, 0], [3.85, 0.45], [4.15, 0.3], [4.4, 0], [5.3, 0], [5.6, -0.35], [6.0, -0.35], [6.9, 0]]),
        kneeUp: num([[5.3, 0], [5.65, 1.3], [6.9, 2]]),
        pullB: num([[1.3, 0], [1.6, 1]]),
        pullW: num([[2.05, 0], [2.4, 1]]),
        plate: num([[2.36, 1], [2.46, 0]]),
        lock: num([[2.65, 0], [3.1, 1]]),
        cow: num([[3.8, 0], [4.12, 1]]),
        footL: steps(foot(-0.13, 0, -0.6, DECK), [
            [4.45, 4.7, foot(-0.13, 0, -0.28, DECK)],
            [4.95, 5.1, foot(-0.13, 0, -0.14, DECK)],
            [5.55, 5.9, foot(-0.13, -0.4, 0, WALL), P(-0.13, 0.18, 0.28)],
            [6.15, 6.4, foot(-0.13, -1.5, 0, WALL)],
            [6.55, 6.8, foot(-0.13, -2.55, 0, WALL)],
        ]),
        footR: steps(foot(0.13, 0, -0.6, DECK), [
            [4.2, 4.45, foot(0.13, 0, -0.28, DECK)],
            [4.85, 5.0, foot(0.13, 0, -0.14, DECK)],
            [5.3, 5.65, foot(0.13, -0.38, 0, WALL), P(0.13, 0.22, 0.28)],
            [5.95, 6.2, foot(0.13, -0.95, 0, WALL)],
            [6.35, 6.6, foot(0.13, -2.0, 0, WALL)],
            [6.75, 6.95, foot(0.13, -2.42, 0, WALL)],
        ]),
        handL: handTrack([[0, 0, 'free'], [1.0, 1.3, 'ropeB'], [3.6, 3.82, 'cow'], [4.15, 4.4, 'handle']]),
        handR: handTrack([[0, 0, 'free'], [1.75, 2.05, 'ropeW'], [2.45, 2.65, 'sleeve'], [3.15, 3.45, 'brake']]),
    };
    const END = 7.0;

    // ---------- Beräkning per bildruta ----------
    const pelvis = V(), pole = V();
    const fL = { pos: V(), normal: V(), toe: V() }, fR = { pos: V(), normal: V(), toe: V() };
    const g = gearState();
    const uW = V(), vB = V(), uRest = V(), tmp = V(), tmp2 = V();
    const brake = V(), deckW = V(), deckB = V(), q = V(), slack = V();
    const cowEnd = V(), cowMid = V(), loopW = V(), sideW = V(), loopR = V(), sideR = V();
    const ptsW = [], ptsB = [];
    const poolW = Array.from({ length: 12 }, () => V()), poolB = Array.from({ length: 12 }, () => V());
    const bottomW = V(), bottomB = V();
    const gripA = V(), gripB = V(), upA = V(), upB = V(), relax = V(), inward = V(), target = V();

    const api = { fig, gear, END, clock: END, anchors, A1, A2, E1, E2 };

    // Bana genom enheterna: drar repet från "slak" (rakt förankring → kant) till verklig bana med `pull`
    function blendPath(anchor, edge, real, pull, out, pool) {
        out.length = 0;
        real.forEach((p, i) => {
            const v = pool[i];
            if (p === anchor || p === edge || p.y <= BOTTOM_Y + 1e-3) v.copy(p);
            else v.lerpVectors(projectOnSegment(p, anchor, edge, slack), p, pull);
            out.push(v);
        });
        return out;
    }

    function handTarget(spec, side, out, up) {
        switch (spec) {
            case 'ropeB': // säkerhetsrepet strax ovanför säkerhetsenheten
                out.copy(g.topB).addScaledVector(vB, 0.08);
                up.copy(vB);
                if (sample.pullB < 1) out.lerpVectors(projectOnSegment(out, A2, E2, slack), out, sample.pullB);
                return out;
            case 'ropeW': // arbetsrepet strax ovanför nedfiraren
                out.copy(g.top).addScaledVector(uW, 0.06);
                up.copy(uW);
                if (sample.pullW < 1) out.lerpVectors(projectOnSegment(out, A1, E1, slack), out, sample.pullW);
                return out;
            case 'sleeve': // vrider skruvlåset på huvudkarbinen
                gear.main.sleeve.getWorldPosition(out);
                tmp2.set(0, 0, 1).applyQuaternion(gear.main.group.quaternion);
                out.addScaledVector(tmp2, 0.045);
                up.set(0, 1, 0).applyQuaternion(gear.main.group.quaternion);
                return out;
            case 'brake': // bromshanden på repet under nedfiraren
                out.copy(brake);
                up.subVectors(g.exit, brake).normalize();
                return out;
            case 'handle':
                gear.descender.handlePoint.getWorldPosition(out);
                up.copy(uW);
                return out;
            case 'cow':
                out.copy(cowEnd);
                up.subVectors(cowMid, cowEnd).normalize();
                return out;
            default:
                return null;
        }
    }

    const sample = {};
    api.update = (realT, reduced) => {
        const t = api.clock;
        const after = t >= END;
        // Kropp
        C.pelvis(t, pelvis);
        if (after && !reduced) pelvis.x += Math.sin(realT * 0.6) * 0.02;
        fig.setBody({
            pos: pelvis, yaw: Math.PI, pitch: C.pitch(t),
            spineBend: C.spine(t), chestBend: C.chest(t) + (reduced ? 0 : Math.sin(realT * 1.7) * 0.01),
            neckX: C.neckX(t), neckY: C.neckY(t),
        });
        const { axes } = fig;
        // Ben: fötterna på däcket eller väggen, knäna framåt/uppåt
        pole.copy(axes.flatFwd).addScaledVector(UP, C.kneeUp(t)).normalize();
        C.footL(t, fL);
        C.footR(t, fR);
        fig.solveLeg('L', fL.pos, fL.normal, fL.toe, pole);
        fig.solveLeg('R', fR.pos, fR.normal, fR.toe, pole);

        // Utrustningen
        sample.pullW = C.pullW(t);
        sample.pullB = C.pullB(t);
        fig.maillon.getWorldPosition(g.M);
        uRest.copy(axes.fwd).multiplyScalar(0.85).addScaledVector(axes.up, -0.5).normalize();
        const upW = wrapsEdge(A1, g.M) ? E1 : A1;
        uW.subVectors(upW, g.M).normalize().lerp(uRest, 1 - sample.pullW).normalize();
        const upBpt = wrapsEdge(A2, g.M) ? E2 : A2;
        vB.subVectors(upBpt, g.M).normalize();
        placeGear(fig, gear, { uW, vB, pullB: sample.pullB }, g);
        gear.descender.setOpen(C.plate(t));
        gear.main.setLock(C.lock(t));

        // Bromshanden vid höger höft, utanför låret
        brake.copy(g.M).addScaledVector(axes.right, 0.24).addScaledVector(axes.up, -0.02).addScaledVector(axes.fwd, 0.06);

        // Arbetsrepet: förankring → (kant) → nedfirare → bromshand → (däck → kant) → ned
        const real = [A1];
        if (wrapsEdge(A1, g.top)) real.push(E1);
        real.push(g.top, g.exit, brake);
        if (brake.z < F + 0.02) {
            deckW.set(brake.x, D + 0.012, Math.min(brake.z, F - 0.05));
            real.push(deckW, E1, bottomW.set(E1.x, BOTTOM_Y, E1.z));
        } else {
            real.push(bottomW.set(brake.x, BOTTOM_Y, brake.z));
        }
        ropeW.draw(blendPath(A1, E1, real, sample.pullW, ptsW, poolW));

        // Säkerhetsrepet: förankring → (kant) → säkerhetsenhet → utanför vänster lår → ned
        const realB = [A2];
        if (wrapsEdge(A2, g.topB)) realB.push(E2);
        realB.push(g.topB, g.bottomB);
        q.copy(g.bottomB).addScaledVector(axes.right, -0.2).addScaledVector(axes.up, -0.12);
        if (q.z < F + 0.02) {
            deckB.set(g.M.x - axes.right.x * 0.3, D + 0.012, Math.min(q.z, F - 0.05));
            realB.push(q, deckB, E2, bottomB.set(E2.x, BOTTOM_Y, E2.z));
        } else {
            realB.push(q, bottomB.set(q.x, BOTTOM_Y, q.z));
        }
        ropeB.draw(blendPath(A2, E2, realB, sample.pullB, ptsB, poolB));

        // Kantskydd längs repens båda sidor om kanten
        [[ptsW, E1], [ptsB, E2]].forEach(([pts, E], k) => {
            const i = pts.findIndex(p => p.distanceTo(E) < 1e-4);
            [-1, 1].forEach((dir, j) => {
                const m = protectors[k * 2 + j];
                const n = pts[i + dir];
                m.visible = i >= 0 && !!n;
                if (!m.visible) return;
                tmp.subVectors(n, E).normalize();
                m.position.copy(E).addScaledVector(tmp, 0.085);
                m.quaternion.setFromUnitVectors(UP, tmp);
            });
        });

        // Falldämparen från bukinfästningen till säkerhetsenheten
        absorber.draw([g.M, g.attachB]);

        // Kortlinor: den ena från förankringen till materialöglan, den andra alltid på öglan
        const cow = C.cow(t);
        fig.gearLoop.L.getWorldPosition(loopW);
        fig.hipSide.L.getWorldPosition(sideW);
        cowEnd.lerpVectors(cowClip, loopW, cow);
        cowMid.lerpVectors(tmp.addVectors(g.M, cowEnd).multiplyScalar(0.5).addScaledVector(UP, -0.08), sideW, cow);
        cowW.draw([g.M, cowMid, cowEnd]);
        gear.cowEnds[0].group.position.copy(cowEnd);
        basisQuat(tmp.subVectors(cowMid, cowEnd), axes.right, gear.cowEnds[0].group.quaternion);
        fig.gearLoop.R.getWorldPosition(loopR);
        fig.hipSide.R.getWorldPosition(sideR);
        cowS.draw([g.M, sideR, loopR]);
        gear.cowEnds[1].group.position.copy(loopR);
        basisQuat(tmp.subVectors(sideR, loopR), axes.right, gear.cowEnds[1].group.quaternion);

        // Händer
        [['L', C.handL(t)], ['R', C.handR(t)]].forEach(([side, h]) => {
            const free = fig.relaxedGrip(side, relax);
            const ta = handTarget(h.a, side, gripA, upA);
            const tb = handTarget(h.b, side, gripB, upB);
            target.lerpVectors(ta ?? free, tb ?? free, h.u);
            // Handens vridning: runt repet om den håller i något, annars avslappnad
            let dir = null;
            if (ta && tb) dir = upA.lerp(upB, h.u).normalize();
            else if (tb && h.u >= 0.5) dir = upB;
            else if (ta && h.u < 0.5) dir = upA;
            fig.solveArm(side, target, dir, fig.armPole(side), fig.inward(side, inward));
        });
    };

    api.setStanding = () => { api.clock = 0; };
    api.setHanging = () => { api.clock = END; };
    return api;
}

// =====================================================================
// Klättrare som hänger runt riggen (förbakade, med samma utrustning och två rep)
// =====================================================================
// spot: { wall: punkt på ytan i bäckenhöjd, normal: ytans normal (vågrät, utåt), drop: rep upp till ankaret }
export function createHangers(scene, env, dot, spots) {
    const fig = createFigure(env, { lod: 0.55 });
    const gear = buildGear(env);
    const STANDOFF = 0.75;
    // Ställ figuren hängande vänd mot +z med väggen framför sig
    fig.setBody({ pos: V(0, 0, 0), yaw: 0, pitch: -0.12, spineBend: 0.12, chestBend: 0.08, neckX: -0.1 });
    const wallN = V(0, 0, -1), toe = UP;
    const pole = V(0, 2, 1).normalize();
    fig.solveLeg('L', V(0.13, -0.2, STANDOFF), wallN, toe, pole);
    fig.solveLeg('R', V(-0.13, -0.07, STANDOFF), wallN, toe, pole);
    const g = gearState();
    const vB = V().copy(UP).addScaledVector(fig.axes.right, -0.35).normalize();
    placeGear(fig, gear, { uW: UP, vB, pullB: 1 }, g);
    gear.descender.setOpen(0);
    const brake = V().copy(g.M).addScaledVector(fig.axes.right, 0.24).addScaledVector(fig.axes.up, -0.02).addScaledVector(fig.axes.fwd, 0.06);
    const handle = gear.descender.handlePoint.getWorldPosition(V());
    fig.solveArm('R', brake, V().subVectors(g.exit, brake).normalize(), fig.armPole('R'));
    fig.solveArm('L', handle, UP, fig.armPole('L'));

    // Utrustningen och linorna bakas in i figuren
    const extra = new THREE.Group();
    [gear.descender.group, gear.main.group, gear.backup.group].forEach(o => extra.add(o));
    const strap = (a, b, r, color) => {
        const d = V().subVectors(b, a);
        const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, d.length(), 6), new THREE.MeshStandardMaterial({ color }));
        m.position.addVectors(a, b).multiplyScalar(0.5);
        m.quaternion.setFromUnitVectors(UP, d.normalize());
        extra.add(m);
    };
    strap(g.M, g.attachB, 0.007, '#dc2626');
    ['L', 'R'].forEach((s, i) => {
        const side = fig.hipSide[s].getWorldPosition(V());
        const loop = fig.gearLoop[s].getWorldPosition(V());
        strap(g.M, side, 0.0055, '#1f2937');
        strap(side, loop, 0.0055, '#1f2937');
        gear.cowEnds[i].group.position.copy(loop);
        basisQuat(V().subVectors(side, loop), fig.axes.right, gear.cowEnds[i].group.quaternion);
        extra.add(gear.cowEnds[i].group);
    });
    // Baka figur och utrustning tillsammans (båda i figurens koordinater, bäckenet i origo)
    const bakeRoot = new THREE.Group();
    bakeRoot.add(fig.root, extra);
    const bodyGeo = bakeFigure(bakeRoot);
    const bodyMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.1 });

    // Repens banor i figurens koordinater (origo = bäckenet)
    const qB = V().copy(g.bottomB).addScaledVector(fig.axes.right, -0.2).addScaledVector(fig.axes.up, -0.12);
    const workTail = [g.top, g.exit, brake, V(brake.x, brake.y - 6, brake.z)];
    const backTail = [g.topB, g.bottomB, qB, V(qB.x, qB.y - 6, qB.z)];
    const orange = new THREE.Color('#f59e0b'), white = new THREE.Color('#e4e4e7');

    const ropeGeo = (pts, color) => pts.slice(0, -1).map((a, i) => {
        const b = pts[i + 1];
        const d = V().subVectors(b, a);
        const geo = new THREE.CylinderGeometry(0.012, 0.012, d.length(), 6, 1, true).toNonIndexed();
        geo.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, d.clone().normalize()));
        geo.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
        const colors = new Float32Array(geo.attributes.position.count * 3);
        for (let k = 0; k < colors.length; k += 3) colors.set([color.r, color.g, color.b], k);
        geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        return geo;
    });
    const lampMat = new THREE.SpriteMaterial({
        map: dot, color: '#fff1d6', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
    });
    const lamp = fig.lampPoint.getWorldPosition(V());

    return spots.map((spot, i) => {
        const yaw = Math.atan2(-spot.normal.x, -spot.normal.z); // vänd mot ytan
        const group = new THREE.Group();
        group.position.copy(spot.wall).addScaledVector(spot.normal, STANDOFF);
        group.rotation.y = yaw;
        group.add(new THREE.Mesh(bodyGeo, bodyMat));
        // Repen upp till ankaret (vid ytan) och ned förbi fötterna
        const topY = spot.drop;
        const upW = [V(g.top.x, topY, STANDOFF - 0.05), V(g.top.x, topY, g.top.z), g.top];
        const upB = [V(g.topB.x, topY, STANDOFF - 0.05), V(g.topB.x, topY, g.topB.z), g.topB];
        const geos = [
            ...ropeGeo([...upW, ...workTail.slice(1)], orange),
            ...ropeGeo([...upB, ...backTail.slice(1)], white),
        ];
        const ropes = new THREE.Mesh(merge(geos), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, emissive: '#3a1a05', emissiveIntensity: 0.4 }));
        group.add(ropes);
        const glow = new THREE.Sprite(lampMat);
        glow.scale.setScalar(0.7);
        glow.position.copy(lamp);
        group.add(glow);
        scene.add(group);
        return { group, phase: i * 1.9 };
    });
}

function merge(geos) {
    // Enkel sammanslagning av oindexerade geometrier med position/normal/uv/color
    const total = geos.reduce((n, g) => n + g.attributes.position.count, 0);
    const out = new THREE.BufferGeometry();
    ['position', 'normal', 'uv', 'color'].forEach(name => {
        const size = geos[0].attributes[name].itemSize;
        const arr = new Float32Array(total * size);
        let o = 0;
        geos.forEach(g => { arr.set(g.attributes[name].array, o); o += g.attributes[name].array.length; });
        out.setAttribute(name, new THREE.BufferAttribute(arr, size));
    });
    return out;
}

