/* Deterministic execution of the actual bundled PSID programs, not a mock audio API. */
const assert=require('node:assert/strict'),path=require('node:path'),crypto=require('node:crypto'),fs=require('node:fs');
const root=path.resolve(process.env.UOS_AUDIO_ROOT||path.join(__dirname,'..'));
require(path.join(root,'vendor/sid-core.js'));global.window=global;require(path.join(root,'launcher/sid-tracks.js'));
const sid=new UOSSIDCore(48000),samples=new Float32Array(48000),records=[];
for(const track of UOSSIDTracks){
 const bytes=Uint8Array.from(Buffer.from(track.data,'base64'));
 assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),track.sha256);
 const fingerprint=()=>{sid.render(samples);assert(samples.every(Number.isFinite));return crypto.createHash('sha256').update(Buffer.from(samples.buffer)).digest('hex')};
 sid.load(bytes,track.subtune-1);const first=fingerprint();
 let sum=0,peak=0;for(const value of samples){sum+=value*value;peak=Math.max(peak,Math.abs(value))}
 assert(sum>0,'actual SID program produces nonzero PCM');
 sid.load(bytes,track.subtune-1);assert.equal(fingerprint(),first,'restart restores deterministic CPU/SID state');
 const saved=sid.save(),expected=new Float32Array(4096),actual=new Float32Array(4096);sid.render(expected);
 const restored=new UOSSIDCore(48000);restored.load(bytes,track.subtune-1);restored.restore(saved);restored.render(actual);
 assert.deepEqual(actual,expected,'navigation checkpoint restores the exact next CPU/SID samples');
 if(track.id==='Last_Ninja_2'){sid.load(bytes,0);assert.notEqual(fingerprint(),first,'Central Park subtune 2 differs from loader subtune 1')}
 records.push({title:track.title,composer:track.composer,subtune:track.subtune,sourceSHA256:track.sha256,firstSecondPCM_SHA256:first,rms:Math.sqrt(sum/samples.length),peak});
}
assert.equal(new Set(records.map(record=>record.firstSecondPCM_SHA256)).size,3,'three tune programs produce distinct audio');
const result={result:'PASS',sampleRate:48000,framesPerTrack:48000,records};
console.log(JSON.stringify(result,null,2));if(process.env.UOS_SID_CORE_RESULTS)fs.writeFileSync(process.env.UOS_SID_CORE_RESULTS,JSON.stringify(result,null,2));
