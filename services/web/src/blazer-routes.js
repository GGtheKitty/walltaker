import {HttpError} from './errors.js';
import {renderPage} from './pages.js';
const pick=(body,keys)=>Object.fromEntries(keys.filter(k=>Object.hasOwn(body || {},k)).map(k=>[k,body[k]]));
const id=ctx=>{const match=/^([1-9]\d{0,18})(?:-|$)/.exec(ctx.params.id || '');if(!match)throw new HttpError(404,'Record not found.');return match[1];};
const call=(ctx,op,input={})=>ctx.call('blazer',op,{actor_id:ctx.auth.user.id,surrender_id:ctx.auth.surrender?.id || null,...input});
const page=(ctx,template,data={})=>renderPage(ctx,{template,...data});
const variables=ctx=>ctx.body.variables || ctx.query.variables || Object.fromEntries(Object.entries(ctx.query).filter(([,v])=>typeof v==='string'));
const csv=value=>{const s=value==null?'':typeof value==='object'?JSON.stringify(value):String(value);return /[",\r\n]/.test(s)?'"'+s.replaceAll('"','""')+'"':s;};
export function addBlazerRoutes(router){
  for(const path of ['/blazer','/blazer/'])router.add('GET',path,async ctx=>{if(!await ctx.authorize('admin'))return;await page(ctx,'blazer-home',{...await call(ctx,'home',{filter:ctx.query.filter}),filter:ctx.query.filter});});
  router.add('GET','/blazer/queries',async ctx=>{if(!await ctx.authorize('admin'))return;const data=await call(ctx,'home',{filter:ctx.query.filter});ctx.send(200,JSON.stringify(data.queries),{'content-type':'application/json'});});
  router.add('GET','/blazer/queries/new',async ctx=>{if(!await ctx.authorize('admin'))return;const parent=ctx.query.fork_query_id?await call(ctx,'query',{id:ctx.query.fork_query_id}):null;await page(ctx,'blazer-query-form',{query:{name:ctx.query.name || parent?.query.name || '',statement:parent?.query.statement || '',data_source:'main'},variables:variables(ctx)});});
  router.add('GET','/blazer/queries/tables',async ctx=>{if(!await ctx.authorize('admin'))return;const data=await call(ctx,'schema');ctx.send(200,JSON.stringify([...new Set(data.columns.map(c=>c.table_name))]),{'content-type':'application/json'});});
  router.add('GET','/blazer/queries/schema',async ctx=>{if(!await ctx.authorize('admin'))return;await page(ctx,'blazer-schema',await call(ctx,'schema'));});
  router.add('GET','/blazer/queries/docs',async ctx=>{if(!await ctx.authorize('admin'))return;await call(ctx,'home');await page(ctx,'blazer-docs');});
  for(const suffix of ['','/edit'])router.add('GET','/blazer/queries/:id'+suffix,async ctx=>{if(!await ctx.authorize('admin'))return;const data=await call(ctx,'query',{id:id(ctx)});if(suffix&&!data.editable)throw new HttpError(403,'Sorry, permission denied');await page(ctx,suffix?'blazer-query-form':'blazer-query',{...data,variables:variables(ctx),variableNames:data.variables});});
  for(const [method,path] of [['POST','/blazer/queries'],['PATCH','/blazer/queries/:id'],['PUT','/blazer/queries/:id']])router.add(method,path,async ctx=>{
    if(!await ctx.authorize('admin'))return;const attributes=pick(ctx.body.query,['name','description','statement','data_source']);let result;
    try{result=await call(ctx,'query-save',{id:ctx.params.id?id(ctx):undefined,attributes,fork:ctx.body.commit==='Fork'});}catch(error){if(error.status!==422)throw error;return page(ctx,'blazer-query-form',{query:{...attributes,...(ctx.params.id?{id:id(ctx)}:{})},error:error.message,status:422,variables:variables(ctx)});}
    const params=new URLSearchParams(Object.entries(variables(ctx)).filter(([,value])=>typeof value==='string'));
    ctx.redirect('/blazer/queries/'+result.id+(params.size?'?'+params:''));
  });
  router.add('DELETE','/blazer/queries/:id',async ctx=>{if(!await ctx.authorize('admin'))return;await call(ctx,'query-delete',{id:id(ctx)});ctx.redirect('/blazer');});
  for(const path of ['/blazer/queries/run','/blazer/queries/run.csv'])router.add('POST',path,async ctx=>{
    if(!await ctx.authorize('admin'))return;let result;try{result=await call(ctx,'run',{...pick(ctx.body,['query_id','statement','data_source','run_id']),variables:variables(ctx)});}catch(error){if(error.status!==422)throw error;result={error:error.message,columns:[],rows:[]};}
    if(ctx.path.endsWith('.csv')||ctx.query.format==='csv'){if(result.error)throw new HttpError(422,result.error);return ctx.send(200,[result.columns,...result.rows].map(row=>row.map(csv).join(',')).join('\r\n')+'\r\n',{'content-type':'text/csv; charset=utf-8','content-disposition':'attachment; filename="query.csv"'});}
    if(/application\/json/.test(ctx.req.headers.accept || ''))return ctx.send(200,JSON.stringify(result),{'content-type':'application/json'});
    await page(ctx,'blazer-result',{result,fragment:true});
  });
  router.add('POST','/blazer/queries/cancel',async ctx=>{if(!await ctx.authorize('admin'))return;await call(ctx,'cancel',{run_id:ctx.body.run_id || ctx.body.blazer?.run_id});ctx.send(200,'',{'content-type':'text/plain'});});
  router.add('POST','/blazer/queries/:id/refresh',async ctx=>{if(!await ctx.authorize('admin'))return;await call(ctx,'refresh',{id:id(ctx)});ctx.redirect('/blazer/queries/'+id(ctx));});
  router.add('GET','/blazer/checks',async ctx=>{if(!await ctx.authorize('admin'))return;await page(ctx,'blazer-checks',await call(ctx,'checks'));});
  for(const path of ['/blazer/checks/new','/blazer/checks/:id/edit'])router.add('GET',path,async ctx=>{if(!await ctx.authorize('admin'))return;const data=await call(ctx,'check',{id:ctx.params.id?id(ctx):undefined});await page(ctx,'blazer-check-form',{...data,check:data.check || {query_id:ctx.query.query_id,check_type:'bad_data',schedule:'1 day'}});});
  for(const [method,path] of [['POST','/blazer/checks'],['PATCH','/blazer/checks/:id'],['PUT','/blazer/checks/:id']])router.add(method,path,async ctx=>{
    if(!await ctx.authorize('admin'))return;const attributes=pick(ctx.body.check,['query_id','emails','check_type','schedule']);try{const r=await call(ctx,'check-save',{id:ctx.params.id?id(ctx):undefined,attributes});ctx.redirect('/blazer/queries/'+r.query_id);}catch(error){if(error.status!==422)throw error;const data=await call(ctx,'check',{id:ctx.params.id?id(ctx):undefined});await page(ctx,'blazer-check-form',{...data,check:{...data.check,...attributes},error:error.message,status:422});}
  });
  router.add('DELETE','/blazer/checks/:id',async ctx=>{if(!await ctx.authorize('admin'))return;await call(ctx,'check-delete',{id:id(ctx)});ctx.redirect('/blazer/checks');});
  for(const method of ['GET','POST'])router.add(method,'/blazer/checks/:id/run',async ctx=>{if(!await ctx.authorize('admin'))return;if(method==='GET'){const data=await call(ctx,'check',{id:id(ctx)});return ctx.redirect('/blazer/queries/'+data.check.query_id);}const result=await call(ctx,'check-run',{id:id(ctx)});ctx.redirect('/blazer/queries/'+result.query_id);});
  for(const path of ['/blazer/dashboards/new','/blazer/dashboards/:id/edit','/blazer/dashboards/:id'])router.add('GET',path,async ctx=>{if(!await ctx.authorize('admin'))return;const data=await call(ctx,'dashboard',{id:ctx.params.id?id(ctx):undefined});await page(ctx,path.endsWith('/edit')||path.endsWith('/new')?'blazer-dashboard-form':'blazer-dashboard',{...data,variableNames:data.variables,variables:variables(ctx)});});
  for(const [method,path] of [['POST','/blazer/dashboards'],['PATCH','/blazer/dashboards/:id'],['PUT','/blazer/dashboards/:id']])router.add(method,path,async ctx=>{if(!await ctx.authorize('admin'))return;const queryIds=ctx.body.query_ids || [];try{const result=await call(ctx,'dashboard-save',{id:ctx.params.id?id(ctx):undefined,name:ctx.body.dashboard?.name,query_ids:queryIds});ctx.redirect('/blazer/dashboards/'+result.id);}catch(error){if(error.status!==422)throw error;const data=await call(ctx,'dashboard',{id:ctx.params.id?id(ctx):undefined});await page(ctx,'blazer-dashboard-form',{...data,dashboard:{...data.dashboard,name:ctx.body.dashboard?.name},queries:data.available.filter(q=>Array.isArray(queryIds)&&queryIds.includes(String(q.id))),error:error.message,status:422});}});
  router.add('DELETE','/blazer/dashboards/:id',async ctx=>{if(!await ctx.authorize('admin'))return;await call(ctx,'dashboard-delete',{id:id(ctx)});ctx.redirect('/blazer');});
  router.add('POST','/blazer/dashboards/:id/refresh',async ctx=>{if(!await ctx.authorize('admin'))return;const data=await call(ctx,'dashboard',{id:id(ctx)});for(const q of data.queries)await call(ctx,'refresh',{id:q.id});ctx.redirect('/blazer/dashboards/'+id(ctx));});
}
