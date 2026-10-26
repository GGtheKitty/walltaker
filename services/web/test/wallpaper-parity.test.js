import {test} from 'node:test';
import assert from 'node:assert/strict';
import copy from './fixtures/original-copy.json' with {type:'json'};
import {parseDocument} from 'htmlparser2';
import {form,setup,show,list,selector,e621,e621Results,kinkTools,card} from '../src/templates/wallpaper.js';
import {html} from '../src/templates/html.js';

const user={id:7,username:'CopyReview',set_count:400,mascot:'ki',pervert:false};
const link={id:12,user_id:7,never_expires:true,min_score:0,blacklist:'',terms:'',expires:null};
const view=(changes={})=>({user,users:new Map([['7',user]]),link,links:[link],graph:{users:[user],memberships:[{id:1,user_id:'7',kink_id:'21',is_starred:true}],kinks:[{id:21,name:'test_kink',works_on_e621:true}],abilities:[],past_links:[]},flash:{},baseUrl:'http://localhost',csrf:'test',asset:name=>'/node-assets/'+name,media:url=>url,stream:()=>html``,globalStream:()=>'',posts:[],tags:'',...changes});
const text=value=>String(value).replace(/<[^>]*>/g,' ').replace(/&gt;/g,'>').replace(/&lt;/g,'<').replace(/&#39;/g,"'").replace(/&quot;/g,'"').replace(/&amp;/g,'&').replace(/\s+/g,' ').trim();
function elements(root,predicate){const found=[];function walk(node){if(node.type==='tag'&&predicate(node))found.push(node);for(const child of node.children || [])walk(child);}walk(root);return found;}
const byId=(root,id)=>elements(root,node=>node.attribs.id===id)[0];

test('native new/edit forms retain the original paragraphs and CSS-targeted controls',async()=>{
  for(const creating of [true,false]){
    const output=String(form(view({creating}))),dom=parseDocument(output);
    for(const paragraph of (creating?copy.linkFormNew:copy.linkFormEdit))assert.ok(text(output).includes(paragraph),paragraph);
    const label=elements(dom,node=>node.name==='label'&&node.attribs.for==='link_blacklist')[0];assert.match(label.attribs.style,/display:\s*block/);
    assert.equal(byId(dom,'link_blacklist').attribs.type,'text');assert.equal(byId(dom,'link_terms').attribs.rows,'5');assert.equal(byId(dom,'link_custom_url').attribs.type,'text');assert.equal(byId(dom,'link_theme').attribs.type,'text');
    const row=elements(dom,node=>node.attribs.class==='link--form--submit-row')[0];const submits=row.children.filter(node=>node.type==='tag');assert.deepEqual(submits.map(n=>[n.name,n.attribs.type,n.attribs.value]),[['input','submit',creating?'Create Link':'Update Link'],['input','submit','Update and Test']]);assert.equal(submits[1].attribs.class,'secondary');
    assert.ok(text(output).includes('Requires the silver trophy (set >300 wallpapers for others)'));
  }
});
test('all mascot toggle names and original descriptions survive enabled and disabled states',async()=>{
  for(const mascot of ['ki','warren','taylor'])for(const pervert of [false,true])for(const enabled of [false,true]){
    const selected={...user,mascot,pervert},name=mascot[0].toUpperCase()+mascot.slice(1),v=view({user:selected});v.graph.abilities=enabled?[{link_id:12,ability:'can_be_set_by_lizard'}]:[];
    const output=text(form(v));assert.ok(output.includes(`${pervert?'Perverted ':''}${name} is ${enabled?'welcomed':'turned away'}`));assert.ok(output.includes((enabled?'Disallow ':'Allow ')+name));
    if(enabled)assert.ok(output.includes(copy.lizardDescriptions[mascot+':'+pervert]),mascot+' '+pervert);
  }
});
test('setup preserves original instructions, download/widget presentation and starts collapsed',async()=>{
  const output=String(setup(view(),link)),dom=parseDocument(output);
  assert.match(output,/data-accordion-expand-value="false"/);assert.match(output,/data-accordion-target="content" style="display: none"/);
  for(const paragraph of copy.linkSetup)assert.ok(text(output).includes(paragraph),paragraph);
  assert.ok(text(output).includes('either enter your Feed ID: "12" or import one of the following files:'));
  const configs=elements(dom,node=>node.attribs.class==='client-configs')[0];assert.ok(configs);const widget=elements(configs,node=>node.attribs['data-controller']==='widget-installer')[0];assert.equal(widget.attribs.class,'as-link no-underline');assert.ok(elements(configs,node=>node.name==='a'&&'download' in node.attribs).length);assert.ok(text(output).includes('Install iOS Widget beta'));
});
test('list/detail toolbars keep un-underlined links and visible heading icon spacing',()=>{
  const output=String(list(view())),dom=parseDocument(output);assert.match(output,/<ion-icon[^>]+name="document"[^>]*><\/ion-icon> Your Links/);
  assert.equal(elements(dom,node=>node.name==='a'&&node.attribs.href==='/links/wizard')[0].attribs.class,'no-underline');
  const detailDom=parseDocument(String(show(view())));assert.equal(elements(detailDom,node=>node.name==='a'&&node.attribs.href==='/links/12/edit')[0].attribs.class,'no-underline');
});
test('e621 uses original search field selectors, nested styled kink chips, stars and empty initial results',async()=>{
  const v=view(),output=String(e621(v)),dom=parseDocument(output);assert.equal(byId(dom,'tags').attribs.type,'text');assert.equal(byId(dom,'tags').attribs.name,'tags');
  assert.ok(text(output).includes("Some of CopyReview's kinks:"));const kink=byId(dom,'kink_21');assert.equal(kink.attribs.class,'kink valid');assert.ok(elements(kink,node=>node.name==='ion-icon'&&node.attribs.name==='star').length);
  const anchor=elements(kink,node=>node.name==='a')[0];assert.equal(new URL(anchor.attribs.href,'http://localhost').searchParams.get('tags'),'test_kink');assert.equal(anchor.attribs['data-turbo-frame'],'pornsearch_results');assert.equal(anchor.attribs.target,'_self');assert.ok('data-turbo-stream' in anchor.attribs);
  assert.equal(text(byId(dom,'pornsearch_results').children.map(n=>n.data || '').join('')),'');assert.doesNotMatch(output,/that search returned nothing/);
  const noKinks=view();noKinks.graph.memberships=[];assert.doesNotMatch(String(e621(noKinks)),/kinks:/);
  assert.ok(String(kinkTools(v)).includes('id="kink_list"'));
  v.graph.abilities=[{link_id:12,ability:'can_show_videos'}];const configured={...link,blacklist:Array.from({length:37},(_,i)=>'tag_'+i).join(' ')};
  for(const paragraph of copy.pornSelector)assert.ok(text(selector(v,configured)).includes(paragraph),paragraph);
});
test('enabled profile kinks retain the edit/star/remove controls and card chip layout',()=>{
  const v=view();v.graph.abilities=[{link_id:12,ability:'is_kink_aligned'}];
  const output=String(form(v)),dom=parseDocument(output);assert.ok(byId(dom,'kink_form'));assert.ok(elements(dom,n=>n.name==='form'&&n.attribs.action==='/kinks/21/star').length);assert.ok(elements(dom,n=>n.name==='form'&&n.attribs.action==='/kinks/21').length);assert.match(String(card(v,link)),/class="kink valid"/);
});
test('e621 empty search results preserve the original theme/no-theme/thread wording',()=>{
  for(const [target,expected] of [[link,'that search returned nothing. This search obeys the e621 global blacklist, and also has some light filtering to prevent easy abuse.'],[{...link,theme:'test_kink'},'that search may not have returned any results that match the theme tag (test_kink) that the link owner chose. Search with an empty tag list to see all theme-matching posts.'],[null,'that search did not return any results.']])assert.ok(text(e621Results(view({link:target}))).includes(expected));
});
