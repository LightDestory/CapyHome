import { createApp } from './app.js';

const port = Number(process.env.PORT || 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be between 1 and 65535.');

try {
  const { app, db } = await createApp();
  const server = app.listen(port, '0.0.0.0', () => console.log(`CapyHome listening on port ${port} from all interfaces`));
  server.on('error', async error => {
    console.error(error.message);
    await db.close();
    process.exitCode = 1;
  });
  let stopping = false;
  const shutdown = () => {
    if (stopping) return;
    stopping = true;
    server.close(async () => { await db.close(); process.exit(0); });
    setTimeout(() => process.exit(1), 10000).unref();
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
} catch (error) {
  console.error(`Unable to start CapyHome: ${error.message}`);
  process.exitCode = 1;
}
