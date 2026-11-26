'use strict';
const $=id=>document.getElementById(id), data=window.STUDY_DATA, cfg=window.STUDY_CONFIG;
const metrics=['instruction','preservation'];
const metricNames={instruction:'R-MOS ↑ · Instruction relevance',preservation:'F-MOS ↑ · Preservation of unedited content'};
let state, inputPlayed=false;
const params=new URLSearchParams(location.search), token=params.get('token')||'';
// Remove invitation token from the address bar without losing it on reload.
if(token){sessionStorage.setItem('listen-token',token);history.replaceState(null,'',location.pathname+'?slot='+(params.get('slot')||''))}
const invitationToken=token||sessionStorage.getItem('listen-token')||'';
function seed(s){let h=2166136261;for(const ch of s)h=Math.imul(h^ch.charCodeAt(0),16777619);return ()=>{h+=0x6D2B79F5;let t=Math.imul(h^h>>>15,1|h);t^=t+Math.imul(t^t>>>7,61|t);return ((t^t>>>14)>>>0)/4294967296}}
function shuffle(a,r){a=a.slice();for(let i=a.length-1;i>0;i--){let j=Math.floor(r()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a}
function createSessionId(){
 const bytes=crypto.getRandomValues(new Uint8Array(16));
 bytes[6]=(bytes[6]&15)|64;
 bytes[8]=(bytes[8]&63)|128;
 const hex=Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
 return [hex.slice(0,8),hex.slice(8,12),hex.slice(12,16),hex.slice(16,20),hex.slice(20)].join('-');
}
function draftKey(slot){return 'listen:'+data.version+':'+slot}
function activeSlotKey(){return 'listen-active:'+data.version}
function save(){
 localStorage.setItem(draftKey(state.slot),JSON.stringify(state));
 sessionStorage.setItem(activeSlotKey(),String(state.slot));
}
function showFinished(){
 $('trial').hidden=true;$('done').hidden=false;
 $('submit').hidden=!!data.preview;
 $('reviewBack').hidden=!!state.receipt;
 if(data.preview){
  $('submitStatus').textContent='Download your results and send the JSON file to the study organizer.';
  $('download').textContent='Download results (JSON)';
  $('download').classList.add('primary');
 }
 if(state.receipt){
  $('submit').disabled=true;
  $('submitStatus').textContent='Submission received. Thank you! Receipt: '+state.receipt;
 }
}
function currentCases(){return state.pages[state.index].map(id=>data.cases.find(c=>c.id===id))}
function answered(c){return c.systems.filter(s=>s.available!==false).every(s=>metrics.every(k=>Number.isInteger(state.answers[c.id]?.[s.id]?.[k])))}
function firstIncompletePage(){
 return state.pages.findIndex(page=>page.some(id=>!answered(data.cases.find(c=>c.id===id))));
}
function begin(){
 const slot=Number($('slot').value);if(!Number.isInteger(slot)||slot<1||slot>20)throw Error('Please enter your invitation number (01–20).');
 if(!$('consent').checked)throw Error('Please confirm consent.');
 const old=localStorage.getItem(draftKey(slot));
 state=old?JSON.parse(old):null;
 if(!state){
 const selected=[];
 if(data.hideDatasetNames){
  selected.push(...data.cases.map(c=>c.id));
 }else{
  const groups={};
  for(const c of data.cases)(groups[c.stratum]??=[]).push(c);
  for(const group of Object.values(groups)){
   if(group.length!==data.perStratum)throw Error('Study must contain the same fixed cases for every participant.');
   selected.push(...group.sort((a,b)=>a.rank-b.rank).map(c=>c.id));
  }
 }
 state={version:data.version,sessionId:createSessionId(),slot,startedAt:new Date().toISOString(),index:0,order:shuffle(selected,seed(data.version+':'+slot)),systems:{},answers:{},listening:{},consent:true};
 for(const id of state.order){const c=data.cases.find(x=>x.id===id);state.systems[id]=shuffle(c.systems.map(x=>x.id),seed(data.version+':'+slot+':'+id))}save();}
 if(!Array.isArray(state.order)||!state.order.every(id=>data.cases.some(c=>c.id===id)))throw Error('Saved draft does not match study; contact the organizer.');
 // Preserve existing scores while moving single-case sessions into paired pages.
 if(!state.pairedLayout){
  const previousId=state.order[state.index];const pages=[];
  if(data.hideDatasetNames){
   for(let i=0;i<state.order.length;i+=2)pages.push(state.order.slice(i,i+2));
  }else for(const task of ['add','remove','replace']){
   const left=data.cases.filter(c=>c.dataset==='AudioCapsEdit'&&c.task===task).sort((a,b)=>a.rank-b.rank);
   const right=data.cases.filter(c=>c.dataset==='AudioSetCapsEdit'&&c.task===task).sort((a,b)=>a.rank-b.rank);
   for(let i=0;i<Math.max(left.length,right.length);i++)pages.push([left[i]?.id,right[i]?.id].filter(Boolean));
  }
  state.pages=shuffle(pages,seed(data.version+':pairs:'+slot));state.order=state.pages.flat();state.index=Math.max(0,state.pages.findIndex(p=>p.includes(previousId)));state.pairedLayout=true;
 }
 $('intro').hidden=true;state.index=Math.min(state.index,state.pages.length-1);
 if(data.preview&&state.finishedAt&&!state.receipt){
  const incomplete=firstIncompletePage();
  if(incomplete>=0){delete state.finishedAt;state.index=incomplete}
 }
 if(state.finishedAt){showFinished();save()}else render();
}
function playRecord(c,id){state.listening[c.id]??={};state.listening[c.id][id]??={plays:0,ended:0};state.listening[c.id][id].plays++;save()}
function audioEvents(a,c,id){a.onplay=()=>{document.querySelectorAll('audio').forEach(other=>{if(other!==a)other.pause()});playRecord(c,id)};a.onended=()=>{state.listening[c.id][id].ended++;save()};a.onerror=()=>{$('status').textContent='Audio could not load. Please retry or contact the organizer; do not rate missing audio.'}}
function renderCase(c){
 const column=document.createElement('div');column.className='dataset-column';
 const heading=document.createElement('h2');heading.className='dataset-heading';heading.textContent=data.hideDatasetNames ? 'Case '+(state.order.indexOf(c.id)+1) : c.dataset;column.append(heading);
 const source=document.createElement('section');source.className='panel source-card';
 const task=document.createElement('p');task.className='eyebrow';task.textContent={add:'ADD A SOUND',remove:'REMOVE A SOUND',replace:'REPLACE A SOUND'}[c.task];
 const instruction=document.createElement('h3');instruction.textContent=c.instruction;
 const label=document.createElement('small');label.textContent='Original recording';
 const original=document.createElement('audio');original.controls=true;original.preload='auto';original.src=c.input;audioEvents(original,c,'input');source.append(task,instruction,label,original);
 if(c.selectionPending){const pending=document.createElement('p');pending.className='pending-note';pending.textContent='Provisional sample · selection pending';source.append(pending)}
 column.append(source);state.answers[c.id]??={};
 state.systems[c.id].forEach((id,i)=>{
  const sys=c.systems.find(x=>x.id===id),card=document.createElement('section');card.className='panel system-card';
  const title=document.createElement('h3');title.textContent='Version '+String.fromCharCode(65+i);card.append(title);
  if(sys.available===false){card.className+=' placeholder';const pending=document.createElement('p');pending.className='muted';pending.textContent='Output pending · not available for rating';card.append(pending);column.append(card);return}
  const audio=document.createElement('audio');audio.controls=true;audio.preload='auto';audio.src=sys.audio;audioEvents(audio,c,id);card.append(audio);
  for(const metric of metrics){
   const field=document.createElement('fieldset'),legend=document.createElement('legend');legend.textContent=metricNames[metric];field.append(legend);
   for(let n=1;n<=5;n++){
    const label=document.createElement('label'),radio=document.createElement('input');radio.type='radio';radio.name=c.id+'-'+id+'-'+metric;radio.value=n;radio.checked=state.answers[c.id]?.[id]?.[metric]===n;
    radio.onchange=()=>{state.answers[c.id][id]??={};state.answers[c.id][id][metric]=n;save()};label.append(radio,document.createTextNode(String(n)));field.append(label)
   }card.append(field)
  }column.append(card)
 });return column
}
function render(){
 document.querySelectorAll('audio').forEach(a=>a.pause());$('done').hidden=true;$('trial').hidden=false;$('status').textContent='';
 const completed=state.order.filter(id=>answered(data.cases.find(c=>c.id===id))).length;
 $('progress').textContent=`Page ${state.index+1} of ${state.pages.length} · ${completed} / ${state.order.length} cases completed`;
 $('resetElapsed').hidden=!data.preview;
 $('elapsed').textContent=`${Math.floor((Date.now()-Date.parse(state.startedAt))/60000)} min elapsed`;
 $('bar').max=state.order.length;$('bar').value=completed;$('caseColumns').replaceChildren();
 const cases=currentCases();
 if(!data.hideDatasetNames)cases.sort((a,b)=>(a.dataset==='AudioCapsEdit'?0:1)-(b.dataset==='AudioCapsEdit'?0:1));
 for(const c of cases)$('caseColumns').append(renderCase(c));
 $('back').disabled=state.index===0;$('next').textContent=state.index===state.pages.length-1?(data.preview?'Finish & download results →':'Finish & review submission →'):(data.preview?'Next page →':'Save both & next →');save();
}
$('start').onclick=()=>{try{begin()}catch(e){$('status').textContent=e.message}};
$('resetElapsed').onclick=()=>{
 if(!data.preview||!state||state.finishedAt)return;
 state.startedAt=new Date().toISOString();
 save();
 $('elapsed').textContent='0 min elapsed';
};
$('back').onclick=()=>{state.index--;render()};
$('reviewBack').onclick=()=>{if(!state.receipt){delete state.finishedAt;state.index=0;render();window.scrollTo(0,0)}};
$('next').onclick=()=>{
 const cases=currentCases();
 if(!data.preview&&cases.some(c=>!answered(c))){$('status').textContent='Please complete all ratings for the available versions in both columns.';return}
 if(!data.preview && cases.some(c=>!['input',...c.systems.filter(s=>s.available!==false).map(s=>s.id)].every(id=>(state.listening[c.id]?.[id]?.ended||0)>0))){$('status').textContent='Please listen through the original and every available version in both columns.';return}
 if(state.index===state.pages.length-1){
  const incomplete=data.preview?firstIncompletePage():-1;
  if(incomplete>=0){
   state.index=incomplete;
   render();
   $('status').textContent='Please fill in the remaining ratings before downloading your results.';
   window.scrollTo(0,0);
   return;
  }
  document.querySelectorAll('audio').forEach(a=>a.pause());
  state.finishedAt=new Date().toISOString();
  showFinished();
  save();
 }
 else{state.index++;render();window.scrollTo({top:0,behavior:'smooth'})}
};
function payload(){return {...state,preview:!!data.preview,elapsedSeconds:Math.round((Date.parse(state.finishedAt)-Date.parse(state.startedAt))/1000),ratings:state.order.map(id=>{const c=data.cases.find(x=>x.id===id);return {caseId:id,dataset:c.dataset,task:c.task,systemOrder:state.systems[id],scores:state.answers[id],listening:state.listening[id]}})}}
function downloadResult(){
 const result=payload();
 if(!data.preview)return result;
 const {version,sessionId,slot,consent,startedAt,finishedAt,elapsedSeconds,ratings}=result;
 return {schemaVersion:1,collection:'download',preview:true,version,sessionId,slot,
  systemMapping:data.systemMapping,consent,startedAt,finishedAt,elapsedSeconds,ratings};
}
$('download').onclick=()=>{
 if(!state?.finishedAt)return;
 const result=downloadResult();
 const url=URL.createObjectURL(new Blob([JSON.stringify(result,null,2)+'\n'],{type:'application/json'}));
 const a=document.createElement('a');
 a.href=url;
 const slot=String(state.slot).padStart(2,'0');
 a.download=data.preview?`listening-${state.version}-P${slot}.json`:`listening-${state.slot}-${state.sessionId}.json`;
 a.click();
 setTimeout(()=>URL.revokeObjectURL(url),1000);
};
$('submit').onclick=async()=>{const button=$('submit');button.disabled=true;try{
 if(data.preview)throw Error('This is a preview. Preview scores are not submitted.');
 if(!cfg.supabaseUrl||!cfg.supabasePublishableKey||!invitationToken)throw Error('Submission is not configured, or the invitation link is missing. Download a backup and contact the organizer.');
 const headers={'Content-Type':'application/json',apikey:cfg.supabasePublishableKey};if(cfg.supabasePublishableKey.startsWith('eyJ'))headers.Authorization='Bearer '+cfg.supabasePublishableKey;
 const r=await fetch(cfg.supabaseUrl.replace(/\/$/,'')+'/rest/v1/rpc/submit_listening',{method:'POST',headers,body:JSON.stringify({invitation_token:invitationToken,result:payload()})});if(!r.ok)throw Error(await r.text());const receipt=await r.json();state.receipt=receipt;save();$('submitStatus').textContent='Submission received. Thank you! Receipt: '+receipt;
 }catch(e){$('submitStatus').textContent='Not submitted: '+e.message;button.disabled=false}};
if(!data?.cases?.length){
 $('notice').textContent='Study data is unavailable. Check the forwarded port and reload.';
}
if(data?.cases?.length){
 $('notice').textContent='';
 $('start').disabled=false;
 $('caseCount').textContent=String(data.cases.length);
 $('versionCount').textContent=String(data.cases[0].systems.length);
 try{
  const requestedSlot=params.get('slot');
  let slot=requestedSlot||sessionStorage.getItem(activeSlotKey());
  if(!slot && data.preview){
   const slots=Array.from({length:20},(_,i)=>i+1).filter(n=>localStorage.getItem(draftKey(n)));
   if(slots.length===1)slot=String(slots[0]);
  }
  if(slot)$('slot').value=slot;
  const saved=slot && localStorage.getItem(draftKey(Number(slot)));
  if(saved){
   const draft=JSON.parse(saved);
   if(draft.consent===true){
    $('consent').checked=true;
    begin();
   }
  }
 }catch(e){$('status').textContent=e.message}
}
