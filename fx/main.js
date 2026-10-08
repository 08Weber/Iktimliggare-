// 3D-lagret: bakgrundsvärlden, klättraren i klockkortet, periodens skyline och startskärmen.
// Allt här är ett lager ovanpå appen – script.js fungerar likadant om detta inte laddas.
// script.js säger till när något ändras (händelsen "app:change") och vi läser då window.app.snapshot().
import * as THREE from 'three';
import { createBackground } from './background.js';
import { createHero } from './hero.js';
import { createSkyline } from './skyline.js';
import { playIntro } from './intro.js';
import { damp } from './common.js';

const root = document.documentElement;

const state = {
    reduced: root.classList.contains('fx-reduced'),
    active: false,
    startMs: 0,
    mode: 0,            // 0 = vila (amber) … 1 = pass pågår (grönt), mjukt övergång
    scroll: 0,
    scrollAt: 0,
    pointer: new THREE.Vector2(),
    pointerGoal: new THREE.Vector2(),
    gyro: new THREE.Vector2(),
    gyroGoal: new THREE.Vector2(),
    introRunning: false,
};

let bg, hero, skyline;

function start() {
    if (!root.classList.contains('fx')) return;
    try {
        bg = createBackground(document.getElementById('bgCanvas'), state);
        hero = createHero(document.getElementById('heroCanvas'), state);
        skyline = createSkyline(document.getElementById('skylineCanvas'), state, document.getElementById('skylineInfo'));
    } catch (err) {
        console.error('3D-lagret kunde inte starta', err);
        root.classList.remove('fx', 'intro-pending');
        window.__revealApp?.();
        return;
    }

    sync(false);
    hero.syncInitial();
    state.mode = state.active ? 1 : 0;
    document.addEventListener('app:change', () => sync(true));

    const appScroll = document.getElementById('appScroll');
    appScroll.addEventListener('scroll', () => {
        state.scroll = appScroll.scrollTop;
        state.scrollAt = performance.now();
    }, { passive: true });

    window.addEventListener('pointermove', e => {
        if (e.pointerType !== 'mouse') return;
        state.pointerGoal.set((e.clientX / innerWidth) * 2 - 1, -((e.clientY / innerHeight) * 2 - 1));
    }, { passive: true });

    window.fx = { playIntro: runIntro, enableGyro, disableGyro };
    window.__fxReady = true;
    try { if (localStorage.getItem('fx_gyro') === 'true') enableGyro(); } catch (e) {}

    requestAnimationFrame(loop);
    if (root.classList.contains('intro-pending')) runIntro();
}

function sync(animate) {
    const snap = window.app?.snapshot?.();
    if (!snap) return;
    const wasActive = state.active;
    state.active = snap.active;
    state.startMs = snap.startMs;
    if (animate && snap.active !== wasActive) {
        if (snap.active) hero.clockIn();
        else hero.clockOut();
    }
    skyline.setData(snap.period);
}

function runIntro() {
    if (state.introRunning) return;
    playIntro({ bg, state });
}

let last = performance.now();
let lastGyroCss = '';

function loop(now) {
    requestAnimationFrame(loop);
    if (document.hidden) return;
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;

    const target = state.active ? 1 : 0;
    state.mode += (target - state.mode) * (state.reduced ? 1 : damp(dt, 1.4));
    state.pointer.lerp(state.pointerGoal, damp(dt, 3));
    state.gyro.lerp(state.gyroGoal, damp(dt, 4));

    // Korten i appen lutar med telefonen (CSS-variabler som .tilt använder)
    if (gyroOn) {
        const css = `${(state.gyro.x * 6).toFixed(1)}|${(-state.gyro.y * 6).toFixed(1)}`;
        if (css !== lastGyroCss) {
            lastGyroCss = css;
            const [gx, gy] = css.split('|');
            root.style.setProperty('--gx', `${gx}deg`);
            root.style.setProperty('--gy', `${gy}deg`);
        }
    }

    bg.tick(now);
    hero.tick(now);
    skyline.tick(now);
}

// ---------- Lutning (gyro) ----------
let gyroOn = false;
let gyroBase = null;

function onOrientation(e) {
    if (e.beta == null || e.gamma == null) return;
    if (!gyroBase) gyroBase = { beta: e.beta, gamma: e.gamma };
    // Nollpunkten följer långsamt med, så att det inte spelar roll hur du håller telefonen
    gyroBase.beta += (e.beta - gyroBase.beta) * 0.004;
    gyroBase.gamma += (e.gamma - gyroBase.gamma) * 0.004;
    const clamp = v => Math.max(-1, Math.min(1, v));
    state.gyroGoal.set(clamp((e.gamma - gyroBase.gamma) / 22), clamp((e.beta - gyroBase.beta) / 22));
}

function listenGyro() {
    if (gyroOn) return;
    gyroOn = true;
    gyroBase = null;
    window.addEventListener('deviceorientation', onOrientation);
}

function enableGyro() {
    const D = window.DeviceOrientationEvent;
    if (!D) return;
    if (typeof D.requestPermission === 'function') {
        // iOS: måste fråga i samband med ett tryck. Lyckas det inte nu, försök vid nästa tryck.
        D.requestPermission()
            .then(result => { if (result === 'granted') listenGyro(); })
            .catch(() => document.addEventListener('touchend', enableGyro, { once: true }));
    } else {
        listenGyro();
    }
}

function disableGyro() {
    gyroOn = false;
    window.removeEventListener('deviceorientation', onOrientation);
    state.gyroGoal.set(0, 0);
    root.style.setProperty('--gx', '0deg');
    root.style.setProperty('--gy', '0deg');
}

start();
