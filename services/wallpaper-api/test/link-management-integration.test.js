import assert from 'node:assert/strict';
import test from 'node:test';
import pg from 'pg';
import { readFileSync } from 'node:fs';
import { createLinkManager } from '../src/link-manager.js';

test('wallpaper management transactions and production role grants in PostgreSQL', { skip: !process.env.TEST_DATABASE_URL }, async (t) => {
  const bootstrap = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL });
  let admin, manager;
  try {
    await bootstrap.query('CREATE DATABASE node_links_test');
    const url = new URL(process.env.TEST_DATABASE_URL); url.pathname = '/node_links_test';
    admin = new pg.Pool({ connectionString: url.href, max: 2 });
    await admin.query(`
      CREATE TABLE users (id bigserial PRIMARY KEY, email text, api_key text, password_digest text, deleted_at timestamptz,
        set_count integer DEFAULT 300,admin boolean DEFAULT false,mascot text,pervert boolean,viewing_link_id bigint,updated_at timestamptz);
      CREATE TABLE links (id bigserial PRIMARY KEY,user_id bigint NOT NULL REFERENCES users(id),expires timestamptz,terms varchar(255),
        blacklist varchar(255),friends_only boolean,never_expires boolean DEFAULT false,theme varchar(255),min_score integer,
        custom_url varchar(255),wizard_page text,ahoy_visit_id bigint,forked_from_id bigint REFERENCES links(id),post_url text,response_text text,
        created_at timestamptz NOT NULL,updated_at timestamptz NOT NULL);
      ALTER TABLE users ADD FOREIGN KEY(viewing_link_id) REFERENCES links(id);
      CREATE TYPE ability AS ENUM ('can_show_videos','can_be_set_by_porn_bot','can_be_set_by_lizard','is_kink_aligned','is_master_only');
      CREATE TABLE link_abilities(id bigserial PRIMARY KEY,link_id bigint REFERENCES links(id),ability ability,created_at timestamptz,updated_at timestamptz);
      CREATE TABLE friendships(id bigserial PRIMARY KEY,sender_id bigint,receiver_id bigint,confirmed boolean);
      CREATE TABLE surrenders(id bigserial PRIMARY KEY,user_id bigint,friendship_id bigint,pending boolean,expires_at timestamptz,accepted_consequences boolean);
      CREATE TABLE leashes(id bigserial PRIMARY KEY,friendship_id bigint,master_id bigint,pet_id bigint);
      CREATE TABLE comments(id bigserial PRIMARY KEY,link_id bigint REFERENCES links(id));
      CREATE TABLE history_events(id bigserial PRIMARY KEY,link_id bigint REFERENCES links(id));
      CREATE TABLE past_links(id bigserial PRIMARY KEY,link_id bigint REFERENCES links(id),post_url text);
      CREATE TABLE scoops(id bigserial PRIMARY KEY,link_id bigint REFERENCES links(id));
      CREATE TABLE emoji_link_decorations(id bigserial PRIMARY KEY,link_id bigint);
      CREATE TABLE node_link_events(id bigserial PRIMARY KEY,request_key varchar(160) UNIQUE CHECK(request_key<>'force-failure'),payload_digest varchar(64),
        link_id bigint,user_id bigint,operation text,result jsonb,delivered_at timestamptz,delivery_attempts integer DEFAULT 0,
        available_at timestamptz DEFAULT now(),created_at timestamptz,updated_at timestamptz);
      CREATE ROLE node_link_manager LOGIN PASSWORD 'test';
      INSERT INTO users(id,set_count) VALUES (1,300),(2,300),(3,300),(4,300),(5,299);
      UPDATE users SET deleted_at=now() WHERE id=4;
      INSERT INTO friendships(id,sender_id,receiver_id,confirmed) VALUES (1,1,3,true);
      INSERT INTO leashes(friendship_id,master_id,pet_id) VALUES (1,3,1);
    `);
    // Execute the GRANT statements from the deployment script, rather than a
    // separate approximation of the production permission set.
    const script = readFileSync(new URL('../../../scripts/provision-link-manager.sh', import.meta.url), 'utf8');
    for (const line of script.split('\n')) {
      const match = /^SELECT format\('(GRANT [^']+)', (.+)\) \\gexec$/.exec(line);
      if (!match) continue;
      let sql = match[1];
      for (const name of match[2].matchAll(/:'([^']+)'/g)) {
        sql = sql.replace('%I', '"' + (name[1] === 'database_name' ? 'node_links_test' : 'node_link_manager') + '"');
      }
      await admin.query(sql);
    }
    url.username = 'node_link_manager'; url.password = 'test';
    manager = new pg.Pool({ connectionString: url.href, max: 2 });
    const manage = createLinkManager(manager, { baseUrl: 'https://example.test' });
    let sequence = 0;
    const command = (operation, values = {}) => manage(operation, { actor_id: 1,request_key: 'test:' + (++sequence),...values });
    const settings = { never_expires: true,min_score: 0,blacklist: '',theme: '',friends_only: false };
    let first;
    await t.test('creation and retries persist one link and one durable event', async () => {
      const input = { actor_id: 1,request_key: 'create-once',ahoy_visit_id:42,attributes: { ...settings,custom_url: 'my-link' } };
      const [a,b] = await Promise.all([manage('create',input),manage('create',input)]);
      assert.equal(a.link.id,b.link.id); assert.equal([a,b].filter((result) => result.replayed).length,1);
      assert.equal((await admin.query('SELECT count(*) AS n FROM links')).rows[0].n,'1');
      first = a.link;
      assert.equal(first.custom_url,'my-link'); assert.equal(first.ahoy_visit_id,'42'); assert.ok(a.event_id);
    });
    await t.test('validation rejects invalid settings without creating links or events', async () => {
      const before = (await admin.query('SELECT count(*) AS n FROM node_link_events')).rows[0].n;
      for (const attributes of [{ min_score:0 },{ ...settings,theme:'two tags' },{ ...settings,min_score:301 },{ ...settings,user_id:2 }]) {
        await assert.rejects(command('create',{ attributes }),{ status:422 });
      }
      assert.equal((await admin.query('SELECT count(*) AS n FROM node_link_events')).rows[0].n,before);
    });
    await t.test('custom URLs respect the credit threshold and are unique under concurrent edits', async () => {
      const low = await command('create',{ actor_id:5,attributes:{ ...settings,custom_url:'ignored' } });
      assert.equal(low.link.custom_url,null);
      const other = await command('create',{ actor_id:2,attributes:settings });
      const updates = await Promise.allSettled([
        command('update',{ link_id:first.id,attributes:{ custom_url:'shared' } }),
        command('update',{ actor_id:2,link_id:other.link.id,attributes:{ custom_url:'shared' } }),
      ]);
      assert.equal(updates.filter((result) => result.status==='fulfilled').length,1);
      assert.equal(updates.find((result) => result.status==='rejected').reason.status,422);
    });
    await t.test('ownership, active users and restricted attributes are enforced in Node', async () => {
      await assert.rejects(command('update',{ actor_id:2,link_id:first.id,attributes:{ terms:'bad' } }),{ status:403 });
      await assert.rejects(command('destroy',{ actor_id:2,link_id:first.id }),{ status:403 });
      await assert.rejects(command('create',{ actor_id:4,attributes:settings }),{ status:403 });
      await assert.rejects(command('update',{ link_id:first.id,attributes:{ post_url:'injected' } }),{ status:422 });
      const saved = await command('update',{ link_id:first.id,attributes:{ theme:'forest',min_score:42,never_expires:'1',friends_only:'0' } });
      assert.equal(saved.link.theme,'forest'); assert.equal(saved.link.min_score,42);
    });
    await t.test('abilities toggle atomically, retries do not retoggle, and master-only permissions are preserved', async () => {
      const input = { actor_id:1,link_id:first.id,ability:'can_show_videos',request_key:'toggle-once' };
      const [a,b] = await Promise.all([manage('toggle-ability',input),manage('toggle-ability',input)]);
      assert.equal(a.enabled,true); assert.equal(b.enabled,true);
      assert.equal((await admin.query('SELECT count(*) AS n FROM link_abilities')).rows[0].n,'1');
      await assert.rejects(command('toggle-ability',{ actor_id:2,link_id:first.id,ability:'can_show_videos' }),{ status:403 });
      await assert.rejects(command('toggle-ability',{ link_id:first.id,ability:'is_master_only' }),{ status:403 });
      assert.equal((await command('toggle-ability',{ actor_id:3,link_id:first.id,ability:'is_master_only' })).enabled,true);
      await assert.rejects(command('toggle-ability',{ link_id:first.id,ability:'unknown' }),{ status:422 });
    });
    await t.test('active surrender blocks ordinary mutation and verifies delegated sessions', async () => {
      await admin.query("INSERT INTO surrenders(id,user_id,friendship_id,pending,accepted_consequences,expires_at) VALUES(1,1,1,false,true,now()+interval '1 hour')");
      await assert.rejects(command('update',{ link_id:first.id,attributes:{ terms:'blocked' } }),{ status:403 });
      assert.equal((await command('update',{ link_id:first.id,surrender_id:1,attributes:{ terms:'delegated' } })).link.terms,'delegated');
      await assert.rejects(command('update',{ link_id:first.id,surrender_id:2,attributes:{} }),{ status:403 });
      await admin.query('DELETE FROM surrenders');
    });
    await t.test('wizard moves through every step and commits profile preferences with link settings', async () => {
      let current = (await command('wizard-start')).link;
      assert.equal(current.wizard_page,'intro');
      const steps = [['intro',{ gooner:'true' }],['summon',{ impatient:'true' }],['control',{ protect:'3' }],
        ['kinks',{ terms:'Test description' }],['gender',{ blacklisted_genders:['female'],blacklisted_parts:[],blacklisted_sexualities:[] }],
        ['surprise',{ theme:'forest ' }],['no_fun',{ friends_only:'true' }]];
      for (const [step,choices] of steps) {
        const result = await command('wizard-apply',{ link_id:current.id,step,choices }); current=result.link;
      }
      assert.equal(current.wizard_page,null); assert.equal(current.friends_only,true); assert.equal(current.theme,'forest');
      assert.equal(current.min_score,15); assert.match(current.blacklist,/female_focus girly/);
      const user = (await admin.query('SELECT mascot,pervert FROM users WHERE id=1')).rows[0];
      assert.equal(user.mascot,'warren'); assert.equal(user.pervert,true);
      await assert.rejects(command('wizard-apply',{ link_id:current.id,step:'intro',choices:{} }),{ status:409 });
    });
    await t.test('wizard retries and failures cannot partially advance or change profile preferences', async () => {
      const wizard = (await command('wizard-start')).link;
      const before = (await admin.query('SELECT mascot,pervert FROM users WHERE id=1')).rows[0];
      await assert.rejects(command('wizard-apply',{ link_id:wizard.id,step:'intro',choices:{ gooner:'true' },request_key:'force-failure' }),{ code:'23514' });
      assert.deepEqual((await admin.query('SELECT mascot,pervert FROM users WHERE id=1')).rows[0],before);
      assert.equal((await admin.query('SELECT wizard_page FROM links WHERE id=$1',[wizard.id])).rows[0].wizard_page,'intro');
      const input = { actor_id:1,link_id:wizard.id,step:'intro',choices:{ gooner:'false' },request_key:'wizard-retry' };
      const [a,b] = await Promise.all([manage('wizard-apply',input),manage('wizard-apply',input)]);
      assert.equal(a.link.min_score,50); assert.equal(b.link.min_score,50);
    });
    await t.test('deletion retains wallpaper history, detaches dependencies, and is idempotent', async () => {
      const doomed = (await command('create',{ attributes:settings })).link;
      const child = (await command('create',{ attributes:settings })).link;
      await admin.query(`UPDATE users SET viewing_link_id=$1 WHERE id=2;
        `,[doomed.id]);
      await admin.query('UPDATE links SET forked_from_id=$1 WHERE id=$2',[doomed.id,child.id]);
      for (const table of ['comments','history_events','past_links','scoops','emoji_link_decorations']) await admin.query(`INSERT INTO ${table}(link_id) VALUES($1)`,[doomed.id]);
      const input = { actor_id:1,link_id:doomed.id,request_key:'delete-once' };
      await manage('destroy',input); assert.equal((await manage('destroy',input)).replayed,true);
      assert.equal((await admin.query('SELECT id FROM links WHERE id=$1',[doomed.id])).rowCount,0);
      assert.equal((await admin.query('SELECT link_id FROM past_links')).rows[0].link_id,null);
      assert.equal((await admin.query('SELECT link_id FROM scoops')).rows[0].link_id,null);
      assert.equal((await admin.query('SELECT viewing_link_id FROM users WHERE id=2')).rows[0].viewing_link_id,null);
      assert.equal((await admin.query('SELECT forked_from_id FROM links WHERE id=$1',[child.id])).rows[0].forked_from_id,null);
      assert.equal((await admin.query('SELECT count(*) AS n FROM comments')).rows[0].n,'0');
    });
    await t.test('a failed delete transaction restores the link and all dependencies', async () => {
      const doomed = (await command('create',{ attributes:settings })).link;
      await admin.query('INSERT INTO comments(link_id) VALUES($1)',[doomed.id]);
      await assert.rejects(command('destroy',{ link_id:doomed.id,request_key:'force-failure' }),{ code:'23514' });
      assert.equal((await admin.query('SELECT id FROM links WHERE id=$1',[doomed.id])).rowCount,1);
      assert.equal((await admin.query('SELECT id FROM comments WHERE link_id=$1',[doomed.id])).rowCount,1);
    });
    await t.test('lists are scoped, exports preserve clients, and grants deny credentials and receipts', async () => {
      assert.equal((await manage('list',{ actor_id:1 })).links.every((link) => link.user_id==='1'),true);
      assert.match((await manage('export',{ link_id:first.id })).text,/base = "https:\/\/example.test\/links\/"/);
      for (const sql of ['SELECT api_key FROM users','SELECT email FROM users','UPDATE users SET admin=true',
        "UPDATE links SET post_url='injected'",'DELETE FROM users','UPDATE node_link_events SET delivered_at=now()']) {
        await assert.rejects(manager.query(sql),{ code:'42501' });
      }
    });
  } finally { await Promise.all([manager?.end(),admin?.end(),bootstrap.end()]); }
});
