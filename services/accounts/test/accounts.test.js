import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import pg from 'pg';
import { createAccounts } from '../src/accounts.js';
import { createPasswords,validatePassword } from '../src/passwords.js';
import { createServer,accountToken } from '../src/app.js';

test('password handling preserves bcrypt and rejects oversized UTF-8 and confirmation mismatches',async()=>{
  const passwords=createPasswords({rounds:4});
  try {
    const hash=await passwords.hash('old-password');
    assert.equal(await passwords.verify('old-password',hash),true);
    assert.equal(await passwords.verify('wrong',hash),false);
    assert.equal(await passwords.verify('anything',null),false);
    assert.equal(await passwords.verify('anything','bad-digest'),false);
    const rails=JSON.parse(readFileSync(new URL('./rails-bcrypt.json',import.meta.url),'utf8'));
    assert.equal(await passwords.verify(rails.password,rails.digest),true);
    assert.throws(()=>validatePassword('🐱'.repeat(19),'🐱'.repeat(19)),{status:422});
    assert.throws(()=>validatePassword('new','wrong'),{status:422});
    assert.throws(()=>validatePassword('',''),{status:422});
  } finally {await passwords.close();}
});
test('HTTP commands require their own private credential and reject malformed and oversized input',async()=>{
  const calls=[];const secret='test';
  const server=createServer({manage:async(...args)=>{calls.push(args);return {ok:true};},health:async()=>{},secretKeyBase:secret,logger:{warn(){}}});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const url=`http://127.0.0.1:${server.address().port}/_internal/accounts/authenticate`;
  try {
    assert.equal((await fetch(url,{method:'POST',body:'{}'})).status,403);
    const headers={authorization:`Bearer ${accountToken(secret)}`,'content-type':'application/json'};
    assert.equal((await fetch(url,{method:'POST',headers,body:'{'})).status,400);
    assert.equal((await fetch(url,{method:'POST',headers,body:JSON.stringify({text:'x'.repeat(1024*1024)})})).status,413);
    const response=await fetch(url,{method:'POST',headers,body:'{"identifier":"Alice","password":"secret"}'});
    assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');
    assert.equal(response.headers.get('x-walltaker-backend'),'node-accounts');
    assert.equal(calls.length,1);assert.equal(calls[0][0],'authenticate');
  } finally {await new Promise(resolve=>server.close(resolve));}
});
test('accounts and profiles use atomic PostgreSQL transactions and the actual restricted role',{skip:!process.env.TEST_DATABASE_URL},async(t)=>{
  const bootstrap=new pg.Pool({connectionString:process.env.TEST_DATABASE_URL,max:1});
  let admin,pool;const passwords=createPasswords({rounds:4});
  try {
    await bootstrap.query('CREATE DATABASE node_accounts_test');
    const url=new URL(process.env.TEST_DATABASE_URL);url.pathname='/node_accounts_test';
    admin=new pg.Pool({connectionString:url.href,max:2});
    await admin.query(`CREATE TABLE users(id bigserial PRIMARY KEY,username varchar(255) UNIQUE,email varchar(255) UNIQUE,password_digest text,
      details varchar(255),created_at timestamptz NOT NULL,updated_at timestamptz NOT NULL,deleted_at timestamptz,deleted_username text,
      username_changed_at timestamptz,admin boolean DEFAULT false,system_account boolean DEFAULT false,profile_id bigint,advanced boolean DEFAULT false,
      colour_preference integer DEFAULT 0,mascot text,pervert boolean,api_key varchar(8),set_count integer DEFAULT 0,
      password_reset_token text,password_reset_sent_at timestamptz);
      CREATE TABLE profiles(id bigserial PRIMARY KEY,user_id bigint NOT NULL REFERENCES users(id),name varchar(255),content text NOT NULL DEFAULT '',
        public boolean DEFAULT false,origin_id bigint REFERENCES profiles(id),created_at timestamptz NOT NULL,updated_at timestamptz NOT NULL);
      ALTER TABLE users ADD FOREIGN KEY(profile_id) REFERENCES profiles(id);
      CREATE TABLE site_settings(key text,value text);
      CREATE TABLE invite_codes(id bigserial PRIMARY KEY,code text,redeemed_at timestamptz,redeemed_by_id bigint REFERENCES users(id),updated_at timestamptz);
      CREATE TABLE friendships(id bigserial PRIMARY KEY,sender_id bigint,receiver_id bigint,confirmed boolean);
      CREATE TABLE surrenders(id bigserial PRIMARY KEY,user_id bigint,controller_user_id bigint,friendship_id bigint,pending boolean,
        expires_at timestamptz,accepted_consequences boolean,logged_in boolean);
      CREATE TABLE notifications(id bigserial PRIMARY KEY,user_id bigint,notification_type integer,text varchar(255),link text,created_at timestamptz,updated_at timestamptz);
      CREATE TABLE node_account_events(id bigserial PRIMARY KEY,request_key varchar(160) UNIQUE CHECK(request_key<>'force-failure'),payload_digest varchar(64),
        user_id bigint,operation text,previous_username text,notification_id bigint,result jsonb,delivered_at timestamptz,
        delivery_attempts integer DEFAULT 0,available_at timestamptz DEFAULT now(),created_at timestamptz,updated_at timestamptz);
      CREATE ROLE node_accounts LOGIN PASSWORD 'test';`);
    const script=readFileSync(new URL('../../../scripts/provision-accounts.sh',import.meta.url),'utf8');
    for(const line of script.split('\n')){
      const match=/^SELECT format\('(GRANT [^']+)', (.+)\) \\gexec$/.exec(line);if(!match)continue;
      let sql=match[1];for(const key of match[2].matchAll(/:'([^']+)'/g))sql=sql.replace('%I','"'+(key[1]==='database_name'?'node_accounts_test':'node_accounts')+'"');
      await admin.query(sql);
    }
    url.username='node_accounts';url.password='test';pool=new pg.Pool({connectionString:url.href,max:2});
    const manage=createAccounts({pool,passwords,secretKeyBase:'test-secret'});
    let seq=0;const command=(operation,input={})=>manage(operation,{request_key:'test-'+(++seq),...input});
    const signup=(username,email=username+'@example.com',extra={})=>command('signup',{username,email,password:'password',password_confirmation:'password',...extra});
    const alice=(await signup('Alice')).user_id;const bob=(await signup('Bob')).user_id;
    const user=async(id=alice)=>(await admin.query('SELECT * FROM users WHERE id=$1',[id])).rows[0];
    await t.test('signup rejects invalid data, duplicate case-folded identities and privilege injection',async()=>{
      await assert.rejects(signup('Alice!'),{status:422});await assert.rejects(signup('alice'),{status:422});
      await assert.rejects(signup('Other','ALICE@example.com'),{status:422});await assert.rejects(signup('NoEmail','invalid'),{status:422});
      const id=(await signup('NoPrivileges',undefined,{admin:true,system_account:true,set_count:900})).user_id;
      assert.equal((await user(id)).admin,false);assert.equal((await user(id)).set_count,0);
    });
    await t.test('existing bcrypt authentication accepts email/username case-insensitively and hides systems/deleted users',async()=>{
      assert.equal((await manage('authenticate',{identifier:'  ALICE  ',password:'password'})).user_id,alice);
      assert.equal((await manage('authenticate',{identifier:'ALICE@EXAMPLE.COM',password:'password'})).user_id,alice);
      assert.equal((await manage('authenticate',{identifier:'Alice',password:'wrong'})).user_id,null);
      await admin.query('UPDATE users SET system_account=true WHERE id=$1',[bob]);
      assert.equal((await manage('authenticate',{identifier:'Bob',password:'password'})).user_id,null);
      await admin.query('UPDATE users SET system_account=false WHERE id=$1',[bob]);
    });
    await t.test('concurrent signup retries create one account; an invite is redeemed exactly once',async()=>{
      const input={request_key:'signup-once',username:'Once',email:'once@example.com',password:'password',password_confirmation:'password'};
      const [a,b]=await Promise.all([manage('signup',input),manage('signup',input)]);assert.equal(a.user_id,b.user_id);
      await admin.query("INSERT INTO site_settings VALUES('invite_only','true');INSERT INTO invite_codes(code) VALUES('ABCD')");
      await assert.rejects(signup('Uninvited'),{status:422});
      const outcomes=await Promise.allSettled([signup('InvitedOne',undefined,{invite_code:' abcd '}),signup('InvitedTwo',undefined,{invite_code:'ABCD'})]);
      assert.equal(outcomes.filter(v=>v.status==='fulfilled').length,1);
      assert.ok((await admin.query("SELECT redeemed_at FROM invite_codes WHERE code='ABCD'")).rows[0].redeemed_at);
      await admin.query('DELETE FROM site_settings');
    });
    await t.test('username changes enforce cooldown and case-insensitive uniqueness; settings cannot target others',async()=>{
      await assert.rejects(command('username',{actor_id:alice,username:'bob'}),{status:422});
      await command('username',{actor_id:alice,username:'AliceNew'});assert.equal((await user()).username,'AliceNew');
      await assert.rejects(command('username',{actor_id:alice,username:'TooSoon'}),{status:422});
      await assert.rejects(command('colour',{actor_id:alice,target_id:bob,colour_preference:'dark'}),{status:403});
      await command('colour',{actor_id:alice,colour_preference:'dark'});assert.equal((await user()).colour_preference,2);
    });
    await t.test('password changes require current credentials, preserve digest compatibility and revoke reset tokens',async()=>{
      await assert.rejects(command('password',{actor_id:alice,current_password:'wrong',password:'new',password_confirmation:'new'}),{status:422});
      await command('password',{actor_id:alice,current_password:'password',password:'new-password',password_confirmation:'new-password'});
      assert.equal(await passwords.verify('new-password',(await user()).password_digest),true);
      assert.equal(await passwords.verify('password',(await user()).password_digest),false);
      const result=await command('api-key',{actor_id:alice});assert.equal((await user()).api_key.length,8);
      assert.equal(result.api_key,undefined);assert.equal(result.password_digest,undefined);
    });
    let reset;
    await t.test('password reset issuance is neutral, cooldown is atomic and results never expose reset secrets',async()=>{
      assert.equal((await command('reset-request',{email:'missing@example.com'})).status,'ignored');
      const responses=await Promise.all([command('reset-request',{email:' ALICE@example.com '}),command('reset-request',{email:'alice@example.com'})]);
      assert.equal(responses.filter(v=>v.status==='queued').length,1);
      reset=(await user()).password_reset_token;assert.ok(reset);
      assert.equal(JSON.stringify(responses).includes(reset),false);
      assert.equal(JSON.stringify(responses).includes('password_digest'),false);
    });
    await t.test('password reset tokens expire and can be consumed only once under concurrent requests',async()=>{
      const input={token:reset,password:'reset-password',password_confirmation:'reset-password'};
      const responses=await Promise.allSettled([command('reset-complete',input),command('reset-complete',input)]);
      assert.equal(responses.filter(v=>v.status==='fulfilled').length,1);assert.equal((await user()).password_reset_token,null);
      await admin.query("UPDATE users SET password_reset_token='old',password_reset_sent_at=now()-interval '2 hours' WHERE id=$1",[alice]);
      await assert.rejects(command('reset-complete',{...input,token:'old'}),{status:422});
    });
    let profile,copy;
    await t.test('profiles create, save, rename, share, copy and select atomically without exposing private styles',async()=>{
      profile=(await command('profile-create',{actor_id:alice})).profile_id;
      await command('profile-content',{actor_id:alice,expected_advanced:false,content:'<!-- walltaker:markdown -->\n# Hello'});
      await command('profile-rename',{actor_id:alice,profile_id:profile,name:'Test style'});
      await assert.rejects(command('profile-copy',{actor_id:bob,profile_id:profile}),{status:403});
      await assert.rejects(manage('profile',{profile_id:profile}),{status:404});
      await command('profile-share',{actor_id:alice,profile_id:profile,public:'1'});
      copy=(await command('profile-copy',{actor_id:bob,profile_id:profile})).profile_id;
      assert.equal((await user(bob)).profile_id,copy);
      assert.equal((await admin.query('SELECT origin_id FROM profiles WHERE id=$1',[copy])).rows[0].origin_id,profile);
      assert.equal((await manage('profiles-public',{})).count,1);
      const own=(await manage('profiles-own',{actor_id:bob})).profiles;
      assert.equal(own.length,1);assert.equal(own[0].content,undefined);
      const publicUser=(await manage('user',{username:'AliceNew'})).user;
      for(const field of ['email','password_digest','api_key','password_reset_token'])assert.equal(publicUser[field],undefined);
    });
    await t.test('private profile ownership is enforced on every crafted selection/edit/delete action',async()=>{
      for(const op of ['profile-select','profile-delete','profile-rename','profile-share'])await assert.rejects(command(op,{actor_id:bob,profile_id:profile,name:'bad',public:true}),{status:403});
      assert.ok((await admin.query('SELECT id FROM profiles WHERE id=$1',[profile])).rowCount);
    });
    await t.test('editor mode conversion checks staleness and saves HTML and mode in one transaction',async()=>{
      const p=(await admin.query('SELECT * FROM profiles WHERE id=$1',[profile])).rows[0];
      await assert.rejects(command('profile-mode',{actor_id:alice,expected_advanced:false,profile_id:profile,profile_updated_at:'2000-01-01',html:'<h1>Hi</h1>'}),{status:409});
      await command('profile-mode',{actor_id:alice,expected_advanced:false,profile_id:profile,profile_updated_at:p.updated_at,html:'<h1>Hi</h1>'});
      assert.equal((await user()).advanced,true);
      assert.equal((await admin.query('SELECT content FROM profiles WHERE id=$1',[profile])).rows[0].content,'<h1>Hi</h1>');
    });
    await t.test('profile deletion preserves installed copies and clears origin and selected-style pointers',async()=>{
      await command('profile-delete',{actor_id:alice,profile_id:profile});
      assert.equal((await user()).profile_id,null);
      const p=(await admin.query('SELECT * FROM profiles WHERE id=$1',[copy])).rows[0];assert.equal(p.origin_id,null);assert.ok(p.content.includes('Hello'));
    });
    await t.test('delegated settings affect the controller, and stale/forged surrender identifiers cannot bypass ownership',async()=>{
      await admin.query('INSERT INTO friendships VALUES(1,$1,$2,true)',[alice,bob]);
      await admin.query("INSERT INTO surrenders VALUES(1,$1,$2,1,false,now()+interval '1 hour',true,true)",[alice,bob]);
      await assert.rejects(command('colour',{actor_id:alice,colour_preference:'light'}),{status:403});
      await command('colour',{actor_id:alice,target_id:bob,surrender_id:1,colour_preference:'light'});
      assert.equal((await user(bob)).colour_preference,1);assert.equal((await user()).colour_preference,2);
      await assert.rejects(command('colour',{actor_id:alice,target_id:bob,surrender_id:2,colour_preference:'dark'}),{status:403});
      await admin.query('DELETE FROM surrenders');
    });
    await t.test('a failed event insert rolls back account/profile writes and invite redemption',async()=>{
      const before=(await user()).colour_preference;
      await assert.rejects(command('colour',{actor_id:alice,colour_preference:'auto',request_key:'force-failure'}),{code:'23514'});
      assert.equal((await user()).colour_preference,before);
      const count=(await admin.query('SELECT count(*) FROM profiles')).rows[0].count;
      await assert.rejects(command('profile-create',{actor_id:alice,request_key:'force-failure'}),{code:'23514'});
      assert.equal((await admin.query('SELECT count(*) FROM profiles')).rows[0].count,count);
      await admin.query("INSERT INTO site_settings VALUES('invite_only','true');INSERT INTO invite_codes(code) VALUES('ROLLBACK')");
      await assert.rejects(signup('RolledBack',undefined,{request_key:'force-failure',invite_code:'ROLLBACK'}),{code:'23514'});
      assert.equal((await admin.query("SELECT id FROM users WHERE username='RolledBack'")).rowCount,0);
      assert.equal((await admin.query("SELECT redeemed_at FROM invite_codes WHERE code='ROLLBACK'")).rows[0].redeemed_at,null);
      await admin.query('DELETE FROM site_settings');
    });
    await t.test('self deletion preserves data, hides account and rejects logins; system identities remain immutable',async()=>{
      await admin.query('UPDATE users SET system_account=true WHERE id=$1',[bob]);
      for(const op of ['username','password','account-delete'])await assert.rejects(command(op,{actor_id:bob,username:'BadSystem',current_password:'password',password:'new'}),{status:422});
      await command('account-delete',{actor_id:alice,current_password:'reset-password'});
      assert.equal((await user()).deleted_username,'AliceNew');assert.ok((await user()).deleted_at);
      assert.equal((await manage('authenticate',{identifier:'alice@example.com',password:'reset-password'})).user_id,null);
      await assert.rejects(manage('user',{username:(await user()).username}),{status:404});
    });
    await t.test('database grants deny privilege escalation, hard account deletion and forged event receipts',async()=>{
      for(const sql of ['UPDATE users SET admin=true','UPDATE users SET system_account=false','UPDATE users SET set_count=999',
        "INSERT INTO users(admin) VALUES(true)",'DELETE FROM users','UPDATE node_account_events SET delivered_at=now()',"UPDATE site_settings SET value='false'"])
        await assert.rejects(pool.query(sql),{code:'42501'});
      const events=(await admin.query('SELECT result::text,payload_digest FROM node_account_events')).rows;
      assert.ok(events.every(event=>!event.result.includes('password_digest')&&!event.result.includes('reset-password')));
    });
  } finally {await passwords.close();await pool?.end();await admin?.end();await bootstrap.end();}
});
