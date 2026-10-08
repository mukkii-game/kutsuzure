// 足の入力を一度だけ取り付け、今のシーンの受け手に渡す(シーンをやり直しても二重に付かない)。
import { installFeet, debugCounts } from './feet';

type Handler = (foot: 'L' | 'R') => void;
let handler: Handler = () => {};
let installed = false;

export function setFootHandler(h: Handler) { handler = h; }
export function installHub(canvas: HTMLCanvasElement) {
  if (installed) return; installed = true;
  installFeet(canvas, (f) => handler(f));
}
export { debugCounts };
