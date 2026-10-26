import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import {randomBytes} from 'node:crypto';
import {mkdtemp,cp,writeFile,rm,unlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {setTimeout} from 'node:timers/promises';
import {join} from 'node:path';
import {migrate} from '../migrate.js';
test('Node schema setup handles fresh/existing data, locks, SQL migrations, rollback and checksums',{skip:!process.env.TEST_DATABASE_URL},async()=>{
  const boot=new pg.Pool({connectionString:process.env.TEST_DATABASE_URL,max:1}),name='node_schema_'+randomBytes(5).toString('hex');let pool,directory;
  try{
    await boot.query('CREATE DATABASE '+name);const url=new URL(process.env.TEST_DATABASE_URL);url.pathname='/'+name;pool=new pg.Pool({connectionString:url.href,max:2});
    directory=await mkdtemp(join(tmpdir(),'node-schema-'));await cp(process.env.NODE_SCHEMA_DIR,directory,{recursive:true});const options={directory,logger:{log(){}}};
    await migrate(pool,options);await migrate(pool,{...options,check:true});
    assert.ok((await pool.query("SELECT similarity('native','native') AS score")).rows[0].score>0.9);
    assert.equal((await pool.query('SELECT count(*) FROM users')).rows[0].count,'8');assert.equal((await pool.query('SELECT count(*) FROM wallpaper_clients')).rows[0].count,'19');
    await pool.query("UPDATE users SET details='preserve account content' WHERE username='evil'");await pool.query('DELETE FROM node_schema_migrations');await migrate(pool,options);
    assert.equal((await pool.query("SELECT details FROM users WHERE username='evil'")).rows[0].details,'preserve account content');
    await writeFile(join(directory,'migrations','00000000000001_probe.sql'),'CREATE TABLE migration_probe(id bigint);');
    await assert.rejects(migrate(pool,{...options,check:true}),/Pending migration/);
    await Promise.all([migrate(pool,options),migrate(pool,options)]);assert.equal((await pool.query("SELECT count(*) FROM node_schema_migrations WHERE version='00000000000001'")).rows[0].count,'1');
    await writeFile(join(directory,'migrations','00000000000002_failure.sql'),'CREATE TABLE partial_migration(id bigint); SELECT 1/0;');await assert.rejects(migrate(pool,options),{code:'22012'});
    assert.equal((await pool.query("SELECT to_regclass('public.partial_migration') AS name")).rows[0].name,null);await unlink(join(directory,'migrations','00000000000002_failure.sql'));
    await writeFile(join(directory,'migrations','00000000000001_probe.sql'),'SELECT 1;');await assert.rejects(migrate(pool,options),/checksum changed/);
    await pool.query("UPDATE node_schema_migrations SET checksum='tampered' WHERE version='00000000000000'");await assert.rejects(migrate(pool,options),/baseline checksum/);
  }finally{await pool?.end();for(let attempt=0;attempt<20;attempt++){try{await boot.query('DROP DATABASE IF EXISTS '+name);break;}catch(error){if(error.code!=='55006'||attempt===19)throw error;await setTimeout(25);}}await boot.end();if(directory)await rm(directory,{recursive:true,force:true});}
});
