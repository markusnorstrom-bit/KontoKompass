/* KontoKompass v3 – ren, plattformuavhengig økonomimotor.
 * Alle beregninger er deterministiske; ingen nettverk, lagring eller antatte bankfakta.
 * Beløp er NOK. Returner null der dokumentasjon mangler.
 */
(function(root,factory){const x=factory();if(typeof module==='object'&&module.exports)module.exports=x;else root.KontoFinance=x})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const n=x=>Number(x), finite=x=>x!==null&&x!==''&&x!==undefined&&Number.isFinite(n(x));
const cents=x=>Math.round(n(x)*100), kroner=c=>Math.round(c)/100;
const iso=s=>/^\d{4}-\d\d-\d\d$/.test(String(s||''))&&!Number.isNaN(Date.parse(s+'T12:00:00Z'));
const ym=s=>String(s||'').slice(0,7);
const plusDays=(s,days)=>{if(!iso(s))return null;let d=new Date(s+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10)};
const plusMonths=(s,delta)=>{if(!iso(s))return null;const parts=s.split('-').map(Number);let d=new Date(Date.UTC(parts[0],parts[1]-1+delta,1,12));const max=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate();d.setUTCDate(Math.min(parts[2],max));return d.toISOString().slice(0,10)};
const sumC=(rows,fn=x=>x)=>rows.reduce((s,x)=>s+cents(fn(x)),0);
function sanitize(db){const base={version:1,transactions:[],budgets:{},dismissedCuts:{},alertShown:'',updated:null};return {...base,...db,transactions:Array.isArray(db?.transactions)?db.transactions:[],accounts:Array.isArray(db?.accounts)?db.accounts:[],schedules:Array.isArray(db?.schedules)?db.schedules:[],goals:Array.isArray(db?.goals)?db.goals:[],debts:Array.isArray(db?.debts)?db.debts:[],rules:Array.isArray(db?.rules)?db.rules:[],batches:Array.isArray(db?.batches)?db.batches:[],reconciliations:Array.isArray(db?.reconciliations)?db.reconciliations:[],ignoredInsights:db?.ignoredInsights||{},settings:db?.settings||{}}}
function splitParts(t){if(t.category==='Overføring'||t.category==='Uavklart'||t.category==='Inntekt'||t.category==='Refusjon')return [];
 if(t.category==='Avdrag (ikke forbruk)')return [];
 const ss=Array.isArray(t.splits)?t.splits:[];
 if(!ss.length)return [{category:t.category,amount:t.money,tags:t.tags||[]}];
 if(ss.some(s=>!s.category||!finite(s.money)||Math.sign(Number(s.money))!==Math.sign(Number(t.money))))return null;
 if(sumC(ss,s=>s.money)!==cents(t.money))return null;
 return ss.map(s=>({category:s.category,amount:Number(s.money),tags:s.tags||[]}));}
function classifiedRows(transactions,month){let rows=[],invalid=[];
 for(const t of transactions||[]){if(month&&ym(t.date)!==month)continue;if(!finite(t.money)||!iso(t.date))continue;
 if(t.category==='Overføring'||t.category==='Uavklart'||!t.category)continue;
 if(t.category==='Inntekt'||t.category==='Refusjon'){rows.push({id:t.id,date:t.date,category:t.category,money:Number(t.money),account:t.account,description:t.description,tags:t.tags||[]});continue}
 const s=splitParts(t);if(s===null){invalid.push(t.id);continue}
 rows.push(...s.map((p,i)=>({id:t.id,date:t.date,category:p.category,money:p.amount,account:t.account,description:t.description,tags:p.tags,part:i})));
 }
 return {rows,invalid};}
function cashflow(transactions,month){const {rows,invalid}=classifiedRows(transactions,month);let income=0,refunds=0,expense=0;
 const groups={};for(const r of rows){if(r.money>=0&&(r.category==='Inntekt'||r.category==='Refusjon')){if(r.category==='Inntekt')income+=cents(r.money);else refunds+=cents(r.money)}else if(r.money<0){expense-=cents(r.money);groups[r.category]=(groups[r.category]||0)-cents(r.money)}}
 const unresolved=(transactions||[]).filter(t=>ym(t.date)===month&&(!t.category||t.category==='Uavklart'|| (t.money>0&& !['Inntekt','Refusjon','Overføring'].includes(t.category)) || (t.money<0&&['Inntekt','Refusjon'].includes(t.category)))).length;
 return {income:kroner(income),refunds:kroner(refunds),expenses:kroner(expense),net:kroner(income+refunds-expense),groups:Object.fromEntries(Object.entries(groups).map(([k,v])=>[k,kroner(v)])),unresolved,invalidSplitIds:invalid};}
function budgetSummary(transactions,budgets,month,rollovers={}){const {groups,unresolved}=cashflow(transactions,month);const rows=Object.entries(budgets||{}).filter(([,v])=>finite(v)&&n(v)>0).map(([category,v])=>{const planned=cents(v)+(finite(rollovers[category])?cents(rollovers[category]):0);const used=cents(groups[category]||0);return {category,limit:kroner(planned),used:kroner(used),remaining:kroner(planned-used),ratio:planned>0?used/planned:null}});
 return {rows,planned:kroner(rows.reduce((s,r)=>s+cents(r.limit),0)),spent:kroner(rows.reduce((s,r)=>s+cents(r.used),0)),unresolved};}
function accountLedger(transactions,account,openingBalance,openingDate,asOf){if(!finite(openingBalance)||!iso(openingDate))return {balance:null,reason:'N/A – oppgi åpningssaldo og dato'};
 const valid=(transactions||[]).filter(t=>t.account===account&&iso(t.date)&&t.date>openingDate&&(!asOf||t.date<=asOf)&&finite(t.money));return {balance:kroner(cents(openingBalance)+sumC(valid,t=>t.money)),count:valid.length,from:openingDate,to:asOf||'siste registrerte'};}
function reconcile(transactions,account,openingBalance,openingDate,statementDate,statementBalance){if(!finite(statementBalance)||!iso(statementDate)|| (iso(openingDate)&&statementDate<openingDate))return {ok:false,computed:null,difference:null,reason:'N/A – bankens sluttsaldo og dato mangler'};
 const calc=accountLedger(transactions,account,openingBalance,openingDate,statementDate);if(calc.balance===null)return {ok:false,computed:null,difference:null,reason:calc.reason};let diff=kroner(cents(statementBalance)-cents(calc.balance));return {ok:true,computed:calc.balance,statement:Number(statementBalance),difference:diff,matched:diff===0,count:calc.count,reason:diff===0?'Saldo stemmer':'Avvik – undersøk manglende posteringer, dato og startbalanse'};}
function dateWindow(s,from,to){return iso(s)&&(!from||s>=from)&&(!to||s<=to)}
function periods(sch,from,to){if(!sch||!iso(sch.date)||!finite(sch.amount)||!['weekly','monthly','quarterly','yearly','once'].includes(sch.frequency))return [];
 let date=sch.date,dates=[],loops=0;while(date<=to&&loops++<360){if(dateWindow(date,from,to)&&(!sch.endDate||date<=sch.endDate))dates.push({...sch,date});if(sch.frequency==='once')break;
 date=sch.frequency==='weekly'?plusDays(date,7):plusMonths(date,sch.frequency==='monthly'?1:sch.frequency==='quarterly'?3:12)}return dates;}
function upcoming(schedules,from,to){return (schedules||[]).filter(s=>s.active!==false && !(s.paid && s.frequency==='once')).flatMap(s=>periods(s,from,to)).sort((a,b)=>a.date.localeCompare(b.date));}
function forecast(currentBalance,asOf,schedules,horizonDays=30){if(!finite(currentBalance)||!iso(asOf))return {available:false,reason:'N/A – legg inn dokumentert disponibel saldo og dato'};
 const to=plusDays(asOf,Math.max(1,Math.min(365,Number(horizonDays)||30)));const items=upcoming(schedules,plusDays(asOf,1),to);
 let bal=cents(currentBalance),minimum=bal,lowDate=asOf;const daily=[];for(const s of items){bal+=cents(s.amount);if(bal<minimum){minimum=bal;lowDate=s.date}daily.push({...s,balance:kroner(bal)})}
 return {available:true,asOf,until:to,starting:Number(currentBalance),ending:kroner(bal),minimum:kroner(minimum),lowestDate:lowDate,items:daily,warning:'Prognose fra manuelt registrerte fremtidige poster, ikke bankbekreftede trekk'};}
function goalProgress(goal,transactions){if(!goal)return {saved:null,remaining:null};let saved=finite(goal.startAmount)?cents(goal.startAmount):0;
 for(const t of transactions||[]){if(t.goalId===goal.id&&finite(t.money))saved+=cents(t.money)}
 for(const contribution of (goal.contributions||[])){if(finite(contribution.amount))saved+=cents(contribution.amount)}
 const target=finite(goal.target)?cents(goal.target):null;return {saved:kroner(saved),remaining:target===null?null:kroner(Math.max(0,target-saved)),ratio:target&&target>0?Math.max(0,saved/target):null,target:target===null?null:kroner(target)};}
function loanQuote(principal,annualRate,months,paymentOverride=0,extraMonthly=0){if(!finite(principal)||n(principal)<0||!finite(annualRate)||n(annualRate)<0||n(annualRate)>100||!Number.isInteger(n(months))||n(months)<1||n(months)>600)return null;
 let p=n(principal),r=n(annualRate)/1200,m=n(months),base=r===0?p/m:p*r/(1-Math.pow(1+r,-m));if(finite(paymentOverride)&&n(paymentOverride)>0)base=n(paymentOverride);
 let bal=p,interest=0,paid=0,rows=[];for(let i=1;i<=m&&bal>0.005;i++){const ic=bal*r;let pay=Math.min(bal+ic,base+Math.max(0,n(extraMonthly)||0));if(pay<=ic&&bal>0.005)return {amortizes:false,reason:'Betalingen dekker ikke påløpte renter'};bal=Math.max(0,bal+ic-pay);interest+=ic;paid+=pay;rows.push({month:i,interest:kroner(cents(ic)),payment:kroner(cents(pay)),remaining:kroner(cents(bal))})}
 return {amortizes:bal<0.005,monthlyPayment:kroner(cents(base)),totalPaid:kroner(cents(paid)),totalInterest:kroner(cents(interest)),remaining:kroner(cents(bal)),paidOffMonth:bal<0.005?rows.length:null,rows};}
function detectRecurring(transactions){const groups=new Map();for(const t of transactions||[]){if(!iso(t.date)||!finite(t.money)||n(t.money)>=0||['Overføring','Uavklart','Refusjon'].includes(t.category))continue;
 const key=String(t.description||'').toLowerCase().replace(/\b\d{5,}\b/g,'').replace(/\s+/g,' ').trim();if(!key)continue;const k=(t.account||'')+'|'+key;const arr=groups.get(k)||[];arr.push(t);groups.set(k,arr)}
 const res=[];for(const [key,items] of groups){const months=[...new Set(items.map(t=>ym(t.date)))].sort();if(months.length<2)continue;const amounts=items.map(t=>Math.abs(n(t.money))).sort((a,b)=>a-b);const med=amounts[Math.floor(amounts.length/2)];const close=amounts.every(v=>Math.abs(v-med)<=Math.max(10,med*.15));let near=true;for(let i=1;i<months.length;i++){const [y,m]=months[i-1].split('-').map(Number),[y2,m2]=months[i].split('-').map(Number);if((y2-y)*12+m2-m>2)near=false}if(!close||!near)continue;res.push({key,description:items.at(-1).description,account:items[0].account,amount:kroner(cents(med)),months:months.length,last:months.at(-1),category:items.at(-1).category,confirmed:false})}return res.sort((a,b)=>b.amount-a.amount);}
function netWorth(accounts,debts,transactions,asOf){let assets=0,liabilities=0,unknown=[];for(const a of accounts||[]){if(!a.name||!finite(a.openingBalance)||!iso(a.openingDate)){unknown.push(a.name||'Ukjent konto');continue}let bal=accountLedger(transactions,a.name,a.openingBalance,a.openingDate,asOf).balance;const z=cents(bal);if(a.type==='credit'||a.type==='loan'){liabilities+=Math.max(0,-z);assets+=Math.max(0,z)}else{assets+=Math.max(0,z);liabilities+=Math.max(0,-z)}}
 for(const d of debts||[]){if(!finite(d.balance)){unknown.push(d.name||'Ukjent lån');continue}liabilities+=cents(d.balance)}return {assets:kroner(assets),liabilities:kroner(liabilities),net:unknown.length?null:kroner(assets-liabilities),unknown};}
function applyRule(t,rules){for(const r of (rules||[]).filter(r=>r.enabled!==false)){if(!r.pattern||!r.category||r.pattern.length>100)continue;let v=String(t.description||'');if(r.caseSensitive!==true)v=v.toLowerCase();const q=r.caseSensitive===true?r.pattern:r.pattern.toLowerCase();if(v.includes(q)&&(!r.account||r.account===t.account)&&(!r.direction||(r.direction==='out'&&t.money<0)||(r.direction==='in'&&t.money>0)))return {category:r.category,rule:r.id}}return null;}
function annualize(amount,period){if(!finite(amount)||!['weekly','monthly','quarterly','yearly'].includes(period))return null;return kroner(cents(amount)*({weekly:52,monthly:12,quarterly:4,yearly:1})[period]);}
function exportRows(transactions,from,to){return (transactions||[]).filter(t=>dateWindow(t.date,from,to)).map(t=>({dato:t.date,konto:t.account||'N/A',beskrivelse:t.description||'N/A',belop:t.money,kategori:t.category||'Uavklart',notat:t.note||'',kid:t.kid||'N/A',transaksjonsid:t.txid||'N/A',kilde:t.source||'N/A',importId:t.batchId||'N/A',tags:Array.isArray(t.tags)?t.tags.join('|'):'N/A'}));}
function outstandingBills(bills,at){return (bills||[]).filter(b=>b.active!==false&&iso(b.date)&&(!at||b.date<=at)).filter(b=>!b.paid).sort((a,b)=>a.date.localeCompare(b.date));}
return {sanitize,splitParts,classifiedRows,cashflow,budgetSummary,accountLedger,reconcile,periods,upcoming,forecast,goalProgress,loanQuote,detectRecurring,netWorth,applyRule,annualize,exportRows,outstandingBills,plusDays,plusMonths};
});
