'use strict';
(() => {
 let language=localStorage.getItem('language')||'en';if(!['en','ru','uk'].includes(language))language='en';
 const dictionary=window.VAULT_TRANSLATIONS;
 const pattern=new RegExp(Object.keys(dictionary).sort((a,b)=>b.length-a.length).map(s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('|'),'g');
 // Only static UI literals go through this function. Session content is never translated.
 const L=value=>language==='ru'?String(value):String(value).replace(pattern,key=>dictionary[key][language==='en'?0:1]);
 const Lh=(parts,...values)=>parts.reduce((out,part,i)=>out+L(part)+(i<values.length?values[i]:''),'');
 function localizePage(){
  document.documentElement.lang=language;const walk=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);
  while(walk.nextNode()){const n=walk.currentNode;if(!n.parentElement.closest('script,style'))n.textContent=L(n.textContent);}
  for(const el of document.querySelectorAll('[title],[aria-label],[placeholder]'))for(const attr of ['title','aria-label','placeholder'])if(el.hasAttribute(attr))el.setAttribute(attr,L(el.getAttribute(attr)));
 }
 window.L=L;window.Lh=Lh;window.i18n={language,locale:{en:'en-US',ru:'ru-RU',uk:'uk-UA'}[language],localizePage};
})();
