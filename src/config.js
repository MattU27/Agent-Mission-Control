import { readFileSync } from 'node:fs';
import { join } from 'node:path';

function readDotEnv(file) {
  try {
    return Object.fromEntries(
      readFileSync(file, 'utf8').split(/\r?\n/)
        .map(l => l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/i))
        .filter(Boolean)
        .map(([, k, v]) => [k, v.replace(/^(['"])(.*)\1$/, '$2')])
    );
  } catch { return {}; }
}

export function loadConfig(env = process.env) {
  const hermesHome = env.HERMES_HOME || 'E:/CData/AppData/hermes';
  const dot = readDotEnv(join(hermesHome, '.env'));
  return {
    port: Number(env.AMC_PORT) || 4747,
    hermesHome,
    omniUrl: (env.OMNIROUTE_URL || 'http://127.0.0.1:20128').replace(/\/$/, ''),
    omniKey: env.HERMES_OMNIROUTE_KEY || dot.HERMES_OMNIROUTE_KEY || '',
    gdriveBin: env.GDRIVE_BIN || join(hermesHome, 'bin', process.platform === 'win32' ? 'gdrive.cmd' : 'gdrive'),
    scratchDir: env.AMC_SCRATCH_DIR || join(hermesHome, 'cache', 'scratch'),
    doraSheetId: env.DORA_SHEET_ID || '1jW_stbrOp6rvJtObfpENgNQq9zszsSlCivQ3rsnjObY',
    doraInboxId: env.DORA_INBOX_ID || '1dGMolnBTTux-LwQAZ13eUhoV7EwYI5Eh',
    doraOutboxId: env.DORA_OUTBOX_ID || '1_ANwMCvc1kTFEZP_-4Z_8ilAjYbuTA8n',
  };
}
