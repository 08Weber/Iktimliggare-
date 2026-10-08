// Oljeriggen (jack-up): fyra fackverksben, skrov, borrtorn på cantilever, bostadsmodul med
// helikopterdäck, kranar, livbåtar, en brinnande fackla – och havet runt omkring.
// Statiska delar slås ihop till några få ritanrop så att det går lätt även på telefon.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { buildMembers } from './models.js';
import { canvasTexture } from './common.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
export const DECK_Y = 26;
export const HULL_FRONT = 19;
export const INTRO_X = -4;       // där introts klättrare hakar i sig

// Samlar enkla former med egen färg och slår ihop dem till en mesh.
class Batch {
    constructor() { this.geometries = []; }
    add(geometry, color, pos = V(0, 0, 0), rot = new THREE.Euler(), scale = V(1, 1, 1)) {
        const g = geometry.clone().applyMatrix4(
            new THREE.Matrix4().compose(pos, new THREE.Quaternion().setFromEuler(rot), scale));
        const c = new THREE.Color(color);
        const colors = new Float32Array(g.attributes.position.count * 3);
        for (let i = 0; i < colors.length; i += 3) colors.set([c.r, c.g, c.b], i);
        g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        this.geometries.push(g);
    }
    box(w, h, d, x, y, z, color) { this.add(new THREE.BoxGeometry(w, h, d), color, V(x, y, z)); }
    build(material) { return new THREE.Mesh(mergeGeometries(this.geometries), material); }
}

// Triangulärt fackverk längs en godtycklig axel (ben, bommar).
function triLattice(members, a, b, width, segLen, chordR, braceR) {
    const axis = new THREE.Vector3().subVectors(b, a);
    const len = axis.length();
    axis.normalize();
    const helper = Math.abs(axis.y) < 0.9 ? V(0, 1, 0) : V(1, 0, 0);
    const u = new THREE.Vector3().crossVectors(axis, helper).normalize();
    const w = new THREE.Vector3().crossVectors(axis, u).normalize();
    const r = width / Math.sqrt(3);
    const offsets = [0, 1, 2].map(i => {
        const ang = (i / 3) * Math.PI * 2 + Math.PI / 2;
        return u.clone().multiplyScalar(Math.cos(ang) * r).add(w.clone().multiplyScalar(Math.sin(ang) * r));
    });
    const n = Math.max(1, Math.round(len / segLen));
    const P = (i, k) => a.clone().addScaledVector(axis, (len * i) / n).add(offsets[k]);
    for (let i = 0; i < n; i++) {
        for (let k = 0; k < 3; k++) {
            const kn = (k + 1) % 3;
            members.push([P(i, k), P(i + 1, k), chordR]);
            members.push([P(i, k), P(i + 1, kn), braceR]);
            if (i % 2 === 0) members.push([P(i, k), P(i, kn), braceR]);
        }
    }
}

// Fyrkantigt, avsmalnande fackverk (borrtornet).
function squareTower(members, cx, cz, y0, y1, half0, half1, segments, legR, braceR) {
    const half = y => half0 + (half1 - half0) * ((y - y0) / (y1 - y0));
    const corner = (y, k) => {
        const h = half(y);
        return V(cx + (k === 1 || k === 2 ? h : -h), y, cz + (k >= 2 ? h : -h));
    };
    const seg = (y1 - y0) / segments;
    for (let i = 0; i < segments; i++) {
        const ya = y0 + i * seg, yb = ya + seg;
        for (let k = 0; k < 4; k++) {
            const n = (k + 1) % 4;
            members.push([corner(ya, k), corner(yb, k), legR]);
            members.push([corner(ya, k), corner(yb, n), braceR]);
            members.push([corner(ya, n), corner(yb, k), braceR]);
            members.push([corner(yb, k), corner(yb, n), braceR]);
        }
    }
    return half;
}

function windowTexture(cols, rows, base) {
    const lit = [];
    const map = canvasTexture(256, 256, (ctx, w, h) => {
        ctx.fillStyle = base;
        ctx.fillRect(0, 0, w, h);
        const cw = w / cols, rh = h / rows;
        for (let r = 0; r < rows; r++) {
            ctx.fillStyle = 'rgba(0,0,0,0.25)';
            ctx.fillRect(0, r * rh + rh - 4, w, 4);
            for (let c = 0; c < cols; c++) {
                const x = c * cw + cw * 0.22, y = r * rh + rh * 0.3, ww = cw * 0.56, wh = rh * 0.36;
                ctx.fillStyle = '#10141c';
                ctx.fillRect(x, y, ww, wh);
                lit.push({ x, y, ww, wh, on: Math.random() < 0.45 });
            }
        }
    });
    const emissiveMap = canvasTexture(256, 256, (ctx, w, h) => {
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = '#ffd08a';
        lit.filter(l => l.on).forEach(l => ctx.fillRect(l.x + 1, l.y + 1, l.ww - 2, l.wh - 2));
    });
    return { map, emissiveMap };
}

function hullTexture() {
    const texture = canvasTexture(512, 128, (ctx, w, h) => {
        ctx.fillStyle = '#353b46';
        ctx.fillRect(0, 0, w, h);
        for (let i = 0; i < 3000; i++) {
            ctx.fillStyle = `rgba(${Math.random() < 0.5 ? '255,255,255' : '120,60,20'},${Math.random() * 0.05})`;
            ctx.fillRect(Math.random() * w, Math.random() * h, 2, 3 + Math.random() * 10);
        }
        ctx.strokeStyle = 'rgba(0,0,0,0.35)';
        ctx.lineWidth = 2;
        for (let y = 32; y < h; y += 32) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
        for (let x = 0; x < w; x += 64) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
        // Gul-svart varningsrand längs däckskanten
        for (let x = 0; x < w; x += 24) {
            ctx.fillStyle = (x / 24) % 2 ? '#111' : '#eab308';
            ctx.fillRect(x, 0, 24, 7);
        }
    });
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(4, 1);
    return texture;
}

function helideckTexture() {
    return canvasTexture(256, 256, (ctx, w, h) => {
        ctx.fillStyle = '#26332c';
        ctx.fillRect(0, 0, w, h);
        ctx.strokeStyle = '#facc15';
        ctx.lineWidth = 9;
        ctx.beginPath();
        ctx.arc(128, 128, 70, 0, Math.PI * 2);
        ctx.stroke();
        ctx.strokeStyle = '#f4f4f5';
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.arc(128, 128, 118, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = '#f4f4f5';
        ctx.font = '900 96px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('H', 128, 132);
    });
}

// Facklan: flera flimrande glödsprites + ett ljus som fladdrar över riggen och havet.
export function createFlare(tip, dot, withLight) {
    const group = new THREE.Group();
    group.position.copy(tip);
    const flames = [];
    const add = (color, size, y, opacity = 1) => {
        const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
            map: dot, color, transparent: true, opacity, depthWrite: false,
            blending: THREE.AdditiveBlending, toneMapped: false, fog: false,
        }));
        sprite.position.y = y;
        group.add(sprite);
        flames.push({ sprite, size, y, seed: Math.random() * 10 });
    };
    add('#ff5a00', 30, 4, 0.35); // halo
    add('#ff6a00', 10, 3.2);
    add('#ff9a1f', 7, 2.4);
    add('#ffc457', 4.2, 1.5);
    add('#fff3c4', 2, 0.7);
    const light = withLight ? new THREE.PointLight('#ff8a2a', 2600, 0, 2) : null;
    if (light) {
        light.position.y = 3;
        group.add(light);
    }
    return {
        group, light,
        update(t) {
            const f = 0.82 + 0.1 * Math.sin(t * 11) + 0.06 * Math.sin(t * 27 + 1.3) + 0.05 * Math.sin(t * 4.3);
            for (const fl of flames) {
                const wobble = 1 + 0.12 * Math.sin(t * 9 + fl.seed) + 0.08 * Math.sin(t * 23 + fl.seed * 2);
                fl.sprite.scale.set(fl.size * 0.7 * wobble, fl.size * f * wobble * 1.1, 1);
                fl.sprite.position.set(fl.y * 0.35 + Math.sin(t * 3 + fl.seed) * 0.2, fl.y * f, 0); // vinden lutar lågan
            }
            if (light) light.intensity = 2600 * f;
            return f;
        },
    };
}

export function buildRig(env, dot, { withLights = true } = {}) {
    const members = [];
    const batch = new Batch();
    const group = new THREE.Group();

    // ---------- Ben ----------
    const LEGS = [[-19, -15], [19, -15], [-19, 15], [19, 15]];
    LEGS.forEach(([x, z]) => triLattice(members, V(x, -14, z), V(x, 96, z), 4.2, 3.4, 0.3, 0.1));

    // ---------- Skrov och benhus ----------
    const hull = new THREE.Mesh(
        new THREE.BoxGeometry(48, 7, HULL_FRONT * 2),
        new THREE.MeshStandardMaterial({ map: hullTexture(), roughness: 0.75, metalness: 0.3 })
    );
    hull.position.set(0, DECK_Y - 3.5, 0);
    group.add(hull);
    LEGS.forEach(([x, z]) => batch.box(7, 7, 7, x, DECK_Y + 3.5, z, '#a16207'));

    // ---------- Processmoduler, tankar och rör på däck ----------
    [
        [10, 5, 8, 2, -8, '#52525b'], [8, 7, 6, 10, -5, '#71717a'], [6, 4, 10, -5, -9, '#3f3f46'],
        [12, 3, 6, 4, 5, '#57534e'], [5, 9, 5, 13, 6, '#a1a1aa'], [7, 3.5, 5, -6, 2, '#64748b'],
        [4, 6, 4, -1, -14, '#78716c'],
    ].forEach(([w, h, d, x, z, c]) => batch.box(w, h, d, x, DECK_Y + h / 2, z, c));
    const tank = new THREE.CylinderGeometry(1.4, 1.4, 8, 14);
    [[-2, 10, '#e4e4e7'], [-2, 13.5, '#d4d4d8'], [7, 12, '#cbd5e1']].forEach(([x, z, c]) =>
        batch.add(tank, c, V(x, DECK_Y + 1.5, z), new THREE.Euler(0, 0, Math.PI / 2)));
    const pipe = new THREE.CylinderGeometry(0.25, 0.25, 30, 8);
    [-1, 0, 1].forEach(i => batch.add(pipe, '#9ca3af', V(4, DECK_Y + 0.6 + i * 0.6, -1.5 + i * 0.6), new THREE.Euler(0, 0, Math.PI / 2)));

    // ---------- Bostadsmodul + helikopterdäck ----------
    const accTex = windowTexture(6, 4, '#d4d4d8');
    const walls = new THREE.MeshStandardMaterial({ ...accTex, emissive: '#ffffff', emissiveIntensity: 1.1, roughness: 0.7 });
    const roof = new THREE.MeshStandardMaterial({ color: '#a1a1aa', roughness: 0.8 });
    const acc = new THREE.Mesh(new THREE.BoxGeometry(13, 10, 15), [walls, walls, roof, roof, walls, walls]);
    acc.position.set(-16.5, DECK_Y + 5, 6);
    group.add(acc);
    const helideck = new THREE.Mesh(
        new THREE.CylinderGeometry(8.5, 8.5, 0.5, 8),
        new THREE.MeshStandardMaterial({ map: helideckTexture(), roughness: 0.8 })
    );
    helideck.position.set(-27, DECK_Y + 11.3, 6);
    helideck.rotation.y = Math.PI / 8;
    group.add(helideck);
    [0, 6, 12].forEach(z => members.push([V(-23, DECK_Y + 3, z), V(-31, DECK_Y + 11, z), 0.2]));

    // ---------- Borrtorn på cantilever ----------
    batch.box(14, 4, 14, 27, DECK_Y + 2, 0, '#4b5563');
    batch.box(9, 2.5, 9, 28, DECK_Y + 5.25, 0, '#6b7280');
    const derrickHalf = squareTower(members, 28, 0, DECK_Y + 6.5, DECK_Y + 46, 3.2, 1.0, 12, 0.18, 0.07);
    batch.box(3, 2.2, 3, 28, DECK_Y + 47.2, 0, '#e5e7eb');

    // ---------- Fackelbom ----------
    const flareTip = V(46, DECK_Y + 24, -40);
    triLattice(members, V(22, DECK_Y - 1, -19), flareTip, 2.2, 2.6, 0.12, 0.05);

    // ---------- Kranar ----------
    const craneTips = [];
    const crane = (base, tip) => {
        batch.add(new THREE.CylinderGeometry(1.4, 1.6, 7, 14), '#d97706', V(base.x, base.y + 3.5, base.z));
        batch.box(3, 2.4, 3.6, base.x, base.y + 8.2, base.z, '#f59e0b');
        triLattice(members, V(base.x, base.y + 8, base.z), tip, 1.4, 2, 0.08, 0.035);
        members.push([tip, V(tip.x, tip.y - 14, tip.z), 0.03]);
        craneTips.push(tip);
    };
    crane(V(10, DECK_Y, 16.5), V(-4, DECK_Y + 25, 30));
    crane(V(-8, DECK_Y, -17), V(6, DECK_Y + 24, -32));

    // ---------- Livbåtar på skrovets framsida ----------
    const boat = new THREE.CapsuleGeometry(1.3, 5, 4, 14);
    [-17, -11].forEach(x => {
        batch.add(boat, '#f97316', V(x, DECK_Y - 2.4, HULL_FRONT + 1.6), new THREE.Euler(0, 0, Math.PI / 2), V(1, 1, 0.85));
        batch.box(5, 0.4, 2.2, x, DECK_Y - 1.1, HULL_FRONT + 1.6, '#e5e7eb');
        [-2.5, 2.5].forEach(dx => members.push([V(x + dx, DECK_Y, HULL_FRONT - 0.2), V(x + dx, DECK_Y - 1, HULL_FRONT + 1.8), 0.08]));
    });

    // ---------- Räcke längs framkanten (med en öppning vid linan) ----------
    const RAIL_Z = HULL_FRONT - 0.2;
    const inGap = x => Math.abs(x - INTRO_X) < 1.2;
    for (let x = -23; x <= 23; x += 2) {
        if (!inGap(x)) members.push([V(x, DECK_Y, RAIL_Z), V(x, DECK_Y + 1.1, RAIL_Z), 0.03]);
        if (x < 23 && !inGap(x) && !inGap(x + 2)) {
            members.push([V(x, DECK_Y + 1.1, RAIL_Z), V(x + 2, DECK_Y + 1.1, RAIL_Z), 0.03]);
            members.push([V(x, DECK_Y + 0.55, RAIL_Z), V(x + 2, DECK_Y + 0.55, RAIL_Z), 0.025]);
        }
    }


    const steel = new THREE.MeshStandardMaterial({ color: '#8b9099', metalness: 0.55, roughness: 0.45 });
    group.add(buildMembers(members, steel));
    group.add(batch.build(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, metalness: 0.2 })));

    // ---------- Lampor ----------
    const lightPositions = [];
    const lightColors = [];
    const sodium = new THREE.Color('#ffb35c'), white = new THREE.Color('#fff3dd'), green = new THREE.Color('#4ade80');
    const lamp = (p, c = sodium) => { lightPositions.push(p.x, p.y, p.z); lightColors.push(c.r, c.g, c.b); };
    for (let x = -24; x <= 24; x += 3) { lamp(V(x, DECK_Y + 0.3, HULL_FRONT + 0.1)); lamp(V(x, DECK_Y + 0.3, -HULL_FRONT - 0.1)); }
    for (let z = -18; z <= 18; z += 3) { lamp(V(24.1, DECK_Y + 0.3, z)); lamp(V(-24.1, DECK_Y + 0.3, z)); }
    LEGS.forEach(([x, z]) => {
        lamp(V(x, DECK_Y + 7.3, z), white);
        for (let y = 40; y < 96; y += 12) lamp(V(x + 2.3, y, z), sodium);
    });
    for (let y = DECK_Y + 10; y < DECK_Y + 46; y += 5) {
        const h = derrickHalf(y);
        lamp(V(28 + h, y, h), white);
        lamp(V(28 - h, y, -h), white);
    }
    for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        lamp(V(-27 + Math.cos(a) * 8.6, DECK_Y + 11.6, 6 + Math.sin(a) * 8.6), green);
    }
    [[-23, 4], [-23, 8], [-10, 4], [-10, 8]].forEach(([x, z]) => lamp(V(x, DECK_Y + 10.2, z), white));
    const lightsGeo = new THREE.BufferGeometry();
    lightsGeo.setAttribute('position', new THREE.Float32BufferAttribute(lightPositions, 3));
    lightsGeo.setAttribute('color', new THREE.Float32BufferAttribute(lightColors, 3));
    group.add(new THREE.Points(lightsGeo, new THREE.PointsMaterial({
        map: dot, size: 1.3, vertexColors: true, transparent: true, depthWrite: false,
        blending: THREE.AdditiveBlending, fog: false, toneMapped: false,
    })));

    // Flyghinderljus: bentoppar, borrtornet och kranarna
    const beacons = [
        ...LEGS.map(([x, z]) => V(x, 96.6, z)),
        V(28, DECK_Y + 48.6, 0),
        ...craneTips.map(t => t.clone().add(V(0, 0.6, 0))),
    ];

    const flare = createFlare(flareTip, dot, withLights);
    group.add(flare.group);

    // Platser där klättrare hänger runt riggen: punkt på ytan i bäckenhöjd, ytans normal (utåt) och
    // hur långt upp repen går till ankaret. På benen står fötterna mot ett av benens rör (radie 0,3).
    const chord = (cx, cz, y, nx, nz, drop) => ({ wall: V(cx + nx * 0.3, y, cz + nz * 0.3), normal: V(nx, 0, nz), drop });
    const hangSpots = [
        chord(-21.42, 15, 62, -1, 0, 5),
        chord(-17.79, 17.1, 48, 0.5, 0.866, 5),
        chord(-17.79, -12.9, 74, 0.5, 0.866, 4),
        chord(20.21, 17.1, 56, 0.5, 0.866, 4.5),
        { wall: V(15, DECK_Y - 4, HULL_FRONT), normal: V(0, 0, 1), drop: 4.4 },
        { wall: V(-17, DECK_Y + 5.5, 13.5), normal: V(0, 0, 1), drop: 4.6 },
        { wall: V(-21, DECK_Y + 4, 18.5), normal: V(0, 0, 1), drop: 3.1 },
    ];

    return { group, flare, beacons, hangSpots, flareTip };
}

// Havet: vågnormaler i shadern, spegling av horisonten och facklans glitter.
export function createSea() {
    const uniforms = {
        uTime: { value: 0 },
        uDeep: { value: new THREE.Color('#030812') },
        uHorizon: { value: new THREE.Color('#5a2a0a') },
        uFlarePos: { value: new THREE.Vector3() },
        uFlareColor: { value: new THREE.Color('#ff8a2a') },
        uFlare: { value: 1 },
        uDeckPos: { value: V(0, 34, 6) },
        uDeckColor: { value: new THREE.Color('#ffc27a') },
        uFogDensity: { value: 0.0045 },
    };
    const material = new THREE.ShaderMaterial({
        uniforms,
        fog: false,
        vertexShader: /* glsl */`
            varying vec3 vWorld;
            void main() {
                vec4 world = modelMatrix * vec4(position, 1.0);
                vWorld = world.xyz;
                gl_Position = projectionMatrix * viewMatrix * world;
            }`,
        fragmentShader: /* glsl */`
            uniform float uTime, uFlare, uFogDensity;
            uniform vec3 uDeep, uHorizon, uFlarePos, uFlareColor, uDeckPos, uDeckColor;
            varying vec3 vWorld;

            vec2 wave(vec2 p, vec2 d, float k, float a, float s) {
                return d * k * a * cos(dot(d, p) * k + uTime * s);
            }

            void main() {
                float dist = length(cameraPosition - vWorld);
                vec2 p = vWorld.xz;
                vec2 g = wave(p, vec2(0.80, 0.60), 0.50, 0.22, 1.40)
                       + wave(p, vec2(-0.55, 0.83), 0.90, 0.10, 1.80)
                       + wave(p, vec2(0.20, -0.98), 1.80, 0.045, 2.50)
                       + wave(p, vec2(-0.92, -0.38), 3.40, 0.022, 3.40);
                g /= 1.0 + dist * 0.012; // mjukare långt bort (inget flimmer)
                vec3 N = normalize(vec3(-g.x, 1.0, -g.y));
                vec3 V = normalize(cameraPosition - vWorld);
                float fres = pow(1.0 - max(dot(N, V), 0.0), 5.0);
                vec3 col = mix(uDeep, uHorizon * 0.55, clamp(fres, 0.0, 1.0));
                vec3 R = reflect(-V, N);
                col += uFlareColor * pow(max(dot(R, normalize(uFlarePos - vWorld)), 0.0), 90.0) * uFlare * 2.6;
                col += uDeckColor * pow(max(dot(R, normalize(uDeckPos - vWorld)), 0.0), 60.0) * 0.7;
                float fog = 1.0 - exp(-pow(uFogDensity * dist, 2.0));
                col = mix(col, uHorizon * 0.45, fog);
                gl_FragColor = vec4(col, 1.0);
                #include <colorspace_fragment>
            }`,
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2400, 2400), material);
    mesh.rotation.x = -Math.PI / 2;
    return { mesh, uniforms };
}
