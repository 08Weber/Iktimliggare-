// Modellerna byggs i kod (inga 3D-filer att ladda): fackverksmast, rep, karbinhake och klättraren.
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

// Telemast i fackverk med antennpaneler, parabol och en bom i toppen som repen hänger i.
export function buildMast(steel, panels, { height = 72, base = 3.4, top = 1.1, segments = 18 } = {}) {
    const half = y => base + (top - base) * (y / height);
    // Hörnen i ordning runt masten: (-,-) (+,-) (+,+) (-,+)
    const corner = (y, k) => {
        const h = half(y);
        return V(k === 1 || k === 2 ? h : -h, y, k >= 2 ? h : -h);
    };

    const members = [];
    const seg = height / segments;
    for (let i = 0; i < segments; i++) {
        const y0 = i * seg, y1 = y0 + seg;
        for (let k = 0; k < 4; k++) {
            const n = (k + 1) % 4;
            members.push([corner(y0, k), corner(y1, k), 0.12]);  // ben
            members.push([corner(y0, k), corner(y1, n), 0.045]); // kryss
            members.push([corner(y0, n), corner(y1, k), 0.045]);
            members.push([corner(y1, k), corner(y1, n), 0.055]); // ring
        }
    }
    members.push([V(0, height, 0), V(0, height + 8, 0), 0.1]); // antennspira

    const boomTip = V(4.9, height - 0.6, 0.4);
    members.push([V(top, height - 0.5, 0.4), boomTip, 0.08]);
    members.push([V(top, height - 3.4, 0.4), V(3.9, height - 0.6, 0.4), 0.06]);

    const group = new THREE.Group();
    group.add(buildMembers(members, steel));

    const panelGeo = new THREE.BoxGeometry(0.55, 2.8, 0.22);
    const yPanels = height - 5;
    const r = half(yPanels) + 0.45;
    for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
        const panel = new THREE.Mesh(panelGeo, panels);
        panel.position.set(Math.cos(a) * r, yPanels, Math.sin(a) * r);
        panel.rotation.y = Math.PI / 2 - a;
        group.add(panel);
    }

    const dish = new THREE.Mesh(new THREE.SphereGeometry(1.1, 20, 8, 0, Math.PI * 2, 0, 0.6), panels);
    dish.position.set(-half(height - 12) - 0.7, height - 12, 0.5);
    dish.rotation.z = -Math.PI / 2;
    group.add(dish);

    const beacons = [
        V(0, height + 8.25, 0),
        corner(height * 0.5, 0).add(V(-0.25, 0, -0.25)),
        corner(height * 0.5, 2).add(V(0.25, 0, 0.25)),
    ];
    return { group, boomTip, beacons, height };
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

// Karbinhake i D-form med en grind som kan öppnas och klicka igen.
export function buildCarabiner(envMap) {
    const material = new THREE.MeshStandardMaterial({
        color: '#f59e0b', metalness: 0.9, roughness: 0.26, envMap, envMapIntensity: 1.2,
        emissive: '#f59e0b', emissiveIntensity: 0,
    });
    const P = (x, y) => V(x, y, 0);
    const body = new THREE.CatmullRomCurve3([
        P(0.13, 0.17), P(0.09, 0.26), P(-0.01, 0.30), P(-0.10, 0.24), P(-0.13, 0.08),
        P(-0.125, -0.12), P(-0.08, -0.24), P(0.0, -0.28), P(0.08, -0.23), P(0.10, -0.19),
    ]);
    const group = new THREE.Group();
    group.add(new THREE.Mesh(new THREE.TubeGeometry(body, 64, 0.022, 10, false), material));

    // Grinden är en rak stav som vrids kring gångjärnet nertill
    const hinge = P(0.10, -0.19), nose = P(0.13, 0.17);
    const length = hinge.distanceTo(nose);
    const gateGeo = new THREE.CylinderGeometry(0.017, 0.017, length, 10);
    gateGeo.translate(0, length / 2, 0);
    const gate = new THREE.Group();
    gate.position.copy(hinge);
    const closedAngle = -Math.atan2(nose.x - hinge.x, nose.y - hinge.y);
    gate.rotation.z = closedAngle;
    gate.add(new THREE.Mesh(gateGeo, material));
    // Skruvlåset på grinden
    const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.09, 12), material);
    sleeve.position.y = length - 0.07;
    gate.children[0].add(sleeve);
    group.add(gate);

    return { group, gate, material, closedAngle, openAngle: closedAngle + 0.6 };
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
