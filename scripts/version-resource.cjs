const u16=s=>Buffer.from(s+'\0','utf16le');
const pad=b=>Buffer.concat([b,Buffer.alloc((4-b.length%4)%4)]);
function block(key,value,valueLength,type,children=[]){let b=pad(Buffer.concat([Buffer.alloc(6),u16(key)]));b=Buffer.concat([b,value]);for(const child of children)b=Buffer.concat([pad(b),child]);b.writeUInt16LE(b.length,0);b.writeUInt16LE(valueLength,2);b.writeUInt16LE(type,4);return b;}
module.exports=pkg=>{
 const [major,minor,patch]=pkg.version.split('.').map(Number),fixed=Buffer.alloc(52);
 [0xfeef04bd,0x10000,(major<<16)|minor,patch<<16,(major<<16)|minor,patch<<16,0x3f,0,0x40004,1,0,0,0].forEach((v,i)=>fixed.writeUInt32LE(v>>>0,i*4));
 const fields={CompanyName:'Session Vault',FileDescription:'Session Vault',FileVersion:pkg.version+'.0',InternalName:'Session Vault',OriginalFilename:'Session Vault.exe',ProductName:'Session Vault',ProductVersion:pkg.version};
 const strings=Object.entries(fields).map(([k,v])=>block(k,u16(v),v.length+1,1));
 const translation=Buffer.from([9,4,0xb0,4]);
 return block('VS_VERSION_INFO',fixed,fixed.length,0,[block('StringFileInfo',Buffer.alloc(0),0,1,[block('040904b0',Buffer.alloc(0),0,1,strings)]),block('VarFileInfo',Buffer.alloc(0),0,1,[block('Translation',translation,4,0)])]);
};
