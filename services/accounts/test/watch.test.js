import assert from 'node:assert/strict';
import test from 'node:test';
import { spawn } from 'node:child_process';
test('password worker stays healthy under the exact preview Node watch flags',async()=>{
  const child=spawn(process.execPath,['--watch','--watch-preserve-output','test/watch-fixture.js'],{stdio:['ignore','pipe','pipe']});
  let timer;
  try {
    const output=await new Promise((resolve,reject)=>{
      let text='';
      child.stdout.on('data',chunk=>{text+=chunk;if(text.includes('watch-password-ok'))resolve(text);});
      child.stderr.on('data',chunk=>{text+=chunk;});
      child.on('error',reject);child.on('exit',()=>reject(new Error('Watch process exited: '+text)));
      timer=setTimeout(()=>reject(new Error('Watch-mode password check timed out: '+text)),10000);
    });
    assert.match(output,/watch-password-ok/);
  } finally {clearTimeout(timer);child.kill('SIGTERM');}
});
