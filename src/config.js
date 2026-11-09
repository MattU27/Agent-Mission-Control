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
  };
}
