import test from 'node:test';
import assert from 'node:assert/strict';
import {filterProfileDomains} from '../src/profile-domains.js';
test('domain scrubbing preserves approved exceptions, editable Markdown and safe content while removing blocked HTML/CSS references',()=>{
 const rules=[{domain:'blocked.test',status:2},{domain:'safe.blocked.test',status:1}];
 const html='<a href="https://blocked.test/path">Blocked</a><img src="https://safe.blocked.test/a.png"><style>.x{background:url("https://blocked.test/x.png")}</style>';
 const result=filterProfileDomains(html,rules);assert.ok(!result.content.includes('https://blocked.test'));assert.ok(result.content.includes('https://safe.blocked.test'));assert.deepEqual(result.blocked_domains,['blocked.test']);
 const markdown='<!-- walltaker:markdown -->\n[Test](https://blocked.test/path) and **text**';const md=filterProfileDomains(markdown,rules);assert.ok(md.content.startsWith('<!-- walltaker:markdown -->'));assert.ok(md.content.includes('**text**'));assert.ok(!md.content.includes('https://blocked.test/path'));
 assert.equal(filterProfileDomains('<p>Safe</p>',rules).content,'<p>Safe</p>');
});
