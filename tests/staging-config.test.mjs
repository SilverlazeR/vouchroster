import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
test('staging targets the existing Worker without requiring a redundant native account setting',()=>{
 const env={...process.env,CLOUDFLARE_ACCOUNT_ID:'',VOUCHROSTER_STAGING_ORIGIN:'https://vouchroster.shawn-silvia.workers.dev',VOUCHROSTER_STAGING_DATABASE_ID:'11111111-1111-4111-8111-111111111111'};
 const prepared=spawnSync(process.execPath,['scripts/staging.mjs','prepare'],{env,encoding:'utf8'});assert.equal(prepared.status,0,prepared.stderr);
 const config=JSON.parse(readFileSync('.wrangler/staging.wrangler.json','utf8'));assert.equal(config.name,'vouchroster');assert.equal(config.vars.APP_ORIGIN,env.VOUCHROSTER_STAGING_ORIGIN);assert.equal(config.vars.LOCAL_MAILBOX,'false');assert.equal(config.vars.PUBLIC_SUBMISSIONS,'false');assert.equal('account_id' in config,false);
 const invalid=spawnSync(process.execPath,['scripts/staging.mjs','prepare'],{env:{...env,VOUCHROSTER_STAGING_DATABASE_ID:'00000000-0000-0000-0000-000000000000'},encoding:'utf8'});assert.notEqual(invalid.status,0);assert.match(invalid.stderr,/real staging D1 ID/);
});
