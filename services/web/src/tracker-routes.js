import {HttpError} from './errors.js';
import {renderPage,mergeGraphs} from './pages.js';

const actor=ctx=>({actor_id:ctx.auth.user?.id,surrender_id:ctx.auth.surrender?.id || null});
const command=(ctx,op)=>({...actor(ctx),request_key:`web:${ctx.requestId}:${op}`});
const tracker=(ctx,op,input={})=>ctx.call('tracker',op,{...command(ctx,op),...input});
const page=(ctx,template,data={})=>renderPage(ctx,{template,...data,headers:{'x-walltaker-tracker':'node',...data.headers}});
const userPath=user=>'/users/'+encodeURIComponent(user.username);
const pledgePath=username=>'/users/'+encodeURIComponent(username)+'/nut_pledge';
const same=(a,b)=>a!=null&&b!=null&&String(a)===String(b);
function fields(body){
  const input=body.orgasm;if(!input||typeof input!=='object'||Array.isArray(input))throw new HttpError(400,'Invalid tracker form.');
  return Object.fromEntries(['rating','is_ruined','caused_by'].filter(k=>Object.hasOwn(input,k)).map(k=>[k,input[k]]));
}
async function signed(ctx){
  // The isolated tracker engine has always returned signed-out writers home.
  if(!ctx.auth.user){ctx.flash.set('alert','Not authorized');ctx.redirect('/');return false;}
  return ctx.authorize();
}
async function pledges(ctx){
  const data=await tracker(ctx,'pledges',{username:ctx.params.user_id});
  return {...data,targetUser:data.user,isCurrent:same(data.user.id,ctx.auth.user?.id),graph:{users:[data.user],pledges:data.pledges,past_links:data.past_links}};
}
async function pledgePage(ctx,kind){
  let data;
  try{data=await pledges(ctx);}catch(error){if(error.status!==403||error.message!=='NNN is not currently enabled.')throw error;ctx.flash.set('alert',error.message);return ctx.redirect('/');}
  if(kind==='new'){
    if(!data.isCurrent)throw new HttpError(403,'Not Authorized');
    if(data.current)return ctx.redirect(userPath(data.targetUser));
  }
  return page(ctx,kind==='new'?'tracker-pledge-new':kind==='history'?'tracker-pledge-history':'tracker-pledge',data);
}
async function entryMutation(ctx,op){
  if(!await signed(ctx))return;
  let result;
  try{result=await tracker(ctx,op,{...fields(ctx.body),...(op==='entry-update'?{entry_id:ctx.params.id}:{})});}
  catch(error){if(error.status!==422)throw error;ctx.flash.set('alert',error.message.slice(0,1200));return ctx.redirect(op==='entry-create'?'/nut/orgasms/new':'/nut/orgasms/'+ctx.params.id+'/edit');}
  ctx.flash.set('notice',`Orgasm was successfully ${op==='entry-create'?'created':'updated'}.`);
  ctx.redirect(op==='entry-create'?'/nut/orgasms/new':'/nut/orgasms/'+result.entry.id);
}
export function addTrackerRoutes(router){
  for(const path of ['/nut/orgasms','/nut/orgasmers/:username'])router.add('GET',path,async ctx=>{
    const data=await tracker(ctx,'entries',{...(ctx.params.username?{username:ctx.params.username}:{}),page:ctx.query.page || 1});
    await page(ctx,'tracker-entries',{...data,forUser:!!ctx.params.username,paginationPath:ctx.params.username?'/nut/orgasmers/'+encodeURIComponent(ctx.params.username):'/nut/orgasms'});
  });
  router.add('GET','/nut/orgasms/new',async ctx=>{if(!await signed(ctx))return;await page(ctx,'tracker-entry-form',{orgasmForm:await tracker(ctx,'form'),entry:null,editing:false});});
  router.add('GET','/nut/orgasms/:id/edit',async ctx=>{if(!await signed(ctx))return;const data=await tracker(ctx,'entry',{entry_id:ctx.params.id,edit:true});await page(ctx,'tracker-entry-form',{entry:data.entry,orgasmForm:data,editing:true});});
  router.add('GET','/nut/orgasms/:id',async ctx=>{const data=await tracker(ctx,'entry',{entry_id:ctx.params.id});await page(ctx,'tracker-entry',data);});
  router.add('POST','/nut/orgasms',ctx=>entryMutation(ctx,'entry-create'));
  for(const method of ['PATCH','PUT'])router.add(method,'/nut/orgasms/:id',ctx=>entryMutation(ctx,'entry-update'));
  router.add('DELETE','/nut/orgasms/:id',async ctx=>{if(!await signed(ctx))return;await tracker(ctx,'entry-delete',{entry_id:ctx.params.id});ctx.flash.set('notice','Orgasm was successfully destroyed.');ctx.redirect('/nut/orgasms');});
  for(const [suffix,kind] of [['','show'],['/history','history'],['/new','new']])router.add('GET','/users/:user_id/nut_pledge'+suffix,async ctx=>{if(kind==='new'&&!await ctx.authorize())return;await pledgePage(ctx,kind);});
  for(const [method,op] of [['POST','pledge-create'],['PUT','pledge-fail'],['PATCH','pledge-fail']])router.add(method,'/users/:user_id/nut_pledge',async ctx=>{
    if(!await ctx.authorize())return;
    try{await tracker(ctx,op,{username:ctx.params.user_id,...(op==='pledge-create'?{signature:ctx.body.nut_pledge?.username}:{})});}
    catch(error){
      if(error.status===403&&error.message==='NNN is not currently enabled.'){ctx.flash.set('alert',error.message);return ctx.redirect('/');}
      if(error.status!==422)throw error;ctx.flash.set('alert',error.message.slice(0,1200));return ctx.redirect(pledgePath(ctx.params.user_id)+'/new');
    }
    if(op==='pledge-create')return ctx.redirect('/users/'+encodeURIComponent(ctx.params.user_id));
    await pledgePage(ctx,'show');
  });
  router.add('GET','/history',async ctx=>{
    if(!await ctx.authorize())return;
    const data=await ctx.call('activity','history',actor(ctx));
    // Do not hydrate historical IDs: the history service has already omitted
    // cards/parents that are no longer visible to this session.
    const historyGraph=mergeGraphs(data.graph,{users:data.users,links:data.links});
    await renderPage(ctx,{template:'tracker-activity',events:data.events,visits:data.visits,historyGraph,historyLinks:data.links,graph:historyGraph,headers:{'x-walltaker-activity':'node'}});
  });
}
