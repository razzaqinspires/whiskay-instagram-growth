# WHISKAY v0.10.4 — local setup and QA

This archive contains the complete project source plus the local-only QA batch adapter. It intentionally excludes private `.env`, `config/app.json`, WhatsApp/Instagram sessions, and runtime databases.

## Requirements

- Node.js `>=22.5.0 <23`
- npm `>=10.0.0`

## First setup

From the extracted project root:

```bash
cp .env.example .env
cp config/app.example.json config/app.json
npm install
```

Edit `config/app.json` with your own WhatsApp pairing/owner number and Instagram username. Use your editor of choice. Do not share `.env`, `config/app.json`, `session/`, `auth_ig/`, or runtime data files.

## Run tests first

```bash
npm test
npm run check
```

Run the application only after you have configured `config/app.json` and `.env`:

```bash
npm run validate
npm start
```

## Local batch adapter QA

The `ConcreteHttpAdapter` is intentionally restricted to a local receiver at:

```text
http://127.0.0.1:<port>/__whiskay_qa__/batch
```

It does not permit external hostnames. For the development-only batch-size test:

```bash
NODE_ENV=development MAX_BATCH_SIZE=1000 node --test test/concrete-http-adapter.test.mjs
```

The development test attestation is not owner approval and cannot be used for production or external endpoints. Production retains the base limit and requires trusted owner approval metadata.
