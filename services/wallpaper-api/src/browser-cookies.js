import { createDecipheriv,createHmac,pbkdf2Sync,randomBytes,timingSafeEqual,createHash } from 'node:crypto';

const equal=(a,b)=>a.length===b.length && timingSafeEqual(a,b);
const json=value=>{try{return JSON.parse(value);}catch{return undefined;}};
const decode=value=>typeof value==='string' && value.length<=32768 && /^[A-Za-z0-9+/_-]*={0,2}$/.test(value)?Buffer.from(value,'base64'):null;
const validId=value=>(typeof value==='string'||Number.isSafeInteger(value)) && /^[1-9]\d{0,18}$/.test(String(value)) && BigInt(value)<=9223372036854775807n;
export const cookieFingerprint=value=>createHash('sha256').update(value).digest('hex');
export function browserCookies(header='') {
 const result=Object.create(null);
 if(typeof header!=='string' || header.length>32768)return result;
 for(const item of header.split(';').slice(0,100)) {
  const at=item.indexOf('=');if(at<1)continue;const key=item.slice(0,at).trim();
  if(Object.hasOwn(result,key))continue;
  try{result[key]=decodeURIComponent(item.slice(at+1).trim());}catch{}
 }
 return result;
}

// Matches this deployment's Rails 7 JSON cookies, PBKDF2-SHA256 (1,000
// iterations), signed-cookie SHA1 and authenticated AES-256-GCM encryption.
// These readers import existing identities; new auth cookies are opaque tokens.
export function createLegacyCookies(secret,{sessionCookie='_walltaker_session',now=Date.now}={}) {
 const signedKey=pbkdf2Sync(secret,'signed cookie',1000,64,'sha256');
 const encryptedKey=pbkdf2Sync(secret,'authenticated encrypted cookie',1000,32,'sha256');
 function unwrap(bytes,name) {
  let value=json(bytes.toString('utf8'));let expiresAt=null;
  if(value && typeof value==='object' && value._rails) {
   const meta=value._rails;
   if(meta.pur!=null && meta.pur!==`cookie.${name}`)return null;
   if(meta.exp!=null) {
    expiresAt=new Date(meta.exp);if(!Number.isFinite(expiresAt.getTime()) || expiresAt.getTime()<=now())return null;
   }
   if(Object.hasOwn(meta,'message')) {const inner=decode(meta.message);if(!inner)return null;value=json(inner.toString('utf8'));}
   else value=meta.data;
  }
  // Rails' cookie serializer may itself have produced a JSON string.
  if(typeof value==='string') {const inner=json(value);if(inner!==undefined)value=inner;}
  return value===undefined?null:{value,expiresAt};
 }
 function signed(value,name) {
  if(typeof value!=='string' || value.length>16384)return null;
  const match=/^([A-Za-z0-9+/=]+)--([0-9a-f]{40})$/.exec(value);if(!match)return null;
  const expected=createHmac('sha1',signedKey).update(match[1]).digest();
  if(!equal(expected,Buffer.from(match[2],'hex')))return null;
  const bytes=decode(match[1]);return bytes?unwrap(bytes,name):null;
 }
 function encrypted(value) {
  if(typeof value!=='string' || value.length>16384)return null;
  const parts=value.split('--');if(parts.length!==3)return null;
  const [body,iv,tag]=parts.map(decode);if(!body || iv?.length!==12 || tag?.length!==16)return null;
  try {
   const cipher=createDecipheriv('aes-256-gcm',encryptedKey,iv);cipher.setAuthTag(tag);
   return unwrap(Buffer.concat([cipher.update(body),cipher.final()]),sessionCookie);
  }catch{return null;}
 }
 return {
  read(header) {
   const cookies=browserCookies(header),permanent=signed(cookies.permanent_session_id,'permanent_session_id'),session=encrypted(cookies[sessionCookie]);
   const delegated=signed(cookies.surrender_id,'surrender_id');
   const candidates=[];
   if(validId(permanent?.value))candidates.push({userId:String(permanent.value),expiresAt:permanent.expiresAt,remember:true,
    fingerprint:cookieFingerprint('rails-permanent:'+cookies.permanent_session_id)});
   if(session?.value && typeof session.value==='object' && !Array.isArray(session.value) && validId(session.value.user_id) && typeof session.value.session_id==='string' && session.value.session_id.length<=255) {
    candidates.push({userId:String(session.value.user_id),expiresAt:session.expiresAt,remember:false,
     fingerprint:cookieFingerprint('rails-session:'+session.value.session_id+':'+session.value.user_id)});
   }
   return {candidates,surrenderId:validId(delegated?.value)?String(delegated.value):null,
    invalidSurrender:Object.hasOwn(cookies,'surrender_id') && cookies.surrender_id!=='' && (!delegated || (delegated.value!==null && !validId(delegated.value))),
    csrf:typeof session?.value?._csrf_token==='string'?session.value._csrf_token:null};
  },
  signed,encrypted,
 };
}

export function createBrowserCsrf(secret,{now=Date.now,maxAge=14*86400000}={}) {
 const mac=text=>createHmac('sha256',secret).update('walltaker:browser:csrf:v1:'+text).digest('hex');
 const raw=cookie=>{
  if(typeof cookie!=='string')return null;
  const match=/^([A-Za-z0-9_-]{43})\.([0-9]{10,13})\.([a-f0-9]{64})$/.exec(cookie);if(!match)return null;
  const at=Number(match[2]);if(at>now()+30000 || at<now()-maxAge)return null;
  return equal(Buffer.from(mac(match[1]+'.'+match[2])),Buffer.from(match[3]))?Buffer.from(match[1],'base64url'):null;
 };
 const hmac=(key,value)=>createHmac('sha256',key).update(value).digest();
 const mask=value=>{const pad=randomBytes(32),result=Buffer.alloc(32);for(let i=0;i<32;i++)result[i]=pad[i]^value[i];return Buffer.concat([pad,result]).toString('base64url');};
 const candidate=value=>{
  const bytes=decode(value);if(bytes?.length===32)return bytes;
  if(bytes?.length!==64)return null;
  const result=Buffer.alloc(32);for(let i=0;i<32;i++)result[i]=bytes[i]^bytes[i+32];return result;
 };
 return {
  issue() {const value=randomBytes(32).toString('base64url')+'.'+now();return value+'.'+mac(value);},
  valid:cookie=>!!raw(cookie),
  token(cookie) {const key=raw(cookie);return key?mask(hmac(key,'!real_csrf_token')):null;},
  verify({cookie,legacyToken,tokens,method,path,origin,baseUrl}) {
   if(['GET','HEAD','OPTIONS'].includes(method))return true;
   if(origin && origin!==new URL(baseUrl).origin)return false;
   const keys=[raw(cookie),decode(legacyToken)].filter(key=>key?.length===32);
   return (Array.isArray(tokens)?tokens:[]).slice(0,2).some(value=>{
    const valueBytes=candidate(value);if(!valueBytes)return false;
    return keys.some(key=>[key,hmac(key,'!real_csrf_token'),hmac(key,(path || '/').replace(/\/$/,'')+'#'+String(method).toLowerCase())].some(expected=>equal(expected,valueBytes)));
   });
  },
 };
}
