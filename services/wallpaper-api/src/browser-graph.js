import { BROWSER_USER_FIELDS,browserId } from './browser-sessions.js';
const unique=values=>[...new Set(values.filter(browserId).map(String))];
const rows=async(c,sql,args=[]) => (await c.query(sql,args)).rows;

// Bounded, explicit association loading for Rails' existing templates. Records
// remain presentation objects there; Node owns every business-data selection.
export async function browserGraph(c,seeds={}, {store,viewerId=null,internal=false}={}) {
 const graph={users:[],links:[],profiles:[],past_links:[],comments:[],messages:[],threads:[],participants:[],friendships:[],leashes:[],surrenders:[],kinks:[],memberships:[],icons:[],notifications:[],clients:[],decorations:[],visits:[],bans:[],reports:[],pledges:[],scoops:[],orgasms:[]};
 for(const key of Object.keys(graph))graph[key]=Array.isArray(seeds[key])?seeds[key]:[];
 const ids=(key,field='id')=>unique(graph[key].map(row=>row[field]));
 const fetchIds=async(table,list,fields='*',extra='')=>list.length?rows(c,`SELECT ${fields} FROM ${table} WHERE id=ANY($1::bigint[]) ${extra}`,[unique(list)]):[];
 const merge=(key,list)=>{const records=new Map(graph[key].map(row=>[String(row.id),row]));for(const row of list)records.set(String(row.id),{...records.get(String(row.id)),...row});graph[key]=[...records.values()];};
 merge('past_links',await fetchIds('past_links',ids('pledges','past_link_id')));
 const linkIds=unique([...ids('links'),...ids('past_links','link_id'),...ids('comments','link_id'),...ids('users','viewing_link_id'),...graph.reports.filter(r=>r.reportable_type==='Link').map(r=>r.reportable_id)]);
 merge('links',await fetchIds('links',linkIds));
 const parents=unique(graph.links.map(row=>row.forked_from_id));
 if(parents.length) {
  const allowed=internal?'true':`(l.user_id=$2 OR ((l.never_expires=true OR l.expires>CURRENT_TIMESTAMP) AND (l.friends_only=false OR EXISTS(SELECT 1 FROM friendships f WHERE f.confirmed=true AND ((f.sender_id=$2 AND f.receiver_id=l.user_id) OR(f.receiver_id=$2 AND f.sender_id=l.user_id))))))`;
  merge('links',await rows(c,`SELECT l.* FROM links l JOIN users u ON u.id=l.user_id WHERE l.id=ANY($1::bigint[]) AND u.deleted_at IS NULL AND ${allowed}`,internal?[parents]:[parents,viewerId]));
 }
 const initialLinks=ids('links');
 if(initialLinks.length) {
  merge('past_links',await rows(c,'SELECT DISTINCT ON(link_id) * FROM past_links WHERE link_id=ANY($1::bigint[]) ORDER BY link_id,id DESC',[initialLinks]));
  graph.abilities=await rows(c,'SELECT * FROM link_abilities WHERE link_id=ANY($1::bigint[]) ORDER BY id',[initialLinks]);
  graph.fork_counts=await rows(c,`SELECT l.forked_from_id AS link_id,count(*)::integer AS count FROM links l JOIN users u ON u.id=l.user_id
   WHERE l.forked_from_id=ANY($1::bigint[]) AND u.deleted_at IS NULL GROUP BY l.forked_from_id`,[initialLinks]);
  graph.decorations=await rows(c,'SELECT link_id,emoji FROM emoji_link_decorations WHERE link_id=ANY($1::bigint[])',[initialLinks]);
 }
 const threadIds=unique([...ids('threads'),...ids('messages','message_thread_id'),...ids('participants','message_thread_id')]);
 if(threadIds.length) {
  merge('threads',await fetchIds('message_threads',threadIds));
  merge('participants',await rows(c,'SELECT p.* FROM message_thread_participants p JOIN users u ON u.id=p.user_id WHERE p.message_thread_id=ANY($1::bigint[]) AND u.deleted_at IS NULL ORDER BY p.id',[threadIds]));
 }
 if(ids('kinks').length)merge('memberships',await rows(c,'SELECT * FROM kink_havers WHERE kink_id=ANY($1::bigint[]) ORDER BY id LIMIT 2000',[ids('kinks')]));
 const seedUsers=unique([...ids('users'),...ids('links','user_id'),...ids('links','set_by_id'),...ids('past_links','user_id'),...ids('past_links','set_by_id'),
  ...ids('comments','user_id'),...ids('messages','from_user_id'),...ids('participants','user_id'),...ids('profiles','user_id'),...ids('surrenders','user_id'),...ids('surrenders','controller_user_id'),
  ...ids('friendships','sender_id'),...ids('friendships','receiver_id'),...ids('memberships','user_id'),...ids('notifications','user_id'),...ids('reports','reporter_id'),...ids('pledges','user_id'),...ids('visits','user_id'),...ids('bans','banned_by_id'),...ids('scoops','user_id'),...ids('orgasms','user_id'),...ids('orgasms','caused_by_user_id'),...graph.reports.filter(r=>r.reportable_type==='User').map(r=>r.reportable_id)]);
 if(seedUsers.length) {
  merge('leashes',await rows(c,'SELECT * FROM leashes WHERE pet_id=ANY($1::bigint[]) OR master_id=ANY($1::bigint[]) ORDER BY id LIMIT 2000',[seedUsers]));
  merge('surrenders',await rows(c,`SELECT * FROM surrenders WHERE user_id=ANY($1::bigint[]) OR controller_user_id=ANY($1::bigint[]) ORDER BY id LIMIT 2000`,[seedUsers]));
 }
 const friendshipIds=unique([...ids('friendships'),...ids('surrenders','friendship_id'),...ids('leashes','friendship_id')]);
 merge('friendships',await fetchIds('friendships',friendshipIds));
 const allUsers=unique([...seedUsers,...ids('friendships','sender_id'),...ids('friendships','receiver_id'),...ids('leashes','pet_id'),...ids('leashes','master_id'),...ids('surrenders','controller_user_id'),...ids('surrenders','user_id')]);
 merge('users',await fetchIds('users',allUsers,BROWSER_USER_FIELDS));
 if(allUsers.length) {
  merge('memberships',await rows(c,'SELECT * FROM kink_havers WHERE user_id=ANY($1::bigint[]) ORDER BY created_at,id',[allUsers]));
  merge('kinks',await fetchIds('kinks',unique(graph.memberships.map(row=>row.kink_id))));
  graph.icons=await rows(c,'SELECT * FROM user_icons WHERE user_id=ANY($1::bigint[]) ORDER BY id',[allUsers]);
  const selected=unique(graph.users.map(row=>row.profile_id));
  if(selected.length)merge('profiles',await rows(c,'SELECT p.* FROM profiles p JOIN users u ON u.id=p.user_id WHERE p.id=ANY($1::bigint[]) AND u.deleted_at IS NULL',[selected]));
  const missing=graph.users.filter(row=>!row.profile_id).map(row=>row.id);
  if(missing.length)merge('profiles',await rows(c,'SELECT DISTINCT ON(user_id) * FROM profiles WHERE user_id=ANY($1::bigint[]) ORDER BY user_id,id',[missing]));
  graph.viewer_users=initialLinks.length?await rows(c,`SELECT ${BROWSER_USER_FIELDS} FROM users WHERE viewing_link_id=ANY($1::bigint[]) AND deleted_at IS NULL ORDER BY id LIMIT 500`,[initialLinks]):[];
  merge('users',graph.viewer_users);
  graph.recent_sets=await rows(c,`SELECT p.* FROM users setter JOIN LATERAL (
   SELECT p.* FROM past_links p JOIN links l ON l.id=p.link_id JOIN users u ON u.id=l.user_id
   WHERE p.set_by_id=setter.id AND u.deleted_at IS NULL AND (l.user_id=$2 OR
    ((l.never_expires=true OR l.expires>CURRENT_TIMESTAMP) AND (l.friends_only=false OR EXISTS(
      SELECT 1 FROM friendships f WHERE f.confirmed=true AND ((f.sender_id=$2 AND f.receiver_id=l.user_id) OR(f.receiver_id=$2 AND f.sender_id=l.user_id))))))
   ORDER BY p.id DESC LIMIT 12) p ON true WHERE setter.id=ANY($1::bigint[])`,[seedUsers,viewerId]);
  const pledgeUsers=unique([...seedUsers]);
  merge('pledges',await rows(c,'SELECT * FROM nut_pledges WHERE user_id=ANY($1::bigint[]) AND year=EXTRACT(YEAR FROM CURRENT_TIMESTAMP)::integer',[pledgeUsers]));
 }

 merge('profiles',await fetchIds('profiles',ids('profiles','origin_id')));
 merge('users',await fetchIds('users',ids('profiles','user_id'),BROWSER_USER_FIELDS));
 const profileIds=ids('profiles');
 if(profileIds.length)graph.profile_usage=await rows(c,`SELECT base.id,count(DISTINCT u.id)::integer AS count FROM profiles base
  LEFT JOIN profiles p ON p.id=base.id OR p.origin_id=base.id LEFT JOIN users u ON u.profile_id=p.id AND u.deleted_at IS NULL
  WHERE base.id=ANY($1::bigint[]) GROUP BY base.id`,[profileIds]);
 graph.surrender_valid=graph.surrenders.filter(s=>{
  const subject=graph.users.find(u=>String(u.id)===String(s.user_id)),controller=graph.users.find(u=>String(u.id)===String(s.controller_user_id)),friend=graph.friendships.find(f=>String(f.id)===String(s.friendship_id));
  return subject && !subject.admin && !subject.deleted_at && controller && !controller.deleted_at && s.accepted_consequences && new Date(s.expires_at)>new Date() && friend?.confirmed &&
   ((String(friend.sender_id)===String(s.user_id) && String(friend.receiver_id)===String(s.controller_user_id)) || (String(friend.receiver_id)===String(s.user_id) && String(friend.sender_id)===String(s.controller_user_id)));
 }).map(s=>String(s.id));
 merge('clients',await rows(c,"SELECT * FROM wallpaper_clients WHERE match_text IS NOT NULL AND match_text<>'' ORDER BY position,id LIMIT 500"));
 graph.connected=store?[...await store.connected(initialLinks)]:[];
 return graph;
}
