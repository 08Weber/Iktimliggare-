// Bakgrundsvärlden: en oljerigg till havs om natten med brinnande fackla, fler riggar i fjärran
// och klättrare som hänger i rep runt om. Scrollar du nedåt i appen sänks kameran längs riggen.
import * as THREE from 'three';
import { createView, makeEnvironment, dotTexture, damp, COLORS } from './common.js';
import { buildRig, createFlare, createSea, DECK_Y, HULL_FRONT, INTRO_X } from './rig.js';
import { createIntroClimber, createHangers } from './climber.js';

const FOG = new THREE.Color('#07080c');
const SKY_TOP = new THREE.Color('#050913');
const HORIZON_IDLE = new THREE.Color('#6a300a');
const HORIZON_ACTIVE = new THREE.Color('#0a4a33');
const DUST_IDLE = new THREE.Color('#ffd28a');
const DUST_ACTIVE = new THREE.Color('#9ff5d0');

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
    scene.fog = new THREE.FogExp2(FOG, 0.0045);
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 1400);
    const env = makeEnvironment(renderer);
    const dot = dotTexture();

    // ---------- Himmel med glöd vid horisonten ----------
    const skyUniforms = { uTop: { value: SKY_TOP.clone() }, uHorizon: { value: HORIZON_IDLE.clone() } };
    const sky = new THREE.Mesh(
        new THREE.SphereGeometry(900, 32, 16),
        new THREE.ShaderMaterial({
            uniforms: skyUniforms,
            side: THREE.BackSide,
            depthWrite: false,
            fog: false,
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
                    // Smal varm rand vid horisonten + svagt sken högre upp
                    float h = clamp(abs(vDir.y - 0.01), 0.0, 1.0);
                    float glow = 0.75 * pow(1.0 - h, 60.0) + 0.25 * pow(1.0 - h, 10.0);
                    gl_FragColor = vec4(mix(uTop, uHorizon, glow), 1.0);
                    #include <colorspace_fragment>
                }`,
        })
    );
    sky.renderOrder = -2;
    scene.add(sky);
    const stars = makeStars(dot);
    scene.add(stars);

    const sea = createSea();
    scene.add(sea.mesh);
    scene.add(makeShipLights(dot));

    // ---------- Ljus ----------
    scene.add(new THREE.HemisphereLight('#8a9ad0', '#1a0f06', 0.55));
    const moon = new THREE.DirectionalLight('#aebcff', 1.3);
    moon.position.set(-60, 90, 70);
    scene.add(moon);
    const flood = new THREE.PointLight('#ffd7a0', 500, 0, 2);
    flood.position.set(-2, DECK_Y + 16, 24);
    scene.add(flood);
    // Fyllnadsljus i läges-färgen som lyser upp klättraren framifrån i introt
    const accent = new THREE.PointLight(COLORS.amber.clone(), 45, 22, 2);
    accent.position.set(INTRO_X - 1.5, DECK_Y + 2.6, HULL_FRONT - 3.2);
    scene.add(accent);

    // ---------- Riggen och fler riggar i fjärran ----------
    const rig = buildRig(env, dot);
    scene.add(rig.group);
    sea.uniforms.uFlarePos.value.copy(rig.flareTip);

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
    rig.beacons.forEach(p => addBeacon(p, 3, 0, true));

    const farFlares = [];
    [[-330, -480, 0.6], [430, -640, -0.4], [-640, -170, 1.2]].forEach(([x, z, rotY], i) => {
        const far = new THREE.Group();
        far.position.set(x, 0, z);
        far.rotation.y = rotY;
        rig.group.children.forEach(child => { if (child !== rig.flare.group) far.add(child.clone()); });
        scene.add(far);
        far.updateMatrixWorld(true);
        const flare = createFlare(far.localToWorld(rig.flareTip.clone()), dot, false);
        scene.add(flare.group);
        farFlares.push(flare);
        rig.beacons.slice(0, 4).forEach(p => addBeacon(far.localToWorld(p.clone()), 9, i * 1.7 + 0.6, false));
    });

    // ---------- Klättrare som hänger runt riggen ----------
    createHangers(scene, env, dot, rig.hangSpots);

    // ---------- Introts klättrare med lina och karbin ----------
    const climber = createIntroClimber(scene, env, dot);

    // ---------- Damm/saltstänk som driver förbi ----------
    const dust = makeDust(dot, state.reduced ? 0 : 520);
    scene.add(dust.points);

    // ---------- Kameran ----------
    const camPos = new THREE.Vector3();
    const camLook = new THREE.Vector3();
    const goalPos = new THREE.Vector3();
    const goalLook = new THREE.Vector3();
    let override = null;

    // Viloläget: riggen snett framifrån med facklan och benen i bild.
    function restPose(outPos, outLook) {
        const aspect = view.width / Math.max(1, view.height);
        const wide = THREE.MathUtils.clamp((aspect - 0.6) / 1.2, 0, 1);
        outPos.set(-40 - wide * 22, 46, 92 + wide * 30);
        outLook.set(2 + wide * 4, 43, 0);
    }

    view.resize = (w, h) => {
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
    };
    view.measure();
    restPose(camPos, camLook);
    camPos.y += 10; // vid start "landar" kameran mjukt på plats
    camLook.y += 6;

    view.frame = (dt, t) => {
        const mode = state.mode;
        skyUniforms.uHorizon.value.lerpColors(HORIZON_IDLE, HORIZON_ACTIVE, mode);
        sea.uniforms.uHorizon.value.copy(skyUniforms.uHorizon.value);
        accent.color.lerpColors(COLORS.amber, COLORS.emerald, mode);
        dust.material.color.lerpColors(DUST_IDLE, DUST_ACTIVE, mode);

        const flicker = state.reduced ? 0.9 : rig.flare.update(t);
        if (!state.reduced) farFlares.forEach((f, i) => f.update(t + i * 3.1));
        sea.uniforms.uFlare.value = flicker;
        sea.uniforms.uTime.value = state.reduced ? 0 : t;

        for (const b of beacons) {
            const k = state.reduced ? 0.6 : Math.pow(Math.max(0, Math.sin(t * 2.2 + b.userData.phase)), 8);
            b.material.opacity = 0.12 + 0.88 * k;
            b.scale.setScalar(b.userData.size * (0.65 + 0.5 * k));
        }

        if (!state.reduced) {
            dust.update(dt, t);
        }
        climber.update(t, state.reduced);

        if (override) {
            camPos.copy(override.pos);
            camLook.copy(override.look);
        } else {
            restPose(goalPos, goalLook);
            const descend = Math.min(state.scroll, 2600) * 0.0075;
            const px = state.pointer.x + state.gyro.x;
            const py = state.pointer.y + state.gyro.y;
            goalPos.x += px * 3;
            goalPos.y += py * 2 - descend;
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
        restPose,
        climber,
        setOverride(o) { override = o; },
        getCamera() { return { pos: camPos.clone(), look: camLook.clone() }; },
    };
}

function makeStars(dot) {
    const count = 520;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
        const theta = Math.random() * Math.PI * 2;
        const y = 0.08 + Math.pow(Math.random(), 0.8) * 0.92;
        const r = Math.sqrt(1 - y * y);
        positions.set([Math.cos(theta) * r * 800, y * 800, Math.sin(theta) * r * 800], i * 3);
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

// Fartyg och bojar långt ut till havs
function makeShipLights(dot) {
    const positions = [];
    const colors = [];
    const palette = ['#fff4e0', '#ffd9a0', '#ff4d4d', '#4ade80'].map(c => new THREE.Color(c));
    for (let s = 0; s < 9; s++) {
        const a = Math.random() * Math.PI * 2;
        const d = 260 + Math.random() * 420;
        const x = Math.cos(a) * d, z = -Math.abs(Math.sin(a) * d);
        const n = 3 + Math.floor(Math.random() * 6);
        for (let i = 0; i < n; i++) {
            positions.push(x + i * 2.5, 2 + Math.random() * 4, z);
            const c = palette[i === 0 ? 2 + (s % 2) : Math.floor(Math.random() * 2)];
            colors.push(c.r, c.g, c.b);
        }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    return new THREE.Points(geometry, new THREE.PointsMaterial({
        map: dot, size: 3, vertexColors: true, transparent: true, depthWrite: false,
        blending: THREE.AdditiveBlending, fog: false, toneMapped: false,
    }));
}

function makeDust(dot, count) {
    const positions = new Float32Array(count * 3);
    const speed = new Float32Array(count);
    const phase = new Float32Array(count);
    for (let i = 0; i < count; i++) {
        positions.set([(Math.random() - 0.5) * 120, 5 + Math.random() * 90, -40 + Math.random() * 130], i * 3);
        speed[i] = 0.4 + Math.random();
        phase[i] = Math.random() * Math.PI * 2;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const material = new THREE.PointsMaterial({
        map: dot, size: 0.3, sizeAttenuation: true, color: DUST_IDLE.clone(), transparent: true,
        opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending,
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
