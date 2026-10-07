// Startskärmen (~3 s): kameran firar sig ned längs repet från masttoppen, en karbinhake
// roterar in och klickar fast, kameran drar sig bakåt och namnet vänds fram bokstav för bokstav.
import * as THREE from 'three';

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

    // ---------- Kameraåkningen ----------
    const A = bg.anchors;
    const V = (x, y, z) => new THREE.Vector3(x, y, z);
    const camPath = new THREE.CatmullRomCurve3([
        V(10, 88, 13),
        V(9, 75, 8.5),
        V(7.6, 60, 5.4),
        V(A.biner.x + 1.5, A.biner.y + 1.1, A.biner.z + 2.5),
    ]);
    const lookPath = new THREE.CatmullRomCurve3([
        V(0.5, 79, 0),
        V(3.6, 70, 0.3),
        V(4.6, 55, 0.4),
        A.biner.clone(),
    ]);
    const restPos = new THREE.Vector3();
    const restLook = new THREE.Vector3();
    bg.restPose(restPos, restLook);
    const endPos = camPath.getPoint(1);
    const endLook = lookPath.getPoint(1);

    const cam = { pos: camPath.getPoint(0), look: lookPath.getPoint(0), shake: 0 };
    bg.setOverride(cam);

    // Karbinhaken börjar utanför bild, snurrande och med öppen grind
    const b = bg.biner;
    b.group.position.copy(b.home).add(V(2.2, 1.4, 2.4));
    b.group.rotation.set(b.homeRotation.x + 2.6, b.homeRotation.y + 3.2, 0.8);
    b.gate.rotation.z = b.openAngle;
    b.material.emissiveIntensity = 0;

    gsap.killTweensOf([blackout, beacon, flash, word, sub, skip, letters]);
    gsap.set(blackout, { opacity: 1 });
    gsap.set(beacon, { display: 'none' }); // laddningsljuset behövs inte längre
    gsap.set(flash, { opacity: 0 });
    gsap.set(skip, { opacity: 1 });
    gsap.set(word, { opacity: 1, y: 0 });
    gsap.set(sub, { opacity: 0, y: 0, letterSpacing: '0.3em' });
    gsap.set(letters, { opacity: 0, rotateX: -95, y: 18 });

    const p = { u: 0, v: 0 };
    const tl = gsap.timeline({ onComplete: finish });
    tl.to(blackout, { opacity: 0, duration: 0.9, ease: 'power2.out' }, 0.05)
        .to(p, {
            u: 1, duration: 1.5, ease: 'power2.inOut',
            onUpdate: () => {
                camPath.getPoint(p.u, cam.pos);
                lookPath.getPoint(p.u, cam.look);
            },
        }, 0.1)
        .to(b.group.position, { x: b.home.x, y: b.home.y, z: b.home.z, duration: 0.7, ease: 'power3.out' }, 0.95)
        .to(b.group.rotation, { x: b.homeRotation.x, y: b.homeRotation.y, z: b.homeRotation.z, duration: 0.75, ease: 'power3.out' }, 0.95)
        // Klick! Grinden slår igen
        .to(b.gate.rotation, { z: b.closedAngle, duration: 0.11, ease: 'power3.in' }, 1.6)
        .add(snap, 1.71)
        .to(p, {
            v: 1, duration: 1.4, ease: 'power3.inOut',
            onUpdate: () => {
                cam.pos.lerpVectors(endPos, restPos, p.v);
                cam.pos.y += Math.sin(p.v * Math.PI) * 4;
                cam.look.lerpVectors(endLook, restLook, p.v);
            },
        }, 1.8)
        .to(letters, { opacity: 1, rotateX: 0, y: 0, duration: 0.6, ease: 'back.out(2.2)', stagger: 0.03 }, 1.9)
        .to(sub, { opacity: 1, letterSpacing: '0.5em', duration: 0.7, ease: 'power2.out' }, 2.3)
        .to(skip, { opacity: 0, duration: 0.3 }, 2.8)
        .to([word, sub], { opacity: 0, y: -26, duration: 0.45, ease: 'power2.in' }, 2.95)
        .add(() => window.__revealApp?.(), 3.1);

    function snap() {
        gsap.fromTo(flash, { opacity: 0.8 }, { opacity: 0, duration: 0.55, ease: 'power2.out' });
        gsap.fromTo(b.material, { emissiveIntensity: 2.4 }, { emissiveIntensity: 0, duration: 0.7, ease: 'power2.out' });
        gsap.fromTo(cam, { shake: 0.09 }, { shake: 0, duration: 0.35 });
    }

    // Tryck var som helst för att snabbspola till slutet
    const skipHandler = () => tl.timeScale(7);
    intro.addEventListener('pointerdown', skipHandler);

    function finish() {
        intro.removeEventListener('pointerdown', skipHandler);
        b.gate.rotation.z = b.closedAngle;
        b.material.emissiveIntensity = 0;
        bg.setOverride(null);
        state.introRunning = false;
        window.__fxIntro = false;
        window.__revealApp?.();
        try { localStorage.setItem('fx_intro_date', new Date().toDateString()); } catch (e) {}
        onDone?.();
    }
}
