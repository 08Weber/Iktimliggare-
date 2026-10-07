// Delade hjälpare för 3D-vyerna: renderare, texturer och easing.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

export const COLORS = {
    amber: new THREE.Color('#f59e0b'),
    amberLight: new THREE.Color('#fcd34d'),
    emerald: new THREE.Color('#10b981'),
    emeraldLight: new THREE.Color('#6ee7b7'),
};

export const clamp01 = v => Math.min(1, Math.max(0, v));
export const damp = (dt, lambda) => 1 - Math.exp(-lambda * dt);
export const easeInOutCubic = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const easeOutCubic = t => 1 - Math.pow(1 - t, 3);
export const easeOutBack = t => {
    const c1 = 1.70158, c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};

// En canvas med egen renderare som bara ritar när den syns, med begränsad bildfrekvens.
export function createView(canvas, {
    maxPixelRatio = 2,
    antialias = true,
    alpha = false,
    fps = () => 60,
    alwaysVisible = false,
    paused = () => false,
} = {}) {
    const renderer = new THREE.WebGLRenderer({ canvas, antialias, alpha, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, maxPixelRatio));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    if (alpha) renderer.setClearColor(0x000000, 0);

    const view = { renderer, width: 0, height: 0, visible: alwaysVisible, last: 0, frame: null, resize: null, force: true };

    view.measure = () => {
        const w = canvas.clientWidth, h = canvas.clientHeight;
        if (!w || !h || (w === view.width && h === view.height)) return;
        view.width = w;
        view.height = h;
        renderer.setSize(w, h, false);
        view.resize?.(w, h);
        view.force = true;
    };
    new ResizeObserver(view.measure).observe(canvas);

    if (!alwaysVisible) {
        new IntersectionObserver(([entry]) => {
            view.visible = entry.isIntersecting;
            if (view.visible) view.force = true;
        }).observe(canvas);
    }

    view.tick = now => {
        if (!view.visible || !view.frame || paused()) return;
        if (!view.width) view.measure();
        if (!view.width) return;
        if (!view.force && now - view.last < 1000 / fps() - 1.5) return;
        const dt = view.last ? Math.min((now - view.last) / 1000, 0.1) : 1 / 60;
        view.last = now;
        view.force = false;
        view.frame(dt, now / 1000);
    };
    return view;
}

// Miljöljus för metallytor (karbinhakar, klättraren).
export function makeEnvironment(renderer) {
    const pmrem = new THREE.PMREMGenerator(renderer);
    const texture = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
    return texture;
}

export function canvasTexture(width, height, draw) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    draw(canvas.getContext('2d'), width, height);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
}

// Mjuk rund prick för partiklar, ljus och glöd.
export function dotTexture() {
    return canvasTexture(64, 64, (ctx) => {
        const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
        g.addColorStop(0, 'rgba(255,255,255,1)');
        g.addColorStop(0.22, 'rgba(255,255,255,0.8)');
        g.addColorStop(0.55, 'rgba(255,255,255,0.14)');
        g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, 64, 64);
    });
}

// Kärnmantelrep: grundfärg med diagonala ränder som blir en spiral runt repet.
export function ropeTexture(base, stripe) {
    const texture = canvasTexture(64, 64, (ctx, w, h) => {
        ctx.fillStyle = base;
        ctx.fillRect(0, 0, w, h);
        ctx.strokeStyle = stripe;
        ctx.lineWidth = 7;
        for (let i = -2; i < 4; i++) {
            ctx.beginPath();
            ctx.moveTo(i * 32, 0);
            ctx.lineTo(i * 32 + 64, h);
            ctx.stroke();
        }
    });
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    return texture;
}

export function textTexture(text, { width = 256, height = 128, size = 64, weight = 800, family = '"Plus Jakarta Sans", sans-serif' } = {}) {
    return canvasTexture(width, height, (ctx, w, h) => {
        ctx.font = `${weight} ${size}px ${family}`;
        ctx.fillStyle = '#fff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, w / 2, h / 2);
    });
}

// Väntar på appens typsnitt innan text ritas i 3D (men aldrig mer än en stund).
export function fontsReady() {
    const load = document.fonts?.load?.('800 64px "Plus Jakarta Sans"') ?? Promise.resolve();
    return Promise.race([load.catch(() => {}), new Promise(r => setTimeout(r, 1500))]);
}
