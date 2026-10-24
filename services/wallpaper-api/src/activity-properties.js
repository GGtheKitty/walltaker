const sensitive = key => /password|passwd|secret|token|api[_-]?key|authorization|cookie|digest|credential/i.test(key);
export function analyticsUrl(value) {
 if(typeof value!=='string')return null;
 try {
  const url=new URL(value);if(!['http:','https:'].includes(url.protocol))return null;
  url.username='';url.password='';url.hash='';
  for(const key of [...url.searchParams.keys()])if(sensitive(key))url.searchParams.set(key,'[FILTERED]');
  return url.href.slice(0,8192);
 }catch{return null;}
}
export function activityProperties(value,depth=0) {
 if(depth>5)return '[TRUNCATED]';
 if(value==null || typeof value==='boolean')return value;
 if(typeof value==='number')return Number.isFinite(value)?value:null;
 if(typeof value==='string')return value.replace(/\0/g,'').slice(0,8192);
 if(Array.isArray(value))return value.slice(0,100).map(v=>activityProperties(v,depth+1));
 if(typeof value==='object')return Object.fromEntries(Object.entries(value).slice(0,100).map(([key,v])=>[
  key.slice(0,255),sensitive(key)?'[FILTERED]':/^(?:_?url|landing_page|referrer)$/i.test(key)?analyticsUrl(v):activityProperties(v,depth+1)
 ]));
 return null;
}
