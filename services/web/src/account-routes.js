import {HttpError} from './errors.js';
import {renderPage} from './pages.js';
import {startVisit,track} from './activity.js';

const same=(a,b)=>a!=null&&b!=null&&String(a)===String(b);
const userPath=user=>'/users/'+encodeURIComponent(user.username);
const command=(ctx,operation)=>({actor_id:ctx.auth.user?.id,surrender_id:ctx.auth.surrender?.id || null,request_key:`web:${ctx.requestId}:${operation}`});
const page=(ctx,template,data={})=>renderPage(ctx,{template,...data});
function text(value,limit=4096){
  if(value==null)return '';
  if(typeof value!=='string')throw new HttpError(400,'Invalid account form.');
  if(value.length>limit)throw new HttpError(422,'Account field is too long.');
  return value;
}
function object(value){if(!value || typeof value!=='object' || Array.isArray(value))throw new HttpError(400,'Invalid account form.');return value;}
export function accountErrors(error){
  const labels={email:'Email',username:'Username',password:'Password',password_confirmation:'Password confirmation',colour_preference:'Colour preference'};
  const messages=Object.entries(error.errors || {}).flatMap(([field,values])=>(Array.isArray(values)?values:[values]).filter(v=>typeof v==='string').map(v=>field==='base'?v:(labels[field] || field.replaceAll('_',' '))+' '+v));
  return messages.length?messages:[error.message];
}
async function settingsData(ctx){
  const data=await ctx.call('browser','settings',{}),targetUser=data.graph.users.find(u=>same(u.id,data.user_id));
  if(!targetUser)throw new HttpError(404,'User not found.');
  return {...data,targetUser};
}
const rejected=error=>error instanceof HttpError&&[400,403,404,409,422].includes(error.status);
const RESET_NOTICE='If an account exists for that email, a password reset email has been sent.';

export function addAccountRoutes(router){
  for(const path of ['/signup','/users/new'])router.add('GET',path,async ctx=>{
    ctx.visit=await startVisit(ctx);
    await page(ctx,'account-signup',{signup:{invite_code:text(ctx.query.invite_code)}});
    await track(ctx,'visit:'+ctx.path,{_url:ctx.originalUrl});
  });
  router.add('POST','/users',async ctx=>{
    const input=object(ctx.body.user),signup={email:text(input.email),username:text(input.username),invite_code:text(ctx.body.invite_code)};
    ctx.visit=await startVisit(ctx);
    let result;
    try{result=await ctx.call('browser','signup',{...signup,password:text(input.password),password_confirmation:text(input.password_confirmation),ip:ctx.ip,request_key:command(ctx,'signup').request_key});}
    catch(error){
      if(!rejected(error))throw error;
      // Only safe fields survive a failed submission. Passwords never enter
      // templates, cookies, analytics, or flashed validation errors.
      await track(ctx,'error:failed_to_sign_up',{_action:'users#create'});
      return page(ctx,'account-signup',{signup,errors:accountErrors(error),status:error.status===403?403:422});
    }
    ctx.transition(result);
    if(ctx.visit)await ctx.call('activity','visit-authenticate',{...ctx.visit,user_id:result.user.id});
    await track(ctx,'regular:signed_up_and_first_log_in',{_action:'users#create'});
    ctx.flash.set('notice','Thank you for signing up!');
    ctx.redirect('/links');
  });
  router.add('GET','/i-forgor',ctx=>page(ctx,'account-reset-request'));
  router.add('POST','/i-forgor',async ctx=>{
    await ctx.call('browser','reset-request',{email:text(ctx.body.email),ip:ctx.ip,request_key:command(ctx,'reset-request').request_key});
    ctx.flash.set('notice',RESET_NOTICE);ctx.redirect('/login');
  });
  router.add('GET','/i-forgor/commit/:token',ctx=>page(ctx,'account-reset-complete',{resetPath:'/i-forgor/commit/'+encodeURIComponent(ctx.params.token)}));
  router.add('POST','/i-forgor/commit/:token',async ctx=>{
    let result;
    try{result=await ctx.call('accounts','reset-complete',{token:ctx.params.token,password:text(ctx.body.password),password_confirmation:text(ctx.body.password_confirmation),request_key:command(ctx,'reset-complete').request_key});}
    catch(error){if(!rejected(error))throw error;ctx.flash.set('alert','Something went wrong, try again. Ensure the password confirmation was typed correctly.');return ctx.redirect('/i-forgor/commit/'+encodeURIComponent(ctx.params.token));}
    if(same(result.user_id,ctx.auth.user?.id)||same(result.user_id,ctx.auth.surrender?.controller_user_id))ctx.transition(await ctx.call('browser','logout',{ip:ctx.ip}));
    ctx.flash.set('notice','Password reset successfully!');ctx.redirect('/login');
  });
  for(const path of ['/settings','/settings/index'])router.add('GET',path,async ctx=>{if(!await ctx.authorize())return;await page(ctx,'account-settings',await settingsData(ctx));});
  // This old GET alias must never change settings during prefetch/navigation.
  router.add('GET','/settings/save',ctx=>ctx.redirect('/settings'));
  router.add('POST','/settings',async ctx=>{
    if(!await ctx.authorize())return;
    const data=await settingsData(ctx),input=object(ctx.body.user),action=text(ctx.body.settings_action),operation=['username','password'].includes(action)?action:'colour';
    const fields=operation==='username'?{username:text(input.username)}:operation==='password'?{current_password:text(input.current_password),password:text(input.password),password_confirmation:text(input.password_confirmation)}:{colour_preference:text(input.colour_preference)};
    try{await ctx.call('accounts',operation,{...command(ctx,operation),target_id:data.targetUser.id,...fields});}
    catch(error){if(!rejected(error))throw error;ctx.flash.set('alert',error.message.slice(0,1200));return ctx.redirect('/settings');}
    ctx.flash.set('notice',operation==='password'?'Password changed successfully!':operation==='username'?'Username changed successfully!':'Settings changed successfully!');
    ctx.redirect(operation==='password'?'/settings':userPath((await settingsData(ctx)).targetUser));
  });
  router.add('DELETE','/settings',async ctx=>{
    if(!await ctx.authorize())return;
    const data=await settingsData(ctx),input=object(ctx.body.account);
    try{await ctx.call('accounts','account-delete',{...command(ctx,'account-delete'),target_id:data.targetUser.id,current_password:text(input.password)});}
    catch(error){if(!rejected(error))throw error;ctx.flash.set('alert',error.message.slice(0,1200));return ctx.redirect('/settings');}
    // The account command revokes sessions atomically. Clear both browser and
    // legacy identities too, and issue a fresh anonymous CSRF cookie.
    ctx.transition(await ctx.call('browser','logout',{ip:ctx.ip}));
    ctx.flash.set('notice','Your account has been deleted.');ctx.redirect('/login');
  });
  router.add('POST','/users/:username/key',async ctx=>{
    if(!await ctx.authorize())return;
    const data=await ctx.call('browser','user',{username:ctx.params.username}),target=data.graph.users.find(u=>same(u.id,data.user_id));
    if(!target)throw new HttpError(404,'User not found.');
    if(!same(target.id,ctx.auth.user.id))throw new HttpError(403,'Not Authorized.');
    await ctx.call('accounts','api-key',command(ctx,'api-key'));ctx.redirect(userPath(target));
  });
}
