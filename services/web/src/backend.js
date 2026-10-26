import {createHmac} from 'node:crypto';
import {HttpError} from './errors.js';

const groups = {
  browser:{namespace:'walltaker:browser:commands:v1', operations:['context','csrf','login','logout','signup','evil','reset-request','authorize','assume','surrender-assume','surrender-return','hydrate','user','profile-page','settings','link','site','site-clients','thread','profiles','profile-style','profile-preview']},
  discovery:{namespace:'walltaker:discovery:commands:v1', operations:['dashboard','browse','search','similar','recent','viewers']},
  social:{namespace:'walltaker:social:commands:v1', operations:['friends','friend','friend-request','friend-accept','friend-delete','friend-requests-count','threads','thread','messages-before','thread-create','thread-resolve','thread-name','thread-add','thread-remove','thread-notify','notifications','notification-read','notifications-clear','leashes','leash','leash-create','leash-update','leash-delete','surrenders','surrender','surrender-create','surrender-delete','scoops','scoop','scoop-create','scoop-update','scoop-delete','leaderboard','comments','comment-create','message-send','kinks','kink','kink-add','kink-remove','kink-star','kink-status','community-interests','community-links']},
  links:{namespace:'walltaker:links:commands:v1',operations:['list','create','update','destroy','toggle-ability','export','wizard-start','wizard-apply']},
  e621:{namespace:'walltaker:e621:commands:v1',operations:['query','search','select','post']},
  automation:{namespace:'walltaker:automation:commands:v1',operations:['newsroom']},
  blazer:{namespace:'walltaker:blazer:commands:v1',operations:['home','query','query-save','query-delete','run','cancel','refresh','schema','checks','check','check-save','check-delete','check-run','dashboard','dashboard-save','dashboard-delete']},
  wallpaper:{namespace:'walltaker:wallpaper-api:commands:v1',operations:['update','reaction','history'],paths:{update:'/_internal/wallpaper-updates',reaction:'/_internal/wallpaper-reactions',history:'/_internal/wallpaper-history'}},
  tracker:{namespace:'walltaker:tracker:commands:v1', operations:['entries','entry','form','statistics','pledges','pledge-status','entry-create','entry-update','entry-delete','pledge-create','pledge-fail']},
  accounts:{namespace:'walltaker:accounts:commands:v1', operations:['username','password','colour','account-delete','reset-complete','mascot','pervert','api-key','profile-content','profile-mode','profile-create','profile-rename','profile-share','profile-copy','profile-select','profile-delete']},
  moderation:{namespace:'walltaker:moderation:commands:v1',operations:['bots','bot-update','bot-start','bot-stop','admin-session','dashboard','invites','emoji-links','user-icons','clients','domains','user','deleted-users','quarantine','events','reports','report','report-target','lizard-browse','lizard-index','setting-toggle','invite-create','invite-delete','emoji-create','emoji-update','emoji-delete','icon-create','icon-update','icon-delete','client-create','client-update','client-delete','client-move','domain-update','user-update','user-restore','user-purge','user-assume','user-quarantine','user-ipban','event-ipban','password-reset','report-create','report-close','link-delete','domain-rules','domain-seen']},
  activity:{namespace:'walltaker:activity:commands:v1', operations:['system','activity','history','visit','visit-create','visit-authenticate','event-create','record']},
};

export function createBackend({secretKeyBase, baseUrl, accountsUrl = 'http://accounts:3003', timeout = 20000, fetchImpl = fetch}) {
  const origin = new URL(baseUrl);
  if (!['http:','https:'].includes(origin.protocol) || origin.username || origin.password) throw new Error('Invalid backend URL');
  const tokens = Object.fromEntries(Object.entries(groups).map(([name, group]) => [name, createHmac('sha256', secretKeyBase).update(group.namespace).digest('hex')]));
  return async (group, operation, input = {}, {cookie = '', requestId = ''} = {}) => {
    if (!groups[group]?.operations.includes(operation)) throw new Error('Unsupported backend operation');
    const headers = {'content-type':'application/json', authorization:'Bearer ' + tokens[group], 'x-request-id':requestId};
    if (group === 'browser') headers.cookie = cookie;
    let response, data;
    try {
      const url = new URL(groups[group].paths?.[operation] || `/_internal/${group}/${operation}`, group === 'accounts' ? accountsUrl : origin);
      const get = group === 'wallpaper' && operation === 'history';
      if (get) for (const key of ['user_id','kind','limit']) if (input[key] != null) url.searchParams.set(key,String(input[key]));
      response = await fetchImpl(url, {method:get ? 'GET' : 'POST',headers,...(get ? {} : {body:JSON.stringify(input)}),signal:AbortSignal.timeout(timeout),redirect:'error'});
      if (Number(response.headers.get('content-length')) > 16777216) throw new Error('Backend response too large');
      let size = 0; const chunks = [];
      for await (const chunk of response.body) { size += chunk.length; if (size > 16777216) { await response.body.cancel().catch(() => {}); throw new Error('Backend response too large'); } chunks.push(chunk); }
      data = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      const arrayResult = group === 'e621' && operation === 'search' || group === 'wallpaper' && operation === 'history';
      const nullable = group === 'e621' && operation === 'select';
      if (response.ok && (arrayResult ? !Array.isArray(data) : nullable && data === null ? false : !data || typeof data !== 'object' || Array.isArray(data))) throw new Error('Invalid backend response');
    } catch { throw new HttpError(503, 'This service is temporarily unavailable. Please try again.'); }
    if (!response.ok) {
      const status = response.status >= 400 && response.status < 500 ? response.status : 503;
      const message = status === 503 ? 'This service is temporarily unavailable. Please try again.' : typeof data?.message === 'string' ? data.message.slice(0, 1000) : 'Unable to complete this request.';
      const error = new HttpError(status, message, status === 429 ? {'retry-after':'20'} : {});
      if (data?.errors && typeof data.errors === 'object' && !Array.isArray(data.errors)) error.errors = data.errors;
      throw error;
    }
    return data;
  };
}
