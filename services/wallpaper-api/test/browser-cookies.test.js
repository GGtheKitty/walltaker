import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync}from'node:fs';
import{browserCookies,createLegacyCookies,createBrowserCsrf}from'../src/browser-cookies.js';
const f=JSON.parse(readFileSync(new URL('./fixtures/browser-cookies.json',import.meta.url)));
const header=values=>Object.entries(values).map(([key,value])=>key+'='+encodeURIComponent(value)).join('; ');
test('native Node verification reads actual Rails JSON signed and encrypted cookie fixtures',()=>{
 const legacy=createLegacyCookies(f.secret);
 let result=legacy.read(header({permanent_session_id:f.permanent,surrender_id:f.surrender,_walltaker_session:f.encrypted}));
 assert.equal(result.candidates.length,2);assert.equal(result.candidates[0].userId,'42');assert.equal(result.candidates[0].remember,true);assert.equal(result.surrenderId,'99');assert.equal(result.csrf,f.raw_csrf);
 assert.equal(legacy.read(header({_walltaker_session:f.encrypted})).candidates[0].userId,'42');
 for(const token of [f.expired,f.wrong_purpose,f.permanent.slice(0,-1)+'z','42'])assert.equal(legacy.read(header({permanent_session_id:token})).candidates.length,0);
 for(const token of [f.wrong_encrypted_purpose,f.encrypted.slice(0,-1)+'z','{"user_id":42}'])assert.equal(legacy.read(header({_walltaker_session:token})).candidates.length,0);
 assert.equal(legacy.read(header({surrender_id:'99'})).invalidSurrender,true);
 assert.equal(legacy.read(header({surrender_id:f.no_surrender})).invalidSurrender,false);
});
test('Node accepts existing Rails raw, masked global and per-form CSRF tokens with origin and method checks',()=>{
 const csrf=createBrowserCsrf(f.secret),input={legacyToken:f.raw_csrf,method:'POST',path:'/settings',baseUrl:'https://example.test',origin:'https://example.test'};
 for(const token of [f.raw_csrf,f.masked_real,f.masked_global,f.masked_form])assert.equal(csrf.verify({...input,tokens:[token]}),true);
 assert.equal(csrf.verify({...input,path:'/other',tokens:[f.masked_form]}),false);
 assert.equal(csrf.verify({...input,method:'DELETE',tokens:[f.masked_form]}),false);
 for(const origin of ['https://evil.example','null'])assert.equal(csrf.verify({...input,origin,tokens:[f.masked_global]}),false);
 for(const token of ['',null,'bad','a'.repeat(10000)])assert.equal(csrf.verify({...input,tokens:[token]}),false);
 const cookie=csrf.issue(),token=csrf.token(cookie);assert.ok(token);assert.equal(csrf.verify({...input,legacyToken:null,cookie,tokens:[token]}),true);
 assert.equal(csrf.verify({...input,legacyToken:null,cookie:cookie.slice(0,-1)+'z',tokens:[token]}),false);
 assert.equal(csrf.verify({...input,legacyToken:null,tokens:[token]}),false);
});
test('cookie parsing is bounded, preserves first duplicate, and never trusts undecodable or unsigned identities',()=>{
 const cookies=browserCookies('x=first; x=second; permanent_session_id=42; bad=%broken');assert.equal(cookies.x,'first');assert.equal(cookies.bad,undefined);
 assert.equal(createLegacyCookies(f.secret).read('permanent_session_id=42').candidates.length,0);assert.deepEqual(Object.keys(browserCookies('a'.repeat(40000))),[]);
});
