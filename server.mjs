import express from 'express';
import { handler } from './dist/server/entry.mjs';

const app = express();
const port = Number(process.env.PORT || 8080);
const host = process.env.HOST || '0.0.0.0';

app.use(
  express.static('dist/client', {
    fallthrough: true,
    maxAge: '1h',
  }),
);

app.use(handler);

app.listen(port, host, () => {
  console.log(`ForestAI server listening on http://${host}:${port}`);
});
