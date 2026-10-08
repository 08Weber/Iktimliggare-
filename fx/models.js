// Modellerna byggs i kod (inga 3D-filer att ladda): fackverk, rep, karbinhake och klättraren.
import * as THREE from 'three';
import { SVGLoader } from 'three/addons/loaders/SVGLoader.js';
import { ropeTexture } from './common.js';

const UP = new THREE.Vector3(0, 1, 0);
const V = (x, y, z) => new THREE.Vector3(x, y, z);

// Ett InstancedMesh med cylindrar mellan punktpar [a, b, radie] – ett enda ritanrop för hela fackverket.
export function buildMembers(members, material, radialSegments = 6) {
    const geometry = new THREE.CylinderGeometry(1, 1, 1, radialSegments, 1, true);
    const mesh = new THREE.InstancedMesh(geometry, material, members.length);
    const matrix = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const pos = new THREE.Vector3();
    const scale = new THREE.Vector3();
    const dir = new THREE.Vector3();
    members.forEach(([a, b, r], i) => {
        dir.subVectors(b, a);
        const length = dir.length();
        q.setFromUnitVectors(UP, dir.normalize());
        pos.addVectors(a, b).multiplyScalar(0.5);
        scale.set(r, length, r);
        mesh.setMatrixAt(i, matrix.compose(pos, q, scale));
    });
    return mesh;
}

// Rep som hänger nedåt från (0,0,0). Lite ojämnt så att det inte ser datorritat ut.
export function buildRope({ length, radius = 0.05, base, stripe, wobble = 0.05, segments = 220 }) {
    const points = [];
    const n = 16;
    for (let i = 0; i <= n; i++) {
        const w = i === 0 ? 0 : wobble;
        points.push(V((Math.random() - 0.5) * w, -length * (i / n), (Math.random() - 0.5) * w));
    }
    const geometry = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), segments, radius, 6, false);
    const map = ropeTexture(base, stripe);
    map.repeat.set(length / (radius * 9), 1);
    return new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ map, roughness: 0.8, metalness: 0 }));
}

// Svepning av ett elliptiskt tvärsnitt längs en kurva i xy-planet (karbinens profilerade kropp:
// bredare i planet än ut ur planet, som en riktig I-balksprofil i aluminium).
function sweepGeometry(curve, segments, a, b, radial = 10) {
    const pos = [], nor = [], uv = [], idx = [];
    const p = V(0, 0, 0), t = V(0, 0, 0), n = V(0, 0, 0), out = V(0, 0, 0);
    for (let i = 0; i <= segments; i++) {
        curve.getPointAt(i / segments, p);
        curve.getTangentAt(i / segments, t).normalize();
        n.set(t.y, -t.x, 0).normalize();
        for (let k = 0; k <= radial; k++) {
            const ang = (k / radial) * Math.PI * 2;
            const c = Math.cos(ang), s = Math.sin(ang);
            pos.push(p.x + n.x * c * a, p.y + n.y * c * a, s * b);
            out.set(n.x * c / a, n.y * c / a, s / b).normalize();
            nor.push(out.x, out.y, out.z);
            uv.push(i / segments, k / radial);
        }
    }
    for (let i = 0; i < segments; i++) {
        for (let k = 0; k < radial; k++) {
            const a0 = i * (radial + 1) + k, b0 = a0 + radial + 1;
            idx.push(a0, b0, a0 + 1, b0, b0 + 1, a0 + 1);
        }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    return g;
}

// Cylinder med räfflad yta (skruvlåsets hylsa)
function knurledCylinder(r, h, ridges = 24) {
    const g = new THREE.CylinderGeometry(r, r, h, ridges * 2, 3, false);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
        const x = p.getX(i), z = p.getZ(i);
        const rr = Math.hypot(x, z);
        if (rr < r * 0.99) continue; // lockens mittpunkter
        const k = Math.round(((Math.atan2(z, x) + Math.PI) / (Math.PI * 2)) * ridges * 2);
        const s = k % 2 ? 1.12 : 1;
        p.setXYZ(i, x * s, p.getY(i), z * s);
    }
    g.computeVertexNormals();
    return g;
}

// Låsbar D-karbin i verklig storlek (~11 cm): profilerad kropp, keylock-nos, gångjärnsnit,
// grind och en räfflad skruvhylsa med röd markering som syns när den är olåst.
// setLock(0–1) skruvar hylsan uppåt och vrider den.
export function buildCarabiner(envMap, { color = '#f2b33d', steelColor = '#d4d8de' } = {}) {
    const material = new THREE.MeshStandardMaterial({
        color, metalness: 0.85, roughness: 0.28, envMap, envMapIntensity: 1.1,
        emissive: color, emissiveIntensity: 0, side: THREE.DoubleSide,
    });
    const steel = new THREE.MeshStandardMaterial({ color: steelColor, metalness: 0.95, roughness: 0.22, envMap, envMapIntensity: 1.1 });
    const red = new THREE.MeshStandardMaterial({ color: '#dc2626', roughness: 0.45 });
    const P = (x, y) => V(x, y, 0);
    const nose = P(0.024, 0.036), hinge = P(0.022, -0.041);
    const body = new THREE.CatmullRomCurve3([
        nose, P(0.021, 0.046), P(0.009, 0.054), P(-0.007, 0.054), P(-0.02, 0.047), P(-0.027, 0.031),
        P(-0.0285, 0.0), P(-0.027, -0.031), P(-0.021, -0.047), P(-0.008, -0.056), P(0.007, -0.055),
        P(0.017, -0.049), hinge,
    ]);
    const group = new THREE.Group();
    group.add(new THREE.Mesh(sweepGeometry(body, 90, 0.0062, 0.0045), material));

    // Keylock-nosen och gångjärnsnitet
    const noseBlock = new THREE.Mesh(new THREE.BoxGeometry(0.009, 0.011, 0.0095), material);
    noseBlock.position.copy(nose).add(V(0.0, -0.002, 0));
    noseBlock.rotation.z = -0.15;
    group.add(noseBlock);
    const rivet = new THREE.Mesh(new THREE.CylinderGeometry(0.0034, 0.0034, 0.0125, 12), steel);
    rivet.rotation.x = Math.PI / 2;
    rivet.position.copy(hinge);
    group.add(rivet);

    // Grinden svänger kring gångjärnet; hylsan glider på den
    const length = hinge.distanceTo(nose) - 0.004;
    const gate = new THREE.Group();
    gate.position.copy(hinge);
    const closedAngle = -Math.atan2(nose.x - hinge.x, nose.y - hinge.y);
    gate.rotation.z = closedAngle;
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.0041, 0.0041, length, 12), steel);
    rod.position.y = length / 2;
    gate.add(rod);
    const mark = new THREE.Mesh(new THREE.CylinderGeometry(0.0046, 0.0046, 0.006, 12), red);
    mark.position.y = length - 0.024;
    gate.add(mark);
    const sleeve = new THREE.Mesh(knurledCylinder(0.0066, 0.022), steel);
    gate.add(sleeve);
    group.add(gate);

    const lockedY = length - 0.011, openY = length - 0.036;
    const api = {
        group, gate, sleeve, material, closedAngle, openAngle: closedAngle + 0.42,
        setLock(t) {
            sleeve.position.y = openY + (lockedY - openY) * t;
            sleeve.rotation.y = t * Math.PI * 5;
        },
    };
    api.setLock(1);
    return api;
}

// Nedfirare i stil med Petzl ID: två sidoplattor (främre kan svängas upp), handtag och fästhål.
// Lokalt: +Y = repet uppåt (mot förankringen), repet löper i spalten mellan plattorna.
// Repet går in i toppen vid x = +0.006 och ut i botten vid x = +0.016; fästhålet sitter vid HOLE.
export const DESCENDER = { top: V(0.006, 0.088, 0), exit: V(0.016, -0.084, 0), hole: V(-0.012, -0.062, 0) };
export function buildDescender(envMap) {
    const shape = new THREE.Shape();
    shape.moveTo(-0.022, -0.076);
    shape.quadraticCurveTo(0, -0.09, 0.024, -0.075);
    shape.lineTo(0.031, -0.01);
    shape.quadraticCurveTo(0.035, 0.062, 0.012, 0.084);
    shape.quadraticCurveTo(-0.012, 0.094, -0.027, 0.07);
    shape.lineTo(-0.032, 0.0);
    shape.closePath();
    const hole = new THREE.Path();
    hole.absarc(DESCENDER.hole.x, DESCENDER.hole.y, 0.0085, 0, Math.PI * 2, true);
    shape.holes.push(hole);
    const plateGeo = new THREE.ExtrudeGeometry(shape, {
        depth: 0.004, bevelEnabled: true, bevelThickness: 0.0018, bevelSize: 0.0018, bevelSegments: 2, curveSegments: 10,
    });
    const grey = new THREE.MeshStandardMaterial({ color: '#7d828a', metalness: 0.8, roughness: 0.4, envMap, envMapIntensity: 0.8 });
    const black = new THREE.MeshStandardMaterial({ color: '#17171b', roughness: 0.55, metalness: 0.2 });
    const orange = new THREE.MeshStandardMaterial({ color: '#f97316', roughness: 0.5 });

    const group = new THREE.Group();
    const back = new THREE.Mesh(plateGeo, black);
    back.position.z = -0.0145;
    group.add(back);
    // Främre plattan svänger kring axeln nertill när repet läggs i
    const plate = new THREE.Group();
    plate.position.set(-0.012, -0.062, 0.0105);
    const front = new THREE.Mesh(plateGeo, grey);
    front.position.set(0.012, 0.062, 0);
    plate.add(front);
    group.add(plate);
    // Distans längs ryggen och axel genom fästhålet
    const spacer = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.11, 0.021), black);
    spacer.position.set(-0.026, 0.005, 0);
    group.add(spacer);
    // Handtaget på vänster sida (sett från klättraren)
    const handle = new THREE.Group();
    handle.position.set(-0.018, 0.07, 0.016);
    handle.rotation.z = 0.35;
    const lever = new THREE.Mesh(new THREE.BoxGeometry(0.011, 0.1, 0.009), black);
    lever.position.y = -0.05;
    handle.add(lever);
    const tip = new THREE.Mesh(new THREE.BoxGeometry(0.013, 0.03, 0.011), orange);
    tip.position.y = -0.092;
    handle.add(tip);
    group.add(handle);
    const handlePoint = new THREE.Object3D();
    handlePoint.position.set(-0.04, 0.0, 0.03);
    group.add(handlePoint);

    return {
        group, handlePoint,
        setOpen(t) { plate.rotation.z = t * 0.55; },
    };
}

// Säkerhetsenhet i stil med Petzl ASAP: glider på säkerhetsrepet och låser vid fall.
// Lokalt: +Y = repet uppåt, repet löper rakt genom mitten. Fästpunkt för falldämparen vid ATTACH.
export const BACKUP = { top: V(0, 0.045, 0), bottom: V(0, -0.045, 0), attach: V(0, -0.03, -0.028) };
export function buildBackupDevice(envMap) {
    const grey = new THREE.MeshStandardMaterial({ color: '#9ca3af', metalness: 0.8, roughness: 0.35, envMap });
    const yellow = new THREE.MeshStandardMaterial({ color: '#facc15', roughness: 0.5 });
    const black = new THREE.MeshStandardMaterial({ color: '#17171b', roughness: 0.6 });
    const group = new THREE.Group();
    [-1, 1].forEach(s => {
        const side = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.006, 20), s > 0 ? grey : black);
        side.rotation.x = Math.PI / 2;
        side.scale.set(1, 1, 1.45);
        side.position.set(0, -0.005, 0.0125 * s);
        group.add(side);
    });
    const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.016, 0.004, 6, 16), yellow);
    wheel.position.set(-0.016, 0.004, 0);
    wheel.rotation.y = Math.PI / 2;
    group.add(wheel);
    const lever = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.05, 0.02), yellow);
    lever.position.set(0.02, -0.02, 0);
    lever.rotation.z = -0.4;
    group.add(lever);
    return { group };
}

// Klättraren från app-ikonen, extruderad till en 3D-figur. Pivot = där repet går genom selen.
export async function loadClimberGeometry(url) {
    const data = await new SVGLoader().loadAsync(url);
    const shapes = data.paths.flatMap(path => SVGLoader.createShapes(path));
    const geometry = new THREE.ExtrudeGeometry(shapes, {
        depth: 64, bevelEnabled: true, bevelThickness: 9, bevelSize: 5, bevelSegments: 3, curveSegments: 8,
    });
    geometry.translate(-160, -300, -32);
    return geometry;
}
