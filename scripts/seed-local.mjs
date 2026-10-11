import {spawnSync} from 'node:child_process';
// This command never accepts --remote and only seeds a synthetic local administrator.
const sql = "INSERT OR IGNORE INTO users (id,email,role,status,name,created_at) VALUES ('local-admin','admin@vouchroster.test','admin','active','Local administrator',unixepoch());";
const result=spawnSync(process.execPath,['scripts/wrangler.mjs','d1','execute','DB','--local','--command',sql],{stdio:'inherit'});
process.exit(result.status??1);
