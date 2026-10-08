// Startskärmen (~10 s), riggad som i verkligheten: klättraren står säkrad med kortlinan i förankringen,
// sätter säkerhetsenheten på säkerhetsrepet, lägger arbetsrepet i nedfiraren, skruvar igen karbinen
// (närbild), kopplar loss kortlinan, backar ut över kanten och går ned tills han hänger i repen.
// Sedan zoomar kameran ut över riggen och namnet vänds fram – och ligger kvar en stund.
// Själva rörelserna finns i fx/climber.js; här styrs klockan, kameran och texten.
import * as THREE from 'three';
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

    const climber = bg.climber;
    climber.setStanding();

    // ---------- Kameran ----------
    const V = (x, y, z) => new THREE.Vector3(x, y, z);
    const X = INTRO_X, D = DECK_Y, F = HULL_FRONT;
    const cam = {
        pos: V(X - 1.5, D + 1.75, F - 3.9),   // på däck: hans ansikte med havet och facklan bakom
        look: V(X, D + 0.95, F - 0.55),
        shake: 0,
    };
    bg.setOverride(cam);
    const sideEnd = { pos: V(X + 3.8, D - 1.0, F + 3.6), look: V(X, D - 1.6, F + 0.4) };
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

    const tl = gsap.timeline({ onComplete: finish });
    const move = (to, look, at, duration, ease = 'sine.inOut') => {
        tl.to(cam.pos, { x: to.x, y: to.y, z: to.z, duration, ease }, at);
        tl.to(cam.look, { x: look.x, y: look.y, z: look.z, duration, ease }, at);
    };
    const p = { v: 0 };

    tl.to(blackout, { opacity: 0, duration: 1.0, ease: 'power2.out' }, 0.05)
        .to(climber, { clock: climber.END, duration: climber.END, ease: 'none' }, 0)
        .to(cam.pos, { x: X - 1.1, y: D + 1.55, z: F - 3.25, duration: 2.3, ease: 'sine.inOut' }, 0);

    // Närbild när nedfiraren stängs och karbinen skruvas igen
    move(V(X - 0.2, D + 1.5, F - 1.45), V(X + 0.08, D + 0.99, F - 0.84), 2.3, 0.45);
    tl.add(snap, 2.46);
    // Tillbaka, och åt sidan när han backar mot kanten
    move(V(X - 1.3, D + 1.6, F - 3.3), V(X, D + 0.9, F - 0.5), 3.3, 0.8);
    move(V(X + 4.2, D + 1.0, F + 2.8), V(X, D + 0.5, F + 0.1), 4.2, 1.0);
    // Följer honom ned längs skrovet
    move(sideEnd.pos, sideEnd.look, 5.25, 1.35);

    // Zooma ut över hela riggen
    tl.to(p, {
        v: 1, duration: 2.0, ease: 'power2.inOut',
        onUpdate: () => {
            cam.pos.lerpVectors(sideEnd.pos, restPos, p.v);
            cam.pos.y += Math.sin(p.v * Math.PI) * 9;
            cam.look.lerpVectors(sideEnd.look, restLook, p.v);
        },
    }, 6.6)
        // Namnet – och låt det ligga kvar en stund
        .to(letters, { opacity: 1, rotateX: 0, y: 0, duration: 0.6, ease: 'back.out(2.2)', stagger: 0.035 }, 7.0)
        .to(sub, { opacity: 1, letterSpacing: '0.5em', duration: 0.8, ease: 'power2.out' }, 7.55)
        .to(skip, { opacity: 0, duration: 0.4 }, 9.0)
        .to([word, sub], { opacity: 0, y: -26, duration: 0.6, ease: 'power2.in' }, 9.6)
        .add(() => window.__revealApp?.(), 10.05);

    // Nedfiraren stängs runt repet: liten blixt och skakning
    function snap() {
        gsap.fromTo(flash, { opacity: 0.3 }, { opacity: 0, duration: 0.4, ease: 'power2.out' });
        gsap.fromTo(climber.gear.main.material, { emissiveIntensity: 1.6 }, { emissiveIntensity: 0, duration: 0.6, ease: 'power2.out' });
        gsap.fromTo(cam, { shake: 0.006 }, { shake: 0, duration: 0.3 });
    }

    // Tryck var som helst för att snabbspola till slutet
    const skipHandler = () => tl.timeScale(8);
    intro.addEventListener('pointerdown', skipHandler);

    function finish() {
        intro.removeEventListener('pointerdown', skipHandler);
        climber.setHanging();
        climber.gear.main.material.emissiveIntensity = 0;
        bg.setOverride(null);
        state.introRunning = false;
        window.__fxIntro = false;
        window.__revealApp?.();
        try { localStorage.setItem('fx_intro_date', new Date().toDateString()); } catch (e) {}
        onDone?.();
    }
}
