import { createHash, randomUUID } from 'node:crypto';
import { CommandError } from './updates.js';
import { writeActivityRecord } from './activity-common.js';

const USER_COLUMNS = 'id,username,created_at,updated_at,details,admin,set_count,viewing_link_id,mascot,pervert,quarantined,colour_preference,advanced,profile_id,flagged,is_reporter,is_cutie,is_supporter,username_changed_at,deleted_at,system_account';
const id = (value) => /^\d{1,18}$/.test(String(value)) && BigInt(value)>0n;
const same = (a,b) => String(a)===String(b);
const yes = (v) => [true,1,'1','true','on'].includes(v);
const fail = (status,message) => { throw new CommandError(status,message); };
const string = (v,max=50000) => typeof v==='string' && Array.from(v).length<=max ? v : fail(422,'Invalid or oversized text.');
const content = (v,max=50000) => { const s=string(v,max);if(!s.trim())fail(422,'Content cannot be blank.');return s; };
const truncate = (s,n) => Array.from(s).length<=n ? s : Array.from(s).slice(0,n-3).join('')+'...';
const canonical = (v) => Array.isArray(v) ? v.map(canonical) : v && typeof v==='object' ? Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])) : v;
const READS = new Set(['friends','friend','friend-requests-count','threads','thread','messages-before','notifications','comments','leashes','leash','surrenders','surrender','scoops','scoop','kinks','kink','leaderboard','community-interests','community-links']);

// This pool has social-table privileges only; it cannot read account credentials.
export function createSocial(pool, {activity=false}={}) {
  const rows = async (c,sql,args=[]) => (await c.query(sql,args)).rows;
  const one = async (c,sql,args=[]) => (await rows(c,sql,args))[0];
  async function actor(c,input,allowSurrendered=false) {
    if(!id(input.actor_id))fail(403,'Please log in.');
    const u=await one(c,`SELECT ${USER_COLUMNS} FROM users WHERE id=$1 AND deleted_at IS NULL FOR UPDATE`,[input.actor_id]);
    if(!u)fail(403,'Please log in.');
    const s=await one(c,`SELECT s.* FROM surrenders s JOIN friendships f ON f.id=s.friendship_id
      JOIN users controller ON controller.id=s.controller_user_id
      WHERE s.user_id=$1 AND s.pending IS NOT TRUE AND s.accepted_consequences=true AND s.expires_at>CURRENT_TIMESTAMP
      AND f.confirmed=true AND controller.deleted_at IS NULL AND $2=false
      AND ((f.sender_id=s.user_id AND f.receiver_id=s.controller_user_id) OR (f.receiver_id=s.user_id AND f.sender_id=s.controller_user_id))
      ORDER BY s.id LIMIT 1`,[u.id,u.admin===true]);
    if(input.surrender_id!=null && (!s || !same(s.id,input.surrender_id) || !s.logged_in))fail(403,'The delegated session is no longer active.');
    if(s && input.surrender_id==null && !allowSurrendered)fail(403,'This account is currently surrendered.');
    return {u,s:input.surrender_id ? s : null};
  }
  async function user(c,value,byName=false) {
    if(!byName && !id(value))fail(404,'User not found.');
    const u=await one(c,`SELECT ${USER_COLUMNS} FROM users WHERE ${byName?'username':'id'}=$1 AND deleted_at IS NULL`,[value]);
    return u || fail(404,'User not found.');
  }
  async function friendship(c,key,u,confirmed=false) {
    if(!id(key))fail(404,'Friendship not found.');
    const f=await one(c,'SELECT * FROM friendships WHERE id=$1 AND (sender_id=$2 OR receiver_id=$2) FOR UPDATE',[key,u.id]);
    if(!f || confirmed && !f.confirmed)fail(403,'Confirmed friendship required.');
    await user(c,same(f.sender_id,u.id)?f.receiver_id:f.sender_id);
    return f;
  }
  async function friends(c,a,b) {
    return one(c,`SELECT * FROM friendships WHERE confirmed=true AND ((sender_id=$1 AND receiver_id=$2) OR (receiver_id=$1 AND sender_id=$2)) ORDER BY id LIMIT 1 FOR UPDATE`,[a,b]);
  }
  async function thread(c,key,u) {
    if(!id(key))fail(404,'Thread not found.');
    const t=await one(c,`SELECT t.* FROM message_threads t WHERE t.id=$1 AND EXISTS
      (SELECT 1 FROM message_thread_participants p WHERE p.message_thread_id=t.id AND p.user_id=$2) FOR UPDATE`,[key,u.id]);
    return t || fail(404,'Thread was not found, or you were removed from it.');
  }
  async function visibleLink(c,key,input) {
    if(!id(key))fail(404,'Link not found.');
    const l=await one(c,'SELECT l.* FROM links l JOIN users u ON u.id=l.user_id WHERE l.id=$1 AND u.deleted_at IS NULL',[key]);
    if(!l)fail(404,'Link not found.');
    if(same(l.user_id,input.actor_id))return l;
    if(id(input.actor_id) && await one(c,'SELECT id FROM leashes WHERE master_id=$1 AND pet_id=$2',[input.actor_id,l.user_id]))return l;
    if(!l.never_expires && l.expires && new Date(l.expires)<=new Date())fail(403,'This link has expired.');
    if(l.friends_only && (!id(input.actor_id) || !await friends(c,input.actor_id,l.user_id)))fail(403,'This link is for friends only.');
    return l;
  }
  async function read(c,op,input) {
    if(op==='community-interests' || op==='community-links') {
      const page=Math.max(1,Math.min(100000,Number.parseInt(input.page,10)||1));
      const publicLink='u.deleted_at IS NULL AND l.friends_only=false AND (l.never_expires=true OR l.expires>CURRENT_TIMESTAMP)';
      if(op==='community-links') {
        const k=await one(c,'SELECT * FROM kinks WHERE id=$1',[input.kink_id]);if(!k)fail(404,'Interest not found.');
        const base=`FROM links l JOIN users u ON u.id=l.user_id WHERE ${publicLink} AND EXISTS(SELECT 1 FROM kink_havers h WHERE h.user_id=l.user_id AND h.kink_id=$1)`;
        const count=Number((await one(c,'SELECT count(*) '+base,[k.id])).count);
        const safePage=Math.min(page,Math.max(1,Math.ceil(count/25)));
        return {kink:k,count,page:safePage,links:await rows(c,'SELECT l.* '+base+' ORDER BY l.updated_at DESC,l.id DESC LIMIT 25 OFFSET $2',[k.id,(safePage-1)*25])};
      }
      if(input.mine)await actor(c,input,true);
      const query=string(input.query??'',100).trim().toLowerCase();
      const base=`FROM kinks k WHERE ($1='' OR k.name ILIKE '%'||$1||'%' OR similarity(k.name,$1)>0.2)
        AND ($2::bigint IS NULL OR EXISTS(SELECT 1 FROM kink_havers h WHERE h.kink_id=k.id AND h.user_id=$2))
        AND EXISTS(SELECT 1 FROM kink_havers h JOIN links l ON l.user_id=h.user_id JOIN users u ON u.id=l.user_id WHERE h.kink_id=k.id AND ${publicLink})`;
      const args=[query,input.mine?input.actor_id:null];const count=Number((await one(c,'SELECT count(*) '+base,args)).count);
      const safePage=Math.min(page,Math.max(1,Math.ceil(count/5)));
      const kinks=await rows(c,`SELECT k.* ${base} ORDER BY (SELECT count(*) FROM kink_havers h WHERE h.kink_id=k.id) DESC,k.id LIMIT 5 OFFSET $3`,[...args,(safePage-1)*5]);
      const previews={};
      for(const k of kinks) {
        const links=`FROM links l JOIN users u ON u.id=l.user_id WHERE ${publicLink} AND EXISTS(SELECT 1 FROM kink_havers h WHERE h.user_id=l.user_id AND h.kink_id=$1)`;
        const counts=await one(c,'SELECT count(*) AS count,count(DISTINCT l.user_id) AS users '+links,[k.id]);
        previews[k.id]={count:Number(counts.count),users:Number(counts.users),links:await rows(c,'SELECT l.* '+links+' ORDER BY l.updated_at DESC,l.id DESC LIMIT 2',[k.id])};
      }
      return {count,page:safePage,kinks,previews};
    }
    if(op==='leaderboard')return {users:await rows(c,`SELECT ${USER_COLUMNS} FROM users WHERE deleted_at IS NULL AND username<>ALL($1::text[]) ORDER BY set_count DESC,id LIMIT 10`,[['PornLizardKi','PornLizardWarren','PornLizardTaylor','PornBot','DeletedAccount28','GiosDominatrix']])};
    if(op==='comments') {await visibleLink(c,input.link_id,input);return {comments:await rows(c,'SELECT * FROM (SELECT * FROM comments WHERE link_id=$1 ORDER BY id DESC LIMIT 50) c ORDER BY id',[input.link_id])};}
    if(op==='leashes') { const u=await user(c,input.username,true);return {user:u,leashes:await rows(c,'SELECT * FROM leashes WHERE master_id=$1 OR pet_id=$1 ORDER BY id',[u.id])}; }
    if(op==='kinks') {const u=await user(c,input.username,true);return {user:u,kinks:await rows(c,`SELECT k.*,h.is_starred FROM kinks k JOIN kink_havers h ON h.kink_id=k.id WHERE h.user_id=$1 ORDER BY h.created_at,h.id`,[u.id])};}
    if(op==='kink')return {kink:await one(c,'SELECT * FROM kinks WHERE id=$1',[input.kink_id]) || fail(404,'Interest not found.'),users:await rows(c,`SELECT ${USER_COLUMNS.split(',').map(k=>'u.'+k).join(',')} FROM users u WHERE u.deleted_at IS NULL AND EXISTS(SELECT 1 FROM kink_havers h WHERE h.user_id=u.id AND h.kink_id=$1) ORDER BY u.id LIMIT 30`,[input.kink_id])};
    if(op==='scoop') {
      const scoop=await one(c,'SELECT * FROM scoops WHERE id=$1',[input.scoop_id]);if(!scoop)fail(404,'Scoop not found.');
      if(input.edit) {const {u}=await actor(c,input);if(!same(scoop.user_id,u.id))fail(403,'Not authorized.');}
      return {scoop};
    }
    const {u}=await actor(c,input,['notifications','friend-requests-count','surrenders','surrender'].includes(op));
    if(op==='friend-requests-count')return {count:Number((await one(c,'SELECT count(*) FROM friendships f JOIN users u ON u.id=f.sender_id WHERE receiver_id=$1 AND confirmed IS NOT TRUE AND u.deleted_at IS NULL',[u.id])).count)};
    if(op==='friends')return {friendships:await rows(c,`SELECT f.* FROM friendships f JOIN users a ON a.id=f.sender_id JOIN users b ON b.id=f.receiver_id WHERE (f.sender_id=$1 OR f.receiver_id=$1) AND a.deleted_at IS NULL AND b.deleted_at IS NULL ORDER BY f.id`,[u.id])};
    if(op==='friend')return {friendship:await friendship(c,input.friendship_id,u)};
    if(op==='threads')return {threads:await rows(c,`SELECT t.* FROM message_threads t WHERE EXISTS(SELECT 1 FROM message_thread_participants p WHERE p.message_thread_id=t.id AND p.user_id=$1) ORDER BY t.id DESC LIMIT 200`,[u.id])};
    if(op==='thread' || op==='messages-before') {
      const t=await thread(c,input.thread_id,u);
      let cursor=null;
      if(op==='messages-before') {cursor=await one(c,'SELECT * FROM messages WHERE id=$1 AND message_thread_id=$2',[input.after_id,t.id]);if(!cursor)fail(404,'Message cursor not found in this thread.');}
      return {thread:t,participants:await rows(c,'SELECT * FROM message_thread_participants WHERE message_thread_id=$1 ORDER BY id',[t.id]),
        messages:await rows(c,`SELECT * FROM messages WHERE message_thread_id=$1 ${cursor?'AND id<$2':''} ORDER BY id DESC LIMIT ${cursor?30:60}`,cursor?[t.id,cursor.id]:[t.id]),cursor};
    }
    if(op==='notifications')return {notifications:await rows(c,'SELECT * FROM notifications WHERE user_id=$1 ORDER BY id DESC LIMIT $2',[u.id,input.header?5:200])};
    if(op==='leash') {const l=await one(c,'SELECT * FROM leashes WHERE id=$1',[input.leash_id]);if(!l || ![l.pet_id,l.master_id].some(v=>same(v,u.id)))fail(403,'Not authorized.');return {leash:l};}
    if(op==='surrenders')return {surrenders:await rows(c,'SELECT * FROM surrenders WHERE user_id=$1 ORDER BY id',[u.id])};
    if(op==='surrender') {const s=await one(c,'SELECT * FROM surrenders WHERE id=$1 AND (user_id=$2 OR controller_user_id=$2)',[input.id,u.id]);if(!s)fail(403,'Not authorized.');return {surrender:s};}
    if(op==='scoops')return {scoops:await rows(c,'SELECT * FROM scoops WHERE user_id=$1 ORDER BY created_at DESC,id DESC LIMIT 40',[u.id])};
    fail(404,'Unknown operation.');
  }
  async function mutate(c,op,input,u,s,effects) {
    const notify=async (uid,type,text,link) => {await c.query('INSERT INTO notifications(user_id,notification_type,text,link,created_at,updated_at) VALUES($1,$2,$3,$4,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)',[uid,type,text,link]);effects.notifications.push(uid);};
    const changed=(...uids)=>effects.users.push(...uids);
    if(op==='friend-request') {
      const other=await user(c,string(input.username,255),true);if(same(other.id,u.id))fail(422,'You cannot friend yourself.');
      const existing=await one(c,'SELECT id,confirmed FROM friendships WHERE (sender_id=$1 AND receiver_id=$2) OR (receiver_id=$1 AND sender_id=$2)',[u.id,other.id]);
      if(existing)fail(422,existing.confirmed?"You're already friends!":'A friend request already exists. Check your friends menu.');
      const f=await one(c,'INSERT INTO friendships(sender_id,receiver_id,confirmed,created_at,updated_at) VALUES($1,$2,false,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) RETURNING id',[u.id,other.id]);
      await notify(u.id,0,`You sent a friend request to ${other.username}.`,'/users/'+other.username);
      await notify(other.id,1,`${u.username} sent you a friend request.`,'/friendships/requests');return {friendship_id:f.id};
    }
    if(op==='friend-accept' || op==='friend-delete') {
      const f=await friendship(c,input.friendship_id,u);changed(f.sender_id,f.receiver_id);
      if(op==='friend-accept') {
        if(!same(f.receiver_id,u.id))fail(403,'Only the receiver can accept this request.');
        if(!f.confirmed) {await c.query('UPDATE friendships SET confirmed=true,updated_at=CURRENT_TIMESTAMP WHERE id=$1',[f.id]);await notify(f.sender_id,2,`${u.username} accepted your friend request.`,'/users/'+u.username);}
      } else {
        const surrendered=await rows(c,'DELETE FROM surrenders WHERE friendship_id=$1 RETURNING id,user_id,controller_user_id',[f.id]);effects.surrenders.push(...surrendered);changed(...surrendered.flatMap(s=>[s.user_id,s.controller_user_id]));
        await c.query('DELETE FROM leashes WHERE friendship_id=$1',[f.id]);await c.query('DELETE FROM friendships WHERE id=$1',[f.id]);
      }
      return {friendship_id:f.id};
    }
    if(op==='leash-create') {
      const f=await friendship(c,input.friendship_id,u,true);const master=same(f.sender_id,u.id)?f.receiver_id:f.sender_id;
      if(await one(c,'SELECT id FROM leashes WHERE pet_id=$1',[u.id]))fail(422,'You already have an owner.');
      const l=await one(c,'INSERT INTO leashes(friendship_id,master_id,pet_id,flair,created_at,updated_at) VALUES($1,$2,$3,$4,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) RETURNING id',[f.id,master,u.id,string(input.flair??'',1000)]);
      await notify(master,9,`${u.username} has leashed themselves to you.`,'/users/'+u.username+'/leashes');changed(u.id,master);return {leash_id:l.id};
    }
    if(op==='leash-update' || op==='leash-delete') {
      const l=await one(c,'SELECT * FROM leashes WHERE id=$1 FOR UPDATE',[input.leash_id]);if(!l || !same(l.master_id,u.id))fail(403,'Only the owner can change or release this leash.');
      if(op==='leash-update')await c.query('UPDATE leashes SET flair=$2,updated_at=CURRENT_TIMESTAMP WHERE id=$1',[l.id,string(input.flair??'',1000)]);
      else await c.query('DELETE FROM leashes WHERE id=$1',[l.id]);changed(l.master_id,l.pet_id);return {leash_id:l.id,pet_id:l.pet_id};
    }
    if(op==='comment-create') {
      const l=await visibleLink(c,input.link_id,input);const text=content(input.content);
      const comment=await one(c,'INSERT INTO comments(user_id,link_id,content,created_at,updated_at) VALUES($1,$2,$3,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) RETURNING id',[u.id,l.id,text]);effects.comment_id=comment.id;
      if(activity)await writeActivityRecord(c,{visit:input.activity_visit || null},{kind:'commented_on',linkId:l.id,actor:{user:u,controllerId:s?.controller_user_id??null}});
      else await c.query('INSERT INTO history_events(user_id,link_id,did_what,surrender_controller_id,ahoy_visit_id,created_at,updated_at) VALUES($1,$2,2,$3,$4,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)',[u.id,l.id,s?.controller_user_id??null,input.visit_id??null]);
      if(!same(l.user_id,u.id))await notify(l.user_id,7,`${u.username} said "${truncate(text,100)}"`,'/links/'+l.id+'#comments');return {comment_id:comment.id};
    }
    if(op==='thread-create' || op==='thread-resolve') {
      let other;
      if(op==='thread-resolve') {other=await user(c,input.user_id);if(same(other.id,u.id) || !await friends(c,u.id,other.id))fail(403,'Confirmed friendship required.');
        const t=await one(c,`SELECT t.id FROM message_threads t WHERE
          EXISTS(SELECT 1 FROM message_thread_participants WHERE message_thread_id=t.id AND user_id=$1) AND
          EXISTS(SELECT 1 FROM message_thread_participants WHERE message_thread_id=t.id AND user_id=$2) AND
          (SELECT count(*) FROM message_thread_participants WHERE message_thread_id=t.id)=2 ORDER BY t.id LIMIT 1 FOR UPDATE`,[u.id,other.id]);if(t)return {thread_id:t.id};}
      const t=await one(c,'INSERT INTO message_threads(created_at,updated_at) VALUES(CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) RETURNING id');
      for(const uid of [u.id,...(other?[other.id]:[])])await c.query('INSERT INTO message_thread_participants(message_thread_id,user_id,created_at,updated_at) VALUES($1,$2,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)',[t.id,uid]);return {thread_id:t.id};
    }
    if(['message-send','thread-name','thread-add','thread-remove','thread-notify'].includes(op)) {
      const t=await thread(c,input.thread_id,u);
      if(op==='message-send') {
        const text=content(input.content);const m=await one(c,'INSERT INTO messages(message_thread_id,from_user_id,content,created_at,updated_at) VALUES($1,$2,$3,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) RETURNING id',[t.id,u.id,text]);effects.message_id=m.id;
        for(const p of await rows(c,`SELECT DISTINCT p.user_id FROM message_thread_participants p JOIN users u ON u.id=p.user_id WHERE p.message_thread_id=$1 AND p.user_id<>$2 AND p.notify=true AND u.deleted_at IS NULL`,[t.id,u.id]))await notify(p.user_id,5,`${u.username}: ${truncate(text,24)}`,'/messages/'+t.id);
        if(s) {const controller=await user(c,s.controller_user_id);await notify(u.id,8,`${controller.username} said '${truncate(text,160)}' in a message thread.`,'/messages/'+t.id);}
        return {thread_id:t.id,message_id:m.id};
      }
      if(op==='thread-name')await c.query('UPDATE message_threads SET name=$2,updated_at=CURRENT_TIMESTAMP WHERE id=$1',[t.id,input.reset?null:string(input.name??'',255).trim()||null]);
      if(op==='thread-notify') {const p=await one(c,'UPDATE message_thread_participants SET notify=$4,updated_at=CURRENT_TIMESTAMP WHERE id=$1 AND message_thread_id=$2 AND user_id=$3 RETURNING id',[input.participant_id,t.id,u.id,yes(input.notify)]);if(!p)fail(403,'Not authorized.');}
      if(op==='thread-add') {
        const target=await user(c,input.user_id);if(!await friends(c,u.id,target.id))fail(403,'You must be friends before adding someone to a thread.');
        if(!await one(c,'SELECT id FROM message_thread_participants WHERE message_thread_id=$1 AND user_id=$2',[t.id,target.id])) {await c.query('INSERT INTO message_thread_participants(message_thread_id,user_id,created_at,updated_at) VALUES($1,$2,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)',[t.id,target.id]);await notify(target.id,4,`${u.username} added you to a message thread.`,'/messages/'+t.id);}
      }
      if(op==='thread-remove') {if(!id(input.user_id))fail(422,'Invalid member.');await c.query('DELETE FROM message_thread_participants WHERE message_thread_id=$1 AND user_id=$2',[t.id,input.user_id]);}
      return {thread_id:t.id};
    }
    if(op==='notification-read') {const n=await one(c,'DELETE FROM notifications WHERE id=$1 AND user_id=$2 RETURNING link',[input.notification_id,u.id]);if(!n)fail(404,'Notification not found.');effects.notifications.push(u.id);return {link:/^\/(?![\/\\])[^\r\n\\]*$/.test(n.link??'')?n.link:'/'};}
    if(op==='notifications-clear') {await c.query('DELETE FROM notifications WHERE user_id=$1',[u.id]);effects.notifications.push(u.id);return {status:'cleared'};}
    if(op==='scoop-create') {
      if(!u.is_reporter && await one(c,"SELECT id FROM scoops WHERE user_id=$1 AND created_at>CURRENT_TIMESTAMP-INTERVAL '7 days'",[u.id]))fail(422,'You already posted a scoop within the last week!');
      const r=await one(c,'INSERT INTO scoops(user_id,details,created_at,updated_at) VALUES($1,$2,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) RETURNING id',[u.id,content(input.details)]);return {scoop_id:r.id};
    }
    if(op==='scoop-update' || op==='scoop-delete') {
      const scoop=await one(c,'SELECT * FROM scoops WHERE id=$1 AND user_id=$2 FOR UPDATE',[input.scoop_id,u.id]);if(!scoop)fail(403,'Not authorized.');if(scoop.was_shown)fail(422,'Scoop was already shown. It can no longer be changed.');
      if(op==='scoop-delete')await c.query('DELETE FROM scoops WHERE id=$1',[scoop.id]);else await c.query('UPDATE scoops SET details=$2,updated_at=CURRENT_TIMESTAMP WHERE id=$1',[scoop.id,content(input.details)]);return {scoop_id:scoop.id};
    }
    if(op==='kink-add') {
      const name=string(input.name,1000).replace(/[^\w\-()/\s]/g,'').trim().toLowerCase().replace(/\s+/g,'_');if(!name || name.length>30)fail(422,'Interest name must be 1–30 characters.');
      await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['social-kink:'+name]);
      let k=await one(c,'SELECT * FROM kinks WHERE name=$1 ORDER BY id LIMIT 1',[name]);if(!k)k=await one(c,'INSERT INTO kinks(name) VALUES($1) RETURNING *',[name]);
      if(!await one(c,'SELECT id FROM kink_havers WHERE user_id=$1 AND kink_id=$2',[u.id,k.id]))await c.query('INSERT INTO kink_havers(user_id,kink_id,created_at,updated_at) VALUES($1,$2,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)',[u.id,k.id]);changed(u.id);return {kink_id:k.id};
    }
    if(op==='kink-remove' || op==='kink-star') {
      const h=await one(c,'SELECT * FROM kink_havers WHERE user_id=$1 AND kink_id=$2 FOR UPDATE',[u.id,input.kink_id]);if(!h)fail(404,'Interest not found on this account.');
      if(op==='kink-remove')await c.query('DELETE FROM kink_havers WHERE user_id=$1 AND kink_id=$2',[u.id,h.kink_id]);
      else {if(!h.is_starred && Number((await one(c,'SELECT count(*) FROM kink_havers WHERE user_id=$1 AND is_starred=true',[u.id])).count)>=3)fail(422,'You can only have 3 starred interests.');await c.query('UPDATE kink_havers SET is_starred=$2,updated_at=CURRENT_TIMESTAMP WHERE id=$1',[h.id,!h.is_starred]);}changed(u.id);return {kink_id:h.kink_id};
    }
    if(op==='surrender-create') {
      if(u.admin || input.surrender_id)fail(403,'This account cannot be surrendered.');
      const f=await friendship(c,input.friendship_id,u,true);const controller=same(f.sender_id,u.id)?f.receiver_id:f.sender_id;
      const hours=Number(input.duration);if(!Number.isInteger(hours)||hours<1||hours>336||!yes(input.accepted))fail(422,'Accept the consequences and choose a duration between 1 hour and 2 weeks.');
      if(await one(c,'SELECT id FROM surrenders WHERE user_id=$1',[u.id]))fail(422,'End your existing surrender first.');
      const row=await one(c,`INSERT INTO surrenders(user_id,controller_user_id,friendship_id,expires_at,duration_hours,accepted_consequences,pending,token,created_at,updated_at)
        VALUES($1,$2,$3,CURRENT_TIMESTAMP+$4*INTERVAL '1 hour',$4,true,$5,$6,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) RETURNING id`,[u.id,controller,f.id,hours,yes(input.pending),randomUUID()]);
      await notify(controller,8,`${u.username} has allowed you to log into their account. You can do so in the friends menu.`,'/friendships');changed(u.id,controller);return {surrender_id:row.id};
    }
    if(['surrender-delete','surrender-assume','surrender-return','surrender-page','surrender-expire'].includes(op)) {
      const row=await one(c,'SELECT * FROM surrenders WHERE id=$1 FOR UPDATE',[input.id]);if(!row)fail(404,'Surrender not found.');
      if(op==='surrender-assume') {
        const pet=await user(c,row.user_id);if(!same(row.controller_user_id,u.id)||pet.admin||!row.accepted_consequences||new Date(row.expires_at)<=new Date()||!await friends(c,u.id,pet.id))fail(403,'Not allowed.');
        if(input.surrender_id)fail(403,'Nested delegated sessions are not allowed.');
        await c.query('UPDATE surrenders SET pending=false,logged_in=true,updated_at=CURRENT_TIMESTAMP WHERE id=$1',[row.id]);
        await notify(pet.id,8,`${u.username} logged in as you.`,'/');
      } else {
        if(!same(row.user_id,u.id))fail(403,'Not authorized.');
        if(op==='surrender-delete')await c.query('DELETE FROM surrenders WHERE id=$1',[row.id]);
        if(op==='surrender-expire') {if(new Date(row.expires_at)>new Date())fail(403,'Surrender is still active.');await c.query('DELETE FROM surrenders WHERE id=$1',[row.id]);}
        if(op==='surrender-return') {if(!input.surrender_id || !same(input.surrender_id,row.id))fail(403,'Not authorized.');await c.query('UPDATE surrenders SET logged_in=false,current_page=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=$1',[row.id]);}
        if(op==='surrender-page') {if(!input.surrender_id || !same(input.surrender_id,row.id))fail(403,'Not authorized.');await c.query('UPDATE surrenders SET current_page=$2,updated_at=CURRENT_TIMESTAMP WHERE id=$1',[row.id,string(input.page,255)]);}
      }
      effects.surrenders.push({id:row.id,user_id:row.user_id,controller_user_id:row.controller_user_id});changed(row.user_id,row.controller_user_id);return {surrender_id:row.id,user_id:row.user_id,controller_id:row.controller_user_id};
    }
    fail(404,'Unknown operation.');
  }
  return async (op,input={}) => {
    if(!input || typeof input!=='object' || Array.isArray(input))fail(400,'Invalid request.');
    const c=await pool.connect();
    try {
      await c.query('BEGIN');await c.query("SET LOCAL lock_timeout='3s'");
      if(op==='kink-status') {
        if(!id(input.kink_id) || typeof input.works!=='boolean')fail(422,'Invalid interest status.');
        const row=await one(c,'UPDATE kinks SET works_on_e621=$2 WHERE id=$1 RETURNING id,works_on_e621',[input.kink_id,input.works]);
        if(!row)fail(404,'Interest not found.');
        await c.query('COMMIT');return {kink_id:row.id,works:row.works_on_e621};
      }
      if(READS.has(op)) {const r=await read(c,op,input);await c.query('COMMIT');return r;}
      // One short write transaction at a time also serializes legacy tables
      // without uniqueness constraints (friend pairs, pets, thread members).
      await c.query("SELECT pg_advisory_xact_lock(hashtextextended('walltaker:social:v1',0))");
      if(op==='scoop-claim') {
        const key=input.request_key;
        if(typeof key!=='string'||!key||key.length>160)fail(422,'Request key required.');
        const prior=await one(c,'SELECT operation,result FROM node_social_events WHERE request_key=$1',[key]);
        if(prior) {if(prior.operation!==op)fail(409,'Request key reused for different content.');await c.query('COMMIT');return prior.result;}
        const scoop=await one(c,`SELECT s.* FROM scoops s JOIN users u ON u.id=s.user_id WHERE s.was_shown=false AND u.deleted_at IS NULL ORDER BY s.created_at,s.id LIMIT 1 FOR UPDATE OF s`);
        if(!scoop) {await c.query('COMMIT');return {scoop_id:null};}
        await c.query('UPDATE scoops SET was_shown=true,updated_at=CURRENT_TIMESTAMP WHERE id=$1',[scoop.id]);
        const result={scoop_id:scoop.id};
        await c.query(`INSERT INTO node_social_events(request_key,payload_digest,operation,user_id,result,effects,created_at,updated_at)
          VALUES($1,$2,$3,$4,$5,$6,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`,[key,createHash('sha256').update(op).digest('hex'),op,scoop.user_id,JSON.stringify(result),JSON.stringify({scoop_id:scoop.id})]);
        await c.query('COMMIT');return result;
      }
      const {u,s}=await actor(c,input,['notification-read','notifications-clear','surrender-delete','surrender-expire'].includes(op));
      const key=input.request_key;if(typeof key!=='string'||!key||key.length>160)fail(422,'Request key required.');
      const digest=createHash('sha256').update(JSON.stringify(canonical({...input,operation:op}))).digest('hex');
      const previous=await one(c,'SELECT payload_digest,result FROM node_social_events WHERE request_key=$1',[key]);
      if(previous) {if(previous.payload_digest!==digest)fail(409,'Request key reused for different content.');await c.query('COMMIT');return previous.result;}
      const effects={notifications:[],users:[],surrenders:[]};const result=await mutate(c,op,input,u,s,effects);
      effects.notifications=[...new Set(effects.notifications.map(String))];effects.users=[...new Set(effects.users.map(String))];
      await c.query('INSERT INTO node_social_events(request_key,payload_digest,operation,user_id,result,effects,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)',[key,digest,op,u.id,JSON.stringify(result),JSON.stringify(effects)]);
      await c.query('COMMIT');return result;
    } catch(error) {await c.query('ROLLBACK');throw error;} finally {c.release();}
  };
}
