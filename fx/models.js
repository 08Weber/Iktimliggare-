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
