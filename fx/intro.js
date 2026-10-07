// Startskärmen (~8 s): en klättrare står vid plattformens kant, lyfter linan till selen och klickar
// fast karbinen, backar sedan ut över kanten och går ned tills han hänger i linan. Sedan zoomar kameran
// ut över riggen och namnet vänds fram bokstav för bokstav – och ligger kvar en stund.
import * as THREE from 'three';
import { poseValues } from './figure.js';
import { DECK_Y, HULL_FRONT, INTRO_X } from './rig.js';

export function playIntro({ bg, state, onDone }) {
    const gsap = window.gsap;
    const root = document.documentElement;
    const intro = document.getElementById('intro');
    if (!gsap || !intro) {
        window.__revealApp?.();
        onDone?.();
        return;
    }

    const blackout = intro.querySelector('.intro-blackout');
    const beacon = intro.querySelector('.intro-beacon');
    const flash = intro.querySelector('.intro-flash');
    const word = document.getElementById('introWord');
    const sub = intro.querySelector('.intro-sub');
    const skip = intro.querySelector('.intro-skip');

    if (!word.dataset.split) {
        word.innerHTML = [...word.textContent.trim()].map(c => `<span>${c}</span>`).join('');
        word.dataset.split = '1';
    }
    const letters = word.querySelectorAll('span');

    state.introRunning = true;
    window.__fxIntro = true;
    root.classList.remove('app-revealed');
    root.classList.add('intro-pending');

    const V = (x, y, z) => new THREE.Vector3(x, y, z);
    const { fig, biner, climb, hangPos, HANG_ROT } = bg.climber;
    bg.climber.setStanding();

    // ---------- Kameran ----------
    const X = INTRO_X, D = DECK_Y, F = HULL_FRONT;
    const cam = {
        pos: V(X + 1.5, D + 1.9, F - 4.4),  // på däck: hans ansikte med havet och facklan bakom
        look: V(X, D + 0.95, F - 0.5),
        shake: 0,
    };
    bg.setOverride(cam);
    const sideEnd = { pos: V(X + 3.8, D - 1.0, F + 3.6), look: V(X, D - 1.9, F + 0.4) };
    const restPos = new THREE.Vector3();
    const restLook = new THREE.Vector3();
    bg.restPose(restPos, restLook);

    gsap.killTweensOf([blackout, flash, word, sub, skip, letters]);
    gsap.set(beacon, { display: 'none' }); // laddningsljuset behövs inte längre
    gsap.set(blackout, { opacity: 1 });
    gsap.set(flash, { opacity: 0 });
    gsap.set(skip, { opacity: 1 });
    gsap.set(word, { opacity: 1, y: 0 });
    gsap.set(sub, { opacity: 0, y: 0, letterSpacing: '0.3em' });
    gsap.set(letters, { opacity: 0, rotateX: -95, y: 18 });

    const pose = name => ({ ...poseValues(name) });
    const p = { v: 0 };
    const tl = gsap.timeline({ onComplete: finish });

    tl.to(blackout, { opacity: 0, duration: 1.0, ease: 'power2.out' }, 0.05)
        .to(cam.pos, { x: X + 1.1, y: D + 1.7, z: F - 3.7, duration: 2.3, ease: 'sine.inOut' }, 0)

        // Tittar ut över havet, böjer sig ned och lyfter linan till selen
        .to(fig.pose, { ...pose('look'), duration: 0.5, ease: 'sine.inOut' }, 0.3)
        .to(fig.pose, { ...pose('pick'), duration: 0.5, ease: 'power2.inOut' }, 0.9)
        .to(fig.root.position, { y: D + 0.93, duration: 0.5, ease: 'power2.inOut' }, 0.9)
        .to(fig.pose, { ...pose('clip'), duration: 0.55, ease: 'power2.inOut' }, 1.45)
        .to(fig.root.position, { y: D + 0.96, duration: 0.5, ease: 'power2.inOut' }, 1.45)
        .to(climb, { pull: 1, duration: 0.5, ease: 'power2.inOut' }, 1.45)
        .to(climb, { binerIn: 1, duration: 0.5, ease: 'power2.inOut' }, 1.5)
        // Klick! Grinden slår igen runt linan
        .to(biner.gate.rotation, { z: biner.closedAngle, duration: 0.1, ease: 'power3.in' }, 2.0)
        .add(snap, 2.1)

        // Backar mot kanten med ena handen på linan
        .to(fig.pose, { ...pose('ready'), duration: 0.45, ease: 'power2.inOut' }, 2.3)
        .to(fig.root.position, { z: F - 0.25, duration: 0.6, ease: 'power1.inOut' }, 2.45)
        .to(fig, { walk: 1, duration: 0.15 }, 2.45)
        .to(fig, { walk: 0, duration: 0.2 }, 2.9)
        .to(cam.pos, { x: X + 4.2, y: D + 1.0, z: F + 2.8, duration: 1.3, ease: 'sine.inOut' }, 2.3)
        .to(cam.look, { x: X, y: D + 0.5, z: F + 0.1, duration: 1.3, ease: 'sine.inOut' }, 2.3)

        // Lutar sig bakåt ut över kanten …
        .to(fig.pose, { ...pose('lean'), duration: 0.5, ease: 'power2.inOut' }, 3.05)
        .to(fig.root.rotation, { x: -0.6, duration: 0.5, ease: 'power2.inOut' }, 3.05)
        .to(fig.root.position, { y: D + 0.8, z: F + 0.15, duration: 0.5, ease: 'power2.inOut' }, 3.05)

        // … och går ned för skrovsidan tills han hänger i linan
        .to(fig.root.position, { x: hangPos.x, y: hangPos.y, z: hangPos.z, duration: 1.1, ease: 'power1.inOut' }, 3.55)
        .to(fig.root.rotation, { x: HANG_ROT.x, duration: 1.1, ease: 'power2.inOut' }, 3.55)
        .to(fig.pose, { ...pose('hang'), duration: 1.0, ease: 'power2.inOut' }, 3.6)
        .to(fig, { walk: 0.9, duration: 0.2 }, 3.55)
        .to(fig, { walk: 0, duration: 0.3 }, 4.3)
        .to(climb, { sway: 1, duration: 0.8 }, 4.5)
        .to(cam.pos, { ...sideEnd.pos, duration: 1.3, ease: 'sine.inOut' }, 3.45)
        .to(cam.look, { ...sideEnd.look, duration: 1.3, ease: 'sine.inOut' }, 3.45)

        // Zooma ut över hela riggen
        .to(p, {
            v: 1, duration: 2.0, ease: 'power2.inOut',
            onUpdate: () => {
                cam.pos.lerpVectors(sideEnd.pos, restPos, p.v);
                cam.pos.y += Math.sin(p.v * Math.PI) * 9;
                cam.look.lerpVectors(sideEnd.look, restLook, p.v);
            },
        }, 4.6)

        // Namnet – och låt det ligga kvar en stund
        .to(letters, { opacity: 1, rotateX: 0, y: 0, duration: 0.6, ease: 'back.out(2.2)', stagger: 0.035 }, 5.0)
        .to(sub, { opacity: 1, letterSpacing: '0.5em', duration: 0.8, ease: 'power2.out' }, 5.55)
        .to(skip, { opacity: 0, duration: 0.4 }, 7.0)
        .to([word, sub], { opacity: 0, y: -26, duration: 0.6, ease: 'power2.in' }, 7.6)
        .add(() => window.__revealApp?.(), 8.05);

    function snap() {
        gsap.fromTo(flash, { opacity: 0.4 }, { opacity: 0, duration: 0.45, ease: 'power2.out' });
        gsap.fromTo(biner.material, { emissiveIntensity: 2.4 }, { emissiveIntensity: 0, duration: 0.6, ease: 'power2.out' });
        gsap.fromTo(cam, { shake: 0.03 }, { shake: 0, duration: 0.3 });
    }

    // Tryck var som helst för att snabbspola till slutet
    const skipHandler = () => tl.timeScale(8);
    intro.addEventListener('pointerdown', skipHandler);

    function finish() {
        intro.removeEventListener('pointerdown', skipHandler);
        bg.climber.setHanging();
        biner.material.emissiveIntensity = 0;
        bg.setOverride(null);
        state.introRunning = false;
        window.__fxIntro = false;
        window.__revealApp?.();
        try { localStorage.setItem('fx_intro_date', new Date().toDateString()); } catch (e) {}
        onDone?.();
    }
}
