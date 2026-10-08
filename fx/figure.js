// Detaljerad, ledad 3D-klättrare: overall, varselväst med reflexer, sittsele med bröstsele,
// materialöglor med karbiner, repsäck, klätterhjälm med pannlampa och hakband, ansikte med
// glasögon, knutna handskar och kängor med sula.
// Armar och ben styrs med IK (inverterad kinematik): händer och fötter placeras exakt på linan,
// däcket eller väggen och lederna räknas ut därifrån – så att inget klipper igenom.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { buildCarabiner } from './models.js';
import { canvasTexture } from './common.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

// Kroppsmått i meter. Bäckenets mitt står 1,0 m över marken.
export const DIMS = {
    hipX: 0.095, hipY: -0.05, thigh: 0.44, shin: 0.43, ankle: 0.08, footBack: 0.055,
    upperArm: 0.29, foreArm: 0.26, standHeight: 1.0,
};
const GRIP = V(0, -0.112, 0.042); // där linan går genom den knutna handen (handens koordinater)

// Varselväst: orange med reflexhängslen fram och bak (map) och lysande ränder (emissiveMap)
function vestTextures() {
    const draw = (base, stripe) => canvasTexture(256, 128, (ctx, w, h) => {
        ctx.fillStyle = base;
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = stripe;
        [0.064, 0.936, 0.436, 0.564].forEach(u => ctx.fillRect(u * w - 5, 14, 10, h - 18));
    });
    return { map: draw('#ffffff', '#e2e6ee'), emissiveMap: draw('#000000', '#ffffff') };
}

function materials(env) {
    const mat = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.75, ...o });
    return {
        suit: mat('#1e2a45', { roughness: 0.85 }),
        suitDark: mat('#141c30', { roughness: 0.85 }),
        vest: mat('#ff7a1a', { roughness: 0.6, emissive: '#ff7a1a', emissiveIntensity: 0.08 }),
        vestStriped: mat('#ff7a1a', { roughness: 0.6, emissive: '#ffffff', emissiveIntensity: 0.35, ...vestTextures() }),
        reflect: mat('#e8eaee', { roughness: 0.25, metalness: 0.5, emissive: '#ffffff', emissiveIntensity: 0.35 }),
        harness: mat('#ea580c', { roughness: 0.6 }),
        black: mat('#121216', { roughness: 0.7 }),
        rubber: mat('#09090b', { roughness: 0.95 }),
        skin: mat('#c48c66', { roughness: 0.6 }),
        lips: mat('#8a5640', { roughness: 0.6 }),
        helmet: mat('#f4f4f5', { roughness: 0.3, envMap: env, envMapIntensity: 0.7 }),
        glove: mat('#2a2a30', { roughness: 0.8 }),
        metal: mat('#cbd5e1', { metalness: 0.9, roughness: 0.3, envMap: env }),
        glass: mat('#0b0d12', { roughness: 0.08, metalness: 0.7, envMap: env, envMapIntensity: 1.2 }),
        lens: new THREE.MeshBasicMaterial({ color: '#fff4dc', toneMapped: false }),
        bag: mat('#b91c1c', { roughness: 0.7 }),
        lace: mat('#a8a29e'),
    };
}

// Rotationssymmetrisk form från en profil [[radie, y], …] uppifrån och ned.
function lathe(profile, segments) {
    const points = profile.map(([r, y]) => new THREE.Vector2(Math.max(r, 1e-4), y)).reverse();
    return new THREE.LatheGeometry(points, segments);
}
// Arm/ben-del som pekar nedåt från 0 till −len, avsmalnande med en liten "muskel" och rundade ändar.
function limb(len, r0, r1, bulge, segments) {
    const p = [];
    for (let i = 0; i <= 3; i++) {
        const a = (i / 3) * Math.PI / 2;
        p.push([Math.sin(a) * r0, Math.cos(a) * r0 * 0.6]);
    }
    for (let i = 1; i < 10; i++) {
        const t = i / 10;
        p.push([(r0 + (r1 - r0) * t) * (1 + bulge * Math.sin(Math.PI * t)), -len * t]);
    }
    for (let i = 0; i <= 3; i++) {
        const a = (i / 3) * Math.PI / 2;
        p.push([Math.cos(a) * r1, -len - Math.sin(a) * r1 * 0.6]);
    }
    return lathe(p, segments);
}
const tube = (points, r, segs = 16, radial = 6) =>
    new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), segs, r, radial, false);

export function createFigure(env, { lod = 1 } = {}) {
    const seg = n => Math.max(5, Math.round(n * lod));
    const M = materials(env);
    const add = (parent, geometry, material, pos, rot, scale) => {
        const mesh = new THREE.Mesh(geometry, material);
        if (pos) mesh.position.copy(pos);
        if (rot) mesh.rotation.set(rot[0], rot[1], rot[2]);
        if (scale) mesh.scale.set(scale[0], scale[1], scale[2]);
        parent.add(mesh);
        return mesh;
    };
    const sphere = (r = 1, w = 16, h = 12) => new THREE.SphereGeometry(r, seg(w), seg(h));
    const point = (parent, x, y, z) => {
        const o = new THREE.Object3D();
        o.position.set(x, y, z);
        parent.add(o);
        return o;
    };

    // ---------- Bäcken och sittsele ----------
    const root = new THREE.Group();
    root.rotation.order = 'YXZ'; // y = riktning, x = luta fram/bak, z = sida
    add(root, sphere(), M.suit, V(0, -0.015, 0), null, [0.165, 0.12, 0.118]);
    add(root, new THREE.TorusGeometry(0.163, 0.021, 6, seg(28)), M.harness, V(0, 0.075, 0), [Math.PI / 2, 0, 0], [1, 0.76, 1]);
    add(root, new THREE.CylinderGeometry(0.172, 0.172, 0.075, seg(18), 1, true, Math.PI * 0.6, Math.PI * 0.8), M.black,
        V(0, 0.075, 0), null, [1, 1, 0.76]);
    add(root, new THREE.TorusGeometry(0.02, 0.0055, 6, 14), M.metal, V(0, -0.005, 0.15)); // bukinfästningens maillon
    // Materialöglor bak på höfterna med karbiner och en bröstblockerare
    [-1, 1].forEach(s => {
        const gear = buildCarabiner(env, { color: '#c4c9d0' });
        gear.group.position.set(0.14 * s, -0.07, -0.118);
        gear.group.rotation.set(0.1, 1.25 * s, 0.08);
        root.add(gear.group);
    });
    add(root, new THREE.BoxGeometry(0.035, 0.11, 0.045), M.black, V(0.12, -0.06, -0.13));
    add(root, new THREE.BoxGeometry(0.037, 0.03, 0.047), M.harness, V(0.12, -0.02, -0.13));
    const maillon = point(root, 0, -0.005, 0.15);
    const gearLoop = { L: point(root, 0.175, 0.0, -0.07), R: point(root, -0.175, 0.0, -0.07) };
    const hipSide = { L: point(root, 0.18, -0.05, 0.07), R: point(root, -0.18, -0.05, 0.07) };

    // ---------- Bål ----------
    const spine = new THREE.Group();
    spine.position.set(0, 0.07, 0);
    root.add(spine);
    const abdomen = [[0.152, 0.25], [0.15, 0.2], [0.145, 0.12], [0.148, 0.04], [0.155, -0.04]];
    add(spine, lathe(abdomen, seg(18)), M.suit, null, null, [1, 1, 0.72]);
    add(spine, lathe(abdomen.filter(([, y]) => y >= 0.02).map(([r, y]) => [r * 1.07, y]), seg(18)), M.vest, null, null, [1, 1, 0.72]);
    add(spine, new THREE.CylinderGeometry(0.158, 0.158, 0.03, seg(18), 1, true), M.reflect, V(0, 0.12, 0), null, [1, 1, 0.72]);
    add(spine, tube([V(0, 0.27, 0.13), V(0, 0.16, 0.121), V(0, 0.05, 0.13)], 0.011, 8), M.harness); // rem bröstsele → maillon

    const chest = new THREE.Group();
    chest.position.set(0, 0.2, 0);
    spine.add(chest);
    const chestProfile = [[0.05, 0.33], [0.09, 0.305], [0.15, 0.27], [0.18, 0.21], [0.185, 0.14], [0.175, 0.06], [0.16, 0.0], [0.155, -0.04]];
    add(chest, lathe(chestProfile, seg(20)), M.suit, null, null, [1.06, 1, 0.7]);
    add(chest, lathe(chestProfile.filter(([, y]) => y <= 0.27).map(([r, y]) => [r * 1.07, y]), seg(20)), M.vestStriped, null, null, [1.06, 1, 0.7]);
    add(chest, new THREE.CylinderGeometry(0.19, 0.19, 0.03, seg(20), 1, true), M.reflect, V(0, 0.07, 0), null, [1.06, 1, 0.7]);
    add(chest, new THREE.TorusGeometry(0.066, 0.017, 6, seg(16)), M.suit, V(0, 0.3, 0), [Math.PI / 2, 0, 0]); // krage
    // Bröstsele över axlarna med bröstplatta
    [-1, 1].forEach(s => add(chest, tube([
        V(s * 0.07, 0.02, -0.125), V(s * 0.1, 0.2, -0.13), V(s * 0.12, 0.3, -0.04),
        V(s * 0.11, 0.3, 0.06), V(s * 0.07, 0.2, 0.14), V(s * 0.03, 0.1, 0.15),
    ], 0.011, 18), M.harness));
    add(chest, new THREE.BoxGeometry(0.075, 0.05, 0.022), M.black, V(0, 0.1, 0.148));
    // Repsäck på ryggen
    add(chest, new THREE.CapsuleGeometry(0.1, 0.14, 4, seg(12)), M.bag, V(0, 0.13, -0.175), null, [1.2, 1, 0.5]);
    add(chest, new THREE.BoxGeometry(0.2, 0.025, 0.01), M.reflect, V(0, 0.16, -0.227));

    // ---------- Huvud med hjälm ----------
    const neck = new THREE.Group();
    neck.position.set(0, 0.28, 0);
    chest.add(neck);
    add(neck, new THREE.CylinderGeometry(0.048, 0.052, 0.1, seg(12)), M.skin, V(0, 0.04, 0));
    add(neck, sphere(), M.skin, V(0, 0.135, 0.012), null, [0.09, 0.112, 0.102]);
    add(neck, sphere(), M.skin, V(0, 0.075, 0.04), null, [0.068, 0.045, 0.07]); // käke
    add(neck, new THREE.ConeGeometry(0.015, 0.036, 8), M.skin, V(0, 0.118, 0.118), [Math.PI / 2, 0, 0]); // näsa
    [-1, 1].forEach(s => add(neck, sphere(1, 8, 6), M.skin, V(s * 0.09, 0.13, 0.005), null, [0.016, 0.03, 0.012])); // öron
    add(neck, new THREE.BoxGeometry(0.036, 0.007, 0.006), M.lips, V(0, 0.083, 0.108)); // mun
    add(neck, new THREE.CylinderGeometry(0.104, 0.104, 0.034, seg(16), 1, true, -1.0, 2.0), M.glass, V(0, 0.142, 0.014)); // glasögon
    [-1, 1].forEach(s => add(neck, new THREE.BoxGeometry(0.004, 0.008, 0.07), M.black, V(s * 0.093, 0.142, -0.02))); // skalmar
    add(neck, new THREE.SphereGeometry(0.13, seg(22), seg(12), 0, Math.PI * 2, 0, Math.PI * 0.5), M.helmet,
        V(0, 0.155, 0.006), null, [1, 0.95, 1.13]);
    add(neck, new THREE.TorusGeometry(0.13, 0.011, 6, seg(28)), M.helmet, V(0, 0.155, 0.006), [Math.PI / 2, 0, 0], [1, 1.13, 1]);
    [[-0.045, 0.272], [0, 0.28], [0.045, 0.272]].forEach(([x, y]) =>
        add(neck, new THREE.BoxGeometry(0.018, 0.008, 0.055), M.black, V(x, y, 0.0), [0, 0, x * -4])); // ventiler
    add(neck, tube([V(-0.115, 0.15, 0), V(-0.085, 0.06, 0.03), V(0, 0.02, 0.05), V(0.085, 0.06, 0.03), V(0.115, 0.15, 0)], 0.006, 16), M.black); // hakband
    add(neck, new THREE.TorusGeometry(0.133, 0.006, 4, seg(28)), M.black, V(0, 0.19, 0.006), [Math.PI / 2, 0, 0], [1, 1.12, 1]); // lampans band
    add(neck, new THREE.BoxGeometry(0.055, 0.036, 0.032), M.black, V(0, 0.2, 0.155));
    add(neck, new THREE.CylinderGeometry(0.013, 0.013, 0.006, 12), M.lens, V(0, 0.2, 0.172), [Math.PI / 2, 0, 0]);
    add(neck, new THREE.BoxGeometry(0.05, 0.035, 0.025), M.black, V(0, 0.2, -0.157)); // batteri
    const lampPoint = point(neck, 0, 0.2, 0.18);

    // ---------- Armar med handskar ----------
    function arm(side) { // side: +1 = vänster (+x), −1 = höger (−x)
        const shoulder = new THREE.Group();
        shoulder.position.set(0.185 * side, 0.235, -0.01);
        chest.add(shoulder);
        add(shoulder, sphere(0.062), M.suit);
        add(shoulder, limb(DIMS.upperArm, 0.052, 0.043, 0.1, seg(12)), M.suit);
        add(shoulder, new THREE.CylinderGeometry(0.05, 0.05, 0.028, seg(12), 1, true), M.reflect, V(0, -0.15, 0));
        const elbow = new THREE.Group();
        elbow.position.set(0, -DIMS.upperArm, 0);
        shoulder.add(elbow);
        add(elbow, sphere(0.045), M.suit);
        add(elbow, limb(DIMS.foreArm, 0.043, 0.033, 0.12, seg(12)), M.suit);
        add(elbow, new THREE.CylinderGeometry(0.041, 0.039, 0.055, seg(12)), M.glove, V(0, -0.235, 0));
        add(elbow, new THREE.CylinderGeometry(0.042, 0.042, 0.012, seg(12), 1, true), M.harness, V(0, -0.215, 0));
        const hand = new THREE.Group();
        hand.position.set(0, -DIMS.foreArm, 0);
        elbow.add(hand);
        // Knuten hand: handflata, fyra fingrar böjda runt greppunkten och tumme
        add(hand, new THREE.BoxGeometry(0.082, 0.088, 0.032), M.glove, V(0, -0.05, 0));
        add(hand, new THREE.BoxGeometry(0.07, 0.04, 0.008), M.harness, V(0, -0.06, -0.019));
        [-0.03, -0.01, 0.01, 0.03].forEach((x, i) => {
            const start = V(x, -0.093, 0.0).sub(GRIP);
            const r = Math.hypot(start.y, start.z);
            const a0 = Math.atan2(start.z, start.y);
            const pts = [];
            for (let k = 0; k <= 6; k++) {
                const a = a0 - (k / 6) * (2.75 - Math.abs(i - 1.5) * 0.15);
                pts.push(V(x, GRIP.y + Math.cos(a) * r, GRIP.z + Math.sin(a) * r));
            }
            add(hand, tube(pts, 0.0105, 10, 5), M.glove);
        });
        const t = side; // tummen: vänster hand på +x, höger på −x (handens koordinater)
        add(hand, tube([V(t * 0.045, -0.03, 0.01), V(t * 0.05, -0.065, 0.05), V(t * 0.03, -0.1, 0.085), V(t * 0.012, -0.11, 0.09)], 0.012, 10, 5), M.glove);
        const grip = point(hand, GRIP.x, GRIP.y, GRIP.z);
        return { shoulder, elbow, hand, grip, side };
    }

    // ---------- Ben med kängor ----------
    function leg(side) {
        const hip = new THREE.Group();
        hip.position.set(DIMS.hipX * side, DIMS.hipY, 0);
        root.add(hip);
        add(hip, sphere(0.08), M.suit);
        add(hip, limb(DIMS.thigh, 0.083, 0.06, 0.08, seg(14)), M.suit);
        add(hip, new THREE.TorusGeometry(0.09, 0.016, 6, seg(18)), M.harness, V(0, -0.1, 0), [Math.PI / 2, 0, 0]); // benögla
        add(hip, new THREE.BoxGeometry(0.02, 0.1, 0.075), M.suitDark, V(0.074 * side, -0.24, 0)); // benficka
        const knee = new THREE.Group();
        knee.position.set(0, -DIMS.thigh, 0);
        hip.add(knee);
        add(knee, sphere(0.058), M.suit);
        add(knee, sphere(1, 12, 8), M.black, V(0, -0.03, 0.058), null, [0.06, 0.075, 0.03]); // knäskydd
        add(knee, limb(DIMS.shin, 0.06, 0.044, 0.18, seg(14)), M.suit);
        add(knee, new THREE.CylinderGeometry(0.058, 0.058, 0.026, seg(12), 1, true), M.reflect, V(0, -0.25, 0));
        const ankle = new THREE.Group();
        ankle.position.set(0, -DIMS.shin, 0);
        knee.add(ankle);
        // Känga: skaft, ovandel, tåhätta, snörning och sula (sulans undersida på y = −0.08)
        add(ankle, new THREE.CylinderGeometry(0.057, 0.06, 0.12, seg(12)), M.black);
        add(ankle, new THREE.TorusGeometry(0.058, 0.01, 5, seg(14)), M.black, V(0, 0.06, 0), [Math.PI / 2, 0, 0]);
        add(ankle, new THREE.CapsuleGeometry(0.048, 0.15, 4, seg(12)), M.black, V(0, -0.042, 0.06), [Math.PI / 2, 0, 0], [1.12, 1, 0.85]);
        add(ankle, sphere(1, 12, 8), M.rubber, V(0, -0.045, 0.16), null, [0.052, 0.038, 0.05]);
        add(ankle, new THREE.BoxGeometry(0.045, 0.006, 0.09), M.lace, V(0, 0.0, 0.085), [-0.25, 0, 0]);
        add(ankle, new THREE.BoxGeometry(0.115, 0.022, 0.3), M.rubber, V(0, -0.069, 0.055));
        return { hip, knee, ankle, side };
    }

    const arms = { L: arm(1), R: arm(-1) };
    const legs = { L: leg(1), R: leg(-1) };

    // ---------- IK ----------
    const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _pq = new THREE.Quaternion();
    const _x = V(), _y = V(), _z = V();
    // Rotation som får ledens lokala +Y att peka längs yAxis och +Z så nära zHint som möjligt.
    function orientQuat(bone, yAxis, zHint, out) {
        _y.copy(yAxis).normalize();
        _z.copy(zHint).addScaledVector(_y, -zHint.dot(_y));
        if (_z.lengthSq() < 1e-8) _z.set(Math.abs(_y.x) < 0.9 ? 1 : 0, 0, Math.abs(_y.x) < 0.9 ? 0 : 1).cross(_y);
        _z.normalize();
        _x.crossVectors(_y, _z);
        _m.makeBasis(_x, _y, _z);
        _q.setFromRotationMatrix(_m);
        bone.parent.getWorldQuaternion(_pq);
        return out.copy(_pq.invert().multiply(_q));
    }
    function orient(bone, yAxis, zHint) {
        orientQuat(bone, yAxis, zHint, bone.quaternion);
        bone.updateMatrixWorld(true);
    }

    const _d = V(), _bend = V();
    // Tvåleds-IK: rot a, mål t, längder L1/L2, polriktning (dit knä/armbåge ska peka)
    function twoBone(a, t, L1, L2, pole, mid, end) {
        _d.subVectors(t, a);
        let dist = _d.length();
        _d.normalize();
        dist = THREE.MathUtils.clamp(dist, Math.abs(L1 - L2) + 1e-4, L1 + L2 - 1e-4);
        const x = (L1 * L1 - L2 * L2 + dist * dist) / (2 * dist);
        const h = Math.sqrt(Math.max(0, L1 * L1 - x * x));
        _bend.copy(pole).addScaledVector(_d, -pole.dot(_d));
        if (_bend.lengthSq() < 1e-8) _bend.set(0, 1, 0);
        _bend.normalize();
        mid.copy(a).addScaledVector(_d, x).addScaledVector(_bend, h);
        end.copy(a).addScaledVector(_d, dist);
    }

    const hipW = V(), mid = V(), end = V(), ankleT = V(), toeP = V(), tmp = V(), tmp2 = V();
    // Fot: sulans mitt på contact, sulan mot ytan med normalen normal, tårna mot toe.
    function solveLeg(side, contact, normal, toe, pole) {
        const L = legs[side];
        toeP.copy(toe).addScaledVector(normal, -toe.dot(normal)).normalize();
        ankleT.copy(contact).addScaledVector(normal, DIMS.ankle).addScaledVector(toeP, -DIMS.footBack);
        L.hip.getWorldPosition(hipW);
        twoBone(hipW, ankleT, DIMS.thigh, DIMS.shin, pole, mid, end);
        orient(L.hip, tmp.subVectors(hipW, mid), pole);
        orient(L.knee, tmp.subVectors(mid, end), pole);
        orient(L.ankle, normal, toeP);
    }

    const shW = V(), wristT = V(), gripNow = V(), xDir = V(), negPole = V();
    // Hand: greppunkten mot grip. ropeUp = linans riktning uppåt (handen greppar runt den),
    // eller null för en avslappnad hand med handflatan mot `inward`.
    function solveArm(side, grip, ropeUp, pole, inward) {
        const A = arms[side];
        A.shoulder.getWorldPosition(shW);
        negPole.copy(pole).negate();
        wristT.subVectors(grip, shW).setLength(Math.max(0.05, grip.distanceTo(shW) - 0.12)).add(shW);
        for (let iter = 0; iter < 3; iter++) {
            twoBone(shW, wristT, DIMS.upperArm, DIMS.foreArm, pole, mid, end);
            orient(A.shoulder, tmp.subVectors(shW, mid), negPole);
            orient(A.elbow, tmp.subVectors(mid, end), negPole);
            tmp.subVectors(mid, end).normalize(); // handens +Y: fingrarna fortsätter längs underarmen
            if (ropeUp) {
                // Linan längs handens X-axel, tummen uppåt längs linan
                xDir.copy(ropeUp).multiplyScalar(A.side > 0 ? 1 : -1);
                xDir.addScaledVector(tmp, -xDir.dot(tmp)).normalize();
                orient(A.hand, tmp, tmp2.crossVectors(xDir, tmp));
            } else {
                orient(A.hand, tmp, inward);
            }
            A.grip.getWorldPosition(gripNow);
            wristT.add(tmp2.subVectors(grip, gripNow));
        }
    }

    const axes = { fwd: V(), up: V(), right: V(), flatFwd: V() };
    const _rq = new THREE.Quaternion();
    return {
        root, spine, chest, neck, maillon, gearLoop, hipSide, lampPoint, arms, legs, axes,
        // Placera kroppen: bäckenets position, riktning (yaw), lutning (pitch) och bål/huvud.
        setBody({ pos, yaw = 0, pitch = 0, roll = 0, spineBend = 0, chestBend = 0, neckX = 0, neckY = 0 }) {
            root.position.copy(pos);
            root.rotation.set(pitch, yaw, roll);
            spine.rotation.set(spineBend, 0, 0);
            chest.rotation.set(chestBend, 0, 0);
            neck.rotation.set(neckX, neckY, 0);
            root.updateMatrixWorld(true);
            root.getWorldQuaternion(_rq);
            axes.fwd.set(0, 0, 1).applyQuaternion(_rq);
            axes.up.set(0, 1, 0).applyQuaternion(_rq);
            axes.right.set(-1, 0, 0).applyQuaternion(_rq);
            axes.flatFwd.set(Math.sin(yaw), 0, Math.cos(yaw));
        },
        solveLeg,
        solveArm,
        // Polriktning för armbågen: nedåt, bakåt och utåt
        armPole(side) {
            const out = side === 'L' ? -1 : 1;
            return V().copy(axes.up).multiplyScalar(-0.7).addScaledVector(axes.fwd, -0.5).addScaledVector(axes.right, 0.6 * out).normalize();
        },
        // Avslappnad arm längs sidan: målpunkt och handflata inåt
        relaxedGrip(side, out) {
            const s = side === 'L' ? -1 : 1;
            arms[side].shoulder.getWorldPosition(out);
            return out.addScaledVector(axes.up, -0.6).addScaledVector(axes.right, 0.07 * s).addScaledVector(axes.fwd, 0.05);
        },
        inward(side, out) {
            return out.copy(axes.right).multiplyScalar(side === 'L' ? 1 : -1);
        },
    };
}

// Slår ihop en posad figur till en enda geometri med färger per hörn – billigt att rita många.
export function bakeFigure(root) {
    root.updateMatrixWorld(true);
    const geometries = [];
    root.traverse(o => {
        if (!o.isMesh) return;
        let g = o.geometry.clone().applyMatrix4(o.matrixWorld);
        if (g.index) g = g.toNonIndexed(); // blanda inte indexerade och oindexerade former
        const c = o.material.color;
        const colors = new Float32Array(g.attributes.position.count * 3);
        for (let i = 0; i < colors.length; i += 3) colors.set([c.r, c.g, c.b], i);
        g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        for (const name of Object.keys(g.attributes)) {
            if (!['position', 'normal', 'uv', 'color'].includes(name)) g.deleteAttribute(name);
        }
        geometries.push(g);
    });
    return mergeGeometries(geometries);
}
