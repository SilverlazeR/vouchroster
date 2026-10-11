import {spawnSync} from 'node:child_process';
import {resolve} from 'node:path';
// Keep Wrangler state/logs inside this checkout in restricted cloud workspaces.
const result=spawnSync(process.execPath,['node_modules/wrangler/bin/wrangler.js',...process.argv.slice(2)],{
 stdio:'inherit',env:{...process.env,WRANGLER_LOG_PATH:resolve('.wrangler/logs/'),XDG_CONFIG_HOME:resolve('.wrangler/config'),WRANGLER_SEND_METRICS:'false'}
});
process.exit(result.status??1);
