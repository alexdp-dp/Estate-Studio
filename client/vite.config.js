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

      const workerCopies=[
        {
          name:'mtext-renderer-worker.js',
          candidates:[
            path.resolve(__dirname,'node_modules/@mlightcad/cad-simple-viewer/dist/mtext-renderer-worker.js'),
            path.resolve(__dirname,'node_modules/@mlightcad/cad-simple-viewer/dist/assets/mtext-renderer-worker.js')
          ]
        },
        {
          name:'dxf-parser-worker.js',
          candidates:[
            path.resolve(__dirname,'node_modules/@mlightcad/cad-simple-viewer/dist/dxf-parser-worker.js'),
            path.resolve(__dirname,'node_modules/@mlightcad/cad-simple-viewer/dist/assets/dxf-parser-worker.js')
          ]
        }
      ];

      for(const item of workerCopies){
        const worker=item.candidates.find(p=>fs.existsSync(p));
        if(!worker){
          throw new Error(`Nu găsesc worker-ul CAD ${item.name} după npm install.`);
        }
        fs.copyFileSync(worker,path.join(assets,item.name));
      }
    }
  };
}

export default defineConfig({
  plugins:[react(),copyLibreDwgWasm()]
});
