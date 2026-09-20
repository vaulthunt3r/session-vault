window.icon=(name)=>{
  const paths={
    conversation:'<path d="M4 4h16v12H9l-5 4z"/><path d="M8 8h8M8 12h5"/>',
    all:'<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 7h8M8 12h8M8 17h8"/>',
    tools:'<path d="m8 6-6 6 6 6m8-12 6 6-6 6m-3-14-2 16"/>',
    dashboard:'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
    chapters:'<path d="M12 5c-3-2-6-2-10-1v15c4-1 7-1 10 1 3-2 6-2 10-1V4c-4-1-7-1-10 1v15"/>',
    timeline:'<path d="M6 3v18m4-15h10m-10 6h7m-7 6h10"/><circle cx="6" cy="6" r="2"/><circle cx="6" cy="12" r="2"/><circle cx="6" cy="18" r="2"/>',
    graph:'<circle cx="12" cy="12" r="3"/><circle cx="4" cy="4" r="2"/><circle cx="20" cy="5" r="2"/><circle cx="19" cy="20" r="2"/><circle cx="4" cy="19" r="2"/><path d="m6 6 4 4m4 0 4-4m-4 8 4 4m-8-4-4 4"/>',
    left:'<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16m-3-12v8"/>',
    right:'<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M15 4v16m3-12v8"/>',
    system:'<rect x="3" y="3" width="18" height="13" rx="2"/><path d="M12 16v5m-5 0h10"/>',
    light:'<circle cx="12" cy="12" r="4"/><path d="M12 1v3m0 16v3M1 12h3m16 0h3M4 4l2 2m12 12 2 2M4 20l2-2M18 6l2-2"/>',
    dark:'<path d="M20 15A9 9 0 0 1 9 4a9 9 0 1 0 11 11z"/>'
  };
  return `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${paths[name]||paths.all}</svg>`;
};
