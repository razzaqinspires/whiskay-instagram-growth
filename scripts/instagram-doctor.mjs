import { inspectInstagramSetup } from '../src/instagram.mjs';
const result = await inspectInstagramSetup();
console.log(JSON.stringify(result, null, 2));
if (!result.ready) process.exitCode = 1;
