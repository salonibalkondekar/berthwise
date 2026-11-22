import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getSignals } from './signals.mjs';

const app = express();
const port = Number(process.env.PORT ?? 8787);
const dist = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist');

app.get('/api/signals', async (req, res) => {
  try {
    res.json(await getSignals({ force: req.query.refresh === '1' }));
  } catch (e) {
    res.status(502).json({ error: String(e) });
  }
});

app.use(express.static(dist));
app.get(/^(?!\/api).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')));

app.listen(port, () => console.log(`Berthwise listening on :${port}`));
getSignals().catch(() => {});
