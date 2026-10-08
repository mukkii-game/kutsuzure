// 音。実際の楽器の録音(public/audio/manifest.json)を一歩ごとに鳴らす。無ければ合成音で代わりに鳴らす。
import { isMuted } from '../core/audio';
import { tune } from '../core/tuning';
import { Rng } from '../core/rng';

const fxRng = new Rng(7); // 音のゆらぎ専用(ゲームの中身には使わない)

interface Entry { path: string; kind: string; instrument?: string; midi?: number; name?: string; cents?: number | null }
interface Sample { buf: AudioBuffer; midi: number; cents: number }

let ctx: AudioContext | null = null;
let master: GainNode, filter: BiquadFilterNode, dry: GainNode, wet: GainNode, verb: ConvolverNode;
const inst = new Map<string, Sample[]>(); // 楽器名 → 音程順のサンプル
const one = new Map<string, AudioBuffer[]>(); // 効果音・足音の分類 → 候補
const ambBufs = new Map<string, AudioBuffer>();
let manifest: Entry[] = [];
let loaded = false;

export function ac() { return ctx; }

export function initAudio() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume().catch(() => {}); return; }
  try { ctx = new (window.AudioContext || (window as any).webkitAudioContext)(); } catch { return; }
  master = ctx.createGain(); master.gain.value = isMuted() ? 0 : 0.9;
  filter = ctx.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 18000; filter.Q.value = 0.3;
  dry = ctx.createGain(); wet = ctx.createGain(); wet.gain.value = 0.22;
  verb = ctx.createConvolver(); verb.buffer = impulse(ctx, 2.2);
  dry.connect(filter); wet.connect(verb).connect(filter); filter.connect(master).connect(ctx.destination);
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  void loadAll();
}

export function setMuted(m: boolean) { if (ctx) master.gain.setTargetAtTime(m ? 0 : 0.9, ctx.currentTime, 0.05); }

function impulse(c: AudioContext, sec: number) {
  const len = Math.floor(c.sampleRate * sec), b = c.createBuffer(2, len, c.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = b.getChannelData(ch);
    let s = 1234 + ch * 77;
    for (let i = 0; i < len; i++) { s = (s * 16807) % 2147483647; d[i] = ((s / 2147483647) * 2 - 1) * Math.pow(1 - i / len, 2.6); }
  }
  return b;
}

async function loadAll() {
  try {
    const r = await fetch('./audio/manifest.json', { cache: 'no-cache' });
    if (!r.ok) return;
    const m = await r.json();
    manifest = Array.isArray(m) ? m : (m.files ?? []);
  } catch { return; }
  await Promise.all(manifest.map(async (e) => {
    try {
      const ab = await (await fetch('./' + e.path.replace(/^public\//, '').replace(/^\.?\//, ''))).arrayBuffer();
      const buf = await ctx!.decodeAudioData(ab);
      if (e.kind === 'inst' && e.instrument && typeof e.midi === 'number') {
        const k = family(e.instrument);
        if (!inst.has(k)) inst.set(k, []);
        inst.get(k)!.push({ buf, midi: e.midi, cents: e.cents ?? 0 });
      } else if (e.kind === 'amb') {
        ambBufs.set(e.name ?? e.path, buf);
      } else {
        const k = e.name ?? e.path;
        if (!one.has(k)) one.set(k, []);
        one.get(k)!.push(buf);
      }
    } catch { /* 1 つ欠けても続ける */ }
  }));
  for (const arr of inst.values()) arr.sort((a, b) => a.midi - b.midi);
  loaded = true;
  if (pendingAmb) { const n = pendingAmb; pendingAmb = undefined; ambience(n); }
}

function family(name: string): string {
  const n = name.toLowerCase();
  if (n.includes('piano')) return 'piano';
  if (n.includes('marimba') || n.includes('xylo')) return 'marimba';
  if (n.includes('pizz') || n.includes('bass')) return 'pizz';
  if (n.includes('glock') || n.includes('celesta') || n.includes('box') || n.includes('bell')) return 'glock';
  if (n.includes('shaker') || n.includes('brush') || n.includes('hat') || n.includes('perc')) return 'perc';
  return n;
}

export function isLoaded() { return loaded; }
export function families() { return [...inst.keys()]; }

export interface Voice { release(at?: number): void }
const NOOP: Voice = { release() {} };

/** 楽器の 1 音。fam = piano / marimba / pizz / glock。cents で少し下げる等 */
export function note(fam: string, midi: number, vel = 0.6, opts: { cents?: number; wet?: number; dur?: number; when?: number } = {}): Voice {
  if (!ctx || isMuted()) return NOOP;
  const c = ctx, t0 = Math.max(c.currentTime, opts.when ?? 0);
  const g = c.createGain();
  const out = c.createGain(); out.gain.value = 1;
  g.connect(out); out.connect(dry);
  const w = c.createGain(); w.gain.value = opts.wet ?? 1; out.connect(w).connect(wet);
  const list = inst.get(fam);
  const vol = vel * tune('snd.melody');
  if (list && list.length) {
    let best = list[0];
    for (const s of list) if (Math.abs(s.midi - midi) < Math.abs(best.midi - midi)) best = s;
    const src = c.createBufferSource(); src.buffer = best.buf;
    src.playbackRate.value = Math.pow(2, (midi - best.midi + ((opts.cents ?? 0) - best.cents) / 100) / 12);
    g.gain.setValueAtTime(vol, t0);
    src.connect(g); src.start(t0);
    if (opts.dur) { g.gain.setTargetAtTime(0, t0 + opts.dur, 0.08); src.stop(t0 + opts.dur + 0.6); }
    return { release(at) { const tt = Math.max(c.currentTime, at ?? c.currentTime); g.gain.cancelScheduledValues(tt); g.gain.setTargetAtTime(0, tt, 0.12); try { src.stop(tt + 0.8); } catch { /* */ } } };
  }
  // 合成の代役(サンプルが届くまで)
  const f = 440 * Math.pow(2, (midi - 69 + (opts.cents ?? 0) / 100) / 12);
  const o = c.createOscillator(), o2 = c.createOscillator(), mod = c.createGain();
  const decay = fam === 'piano' ? 1.6 : fam === 'pizz' ? 0.35 : fam === 'glock' ? 1.2 : 0.5;
  o.type = fam === 'glock' ? 'sine' : 'triangle'; o.frequency.value = f;
  o2.type = 'sine'; o2.frequency.value = f * (fam === 'glock' ? 3.5 : 2); mod.gain.value = f * (fam === 'marimba' ? 0.6 : 0.25);
  o2.connect(mod).connect(o.frequency);
  g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol * 0.5, t0 + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t0 + decay);
  o.connect(g); o.start(t0); o2.start(t0); o.stop(t0 + decay + 0.05); o2.stop(t0 + decay + 0.05);
  return { release(at) { const tt = Math.max(c.currentTime, at ?? c.currentTime); g.gain.cancelScheduledValues(tt); g.gain.setTargetAtTime(0.0001, tt, 0.1); } };
}

/** 録音の効果音を 1 つ(名前の一部で探す)。無ければ false */
export function play(nameLike: string, vol = 0.6, rate = 1, pan = 0): boolean {
  if (!ctx || isMuted()) return false;
  const keys = [...one.keys()].filter((k) => k.includes(nameLike));
  if (!keys.length) return false;
  const arr = one.get(fxRng.pick(keys))!;
  const buf = fxRng.pick(arr);
  const src = ctx.createBufferSource(); src.buffer = buf; src.playbackRate.value = rate;
  const g = ctx.createGain(); g.gain.value = vol;
  const p = ctx.createStereoPanner(); p.pan.value = pan;
  src.connect(g).connect(p).connect(dry); src.start();
  return true;
}

/** 合成の小物: 擦れ(キュッ)、ズキッ、足音の代役 */
export function squeak(amount: number) {
  if (!ctx || isMuted()) return;
  const c = ctx, t = c.currentTime;
  const n = noise(c, 0.12), bp = c.createBiquadFilter(), g = c.createGain();
  bp.type = 'bandpass'; bp.Q.value = 18; bp.frequency.setValueAtTime(2400, t); bp.frequency.exponentialRampToValueAtTime(3800, t + 0.08);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.25 * amount, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.11);
  n.connect(bp).connect(g).connect(dry); n.start(t);
}

export function zuki() {
  if (!ctx || isMuted()) return;
  const c = ctx, t = c.currentTime;
  const o = c.createOscillator(), g = c.createGain();
  o.type = 'sine'; o.frequency.setValueAtTime(110, t); o.frequency.exponentialRampToValueAtTime(48, t + 0.35);
  g.gain.setValueAtTime(0.5, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
  o.connect(g).connect(master); o.start(t); o.stop(t + 0.5);
  // 世界が一瞬こもる
  filter.frequency.cancelScheduledValues(t);
  filter.frequency.setValueAtTime(700, t); filter.frequency.setTargetAtTime(18000, t + 0.12, 0.25);
}

export function muffle(on: boolean) {
  if (!ctx) return;
  filter.frequency.setTargetAtTime(on ? 2200 : 18000, ctx.currentTime, 0.4);
  wet.gain.setTargetAtTime(on ? 0.45 : 0.22, ctx.currentTime, 0.4);
}

export function footstep(surface: string, foot: 'L' | 'R', vol = 1) {
  const v = tune('snd.steps') * vol;
  if (play(`step/${surface}`, v * 0.7, foot === 'R' ? 1.06 : 0.96, foot === 'R' ? 0.15 : -0.15)) return;
  if (!ctx || isMuted()) return;
  const c = ctx, t = c.currentTime;
  const n = noise(c, 0.06), lp = c.createBiquadFilter(), g = c.createGain();
  lp.type = 'lowpass'; lp.frequency.value = surface === 'grass' ? 1800 : surface === 'bare' ? 600 : 1100;
  g.gain.setValueAtTime(0.35 * v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
  n.connect(lp).connect(g).connect(dry); n.start(t);
}

function noise(c: AudioContext, sec: number) {
  const b = c.createBuffer(1, Math.floor(c.sampleRate * sec), c.sampleRate), d = b.getChannelData(0);
  let s = 99;
  for (let i = 0; i < d.length; i++) { s = (s * 16807) % 2147483647; d[i] = (s / 2147483647) * 2 - 1; }
  const src = c.createBufferSource(); src.buffer = b; return src;
}

// 環境音(ループ、場面ごとにクロスフェード)
let ambNow: { src: AudioBufferSourceNode; g: GainNode; name: string } | null = null;
let pendingAmb: string | undefined;
export function ambience(name: string | undefined) {
  if (!ctx || !loaded) { pendingAmb = name; return; }
  if (ambNow?.name === name) return;
  const c = ctx, t = c.currentTime;
  if (ambNow) { const old = ambNow; old.g.gain.setTargetAtTime(0, t, 0.8); setTimeout(() => { try { old.src.stop(); } catch { /* */ } }, 4000); ambNow = null; }
  if (!name) return;
  const key = [...ambBufs.keys()].find((k) => k.includes(name));
  if (!key) return;
  const src = c.createBufferSource(); src.buffer = ambBufs.get(key)!; src.loop = true;
  const g = c.createGain(); g.gain.value = 0; g.gain.setTargetAtTime(tune('snd.amb'), t, 1.2);
  src.connect(g).connect(dry); src.start();
  ambNow = { src, g, name };
}

// 外部の BGM(public/audio/music/*.mp3。届いたら使う)
let bgm: HTMLAudioElement | null = null;
export function music(file: string | null, vol = 0.6) {
  if (bgm) { const b = bgm; const fade = setInterval(() => { b.volume = Math.max(0, b.volume - 0.05); if (b.volume <= 0) { clearInterval(fade); b.pause(); } }, 80); bgm = null; }
  if (!file || isMuted()) return;
  const a = new Audio(`./audio/music/${file}`);
  a.volume = 0; a.loop = false;
  a.play().then(() => { const up = setInterval(() => { a.volume = Math.min(vol, a.volume + 0.03); if (a.volume >= vol) clearInterval(up); }, 80); }).catch(() => {});
  bgm = a;
}
