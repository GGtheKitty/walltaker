import { parentPort } from 'node:worker_threads';
import bcrypt from 'bcryptjs';
parentPort.on('message', ({ operation, password, digest, rounds }) => {
  if (!['hash','verify'].includes(operation)) return;
  try { parentPort.postMessage({ type: 'password-result', value: operation === 'hash' ? bcrypt.hashSync(password, rounds) : bcrypt.compareSync(password, digest) }); }
  catch { parentPort.postMessage({ type: 'password-result', error: true }); }
});
