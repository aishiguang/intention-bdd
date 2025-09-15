import express from 'express';
import path from 'path';

export function configureStatic(app: express.Express) {
  const publicDir = path.join(process.cwd(), 'public');

  app.use(
    '/assets',
    express.static(path.join(publicDir, 'assets'), {
      maxAge: '1y',
      immutable: true,
      etag: true,
    }),
  );

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
}

