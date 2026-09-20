'use strict';
(() => {
  const presets=window.CODEX_THEMES;
  const system=matchMedia('(prefers-color-scheme: dark)');
  let prefs={mode:'system',light:'codex',dark:'codex'};
  try{prefs={...prefs,...JSON.parse(localStorage.getItem('appearance')||'{}')};}catch{}
  if(!['system','light','dark'].includes(prefs.mode))prefs.mode='system';
  for(const mode of ['light','dark'])if(!presets.some(p=>p.id===prefs[mode]&&p[mode]))prefs[mode]='codex';
  const rgb=hex=>hex.match(/[a-f\d]{2}/gi).map(x=>parseInt(x,16));
  const mix=(a,b,t)=>'#'+rgb(a).map((v,i)=>Math.round(v+(rgb(b)[i]-v)*t).toString(16).padStart(2,'0')).join('');
  const luminance=hex=>rgb(hex).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}).reduce((n,v,i)=>n+v*[.2126,.7152,.0722][i],0);
  const contrast=(a,b)=>(Math.max(luminance(a),luminance(b))+.05)/(Math.min(luminance(a),luminance(b))+.05);
  function readable(color,bg,ink,min=4.5){for(let n=0;n<20&&contrast(color,bg)<min;n++)color=mix(color,ink,.15);return color;}
  function apply(){
    const mode=prefs.mode==='system'?(system.matches?'dark':'light'):prefs.mode;
    const p={...presets.find(t=>t.id===prefs[mode])[mode]};
    const pane=mix(p.bg,p.ink,.035),raised=mix(p.bg,p.ink,.075);
    p.ink=readable(p.ink,raised,mode==='light'?'#000000':'#ffffff',5);
    const accent=readable(p.accent,raised,p.ink);
    const vars={bg:p.bg,pane,raised,line:mix(p.bg,p.ink,.20),text:p.ink,muted:readable(mix(p.bg,p.ink,.62),raised,p.ink),blue:accent,green:readable(mode==='light'?'#147a49':'#4edea3',raised,p.ink),purple:readable(mode==='light'?'#7443bd':'#b8a1ed',raised,p.ink),warn:readable(mode==='light'?'#946000':'#ddbc73',raised,p.ink),error:readable(mode==='light'?'#b42318':'#efa998',raised,p.ink),selection:mix(p.bg,accent,.13),code:mix(p.bg,p.ink,.025),'accent-ink':contrast('#ffffff',accent)>contrast('#111111',accent)?'#ffffff':'#111111'};
    for(const [key,value]of Object.entries(vars))document.documentElement.style.setProperty('--'+key,value);
    document.documentElement.style.colorScheme=mode;document.documentElement.dataset.appearance=mode;document.documentElement.dataset.palette=prefs[mode];
    document.dispatchEvent(new CustomEvent('appearancechange',{detail:{...prefs,resolved:mode}}));
  }
  function set(key,value){if(key==='mode'&&!['system','light','dark'].includes(value))return;if(['light','dark'].includes(key)&&!presets.some(p=>p.id===value&&p[key]))return;if(!['mode','light','dark'].includes(key))return;prefs[key]=value;localStorage.setItem('appearance',JSON.stringify(prefs));apply();}
  system.addEventListener('change',()=>{if(prefs.mode==='system')apply();});
  window.appearance={get:()=>({...prefs}),set,presets,apply,contrast};apply();
})();
