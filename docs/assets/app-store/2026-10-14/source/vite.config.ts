import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
const destination = path.resolve(import.meta.dirname, '../exports');
export default defineConfig({ plugins: [react(), {
  name: 'local-export',
  configureServer(server) {
    server.middlewares.use('/export', async (req, res) => {
      if (req.method !== 'POST') {res.statusCode=405;res.end();return;}
      try {
        const name = new URL(req.url!, 'http://localhost').searchParams.get('name') || '';
        if (!/^(ko|en)\/0[1-5]-[a-z-]+\.png$/.test(name)) throw Error('Invalid output name');
        const chunks: Buffer[]=[];let size=0;
        for await (const chunk of req) {size+=chunk.length;if(size>40000000)throw Error('Too large');chunks.push(chunk);}
        const output=path.join(destination,name);await mkdir(path.dirname(output),{recursive:true});await writeFile(output,Buffer.concat(chunks));
        res.end(JSON.stringify({saved:name}));
      } catch(error) {res.statusCode=400;res.end(String(error));}
    });
  }
}], server:{host:'127.0.0.1',port:8768,strictPort:true},build:{rollupOptions:{input:{main:'index.html',scene:'scene.html'}}}});
