import express from 'express';
import { configureStatic } from './config/static';
import { registerHealth } from './routes/health';
import { registerGenerate } from './routes/generate';

const app = express();
const port = process.env.PORT ? Number(process.env.PORT) : 3000;

// Core middleware
app.use(express.json());

// Static files and routes
configureStatic(app);
registerHealth(app);
registerGenerate(app);

app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`Server listening on port ${port}`);
});

