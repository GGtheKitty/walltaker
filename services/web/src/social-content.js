import {createRequire} from 'node:module';
import {html,richText,paragraphs,safeUrl} from './templates/html.js';
const require=createRequire(import.meta.url);

// Preserve safe message formatting and link text nodes only, so existing links
// and their attributes cannot be corrupted by automatic URL linking.
export function messageText(content){
  const {parseDocument}=require('htmlparser2'),serialize=require('dom-serializer').default;
  const document=parseDocument(String(paragraphs(content)));
  function walk(node,inLink=false){
    if(!node.children)return;
    node.children=node.children.flatMap(child=>{
      if(child.type==='text'&&!inLink){
        const parts=child.data.split(/(https?:\/\/[^\s<>"']+)/g);
        if(parts.length>1)return parseDocument(String(html`${parts.map((s,i)=>i%2?html`<a href="${safeUrl(s)}">${s}</a>`:s)}`)).children;
      }
      walk(child,inLink||child.name==='a');return [child];
    });
  }
  walk(document);return richText(serialize(document));
}
