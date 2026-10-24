import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createUserReader } from '../src/users.js';
const fixture = JSON.parse(readFileSync(new URL('./fixtures/rails.json', import.meta.url)));
const users = JSON.parse(readFileSync(new URL('./fixtures/users.json', import.meta.url)));

test('all four user-status audiences match JSON produced by Rails', async () => {
  for (const [audience, viewerId] of [['anonymous',null],['authenticated','2'],['friend','3'],['self',String(fixture.row.id)]]) {
    const pool = { query: async (sql) => {
      if (sql.includes('username = $1')) return { rows:[{ ...users.anonymous, id:String(fixture.row.id) }] };
      if (sql.includes('SELECT id FROM users')) return { rows:[{ id:viewerId }] };
      if (sql.includes('SELECT 1 FROM friendships')) return { rowCount:audience === 'friend' ? 1 : 0 };
      if (sql.includes('l.flair')) return { rows:[{ flair:'Fixture flair',username:'FixtureMaster' }] };
      return { rows:[{ username:'FixturePet' }] };
    } };
    const read = createUserReader({ ...fixture, pool,
      repository:{ forUser:async () => [{ ...fixture.row,friends_only:false }] },
      store:{ connected:async () => new Set() },
    });
    assert.deepEqual(await read({ username:'FixtureOwner',viewerId }),users[audience]);
  }
});
