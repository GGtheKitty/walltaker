import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createResetMailer} from '../src/mail.js';

test('password reset email uses native HTML with escaped identity and a single encoded, expiring reset link',async()=>{
  const sent=[];
  const mail=createResetMailer({baseUrl:'https://devenv.example.test',env:{WALLTAKER_MAIL_FROM:'reset@example.test'},renderer:{render(){throw Error('Legacy template renderer unavailable');}},transport:{async sendMail(message){sent.push(message);}}});
  await mail({user:{id:7,username:'Alice <img src=x onerror=attack()>',email:'alice@example.test'},token:'reset/token?quoted="'}, {id:42});
  assert.equal(sent.length,1);const message=sent[0];
  assert.equal(message.to,'alice@example.test');assert.equal(message.from,'reset@example.test');assert.equal(message.subject,'Walltaker Password Reset');
  assert.match(message.html,/Alice &lt;img src=x onerror=attack\(\)&gt;/);assert.doesNotMatch(message.html,/<img|password_digest|api_key/);
  assert.match(message.html,/href="https:\/\/devenv.example.test\/i-forgor\/commit\/reset%2Ftoken%3Fquoted%3D%22"/);
  assert.match(message.html,/This link expires one hour after the reset was requested\./);assert.match(message.html,/Reset Password Now/);assert.match(message.html,/Thanks &lt;3/);
  assert.match(message.text,/ignore this email/);assert.equal(message.messageId,'<walltaker-reset-42@devenv.example.test>');
});
