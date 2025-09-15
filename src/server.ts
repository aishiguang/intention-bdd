import express from 'express';
import path from 'path';

const app = express();
const port = process.env.PORT ? Number(process.env.PORT) : 3000;

// Static file hosting
const publicDir = path.join(process.cwd(), 'public');

// Long-term cached assets (recommended to place hashed files under public/assets)
app.use(
  '/assets',
  express.static(path.join(publicDir, 'assets'), {
    maxAge: '1y',
    immutable: true,
    etag: true,
  }),
);

// General static hosting for everything else under /public
// - HTML is served with no-cache to always get latest content
// - Other files get a short cache to balance freshness and performance
app.use(
  express.static(publicDir, {
    index: 'index.html',
    extensions: ['html'],
    etag: true,
    maxAge: '1h',
    setHeaders: (res, filePath) => {
      if (filePath.endsWith('.html')) {
        res.setHeader('Cache-Control', 'no-cache');
      }
    },
  }),
);

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`Server listening on port ${port}`);
});
