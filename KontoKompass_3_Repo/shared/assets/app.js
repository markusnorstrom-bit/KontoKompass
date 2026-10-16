'use strict';
// KontoKompass felles grensesnitt. Kjører på Android og Windows med samme JS-kjerne.
const STORAGE = 'KontoKompass_Android_v1'; // Kompatibelt med v2-innhold, bevarer eksisterende lagrede data
const CAT = ['Uavklart','Overføring','Inntekt','Refusjon','Mat og dagligvarer','Bolig','Transport','Forsikring','Helse','Abonnement','Shopping','Fritid','Andre utgifter','Gjeld og lån','Kjæledyr','Bankgebyrer','Renter','Skatt','Utdanning','Gaver','Avdrag (ikke forbruk)'];
const EXPENSES = CAT.slice(4).filter(x=>x!=='Avdrag (ikke forbruk)');
const N_A = 'N/A';
function todayLocal(){const d=new Date();return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-')}
let db = loadDB(); let pending = null; let currentDetail = null; let currentPage = 'home';
function loadDB() {
  try {
    const data=JSON.parse(localStorage.getItem(STORAGE)||'null');
    if (data && data.version===1 && Array.isArray(data.transactions)) return KontoFinance.sanitize(data);
  } catch(e){}
  return KontoFinance.sanitize({version:1,transactions:[],budgets:{},dismissedCuts:{},alertShown:'',updated:null});
}
function store() {
  db.updated=new Date().toISOString();
  try { localStorage.setItem(STORAGE,JSON.stringify(db)); }
  catch(e) { showError('Lagring mislyktes. Frigjør plass på telefonen og ta sikkerhetskopi.'); }
}
const el=id=>document.getElementById(id);
function h(str){return String(str??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;')}
function fmt(value){return Number(value||0).toLocaleString('nb-NO',{style:'currency',currency:'NOK',maximumFractionDigits:2})}
function nonempty(s){return String(s??'').trim()||N_A}
function month(t){return (t.date||'').slice(0,7)}
function chosenMonth(){return el('monthPicker').value||todayLocal().slice(0,7)}
function needsReview(t){return t.category==='Uavklart'||!t.category||(t.money>0&&!['Inntekt','Refusjon','Overføring'].includes(t.category))||(t.money<0&&['Inntekt','Refusjon'].includes(t.category))||KontoFinance.splitParts(t)===null}
function type(t){return t.category==='Overføring'?'transfer':t.category==='Inntekt'?'income':t.category==='Refusjon'?'refund':EXPENSES.includes(t.category)?'expense':'unresolved'}
function showError(msg){toast(msg)} window.showError=showError;
let toastTimer;
function toast(msg){const t=el('toast');t.textContent=msg;t.style.display='block';clearTimeout(toastTimer);toastTimer=setTimeout(()=>{t.style.display='none'},5000)}
function openPage(name){ currentPage=name; document.querySelectorAll('.page').forEach(p=>p.classList.toggle('active',p.id==='page-'+name)); document.querySelectorAll('.tabs button').forEach(b=>b.classList.toggle('selected',b.dataset.go===name)); window.scrollTo(0,0); render(); }
function handleBack(){if(el('detail').open){closeDetail();return}if(el('id10t').open){el('id10t').close();return}openPage('home')};window.handleBack=handleBack;
function chooseFile(){
  if(window.KontoHost){KontoHost.chooseFile()}
  else if(window.chrome?.webview){window.chrome.webview.postMessage({action:'chooseFile'})}
  else{el('browserFile').click()}
}
function browserFileChosen(input){
  const file=input.files?.[0];if(!file)return;
  if(!/\.(csv|tsv|txt|json)$/i.test(file.name)){showError('Nettlesermodus støtter CSV/TSV/JSON. Windows- og Android-appen har XLSX-støtte.');input.value='';return;}
  file.text().then(text=>/\.json$/i.test(file.name)?restoreBackup(text):importText(file.name,text)).catch(e=>showError(e.message));input.value='';
}
function splitCSV(src,separator){
  let rows=[],row=[],cell='',quoted=false;
  for(let i=0;i<src.length;i++){
    const c=src[i];
    if(c==='"') {if(quoted && src[i+1]==='"'){cell+='"';i++}else{quoted=!quoted}} 
    else if(c===separator && !quoted){row.push(cell);cell=''}
    else if((c==='\n'||c==='\r') && !quoted){if(c==='\r'&&src[i+1]==='\n')i++;row.push(cell);if(row.some(x=>String(x).trim()))rows.push(row);row=[];cell=''}
    else cell+=c;
  }
  row.push(cell);if(row.some(x=>String(x).trim()))rows.push(row);
  if(quoted)throw new Error('CSV inneholder et uavsluttet anførselstegn');
  return rows;
}
function guessSep(text){const first=(text.split(/\r?\n/,4).find(s=>s.trim())||'').replace(/"[^"]*"/g,'');const arr=[';','\t',','].map(x=>[x,first.split(x).length]);arr.sort((a,b)=>b[1]-a[1]);return arr[0][1]>1?arr[0][0]:';'}
function importText(name,text){try{const rows=splitCSV(text,guessSep(text));if(rows.length<2)throw new Error('Filen må ha overskrift og minst én rad');importTable({name,headers:rows[0],rows:rows.slice(1),warning:''})}catch(e){showError(e.message)}}
window.importText=importText;
function findColumn(header,pats){for(const re of pats){const idx=header.findIndex(s=>re.test(String(s).trim().toLowerCase()));if(idx>=0)return String(idx)}return ''}
function importTable(data){
  if(!Array.isArray(data.headers)||!Array.isArray(data.rows)){showError('Ugyldig importformat');return}
  if(data.rows.length>20000){showError('Maks 20 000 rader per import');return}
  pending={name:String(data.name||N_A),headers:data.headers.map(s=>String(s||'')),rows:data.rows,warning:data.warning||''};
  el('importPane').classList.remove('hidden');el('fileTitle').textContent=pending.name;
  el('fileWarning').classList.toggle('hidden',!pending.warning);el('fileWarning').textContent=pending.warning;
  for(const id of ['mapDate','mapDesc','mapAmount','mapOut','mapIn']){
    const select=el(id);select.innerHTML='<option value="">— Ikke valgt —</option>'+pending.headers.map((x,i)=>`<option value="${i}">${h(nonempty(x))} [${i+1}]</option>`).join('');
  }
  el('mapDate').value=findColumn(pending.headers,[/^(dato|bokf.ringsdato|transaksjonsdato|date)$/,/dato/]);
  el('mapDesc').value=findColumn(pending.headers,[/^(beskrivelse|tekst|forklaring|transaksjon|description|mottaker|melding)$/,/beskriv|tekst|forklar/]);
  const out=findColumn(pending.headers,[/^(ut av konto|utbetalt|debet|debit|uttak|bel.p ut|beløp ut)$/,/ut av konto/]);
  const inn=findColumn(pending.headers,[/^(inn p. konto|innbetalt|kredit|credit|innskudd|bel.p inn|beløp inn)$/,/inn p. konto/]);
  const amount=findColumn(pending.headers,[/^(bel.p|beløp|amount|sum)$/,/bel.p med fortegn/]);
  el('mapOut').value=out;el('mapIn').value=inn;el('mapAmount').value=(out||inn)?'':amount;
  el('positiveExpenses').checked=false;
  // No account identifier is guessed from filenames.
  el('mapAccount').value='';
  openPage('import');renderPreview();toast('Kontroller kolonnene og kontonavnet før import');
}
window.importTable=importTable;
function cell(row,idx){return idx!==''&&idx!==null?String(row[Number(idx)]??'').trim():''}
function amount(s){
 if(s===null||s===undefined||String(s).trim()==='')return null;
 let v=String(s).replace(/\u00a0/g,'').replace(/\s/g,'').replace(/kr|nok/gi,'').replace(/[−–]/g,'-');
 let negative=v.startsWith('(')&&v.endsWith(')');v=v.replace(/[()]/g,'');
 if(v.includes(',')&&v.includes('.')){if(v.lastIndexOf(',')>v.lastIndexOf('.'))v=v.replaceAll('.','').replace(',','.');else v=v.replaceAll(',','')}
 else if(v.includes(','))v=v.replace(',','.');
 else if(/^[-+]?\d{1,3}(\.\d{3})+$/.test(v))v=v.replaceAll('.','');
 if(!/^[+-]?\d+(\.\d+)?$/.test(v))return null;
 const n=Number(v)*(negative?-1:1);
 return Number.isFinite(n)?Math.round(n*100)/100:null;
}
function parseDate(s){
 let v=String(s??'').trim();if(!v)return null;
 const serial=Number(v);if(/^\d+(\.\d+)?$/.test(v)&&serial>25000&&serial<80000){const date=new Date(Date.UTC(1899,11,30)+Math.floor(serial)*86400000);return date.toISOString().slice(0,10)}
 let m=v.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);if(m)return legitDate(+m[1],+m[2],+m[3]);
 m=v.match(/^(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{2,4})/);if(m){const y=+m[3]+(m[3].length===2?2000:0);return legitDate(y,+m[2],+m[1])}
 return null;
}
function legitDate(y,m,d){if(y<1990||y>2100||m<1||m>12||d<1||d>31)return null;const x=new Date(Date.UTC(y,m-1,d));return x.getUTCFullYear()===y&&x.getUTCMonth()+1===m&&x.getUTCDate()===d?x.toISOString().slice(0,10):null}
function importSettings(){return {date:el('mapDate').value,description:el('mapDesc').value,money:el('mapAmount').value,out:el('mapOut').value,in:el('mapIn').value,positive:el('positiveExpenses').checked,account:el('mapAccount').value.trim()}}
function parseEntry(row,s){
 const dt=parseDate(cell(row,s.date));const desc=cell(row,s.description);let v=null,issue='';
 if(s.out!==''||s.in!==''){
   const ov=amount(cell(row,s.out)),iv=amount(cell(row,s.in));
   if((ov||0)!==0 && (iv||0)!==0)issue='Både inn og ut har beløp';
   else if(ov!==null&&ov!==0)v=-Math.abs(ov);
   else if(iv!==null&&iv!==0)v=Math.abs(iv);
   else if(ov===0||iv===0)v=0;
 }else{v=amount(cell(row,s.money));if(v!==null&&s.positive)v=-v}
 if(!dt)issue+=' Ugyldig dato';if(v===null)issue+=' Ugyldig beløp';if(!desc)issue+=' Manglende beskrivelse';
 return {date:dt,description:desc,money:v,issue:issue.trim()};
}
function renderPreview(){
 if(!pending)return;const s=importSettings();const items=pending.rows.slice(0,8).map((row,i)=>{
  const p=parseEntry(row,s);return `<div class="item"><div class="itemTop"><strong>${h(nonempty(p.description))}</strong><span class="money">${p.money===null?N_A:fmt(p.money)}</span></div><div class="sub">Rad ${i+2} · ${h(p.date||N_A)} · ${p.issue?'<span class="warn">'+h(p.issue)+'</span>':'klar'}</div></div>`}).join('');
 el('previewRows').innerHTML=items;el('previewCount').textContent=`${pending.rows.length} rader`; 
}
for(const id of ['mapDate','mapDesc','mapAmount','mapOut','mapIn','positiveExpenses'])el(id).addEventListener('change',renderPreview);
function fingerprint(t){return [t.account,t.date,t.money.toFixed(2),t.description.trim().toLowerCase(),t.txid||''].join('|')}
function newCategory(t){
 const s=t.description.toLowerCase();
 if(/l.nn|lønn|salary|arbeidsgiver|nav utbetaling|skatteetaten.*utbetal/.test(s)&&t.money>0)return 'Inntekt';
 if(/overf.r|overfor|transfer|sparekonto|mellom egne|mastercard.*betaling|nedbetaling.*kredittkort|betaling.*kredittkort/.test(s))return 'Uavklart';
 const rule=KontoFinance.applyRule(t,db.rules||[]);if(rule)return rule.category;
 if(t.money>0)return 'Uavklart';
 if(/rema|kiwi|coop|meny|extra|spar |dagligvare|bunnpris|joker/.test(s))return 'Mat og dagligvarer';
 if(/boligl.n|boliglån|fellesutgift|husleie|str.m|strøm|viken fiber|altibox/.test(s))return 'Bolig';
 if(/forsikring|fremtind|tryg|gjensidige/.test(s))return 'Forsikring';
 if(/drivstoff|circle k|ess o|esso|bensin|bompenge|autopass|parkering/.test(s))return 'Transport';
 if(/spotify|netflix|youtube premium|disney\+|abonnement/.test(s))return 'Abonnement';
 return 'Uavklart';
}
function matchTransfers(){
  const a=db.transactions;
  for(const t of a){
    if(t.manual || t.linked || !Number.isFinite(t.money))continue;
    const candidates=KontoCore.safeCandidates(t,a).filter(u=>!u.linked&&!u.manual);
    if(candidates.length!==1)continue;
    const u=candidates[0];
    if(KontoCore.definiteMatch(t,u,a)){
      t.category='Overføring';u.category='Overføring';t.linked=u.id;u.linked=t.id;
    }
  }
}
function idField(raw){const pair=raw.find(([header,v])=>/^(transaksjons.?id|transaction.?id|bankreferanse|bilagsnummer|transaksjonsreferanse|referanse.?id)$/i.test(header.trim())&&String(v).trim());return pair?String(pair[1]).trim():''}
function kidField(raw){const pair=raw.find(([header,v])=>/^(kid|kid.?nummer|kundeidentifikasjon)$/i.test(header.trim())&&String(v).trim());return pair?String(pair[1]).trim():''}
function commitImport(){
 if(!pending){toast('Velg en fil først');return}
 const s=importSettings();if(!s.account){showError('Oppgi kontoens navn. N/A kan ikke brukes for å matche overføringer.');return}
 if(s.date===''||s.description===''||(s.money===''&&s.out===''&&s.in==='')){showError('Velg dato, beskrivelse og beløp.');return}
 const rows=pending.rows.map((r,i)=>({...parseEntry(r,s),raw:pendingSafe(r),rowNum:i+2}));
 const issues=rows.filter(r=>r.issue);if(issues.length){showError(`${issues.length} rad(er) kan ikke tolkes. Kontroller dato, beløp og kolonnevalg før import. Første feil: rad ${issues[0].rowNum}: ${issues[0].issue}`);return}
 if(rows.some(r=>r.money===0)){showError('Minst én transaksjon har beløp 0. Kontroller valgt beløpskolonne.');return}
 if(rows.some(r=>Math.abs(r.money)>100000000)){showError('Uvanlig stort beløp. Kontroller format og fortegn.');return}
 if(!confirm(`${rows.length} rader fra ${pending.name} på kontoen «${s.account}». Er dato og fortegn kontrollert?`))return;
 const batchId='batch_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,8);const importedIds=[];
 const counts=new Map();for(const t of db.transactions){const key=fingerprint(t);counts.set(key,Math.max(counts.get(key)||0,t.occurrence||1))}
 const incomingCounts=new Map();let skipped=0,added=0;
 for(const r of rows){
   const raw=pending.headers.map((head,i)=>[head||`Kolonne ${i+1}`,r.raw[i]??'']);
   const t={id:uniqueID(),date:r.date,description:r.description,money:r.money,account:s.account,source:pending.name,batchId,rowNum:r.rowNum,raw,txid:idField(raw),kid:kidField(raw),category:'Uavklart',manual:false,linked:null,note:'',occurrence:1};
   const fp=fingerprint(t),seq=(incomingCounts.get(fp)||0)+1;incomingCounts.set(fp,seq);t.occurrence=seq;
   if((counts.get(fp)||0)>=seq){skipped++;continue}
   t.category=newCategory(t);db.transactions.push(t);importedIds.push(t.id);added++;
 }
 db.batches=db.batches||[];db.batches.push({id:batchId,file:pending.name,account:s.account,time:new Date().toISOString(),importedIds,skipped,rows:rows.length});
 matchTransfers();store();pending=null;el('importPane').classList.add('hidden');render();openPage('review');toast(`${added} importert, ${skipped} duplikater utelatt. Kontroller uavklarte poster.`);
}
function pendingSafe(row){return Array.isArray(row)?row.map(v=>String(v??'')):[]}
function uniqueID(){return 'tx_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,12)}
function render(){
  if(!db.dismissedCuts)db.dismissedCuts={};
  const dates=[...new Set(db.transactions.map(month).filter(Boolean))];dates.push(todayLocal().slice(0,7));dates.sort().reverse();const m=el('monthPicker'),old=m.value;m.innerHTML=[...new Set(dates)].map(s=>`<option value="${h(s)}">${h(s)}</option>`).join('');m.value=dates.includes(old)?old:dates[0];
  const selected=chosenMonth();const tx=db.transactions.filter(t=>month(t)===selected);
  const summary=KontoCore.summarizeMonth(db.transactions,selected);
  const accurate=KontoFinance.cashflow(db.transactions,selected);
  el('income').textContent=fmt(accurate.income);el('expenses').textContent=fmt(accurate.expenses);el('net').textContent=fmt(accurate.net);el('transfers').textContent=fmt(summary.transferVolume);
  el('refunds').textContent=fmt(summary.refunds);
  const review=db.transactions.filter(needsReview);el('reviewCount').textContent=String(review.length);el('reviewAlert').classList.toggle('hidden',review.length===0);
  renderCategories(tx);renderRecent();renderBudget(tx);renderTransactions();renderReview();renderInsights();el('stats').textContent=`${db.transactions.length} transaksjoner · ${review.length} uavklarte · ${new Set(db.transactions.map(t=>t.account)).size} kontoer`;
  maybeAlert(selected,tx);
}
function renderCategories(tx){const groups=KontoFinance.cashflow(tx,null).groups;const list=EXPENSES.map(cat=>({cat,value:groups[cat]||0})).filter(t=>t.value>0).sort((a,b)=>b.value-a.value);const sum=list.reduce((s,t)=>s+t.value,0);el('categories').innerHTML=list.length?list.map(x=>`<div class="barRow"><span>${h(x.cat)}</span><strong>${fmt(x.value)}</strong></div><div class="bar"><i style="width:${Math.min(100,x.value/sum*100)}%"></i></div>`).join(''):'Ingen kategoriserte utgifter for valgt måned.'}
function itemMarkup(t){return `<div class="item"><button class="rowButton" onclick="detail(${JSON.stringify(t.id)})"><div class="itemTop"><strong>${h(t.description)} ${t.category==='Uavklart'?'<span class="pill">Uavklart</span>':''}</strong><span class="money ${t.money>=0?'positive':'negative'}">${fmt(t.money)}</span></div><div class="sub">${h(t.date)} · ${h(t.account)} · ${h(t.category)}</div></button></div>`}
function renderRecent(){const recent=[...db.transactions].sort((a,b)=>b.date.localeCompare(a.date)).slice(0,6);el('recent').innerHTML=recent.length?recent.map(itemMarkup).join(''):'Ingen transaksjoner ennå.'}
function renderTransactions(){const f=el('categoryFilter').value,search=el('search').value.toLowerCase();const list=db.transactions.filter(t=>(!f||t.category===f)&&(!search||[t.description,t.kid,t.txid,t.account].some(s=>String(s??'').toLowerCase().includes(search)))).sort((a,b)=>b.date.localeCompare(a.date)).slice(0,500);el('transactionList').innerHTML=list.length?list.map(itemMarkup).join(''):'Ingen treff.'}
function renderReview(){const list=db.transactions.filter(needsReview).sort((a,b)=>b.date.localeCompare(a.date)).slice(0,500);el('reviewList').innerHTML=list.length?list.map(itemMarkup).join(''):'Ingen uavklarte transaksjoner.'}
function budgetRatio(tx){const r=KontoCore.budgetStatus(db.transactions,chosenMonth(),db.budgets);return r.level===null?null:r}
function severity(r){if(r===null)return null;return r>=1.5?10:r>=1.25?9:r>=1.1?8:Math.max(0,Math.min(7,Math.round(r*7)))}
function renderBudget(tx){const list=EXPENSES.map(cat=>`<label class="field">${h(cat)}<input type="number" min="0" step="1" inputmode="decimal" data-budget="${h(cat)}" value="${Number(db.budgets[cat])>0?Number(db.budgets[cat]):''}" placeholder="N/A – ikke satt"></label>`);el('budgetList').innerHTML=list.join('')+'<button class="accent wide" onclick="saveBudgets()">Lagre budsjett</button>';
 const info=budgetRatio(tx),sev=severity(info?.ratio??null),box=el('fubar');box.className='fubar'+(sev>=9?' critical':sev>=8?' bad':'');box.innerHTML=info?`<div class="muted">Budsjettstatus · ${h(chosenMonth())}</div><strong>FUBAR ${sev}/10 ${sev>=9?'· ID10T':''}</strong><p>${fmt(info.used)} av ${fmt(info.total)} budsjettert · ${Math.round(info.ratio*100)} %</p>`:'<div class="muted">Budsjettstatus</div><strong>FUBAR: N/A</strong><p>Angi minst ett kategoribudsjett for å beregne.</p>';
}
function saveBudgets(){document.querySelectorAll('[data-budget]').forEach(input=>{const n=Number(input.value);if(input.value.trim()===''||!Number.isFinite(n)||n<=0)delete db.budgets[input.dataset.budget];else db.budgets[input.dataset.budget]=n});db.alertShown='';store();render();toast('Budsjett lagret')}
function maybeAlert(m,tx){const info=budgetRatio(tx),level=severity(info?.ratio??null);if(level<9)return;const key=m+'_'+level;if(db.alertShown===key||currentPage==='import')return;db.alertShown=key;store();el('errorBody').innerHTML=`<p>FUBAR <strong>${level}/10</strong>. Brukt ${fmt(info.used)} av ${fmt(info.total)} i kategoriene med budsjett.</p><p>Budsjettet er overskredet med <strong>${Math.round((info.ratio-1)*100)} %</strong>. Dette er en budsjettindikator, ikke en vurdering av hele privatøkonomien.</p>`;el('id10t').showModal()}
function possibleMatches(t){return KontoCore.safeCandidates(t,db.transactions).slice(0,15)}
function detail(id){const t=db.transactions.find(t=>t.id===id);if(!t)return;currentDetail=id;const candidates=possibleMatches(t);
 let html=`<div class="meta"><b>Dato</b><span>${h(t.date||N_A)}</span><b>Beløp</b><span>${fmt(t.money)}</span><b>Konto</b><span>${h(nonempty(t.account))}</span><b>Beskrivelse</b><span>${h(nonempty(t.description))}</span><b>Transaksjons-ID</b><span>${h(nonempty(t.txid))}</span><b>KID</b><span>${h(nonempty(t.kid))}</span><b>Kildefil</b><span>${h(nonempty(t.source))}</span><b>Radnummer</b><span>${t.rowNum||N_A}</span><b>Matchet mot</b><span>${h(nonempty(t.linked))}</span></div>`;
 html+=`<label class="field">Kategori<select id="detailCategory">${CAT.map(c=>`<option value="${h(c)}" ${c===t.category?'selected':''}>${h(c)}</option>`).join('')}</select></label><label class="field">Notat<input id="detailNote" maxlength="1000" value="${h(t.note||'')}" placeholder="Valgfritt"></label>`;
 html+=`<label class="field">Etiketter (kommaseparert)<input id="detailTags" value="${h((t.tags||[]).join(', '))}" placeholder="N/A"></label>`;
 html+='<h3 class="rawTitle">Fordeling / splitt av transaksjon</h3><div class="hint">Valgfritt. Del f.eks. én butikkhandel i mat og andre varer. Summerte beløp må være nøyaktig lik opprinnelig beløp (samme fortegn).</div><div id="detailSplits"></div><button class="outlined smallButton" onclick="addSplitRow()">＋ Legg til fordeling</button><button class="outlined smallButton" onclick="clearSplitRows()">Fjern fordeling</button>';
 html+='<h3 class="rawTitle">Mulige mottransaksjoner</h3>';
 if(candidates.length){html+='<p class="labelHelp">Lik sum med motsatt fortegn på en annen konto innen tre dager. Ikke automatisk bekreftet.</p>';
 html+=`<label class="field">Match manuelt med<select id="detailMatch"><option value="">N/A / Ingen valgt</option>${candidates.map(c=>`<option value="${h(c.id)}" ${c.id===t.linked?'selected':''}>${h(c.date)} · ${h(c.account)} · ${h(c.description)} · ${fmt(c.money)}</option>`).join('')}</select></label>`;
 } else html+='<p class="muted">N/A – ingen mulige motposter i importerte kontoutskrifter.</p>';
 html+='<h3 class="rawTitle">Alle originale felt fra banken</h3>';
 html+=Array.isArray(t.raw)&&t.raw.length?t.raw.map(([k,v],i)=>`<div class="meta"><b>${h(nonempty(k))}</b><span>${h(nonempty(v))}</span></div>`).join(''):'<p>N/A – ingen originalkolonner registrert.</p>';
 el('detailBody').innerHTML=html;el('detail').showModal();if(Array.isArray(t.splits))for(const s of t.splits)addSplitRow(s.category,s.money);}
function closeDetail(){el('detail').close();currentDetail=null}
function saveDetail(){const t=db.transactions.find(t=>t.id===currentDetail);if(!t)return;const cat=el('detailCategory').value,note=el('detailNote').value;const match=el('detailMatch')?.value||'';
 if(match&&cat!=='Overføring'){showError('Velg kategorien Overføring for å koble to kontoposter.');return}
 if(match){const other=db.transactions.find(u=>u.id===match);if(other){if(t.linked&&t.linked!==match){const old=db.transactions.find(u=>u.id===t.linked);if(old)old.linked=null}t.linked=other.id;other.linked=t.id;other.category='Overføring';other.manual=true;}}
 if(cat!=='Overføring' && t.linked){const other=db.transactions.find(u=>u.id===t.linked);if(other)other.linked=null;t.linked=null}
 const splits=readSplitRows(t.money,cat);if(splits===false)return;
 t.category=cat;t.note=note;t.tags=(el('detailTags').value||'').split(',').map(x=>x.trim()).filter(Boolean).slice(0,20);t.splits=splits;t.manual=true;store();closeDetail();render();toast('Lagret, inkludert eventuelt manuelt valgt motpost')}
function backup(){const payload=JSON.stringify(db,null,2);
  if(window.KontoHost){KontoHost.saveBackup(payload)}
  else if(window.chrome?.webview){window.chrome.webview.postMessage({action:'saveBackup',text:payload})}
  else{const blob=new Blob([payload],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='KontoKompass-backup.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),3000)}
}
function onBackupSaved(){toast('Sikkerhetskopi lagret på valgt plassering')};window.onBackupSaved=onBackupSaved;
function restoreBackup(text){try{const obj=JSON.parse(text);if(obj.version!==1||!Array.isArray(obj.transactions)||typeof obj.budgets!=='object')throw new Error('Ukjent sikkerhetskopiformat');if(!confirm('Dette erstatter ALLE lokale appdata. Fortsette?'))return;db=KontoFinance.sanitize(obj);store();render();toast('Sikkerhetskopi gjenopprettet')}catch(e){showError('Gjenoppretting feilet: '+e.message)}}window.restoreBackup=restoreBackup;
function renderInsights(){
 const month=chosenMonth(), list=KontoCore.cutSuggestions(db.transactions,month,db.budgets,db.dismissedCuts);
 const visible=el('insightsList'), preview=el('insightsPreview'),counter=el('insightCount');
 counter.textContent=String(list.length);
 const formatSuggestion=c=>`<article class="insight"><div class="itemTop"><strong>${h(c.title)}</strong><span class="hintPill">${c.kind==='recurring'?'Regelmessig':'Budsjett'}</span></div>
 <p>${h(c.description)}</p>
 <p><b>${c.estimatedMonthly===null?'Mulig besparelse: N/A':('Mulig maksbesparelse: '+fmt(c.estimatedMonthly)+'/mnd')}</b>${c.estimatedAnnual!==null?'<br><span class="muted">Inntil '+fmt(c.estimatedAnnual)+'/år ved full avslutning – estimat, ikke garanti.</span>':''}${c.overspend!=null?'<br><span class="muted">Budsjettavvik: '+fmt(c.overspend)+'</span>':''}</p>
 ${c.evidence.length?'<details><summary>Vis grunnlaget ('+c.evidence.length+' transaksjoner)</summary><div>'+c.evidence.map(t=>'<div class="meta"><b>'+h(t.date)+'</b><span>'+fmt(t.amount)+' · '+h(t.account)+' · '+h(t.source)+'</span></div>').join('')+'</div></details>':''}
 <button class="outlined smallButton" onclick="dismissInsight(${JSON.stringify(c.id).replaceAll('"','&quot;')})">Ikke foreslå igjen</button></article>`;
 visible.innerHTML=list.length?list.map(formatSuggestion).join(''):'Ingen dokumenterte kuttforslag for denne måneden. Legg inn kontoutskrifter fra flere måneder, kategoriser postene og eventuelt registrer budsjetter.';
 preview.innerHTML=list.length?list.slice(0,2).map(c=>`<div class="compactInsight"><strong>${h(c.title)}</strong><span>${c.estimatedMonthly===null?'Sjekk budsjett':('Inntil '+fmt(c.estimatedMonthly)+'/mnd')}</span></div>`).join(''):'Ingen dokumenterte forslag ennå.';
}
function dismissInsight(key){db.dismissedCuts[key]=true;store();render();toast('Forslaget er skjult. Det er lagret lokalt i sikkerhetskopien.');}
function clearDismissed(){if(!confirm('Vise tidligere avviste spareforslag igjen?'))return;db.dismissedCuts={};store();render();toast('Avviste forslag er tilbakestilt.');}
function wipe(){if(!confirm('Slette ALLE lokalt lagrede transaksjoner og budsjetter?'))return;if(!confirm('Siste bekreftelse: Data slettes uten angre-mulighet.'))return;db=KontoFinance.sanitize({version:1,transactions:[],budgets:{},dismissedCuts:{},alertShown:'',updated:null});store();render();toast('Alle appdata er slettet')}
render();
