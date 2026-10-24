import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import {createRenderer} from '../src/rendering/index.js';
import {createResetMailer} from '../src/mail.js';

test('native reset mail uses SMTP envelope, authentication and rendered MIME content',async()=>{
 let mail='',recipient='',authenticated=false;
 const server=net.createServer(socket=>{
  socket.setEncoding('utf8');socket.write('220 localhost test SMTP\r\n');let pending='',data=false;
  socket.on('data',chunk=>{pending+=chunk;let boundary;
   while((boundary=pending.indexOf('\r\n'))>=0){const line=pending.slice(0,boundary);pending=pending.slice(boundary+2);
    if(data){if(line==='.') {data=false;socket.write('250 stored\r\n');}else mail+=line+'\r\n';continue;}
    if(/^EHLO|^HELO/.test(line))socket.write('250-localhost\r\n250 AUTH PLAIN\r\n');
    else if(/^AUTH PLAIN /.test(line)){authenticated=true;socket.write('235 authenticated\r\n');}
    else if(/^RCPT TO:/.test(line)){recipient=line;socket.write('250 recipient\r\n');}
    else if(line==='DATA'){data=true;socket.write('354 send message\r\n');}
    else if(line==='QUIT')socket.end('221 bye\r\n');
    else socket.write('250 ok\r\n');
   }
  });
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{
  const renderer=createRenderer({secretKeyBase:'test',baseUrl:'https://example.test'});
  const send=createResetMailer({renderer,baseUrl:'https://example.test',env:{RESEND_SMTP_ADDRESS:'127.0.0.1',RESEND_SMTP_PORT:String(server.address().port),RESEND_SMTP_ENABLE_STARTTLS_AUTO:'false',RESEND_SMTP_AUTHENTICATION:'plain',RESEND_SMTP_USER_NAME:'test',RESEND_SMTP_PASSWORD:'test'}});
  await send({user:{id:1,username:'Alice',email:'alice@example.test'},token:'smtp-test-token'},{id:73});
  assert.ok(authenticated);assert.ok(recipient.includes('alice@example.test'));assert.ok(mail.includes('Message-ID: <walltaker-reset-73@example.test>'));assert.ok(mail.includes('multipart/alternative'));assert.ok(mail.includes('smtp-test-token'));assert.ok(mail.includes('Walltaker Password Reset'));
 }finally{await new Promise(resolve=>server.close(resolve));}
});
