// Load .env at the npm-script boundary for provider credentials, then remove
// the unrelated Instagram first-login password before loading the worker.
delete process.env.IG_PASSWORD;
await import('../src/growth/worker.mjs');
