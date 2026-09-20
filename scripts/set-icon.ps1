param([Parameter(Mandatory=$true)][string]$Executable,[Parameter(Mandatory=$true)][string]$Icon)
$ErrorActionPreference='Stop'
Add-Type -TypeDefinition @"
using System;
using System.IO;
using System.ComponentModel;
using System.Runtime.InteropServices;
public static class VaultResources {
 [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)] static extern IntPtr BeginUpdateResource(string file,bool delete);
 [DllImport("kernel32.dll", SetLastError=true)] static extern bool UpdateResource(IntPtr handle,IntPtr type,IntPtr name,ushort lang,byte[] data,uint size);
 [DllImport("kernel32.dll", SetLastError=true)] static extern bool EndUpdateResource(IntPtr handle,bool discard);
 public static void Apply(string file,string icon) {
  var bytes=File.ReadAllBytes(icon);int count=BitConverter.ToUInt16(bytes,4);var group=new byte[6+14*count];Array.Copy(bytes,0,group,0,6);
  var handle=BeginUpdateResource(file,false);if(handle==IntPtr.Zero)throw new Win32Exception();
  bool success=false;
  try {for(int i=0;i<count;i++){int p=6+16*i;int size=BitConverter.ToInt32(bytes,p+8),offset=BitConverter.ToInt32(bytes,p+12);var image=new byte[size];Array.Copy(bytes,offset,image,0,size);if(!UpdateResource(handle,(IntPtr)3,(IntPtr)(i+1),1033,image,(uint)size))throw new Win32Exception();Array.Copy(bytes,p,group,6+14*i,12);Array.Copy(BitConverter.GetBytes((ushort)(i+1)),0,group,6+14*i+12,2);}
   if(!UpdateResource(handle,(IntPtr)14,(IntPtr)1,1033,group,(uint)group.Length))throw new Win32Exception();var version=File.ReadAllBytes(file+".version-resource");if(!UpdateResource(handle,(IntPtr)16,(IntPtr)1,1033,version,(uint)version.Length))throw new Win32Exception();success=true;
  }finally{if(!EndUpdateResource(handle,!success))throw new Win32Exception();}
 }
}
"@
[VaultResources]::Apply($Executable,$Icon)
