// Concurrent-baseline A/B: every fixture sent TWICE back to back in ONE pass, once as
// claude-code and once as codex, so a divergence cannot be an artefact of the org policy
// having moved between two runs (which is exactly what the first comparison hit).
import { readFileSync, writeFileSync } from 'node:fs';
const ISO='C:/Users/Owner/AppData/Local/Temp/devoid-p47-iso';
const EV='C:/Users/Owner/Documents/Ceragon/.plans/m47a-20260822/stage1-evidence/codex';
const TOKEN=readFileSync(`${ISO}/home/.devoid/daemon-token`,'utf8').trim();
const fx=JSON.parse(readFileSync(`${ISO}/drive-fixtures.b64.json`,'utf8'));
const dec=(b)=>Buffer.from(b,'base64').toString('utf8');
const post=async(p,b)=>{const r=await fetch('http://127.0.0.1:19390'+p,{method:'POST',headers:{'content-type':'application/json','X-Devoid-Daemon-Token':TOKEN},body:JSON.stringify(b)});const t=await r.text();let j;try{j=JSON.parse(t)}catch{j={raw:t.slice(0,300)}}return{status:r.status,json:j}};
const IDS={
  'claude-code':{agentType:'claude-code',provider:'anthropic',clientKind:'claude-code',pfx:'toolu_'},
  'codex'      :{agentType:'codex',provider:'openai',clientKind:'codex-cli',pfx:'exec-'},
};
const sessions={};
for(const k of Object.keys(IDS)){
  const {pfx,...id}=IDS[k];
  const s=await post('/v1/ai/session/start',{...id,surface:'cli',osUser:'e2e',clientSessionId:'ab2-'+k+'-'+Date.now(),title:'stage-1 AB '+k});
  sessions[k]=s.json.sessionId||'';
  console.log('session',k,sessions[k]);
}
const PATHS={tool:'/v1/ai/tool-decision',prompt:'/v1/ai/prompt-check',post:'/v1/ai/post-tool'};
const rows=[];
for(const f of fx){
  const rec={name:f.name,lane:f.lane,expect:f.expect};
  for(const k of ['claude-code','codex']){
    const {pfx,...id}=IDS[k];
    const S={...id,surface:'cli',osUser:'e2e',sessionId:sessions[k],cwd:'C:/cwt/p47-e2e-project'};
    let body;
    const payload=dec(f.p);
    if(f.lane==='tool') body={...S,toolName:'Bash',toolUseId:pfx+Math.random().toString(36).slice(2,8),toolInput:{command:payload}};
    else if(f.lane==='prompt') body={...S,text:payload};
    else body={...S,toolName:'Bash',toolUseId:pfx+Math.random().toString(36).slice(2,8),output:payload};
    const r=await post(PATHS[f.lane],body);
    rec[k]={status:r.status,json:r.json};
  }
  const sig=(o)=>JSON.stringify({d:o.json.decision??null,t:o.json.tainted??null,rd:o.json.redacted??null,
     rc:o.json.redactedClasses??o.json.classes??o.json.findingClasses??null, r:(o.json.reason||'').slice(0,90)});
  rec.diverge = sig(rec['claude-code'])!==sig(rec['codex']);
  rec.sigClaude=sig(rec['claude-code']); rec.sigCodex=sig(rec['codex']);
  rows.push(rec);
  console.log((rec.diverge?'DIVERGE ':'same    ')+f.lane.padEnd(7)+f.name.padEnd(50)+
     ' claude='+(rec['claude-code'].json.decision??JSON.stringify(rec['claude-code'].json).slice(0,40))+
     ' codex='+(rec['codex'].json.decision??JSON.stringify(rec['codex'].json).slice(0,40)));
  if(rec.diverge){console.log('   claude: '+rec.sigClaude+'\n   codex : '+rec.sigCodex);}
}
for(const k of Object.keys(IDS)){const {pfx,...id}=IDS[k];await post('/v1/ai/session/end',{...id,sessionId:sessions[k],reason:'ab2 done'});}
writeFileSync(`${EV}/ab-all-results.json`,JSON.stringify({sessions,rows},null,2));
console.log('\n'+rows.filter(r=>r.diverge).length+' divergence(s) of '+rows.length+' fixtures (concurrent baseline)');
