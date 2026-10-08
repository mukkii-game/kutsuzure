// 右上の小さなボタン(音・言語)。DOM で置き、data-ui を付けて足の入力に数えない。
import { isMuted, toggleMuted } from '../core/audio';
import { toggleLang, lang } from '../core/i18n';
import { setMuted } from '../game/sound';
import { BUILD_ID } from '../core/version';

export function mountUi() {
  const box = document.createElement('div');
  box.setAttribute('data-ui', '');
  box.style.cssText = 'position:fixed;top:8px;right:8px;display:flex;gap:6px;z-index:10;font:12px sans-serif';
  const mk = (label: () => string, on: () => void) => {
    const b = document.createElement('button');
    b.setAttribute('data-ui', '');
    b.style.cssText = 'background:#f4ecdcbb;border:1px solid #2f3a5655;border-radius:12px;padding:4px 10px;color:#2f3a56;cursor:pointer';
    b.textContent = label();
    b.addEventListener('pointerdown', (e) => { e.stopPropagation(); });
    b.addEventListener('click', (e) => { e.stopPropagation(); on(); b.textContent = label(); });
    box.append(b);
  };
  mk(() => (isMuted() ? '♪ off' : '♪ on'), () => { setMuted(toggleMuted()); });
  mk(() => (lang() === 'ja' ? 'EN' : '日本語'), () => { toggleLang(); location.reload(); });
  document.body.append(box);
  const id = document.createElement('div');
  id.style.cssText = 'position:fixed;bottom:2px;left:4px;font:9px monospace;color:#0004;z-index:10;pointer-events:none';
  id.textContent = BUILD_ID.slice(0, 7);
  document.body.append(id);
}

/** スマホ縦持ちの時だけ「横にしてね」の絵を出す(タップで消える。縦のままでも遊べる) */
export function mountRotateHint() {
  const el = document.createElement('div');
  el.setAttribute('data-ui', '');
  el.style.cssText = 'position:fixed;inset:0;display:none;align-items:center;justify-content:center;flex-direction:column;gap:12px;background:#faf6ecee;z-index:20;font:600 16px "Klee One",sans-serif;color:#2a2522';
  el.innerHTML = '<svg width="120" height="90" viewBox="0 0 120 90" fill="none" stroke="#2a2522" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><rect x="14" y="20" width="34" height="58" rx="6"/><rect x="58" y="34" width="56" height="34" rx="6" stroke-dasharray="6 6"/><path d="M40 12 Q70 0 88 24"/><path d="M80 22 L88 24 L90 15"/></svg><div>よこにすると 見やすいよ</div>';
  let dismissed = false;
  const update = () => {
    const portrait = window.innerHeight > window.innerWidth * 1.1;
    const touch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    el.style.display = portrait && touch && !dismissed ? 'flex' : 'none';
  };
  el.addEventListener('pointerdown', (e) => { e.stopPropagation(); dismissed = true; update(); });
  el.addEventListener('touchstart', (e) => { e.stopPropagation(); }, { passive: true });
  window.addEventListener('resize', update);
  document.body.append(el);
  update();
}
