import test from'node:test';import assert from'node:assert/strict';import http from'node:http';
import{createBrowserHandler,browserToken}from'../src/browser-handler.js';
test('browser RPC requires distinct private authorization, bounds input, preserves cookie proof and refuses malformed input',async()=>{
 const calls=[],secret='test',handler=createBrowserHandler({secretKeyBase:secret,sessions:{request:async(...args)=>{calls.push(args);return {user:null};}},data:async()=>({graph:{}})});
 const server=http.createServer((req,res)=>handler(req,res,new URL(req.url,'http://localhost')));await new Promise(r=>server.listen(0,'127.0.0.1',r));const url=`http://127.0.0.1:${server.address().port}/_internal/browser/login`;
 const headers={authorization:'Bearer '+browserToken(secret),'content-type':'application/json',cookie:'walltaker_session=proof'};
 try{
  assert.equal((await fetch(url,{method:'POST',body:'{}'})).status,403);
  assert.equal((await fetch(url,{headers})).status,405);
  assert.equal((await fetch(url,{method:'POST',headers,body:'{'})).status,400);
  assert.equal((await fetch(url,{method:'POST',headers,body:'[]'})).status,400);
  assert.equal((await fetch(url,{method:'POST',headers:{...headers,'content-type':'text/plain'},body:'{}'})).status,415);
  assert.equal((await fetch(url,{method:'POST',headers,body:JSON.stringify({large:'x'.repeat(1048576)})})).status,413);
  const result=await fetch(url,{method:'POST',headers,body:'{"identifier":"Alice"}'});assert.equal(result.status,200);assert.equal(result.headers.get('cache-control'),'no-store');assert.equal(result.headers.get('x-walltaker-backend'),'node-browser');assert.deepEqual(calls,[['login',{identifier:'Alice'},'walltaker_session=proof']]);
 }finally{await new Promise(r=>server.close(r));}
});
