import{parseDocument}from'htmlparser2';
import render from'dom-serializer';
import{marked}from'marked';
import{domainDecision,normalizeDomain}from'./moderation-domains.js';
import{marker}from'./html.js';
export function filterProfileDomains(content,rules=[]) {
 content=String(content ?? '');const domains=new Set(),blocked=new Set();
 const blockedUrl=raw=>{
  const value=String(raw ?? '').trim().replace(/&(#x[0-9a-f]+|#\d+|amp|quot|apos|lt|gt);/gi,(all,entity)=>{if(entity[0]==='#'){const code=entity[1].toLowerCase()==='x'?parseInt(entity.slice(2),16):parseInt(entity.slice(1),10);return code>0&&code<=0x10ffff?String.fromCodePoint(code):all;}return {amp:'&',quot:'\"',apos:"'",lt:'<',gt:'>'}[entity.toLowerCase()] || all;});if(!value||value.startsWith('#')||/^(?:mailto|tel):/i.test(value)||value.startsWith('/')&&!value.startsWith('//'))return false;
  let host;try{const url=new URL(value.startsWith('//')?'https:'+value:value);if(!['http:','https:'].includes(url.protocol))return false;host=normalizeDomain(url.hostname);}catch{return false;}
  domains.add(host);const decision=domainDecision(rules,host);if(decision?.status!==2)return false;blocked.add(decision.domain);return true;
 };
 const css=value=>String(value).replace(/(url\(\s*)(["']?)(.*?)\2\s*\)/gis,(all,prefix,quote,url)=>blockedUrl(url)?prefix+quote+quote+')':all).replace(/(@import\s+)(["'])(.*?)\2/gis,(all,prefix,quote,url)=>blockedUrl(url)?prefix+quote+quote:all);
 const html=value=>{
  const document=parseDocument(value,{decodeEntities:true});
  const walk=node=>{if(node.attribs){for(const attr of ['action','cite','formaction','href','poster','src'])if(Object.hasOwn(node.attribs,attr)&&blockedUrl(node.attribs[attr]))delete node.attribs[attr];if(node.attribs.style)node.attribs.style=css(node.attribs.style);}
   if(node.name==='style')for(const child of node.children || [])if(child.type==='text')child.data=css(child.data);
   for(const child of node.children || [])walk(child);
  };walk(document);return render(document,{encodeEntities:'utf8'});
 };
 let filtered;
 if(content.startsWith(marker)) {
  let source=content.slice(marker.length);const tokens=marked.lexer(source);
  marked.walkTokens(tokens,token=>{if(['image','link','def'].includes(token.type)&&token.href&&blockedUrl(token.href))source=source.replaceAll(token.raw,token.raw.replace(token.href,''));if(token.type==='html'){const filtered=html(token.raw);if(filtered!==token.raw&&blocked.size)source=source.replaceAll(token.raw,filtered);}});
  // Raw HTML and styles are legal Markdown. Reuse the same attribute/CSS policy
  // without converting the editable Markdown source into rendered HTML.
  source=source.replace(/(\b(?:action|cite|formaction|href|poster|src)\s*=\s*)(["'])(.*?)\2/gis,(all,prefix,quote,url)=>blockedUrl(url)?prefix+quote+quote:all);
  filtered=marker+css(source);
 }else filtered=html(content);
 return {content:blocked.size?filtered:content,domains:[...domains].sort(),blocked_domains:[...blocked].sort()};
}
