import { initInstagramReadOnly } from '../src/instagram.mjs';
try { console.log(JSON.stringify((await initInstagramReadOnly()).profile, null, 2)); }
catch (error) { console.error(error.message); process.exitCode = 1; }
