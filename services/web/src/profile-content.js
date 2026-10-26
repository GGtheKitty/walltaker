import {createRequire} from 'node:module';
import {domainToASCII} from 'node:url';
import {isIP} from 'node:net';
const require=createRequire(import.meta.url);
export const MARKDOWN_MARKER='<!-- walltaker:markdown -->\n';
export const markdownSource=value=>String(value ?? '').startsWith(MARKDOWN_MARKER)?String(value).slice(MARKDOWN_MARKER.length):String(value ?? '');
export const dumpMarkdown=value=>MARKDOWN_MARKER+Array.from(markdownSource(value)).slice(0,50000).join('');
export const isMarkdown=value=>String(value ?? '').startsWith(MARKDOWN_MARKER);
export function markdown(value){return require('marked').marked.parse(markdownSource(value),{gfm:true,breaks:true});}
const tags='table th picture nav header footer ins kbd main marquee section map time area figure figcaption hgroup thead tbody tfoot details summary caption colgroup td tr link a abbr acronym address b big blockquote br cite code dd del dfn div dl dt em h1 h2 h3 h4 h5 h6 hr i img ins kbd li ol p pre samp small span strong sub sup time tt ul var style video audio source iframe relative-time sparkly-text'.split(' ');
const attributes='behavior bgcolor direction hspace datetime scrollamount scrolldelay truespeed align valign vspace style src href class id width height alt lang title rel colspan rowspan controls autoplay loop preload muted shape coords target'.split(' ');
// Match the legacy executable property, not ordinary properties such as
// scroll-behavior. A false positive here removes the entire custom stylesheet.
const unsafeCss=value=>/(?:expression\s*\(|(?:java|vb)script\s*:|@(?:-moz-)?document|(?<![\w-])behavior\s*:|-moz-binding\s*:)/i.test(value);
export function sanitizeProfileHTML(value,{advanced=true}={}){
  const sanitize=require('sanitize-html');
  return sanitize(String(value ?? ''),{allowedTags:advanced?tags:[...sanitize.defaults.allowedTags,'img','style','ins'],allowedAttributes:{'*':attributes},allowedSchemes:['http','https','ftp','mailto','tel'],allowedSchemesByTag:{img:['http','https','data']},allowVulnerableTags:true,parseStyleAttributes:false,
    exclusiveFilter:frame=>frame.tag==='style'&&unsafeCss(frame.text),
    transformTags:{'*':(tagName,attribs)=>{if(attribs.style&&unsafeCss(attribs.style))delete attribs.style;return {tagName,attribs};}}});
}
export function renderedProfile(content,advanced){
  if(!String(content || '').trim())return '<blockquote><small>No profile description... yet!</small></blockquote>';
  if(isMarkdown(content))return '<blockquote>'+sanitizeProfileHTML(markdown(content),{advanced:false})+'</blockquote>';
  if(advanced)return sanitizeProfileHTML(content);
  const sanitized=sanitizeProfileHTML(content,{advanced:false});
  return '<blockquote>'+sanitized.replace(/\r\n?/g,'\n').split(/\n\n+/).map(p=>'<p>'+p.replaceAll('\n','<br>')+'</p>').join('\n\n')+'</blockquote>';
}
export function normalizeHostname(value){
  try {const host=String(value || '').trim().toLowerCase().replace(/^\[|\]$/g,'').replace(/\.$/,'');if(isIP(host))return host;const ascii=domainToASCII(host);return ascii&&ascii.length<=253&&ascii.split('.').every(label=>/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))?ascii:null;}catch{return null;}
}
function hostname(value){try{const raw=String(value || '').trim();if(!raw || /^(?:#|mailto:|tel:)/i.test(raw)||raw.startsWith('/')&&!raw.startsWith('//'))return null;const url=new URL(raw.startsWith('//')?'https:'+raw:raw);return ['http:','https:'].includes(url.protocol)?normalizeHostname(url.hostname):null;}catch{return null;}}
export function filterProfileDomains(content,rules=[]){
  const domains=new Set(),blockedDomains=new Set();
  function blocked(value){
    const host=hostname(value);if(!host)return false;domains.add(host);
    const candidates=host.includes(':')?[host]:host.split('.').map((_,i)=>host.split('.').slice(i).join('.'));
    const rule=candidates.map(domain=>rules.find(r=>r.domain===domain&&!['pending',0,'0'].includes(r.status))).find(Boolean);
    if(rule&&[2,'2','blocked'].includes(rule.status)){blockedDomains.add(rule.domain);return true;}return false;
  }
  function css(value){return String(value).replace(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^)]*))\s*\)/gi,(raw,a,b,c)=>blocked((a??b??c??'').trim())?'url("")':raw).replace(/(@import\s+)(["'])(.*?)\2/gi,(raw,prefix,quote,url)=>blocked(url)?prefix+quote+quote:raw);}
  function html(value){
    const {parseDocument}=require('htmlparser2'),serialize=require('dom-serializer').default;
    const document=parseDocument(String(value));
    function walk(node){
      if(node.attribs){for(const key of ['action','cite','formaction','href','poster','src'])if(key in node.attribs&&blocked(node.attribs[key]))delete node.attribs[key];if(node.attribs.style)node.attribs.style=css(node.attribs.style);}
      if(node.name==='style')for(const child of node.children || [])if(child.type==='text')child.data=css(child.data);
      for(const child of node.children || [])walk(child);
    }
    walk(document);return serialize(document);
  }
  let filtered=String(content ?? '');
  if(isMarkdown(filtered)){
    let source=markdownSource(filtered);const marked=require('marked').marked,tokens=marked.lexer(source,{gfm:true,breaks:true}),replacements=[];
    marked.walkTokens(tokens,token=>{
      if(['link','image'].includes(token.type)&&blocked(token.href))replacements.push([token.raw,`${token.type==='image'?'!':''}[${token.text}]()`]);
      else if(token.type==='html'){const clean=html(token.raw);if(clean!==token.raw)replacements.push([token.raw,clean]);}
      else if(token.type==='def'&&blocked(token.href))replacements.push([token.raw,'']);
    });
    for(const [raw,clean] of replacements)source=source.replaceAll(raw,clean);
    filtered=MARKDOWN_MARKER+source;
  }else filtered=html(filtered);
  return {content:blockedDomains.size?filtered:String(content ?? ''),domains:[...domains].sort(),blocked_domains:[...blockedDomains].sort()};
}
