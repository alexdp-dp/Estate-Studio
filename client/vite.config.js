import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
import {fileURLToPath} from 'url';

const __filename=fileURLToPath(import.meta.url);
const __dirname=path.dirname(__filename);

function copyLibreDwgWasm(){
  return {
    name:'estate-studio-copy-libredwg-wasm',
    closeBundle(){
      const candidates=[
        path.resolve(__dirname,'node_modules/@mlightcad/libredwg-web/wasm/libredwg-web.wasm'),
        path.resolve(__dirname,'node_modules/@mlightcad/libredwg-web/wasm/libredwg.wasm')
      ];
      const src=candidates.find(p=>fs.existsSync(p));
      if(!src)throw new Error('Nu găsesc WASM-ul @mlightcad/libredwg-web după build.');

      const assets=path.resolve(__dirname,'dist/assets');
      fs.mkdirSync(assets,{recursive:true});

      // The wrapper resolves `libredwg-web.wasm` relative to the bundle path.
      fs.copyFileSync(src,path.join(assets,'libredwg-web.wasm'));
      // Keep the alternate name too for package-version compatibility.
      fs.copyFileSync(src,path.join(assets,'libredwg.wasm'));

      const mtextCandidates=[
        path.resolve(__dirname,'node_modules/@mlightcad/cad-simple-viewer/dist/mtext-renderer-worker.js'),
        path.resolve(__dirname,'node_modules/@mlightcad/cad-simple-viewer/dist/assets/mtext-renderer-worker.js')
      ];
      const mtext=mtextCandidates.find(p=>fs.existsSync(p));
      if(mtext)fs.copyFileSync(mtext,path.join(assets,'mtext-renderer-worker.js'));
    }
  };
}

export default defineConfig({
  plugins:[react(),copyLibreDwgWasm()]
});
