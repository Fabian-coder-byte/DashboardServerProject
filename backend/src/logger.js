const LEVEL_NUM = { debug: 0, info: 1, warn: 2, error: 3 };
const current   = LEVEL_NUM[process.env.LOG_LEVEL] ?? 1;

function ts() { return new Date().toISOString(); }

function line(level, ctx, msg, extra) {
  const base = `${ts()} ${level.toUpperCase().padEnd(5)} [${ctx}] ${msg}`;
  if (extra === undefined || extra === null) return base;
  if (extra instanceof Error) return `${base} — ${extra.message}`;
  if (typeof extra === 'string') return `${base} — ${extra}`;
  return `${base} — ${JSON.stringify(extra)}`;
}

module.exports = {
  debug: (ctx, msg, extra) => { if (current <= 0) console.debug(line('debug', ctx, msg, extra)); },
  info:  (ctx, msg, extra) => { if (current <= 1) console.log(line('info',  ctx, msg, extra)); },
  warn:  (ctx, msg, extra) => { if (current <= 2) console.warn(line('warn',  ctx, msg, extra)); },
  error: (ctx, msg, extra) => { if (current <= 3) console.error(line('error', ctx, msg, extra)); },
};
