const LOG_KEY = 'beequeen_logs';
const MAX_LOGS = 2000;
let logs = [];
let listeners = [];
let originalConsole = {};
let interceptorInstalled = false;

const LEVELS = {
  DEBUG:  { priority: 0, label: 'DEBUG',   color: '#6c757d' },
  INFO:   { priority: 1, label: 'INFO',    color: '#17a2b8' },
  SUCCESS:{ priority: 2, label: 'SUCCESS', color: '#28a745' },
  WARN:   { priority: 3, label: 'WARN',    color: '#ffc107' },
  ERROR:  { priority: 4, label: 'ERROR',   color: '#dc3545' },
};

function getStackInfo() {
  const err = new Error();
  const stack = err.stack?.split('\n') || [];
  for (let i = 2; i < stack.length; i++) {
    const line = stack[i];
    if (!line.includes('Logger.js') && !line.includes('logger')) {
      const match = line.match(/at\s+(?:(.+)\s+)?\(?(.+?):(\d+):(\d+)\)?/);
      if (match) {
        let fn = match[1] || '(anonymous)';
        let file = match[2].split('/').pop() || 'unknown';
        return { fn, file, line: match[3] };
      }
    }
  }
  return { fn: 'unknown', file: 'unknown', line: '0' };
}

function getTimestamp() {
  const now = new Date();
  return {
    iso: now.toISOString(),
    locale: now.toLocaleString(),
    ms: now.getTime(),
    timeMs: now.toLocaleTimeString() + '.' + String(now.getMilliseconds()).padStart(3, '0'),
  };
}

export const Logger = {
  init() {
    try {
      const stored = localStorage.getItem(LOG_KEY);
      logs = stored ? JSON.parse(stored) : [];
    } catch { logs = []; }
    Logger.installConsoleInterceptor();
  },

  installConsoleInterceptor() {
    if (interceptorInstalled) return;
    interceptorInstalled = true;

    originalConsole = {
      log: console.log.bind(console),
      warn: console.warn.bind(console),
      error: console.error.bind(console),
      info: console.info.bind(console),
      debug: console.debug.bind(console),
    };

    console.log = function (...args) {
      Logger._internalLog('DEBUG', args.map(a => Logger._stringify(a)).join(' '));
      originalConsole.log.apply(console, args);
    };
    console.info = function (...args) {
      Logger._internalLog('INFO', args.map(a => Logger._stringify(a)).join(' '));
      originalConsole.info.apply(console, args);
    };
    console.warn = function (...args) {
      Logger._internalLog('WARN', args.map(a => Logger._stringify(a)).join(' '));
      originalConsole.warn.apply(console, args);
    };
    console.error = function (...args) {
      Logger._internalLog('ERROR', args.map(a => Logger._stringify(a)).join(' '));
      originalConsole.error.apply(console, args);
    };
    console.debug = function (...args) {
      Logger._internalLog('DEBUG', args.map(a => Logger._stringify(a)).join(' '));
      originalConsole.debug.apply(console, args);
    };
  },

  restoreConsole() {
    if (!interceptorInstalled) return;
    console.log = originalConsole.log;
    console.warn = originalConsole.warn;
    console.error = originalConsole.error;
    console.info = originalConsole.info;
    console.debug = originalConsole.debug;
    interceptorInstalled = false;
  },

  _stringify(obj) {
    try {
      if (obj instanceof Error) return obj.stack || obj.message;
      if (typeof obj === 'object') return JSON.stringify(obj, null, 0);
      return String(obj);
    } catch { return String(obj); }
  },

  _internalLog(level, message) {
    const ts = getTimestamp();
    const stack = (level === 'ERROR' || level === 'WARN') ? getStackInfo() : {};
    const entry = {
      id: crypto.randomUUID?.() || Math.random().toString(36).slice(2),
      level,
      message,
      timestamp: ts.ms,
      timeMs: ts.timeMs,
      iso: ts.iso,
      ...stack,
    };
    logs.unshift(entry);
    if (logs.length > MAX_LOGS) logs.pop();
    try { localStorage.setItem(LOG_KEY, JSON.stringify(logs)); } catch {}
    listeners.forEach(fn => fn(entry));
  },

  debug(message, ...args) {
    const msg = args.length ? message + ' ' + args.map(a => Logger._stringify(a)).join(' ') : message;
    Logger._internalLog('DEBUG', msg);
  },

  info(message, ...args) {
    const msg = args.length ? message + ' ' + args.map(a => Logger._stringify(a)).join(' ') : message;
    Logger._internalLog('INFO', msg);
  },

  success(message, ...args) {
    const msg = args.length ? message + ' ' + args.map(a => Logger._stringify(a)).join(' ') : message;
    Logger._internalLog('SUCCESS', msg);
  },

  warn(message, ...args) {
    const msg = args.length ? message + ' ' + args.map(a => Logger._stringify(a)).join(' ') : message;
    Logger._internalLog('WARN', msg);
  },

  error(message, ...args) {
    const msg = args.length ? message + ' ' + args.map(a => Logger._stringify(a)).join(' ') : message;
    Logger._internalLog('ERROR', msg);
  },

  getLogs() {
    return [...logs];
  },

  clear() {
    logs = [];
    try { localStorage.setItem(LOG_KEY, JSON.stringify(logs)); } catch {}
    listeners.forEach(fn => fn(null));
  },

  subscribe(fn) {
    listeners.push(fn);
    return () => { listeners = listeners.filter(l => l !== fn); };
  },

  getStats() {
    const counts = {};
    logs.forEach(l => { counts[l.level] = (counts[l.level] || 0) + 1; });
    return {
      total: logs.length,
      counts,
      firstLog: logs[logs.length - 1]?.timestamp || 0,
      lastLog: logs[0]?.timestamp || 0,
    };
  },

  exportLogs() {
    const data = JSON.stringify(logs, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `logcat_${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.json`;
    a.click();
    URL.revokeObjectURL(url);
  },

  copyLogs() {
    const text = logs.map(l =>
      `[${l.timeMs}] [${l.level}]${l.file ? ' [' + l.file + ':' + l.line + ']' : ''} ${l.message}`
    ).join('\n');
    navigator.clipboard?.writeText(text).catch(() => {});
  },

  // Timing
  _timers: {},
  time(label = 'default') {
    Logger._timers[label] = performance.now();
  },
  timeEnd(label = 'default') {
    const start = Logger._timers[label];
    if (!start) {
      Logger.warn(`Timer "${label}" not found`);
      return;
    }
    const elapsed = (performance.now() - start).toFixed(2);
    Logger.info(`⏱ [${label}] ${elapsed}ms`);
    delete Logger._timers[label];
    return parseFloat(elapsed);
  },

  LEVELS,
};
