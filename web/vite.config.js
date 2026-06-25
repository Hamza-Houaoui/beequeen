import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'
import path from 'path'

const syncPlugin = () => ({
  name: 'sync-plugin',
  configureServer(server) {
    server.middlewares.use(async (req, res, next) => {
      if (req.url === '/api/sync' && req.method === 'GET') {
        const filePath = path.resolve(__dirname, 'beequeen_backup.json');
        if (fs.existsSync(filePath)) {
          const data = fs.readFileSync(filePath, 'utf-8');
          res.setHeader('Content-Type', 'application/json');
          res.end(data);
        } else {
          res.statusCode = 404;
          res.end(JSON.stringify({ error: 'No backup found' }));
        }
        return;
      }
      
      if (req.url === '/api/sync' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => {
          body += chunk.toString();
        });
        req.on('end', () => {
          const filePath = path.resolve(__dirname, 'beequeen_backup.json');
          fs.writeFileSync(filePath, body);
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ success: true }));
        });
        return;
      }
      
      next();
    });
  }
});

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), syncPlugin()],
})
