import { readFileSync, writeFileSync } from 'node:fs';
const ISO='C:/Users/Owner/AppData/Local/Temp/devoid-p47-iso';
const EV='C:/Users/Owner/Documents/Ceragon/.plans/m47a-20260822/stage1-evidence/codex';
const A=JSON.parse(readFileSync(`${ISO}/drive-results.json`,'utf8'));   // claude-code
const B=JSON.parse(readFileSync(`${EV}/codex-daemon-results.json`,'utf8')); // codex
const norm=(j)=>{ if(!j) return {};
  const o={};
  for(const k of ['decision','tainted','redacted','redactedClasses','classes','findingClasses','reason','monitored','holdId','warn'])
    if(j[k]!==undefined) o[k]=j[k];
  return o; };
const key=(r)=>r.name;
const mapA=new Map(A.map(r=>[key(r),r]));
const rows=[];
for(const b of B){
  const a=mapA.get(key(b));
  if(!a){ rows.push({name:b.name,claude:'(absent)',codex:JSON.stringify(norm(b.json)),diverge:true}); continue; }
  const na=norm(a.json), nb=norm(b.json);
  // compare only the decision-shaped fields
  const da=JSON.stringify({d:na.decision??null,t:na.tainted??null,r:(na.reason||'').slice(0,80)});
  const db=JSON.stringify({d:nb.decision??null,t:nb.tainted??null,r:(nb.reason||'').slice(0,80)});
  rows.push({name:b.name, expect:b.expect, claude:da, codex:db, diverge: da!==db});
}
let out='';
for(const r of rows){
  out += (r.diverge?'DIVERGE  ':'same     ')+r.name.padEnd(52)+'\n';
  if(r.diverge){ out+='   claude: '+r.claude+'\n   codex : '+r.codex+'\n'; }
}
const n=rows.filter(r=>r.diverge).length;
out+=`\n${n} divergence(s) of ${rows.length} compared\n`;
console.log(out);
writeFileSync(`${EV}/compare-claude-vs-codex.txt`,out);
