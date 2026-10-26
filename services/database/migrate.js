import pg from 'pg';
import bcrypt from 'bcryptjs';
import {randomBytes,createHash} from 'node:crypto';
import {readFile,readdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve,join} from 'node:path';
import {spawnSync} from 'node:child_process';
const defaultDirectory=process.env.NODE_SCHEMA_DIR || fileURLToPath(new URL('../../db/',import.meta.url));
const digest=s=>createHash('sha256').update(s).digest('hex');
export async function validateBaseline(client,directory=defaultDirectory){
  const expected=JSON.parse(await readFile(join(directory,'baseline.json'),'utf8'));
  const {rows}=await client.query("SELECT table_name,column_name,udt_name,is_nullable FROM information_schema.columns WHERE table_schema='public'");
  const actual=new Map(rows.map(r=>[r.table_name+'.'+r.column_name,r]));
  for(const field of expected){const found=actual.get(field.table+'.'+field.column);if(!found||found.udt_name!==field.type||found.is_nullable!==field.nullable)throw Error('Baseline schema mismatch: '+field.table+'.'+field.column);}
}
export async function seed(client){
  const profiles=JSON.parse(await readFile(new URL('./system-profiles.json',import.meta.url),'utf8'));
  for(const username of ['apple','banana','cherry','evil',...Object.keys(profiles)]){
    if((await client.query('SELECT id FROM users WHERE lower(username)=lower($1)',[username])).rows.length)continue;
    const password=await bcrypt.hash(randomBytes(48).toString('base64url'),10);
    const mascot={PornLizardWarren:'warren',PornLizardTaylor:'taylor'}[username] || 'ki';
    const {rows:[user]}=await client.query('INSERT INTO users(username,email,password_digest,api_key,admin,system_account,mascot,details,created_at,updated_at) VALUES($1,$2,$3,$4,$5,true,$6,$7,now(),now()) RETURNING id',[username,username.toLowerCase()+'@system.invalid',password,randomBytes(4).toString('hex'),username==='PornBot',mascot,profiles[username] || '']);
    if(profiles[username]){const {rows:[profile]}=await client.query("INSERT INTO profiles(user_id,name,content,created_at,updated_at) VALUES($1,'Imported',$2,now(),now()) RETURNING id",[user.id,profiles[username]]);await client.query('UPDATE users SET profile_id=$2 WHERE id=$1',[user.id,profile.id]);}
  }
  if(!(await client.query('SELECT id FROM wallpaper_clients LIMIT 1')).rows.length){
    const clients=JSON.parse(await readFile(new URL('./clients.json',import.meta.url),'utf8'));
    for(const entry of clients){const keys=Object.keys(entry);await client.query(`INSERT INTO wallpaper_clients(${keys.join(',')},created_at,updated_at) VALUES(${keys.map((_,i)=>'$'+(i+1)).join(',')},now(),now())`,Object.values(entry));}
  }
  await client.query('INSERT INTO node_newsroom_states(id,created_at,updated_at) VALUES(1,now(),now()) ON CONFLICT DO NOTHING');
}
export async function migrate(pool,{check=false,logger=console,directory=defaultDirectory}={}){
  const client=await pool.connect();let locked=false;
  try{
    await client.query("SELECT pg_advisory_lock(hashtextextended('walltaker:node-schema:v1',0))");locked=true;
    const baseline=await readFile(join(directory,'schema.sql'),'utf8'),hash=digest(baseline);
    const exists=(await client.query("SELECT to_regclass('public.node_schema_migrations') AS name")).rows[0].name;
    if(check&&!exists)throw Error('Node database baseline has not been installed');
    if(!exists)await client.query('CREATE TABLE public.node_schema_migrations(version text PRIMARY KEY,checksum text NOT NULL,applied_at timestamptz NOT NULL DEFAULT now())');
    const applied=new Map((await client.query('SELECT version,checksum FROM public.node_schema_migrations')).rows.map(r=>[r.version,r.checksum]));
    if(applied.has('00000000000000')){if(applied.get('00000000000000')!==hash)throw Error('Applied baseline checksum changed');}
    else{
      if(check)throw Error('Node database baseline is pending');
      await client.query('BEGIN');
      try{
        const existing=(await client.query("SELECT to_regclass('public.users') AS name")).rows[0].name;
        if(existing)await validateBaseline(client,directory);
        else{await client.query(baseline);await client.query('SET search_path=public');await validateBaseline(client,directory);await seed(client);}
        await client.query('INSERT INTO public.node_schema_migrations(version,checksum) VALUES($1,$2)',['00000000000000',hash]);await client.query('COMMIT');
        logger.log(existing?'Validated and baselined the existing database; application records preserved.':'Created and seeded the Node database.');
      }catch(error){await client.query('ROLLBACK');throw error;}
    }
    const files=(await readdir(join(directory,'migrations'))).filter(f=>/^\d{14}_[a-z0-9_]+\.sql$/.test(f)).sort();
    const versions=new Set(['00000000000000']);
    for(const file of files){const version=file.slice(0,14);if(versions.has(version))throw Error('Duplicate migration version');versions.add(version);const sql=await readFile(join(directory,'migrations',file),'utf8'),checksum=digest(sql);
      if(applied.has(version)){if(applied.get(version)!==checksum)throw Error('Applied migration checksum changed: '+file);continue;}
      if(check)throw Error('Pending migration: '+file);
      await client.query('BEGIN');try{await client.query(sql);await client.query('INSERT INTO public.node_schema_migrations(version,checksum) VALUES($1,$2)',[version,checksum]);await client.query('COMMIT');logger.log('Applied '+file);}catch(error){await client.query('ROLLBACK');throw error;}
    }
    for(const version of applied.keys())if(!versions.has(version))throw Error('An applied migration is missing from this checkout: '+version);
  }finally{if(locked)await client.query("SELECT pg_advisory_unlock(hashtextextended('walltaker:node-schema:v1',0))");client.release();}
}
export function provision(env=process.env){
  const url=new URL(env.DATABASE_URL),roles=['wallpaper-api-reader','wallpaper-writer','link-manager','realtime','accounts','social','discovery','tracker','moderation','automation','activity','browser','delivery','blazer'];
  const pgEnv={...env,PGHOST:url.hostname,PGPORT:url.port || '5432',PGPASSWORD:decodeURIComponent(url.password),POSTGRES_USER:decodeURIComponent(url.username),POSTGRES_DB:decodeURIComponent(url.pathname.slice(1))};
  for(const role of roles){const result=spawnSync('sh',[join(fileURLToPath(new URL('../../scripts/',import.meta.url)),'provision-'+role+'.sh')],{env:pgEnv,encoding:'utf8',timeout:30000,maxBuffer:1024*1024});if(result.status!==0)throw Error('Database grants failed: '+role+' ('+(result.error?.code || result.status)+')');}
  console.log('Provisioned isolated Node service roles.');
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const pool=new pg.Pool({connectionString:process.env.DATABASE_URL,max:1,connectionTimeoutMillis:5000});
  try{await migrate(pool,{check:process.argv.includes('--check')});if(!process.argv.includes('--check'))provision();}
  catch(error){console.error('Database setup failed: '+(error.code || error.message));process.exitCode=1;}
  finally{await pool.end();}
}
