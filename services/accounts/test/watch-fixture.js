import { createPasswords } from '../src/passwords.js';
const passwords=createPasswords({rounds:4});
try {
  // Give the watch-mode worker dependency notifications time to arrive idle.
  await new Promise(resolve=>setTimeout(resolve,100));
  const digest=await passwords.hash('watch-mode password');
  if(!await passwords.verify('watch-mode password',digest))throw new Error('Watch-mode verification failed');
  console.log('watch-password-ok');
} finally {await passwords.close();}
