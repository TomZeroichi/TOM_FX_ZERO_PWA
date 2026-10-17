/* TOM FX Zero 0.2.1. Signed PnL and demo bulk-close command generation. */
(function(root){
'use strict';
function net(p){return p.costStatus==='observed'?p.profit+p.swap+p.commission+p.fee:null;}
function isLiveSource(source){return source==='mt4-snapshot'||source==='mt5-snapshot';}
function sum(rows){const known=rows.every(p=>net(p)!==null);return {count:rows.length,profit:rows.reduce((a,p)=>a+p.profit,0),swap:rows.reduce((a,p)=>a+p.swap,0),commission:rows.reduce((a,p)=>a+p.commission,0),fee:rows.reduce((a,p)=>a+p.fee,0),net:known?rows.reduce((a,p)=>a+net(p),0):null};}
function closeTargets(rows,kind){if(!Array.isArray(rows)||!['all','BUY','SELL'].includes(kind))throw Error('一括決済の対象が不正です。');return rows.filter(p=>kind==='all'||p.side===kind);}
function validate(d){
 if(!d||![1,2].includes(d.schema)||!['demo','mt4-snapshot','mt5-snapshot'].includes(d.source)||typeof d.currency!=='string'||! /^[A-Z]{3}$/.test(d.currency)||!Number.isFinite(d.generatedAt)||d.generatedAt<0||d.generatedAt>Date.now()/1000+300||!Array.isArray(d.positions)||d.positions.length>5000)throw Error('対応するMT4/MT5出力ファイルではありません。');
 if(isLiveSource(d.source)&&d.schema===2&&(!/^\d+$/.test(d.account)||!['demo','real','contest'].includes(d.tradeMode)))throw Error('口座情報が不正です。');
 if(d.balance!==undefined&&(!Number.isFinite(d.balance)||d.balance<0))throw Error('残高情報が不正です。');
 const ids=new Set(),tickets=new Set();
 for(const p of d.positions){
 if(!p||typeof p.id!=='string'||!p.id||ids.has(p.id)||typeof p.symbol!=='string'||p.symbol.length>64||!['BUY','SELL'].includes(p.side)||!['observed','unknown'].includes(p.costStatus)||(isLiveSource(d.source)&&d.schema===2&&!/^\d+$/.test(p.ticket)))throw Error('ポジション情報が不正、または重複しています。');
 ids.add(p.id);
 if(isLiveSource(d.source)&&d.schema===2){if(tickets.has(p.ticket))throw Error('ポジションチケットが重複しています。');tickets.add(p.ticket);}
 for(const k of ['volume','profit','swap','commission','fee'])if(typeof p[k]!=='number'||!Number.isFinite(p[k]))throw Error('損益・手数料に不正な値があります。');
 if(p.volume<=0)throw Error('残数量が不正です。');
 }
 const validateMarket=m=>{
  if(!m||typeof m.symbol!=='string'||m.symbol.length<1||!Number.isFinite(m.bid)||!Number.isFinite(m.ask)||m.bid<=0||m.ask<=0||m.ask<m.bid||!Number.isFinite(m.updatedAt)||!m.charts)throw Error('チャート情報が不正です。');
  if(m.pipSize!==undefined&&(!Number.isFinite(m.pipSize)||m.pipSize<=0))throw Error('チャート情報が不正です。');
  for(const tf of ['M1','M5','M15']){const bars=m.charts[tf];if(!Array.isArray(bars)||bars.length<2||bars.length>200)throw Error('チャート情報が不正です。');let previous=0;for(const b of bars){if(!b||!Number.isFinite(b.time)||b.time<=previous||!['open','high','low','close','volume'].every(k=>Number.isFinite(b[k]))||b.low>Math.min(b.open,b.close)||b.high<Math.max(b.open,b.close)||b.low<=0||b.high<=0||b.volume<0)throw Error('チャート情報が不正です。');previous=b.time;}}
 };
 if(d.market!==undefined)validateMarket(d.market);
 if(d.markets!==undefined){if(!Array.isArray(d.markets)||d.markets.length<1||d.markets.length>8)throw Error('チャート情報が不正です。');const marketSymbols=new Set();for(const m of d.markets){validateMarket(m);if(marketSymbols.has(m.symbol))throw Error('チャート情報が不正です。');marketSymbols.add(m.symbol);}}
 if(d.tradeSymbols!==undefined){if(!Array.isArray(d.tradeSymbols)||d.tradeSymbols.length<1||d.tradeSymbols.length>6||d.tradeSymbols.some(symbol=>typeof symbol!=='string'||symbol.length<1))throw Error('取引銘柄情報が不正です。');}
 return d;
}
function closeCommand(d,positionIds,now=Math.floor(Date.now()/1000)){
 validate(d);
 if(d.schema!==2||!isLiveSource(d.source)||d.tradeMode!=='demo')throw Error('デモ口座の新しいMT4/MT5出力ファイルが必要です。');
 if(!Array.isArray(positionIds)||!positionIds.length||positionIds.length>100)throw Error('1～100件のポジションを選択してください。');
 const wanted=new Set(positionIds),rows=d.positions.filter(p=>wanted.has(p.id));
 if(rows.length!==wanted.size)throw Error('選択内容を確認してください。');
 if(!Number.isInteger(now)||now<d.generatedAt-60||now>d.generatedAt+300)throw Error('端末時刻またはスナップショット時刻を確認してください。');
 return ['TOM_FX_ZERO_CLOSE_V1','account='+d.account,'created='+now,'snapshot='+Math.floor(d.generatedAt),'tickets='+rows.map(p=>p.ticket).join(','),'end=1',''].join('\n');
}
// Weighted remaining opening cost after partial close. OUT costs belong to closed volume.
function allocate(deals,currentVolume){let volume=0,commission=0,fee=0,seen=false,ok=true;
 for(const d of deals){if(d.entry==='IN'){volume+=d.volume;commission+=d.commission;fee+=d.fee;seen=seen||d.commission!==0;}
 else if(['OUT','OUT_BY'].includes(d.entry)){if(volume<=0||d.volume>volume+1e-8){ok=false;break;}const ratio=Math.max(0,(volume-d.volume)/volume);commission*=ratio;fee*=ratio;volume-=d.volume;}
 else {ok=false;break;}}
 return {commission,fee,costStatus:ok&&seen&&Math.abs(volume-currentVolume)<1e-7?'observed':'unknown'};
}
const api={net,sum,closeTargets,validate,allocate,closeCommand};if(typeof module!=='undefined')module.exports=api;else root.FXCalc=api;
})(globalThis);
