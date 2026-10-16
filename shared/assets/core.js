/* KontoKompass felles kjerne v2 — samme fil på Windows og Android.
 * Ren JavaScript uten lagring, nettverk eller plattformavhengigheter.
 * Beløp oppgis i NOK; tomme/manglende felt er aldri grunnlag for antagelser.
 */
(function(root, factory) {
  const lib = factory();
  if (typeof module === 'object' && module.exports) module.exports = lib;
  else root.KontoCore = lib;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';
  const PROTECTED = new Set(['Bolig','Forsikring','Helse','Mat og dagligvarer','Transport']);
  const OPTIONAL = new Set(['Abonnement','Fritid','Shopping']);
  const clean = x => String(x == null ? '' : x).trim();
  const month = x => clean(x).slice(0,7);
  const monthStart = x => /^\d{4}-\d{2}$/.test(x) ? new Date(x + '-01T00:00:00Z') : null;
  const monthDistance = (a,b) => {
    const x=monthStart(a), y=monthStart(b);
    return !x||!y ? NaN : (y.getUTCFullYear()-x.getUTCFullYear())*12+y.getUTCMonth()-x.getUTCMonth();
  };
  function normalizePayee(s) {
    return clean(s).toLocaleLowerCase('nb-NO')
      .replace(/(?:ref(?:eranse)?|bilagsnr|transaksjon|terminal|auth|dato|tid|kid)\s*[:#-]?\s*\d+/g, '')
      .replace(/\b\d{4}[-/.]\d{1,2}[-/.]\d{1,2}\b/g, '')
      .replace(/\b\d{6,}\b/g, '')
      .replace(/\s+/g, ' ').trim();
  }
  function summarizeMonth(transactions, selectedMonth) {
    let income=0, expenses=0, refunds=0, transferVolume=0, unresolved=0;
    const seenLinks=new Set();
    for(const t of transactions || []) {
      if(month(t.date)!==selectedMonth) continue;
      const v=Number(t.money);
      if(!Number.isFinite(v)) { unresolved++; continue; }
      if(t.category==='Avdrag (ikke forbruk)') continue;
      if(t.category==='Overføring') {
        if(t.linked) {
          const pair=[t.id,t.linked].sort().join('∣');
          if(!seenLinks.has(pair)) { seenLinks.add(pair); transferVolume+=Math.abs(v); }
        } else transferVolume+=Math.abs(v);
      } else if(t.category==='Inntekt' && v>0) income+=v;
      else if(t.category==='Refusjon' && v>0) refunds+=v;
      else if(t.category==='Uavklart' || !t.category) unresolved++;
      else if(v<0) expenses-=v;
    }
    return {income,expenses,refunds,transferVolume,unresolved,net:income+refunds-expenses};
  }
  function safeCandidates(t, transactions) {
    if(!t || !t.account || !Number.isFinite(Number(t.money))) return [];
    return (transactions||[]).filter(u=>u!==t&&u.id!==t.id && u.account && u.account!==t.account
      && Math.abs(Number(u.money)+Number(t.money))<0.001
      && Number.isFinite(new Date(u.date).getTime())&&Number.isFinite(new Date(t.date).getTime())
      && Math.abs(new Date(u.date)-new Date(t.date))<=3*86400000);
  }
  function definiteMatch(t,u,transactions) {
    if(!u || t.id===u.id || t.account===u.account) return false;
    const tCand=safeCandidates(t,transactions),uCand=safeCandidates(u,transactions);
    if(tCand.length!==1||uCand.length!==1 || tCand[0].id!==u.id||uCand[0].id!==t.id)return false;
    // Source IDs may differ between bank accounts; never use equal KID alone.
    const hasCommonTxId = clean(t.txid) && clean(t.txid)===clean(u.txid);
    const transferHint=x=>/overf.r|overfor|transfer|egen konto|mellom konto|sparekonto|kredittkort|mastercard.*betaling|betaling.*mastercard/i.test(clean(x.description));
    return Boolean(hasCommonTxId || (transferHint(t)&&transferHint(u)));
  }
  function median(values) {
    const xs=values.filter(v=>Number.isFinite(v)).sort((a,b)=>a-b);
    if(!xs.length)return null; const k=Math.floor(xs.length/2);return xs.length%2?xs[k]:(xs[k-1]+xs[k])/2;
  }
  function cutSuggestions(transactions, selectedMonth, budgets={}, dismissed={}) {
    const data=(transactions||[]).filter(t=>t && t.money<0 && OPTIONAL.has(t.category) && t.category!=='Overføring');
    const groups=new Map();
    for(const t of data) {
      const merchant=normalizePayee(t.description),m=month(t.date);
      if(!merchant||!/^(20\d\d)-(0[1-9]|1[0-2])$/.test(m))continue;
      const key=t.category+'|'+merchant;
      if(!groups.has(key))groups.set(key,{key,merchant,category:t.category,transactions:[]});
      groups.get(key).transactions.push(t);
    }
    const suggestions=[];
    for(const group of groups.values()) {
      const monthly = new Map();
      for(const t of group.transactions){const m=month(t.date);monthly.set(m,(monthly.get(m)||0)+Math.abs(Number(t.money)))}
      const months=[...monthly.keys()].sort();
      const lastMonth=months.at(-1);
      if(group.category!=='Abonnement' || months.length<2 || monthDistance(lastMonth,selectedMonth)>1 || monthDistance(lastMonth,selectedMonth)<0)continue;
      const last3=months.slice(-3).map(m=>monthly.get(m));
      const v=median(last3),variation=last3.length>1?Math.max(...last3)-Math.min(...last3):0;
      const regular=months.slice(-2).every((m,i,a)=>i===0 || monthDistance(a[i-1],m)<=2);
      if(!regular||!v||variation>Math.max(v*0.35,100))continue;
      if(dismissed[group.key])continue;
      suggestions.push({id:group.key,kind:'recurring',title:'Vurder abonnementet: '+group.merchant,
        description:'Trekk er funnet i '+months.length+' ulike måneder. Undersøk om tjenesten fortsatt brukes. Ikke si opp før du har kontrollert bindingstid og vilkår.',
        evidence:group.transactions.slice(-4).map(t=>({date:t.date,account:t.account||'N/A',amount:t.money,source:t.source||'N/A'})),
        estimatedMonthly:Math.round(v*100)/100, estimatedAnnual:Math.round(v*1200)/100,
        estimateLabel:'Øvre mulig besparelse dersom hele tjenesten avsluttes (ikke bekreftet)',confidence:'middels'});
    }
    for(const category of ['Shopping','Fritid','Abonnement']) {
      const limit=Number(budgets[category]);if(!Number.isFinite(limit)||limit<=0)continue;
      const used=(transactions||[]).filter(t=>month(t.date)===selectedMonth&&t.category===category&&t.money<0).reduce((s,t)=>s+Math.abs(Number(t.money)),0);
      if(used<=limit)continue;
      const id='budget|'+category+'|'+selectedMonth;if(dismissed[id])continue;
      suggestions.push({id,kind:'budget',title:'Se gjennom '+category.toLocaleLowerCase('nb-NO'),
        description:'Kategorisert forbruk overskrider din egen budsjettramme. Gå gjennom transaksjonene før du beslutter kutt.',
        evidence:[],estimatedMonthly:null,estimatedAnnual:null,overspend:Math.round((used-limit)*100)/100,
        estimateLabel:'Ingen automatisk besparelse beregnet',confidence:'høy på registrerte tall'});
    }
    return suggestions.sort((a,b)=>(b.estimatedMonthly||b.overspend||0)-(a.estimatedMonthly||a.overspend||0));
  }
  function budgetStatus(transactions, selectedMonth,budgets) {
    const active=Object.entries(budgets||{}).filter(([_,v])=>Number(v)>0);
    if(!active.length)return {level:null,reason:'N/A – ingen budsjetter oppgitt'};
    const total=active.reduce((a,[,v])=>a+Number(v),0);
    const keys=new Set(active.map(([c])=>c));
    const used=(transactions||[]).filter(t=>month(t.date)===selectedMonth&&t.money<0)
      .reduce((s,t)=>{const parts=(typeof globalThis!=='undefined'&&globalThis.KontoFinance)?globalThis.KontoFinance.splitParts(t):null;
        if(parts===null && typeof globalThis!=='undefined'&&globalThis.KontoFinance)return s;
        if(Array.isArray(parts)&&parts.length)return s+parts.filter(p=>keys.has(p.category)&&p.amount<0).reduce((v,p)=>v-Math.min(0,Number(p.amount)),0);
        return s+(keys.has(t.category)?-Math.min(0,Number(t.money)):0);},0);
    const ratio=used/total;
    const level=ratio>=1.5?10:ratio>=1.25?9:ratio>=1.1?8:Math.max(0,Math.min(7,Math.round(ratio*7)));
    return {level,used,total,ratio,code:level>=9?'ID10T':null,
      incomplete:(transactions||[]).some(t=>month(t.date)===selectedMonth&&t.category==='Uavklart')};
  }
  return {PROTECTED, OPTIONAL,normalizePayee,monthDistance,summarizeMonth,safeCandidates,definiteMatch,cutSuggestions,budgetStatus};
});
