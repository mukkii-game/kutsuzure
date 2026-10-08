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
