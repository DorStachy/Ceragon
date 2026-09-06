// A/B: the SAME chmod-broad-777 fixture, same daemon, same moment, only agentType differs.
import { readFileSync, writeFileSync } from 'node:fs';
const ISO='C:/Users/Owner/AppData/Local/Temp/devoid-p47-iso';
const EV='C:/Users/Owner/Documents/Ceragon/.plans/m47a-20260822/stage1-evidence/codex';
const TOKEN=readFileSync(`${ISO}/home/.devoid/daemon-token`,'utf8').trim();
const fx=JSON.parse(readFileSync(`${ISO}/drive-fixtures.b64.json`,'utf8'));
const dec=(b)=>Buffer.from(b,'base64').toString('utf8');
const target=process.argv[2]||'chmod';
const picked=fx.filter(f=>f.name.toLowerCase().includes(target.toLowerCase()));
const post=async(p,b)=>{const r=await fetch('http://127.0.0.1:19390'+p,{method:'POST',headers:{'content-type':'application/json','X-Devoid-Daemon-Token':TOKEN},body:JSON.stringify(b)});const t=await r.text();try{return JSON.parse(t)}catch{return{raw:t}}};
const out=[];
for(const f of picked){
 for(const id of [
   {agentType:'claude-code',provider:'anthropic',clientKind:'claude-code'},
   {agentType:'codex',provider:'openai',clientKind:'codex-cli'},
   {agentType:'claude-code',provider:'anthropic',clientKind:'claude-code'},
   {agentType:'codex',provider:'openai',clientKind:'codex-cli'}]){
  const s=await post('/v1/ai/session/start',{...id,surface:'cli',osUser:'e2e',clientSessionId:'ab-'+Math.random().toString(36).slice(2)});
  const sid=s.sessionId||'';
  const body={...id,surface:'cli',osUser:'e2e',sessionId:sid,cwd:'C:/cwt/p47-e2e-project',
    toolName:'Bash',toolUseId:(id.agentType==='codex'?'exec-':'toolu_')+Math.random().toString(36).slice(2,8),
    toolInput:{command:dec(f.p)}};
  const r=await post('/v1/ai/tool-decision',body);
  out.push({fixture:f.name,agentType:id.agentType,sessionId:sid,decision:r.decision,reason:(r.reason||'').slice(0,120),full:r});
  console.log(f.name,'|',id.agentType.padEnd(12),'->',r.decision, '|', (r.reason||'').slice(0,70));
  await post('/v1/ai/session/end',{...id,sessionId:sid,reason:'ab'});
 }
}
writeFileSync(`${EV}/ab-${target}.json`,JSON.stringify(out,null,2));
