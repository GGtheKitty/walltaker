import { Worker } from 'node:worker_threads';
import { AccountError, invalid } from './errors.js';

export function validatePassword(password, confirmation) {
  if (typeof password !== 'string' || !password.length) invalid('password', "can't be blank.");
  if (Buffer.byteLength(password, 'utf8') > 72) invalid('password', 'is too long (maximum is 72 bytes).');
  if (confirmation != null && password !== confirmation) invalid('password_confirmation', "doesn't match Password.");
}
export function createPasswords({ rounds = 12 } = {}) {
  const worker = new Worker(new URL('./password-worker.js', import.meta.url), { resourceLimits: { maxOldGenerationSizeMb: 16 } });
  let active, dead = false;
  const pending = [];
  const next = () => { if (active || !pending.length || dead) return; active = pending.shift(); worker.postMessage(active.input); };
  worker.on('message', (message) => {
    // Node --watch can forward dependency notifications from worker threads.
    // They are separate from password results and may arrive while idle.
    if (message?.type !== 'password-result' || !active) return;
    const item = active; active = null;
    if (message.error) item.reject(new AccountError(503, 'Password service unavailable.'));
    else item.resolve(message.value);
    next();
  });
  const fail = () => { dead = true; active?.reject(new AccountError(503, 'Password service unavailable.')); active = null;
    for (const item of pending.splice(0)) item.reject(new AccountError(503, 'Password service unavailable.')); };
  worker.on('error', fail); worker.on('exit', fail);
  const run = (input) => {
    if (dead || pending.length >= 4) return Promise.reject(new AccountError(503, 'Password service busy. Please retry.'));
    return new Promise((resolve, reject) => { pending.push({ input, resolve, reject }); next(); });
  };
  return {
    hash: (password) => run({ operation: 'hash', password, rounds }),
    async verify(password, digest) {
      if (typeof password !== 'string' || password.length > 4096) return false;
      if (typeof digest !== 'string' || !/^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/.test(digest)) return false;
      return run({ operation: 'verify', password, digest });
    },
    close: () => worker.terminate(),
  };
}
