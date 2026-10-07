// Ledad 3D-figur – en industriklättrare med hjälm, varselväst och sele – byggd av enkla former.
// Lederna styrs med ett platt pose-objekt så att GSAP kan tweena mellan poserna.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Vinklar i radianer. Höft/axel: negativ x = lemmen framåt. Knä: positiv x = böjt. Armbåge: negativ x = böjd.
// Höger sida ligger på −x (figuren tittar mot +z).
const KEYS = ['spineX', 'spineY', 'neckX', 'neckY', 'shLX', 'shLZ', 'elLX', 'shRX', 'shRZ', 'elRX',
    'hipLX', 'hipLZ', 'knLX', 'hipRX', 'hipRZ', 'knRX'];
const BASE = { shLZ: 0.1, shRZ: -0.1 };

export const POSES = {
    stand: {},
    look: { neckY: 0.45, neckX: -0.08 },
    // Böjer sig ned och greppar linan framför fötterna
    pick: {
        spineX: 0.55, neckX: 0.3, shLX: -1.0, shRX: -1.0, elLX: -0.3, elRX: -0.3, shLZ: -0.1, shRZ: 0.1,
        hipLX: -0.35, hipRX: -0.35, knLX: 0.5, knRX: 0.5,
    },
    // Händerna vid selen när karbinen klickas fast
    clip: { spineX: 0.15, neckX: 0.4, shLX: -0.25, shRX: -0.25, elLX: -0.95, elRX: -0.95, shLZ: -0.15, shRZ: 0.15 },
    // Höger hand på linan framför, vänster vid bromsen
    ready: { shRX: -0.9, elRX: -0.4, shRZ: 0.2, shLX: -0.5, elLX: -1.2, shLZ: -0.2, neckX: 0.2 },
    lean: {
        shRX: -1.3, elRX: -0.3, shRZ: 0.2, shLX: -0.5, elLX: -1.2, shLZ: -0.2, spineX: 0.3, neckX: 0.1,
        hipLX: -0.85, hipRX: -0.85, knLX: 0.6, knRX: 0.6,
    },
    // Sitter i selen med fötterna mot väggen, höger hand på linan ovanför
    hang: {
        shRX: -2.2, elRX: -0.6, shRZ: 0.3, shLX: -0.5, shLZ: -0.2, elLX: -1.35, spineX: 0.15, neckX: -0.12,
        hipLX: -1.35, hipRX: -1.35, hipLZ: 0.16, hipRZ: -0.16, knLX: 0.5, knRX: 0.5,
    },
};

export function poseValues(name) {
    const out = {};
    for (const k of KEYS) out[k] = POSES[name][k] ?? BASE[k] ?? 0;
    return out;
}

export function createFigure(env) {
    const mats = {
        suit: new THREE.MeshStandardMaterial({ color: '#2a3656', roughness: 0.8 }),
        vest: new THREE.MeshStandardMaterial({ color: '#f59e0b', roughness: 0.55, emissive: '#f59e0b', emissiveIntensity: 0.1 }),
        stripe: new THREE.MeshStandardMaterial({ color: '#e5e7eb', roughness: 0.3, metalness: 0.4, emissive: '#ffffff', emissiveIntensity: 0.3 }),
        helmet: new THREE.MeshStandardMaterial({ color: '#f4f4f5', roughness: 0.35, envMap: env, envMapIntensity: 0.7 }),
        harness: new THREE.MeshStandardMaterial({ color: '#ea580c', roughness: 0.6 }),
        dark: new THREE.MeshStandardMaterial({ color: '#16161a', roughness: 0.7 }),
        skin: new THREE.MeshStandardMaterial({ color: '#c99772', roughness: 0.7 }),
        lamp: new THREE.MeshBasicMaterial({ color: '#fff4dc', toneMapped: false }),
    };
    const capsule = (r, len, mat) => new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 4, 10), mat);
    const band = (r, y, parent, sx = 1, sz = 1) => {
        const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.035, 14, 1, true), mats.stripe);
        m.position.y = y;
        m.scale.set(sx, 1, sz);
        parent.add(m);
    };

    const root = new THREE.Group();
    root.rotation.order = 'YXZ'; // y = riktning, x = luta fram/bak
    const pelvis = new THREE.Group();
    root.add(pelvis);
    const hips = capsule(0.1, 0.17, mats.suit);
    hips.rotation.z = Math.PI / 2;
    hips.scale.set(1, 1, 0.9);
    pelvis.add(hips);
    const belt = new THREE.Mesh(new THREE.TorusGeometry(0.175, 0.028, 6, 22), mats.harness);
    belt.rotation.x = Math.PI / 2;
    belt.scale.set(1, 0.72, 1);
    belt.position.y = 0.07;
    pelvis.add(belt);

    // Bål (bredare upptill) med varselväst, reflexband, bröstsele och repsäck på ryggen
    const spine = new THREE.Group();
    spine.position.y = 0.08;
    pelvis.add(spine);
    const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.155, 0.46, 18), mats.vest);
    torso.position.y = 0.3;
    torso.scale.set(1, 1, 0.7);
    spine.add(torso);
    const shoulders = capsule(0.085, 0.3, mats.vest);
    shoulders.rotation.z = Math.PI / 2;
    shoulders.position.y = 0.5;
    shoulders.scale.set(1, 1, 0.8);
    spine.add(shoulders);
    band(0.176, 0.2, spine, 1, 0.71);
    band(0.19, 0.38, spine, 1, 0.71);
    [-1, 1].forEach(side => {
        const strap = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.42, 0.02), mats.harness);
        strap.position.set(0.075 * side, 0.32, 0.135);
        strap.rotation.z = 0.18 * side;
        spine.add(strap);
    });
    const bag = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.32, 0.12), mats.harness);
    bag.position.set(0, 0.3, -0.17);
    spine.add(bag);
    const neckMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.1, 10), mats.skin);
    neckMesh.position.y = 0.6;
    spine.add(neckMesh);

    // Huvud med hjälm, solglasögon och pannlampa
    const neck = new THREE.Group();
    neck.position.y = 0.6;
    spine.add(neck);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.1, 16, 12), mats.skin);
    head.position.y = 0.1;
    neck.add(head);
    const glasses = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.035, 0.04), mats.dark);
    glasses.position.set(0, 0.115, 0.085);
    neck.add(glasses);
    const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.125, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), mats.helmet);
    helmet.position.y = 0.13;
    neck.add(helmet);
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.035, 0.03), mats.lamp);
    lamp.position.set(0, 0.17, 0.115);
    neck.add(lamp);
    const lampPoint = new THREE.Object3D();
    lampPoint.position.set(0, 0.17, 0.16);
    neck.add(lampPoint);

    function arm(side) {
        const shoulder = new THREE.Group();
        shoulder.position.set(0.22 * side, 0.52, 0);
        spine.add(shoulder);
        const upper = capsule(0.055, 0.2, mats.suit);
        upper.position.y = -0.14;
        shoulder.add(upper);
        const elbow = new THREE.Group();
        elbow.position.y = -0.29;
        shoulder.add(elbow);
        const fore = capsule(0.05, 0.18, mats.suit);
        fore.position.y = -0.13;
        elbow.add(fore);
        band(0.056, -0.12, elbow);
        const hand = new THREE.Mesh(new THREE.SphereGeometry(0.055, 10, 8), mats.dark);
        hand.position.y = -0.28;
        elbow.add(hand);
        return { shoulder, elbow, hand };
    }
    function leg(side) {
        const hip = new THREE.Group();
        hip.position.set(0.1 * side, -0.05, 0);
        pelvis.add(hip);
        const thigh = capsule(0.075, 0.27, mats.suit);
        thigh.position.y = -0.21;
        hip.add(thigh);
        const loop = new THREE.Mesh(new THREE.TorusGeometry(0.088, 0.018, 6, 14), mats.harness);
        loop.rotation.x = Math.PI / 2;
        loop.position.y = -0.1;
        hip.add(loop);
        const knee = new THREE.Group();
        knee.position.y = -0.43;
        hip.add(knee);
        const shin = capsule(0.065, 0.28, mats.suit);
        shin.position.y = -0.2;
        knee.add(shin);
        band(0.068, -0.24, knee);
        const boot = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.1, 0.26), mats.dark);
        boot.position.set(0, -0.43, 0.05);
        knee.add(boot);
        return { hip, knee };
    }
    const L = arm(1), R = arm(-1);
    const LL = leg(1), LR = leg(-1);

    // Fästpunkten i selen (karbinens mitt)
    const harness = new THREE.Object3D();
    harness.position.set(0, 0.02, 0.2);
    pelvis.add(harness);

    const pose = poseValues('stand');
    const figure = {
        root, pose, harness, lampPoint, neck,
        hand: R.hand,
        walk: 0,      // 0–1: hur mycket benen "går" (små steg)
        walkPhase: 0,
        apply() {
            const p = pose;
            const step = Math.sin(figure.walkPhase) * 0.35 * figure.walk;
            spine.rotation.set(p.spineX, p.spineY, 0);
            neck.rotation.set(p.neckX, p.neckY, 0);
            L.shoulder.rotation.set(p.shLX, 0, p.shLZ);
            L.elbow.rotation.x = p.elLX;
            R.shoulder.rotation.set(p.shRX, 0, p.shRZ);
            R.elbow.rotation.x = p.elRX;
            LL.hip.rotation.set(p.hipLX + step, 0, p.hipLZ);
            LL.knee.rotation.x = p.knLX + Math.max(0, step) * 0.8;
            LR.hip.rotation.set(p.hipRX - step, 0, p.hipRZ);
            LR.knee.rotation.x = p.knRX + Math.max(0, -step) * 0.8;
        },
        setPose(values) {
            Object.assign(pose, values);
            figure.apply();
        },
    };
    figure.apply();
    return figure;
}

// Slår ihop en posad figur till en enda geometri med färger per hörn – billigt att rita många.
export function bakeFigure(figure) {
    figure.root.updateMatrixWorld(true);
    const geometries = [];
    figure.root.traverse(o => {
        if (!o.isMesh) return;
        const g = o.geometry.clone().applyMatrix4(o.matrixWorld);
        const c = o.material.color;
        const colors = new Float32Array(g.attributes.position.count * 3);
        for (let i = 0; i < colors.length; i += 3) colors.set([c.r, c.g, c.b], i);
        g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        geometries.push(g);
    });
    return mergeGeometries(geometries);
}
