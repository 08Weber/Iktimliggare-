// Bakgrundsvärlden: en telemast i nattdis med flyghinderljus, rep, stadsljus och svävande damm.
// Scrollar du nedåt i appen firar sig kameran ned längs masten.
import * as THREE from 'three';
import { createView, makeEnvironment, dotTexture, damp, COLORS } from './common.js';
import { buildMast, buildRope, buildCarabiner } from './models.js';

const FOG = new THREE.Color('#07080c');
const SKY_TOP = new THREE.Color('#040509');
const HORIZON_IDLE = new THREE.Color('#5a2a0a');
const HORIZON_ACTIVE = new THREE.Color('#0a4a33');
const DUST_IDLE = new THREE.Color('#ffd28a');
const DUST_ACTIVE = new THREE.Color('#9ff5d0');
const BINER_Y = 46;

export function createBackground(canvas, state) {
    const view = createView(canvas, {
        maxPixelRatio: 1.5,
        antialias: false,
        alwaysVisible: true,
        fps: () => {
            if (state.reduced) return 2;
            if (state.introRunning || performance.now() - state.scrollAt < 500) return 60;
            return 30;
        },
    });
    const { renderer } = view;
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(FOG, 0.0105);
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 900);
    const env = makeEnvironment(renderer);
    const dot = dotTexture();

    // ---------- Himmel med glöd vid horisonten ----------
    const skyUniforms = { uTop: { value: SKY_TOP.clone() }, uHorizon: { value: HORIZON_IDLE.clone() } };
    const sky = new THREE.Mesh(
        new THREE.SphereGeometry(500, 32, 16),
        new THREE.ShaderMaterial({
            uniforms: skyUniforms,
            side: THREE.BackSide,
            depthWrite: false,
            fog: false,
            toneMapped: false,
            vertexShader: /* glsl */`
                varying vec3 vDir;
                void main() {
                    vDir = normalize(position);
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }`,
            fragmentShader: /* glsl */`
                uniform vec3 uTop;
                uniform vec3 uHorizon;
                varying vec3 vDir;
                void main() {
                    float h = vDir.y;
                    float glow = pow(1.0 - clamp(abs(h - 0.02), 0.0, 1.0), 9.0);
                    vec3 col = mix(uTop, uHorizon, glow);
                    gl_FragColor = vec4(col, 1.0);
                    #include <colorspace_fragment>
                }`,
        })
    );
    sky.renderOrder = -2;
    scene.add(sky);

    const stars = makeStars(dot);
    scene.add(stars);

    const ground = new THREE.Mesh(
        new THREE.CircleGeometry(700, 48),
        new THREE.MeshStandardMaterial({ color: '#0b0b0e', roughness: 1 })
    );
    ground.rotation.x = -Math.PI / 2;
    scene.add(ground);
    scene.add(makeCityLights(dot));

    // ---------- Ljus ----------
    scene.add(new THREE.HemisphereLight('#8a9ad0', '#1a0f06', 0.7));
    const moon = new THREE.DirectionalLight('#aebcff', 1.6);
    moon.position.set(-40, 90, 50);
    scene.add(moon);
    const accent = new THREE.PointLight(COLORS.amber.clone(), 70, 34, 1.5);
    accent.position.set(9, 50, 9);
    scene.add(accent);
    const beaconLight = new THREE.PointLight('#ff3b2f', 0, 18, 1.4);
    scene.add(beaconLight);

    // ---------- Masterna ----------
    const steel = new THREE.MeshStandardMaterial({ color: '#7a7a86', metalness: 0.55, roughness: 0.48 });
    const panelMat = new THREE.MeshStandardMaterial({ color: '#b4b4bd', metalness: 0.3, roughness: 0.5, side: THREE.DoubleSide });
    const mast = buildMast(steel, panelMat);
    scene.add(mast.group);
    beaconLight.position.copy(mast.beacons[0]);

    const beacons = [];
    const addBeacon = (pos, size, phase, fog) => {
        const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
            map: dot, color: '#ff3b2f', transparent: true, depthWrite: false,
            blending: THREE.AdditiveBlending, fog, toneMapped: false,
        }));
        sprite.position.copy(pos);
        sprite.userData = { size, phase };
        scene.add(sprite);
        beacons.push(sprite);
    };
    mast.beacons.forEach((p, i) => addBeacon(p, i === 0 ? 2.6 : 1.6, 0, true));

    // Fler master långt bort – bara silhuetter mot horisontglöden och blinkande ljus
    [[-70, -150, 1.1], [115, -215, 1.3], [-190, -95, 0.9], [55, -330, 1.6], [210, -60, 1.0]].forEach(([x, z, s], i) => {
        const far = mast.group.clone();
        far.position.set(x, 0, z);
        far.scale.setScalar(s);
        scene.add(far);
        addBeacon(mast.beacons[0].clone().multiplyScalar(s).add(new THREE.Vector3(x, 0, z)), 5 * s, i * 1.7 + 0.6, false);
    });

    // ---------- Repen och karbinhaken ----------
    const ropes = new THREE.Group();
    ropes.position.copy(mast.boomTip);
    scene.add(ropes);
    const ropeLength = mast.boomTip.y - 0.2;
    const ropeA = buildRope({ length: ropeLength, base: '#f59e0b', stripe: '#7c2d12' });
    ropeA.position.z = 0.12;
    const ropeB = buildRope({ length: ropeLength, base: '#e4e4e7', stripe: '#1d4ed8' });
    ropeB.position.z = -0.14;
    ropes.add(ropeA, ropeB);

    const biner = buildCarabiner(env);
    biner.group.scale.setScalar(1.6);
    biner.home = new THREE.Vector3(-0.02, BINER_Y - mast.boomTip.y, 0.1);
    // Lutad så att repet går genom öglan men sidan ändå vänds mot kameran i introt
    biner.homeRotation = new THREE.Euler(-0.85, 0.55, 0.15);
    biner.group.position.copy(biner.home);
    biner.group.rotation.copy(biner.homeRotation);
    ropes.add(biner.group);

    // ---------- Damm/snö som driver förbi ----------
    const dust = makeDust(dot, state.reduced ? 0 : 520);
    scene.add(dust.points);

    // ---------- Kameran ----------
    const camPos = new THREE.Vector3();
    const camLook = new THREE.Vector3();
    const goalPos = new THREE.Vector3();
    const goalLook = new THREE.Vector3();
    let override = null;

    // Viloläget: masten snett uppifrån, toppen med ljusen i övre delen av skärmen.
    function restPose(outPos, outLook) {
        const aspect = view.width / Math.max(1, view.height);
        const wide = THREE.MathUtils.clamp((aspect - 0.6) / 1.2, 0, 1);
        outPos.set(-15 - wide * 8, 47, 33 + wide * 6);
        outLook.set(3 - wide * 9, 59, 0);
    }

    view.resize = (w, h) => {
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
    };
    view.measure();
    restPose(camPos, camLook);
    camPos.y += 9;   // vid start "landar" kameran mjukt på plats
    camLook.y += 5;

    view.frame = (dt, t) => {
        const mode = state.mode;
        skyUniforms.uHorizon.value.lerpColors(HORIZON_IDLE, HORIZON_ACTIVE, mode);
        accent.color.lerpColors(COLORS.amber, COLORS.emerald, mode);
        dust.material.color.lerpColors(DUST_IDLE, DUST_ACTIVE, mode);

        // Flyghinderljusen blinkar mjukt; huvudmastens ljus lyser även upp toppen
        for (const b of beacons) {
            const k = state.reduced ? 0.6 : Math.pow(Math.max(0, Math.sin(t * 2.2 + b.userData.phase)), 8);
            b.material.opacity = 0.12 + 0.88 * k;
            b.scale.setScalar(b.userData.size * (0.65 + 0.5 * k));
        }
        beaconLight.intensity = state.reduced ? 10 : 40 * Math.pow(Math.max(0, Math.sin(t * 2.2)), 8);

        if (!state.reduced) {
            dust.update(dt, t);
            ropes.rotation.z = Math.sin(t * 0.4) * 0.0035;
            ropes.rotation.x = Math.sin(t * 0.31 + 1.3) * 0.003;
        }

        if (override) {
            camPos.copy(override.pos);
            camLook.copy(override.look);
        } else {
            restPose(goalPos, goalLook);
            const descend = Math.min(state.scroll, 2600) * 0.0075;
            const px = state.pointer.x + state.gyro.x;
            const py = state.pointer.y + state.gyro.y;
            goalPos.x += px * 2.4;
            goalPos.y += py * 1.5 - descend;
            goalLook.y -= descend;
            const k = state.reduced ? 1 : damp(dt, 2.2);
            camPos.lerp(goalPos, k);
            camLook.lerp(goalLook, k);
        }
        camera.position.copy(camPos);
        if (override?.shake) {
            camera.position.x += (Math.random() - 0.5) * override.shake;
            camera.position.y += (Math.random() - 0.5) * override.shake;
        }
        camera.lookAt(camLook);
        sky.position.copy(camera.position);
        stars.position.copy(camera.position);

        renderer.render(scene, camera);
    };

    return {
        tick: view.tick,
        biner,
        restPose,
        setOverride(o) { override = o; },
        // Punkter som introts kameraåkning utgår från
        anchors: {
            boomTip: mast.boomTip.clone(),
            biner: mast.boomTip.clone().add(biner.home),
            top: new THREE.Vector3(0, mast.height, 0),
        },
    };
}

function makeStars(dot) {
    const count = 520;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
        const theta = Math.random() * Math.PI * 2;
        const y = 0.08 + Math.pow(Math.random(), 0.8) * 0.92;
        const r = Math.sqrt(1 - y * y);
        positions.set([Math.cos(theta) * r * 450, y * 450, Math.sin(theta) * r * 450], i * 3);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const stars = new THREE.Points(geometry, new THREE.PointsMaterial({
        map: dot, size: 2.2, sizeAttenuation: false, color: '#cdd6ff', transparent: true,
        opacity: 0.75, depthWrite: false, fog: false,
    }));
    stars.renderOrder = -1;
    return stars;
}

// Stadsljus på marken: kluster och raka vägar, varma färger med inslag av kallt ljus.
function makeCityLights(dot) {
    const positions = [];
    const colors = [];
    const palette = ['#ffb44d', '#ffd9a0', '#fff1d6', '#ff9a3c', '#9cc7ff'].map(c => new THREE.Color(c));
    const pick = () => palette[Math.random() < 0.08 ? 4 : Math.floor(Math.random() * 4)];
    const push = (x, z) => {
        if (Math.hypot(x, z) < 45) return;
        positions.push(x, 0.15, z);
        const c = pick();
        colors.push(c.r, c.g, c.b);
    };
    for (let i = 0; i < 26; i++) {
        const a = Math.random() * Math.PI * 2;
        const d = 70 + Math.random() * 380;
        const cx = Math.cos(a) * d, cz = Math.sin(a) * d;
        const n = 30 + Math.floor(Math.random() * 90);
        for (let j = 0; j < n; j++) push(cx + (Math.random() - 0.5) * 60, cz + (Math.random() - 0.5) * 60);
    }
    for (let i = 0; i < 14; i++) {
        const a = Math.random() * Math.PI;
        const ox = (Math.random() - 0.5) * 500, oz = (Math.random() - 0.5) * 500;
        for (let s = -260; s < 260; s += 7) push(ox + Math.cos(a) * s, oz + Math.sin(a) * s);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    return new THREE.Points(geometry, new THREE.PointsMaterial({
        map: dot, size: 1.1, sizeAttenuation: true, vertexColors: true, transparent: true,
        opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    }));
}

function makeDust(dot, count) {
    const positions = new Float32Array(count * 3);
    const speed = new Float32Array(count);
    const phase = new Float32Array(count);
    for (let i = 0; i < count; i++) {
        positions.set([(Math.random() - 0.5) * 60, 5 + Math.random() * 90, -25 + Math.random() * 65], i * 3);
        speed[i] = 0.4 + Math.random();
        phase[i] = Math.random() * Math.PI * 2;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const material = new THREE.PointsMaterial({
        map: dot, size: 0.24, sizeAttenuation: true, color: DUST_IDLE.clone(), transparent: true,
        opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    const points = new THREE.Points(geometry, material);
    return {
        points,
        material,
        update(dt, t) {
            for (let i = 0; i < count; i++) {
                const j = i * 3;
                positions[j] += Math.sin(t * 0.6 + phase[i]) * 0.25 * dt;
                positions[j + 1] -= speed[i] * dt;
                if (positions[j + 1] < 3) positions[j + 1] = 95;
            }
            geometry.attributes.position.needsUpdate = true;
        },
    };
}
