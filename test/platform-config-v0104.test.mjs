import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateConfig } from '../src/config.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sample = JSON.parse(fs.readFileSync(path.join(root, 'config/app.example.json'), 'utf8'));
const base = structuredClone(sample);
base.whatsapp.pairingNumber = '628123456789';
base.whatsapp.ownerNumber = '628123456789';
test('uses official Instagram Login Graph host and keeps API disabled by default', () => {
 const config = validateConfig(base, {}, { requireWhatsApp: true });
 assert.equal(config.instagram.platformApi.baseUrl, 'https://graph.instagram.com');
 assert.equal(config.instagram.platformApi.enabled, false);
});
test('automatic targeting is shortlist-only and requires owner approval', () => {
 const raw = structuredClone(base); raw.instagram.targeting.mode='automatic'; raw.instagram.targeting.automatic.enabled=true;
 const config=validateConfig(raw, {}, {requireWhatsApp:true});
 assert.equal(config.instagram.targeting.mode,'automatic'); assert.equal(config.instagram.targeting.requireOwnerApproval,true);
 assert.deepEqual(config.instagram.targeting.allowedActions,['review','campaign_link','collaboration_invite']);
});
test('rejects non-official Instagram API host', () => {
 const raw=structuredClone(base); raw.instagram.platformApi.baseUrl='https://instagram.example.com';
 assert.throws(()=>validateConfig(raw,{}, {requireWhatsApp:true}),/baseUrl harus/);
});
test('referral endpoint requires an allowlisted HTTPS backend and service token when enabled', () => {
 const raw=structuredClone(base); raw.referral.enabled=true;
 assert.throws(()=>validateConfig(raw,{}, {requireWhatsApp:true}),/REFERRAL_SERVICE_TOKEN/);
});
