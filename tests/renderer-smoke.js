window.__testOnboarding=async()=>{
  const results=[];const check=(ok,label)=>{if(!ok)throw new Error(label);results.push(label);};
  check(!state.scanEnabled&&!state.sessions.length,'No scan before source selection');
  showWelcome();$('#skipWelcome').checked=false;
  check(await setupSources('files')===false && $('#welcome').open,'Cancelled picker stays on welcome');
  check(await setupSources('folder')===true && state.sessions.length===2,'Selected folder only');
  showWelcome();$('#skipWelcome').checked=true;await setupSources('files');
  check(state.sessions.length===1&&state.config.roots.length===1,'Single file replaces previous sources');
  check((await api('init')).skipWelcome===true,'Do not show preference saved');
  localStorage.setItem('hideLeft','true');localStorage.setItem('hideRight','true');applyPanels();
  appearance.set('light','catppuccin');appearance.set('mode','light');
  return results;
};
window.__testResume=async()=>{
  if($('#welcome').open||state.sessions.length!==1||!state.scanEnabled)throw new Error('Saved startup choice did not survive reload');
  if(!document.body.classList.contains('left-hidden')||!document.body.classList.contains('right-hidden'))throw new Error('Panel preferences did not survive reload');
  if(appearance.get().mode!=='light'||document.documentElement.dataset.palette!=='catppuccin')throw new Error('Theme preferences did not survive reload');
  appearance.set('light','codex');appearance.set('mode','system');await api('nativeTheme','system');
  togglePanel('Left');togglePanel('Right');
  showWelcome();$('#skipWelcome').checked=false;await setupSources('default');
  if(state.config.roots.length!==1||state.config.roots[0]!==state.config.defaultRoot)throw new Error('Default source not explicitly selected');
};
window.__showView=go;
window.__smoke=async()=>{
  const errors=[];const views=[];
  if(!state.sessions.length)errors.push('No real sessions loaded');
  const representative=state.sessions.filter(s=>!isService(s)).sort((a,b)=>b.messages-a.messages)[0];
  if(representative)await selectSession(representative.id);
  for(const view of ['conversation','dashboard','chapters','timeline','graph','search','export','settings']){await go(view);const text=$('#view').innerText;if(text.includes(L('Не удалось открыть представление')))errors.push(view+': '+text);views.push({view,characters:text.length});}
  state.query='codex';await go('search');const hits=$('#results').innerText;
  if(hits.includes(L('Совпадений нет')))errors.push('Search returned no Codex matches');
  await go('conversation');
  if(representative?.messages>60){state.offset=60;await render();if(!$('.pager')?.textContent.includes('61'))errors.push('Conversation pagination failed');}
  if(state.chapters.length>2){const target=state.chapters[2];await jump(target.line);if(!document.getElementById('line-'+target.line))errors.push('Chapter anchor failed');}
  state.mode='tools';state.offset=0;await render();if(representative?.tools && !document.querySelector('details.tool'))errors.push('Tools view empty');
  state.mode='conversation';await go('conversation');
  const savedOffset=state.offset;$('#view').scrollTo({top:100,behavior:'instant'});const savedScroll=$('#view').scrollTop;
  await go('export');if($('#returnBar').hidden)errors.push('Export has no return control');
  await go('search');await closeUtility();if(state.view!=='export')errors.push('Nested utility return failed');
  $('#closeView').click();await new Promise(r=>setTimeout(r,150));if(state.view!=='conversation'||state.offset!==savedOffset||Math.abs($('#view').scrollTop-savedScroll)>2)errors.push('Return did not restore reading position');
  await go('search');document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}));await new Promise(r=>setTimeout(r,100));if(state.view!=='conversation')errors.push('Escape did not close search');
  for(const side of ['Left','Right']){const before=localStorage.getItem('hide'+side)==='true';togglePanel(side);if(document.body.classList.contains(side.toLowerCase()+'-hidden')===before)errors.push(side+' toggle failed');applyPanels();if($('#toggle'+side).getAttribute('aria-expanded')!==String(before))errors.push(side+' preference not restored');togglePanel(side);}
  if(document.querySelector('.tabs')||document.querySelector('[data-view="search"]')||document.querySelectorAll('.view-nav [data-view]').length!==6)errors.push('Duplicate navigation remains');
  if(document.querySelector('select#mode')||document.querySelectorAll('[data-mode]').length!==3)errors.push('Conversation segment controls missing');
  for(const mode of ['all','tools','conversation']){document.querySelector('[data-mode="'+mode+'"]').click();await new Promise(r=>setTimeout(r,100));if(state.mode!==mode||document.querySelector('[data-mode="'+mode+'"]').getAttribute('aria-pressed')!=='true')errors.push('Mode control failed: '+mode);}
  const leftRect=$('#toggleLeft').getBoundingClientRect(),rightRect=$('#toggleRight').getBoundingClientRect();if(leftRect.x>30||rightRect.right<innerWidth-30)errors.push('Panel controls are not on opposite edges');
  let themeVariants=0;
  for(const preset of appearance.presets)for(const mode of ['light','dark'])if(preset[mode]){
    appearance.set(mode,preset.id);appearance.set('mode',mode);themeVariants++;
    const css=getComputedStyle(document.documentElement),value=k=>css.getPropertyValue('--'+k).trim();
    if(appearance.contrast(value('text'),value('raised'))<4.5||appearance.contrast(value('muted'),value('raised'))<4.5)errors.push('Insufficient text contrast: '+preset.id+'/'+mode);
  }
  appearance.set('light','codex');appearance.set('dark','codex');appearance.set('mode','system');
  const layout=['.topbar' ,'.document-header','.view-nav','.body-grid','#view','h1'].map(s=>{const r=$(s).getBoundingClientRect();return {s,x:r.x,y:r.y,w:r.width,h:r.height};});
  return {errors,views,themeFamilies:appearance.presets.length,themeVariants,sessions:state.sessions.length,selected:state.current?.id,messages:document.querySelectorAll('.message').length,layout};
};
