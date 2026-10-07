// Periodens skyline: löneperioden som ett kvarter i 3D. En ruta per dag (rader = veckor,
// kolumner = mån–sön), tornets höjd = timmar. Dra i sidled för att snurra, tryck för detaljer.
import * as THREE from 'three';
import { createView, textTexture, fontsReady, easeOutBack, COLORS } from './common.js';

const CELL = 1.18;
const TILE = 0.86;
const H_PER_HOUR = 0.22;
const MIN_H = 0.06;
const MAX_DAYS = 42;

const C_FUTURE = new THREE.Color('#1c1c21');
const C_EMPTY = new THREE.Color('#34343c');
const C_TODAY = new THREE.Color('#52525b');
const C_LOW = new THREE.Color('#92400e');
const C_HIGH = new THREE.Color('#fbbf24');
const CAP_DIM = new THREE.Color('#3f3f46');
const CAP_SELECTED = new THREE.Color('#ffffff');

export function createSkyline(canvas, state, infoEl) {
    let busyUntil = 0;
    const view = createView(canvas, {
        alpha: true,
        fps: () => (state.reduced ? 2 : performance.now() < busyUntil ? 60 : 30),
        paused: () => state.introRunning,
    });
    const { renderer } = view;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);

    scene.add(new THREE.HemisphereLight('#c7d2fe', '#1a1206', 1.0));
    const sun = new THREE.DirectionalLight('#fff4e0', 2.2);
    sun.position.set(-5, 9, 6);
    scene.add(sun);
    const glow = new THREE.PointLight(COLORS.amber.clone(), 18, 14, 1.6);
    glow.position.set(0, 4, 0);
    scene.add(glow);

    const city = new THREE.Group();
    scene.add(city);

    const base = new THREE.Mesh(
        new THREE.BoxGeometry(1, 0.25, 1),
        new THREE.MeshStandardMaterial({ color: '#111115', roughness: 0.85, metalness: 0.2 })
    );
    base.position.y = -0.125;
    city.add(base);

    const towerGeo = new THREE.BoxGeometry(TILE, 1, TILE);
    towerGeo.translate(0, 0.5, 0);
    const towers = new THREE.InstancedMesh(
        towerGeo,
        new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.5, metalness: 0.25 }),
        MAX_DAYS
    );
    const capGeo = new THREE.BoxGeometry(TILE * 0.98, 0.04, TILE * 0.98);
    const caps = new THREE.InstancedMesh(capGeo, new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false }), MAX_DAYS);
    towers.count = caps.count = 0;
    city.add(towers, caps);

    // Ring runt dagens ruta
    const todayRing = new THREE.Mesh(
        new THREE.RingGeometry(0.62, 0.7, 4, 1),
        new THREE.MeshBasicMaterial({ color: COLORS.amber, transparent: true, toneMapped: false, side: THREE.DoubleSide, depthWrite: false })
    );
    todayRing.rotation.set(-Math.PI / 2, 0, Math.PI / 4);
    todayRing.visible = false;
    city.add(todayRing);

    const weekdayLabels = new THREE.Group();
    city.add(weekdayLabels);
    fontsReady().then(() => {
        ['M', 'T', 'O', 'T', 'F', 'L', 'S'].forEach((letter, col) => {
            const label = new THREE.Mesh(
                new THREE.PlaneGeometry(0.5, 0.25),
                new THREE.MeshBasicMaterial({ map: textTexture(letter, { width: 128, height: 64, size: 48 }), color: '#71717a', transparent: true, depthWrite: false })
            );
            label.rotation.x = -Math.PI / 2;
            label.userData.col = col;
            weekdayLabels.add(label);
        });
        layoutLabels();
    });

    // ---------- Data ----------
    let days = [];
    let rows = 5;
    let selected = -1;
    let current = new Float32Array(MAX_DAYS);
    let from = new Float32Array(MAX_DAYS);
    let animStart = -1;
    let hasGrown = false;
    const color = new THREE.Color();
    const matrix = new THREE.Matrix4();

    const cellPos = i => {
        const idx = i + (days[0]?.weekday ?? 0);
        const row = Math.floor(idx / 7);
        const col = idx % 7;
        return [(col - 3) * CELL, (row - (rows - 1) / 2) * CELL];
    };

    function layoutLabels() {
        const z = ((rows - 1) / 2) * CELL + CELL * 0.85;
        weekdayLabels.children.forEach(l => l.position.set((l.userData.col - 3) * CELL, 0.01, z));
    }

    function targetHeight(i) {
        const day = days[i];
        let hours = day.hours;
        // Dagens torn växer medan passet pågår
        if (day.isToday && state.active) hours += Math.max(0, (Date.now() - state.startMs) / 3600000);
        return day.isFuture ? MIN_H * 0.5 : MIN_H + hours * H_PER_HOUR;
    }

    function setData(period) {
        if (!period) return;
        const prev = days;
        days = period.days.slice(0, MAX_DAYS);
        rows = Math.ceil((days.length + (days[0]?.weekday ?? 0)) / 7);
        base.scale.set(7 * CELL + 0.5, 1, rows * CELL + 1.3);
        base.position.z = 0.2;
        layoutLabels();
        towers.count = caps.count = days.length;
        if (selected >= days.length || prev[selected]?.date !== days[selected]?.date) selected = -1;

        // Animera mot nya höjder (växer från noll första gången kortet syns)
        from = Float32Array.from(current);
        if (prev.length && prev[0]?.date !== days[0]?.date) from.fill(0);
        animStart = hasGrown ? performance.now() / 1000 : -1;
        busyUntil = performance.now() + 2000;
        updateInfo();
        view.force = true;
    }

    function updateInfo() {
        const day = days[selected];
        infoEl.innerHTML = day
            ? `<b>${day.title}</b> · ${day.detail}`
            : 'Tryck på en dag · dra för att snurra';
    }

    // ---------- Interaktion ----------
    let userRot = 0;
    let lastInteract = -10;
    let drag = null;
    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2();

    canvas.addEventListener('pointerdown', e => {
        drag = { x: e.clientX, y: e.clientY, rot: userRot, moved: false };
        if (e.pointerType === 'mouse') canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointermove', e => {
        if (!drag) return;
        const dx = e.clientX - drag.x;
        if (Math.abs(dx) > 6) drag.moved = true;
        if (drag.moved) {
            userRot = drag.rot + dx * 0.012;
            lastInteract = performance.now() / 1000;
            busyUntil = performance.now() + 600;
        }
    });
    canvas.addEventListener('pointerup', e => {
        if (drag && !drag.moved) pick(e);
        drag = null;
    });
    canvas.addEventListener('pointercancel', () => { drag = null; });

    function pick(e) {
        const r = canvas.getBoundingClientRect();
        ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
        raycaster.setFromCamera(ndc, camera);
        const hit = raycaster.intersectObject(towers)[0];
        selected = hit && hit.instanceId !== selected ? hit.instanceId : -1;
        lastInteract = performance.now() / 1000;
        busyUntil = performance.now() + 800;
        updateInfo();
    }

    // ---------- Rendering ----------
    let spin = 0;
    view.resize = (w, h) => {
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
    };
    view.measure();

    view.frame = (dt, t) => {
        const now = performance.now() / 1000;
        if (!hasGrown && days.length) {
            hasGrown = true;
            from.fill(0);
            animStart = now;
            busyUntil = performance.now() + 2500;
        }

        for (let i = 0; i < days.length; i++) {
            const target = targetHeight(i);
            let h = target;
            if (animStart >= 0) {
                const p = Math.min(1, Math.max(0, (now - animStart - i * 0.03) / 0.9));
                h = from[i] + (target - from[i]) * easeOutBack(p);
            }
            current[i] = h;
            const [x, z] = cellPos(i);
            const lift = i === selected ? 0.12 : 0;
            matrix.makeScale(1, Math.max(0.001, h), 1).setPosition(x, lift, z);
            towers.setMatrixAt(i, matrix);
            matrix.makeTranslation(x, h + lift + 0.02, z);
            caps.setMatrixAt(i, matrix);

            const day = days[i];
            if (day.isFuture) color.copy(C_FUTURE);
            else if (day.hours > 0 || (day.isToday && state.active)) color.lerpColors(C_LOW, C_HIGH, Math.min(1, h / (10 * H_PER_HOUR)));
            else color.copy(day.isToday ? C_TODAY : C_EMPTY);
            towers.setColorAt(i, color);

            if (i === selected) color.copy(CAP_SELECTED);
            else if (day.isToday && state.active) color.copy(COLORS.emeraldLight);
            else if (day.hours > 0) color.copy(COLORS.amberLight);
            else color.copy(CAP_DIM);
            caps.setColorAt(i, color);

            if (day.isToday) {
                todayRing.visible = true;
                todayRing.position.set(x, 0.015, z);
                todayRing.material.color.copy(state.active ? COLORS.emerald : COLORS.amber);
                todayRing.material.opacity = 0.55 + 0.45 * Math.sin(t * 3);
            }
        }
        if (animStart >= 0 && now - animStart > 0.9 + days.length * 0.03) animStart = -1;
        towers.instanceMatrix.needsUpdate = caps.instanceMatrix.needsUpdate = true;
        if (towers.instanceColor) towers.instanceColor.needsUpdate = true;
        if (caps.instanceColor) caps.instanceColor.needsUpdate = true;
        glow.color.lerpColors(COLORS.amber, COLORS.emerald, state.mode);

        // Snurrar sakta fram och tillbaka när ingen rör den
        const idle = Math.min(1, Math.max(0, now - lastInteract - 2.5) / 2);
        if (!state.reduced) spin += dt * idle;
        city.rotation.y = userRot + Math.sin(spin * 0.35) * 0.32 * (state.reduced ? 0 : 1);

        const aspect = view.width / Math.max(1, view.height);
        // Brant vinkel så att höga torn inte skymmer raderna bakom
        const dist = 15.5 + Math.max(0, 1.6 - aspect) * 7;
        camera.position.set(0, dist * 0.8, dist * 0.6);
        camera.lookAt(0, 0.2, 0.25);
        renderer.render(scene, camera);
    };

    return { tick: view.tick, setData };
}
