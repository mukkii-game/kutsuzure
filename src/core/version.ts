// 「直したのに直らない」対策。version.json と自分の BUILD ID を比べ、違えば 1 回だけ読み直す。
import { META } from './meta';

export const BUILD_ID = `${META.sha}-${META.buildTime}`;

export function watchVersion() {
  if (META.sha === 'local' && location.hostname === 'localhost') return;
  const check = async () => {
    try {
      const r = await fetch(`./version.json?t=${Date.now()}`, { cache: 'no-store' });
      if (!r.ok) return;
      const { id } = await r.json();
      if (id && id !== BUILD_ID) {
        const k = 'reloadedFor';
        if (sessionStorage.getItem(k) === id) return;
        sessionStorage.setItem(k, id);
        location.reload();
      }
    } catch { /* オフライン等 */ }
  };
  setTimeout(check, 3000);
  setInterval(check, 90_000);
}
