import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
const action=process.argv[2];
if(!['prepare','deploy','bootstrap'].includes(action))throw new Error('Use prepare, deploy, or bootstrap.');
const origin=process.env.VOUCHROSTER_STAGING_ORIGIN;
const databaseId=process.env.VOUCHROSTER_STAGING_DATABASE_ID;
const accountId=process.env.CLOUDFLARE_ACCOUNT_ID;
if(!origin||!/^https:\/\/vouchroster-staging\.[a-z0-9-]+\.workers\.dev$/.test(origin))throw new Error('Set VOUCHROSTER_STAGING_ORIGIN to https://vouchroster-staging.<your-subdomain>.workers.dev (no trailing slash).');
if(!databaseId||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(databaseId)||/^0+-0+-0+-0+-0+$/.test(databaseId))throw new Error('Set VOUCHROSTER_STAGING_DATABASE_ID to the real staging D1 ID.');
if(!accountId||!/^[a-f0-9]{32}$/i.test(accountId))throw new Error('Set CLOUDFLARE_ACCOUNT_ID to your account ID.');
const configPath=resolve('.wrangler/staging.wrangler.json');
await mkdir('.wrangler',{recursive:true});
const config={name:'vouchroster-staging',account_id:accountId,main:'../src/index.ts',compatibility_date:'2026-08-01',workers_dev:true,assets:{directory:'../public',binding:'ASSETS',run_worker_first:true,html_handling:'none'},d1_databases:[{binding:'DB',database_name:'vouchroster-staging',database_id:databaseId,migrations_dir:'../migrations'}],vars:{ENVIRONMENT:'production',APP_ORIGIN:origin,LOCAL_MAILBOX:'false',PUBLIC_SUBMISSIONS:'false',STAGING:'true',...(process.env.VOUCHROSTER_EMAIL_FROM?{EMAIL_FROM:process.env.VOUCHROSTER_EMAIL_FROM}:{})}};
await writeFile(configPath,JSON.stringify(config,null,2)+'\n');
function wrangler(args){const r=spawnSync(process.execPath,['scripts/wrangler.mjs',...args,'--config',configPath],{stdio:'inherit'});if(r.status!==0)process.exit(r.status??1);}
if(action==='prepare')console.log('Staging config prepared. No remote changes performed.');
if(action==='deploy'){
 if(!process.env.CLOUDFLARE_API_TOKEN)throw new Error('Cloudflare API authentication is required. Add it through secure settings.');
 wrangler(['d1','migrations','apply','DB','--remote']);
 wrangler(['deploy']);
 console.log(`Staging deployed at ${origin}. Configure email secrets in Cloudflare before login tests.`);
}
if(action==='bootstrap'){
 const address=process.env.VOUCHROSTER_ADMIN_EMAIL?.trim().toLowerCase();
 if(!address||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address))throw new Error('Set VOUCHROSTER_ADMIN_EMAIL to the real administrator email, not a local test address.');
 if(address.endsWith('.test')||address.endsWith('.example'))throw new Error('Synthetic identities cannot be production administrators.');
 // Values are SQL-escaped; this initial identity must verify its real email before gaining an active session.
 const escaped=address.replaceAll("'","''");
 const sql=`INSERT OR IGNORE INTO users (id,email,role,status,name,created_at) VALUES ('initial-staging-admin','${escaped}','admin','invited','Founding administrator',unixepoch());`;
 wrangler(['d1','execute','DB','--remote','--command',sql]);
 console.log('Initial staging administrator invitation recorded. Request a sign-in link after email delivery is configured.');
}
