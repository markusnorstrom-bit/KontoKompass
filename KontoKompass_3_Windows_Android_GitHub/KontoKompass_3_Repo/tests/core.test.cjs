const test=require('node:test');
const assert=require('node:assert/strict');
const K=require('../shared/assets/core.js');
const txn=(id,date,money,category,description,account='Brukskonto')=>({id,date,money,category,description,account,source:'DEMO.csv'});
test('opposing account transfers counted once, not as spending',()=>{
 const a=txn('a','2026-10-12',-1000,'Overføring','Overføring sparekonto','Bruk');
 const b=txn('b','2026-10-12',1000,'Overføring','Fra brukskonto','Sparing');
 a.linked='b';b.linked='a';
 const result=K.summarizeMonth([a,b], '2026-10');
 assert.equal(result.transferVolume,1000);
 assert.equal(result.expenses,0);assert.equal(result.income,0);
});
test('manual matches cannot use KID alone or same account',()=>{
 const a=txn('a','2026-10-12',-300,'Uavklart','Regning KID 44','Bruk');
 const b=txn('b','2026-10-12',300,'Uavklart','Tilbakebetalt KID 44','Sparing');
 a.kid='44';b.kid='44';assert.equal(K.definiteMatch(a,b,[a,b]),false);
});
test('unique matching with transfer hints permitted',()=>{
 const a=txn('a','2026-10-12',-300,'Uavklart','Overføring egne kontoer','Bruk');
 const b=txn('b','2026-10-13',300,'Uavklart','Overføring egne kontoer','Sparing');
 assert.equal(K.definiteMatch(a,b,[a,b]),true);
});
test('ambiguous equal amounts do not auto-match',()=>{
 const a=txn('a','2026-10-12',-300,'Uavklart','Overføring egen konto','Bruk');
 const b=txn('b','2026-10-13',300,'Uavklart','Overføring egen konto','Sparing');
 const c=txn('c','2026-10-13',300,'Uavklart','Overføring egen konto','Spare 2');
 assert.equal(K.definiteMatch(a,b,[a,b,c]),false);
});
test('suggest repeated optional subscriptions with actual evidence',()=>{
 const ts=[txn('1','2026-08-10',-119,'Abonnement','STREAMING 34455512'),txn('2','2026-09-10',-119,'Abonnement','STREAMING 34455513'),txn('3','2026-10-10',-119,'Abonnement','STREAMING 34455514')];
 const r=K.cutSuggestions(ts,'2026-10');
 assert.equal(r.length,1);assert.equal(r[0].estimatedMonthly,119);assert.equal(r[0].estimatedAnnual,1428);
 assert.equal(r[0].evidence.length,3);
 assert.equal(K.cutSuggestions(ts,'2026-10',{}, {[r[0].id]:true}).length,0);
});
test('never auto suggest cancellation of essentials',()=>{
 const cats=['Forsikring','Helse','Bolig','Mat og dagligvarer','Transport'];
 const ts=cats.flatMap((c,i)=>[txn('a'+i,'2026-09-10',-1000,c,'Faktura '+c),txn('b'+i,'2026-10-10',-1000,c,'Faktura '+c)]);
 assert.equal(K.cutSuggestions(ts,'2026-10').length,0);
});
test('do not invent savings for high discretionary budget',()=>{
 const ts=[txn('a','2026-10-08',-350,'Fritid','Kino')];const r=K.cutSuggestions(ts,'2026-10',{Fritid:200});
 assert.equal(r[0].estimatedMonthly,null);assert.equal(r[0].overspend,150);
});
test('missing budgets show N/A; overspending triggers correct ID10T',()=>{
 const ts=[txn('a','2026-10-09',-140,'Fritid','Kino')];
 assert.equal(K.budgetStatus(ts,'2026-10',{}).level,null);
 assert.equal(K.budgetStatus(ts,'2026-10',{Fritid:100}).level,9);
 assert.equal(K.budgetStatus([txn('b','2026-10-09',-160,'Fritid','Kino')],'2026-10',{Fritid:100}).level,10);
 assert.equal(K.budgetStatus(ts,'2026-10',{Fritid:100}).code,'ID10T');
});
test('incoming refunds are not negative expenses or ordinary salary',()=>{
 const ts=[txn('a','2026-10-09',-500,'Shopping','Kjøp'),txn('b','2026-10-10',200,'Refusjon','Retur')];
 const s=K.summarizeMonth(ts,'2026-10');assert.equal(s.income,0);assert.equal(s.expenses,500);assert.equal(s.refunds,200);assert.equal(s.net,-300);
});
