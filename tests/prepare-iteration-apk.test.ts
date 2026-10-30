import {execFileSync} from 'node:child_process';
import {mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync, symlinkSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {afterEach, describe, expect, it} from 'vitest';
import {exportedAndroidBundle, replaceApkBundle} from '../scripts/prepare-iteration-apk.mts';
const roots:string[]=[];
afterEach(()=>{for(const p of roots.splice(0))rmSync(p,{recursive:true,force:true})});
function fixture(entries:Record<string,string>={'AndroidManifest.xml':'manifest','lib/x86_64/libapp.so':'native','assets/index.android.bundle':'old','META-INF/CERT.SF':'signature','META-INF/kotlin.module':'metadata'}){
 const root=mkdtempSync(join(tmpdir(),'synced-apk-'));roots.push(root);const apk=join(root,'input.apk'),bundle=join(root,'new.hbc'),output=join(root,'output.apk');
 execFileSync('python3',['-c','from zipfile import ZipFile;import json,sys;z=ZipFile(sys.argv[1],"w");[(z.writestr(k,v)) for k,v in json.loads(sys.argv[2]).items()];z.close()',apk,JSON.stringify(entries)]);
 writeFileSync(bundle,'new-bytecode');return {root,apk,bundle,output};
}
const contents=(apk:string)=>JSON.parse(execFileSync('python3',['-c','from zipfile import ZipFile;import json,sys;z=ZipFile(sys.argv[1]);print(json.dumps({n:z.read(n).decode() for n in z.namelist()}))',apk],{encoding:'utf8'}));
describe('JS-only APK envelope preservation',()=>{
 it('changes only the bundle and preserves native/configuration payload bytes',()=>{const f=fixture();const before=readFileSync(f.apk);replaceApkBundle(f.apk,f.bundle,f.output);expect(contents(f.output)).toEqual({'AndroidManifest.xml':'manifest','lib/x86_64/libapp.so':'native','assets/index.android.bundle':'new-bytecode','META-INF/kotlin.module':'metadata'});expect(readFileSync(f.apk)).toEqual(before)});
 it('refuses an empty replacement bundle',()=>{const f=fixture();writeFileSync(f.bundle,'');expect(()=>replaceApkBundle(f.apk,f.bundle,f.output)).toThrow('empty')});
 it('refuses an input without the expected bundle asset',()=>{const f=fixture({'AndroidManifest.xml':'manifest'});expect(()=>replaceApkBundle(f.apk,f.bundle,f.output)).toThrow('preparation failed')});
 it('refuses duplicate bundle assets',()=>{const f=fixture();execFileSync('python3',['-c','from zipfile import ZipFile;import sys;z=ZipFile(sys.argv[1],"a");z.writestr("assets/index.android.bundle","duplicate");z.close()',f.apk],{stdio:'ignore'});expect(()=>replaceApkBundle(f.apk,f.bundle,f.output)).toThrow('preparation failed')});
 it('retains an existing output if the audited input is invalid',()=>{const f=fixture();writeFileSync(f.apk,'invalid zip');writeFileSync(f.output,'previous result');expect(()=>replaceApkBundle(f.apk,f.bundle,f.output)).toThrow();expect(readFileSync(f.output,'utf8')).toBe('previous result')});
 it('never overwrites the audited source APK',()=>{const f=fixture();expect(()=>replaceApkBundle(f.apk,f.bundle,f.apk)).toThrow('never be overwritten')});
});
describe('Android export metadata bundle selection',()=>{
 function metadata(value:unknown){const f=fixture(),path=join(f.root,'metadata.json');writeFileSync(path,JSON.stringify(value));return {...f,path}}
 it('selects the metadata bundle instead of stale neighboring bundles',()=>{const f=metadata({fileMetadata:{android:{bundle:'new.hbc'}}});writeFileSync(join(f.root,'stale.hbc'),'old');expect(exportedAndroidBundle(f.path)).toBe(f.bundle)});
 it.each([{},null,{fileMetadata:{android:{bundle:'missing.hbc'}}},{fileMetadata:{android:{bundle:'/outside.hbc'}}},{fileMetadata:{android:{bundle:'new.js'}}},{fileMetadata:{android:{bundle:'../outside.hbc'}}}])('refuses invalid or missing Android metadata %#',value=>{const f=metadata(value);expect(()=>exportedAndroidBundle(f.path)).toThrow()});
 it('rejects a symlink that resolves outside the export directory',()=>{const f=metadata({fileMetadata:{android:{bundle:'link.hbc'}}});const other=mkdtempSync(join(tmpdir(),'synced-other-'));roots.push(other);writeFileSync(join(other,'external.hbc'),'external');symlinkSync(join(other,'external.hbc'),join(f.root,'link.hbc'));expect(()=>exportedAndroidBundle(f.path)).toThrow()});
 it('accepts a nested Android export bundle',()=>{const f=metadata({fileMetadata:{android:{bundle:'android/current.hbc'}}});mkdirSync(join(f.root,'android'));writeFileSync(join(f.root,'android/current.hbc'),'valid');expect(exportedAndroidBundle(f.path)).toBe(join(f.root,'android/current.hbc'))});
});
