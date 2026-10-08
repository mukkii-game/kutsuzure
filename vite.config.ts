import { defineConfig } from 'vite';

const BUILD_TIME = new Date().toISOString();
const SHA = process.env.GITHUB_SHA?.slice(0, 7) ?? 'local';

// base './' : Pages でも itch.io でも同じ dist が動く(相対パス)
export default defineConfig({
  base: './',
  define: {
    __BUILD_TIME__: JSON.stringify(BUILD_TIME),
    __GIT_SHA__: JSON.stringify(SHA),
  },
  plugins: [{
    // version.json: 古いキャッシュを掴んだ端末が自分で気づいて読み直すため(core/version.ts)
    name: 'version-json',
    generateBundle() { this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ id: `${SHA}-${BUILD_TIME}` }) }); },
  }],
  build: {
    rollupOptions: { output: { manualChunks: { phaser: ['phaser'] } } },
  },
});
