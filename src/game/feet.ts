// 左右の足の入力。window だけに頼らず canvas / body / document に付けて、同じ出来事の重複を除く。
// 画面の左半分 = 左足、右半分 = 右足。キーは F/J、←/→、A/D、Z/X。
import { initAudio } from './sound';
import { unlock } from '../core/audio';

export type FootCb = (foot: 'L' | 'R', x: number, y: number) => void;

export const debugCounts = { pointer: 0, touch: 0, key: 0, mouse: 0, used: 0 };

export function installFeet(canvas: HTMLCanvasElement, cb: FootCb) {
  const seen = new WeakSet<Event>();
  let lastTouchT = -1e9;
  const LEFT = ['KeyF', 'ArrowLeft', 'KeyA', 'KeyZ', 'KeyS'];
  const RIGHT = ['KeyJ', 'ArrowRight', 'KeyD', 'KeyX', 'KeyK', 'KeyL'];

  const fire = (foot: 'L' | 'R', x: number, y: number) => {
    initAudio(); unlock();
    debugCounts.used++;
    cb(foot, x, y);
  };
  const side = (clientX: number, clientY: number) => {
    const r = canvas.getBoundingClientRect();
    const x = (clientX - r.left) / Math.max(1, r.width), y = (clientY - r.top) / Math.max(1, r.height);
    return { foot: (x < 0.5 ? 'L' : 'R') as 'L' | 'R', x, y };
  };

  const onPointer = (e: PointerEvent) => {
    if (seen.has(e)) return; seen.add(e);
    debugCounts.pointer++;
    if (e.pointerType === 'touch') lastTouchT = performance.now();
    if ((e.target as HTMLElement)?.closest?.('[data-ui]')) return;
    const s = side(e.clientX, e.clientY); fire(s.foot, s.x, s.y);
  };
  const onTouch = (e: TouchEvent) => {
    if (seen.has(e)) return; seen.add(e);
    debugCounts.touch++;
    // pointer が来ている環境では touch は無視(二重発火を防ぐ)
    if (performance.now() - lastTouchT < 80) return;
    if ((e.target as HTMLElement)?.closest?.('[data-ui]')) return;
    for (const t of Array.from(e.changedTouches)) { const s = side(t.clientX, t.clientY); fire(s.foot, s.x, s.y); }
    lastTouchT = performance.now();
    if (e.cancelable) e.preventDefault();
  };
  const onKey = (e: KeyboardEvent) => {
    if (seen.has(e) || e.repeat) return; seen.add(e);
    debugCounts.key++;
    if (e.code === 'F2') return;
    if (LEFT.includes(e.code)) fire('L', 0.25, 0.5);
    else if (RIGHT.includes(e.code)) fire('R', 0.75, 0.5);
  };
  for (const target of [canvas, document.body, document] as EventTarget[]) {
    target.addEventListener('pointerdown', onPointer as EventListener, { passive: true });
    target.addEventListener('touchstart', onTouch as EventListener, { passive: false });
    target.addEventListener('keydown', onKey as EventListener);
  }
  window.addEventListener('keydown', onKey);
}
