'use strict';
const $=id=>document.getElementById(id),C=FXCalc;
const demo=()=>({schema:1,source:'demo',currency:'JPY',balance:500000,equity:500000,generatedAt:Date.now()/1000,positions:[
 {id:'1001',symbol:'USDJPY',side:'BUY',volume:.2,profit:1850,swap:-30,commission:-420,fee:0,costStatus:'observed'},
 {id:'1002',symbol:'XAUUSD',side:'BUY',volume:.05,profit:620,swap:0,commission:-700,fee:0,costStatus:'observed'},
 {id:'1003',symbol:'EURUSD',side:'SELL',volume:.1,profit:-450,swap:-20,commission:-210,fee:0,costStatus:'observed'},
 {id:'1004',symbol:'USDJPY',side:'SELL',volume:.1,profit:980,swap:-50,commission:-210,fee:0,costStatus:'observed'},
 {id:'1005',symbol:'XAUUSD',side:'SELL',volume:.02,profit:130,swap:0,commission:0,fee:0,costStatus:'unknown'}
]});

let data=demo();
let selected=new Set(data.positions.slice(0,4).map(p=>p.id));
let pending=[];
let pendingLabel='選択分';
let closeNoConfirm=false;
let closeInFlight=false;
let orderInFlight=false;
let nanpinInFlight=false;
let nanpinSyncKey='';
let modifyInFlight=false;
let vpsRestartInFlight=false;
let pendingOrder=null;
let pendingModify=null;
const positionLevelDrafts=new Map();
const CHART_TIMEFRAMES=['M1','M5','M15','M30','H1','H4','D1','W1','MN1'];
let chartTimeframe='M5';
let indicatorChartTimeframe='M5';
let chartZoom=1;
let chartDisplayBars=Number.MAX_SAFE_INTEGER;
let balanceView='balance';
let chartLevelDraft=null;
let chartDrag=null;
const chartPinches=new Map();
const chartLayouts=new Map();
let selectedTradeSymbol='USDJPYz';
let currencySearchQuery='';
let tradingViewPreviewSymbol='OANDA:USDJPY';
const TRADINGVIEW_SYMBOL_CATALOG=[
 {symbol:'EURUSD',label:'EUR/USD',tvSymbol:'OANDA:EURUSD'},
 {symbol:'GBPUSD',label:'GBP/USD',tvSymbol:'OANDA:GBPUSD'},
 {symbol:'AUDUSD',label:'AUD/USD',tvSymbol:'OANDA:AUDUSD'},
 {symbol:'NZDUSD',label:'NZD/USD',tvSymbol:'OANDA:NZDUSD'},
 {symbol:'USDCAD',label:'USD/CAD',tvSymbol:'OANDA:USDCAD'},
 {symbol:'USDCHF',label:'USD/CHF',tvSymbol:'OANDA:USDCHF'},
 {symbol:'USDJPY',label:'USD/JPY',tvSymbol:'OANDA:USDJPY'},
 {symbol:'EURJPY',label:'EUR/JPY',tvSymbol:'OANDA:EURJPY'},
 {symbol:'GBPJPY',label:'GBP/JPY',tvSymbol:'OANDA:GBPJPY'},
 {symbol:'AUDJPY',label:'AUD/JPY',tvSymbol:'OANDA:AUDJPY'},
 {symbol:'XAUUSD',label:'金（XAU/USD）',tvSymbol:'OANDA:XAUUSD'},
 {symbol:'XAGUSD',label:'銀（XAG/USD）',tvSymbol:'OANDA:XAGUSD'},
 {symbol:'BTCUSD',label:'Bitcoin（BTC/USD）',tvSymbol:'COINBASE:BTCUSD'},
 {symbol:'USOIL',label:'原油（WTI）',tvSymbol:'TVC:USOIL'},
 {symbol:'NAS100',label:'NASDAQ 100',tvSymbol:'FOREXCOM:NAS100'},
 {symbol:'JP225',label:'日経225',tvSymbol:'TVC:JP225'}
];
let liveTimer=null;
let liveBusy=false;
let liveReceivedAt=0;
let balanceHidden=false;
const LIVE_KEY_NAME='tomFxZeroConnectionKeyV1';
const CONNECTION_PROFILES_KEY='tomFxZeroConnectionProfilesV1';
const ACTIVE_PROFILE_KEY='tomFxZeroActiveConnectionProfileV1';
const MODE_PROFILE_KEY='tomFxZeroModeProfileV1';
// GitHub Pages hosts only the static frontend.  Keep the existing API/EA/VPS
// backend on the established Sites origin so the existing pairing keys and
// communication contract remain unchanged.
const API_ORIGIN='https://tom-fx-zero.ryuichi512.chatgpt.site';
const LIVE_ENDPOINT=API_ORIGIN+'/api/v1/snapshot';
const COMMAND_ENDPOINT=API_ORIGIN+'/api/v1/command';
const PAIRING_ENDPOINT=API_ORIGIN+'/api/v1/pairing';
const NANPIN_SETTINGS_KEY='tomFxZeroNanpinSettingsV1';
const ORDER_VOLUME_KEY='tomFxZeroOrderVolumeV1';
const WEEKEND_BTC_TEST_KEY='tomFxZeroWeekendBtcTestV1';
const LOT_CALCULATOR_KEY='tomFxZeroLotCalculatorV1';
const INDICATOR_PRESETS_KEY='tomFxZeroIndicatorPresetsV1';
const INDICATOR_REVERSE_SETTINGS_KEY='tomFxZeroIndicatorReverseSettingsV1';
const LIVE_SNAPSHOT_KEY='tomFxZeroLiveSnapshotV1';
const THEME_KEY='tomFxZeroThemeV1';
const CHART_DISPLAY_BARS_KEY='tomFxZeroChartDisplayBarsV1';
const COMMAND_RESULT_POLL_MS=100;
const COMMAND_RESULT_MAX_ATTEMPTS=120;
let lastLiveCacheSavedAt=0;
let pendingPairingKey='';
let pendingPairingProfileId='';
let pendingPairingPreviousKey='';
function isLiveSource(source){return source==='mt4-snapshot'||source==='mt5-snapshot';}
function snapshotPlatform(snapshot=data){return snapshot?.platform||((snapshot?.source==='mt4-snapshot')?'MT4':'MT5');}
function platformLabel(snapshot=data){return snapshotPlatform(snapshot);}
function currentPlatform(){return data?.live?platformLabel(data):(activeProfile()?.accountType==='MT4'?'MT4':'MT5');}
function profilePlatform(profile){
 const type=String(profile?.accountType||'');
 if(type==='MT4')return 'MT4';
 if(type==='MT5'||type==='MT5 Zero')return 'MT5';
 return null;
}
function hasStoredConnectionSnapshot(profile){
 if(!profile)return false;
 try{
  const stored=JSON.parse(localStorage.getItem(profileCacheKey(profile.id)||'')||'null');
  const snapshot=stored?.snapshot||stored;
  return isLiveSource(snapshot?.source);
 }catch{return false;}
}
function hasConnectionHistory(profile){
 if(!profile||profile.pairingPending)return false;
 if(profile.connectionHistory===true||Number(profile.connectionHistoryAt)>0)return true;
 if(String(profile.accountNumber||'').trim()!=='')return true;
 return hasStoredConnectionSnapshot(profile);
}
function isConnectedProfile(profile){
 return hasConnectionHistory(profile)&&String(profile.connectionKey||'').trim()!=='';
}
function connectedProfiles(){return connectionProfiles.filter(hasConnectionHistory);}
function nextSnapshotProfileId(platform){
 let index=1;
 let id=(platform==='MT4'?'mt4-demo-':'mt5-demo-')+index;
 while(connectionProfiles.some(item=>item.id===id)){index++;id=(platform==='MT4'?'mt4-demo-':'mt5-demo-')+index;}
 return id;
}
function nextPairingProfileId(){
 let index=1,id='pairing-demo-'+index;
 while(connectionProfiles.some(item=>item.id===id)){index++;id='pairing-demo-'+index;}
 return id;
}
function snapshotProfileLabel(snapshot,platform){return String(snapshot.broker||platform)+' '+platform+'（デモ）';}
function ensureProfileForSnapshot(snapshot){
 const platform=platformLabel(snapshot),account=String(snapshot.account||'');
 let profile=activeProfile();
 if(profile?.pairingPending){
  // ペアリング直後はプラットフォームがまだ分からないため、仮口座を
  // 最初のスナップショットでMT4／MT5へ確定する。既存口座のキーは触らない。
  const target=connectionProfiles.find(item=>item.id!==profile.id&&!item.pairingPending&&profilePlatform(item)===platform&&String(item.accountNumber||'')===account);
  if(target){
   target.connectionKey=profile.connectionKey;
   target.accountType=platform;
   target.broker=String(snapshot.broker||target.broker||platform);
   target.server=String(snapshot.server||target.server||'');
   target.accountNumber=account||target.accountNumber||'';
   target.label=snapshotProfileLabel(snapshot,platform);
   profile.connectionKey='';
   profile.pairingPending=false;
   if(profile.id.indexOf('pairing-demo-')===0)connectionProfiles=connectionProfiles.filter(item=>item.id!==profile.id);
   activeConnectionProfileId=target.id;
   saveModeProfile(activeMode,target.id);
   persistProfiles();
   return target;
  }
  profile.accountType=platform;
  profile.broker=String(snapshot.broker||profile.broker||platform);
  profile.server=String(snapshot.server||profile.server||'');
  profile.accountNumber=account||profile.accountNumber||'';
  profile.label=snapshotProfileLabel(snapshot,platform);
  profile.pairingPending=false;
  return profile;
 }
 const sameProfile=profilePlatform(profile)===platform&&(!profile.accountNumber||String(profile.accountNumber)===account);
 if(sameProfile)return profile;
 const canAutoRegister=pendingPairingKey!==''&&pendingPairingKey===profile.connectionKey;
 if(!canAutoRegister&&!(profile.id==='exness-mt5-zero-demo'&&platform==='MT4'))return profile;
 const placeholder=connectionProfiles.find(item=>item.id!==profile.id&&profilePlatform(item)===platform&&!item.accountNumber);
 const target=placeholder||connectionProfiles.find(item=>item.id!==profile.id&&profilePlatform(item)===platform&&String(item.accountNumber||'')===account);
 if(target&&(!target.connectionKey||target.connectionKey===profile.connectionKey)){
  target.connectionKey=profile.connectionKey;
  if(pendingPairingProfileId===profile.id&&pendingPairingPreviousKey)profile.connectionKey=pendingPairingPreviousKey;
  else profile.connectionKey='';
  activeConnectionProfileId=target.id;
  saveModeProfile(activeMode,target.id);
  persistProfiles();
  return target;
 }
 const created={id:nextSnapshotProfileId(platform),broker:String(snapshot.broker||platform),accountType:platform,label:snapshotProfileLabel(snapshot,platform),tradeMode:'demo',connectionKey:profile.connectionKey};
 if(pendingPairingProfileId===profile.id&&pendingPairingPreviousKey)profile.connectionKey=pendingPairingPreviousKey;
 else profile.connectionKey='';
 connectionProfiles.push(created);
 activeConnectionProfileId=created.id;
 saveModeProfile(activeMode,created.id);
 persistProfiles();
 return created;
}
function updateProfileFromSnapshot(snapshot){
 if(!isLiveSource(snapshot?.source))return;
 const previousId=activeConnectionProfileId;
 const profile=ensureProfileForSnapshot(snapshot);
 if(!profile)return;
 let changed=previousId!==activeConnectionProfileId;
 if(profile.connectionHistory!==true||!Number(profile.connectionHistoryAt)){
  profile.connectionHistory=true;
  profile.connectionHistoryAt=Date.now();
  changed=true;
 }
 if(typeof snapshot.broker==='string'&&snapshot.broker&&profile.broker!==snapshot.broker){profile.broker=snapshot.broker;changed=true;}
 if(typeof snapshot.server==='string'&&snapshot.server&&profile.server!==snapshot.server){profile.server=snapshot.server;changed=true;}
 if(typeof snapshot.accountName==='string'&&snapshot.accountName&&profile.accountName!==snapshot.accountName){profile.accountName=snapshot.accountName;changed=true;}
 const account=String(snapshot.account||profile.accountNumber||'');
 if(profile.accountNumber!==account){profile.accountNumber=account;changed=true;}
 const platform=platformLabel(snapshot);
 if(platform==='MT4'&&profile.accountType!=='MT4'){profile.accountType='MT4';changed=true;}
 else if(platform==='MT5'&&profile.accountType==='MT4'){profile.accountType='MT5';changed=true;}
 if(snapshot.broker){
  const suffix=profile.id==='exness-mt5-zero-demo'&&platform==='MT5'?' MT5 Zero': ' '+platform;
  const label=snapshot.broker+suffix+'（デモ）';
  if(profile.label!==label){profile.label=label;changed=true;}
 }
 persistProfiles();
 if(changed)updateProfileUi();
 pendingPairingKey='';pendingPairingProfileId='';pendingPairingPreviousKey='';
 return profile;
}
function defaultExnessProfile(key=''){return {id:'exness-mt5-zero-demo',broker:'Exness',accountType:'MT5 Zero',label:'Exness MT5 Zero（デモ）',tradeMode:'demo',connectionKey:key};}
function profileCacheKey(id){return LIVE_SNAPSHOT_KEY+'_'+id;}
function profileSettingKey(key){return key+'_'+activeProfile().id;}
function readProfiles(){
 try{
  const stored=JSON.parse(localStorage.getItem(CONNECTION_PROFILES_KEY)||'null');
  if(Array.isArray(stored)&&stored.length){const profiles=stored.filter(profile=>profile&&profile.id&&profile.tradeMode==='demo');if(profiles.length)return profiles;}
 }catch{}
 const legacyKey=localStorage.getItem(LIVE_KEY_NAME)||'';
 const legacy=defaultExnessProfile(legacyKey);
 try{
  localStorage.setItem(CONNECTION_PROFILES_KEY,JSON.stringify([legacy]));
  localStorage.setItem(ACTIVE_PROFILE_KEY,legacy.id);
  const cache=localStorage.getItem(LIVE_SNAPSHOT_KEY);
  if(cache&&!localStorage.getItem(profileCacheKey(legacy.id)))localStorage.setItem(profileCacheKey(legacy.id),cache);
  [NANPIN_SETTINGS_KEY,ORDER_VOLUME_KEY].forEach(key=>{const value=localStorage.getItem(key);if(value!==null&&!localStorage.getItem(key+'_'+legacy.id))localStorage.setItem(key+'_'+legacy.id,value);});
 }catch{}
 return [legacy];
}
let connectionProfiles=readProfiles();
let activeConnectionProfileId=localStorage.getItem(ACTIVE_PROFILE_KEY)||connectionProfiles[0].id;
if(!connectionProfiles.some(profile=>profile.id===activeConnectionProfileId))activeConnectionProfileId=connectionProfiles[0].id;
function recoverLegacyMt4Profile(){
 const legacy=connectionProfiles.find(profile=>profile.id==='exness-mt5-zero-demo');
 if(!legacy||profilePlatform(legacy)!=='MT4')return;
 const hasMt5=connectionProfiles.some(profile=>profile.id!==legacy.id&&profilePlatform(profile)==='MT5');
 if(hasMt5)return;
 const profile=defaultExnessProfile('');
 profile.id=nextSnapshotProfileId('MT5');
 connectionProfiles.push(profile);
 persistProfiles();
}
function ensurePlatformPlaceholders(){
 // 旧PWAの口座枠が片方だけ残っている場合でも、プルダウンから
 // MT4／MT5を追加できる空き枠を表示して、再接続を6桁コードで進められるようにする。
 let changed=false;
 if(!connectionProfiles.some(profile=>profilePlatform(profile)==='MT5')){
  const profile=defaultExnessProfile('');
  profile.id=nextSnapshotProfileId('MT5');
  connectionProfiles.push(profile);
  changed=true;
 }
 if(!connectionProfiles.some(profile=>profilePlatform(profile)==='MT4')){
  const index=connectionProfiles.filter(profile=>profilePlatform(profile)==='MT4').length+1;
  connectionProfiles.push({id:nextSnapshotProfileId('MT4'),broker:'MT4',accountType:'MT4',label:'MT4デモ口座 '+index,tradeMode:'demo',connectionKey:''});
  changed=true;
 }
 if(changed)persistProfiles();
}
// 旧PWAではMT4ペアリング時にExnessのMT5枠をMT4で上書きしていたため、
// 既存データを壊さずMT5の空き枠を復元する。
recoverLegacyMt4Profile();
ensurePlatformPlaceholders();
let activeMode='goto';
let appPage='home';
let modeProfiles=(()=>{try{const v=JSON.parse(localStorage.getItem(MODE_PROFILE_KEY)||'null');if(v?.goto&&v?.indicator)return v;}catch{}return {goto:activeConnectionProfileId,indicator:activeConnectionProfileId};})();
function modeProfileId(mode){return connectionProfiles.some(p=>p.id===modeProfiles[mode])?modeProfiles[mode]:activeConnectionProfileId;}
function saveModeProfile(mode,id){modeProfiles[mode]=id;try{localStorage.setItem(MODE_PROFILE_KEY,JSON.stringify(modeProfiles));}catch{}}
function activeProfile(){return connectionProfiles.find(profile=>profile.id===activeConnectionProfileId)||connectionProfiles[0];}
function profileTitle(profile=activeProfile()){return profile.label||profile.broker+' · '+profile.accountType+'（デモ）';}
function persistProfiles(){
 try{localStorage.setItem(CONNECTION_PROFILES_KEY,JSON.stringify(connectionProfiles));localStorage.setItem(ACTIVE_PROFILE_KEY,activeConnectionProfileId);localStorage.setItem(LIVE_KEY_NAME,activeProfile().connectionKey||'');}catch{}
}
function setActiveConnectionKey(key){activeProfile().connectionKey=key||'';persistProfiles();}
function twoDigits(value){return String(value).padStart(2,'0');}
function setupClockSelects(prefix,hour,minute,second){
 const fill=(id,count,selected)=>{
  const select=$(id);
  select.replaceChildren(...Array.from({length:count},(_,value)=>new Option(twoDigits(value),twoDigits(value),false,value===selected)));
  select.value=twoDigits(selected);
 };
 fill(prefix+'Hour',24,hour);
 fill(prefix+'Minute',60,minute);
 fill(prefix+'Second',60,second);
}
function selectedClockTime(prefix){
 const hour=Number($(prefix+'Hour')?.value),minute=Number($(prefix+'Minute')?.value),second=Number($(prefix+'Second')?.value);
 if(!Number.isInteger(hour)||hour<0||hour>23||!Number.isInteger(minute)||minute<0||minute>59||!Number.isInteger(second)||second<0||second>59)return null;
 return twoDigits(hour)+':'+twoDigits(minute)+':'+twoDigits(second);
}
const price=n=>Number.isFinite(n)?new Intl.NumberFormat('en-US',{minimumFractionDigits:2,maximumFractionDigits:8}).format(n):'--';
function decimalPlaces(value){
 const number=Math.abs(Number(value));
 if(!Number.isFinite(number)||number===0)return 0;
 const text=number.toString().toLowerCase();
 if(text.includes('e-')){
  const [coefficient,exponentText]=text.split('e-');
  return Number(exponentText)+(coefficient.split('.')[1]||'').length;
 }
 return (text.split('.')[1]||'').length;
}
function marketDigits(market=null,value=0){
 const configured=Number(market?.digits);
 if(Number.isInteger(configured)&&configured>=0&&configured<=10)return isGbpaudSymbol(market?.symbol)?Math.max(configured,6):configured;
 const point=Number(market?.point);
 if(Number.isFinite(point)&&point>0)return Math.min(10,Math.max(decimalPlaces(point),isGbpaudSymbol(market?.symbol)?6:0));
 const quoteDigits=Math.max(decimalPlaces(market?.bid),decimalPlaces(market?.ask),decimalPlaces(value));
 if(quoteDigits>0)return Math.min(10,Math.max(quoteDigits,isGbpaudSymbol(market?.symbol)?6:0));
 const pip=Number(market?.pipSize);
 if(Number.isFinite(pip)&&pip>0){
  const pipDigits=decimalPlaces(pip);
  return Math.min(10,pipDigits+(pip<0.01?1:0));
 }
 return isGbpaudSymbol(market?.symbol)?6:/JPY/i.test(String(market?.symbol||''))?3:5;
}
function marketPrice(value,market=null){
 if(!Number.isFinite(Number(value)))return '--';
 const digits=marketDigits(market,Number(value));
 return new Intl.NumberFormat('en-US',{minimumFractionDigits:digits,maximumFractionDigits:digits}).format(Number(value));
}
function isGbpaudSymbol(symbol){return /^GBPAUD/i.test(String(symbol||''));}
function chartPrice(value,market=null){
 if(!Number.isFinite(Number(value)))return '--';
 const digits=isGbpaudSymbol(market?.symbol)?6:2;
 return new Intl.NumberFormat('en-US',{minimumFractionDigits:digits,maximumFractionDigits:digits}).format(Number(value));
}
function chartPriceScaleWidth(market=null){
 const sample=chartPrice(Number(market?.bid)||Number(market?.ask)||0,market);
 // 価格の桁数だけに合わせる極細の右価格軸。銘柄ごとに必要な幅だけを使う。
 return Math.max(54,Math.min(78,Math.ceil(sample.length*7.4+8)));
}
const pipSize=(symbol,market=null)=>{
 const configured=Number(market?.pipSize);
 return Number.isFinite(configured)&&configured>0?configured:/JPY/i.test(String(symbol||''))?0.01:0.0001;
};
const marketList=source=>Array.isArray(source?.markets)&&source.markets.length?source.markets:(source?.market?[source.market]:[]);
const isCoreGotoSymbol=symbol=>/^(USDJPY|EURJPY)/i.test(String(symbol||''));
const isWeekendBtcSymbol=symbol=>/^BTCUSD/i.test(String(symbol||''));
function weekendBtcTestEnabled(){try{return localStorage.getItem(profileSettingKey(WEEKEND_BTC_TEST_KEY))==='true';}catch{return false;}}
function saveWeekendBtcTest(enabled){try{localStorage.setItem(profileSettingKey(WEEKEND_BTC_TEST_KEY),enabled?'true':'false');}catch{}}
function configuredTradeSymbols(){
 const symbols=data?.tradeSymbols;
 return Array.isArray(symbols)&&symbols.length?symbols:null;
}
function isGotoSymbol(symbol){
 const configured=configuredTradeSymbols();
 const isConfigured=configured?configured.includes(symbol):isCoreGotoSymbol(symbol);
 return isConfigured&&(!isWeekendBtcSymbol(symbol)||weekendBtcTestEnabled());
}
function syncSelectOptions(select,options,selectedValue){
 if(!select)return;
 const same=select.options.length===options.length&&options.every((option,index)=>{
  const current=select.options[index];
  return current?.value===option.value&&current?.text===option.text;
 });
 if(!same)select.replaceChildren(...options.map(option=>new Option(option.text,option.value)));
 if(selectedValue!==undefined&&[...select.options].some(option=>option.value===selectedValue)&&select.value!==selectedValue)select.value=selectedValue;
}
function tradeSymbolLabel(symbol){
 if(isWeekendBtcSymbol(symbol))return 'BTC（週末テスト・'+symbol+'）';
 const base=(String(symbol||'').match(/[A-Z]{6}/i)||[])[0];
 if(base&&/^[A-Z]{6}$/i.test(base))return base.slice(0,3).toUpperCase()+'/'+base.slice(3).toUpperCase()+'（'+symbol+'）';
 return symbol;
}
function syncTradeSymbolOptions(){
 const select=$('tradeSymbol'),gotobi=marketList(data).filter(m=>isGotoSymbol(m.symbol));
 const btcToggle=$('weekendBtcTest');
 if(btcToggle)btcToggle.checked=weekendBtcTestEnabled();
 const previewSelected=TRADINGVIEW_SYMBOL_CATALOG.some(item=>item.symbol===selectedTradeSymbol);
 if(gotobi.length&&!gotobi.some(m=>m.symbol===selectedTradeSymbol)&&!previewSelected)selectedTradeSymbol=gotobi[0].symbol;
 if(gotobi.length){
  const options=gotobi.map(m=>({text:tradeSymbolLabel(m.symbol),value:m.symbol}));
  if(previewSelected)options.unshift({text:tradeSymbolLabel(selectedTradeSymbol)+'（TVプレビュー）',value:selectedTradeSymbol});
  syncSelectOptions(select,options,selectedTradeSymbol);
 }
}
function syncIndicatorSymbolOptions(){
 const select=$('indicatorSymbol'),markets=marketList(data).filter(m=>!isWeekendBtcSymbol(m.symbol)||weekendBtcTestEnabled()),previous=select.value;
 if(markets.length){
  const selected=markets.some(m=>m.symbol===previous)?previous:markets[0].symbol;
  syncSelectOptions(select,markets.map(m=>({text:m.symbol,value:m.symbol})),selected);
 }
 syncIndicatorPresetSymbolOptions();
}
function selectedMarket(){
 return marketList(data).find(m=>m.symbol===selectedTradeSymbol)||null;
}
function isTradingViewCatalogSymbol(symbol){return TRADINGVIEW_SYMBOL_CATALOG.some(item=>item.symbol===symbol);}
function marketForSymbol(symbol){return marketList(data).find(m=>m.symbol===symbol)||null;}
function currentPositionPips(position){
 const open=Number(position.openPrice),market=marketForSymbol(position.symbol);
 if(!market||!Number.isFinite(open)||open<=0)return null;
 const current=position.side==='BUY'?market.bid:market.ask;
 const pips=(position.side==='BUY'?current-open:open-current)/pipSize(position.symbol,market);
 return Number.isFinite(pips)?pips:null;
}
function pipsText(rows){
 if(!rows.length)return '--';
 const values=rows.map(currentPositionPips);
 if(values.some(value=>value===null))return '--';
 const total=values.reduce((sum,value)=>sum+value,0);
 return (total>=0?'+':'')+total.toFixed(1)+' pips';
}
function setPipsValue(element,rows){
 if(!element)return;
 const text=pipsText(rows);
 element.textContent=text;
 element.classList.remove('positive','negative');
 if(text!=='--')element.classList.add(text.startsWith('-')?'negative':'positive');
}
function levelsFromPips(side,slPips,tpPips,market){
 const pip=pipSize(market.symbol,market),current=side==='BUY'?market.ask:market.bid;
 return {
  stopLoss:slPips>0?Number((current+(side==='BUY'?-1:1)*slPips*pip).toFixed(8)):0,
  takeProfit:tpPips>0?Number((current+(side==='BUY'?1:-1)*tpPips*pip).toFixed(8)):0
 };
}

const money=n=>n===null?'未確認':new Intl.NumberFormat('ja-JP',{
 style:'currency',
 currency:data.currency,
 signDisplay:'always',
 maximumFractionDigits:data.currency==='JPY'?0:2
}).format(Math.abs(n)<1e-8?0:n);
const balanceMoney=n=>Number.isFinite(n)?new Intl.NumberFormat('ja-JP',{style:'currency',currency:data.currency,maximumFractionDigits:data.currency==='JPY'?0:2}).format(n):'--';
const visible=()=>data.positions.filter(p=>!$('symbol').value||p.symbol===$('symbol').value);
const chosen=()=>data.positions.filter(p=>selected.has(p.id));
const closeTargets=kind=>C.closeTargets(data.positions,kind);
const sumText=a=>a.net===null?'純損益 未確認（手数料未確認を含む）':'純損益 '+money(a.net);

function amount(el,n){
 el.textContent=money(n);
 el.classList.remove('positive','negative');
 if(n!==null)el.classList.add(n>=0?'positive':'negative');
}

function updateBalance(){
 const value=$('balanceValue'),toggle=$('toggleBalance');
 const equityValue=$('equityValue'),equityFloatingValue=$('equityFloatingValue');
 const floatingSummary=C.sum(data.positions||[]),floating=floatingSummary.net;
 const equity=Number.isFinite(Number(data.equity))?Number(data.equity):Number.isFinite(Number(data.balance))&&floating!==null?Number(data.balance)+floating:null;
 const showingEquity=balanceView==='equity';
 const label=$('balanceLabel');
 if(label)label.textContent=showingEquity?'有効証拠金':'残高';
 if(value){
  value.textContent=balanceHidden?'••••••':balanceMoney(showingEquity?equity:data.balance);
  value.classList.toggle('is-hidden',balanceHidden);
 }
 if(toggle){
  toggle.setAttribute('aria-label',balanceHidden?'金額を表示する':'金額を非表示にする');
  toggle.setAttribute('aria-pressed',balanceHidden?'true':'false');
 }
 if(equityValue){
  equityValue.textContent=balanceHidden?'••••••':balanceMoney(equity);
  equityValue.classList.toggle('is-hidden',balanceHidden);
 }
 if(equityFloatingValue){
  equityFloatingValue.textContent=balanceHidden?'••••••':(floating===null?'--':money(floating));
  equityFloatingValue.classList.remove('positive','negative','is-hidden');
  if(balanceHidden)equityFloatingValue.classList.add('is-hidden');
  else if(floating!==null)equityFloatingValue.classList.add(floating<0?'negative':'positive');
 }
 if($('lotCalculatorDialog')?.open)calculateLot();
}

function symbols(){
 const select=$('symbol');
 select.replaceChildren(new Option('すべて',''));
 [...new Set(data.positions.map(p=>p.symbol))].forEach(symbol=>select.add(new Option(symbol,symbol)));
 if(document.body?.dataset.appPage==='symbols')renderCurrencyList();
}

function canCreateCloseCommand(items=chosen()){
 const freshLive=!data.live||((Date.now()/1000-liveReceivedAt)<=10);
 return isLiveSource(data.source)&&data.schema===2&&data.tradeMode==='demo'&&connectionKey()&&freshLive&&items.length>0;
}

function canCreateOrder(){
 const freshLive=!data.live||((Date.now()/1000-liveReceivedAt)<=10);
 const market=selectedMarket();
 return isLiveSource(data.source)&&data.schema===2&&data.tradeMode==='demo'&&connectionKey()&&freshLive&&(!!market||isTradingViewCatalogSymbol(selectedTradeSymbol));
}
function canSendLiveCommand(){
 const freshLive=!data.live||((Date.now()/1000-liveReceivedAt)<=10);
 return isLiveSource(data.source)&&data.schema===2&&data.tradeMode==='demo'&&connectionKey()&&freshLive;
}

function canRestartVps(){
 return !vpsRestartInFlight&&navigator.onLine&&canSendLiveCommand()&&/^\d{4,20}$/.test(String(data.account||''));
}

function updateVpsUi(){
 const panel=$('vpsPanel'),button=$('restartVps'),status=$('vpsStatus');
 if(!panel||!button||!status)return;
 panel.dataset.state=vpsRestartInFlight?'busy':canRestartVps()?'online':'idle';
 button.disabled=!canRestartVps();
 if(vpsRestartInFlight){status.textContent='再起動指示を送信済みです。VPSの再起動完了と'+currentPlatform()+'／EAの再接続を待っています。';return;}
 if(!navigator.onLine){status.textContent='通信オフラインのため操作できません。';return;}
 if(!connectionKey()){status.textContent=currentPlatform()+'デモ接続後に操作できます。';return;}
 if(!canSendLiveCommand()){status.textContent=currentPlatform()+'の最新データを受信してから操作できます。';return;}
 status.textContent='VPS側の自動起動セットアップが済んでいる場合に使用できます。';
}

function canClose(items){
 return !closeInFlight&&navigator.onLine&&items.length>0&&(data.source==='demo'||(items.length<=100&&canCreateCloseCommand(items)));
}

function setCloseBusy(busy,label='送信中…'){
 closeInFlight=busy;
 const button=$('execute');
 button.disabled=busy;
 button.setAttribute('aria-busy',busy?'true':'false');
 summary();
 if(busy)button.textContent=label;
}

function setOrderBusy(busy,label='注文送信中…'){
 orderInFlight=busy;
 for(const id of ['orderBuy','orderSell']){
  const button=$(id);
  if(!button)continue;
  button.disabled=busy||!canCreateOrder();
  button.setAttribute('aria-busy',busy?'true':'false');
 }
 if(busy&&$('orderExecute'))$('orderExecute').textContent=label;
}
function setNanpinBusy(busy){
 nanpinInFlight=busy;
 const button=$('nanpinSave');
 if(!button)return;
 button.disabled=busy||!canSendLiveCommand();
 button.setAttribute('aria-busy',busy?'true':'false');
 if(busy)button.textContent='設定を送信中…';else button.textContent='設定をEAへ送信';
}
function setNanpinStatus(text){
 const status=$('nanpinStatus');
 if(status)status.textContent=text;
}
function setModifyBusy(busy){
 modifyInFlight=busy;
 const button=$('modifySelected');
 const buttons=[button,...document.querySelectorAll('[data-position-modify]')].filter(Boolean);
 if(!buttons.length)return;
 buttons.forEach(item=>{
  const position=item.dataset.positionId?data.positions.find(position=>String(position.id)===item.dataset.positionId):null;
  item.disabled=busy||!(position?canCreateCloseCommand([position]):canCreateCloseCommand(chosen()));
  item.setAttribute('aria-busy',busy?'true':'false');
  item.textContent=busy?'SL／TPを送信中…':position?'TP／SLを設定':'選択分のSL／TPを設定';
 });
}

async function fetchJsonWithTimeout(url,options={},timeoutMs=6000){
 const controller=new AbortController();
 const timeout=setTimeout(()=>controller.abort(),timeoutMs);
 try{
  const response=await fetch(url,{...options,signal:controller.signal});
  const body=await response.json().catch(()=>({}));
  if(!response.ok)throw Error(body.error||'通信エラー '+response.status);
  return body;
 }finally{clearTimeout(timeout);}
}

function commandResultMessage(result){
 const text=String(result?.result?.text||'');
 const platform=currentPlatform();
 const reason=(text.match(/(?:^|\n)reason=(.+)$/im)||[])[1]?.trim();
 if(text.includes('type=restart_vps'))return result.status==='completed'?'VPS再起動を受け付けました。約30秒後にWindowsが再起動し、設定済みならMT4／MT5とEAが自動起動します。':'VPS再起動を実行できませんでした。VPS側のBATとエージェントの稼働状態を確認してください。';
 if(text.includes('type=nanpin_settings'))return result.status==='completed'?'ナンピン設定をEAへ反映しました。':'ナンピン設定をEAへ反映できませんでした。EAの設定と結果ファイルを確認してください。';
 if(text.includes('type=modify_position'))return result.status==='completed'?`選択ポジションのSL／TPを${platform}へ反映しました。次の更新で現在値を確認できます。`:`SL／TPの変更に失敗しました。${platform}の最小距離やEAの結果を確認してください。`;
 if(text.includes('type=market_order')){
  if(text.includes('opened=1'))return `${platform}でデモ成行注文が完了しました。次の更新でポジションを確認できます。`;
  if(text.includes('accepted=1'))return `${platform}が注文を受け付けました。約定結果は次の更新で確認できます。`;
  const description=(text.match(/description=(.+)$/i)||[])[1]?.trim();
  const retcode=(text.match(/retcode=(\d+)/i)||[])[1];
  return `${platform}が注文を拒否しました`+(retcode?'（コード '+retcode+'）':'')+(description?'：'+description:`。${platform}側の結果を確認してください。`);
 }
 if(text.includes('type=indicator_order'))return result.status==='completed'?`${platform}にBuy Stop／Sell Stopを設置しました。片方が約定すると反対側を自動キャンセルします。`:'指標トレードの逆指値設置に失敗しました。'+(reason?'理由：'+reason:`${platform}の結果を確認してください。`);
 if(text.includes('type=indicator_reverse_4line'))return result.status==='completed'?`${platform}にS2／S1／B1／B2の4ライン予約注文を設置しました。約定方向に応じて反対側を自動キャンセルします。`:'逆張り4ライン予約注文の設置に失敗しました。'+(reason?'理由：'+reason:`${platform}の結果を確認してください。`);
 if(text.includes('10027')||text.includes('auto trading disabled'))return `${platform}が決済を拒否しました：自動売買を有効にしてください。`;
 if(text.includes('succeeded=0'))return `${platform}は指示を受信しましたが、決済は0件でした。${platform}側の結果を確認してください。`;
 return result.status==='completed'?`${platform}で決済処理が完了しました。次の更新で結果を確認できます。`:`${platform}が決済指示を拒否しました。`;
}

function indicatorResultMessage(result){
 const text=String(result?.result?.text||'');
 const platform=currentPlatform();
 const reason=(text.match(/(?:^|\n)reason=(.+)$/im)||[])[1]?.trim();
 if(result.status==='completed'){
  if(text.includes('type=indicator_market_hedge'))return `${platform}でBUY／SELLの両建て成行注文が完了しました。ポジション一覧で損益とpipsを確認できます。`;
  if(text.includes('type=indicator_order'))return `${platform}にBuy Stop／Sell Stopを設置しました。片方が約定すると反対側を自動キャンセルします。`;
  if(text.includes('type=indicator_reverse_4line'))return `${platform}にS2／S1／B1／B2の4ライン予約注文を設置しました。`;
  return '指標予約の処理が完了しました。次の更新で逆指値を確認できます。';
 }
 return `指標注文を${platform}が拒否しました。`+(reason?'理由：'+reason:'EA側の結果を確認してください。');
}

function indicatorCancelResultMessage(result){
 const text=String(result?.result?.text||'');
 const platform=currentPlatform();
 const reason=(text.match(/(?:^|\n)reason=(.+)$/im)||[])[1]?.trim();
 if(result.status==='completed'){
  const cancelled=(text.match(/cancelled=(\d+)/)||[])[1];
  return cancelled==='0'?'予約を取り消しました。設置済みの指標注文はありません。':`${platform}の指標注文をキャンセルしました。`;
 }
 return `指標注文のキャンセルを${platform}が拒否しました。`+(reason?'理由：'+reason:'EA側の結果を確認してください。');
}

function commandSendErrorMessage(error,kind='決済'){
 const platform=currentPlatform();
 if(error==='snapshot_mismatch')return `${platform}の情報が更新中でした。最新の保有ポジションを確認してから、もう一度だけ決済指示を送ってください。`;
 if(error==='position_not_found')return `対象ポジションは${platform}上ですでに変化しています。画面が更新されてから確認してください。`;
 if(error==='command_pending')return 'すでに別の指示を処理中です。結果が表示されるまでお待ちください。';
 if(error==='invalid_order')return '注文条件を確認してください。銘柄・ロット・SL／TP・市場価格が有効か確認してください。';
 if(error==='invalid_nanpin_settings')return 'ナンピン幅・ロット（最大5.00）・一括利確pipsの設定を確認してください。';
 if(error==='invalid_position_levels')return 'SL／TPのpips距離を0以上で入力してください。';
 if(error==='invalid_order_levels')return 'SL／TPのpips距離を確認してください。BUYはSLが下・TPが上、SELLはSLが上・TPが下になります。';
 return kind+'指示を送信できません：'+error;
}

async function waitForCommandResult(commandId,key,kind='close'){
 for(let attempt=0;attempt<COMMAND_RESULT_MAX_ATTEMPTS;attempt++){
  try{
   const result=await fetchJsonWithTimeout(COMMAND_ENDPOINT+'?id='+encodeURIComponent(commandId),{headers:{Authorization:'Bearer '+key},cache:'no-store'},2500);
   if(result.status==='completed'||result.status==='rejected'){
    $('message').textContent=commandResultMessage(result);
    if(kind==='nanpin'&&result.status==='completed'){
     const settings=readNanpinSettings();
     localStorage.setItem(profileSettingKey(NANPIN_SETTINGS_KEY),JSON.stringify({...settings,applied:true}));
     setNanpinStatus('EA反映済み：幅 '+settings.widthPips+' pips / '+settings.lots.toFixed(2)+' lot / 利確 '+settings.takeProfitPips+' pips');
    }else if(kind==='nanpin')setNanpinStatus('EAへの反映に失敗');
    if(kind==='modify'){
     const modifiedPositionIds=Array.isArray(pendingModify?.positionIds)?[...pendingModify.positionIds]:[];
     modifyInFlight=false;
     if(result.status==='completed')clearPositionLevelDrafts(modifiedPositionIds);
     pendingModify=null;
     const status=$('modifyStatus');
     if(status)status.textContent=result.status==='completed'?'EA反映済み：SL／TPを更新しました':'EAへの反映に失敗しました';
    }
    if(kind==='vps'){
     // Keep the button locked for this page session after a successful
     // restart is scheduled, so a second reboot cannot be queued during the
     // 30-second shutdown delay.
     vpsRestartInFlight=result.status==='completed';
     updateVpsUi();
     const status=$('vpsStatus');
     if(status)status.textContent=result.status==='completed'?'再起動指示を受け付けました。VPSの復旧とMT4／MT5・EAの自動起動を待っています。':'VPS再起動の実行に失敗しました。VPS側のエージェントを確認してください。';
    }
    if(kind==='indicator')$('indicatorStatus').textContent=indicatorResultMessage(result);
    else if(kind==='reverseIndicator')$('reverseStatus').textContent=indicatorResultMessage(result);
    else if(kind==='indicatorCancel')$('indicatorStatus').textContent=indicatorCancelResultMessage(result);
    else if(kind==='order')setOrderBusy(false);else if(kind==='nanpin')setNanpinBusy(false);else if(kind==='modify')setModifyBusy(false);else if(kind!=='vps')setCloseBusy(false);
    pollLive();
    return;
   }
  }catch(err){
   // MT5側の約定中や一時的な通信遅延では、指示を再送せず結果だけ待つ。
  }
  await new Promise(resolve=>setTimeout(resolve,COMMAND_RESULT_POLL_MS));
 }
 $('message').textContent=currentPlatform()+'の処理結果を確認できません。'+currentPlatform()+'のチャートと結果ファイルを確認してください。';
 if(kind==='indicator')$('indicatorStatus').textContent=currentPlatform()+'の処理結果を確認できません。EAの稼働状態を確認してください。';
 else if(kind==='reverseIndicator')$('reverseStatus').textContent=currentPlatform()+'の4ライン設置結果を確認できません。EAの稼働状態を確認してください。';
 else if(kind==='order')setOrderBusy(false);else if(kind==='nanpin')setNanpinBusy(false);else if(kind==='vps'){vpsRestartInFlight=false;const status=$('vpsStatus');if(status)status.textContent='再起動指示の結果を確認できません。VPS側のエージェントとWindowsの状態を確認してください。';updateVpsUi();}else setCloseBusy(false);
}

function openVpsRestartConfirm(){
 closeMenu();
 if(!canRestartVps()){
  const status=$('vpsStatus');
  if(status)status.textContent=currentPlatform()+'デモの最新データを受信してから操作してください。';
  return;
 }
 const account=String(data.account||'');
 const text=$('vpsRestartConfirmText');
 if(text)text.textContent='口座 '+account+' に紐づくWindows VPSを再起動します。MT4／MT5とEAは一時停止し、約30秒後にWindowsを再起動します。';
 $('vpsRestartConfirm').showModal();
}

async function sendVpsRestart(){
 const key=connectionKey();
 if(!canRestartVps()){
  $('vpsRestartConfirm').close();
  const status=$('vpsStatus');
  if(status)status.textContent=currentPlatform()+'デモの最新データを受信してから操作してください。';
  return;
 }
 vpsRestartInFlight=true;
 updateVpsUi();
 $('vpsRestartConfirm').close();
 $('message').textContent='VPS再起動指示を送信中です。';
 try{
  const body=await fetchJsonWithTimeout(COMMAND_ENDPOINT,{method:'POST',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify({action:'restart_vps',account:data.account,snapshotGeneratedAt:Math.floor(data.generatedAt)})},6000);
  const status=$('vpsStatus');
  if(status)status.textContent='再起動指示を送信しました。VPS側のエージェントが約30秒後に再起動します。';
  waitForCommandResult(body.commandId,key,'vps');
 }catch(err){
  vpsRestartInFlight=false;
  const status=$('vpsStatus');
  if(status)status.textContent=err.name==='AbortError'?'VPS再起動指示を送信できません：通信がタイムアウトしました':commandSendErrorMessage(err.message,'VPS再起動');
  $('message').textContent=status?.textContent||'VPS再起動指示を送信できません。';
  updateVpsUi();
 }
}

function updateChartWatermark(elementId,symbol,timeframe){
 const element=$(elementId);
 if(element)element.textContent=(symbol||'--')+' · '+timeframe;
}
function updateChartCompactSymbol(elementId,symbol){
 const element=$(elementId);
 if(element)element.textContent=String(symbol||'--').replace(/z$/i,'');
}
function updateChartTimeframeUi(){
 document.querySelectorAll('[data-timeframe]').forEach(button=>button.classList.toggle('is-active',button.dataset.timeframe===chartTimeframe));
 document.querySelectorAll('[data-indicator-timeframe]').forEach(button=>button.classList.toggle('is-active',button.dataset.indicatorTimeframe===indicatorChartTimeframe));
 const marketTap=$('marketChartTimeframeTap'),indicatorTap=$('indicatorChartTimeframeTap');
 if(marketTap)marketTap.textContent=chartTimeframe;
 if(indicatorTap)indicatorTap.textContent=indicatorChartTimeframe;
}
function closeChartTimeframePickers(){
 ['marketChartTimeframePicker','indicatorChartTimeframePicker'].forEach(id=>{
  const picker=$(id);if(picker)picker.hidden=true;
 });
 ['marketChartTimeframeTap','indicatorChartTimeframeTap'].forEach(id=>$(id)?.setAttribute('aria-expanded','false'));
}
function setChartTimeframe(mode,timeframe){
 if(!CHART_TIMEFRAMES.includes(timeframe))return;
 closeChartTimeframePickers();
 if(mode==='indicator'){indicatorChartTimeframe=timeframe;updateIndicatorMarket();}
 else{chartTimeframe=timeframe;updateMarket();}
}
function setupChartTimeframeControls(){
 const controls=[
  {mode:'goto',tapId:'marketChartTimeframeTap',pickerId:'marketChartTimeframePicker',surface:'market'},
  {mode:'indicator',tapId:'indicatorChartTimeframeTap',pickerId:'indicatorChartTimeframePicker',surface:'indicator'}
 ];
 controls.forEach(({mode,tapId,pickerId,surface:surfaceName})=>{
  const tap=$(tapId),picker=$(pickerId);
  if(!tap||!picker)return;
  const surface=document.querySelector('[data-chart-surface="'+surfaceName+'"]');
  let chartTapStart=null;
  const openPicker=()=>{closeChartTimeframePickers();picker.hidden=false;tap.setAttribute('aria-expanded','true');updateChartTimeframeUi();};
  const wheelAngles=[280,320,0,40,80,120,160,200,240];
  const timeframeButtons=CHART_TIMEFRAMES.map((timeframe,index)=>{
   const button=document.createElement('button');
   button.type='button';
   if(mode==='indicator')button.dataset.indicatorTimeframe=timeframe;
   else button.dataset.timeframe=timeframe;
   button.setAttribute('role','menuitem');button.textContent=timeframe;
   button.style.setProperty('--wheel-angle',wheelAngles[index]+'deg');
   button.onclick=event=>{event.stopPropagation();setChartTimeframe(mode,timeframe);};
   return button;
  });
  const center=document.createElement('button');
  center.type='button';center.className='chart-timeframe-center';center.setAttribute('role','menuitem');center.setAttribute('aria-label','時間足メニューを閉じる');center.textContent='×';
  center.onclick=event=>{event.stopPropagation();closeChartTimeframePickers();};
  picker.replaceChildren(...timeframeButtons,center);
  tap.onclick=event=>{
   event.preventDefault();event.stopPropagation();
   const next=picker.hidden;
   closeChartTimeframePickers();
   picker.hidden=!next;tap.setAttribute('aria-expanded',String(!next));
   updateChartTimeframeUi();
  };
  if(surface){
   surface.addEventListener('pointerdown',event=>{
    if(event.button!==0||event.target?.closest?.('.chart-timeframe-tap,.chart-timeframe-picker,.chart-attribution'))return;
    const rect=surface.getBoundingClientRect(),x=event.clientX-rect.left;
    if(x>rect.width-84)return;
    chartTapStart={pointerId:event.pointerId,x:event.clientX,y:event.clientY,wasOpen:!picker.hidden};
   });
   surface.addEventListener('pointermove',event=>{
    if(chartTapStart?.pointerId===event.pointerId&&Math.hypot(event.clientX-chartTapStart.x,event.clientY-chartTapStart.y)>10)chartTapStart=null;
   });
   surface.addEventListener('pointerup',event=>{
    if(chartTapStart?.pointerId!==event.pointerId)return;
    const wasOpen=chartTapStart.wasOpen;chartTapStart=null;
    if(!event.target?.closest?.('.chart-timeframe-tap,.chart-timeframe-picker,.chart-attribution')){if(wasOpen)closeChartTimeframePickers();else openPicker();}
   });
   surface.addEventListener('pointercancel',()=>{chartTapStart=null;});
  }
 });
 document.querySelectorAll('[data-timeframe]').forEach(button=>button.onclick=()=>setChartTimeframe('goto',button.dataset.timeframe));
 document.querySelectorAll('[data-indicator-timeframe]').forEach(button=>button.onclick=()=>setChartTimeframe('indicator',button.dataset.indicatorTimeframe));
 document.addEventListener('pointerdown',event=>{
  if(!event.target?.closest?.('.chart-wrap,.chart-timeframe-tap,.chart-timeframe-picker'))closeChartTimeframePickers();
 },{capture:true});
 updateChartTimeframeUi();
}

function renderMarketOrderLabels(market){
 const sell=$('orderSell'),buy=$('orderBuy');
 if(!sell||!buy)return;
 if(!market){
  sell.textContent='成行 SELL';
  buy.textContent='成行 BUY';
  return;
 }
 sell.replaceChildren();buy.replaceChildren();
 const sellSide=document.createElement('span'),sellPrice=document.createElement('strong');
 sellSide.textContent='SELL';sellPrice.textContent=marketPrice(market.bid,market);
 const buySide=document.createElement('span'),buyPrice=document.createElement('strong');
 buySide.textContent='BUY';buyPrice.textContent=marketPrice(market.ask,market);
 sell.append(sellSide,sellPrice);buy.append(buySide,buyPrice);
}

function updateMarket(){
 const market=selectedMarket();
 renderMarketOrderLabels(market);
 $('marketLive').textContent=currentPlatform()+'価格';
 updateChartWatermark('marketChartWatermark',market?.symbol||selectedTradeSymbol,chartTimeframe);
 updateChartCompactSymbol('marketChartSymbolCompact',market?.symbol||selectedTradeSymbol);
 updateChartTimeframeUi();
 $('marketPanel').hidden=false;
 $('tradeSymbol').value=selectedTradeSymbol;
 $('marketSymbol').textContent=selectedTradeSymbol;
 $('tradeSymbolLabel').textContent=isWeekendBtcSymbol(selectedTradeSymbol)?'週末テスト銘柄':'ゴトー日 通貨ペア';
 $('marketTestNote').hidden=!isWeekendBtcSymbol(selectedTradeSymbol);
 if(!market){
  $('marketQuote').textContent=isTradingViewCatalogSymbol(selectedTradeSymbol)?'TradingViewプレビュー（注文時の口座価格はEAから取得）':'EA最新版からドル円／ユーロ円、または有効化したBTCテストの価格を受信してください';
  $('marketPrice').textContent='--';
  if(isTradingViewCatalogSymbol(selectedTradeSymbol))showTradingViewChartPreview('marketChart','chartEmpty',selectedTradeSymbol);
  else{$('chartEmpty').hidden=false;$('chartEmpty').textContent='ゴトー日通貨ペアの価格待ち（EA設定を確認）';}
  setOrderBusy(orderInFlight);
  return;
 }
 $('marketSymbol').textContent=market.symbol;
 const spread=Math.max(0,market.ask-market.bid);
 $('marketPrice').textContent=marketPrice((market.bid+market.ask)/2,market);
 $('marketQuote').textContent='Bid '+marketPrice(market.bid,market)+'  /  Ask '+marketPrice(market.ask,market)+'  /  Spread '+marketPrice(spread,market);
 const available=Array.isArray(market.charts?.[chartTimeframe]);
 if(!available){
  drawChartFor('marketChart','chartEmpty',market,chartTimeframe);
  $('chartEmpty').hidden=false;
  $('chartEmpty').textContent='選択した時間足のチャートを受信していません';
  setOrderBusy(orderInFlight);
  return;
 }
 drawChart();
 setOrderBusy(orderInFlight);
}

function updateIndicatorMarket(){
 const panel=$('indicatorMarketPanel'),symbol=$('indicatorSymbol').value,market=marketForSymbol(symbol);
 const liveLabel=$('indicatorMarketLive');if(liveLabel)liveLabel.textContent=currentPlatform()+'価格';
 updateChartWatermark('indicatorChartWatermark',market?.symbol||symbol,indicatorChartTimeframe);
 updateChartCompactSymbol('indicatorChartSymbolCompact',market?.symbol||symbol);
 updateChartTimeframeUi();
 if(!market&&data.source==='demo'){
  panel.hidden=true;
  return;
 }
 panel.hidden=false;
 $('indicatorMarketSymbol').textContent=symbol;
 if(!market){
  $('indicatorMarketQuote').textContent='EAから選択銘柄の価格を受信してください';
  $('indicatorMarketPrice').textContent='--';
  drawChartFor('indicatorMarketChart','indicatorChartEmpty',null,indicatorChartTimeframe);
  $('indicatorChartEmpty').hidden=false;
  $('indicatorChartEmpty').textContent='選択した銘柄の価格待ち（EAの銘柄設定を確認）';
  return;
 }
 const bars=market.charts?.[indicatorChartTimeframe];
 const spread=Math.max(0,market.ask-market.bid);
 $('indicatorMarketPrice').textContent=marketPrice((market.bid+market.ask)/2,market);
 $('indicatorMarketQuote').textContent='Bid '+marketPrice(market.bid,market)+'  /  Ask '+marketPrice(market.ask,market)+'  /  Spread '+marketPrice(spread,market);
 if(!Array.isArray(bars)||bars.length<2){
  drawChartFor('indicatorMarketChart','indicatorChartEmpty',market,indicatorChartTimeframe);
  $('indicatorChartEmpty').hidden=false;
  $('indicatorChartEmpty').textContent='選択した時間足のチャートを受信していません';
  return;
 }
 drawChartFor('indicatorMarketChart','indicatorChartEmpty',market,indicatorChartTimeframe);
}

function chartLine(ctx,x1,y1,x2,y2,color,dash=[]){ctx.save();ctx.strokeStyle=color;ctx.setLineDash(dash);ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();ctx.restore();}
function chartPositionLevel(position,key){
 if(chartLevelDraft?.positionId===position.id&&Number(chartLevelDraft[key])>0)return Number(chartLevelDraft[key]);
 return Number(position[key])||0;
}
function pipsForChartLevel(position,level,key,market){
 if(!Number.isFinite(level)||level<=0)return 0;
 const open=Number(position.openPrice),pip=pipSize(position.symbol,market);
 if(!Number.isFinite(open)||open<=0||!Number.isFinite(pip)||pip<=0)return 0;
 const raw=key==='stopLoss'
  ?(position.side==='BUY'?(open-level):(level-open))
  :(position.side==='BUY'?(level-open):(open-level));
 return Math.max(0,raw/pip);
}
function signedPipsForChartLevel(position,level,market){
 if(!Number.isFinite(level)||level<=0)return null;
 const open=Number(position.openPrice),pip=pipSize(position.symbol,market);
 if(!Number.isFinite(open)||open<=0||!Number.isFinite(pip)||pip<=0)return null;
 const signed=(position.side==='BUY'?level-open:open-level)/pip;
 return Number.isFinite(signed)?signed:null;
}
function chartLevelPipsText(position,level,market){
 const pips=signedPipsForChartLevel(position,level,market);
 return pips===null?'--':(pips>=0?'+':'')+pips.toFixed(1)+' pips';
}
function updateChartLevelAction(){
 const action=$('chartLevelAction'),indicatorAction=$('indicatorChartLevelAction');if(!action||!indicatorAction)return;
 if(!chartLevelDraft){action.hidden=true;indicatorAction.hidden=true;return;}
 const position=data.positions.find(item=>item.id===chartLevelDraft.positionId),market=position&&marketForSymbol(position.symbol);
 if(!position||!market){chartLevelDraft=null;action.hidden=true;indicatorAction.hidden=true;return;}
 const sl=pipsForChartLevel(position,chartLevelDraft.stopLoss,'stopLoss',market),tp=pipsForChartLevel(position,chartLevelDraft.takeProfit,'takeProfit',market);
 const text=position.symbol+' '+position.side+' / SL '+(chartLevelDraft.stopLoss?sl.toFixed(1)+' pips':'なし')+' / TP '+(chartLevelDraft.takeProfit?tp.toFixed(1)+' pips':'なし');
 $('chartLevelText').textContent=text;$('indicatorChartLevelText').textContent=text;
 action.hidden=activeMode!=='goto';indicatorAction.hidden=activeMode!=='indicator';
}
function redrawTradeCharts(){
 drawChart();
 if(!$('indicatorMarketPanel').hidden)updateIndicatorMarket();
 updateChartLevelAction();
}
function drawChart(){
 drawChartFor('marketChart','chartEmpty',selectedMarket(),chartTimeframe);
}
function chartEntryPrice(position){
 const value=Number(position?.openPrice??position?.entryPrice??position?.open_price);
 return Number.isFinite(value)&&value>0?value:0;
}
function chartPositionsFor(market){
 return data.positions.filter(position=>position.symbol===market.symbol&&(
  chartEntryPrice(position)>0||
  chartPositionLevel(position,'stopLoss')>0||
  chartPositionLevel(position,'takeProfit')>0
 ));
}
function reverseChartLevelsForMarket(market){
 const mode=selectedIndicatorEntryMode();
 if(activeMode!=='indicator'||!market||selectedIndicatorOrderStyle()!=='reverse'||(mode!=='scheduled'&&mode!=='immediate')||String($('indicatorSymbol')?.value||'')!==String(market.symbol||''))return [];
 const pip=pipSize(market.symbol,market),bid=Number(market.bid),ask=Number(market.ask);
 const inner=Number($('reverseInnerDistance')?.value),outer=Number($('reverseOuterDistance')?.value);
 if(!Number.isFinite(pip)||pip<=0||!Number.isFinite(bid)||!Number.isFinite(ask)||!Number.isFinite(inner)||inner<=0||!Number.isFinite(outer)||outer<=inner)return [];
 const base=(bid+ask)/2;
 return [
  {reverse:true,key:'S2',side:'SELL',label:'S2 SELL LIMIT',color:'#3b82f6',value:base+outer*pip},
  {reverse:true,key:'S1',side:'SELL',label:'S1 SELL LIMIT',color:'#3b82f6',value:base+inner*pip},
  {reverse:true,key:'基準価格',side:'BASE',label:'基準価格',color:'#d7e5f3',value:base},
  {reverse:true,key:'B1',side:'BUY',label:'B1 BUY LIMIT',color:'#ef4444',value:base-inner*pip},
  {reverse:true,key:'B2',side:'BUY',label:'B2 BUY LIMIT',color:'#ef4444',value:base-outer*pip}
 ].filter(level=>Number.isFinite(level.value)&&level.value>0);
}
function chartLevelIsApplied(position,key,value){
 const actual=Number(position?.[key]);
 return Number.isFinite(actual)&&Number.isFinite(value)&&Math.abs(actual-value)<=Math.max(pipSize(position?.symbol)*.05,0.00000001);
}
function destroyChartLayout(canvasId){
 const layout=chartLayouts.get(canvasId);
 if(layout?.mode==='tradingview'){
  try{layout.chart?.remove();}catch{}
 }
 chartLayouts.delete(canvasId);
}
function normalizedChartBars(bars){
 const normalized=[];
 for(const bar of bars||[]){
  const time=Math.floor(Number(bar.time)),open=Number(bar.open),high=Number(bar.high),low=Number(bar.low),close=Number(bar.close);
  if(!Number.isFinite(time)||!Number.isFinite(open)||!Number.isFinite(high)||!Number.isFinite(low)||!Number.isFinite(close))continue;
  const item={time,open,high,low,close};
  if(normalized.length&&time<=normalized[normalized.length-1].time){
   if(time===normalized[normalized.length-1].time)normalized[normalized.length-1]=item;
   continue;
  }
  normalized.push(item);
 }
 return normalized;
}
function addTradingViewCandles(chart,tv,options){
 if(typeof chart.addCandlestickSeries==='function')return chart.addCandlestickSeries(options);
 if(tv.CandlestickSeries&&typeof chart.addSeries==='function')return chart.addSeries(tv.CandlestickSeries,options);
 return null;
}
function addTradingViewLine(chart,tv,options){
 if(typeof chart.addLineSeries==='function')return chart.addLineSeries(options);
 if(tv.LineSeries&&typeof chart.addSeries==='function')return chart.addSeries(tv.LineSeries,options);
 return null;
}
function clearTradingViewLevels(layout){
 for(const level of layout.levels||[]){try{layout.series.removePriceLine(level.priceLine);}catch{}}
 for(const series of layout.scaleSeries||[]){try{layout.chart.removeSeries(series);}catch{}}
 layout.levels=[];
 layout.scaleSeries=[];
}
function clearChartLevelLabels(canvasId){
 const element=$(canvasId==='marketChart'?'marketChartLevelLabels':'indicatorChartLevelLabels');
 if(element)element.replaceChildren();
}
function renderChartLevelLabels(canvasId){
 const element=$(canvasId==='marketChart'?'marketChartLevelLabels':'indicatorChartLevelLabels');
 if(!element)return;
 element.replaceChildren();
 const layout=chartLayouts.get(canvasId);
 if(!layout)return;
 for(const level of layout.levels||[]){
  if(level.reverse){
   const y=chartLevelCoordinate(layout,level);if(!Number.isFinite(y))continue;
   const label=document.createElement('div');label.className='chart-level-label is-reverse '+(level.side==='SELL'?'is-reverse-sell':level.side==='BUY'?'is-reverse-buy':'is-reverse-base');label.textContent=level.label+' '+chartPrice(level.value,layout.market);label.style.top=y+'px';element.append(label);continue;
  }
  const position=data.positions.find(item=>item.id===level.positionId),y=chartLevelCoordinate(layout,level);
  if(!position||!Number.isFinite(y))continue;
  const label=document.createElement('div');
  const isEntry=level.key==='entry';
  label.className='chart-level-label '+(isEntry?'is-entry':(level.key==='stopLoss'?'is-sl':'is-tp'));
  label.textContent=isEntry
   ?position.side+' Entry '+chartPrice(level.value,layout.market)
   :(level.key==='stopLoss'?'SL':'TP')+' '+chartPrice(level.value,layout.market)+' '+chartLevelPipsText(position,level.value,layout.market);
  label.style.top=y+'px';
  element.append(label);
 }
}
function drawTradingViewChart(canvasId,host,empty,market,timeframe,bars){
 const tv=window.LightweightCharts;
 if(!tv?.createChart||!host)return false;
 const chartBars=normalizedChartBars(bars).slice(-Math.min(chartDisplayBars,bars.length));
 if(chartBars.length<2)return false;
 const rect=host.getBoundingClientRect(),width=Math.max(1,Math.floor(rect.width)),height=Math.max(1,Math.floor(rect.height));
 if(!width||!height)return false;
 let layout=chartLayouts.get(canvasId);
 const reusable=layout?.mode==='tradingview'&&layout.host===host&&layout.market?.symbol===market.symbol&&layout.timeframe===timeframe;
 if(!reusable){
  destroyChartLayout(canvasId);
  const ColorType=tv.ColorType||{},CrosshairMode=tv.CrosshairMode||{},LineStyle=tv.LineStyle||{};
  let chart=null,series=null;
  const priceScaleWidth=chartPriceScaleWidth(market);
  try{
   chart=tv.createChart(host,{width,height,
    layout:{background:{type:ColorType.Solid??0,color:'#0a1d36'},textColor:'#96b8d8',fontFamily:'system-ui'},
    grid:{vertLines:{visible:true,color:'#1b3654'},horzLines:{visible:true,color:'#1b3654'}},
    crosshair:{mode:CrosshairMode.Normal??0,vertLine:{color:'#5a89ac',width:1,style:LineStyle.Dashed??2,labelBackgroundColor:'#2d5d8d'},horzLine:{color:'#5a89ac',width:1,style:LineStyle.Dashed??2,labelBackgroundColor:'#2d5d8d'}},
    rightPriceScale:{visible:true,borderColor:'#47759f',minimumWidth:priceScaleWidth,entireTextOnly:false,alignLabels:true,scaleMargins:{top:.08,bottom:.1}},
    // TradingView描画では受信済みローソク足の時刻を常時表示する。
    // M1/M5は秒も表示して、短期足でも時刻を追えるようにする。
    timeScale:{borderColor:'#47759f',visible:true,timeVisible:true,secondsVisible:['M1','M5'].includes(timeframe),rightOffset:4,fixRightEdge:false,barSpacing:Math.max(7,Math.min(12,Math.round(width/Math.max(chartBars.length,1)*2.5)))},
    localization:{priceFormatter:value=>chartPrice(value,market)},
    handleScroll:{mouseWheel:true,pressedMouseMove:true,horzTouchDrag:true,vertTouchDrag:true},
    handleScale:{axisPressedMouseMove:true,mouseWheel:true,pinch:true}
   });
   const priceDigits=marketDigits(market);
   const priceFormat={type:'price',precision:priceDigits,minMove:Math.pow(10,-priceDigits)};
   series=addTradingViewCandles(chart,tv,{upColor:'#4ed8bd',downColor:'#ff8792',borderUpColor:'#4ed8bd',borderDownColor:'#ff8792',wickUpColor:'#4ed8bd',wickDownColor:'#ff8792',borderVisible:false,priceFormat,priceLineVisible:true,lastValueVisible:true});
   if(!series)throw Error('TradingViewのローソク足系列を作成できません');
  }catch(error){
   try{chart?.remove();}catch{}
   return false;
  }
  host.style.setProperty('--chart-price-axis-width',priceScaleWidth+'px');
  layout={mode:'tradingview',canvasId,host,market,timeframe,chart,series,levels:[],scaleSeries:[],initialized:false,priceScaleWidth};
  chartLayouts.set(canvasId,layout);
 }
 try{
  try{layout.chart.resize(width,height);}catch{}
  layout.series.setData(chartBars);
  clearTradingViewLevels(layout);
  const positions=chartPositionsFor(market),firstTime=chartBars[0].time,lastTime=chartBars[chartBars.length-1].time;
  const values=[];
  positions.forEach(position=>{
   const entry=chartEntryPrice(position);
   if(entry>0)values.push({position,key:'entry',color:'#50d47e',label:'Entry',value:entry});
   [['stopLoss','#ff7784','SL'],['takeProfit','#4de1c3','TP']].forEach(([key,color,label])=>{
    const value=chartPositionLevel(position,key);if(Number.isFinite(value)&&value>0)values.push({position,key,color,label,value});
   });
  });
  values.push(...reverseChartLevelsForMarket(market));
  for(const level of values){
   const scaleSeries=addTradingViewLine(layout.chart,tv,{color:'rgba(0,0,0,0)',lineWidth:1,lineVisible:true,priceLineVisible:false,lastValueVisible:false,crosshairMarkerVisible:false,priceFormat:{type:'price',precision:marketDigits(market),minMove:Math.pow(10,-marketDigits(market))}});
   if(scaleSeries){scaleSeries.setData([{time:firstTime,value:level.value},{time:lastTime,value:level.value}]);layout.scaleSeries.push(scaleSeries);}
  }
  if(!layout.initialized){
   layout.chart.timeScale().fitContent();
   layout.chart.timeScale().applyOptions({rightOffset:4});
   layout.initialized=true;
  }
  const LineStyle=tv.LineStyle||{};
  for(const level of values){
   let priceLine=null;
   try{priceLine=layout.series.createPriceLine({price:level.value,color:level.color,lineWidth:2,lineStyle:LineStyle.Dashed??2,lineVisible:true,axisLabelVisible:false,title:''});}catch{}
   const y=layout.series.priceToCoordinate(level.value);
   if(priceLine)layout.levels.push(level.reverse?{reverse:true,key:level.key,side:level.side,label:level.label,color:level.color,value:level.value,y:Number.isFinite(y)?y:null,priceLine}:{positionId:level.position.id,key:level.key,value:level.value,y:Number.isFinite(y)?y:null,priceLine});
  }
  empty.hidden=true;
  return true;
 }catch(error){
  destroyChartLayout(canvasId);
  return false;
 }
}
function drawCanvasChart(canvasId,empty,market,timeframe,bars){
 const canvas=$(canvasId),rect=canvas.getBoundingClientRect(),scale=Math.max(1,window.devicePixelRatio||1),width=Math.max(1,Math.floor(rect.width*scale)),height=Math.max(1,Math.floor(rect.height*scale));
 if(canvas.width!==width||canvas.height!==height){canvas.width=width;canvas.height=height;}
 const ctx=canvas.getContext('2d');if(!ctx)return;
 ctx.setTransform(scale,0,0,scale,0,0);
 const w=rect.width,h=rect.height,priceScaleWidth=chartPriceScaleWidth(market),pad={top:14,right:priceScaleWidth,bottom:20,left:8};
 const availableBars=bars.slice(-Math.min(chartDisplayBars,bars.length));
 const visibleCount=Math.max(12,Math.round(availableBars.length/Math.max(1,chartZoom))),visibleBars=availableBars.slice(-visibleCount);
 const positions=chartPositionsFor(market);
 const reverseLevels=reverseChartLevelsForMarket(market),levels=positions.flatMap(position=>[chartEntryPrice(position),chartPositionLevel(position,'stopLoss'),chartPositionLevel(position,'takeProfit')]).concat(reverseLevels.map(level=>level.value)).filter(value=>Number.isFinite(value)&&value>0);
 const low=Math.min(...visibleBars.map(bar=>bar.low),...(levels.length?levels:[Infinity])),high=Math.max(...visibleBars.map(bar=>bar.high),...(levels.length?levels:[-Infinity])),extra=Math.max((high-low)*.08,Math.abs(high)*.00002),min=low-extra,max=high+extra,range=max-min||1;
 const y=value=>pad.top+(max-value)/range*(h-pad.top-pad.bottom),area=w-pad.left-pad.right;
 ctx.clearRect(0,0,w,h);ctx.fillStyle='#0a1d36';ctx.fillRect(0,0,w,h);
 ctx.save();ctx.strokeStyle='#1b3654';ctx.lineWidth=1;
 const plotRight=w-pad.right;
 for(let i=0;i<=4;i++){const xx=pad.left+(plotRight-pad.left)*i/4;ctx.beginPath();ctx.moveTo(xx,pad.top);ctx.lineTo(xx,h-pad.bottom);ctx.stroke();}
 for(let i=0;i<=5;i++){const yy=pad.top+(h-pad.top-pad.bottom)*i/5;ctx.beginPath();ctx.moveTo(pad.left,yy);ctx.lineTo(plotRight,yy);ctx.stroke();}
 ctx.restore();ctx.font='11px system-ui';ctx.fillStyle='#96b8d8';ctx.lineWidth=1;
 ctx.textAlign='right';
 for(let i=0;i<4;i++){const value=min+(range*i/3),yy=y(value);ctx.fillText(chartPrice(value,market),w-5,yy+4);}
 ctx.textAlign='left';
 const visibleStep=area/(visibleBars.length+6),visibleBody=Math.max(1,visibleStep*.62);
 visibleBars.forEach((bar,index)=>{const x=pad.left+visibleStep*(index+.5),up=bar.close>=bar.open,color=up?'#4ed8bd':'#ff8792';ctx.strokeStyle=color;ctx.beginPath();ctx.moveTo(x,y(bar.high));ctx.lineTo(x,y(bar.low));ctx.stroke();const top=Math.min(y(bar.open),y(bar.close)),bh=Math.max(1,Math.abs(y(bar.open)-y(bar.close)));ctx.fillStyle=color;ctx.fillRect(x-visibleBody/2,top,visibleBody,bh);});
 const hitLevels=[];
 positions.forEach(position=>{
  const entry=chartEntryPrice(position);
  if(entry>0){
   const yy=y(entry);chartLine(ctx,pad.left,yy,w-pad.right,yy,'#50d47e',[5,3]);ctx.fillStyle='#50d47e';ctx.fillRect(w-pad.right-3,yy-2,6,4);
   hitLevels.push({positionId:position.id,key:'entry',value:entry,y:yy});
  }
  [['stopLoss','#ff7784','SL'],['takeProfit','#4de1c3','TP']].forEach(([key,color,label])=>{
   const value=chartPositionLevel(position,key);if(!value)return;
   const yy=y(value);chartLine(ctx,pad.left,yy,w-pad.right,yy,color,[6,4]);ctx.fillStyle=color;ctx.fillRect(w-pad.right-3,yy-2,6,4);
   hitLevels.push({positionId:position.id,key,value,y:yy});
  });
 });
 reverseLevels.forEach(level=>{const yy=y(level.value);chartLine(ctx,pad.left,yy,w-pad.right,yy,level.color,[6,4]);ctx.fillStyle=level.color;ctx.fillRect(w-pad.right-3,yy-2,6,4);hitLevels.push({...level,y:yy});});
 const last=visibleBars[visibleBars.length-1];chartLine(ctx,pad.left,y(last.close),w-pad.right,y(last.close),'#a5ddff',[4,3]);ctx.fillStyle='#c4ddf4';ctx.fillText(new Date(last.time*1000).toLocaleTimeString('ja-JP',{hour:'2-digit',minute:'2-digit'}),pad.left,h-5);empty.hidden=true;
 canvas.style.setProperty('--chart-price-axis-width',priceScaleWidth+'px');
 chartLayouts.set(canvasId,{mode:'canvas',market,timeframe,canvasId,host:canvas,pad,w,h,min,max,range,y,valueAtY:yy=>max-(yy-pad.top)/(h-pad.top-pad.bottom)*range,levels:hitLevels,priceScaleWidth});
}
function drawChartFor(canvasId,emptyId,market,timeframe){
 const canvas=$(canvasId),host=$(canvasId+'TradingView'),bars=market?.charts?.[timeframe],empty=$(emptyId);
 if(!canvas||!empty)return;
 if(!Array.isArray(bars)||bars.length<2){destroyChartLayout(canvasId);clearChartLevelLabels(canvasId);if(host&&host.dataset.externalPreview==='1'){host.replaceChildren();delete host.dataset.externalPreview;}canvas.hidden=false;if(host)host.hidden=true;empty.hidden=false;return;}
 if(host&&host.dataset.externalPreview==='1'){host.replaceChildren();delete host.dataset.externalPreview;}
 if(host){host.hidden=false;if(drawTradingViewChart(canvasId,host,empty,market,timeframe,bars)){canvas.hidden=true;renderChartLevelLabels(canvasId);return;}}
 destroyChartLayout(canvasId);if(host)host.hidden=true;canvas.hidden=false;drawCanvasChart(canvasId,empty,market,timeframe,bars);renderChartLevelLabels(canvasId);
}
function showTradingViewChartPreview(canvasId,emptyId,symbol){
 const canvas=$(canvasId),host=$(canvasId+'TradingView'),empty=$(emptyId);
 if(!canvas||!host||!symbol)return;
 destroyChartLayout(canvasId);clearChartLevelLabels(canvasId);
 const tvSymbol=(TRADINGVIEW_SYMBOL_CATALOG.find(item=>item.symbol===symbol)||{}).tvSymbol||'OANDA:'+symbol;
 const iframe=document.createElement('iframe');iframe.title=symbol+' TradingViewプレビュー';iframe.loading='lazy';iframe.referrerPolicy='no-referrer-when-downgrade';iframe.src=tradingViewPreviewUrl(tvSymbol);
 host.replaceChildren(iframe);host.dataset.externalPreview='1';host.hidden=false;canvas.hidden=true;if(empty)empty.hidden=true;
}

function updateQuickClose(){
 const groups=[
  ['all',closeTargets('all'),$('allCloseCount')],
  ['BUY',closeTargets('BUY'),$('buyCloseCount')],
  ['SELL',closeTargets('SELL'),$('sellCloseCount')]
 ];
 for(const [kind,items,count] of groups){
 count.textContent=items.length+'件';
  document.querySelector('[data-quick-close="'+kind+'"]').disabled=!canClose(items);
 }
 amount($('quickCurrentNet'),C.sum(closeTargets('all')).net);
 setPipsValue($('quickCurrentPips'),closeTargets('all'));
}

function placeActionFooter(){
 const footer=$('actionFooter');
 const target=appPage==='home'?$('homeActionFooterSlot'):$('actionFooterDock');
 if(footer&&target&&footer.parentElement!==target)target.append(footer);
}
function updateActionFooter(){
 const footer=$('actionFooter');
 if(!footer)return;
 placeActionFooter();
 const count=Array.isArray(data?.positions)?data.positions.length:0;
 // ホームではサンプルの保有一覧を出さず、EAから受信した実際の保有分だけを表示する。
 // ポジション画面とホームで同じ件数を使うことで、受信直後にも判定がずれないようにする。
 const hasLivePositions=isLiveSource(data?.source)&&data?.schema===2&&count>0;
 const show=appPage==='positions' ? count>0 : (appPage==='home'&&hasLivePositions);
 footer.toggleAttribute('hidden',!show);
 document.body.dataset.actionFooter=show?'visible':'hidden';
 const status=$('bottomPositionStatus');
 if(status){
  const selectedCount=chosen().length;
  status.textContent=appPage==='home'
   ?'エントリー済み・保有'+count+'件（選択'+selectedCount+'件）'
   :'保有'+count+'件・選択'+selectedCount+'件';
 }
}

function summary(){
 const chosenSummary=C.sum(chosen());
 $('selected').textContent=chosenSummary.count+'件';
 amount($('net'),chosenSummary.net);
 amount($('bottomNet'),chosenSummary.net);
 setPipsValue($('selectedPips'),chosen());
 $('gross').textContent=money(chosenSummary.profit);
 $('commission').textContent=chosenSummary.net===null?'未確認を含む':money(chosenSummary.commission);
 $('other').textContent=money(chosenSummary.swap+chosenSummary.fee);
 $('netnote').textContent=chosenSummary.net===null
  ?'手数料未確認のポジションを含みます'
  :data.source==='demo'
   ?'サンプル価格での目安 · 手数料控除後'
   :data.live
  ?currentPlatform()+'から自動更新 · 手数料控除後'
    :'取得時点の目安 · リアルタイムではありません';

 $('close').disabled=!canClose(chosen());
 $('close').textContent=!navigator.onLine
  ?'オフライン'
  :data.source==='demo'
   ?'選択分を一括決済'
   :isLiveSource(data.source)
    ?'選択分を一括決済'
    :data.schema!==2
    ?'EA 0.2.0以上が必要'
    :data.tradeMode!=='demo'?'実口座は現在ロック':'選択分を一括決済';
 updateConfirmLivePnl();
 updateActionFooter();
 updateQuickClose();
}

function updateConfirmLivePnl(){
 const label=$('confirmLiveLabel'),value=$('confirmLiveNet');
 if(!label||!value)return;
 label.textContent=data.live?'リアルタイム損益':'現在の損益';
 const rows=pending.length?data.positions.filter(p=>pending.includes(p.id)):[];
 if(rows.length)amount(value,C.sum(rows).net);
 else{
  value.textContent='--';
  value.classList.remove('positive','negative');
 }
}

function connection(){
 const offline=!navigator.onLine;
 $('connection').hidden=!offline;
 document.body.classList.toggle('is-offline',offline);
 summary();
}

// MT4／MT5の履歴では口座・ブローカーによって手数料が正負どちらで返る場合があるため、
// PWA側では手数料・その他費用を必ずコスト（マイナス）として合算する。
function historyCommission(item){return -Math.abs(Number(item.commission)||0);}
function historyFee(item){return -Math.abs(Number(item.fee)||0);}
function historyNet(item){return (Number(item.profit)||0)+(Number(item.swap)||0)+historyCommission(item)+historyFee(item);}
function historyPipsValue(item){
 const reported=Number(item?.pips);
 if(Number.isFinite(reported))return reported;
 const open=Number(item?.openPrice??item?.open_price??item?.entryPrice),close=Number(item?.price??item?.closePrice??item?.close_price),pip=pipSize(item?.symbol,marketForSymbol(item?.symbol));
 if(!Number.isFinite(open)||open<=0||!Number.isFinite(close)||close<=0||!Number.isFinite(pip)||pip<=0)return null;
 // MT5の履歴sideは決済約定の向き。MT4はEAがpipsを計算して送信します。
 const value=item?.side==='BUY'?(open-close)/pip:(close-open)/pip;
 return Number.isFinite(value)?value:null;
}
function historyPipsText(item){
 const value=historyPipsValue(item);
 return value===null?'獲得pips --':'獲得pips '+(value>=0?'+':'')+value.toFixed(1);
}
function renderHistory(){
 const container=$('historyRows'),items=Array.isArray(data.history)?[...data.history].sort((a,b)=>Number(b.time)-Number(a.time)):[];
 if(!container)return;
 container.replaceChildren();
 $('historyCount').textContent=items.length+'件';
 const total=items.length?items.reduce((sum,item)=>sum+historyNet(item),0):null;
 if(total===null){$('historyTotal').textContent='--';$('historyTotal').classList.remove('positive','negative');}else amount($('historyTotal'),total);
 $('historyStatus').textContent=data.source==='demo'
  ?'サンプルモードでは取引履歴はありません。'
  :items.length?platformLabel(data)+'の直近90日・最大100件の決済約定です。':platformLabel(data)+'から決済済みの取引履歴を受信していません。';
 if(!items.length)return;
 for(const item of items){
  const row=document.createElement('div');row.className='history-row';
  const main=document.createElement('div');main.className='history-main';
  const top=document.createElement('div');top.className='history-top';
  const title=document.createElement('div');title.className='history-title';
  const symbol=document.createElement('span');symbol.textContent=item.symbol;
  const side=document.createElement('span');side.className='side '+(item.side==='SELL'?'sell':'');side.textContent=item.side;
  title.append(symbol,side);
  const meta=document.createElement('div');meta.className='history-meta';
  const timestamp=new Date(Number(item.time)*1000);
  const time=document.createElement('span');time.className='history-time';time.textContent=Number.isNaN(timestamp.getTime())?'日時不明':timestamp.toLocaleString('ja-JP',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit'});
  const volume=document.createElement('span');volume.textContent=Number(item.volume).toFixed(2)+' lot';
  const executionPrice=document.createElement('span');executionPrice.textContent='約定 '+price(Number(item.price));
  meta.append(time,volume,executionPrice);
  const result=document.createElement('div');result.className='history-result';
  const resultMoney=document.createElement('span');resultMoney.className='history-money';amount(resultMoney,historyNet(item));
  const pipsValue=historyPipsValue(item),pips=document.createElement('span');pips.className='history-pips';pips.textContent=historyPipsText(item);
  if(pipsValue!==null)pips.classList.add(pipsValue<0?'negative':'positive');
  result.append(resultMoney,pips);
  top.append(title,result);
  const cost=document.createElement('span');cost.className='history-cost';cost.textContent='売買 '+money(Number(item.profit)||0)+' ／ 手数料 '+money(historyCommission(item))+' ／ SW '+money(Number(item.swap)||0)+' ／ その他 '+money(historyFee(item));
  main.append(top,meta,cost);row.append(main);container.append(row);
 }
}

function calendarSnapshotFor(profile){
 if(profile.id===activeProfile().id)return data;
 try{
  const cached=JSON.parse(localStorage.getItem(profileCacheKey(profile.id))||'null');
  return cached?.snapshot||null;
 }catch{return null;}
}
function calendarSources(){
 return connectionProfiles.map(profile=>({profile,snapshot:calendarSnapshotFor(profile)})).filter(source=>source.snapshot);
}
function calendarItems(){
 const scope=$('calendarScope')?.value||'active';
 return calendarSources().filter(source=>scope==='all'||source.profile.id===activeProfile().id).flatMap(source=>{
  const history=Array.isArray(source.snapshot.history)?source.snapshot.history:[];
  return history.map(item=>({...item,calendarProfileId:source.profile.id,calendarProfileLabel:profileTitle(source.profile)}));
 });
}
function calendarDateKey(timestamp){
 const date=new Date(Number(timestamp)*1000);
 if(Number.isNaN(date.getTime()))return null;
 return [date.getFullYear(),String(date.getMonth()+1).padStart(2,'0'),String(date.getDate()).padStart(2,'0')].join('-');
}
function calendarDateLabel(key){
 const [year,month,day]=String(key).split('-').map(Number);
 return Number.isFinite(year)&&Number.isFinite(month)&&Number.isFinite(day)?year+'年'+month+'月'+day+'日':'日別詳細';
}
function calendarDateKeyFromDate(date){
 return [date.getFullYear(),String(date.getMonth()+1).padStart(2,'0'),String(date.getDate()).padStart(2,'0')].join('-');
}
function japaneseHolidayKeys(year){
 const key=(month,day)=>year+'-'+String(month).padStart(2,'0')+'-'+String(day).padStart(2,'0');
 const holidays=new Set([
  key(1,1),key(2,11),key(2,23),key(4,29),key(5,3),key(5,4),key(5,5),key(8,11),key(11,3),key(11,23),
  key(3,Math.floor(20.8431+0.242194*(year-1980)-Math.floor((year-1980)/4))),
  key(9,Math.floor(23.2488+0.242194*(year-1980)-Math.floor((year-1980)/4)))
 ]);
 const nthMonday=(month,nth)=>{
  const first=new Date(year,month-1,1);
  return 1+((8-first.getDay())%7)+(nth-1)*7;
 };
 holidays.add(key(1,nthMonday(1,2)));  // 成人の日
 holidays.add(key(7,nthMonday(7,3)));  // 海の日
 holidays.add(key(9,nthMonday(9,3)));  // 敬老の日
 holidays.add(key(10,nthMonday(10,2))); // スポーツの日

 // 祝日に挟まれた平日は「国民の休日」として扱う（例：2026/9/22）。
 for(let month=1;month<=12;month++){
  const daysInMonth=new Date(year,month,0).getDate();
  for(let day=2;day<daysInMonth;day++){
   const current=key(month,day);
   if(holidays.has(current))continue;
   if(holidays.has(keyFromOffset(month,day,-1))&&holidays.has(keyFromOffset(month,day,1)))holidays.add(current);
  }
 }

 // 日曜日に当たる祝日は、次の平日へ振替休日を移す。
 for(const holiday of [...holidays]){
  const [holidayYear,holidayMonth,holidayDay]=holiday.split('-').map(Number);
  const date=new Date(holidayYear,holidayMonth-1,holidayDay);
  if(date.getDay()!==0)continue;
  do{
   date.setDate(date.getDate()+1);
  }while(date.getDay()===0||date.getDay()===6||holidays.has(calendarDateKeyFromDate(date)));
  holidays.add(calendarDateKeyFromDate(date));
 }
 return holidays;
 function keyFromOffset(month,day,offset){
  const date=new Date(year,month-1,day+offset);
  return calendarDateKeyFromDate(date);
 }
}
function isBusinessCalendarDate(key){
 const [year,month,day]=String(key).split('-').map(Number);
 if(!Number.isFinite(year)||!Number.isFinite(month)||!Number.isFinite(day))return false;
 const date=new Date(year,month-1,day);
 return date.getDay()!==0&&date.getDay()!==6&&!japaneseHolidayKeys(year).has(key);
}
function gotoCalendarDateKeys(year,month){
 const keys=new Set();
 const lastDayOfMonth=new Date(year,month,0).getDate();
 for(const day of [5,10,15,20,25,lastDayOfMonth]){
  const date=new Date(year,month-1,day);
  if(date.getMonth()!==month-1)continue;
  while(!isBusinessCalendarDate(calendarDateKeyFromDate(date)))date.setDate(date.getDate()-1);
  keys.add(calendarDateKeyFromDate(date));
 }
 return keys;
}
function isGotoCalendarDate(key){
 const [year,month]=String(key).split('-').map(Number);
 return gotoCalendarDateKeys(year,month).has(key);
}
function openCalendarDay(key,rows){
 const dialog=$('calendarDayDialog'),title=$('calendarDayTitle'),summary=$('calendarDaySummary'),container=$('calendarDayRows');
 if(!dialog||!title||!summary||!container)return;
 title.textContent=calendarDateLabel(key)+'の取引';
 const sorted=[...rows].sort((a,b)=>Number(b.time)-Number(a.time));
 const total=sorted.reduce((sum,item)=>sum+historyNet(item),0),pips=sorted.map(historyPipsValue),pipsKnown=pips.every(value=>value!==null),totalPips=pipsKnown?pips.reduce((sum,value)=>sum+value,0):null;
 summary.textContent=sorted.length?`${sorted.length}件 ／ ${money(total)}${totalPips===null?'':' ／ '+(totalPips>=0?'+':'')+totalPips.toFixed(1)+' pips'}`:'この日の決済履歴はありません。';
 container.replaceChildren();
 if(!sorted.length){const empty=document.createElement('p');empty.className='empty';empty.textContent='この日の決済履歴はありません。';container.append(empty);}
 for(const item of sorted){
  const row=document.createElement('div');row.className='calendar-day-row';
  const timestamp=new Date(Number(item.time)*1000),time=document.createElement('span');time.className='calendar-day-time';time.textContent=Number.isNaN(timestamp.getTime())?'日時不明':timestamp.toLocaleTimeString('ja-JP',{hour:'2-digit',minute:'2-digit',second:'2-digit'});
  const name=document.createElement('strong');name.textContent=item.symbol+' '+item.side+' '+Number(item.volume||0).toFixed(2)+' lot';
  const profile=document.createElement('small');profile.textContent=item.calendarProfileLabel||profileTitle(activeProfile());
  const result=document.createElement('span');result.className='calendar-day-result';amount(result,historyNet(item));
  const pip=document.createElement('small');pip.className='history-pips';pip.textContent=historyPipsText(item);const value=historyPipsValue(item);if(value!==null)pip.classList.add(value<0?'negative':'positive');
  const left=document.createElement('div');left.append(name,profile);const right=document.createElement('div');right.append(result,pip);row.append(time,left,right);container.append(row);
 }
 if(!dialog.open)dialog.showModal();
}
function updateCalendarScopeOptions(){
 const select=$('calendarScope');
 if(!select)return;
 const selected=select.value||'active';
 select.replaceChildren(new Option(profileTitle(activeProfile()),'active'),new Option('全口座トータル','all'));
 select.value=selected==='all'?'all':'active';
}
function renderPnlCalendar(){
 const monthInput=$('calendarMonth'),grid=$('pnlCalendarGrid'),summary=$('calendarSummary');
 if(!monthInput||!grid||!summary)return;
 if(!/^\d{4}-\d{2}$/.test(monthInput.value)){
  const now=new Date();
  monthInput.value=now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0');
 }
 const [year,month]=monthInput.value.split('-').map(Number),daysInMonth=new Date(year,month,0).getDate(),firstDay=new Date(year,month-1,1).getDay();
 const daily=new Map(),dailyRows=new Map();
 for(const item of calendarItems()){
  const key=calendarDateKey(item.time);
  if(!key||!key.startsWith(monthInput.value+'-'))continue;
  const existing=daily.get(key)||{net:0,pips:0,pipsKnown:true,count:0,profiles:new Set()};
  existing.net+=historyNet(item);
  const pips=historyPipsValue(item);
  if(pips===null)existing.pipsKnown=false;else existing.pips+=pips;
  existing.count+=1;
  existing.profiles.add(item.calendarProfileLabel);
  daily.set(key,existing);
  const rows=dailyRows.get(key)||[];rows.push(item);dailyRows.set(key,rows);
 }
 const total=[...daily.values()].reduce((sum,item)=>sum+item.net,0),count=[...daily.values()].reduce((sum,item)=>sum+item.count,0),totalPips=[...daily.values()].every(item=>item.pipsKnown)?[...daily.values()].reduce((sum,item)=>sum+item.pips,0):null;
 summary.textContent=count?`${count}件 ／ ${money(total)}${totalPips===null?'':' ／ '+(totalPips>=0?'+':'')+totalPips.toFixed(1)+' pips'}`:'この月の決済履歴はありません';
 summary.classList.toggle('positive',count>0&&total>=0);summary.classList.toggle('negative',count>0&&total<0);
 grid.replaceChildren();
 for(let index=0;index<firstDay;index++)grid.append(document.createElement('div'));
 for(let day=1;day<=daysInMonth;day++){
  const key=year+'-'+String(month).padStart(2,'0')+'-'+String(day).padStart(2,'0'),item=daily.get(key),cell=document.createElement('button');
  cell.type='button';cell.setAttribute('aria-label',calendarDateLabel(key)+'の詳細を表示');cell.onclick=()=>openCalendarDay(key,dailyRows.get(key)||[]);
  cell.className='calendar-cell'+(item?' has-result':'');
  const dayLabel=document.createElement('span');dayLabel.className='calendar-day';dayLabel.textContent=String(day);cell.append(dayLabel);
  if(isGotoCalendarDate(key)){const gotobi=document.createElement('small');gotobi.className='calendar-gotobi';gotobi.textContent='ゴトー';cell.append(gotobi);}
  if(item){
   const net=document.createElement('strong');net.className='calendar-net '+(item.net<0?'negative':'positive');net.textContent=money(item.net);cell.append(net);
   const pips=document.createElement('small');pips.className='calendar-pips';pips.textContent=item.pipsKnown?(item.pips>=0?'+':'')+item.pips.toFixed(1)+' pips':item.count+'件';cell.append(pips);
   cell.title=[...item.profiles].join('、');
  }
  grid.append(cell);
 }
}

function movePageSurfaces(){
 const positionsPage=$('positionsPage'),management=$('tradeManagement');
 if(positionsPage&&management&&management.parentElement!==positionsPage)positionsPage.append(management);
 const historyPage=$('historyPage'),history=$('historyDialog');
 if(historyPage&&history&&history.parentElement!==historyPage)historyPage.append(history);
}
function setAppPage(page){
 const allowed=['symbols','positions','home','history','calendar'];
 appPage=allowed.includes(page)?page:'home';
 document.querySelectorAll('section[data-app-page]').forEach(section=>{section.hidden=section.dataset.appPage!==appPage;});
 document.querySelectorAll('[data-app-nav]').forEach(button=>{
  const active=button.dataset.appNav===appPage;
  button.classList.toggle('is-active',active);
  if(active)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current');
 });
 document.body.dataset.appPage=appPage;
 updateActionFooter();
 if(appPage==='symbols')renderCurrencyList();
 if(appPage==='history')renderHistory();
 if(appPage==='calendar'){updateCalendarScopeOptions();renderPnlCalendar();}
 // ホーム選択時は設定ダイアログを必ず閉じ、ホームだけを表示する。
 if(appPage==='home'){closeMenu();updateMarket();updateIndicatorMarket();}
}

function currencyMarkets(){
 const markets=marketList(data);
 if(markets.length)return markets.filter(m=>!isWeekendBtcSymbol(m.symbol)||weekendBtcTestEnabled());
 return [{symbol:'USDJPYz'},{symbol:'EURJPYz'}];
}
function tradingViewCatalogMatches(query){
 const normalize=value=>String(value||'').toLowerCase().replace(/[\s/_\-.]/g,'');
 const needle=normalize(query);
 return TRADINGVIEW_SYMBOL_CATALOG.filter(item=>!needle||normalize(item.symbol).includes(needle)||normalize(item.label).includes(needle)||normalize(item.tvSymbol).includes(needle));
}
function tradingViewPreviewUrl(symbol){
 const params=new URLSearchParams({frameElementId:'tom_fx_zero_tradingview_preview',symbol,interval:'5',hidetoptoolbar:'1',symboledit:'1',saveimage:'0',toolbarbg:'08142b',studies:'[]',theme:'dark',style:'1',timezone:'Asia/Tokyo',withdateranges:'1',hide_side_toolbar:'1',allow_symbol_change:'1',details:'0',hotlist:'0',calendar:'0',hideideas:'1',locale:'ja'});
 return 'https://www.tradingview.com/widgetembed/?'+params.toString();
}
function renderTradingViewPreview(){
 const panel=$('tradingViewPreview'),frame=$('tradingViewPreviewFrame'),symbolLabel=$('tradingViewPreviewSymbol');
 if(!panel||!frame)return;
 const item=TRADINGVIEW_SYMBOL_CATALOG.find(entry=>entry.tvSymbol===tradingViewPreviewSymbol)||TRADINGVIEW_SYMBOL_CATALOG[0];
 if(!item)return;
 panel.hidden=false;
 if(symbolLabel)symbolLabel.textContent=item.label+' · '+item.tvSymbol;
 const iframe=document.createElement('iframe');
 iframe.title=item.label+' TradingViewプレビュー';
 iframe.loading='lazy';
 iframe.referrerPolicy='no-referrer-when-downgrade';
 iframe.src=tradingViewPreviewUrl(item.tvSymbol);
 frame.replaceChildren(iframe);
}
function selectTradingViewPreview(item){
 if(!item)return;
 tradingViewPreviewSymbol=item.tvSymbol;
 try{localStorage.setItem('tomFxZeroTradingViewPreviewSymbolV1',tradingViewPreviewSymbol);}catch{}
 renderTradingViewPreview();
 if(activeMode==='goto'){
  selectedTradeSymbol=item.symbol;
  updateMarket();
  setAppPage('home');
 }
}
function currentCurrencySymbol(){return activeMode==='goto'?selectedTradeSymbol:($('indicatorSymbol')?.value||selectedTradeSymbol);}
function selectCurrency(symbol){
 if(activeMode==='goto'){
  selectedTradeSymbol=symbol;
  syncTradeSymbolOptions();
  updateMarket();
 }else{
  const select=$('indicatorSymbol');
  if(select&&[...select.options].some(option=>option.value===symbol))select.value=symbol;
  updateIndicatorMarket();
 }
 renderDesktopWatchlists();
 setAppPage('home');
}
function renderCurrencyList(){
 const container=$('currencyRows');
 if(!container)return;
 const allMarkets=currencyMarkets();
 const normalize=value=>String(value||'').toLowerCase().replace(/[\s/_\-.]/g,'');
 const needle=normalize(currencySearchQuery);
 const markets=needle?allMarkets.filter(m=>normalize(m.symbol).includes(needle)||normalize(tradeSymbolLabel(m.symbol)).includes(needle)):allMarkets;
 const previewMarkets=tradingViewCatalogMatches(currencySearchQuery);
 const current=currentCurrencySymbol();container.replaceChildren();
 for(const market of markets){
  const symbol=market.symbol,label=tradeSymbolLabel(symbol),button=document.createElement('button');
  button.type='button';button.className='currency-row'+(symbol===current?' is-active':'');button.onclick=()=>selectCurrency(symbol);
  const main=document.createElement('span');main.className='currency-main';
  const title=document.createElement('strong');title.textContent=label;
  const detail=document.createElement('small');detail.textContent=symbol;
  main.append(title,detail);
  const quote=document.createElement('span');quote.className='currency-quote';
  const bid=Number(market.bid),ask=Number(market.ask);quote.textContent=Number.isFinite(bid)?marketPrice(bid,market)+(Number.isFinite(ask)?' / '+marketPrice(ask,market):''):'--';
  button.append(main,quote);container.append(button);
 }
 for(const item of previewMarkets){
  const button=document.createElement('button');button.type='button';button.className='currency-row currency-row-preview';button.onclick=()=>selectTradingViewPreview(item);
  const main=document.createElement('span');main.className='currency-main';
  const title=document.createElement('strong');title.textContent=item.label;
  const detail=document.createElement('small');detail.textContent=item.symbol+' · TradingViewプレビュー';
  main.append(title,detail);
  const quote=document.createElement('span');quote.className='currency-quote';quote.textContent='プレビュー';
  button.append(main,quote);container.append(button);
 }
 if(!markets.length&&!previewMarkets.length){
  const empty=document.createElement('p');empty.className='currency-list-empty';empty.textContent='一致するEA受信銘柄・TradingView銘柄がありません';container.append(empty);
 }
 const status=$('currencyListStatus');
 if(status)status.textContent=(data.live?platformLabel(data)+'価格 ':'サンプル銘柄 ')+markets.length+'/'+allMarkets.length+' · TV '+previewMarkets.length;
}

function renderDesktopWatchlist(containerId){
 const container=$(containerId);
 if(!container)return;
 const current=currentCurrencySymbol();
 container.replaceChildren();
 for(const market of currencyMarkets().slice(0,8)){
  const symbol=market.symbol,button=document.createElement('button');
  button.type='button';button.className='desktop-watch-row'+(symbol===current?' is-active':'');button.onclick=()=>selectCurrency(symbol);
  const main=document.createElement('span');main.className='desktop-watch-row-main';
  const title=document.createElement('strong');title.textContent=tradeSymbolLabel(symbol);
  const detail=document.createElement('small');detail.textContent=symbol;
  main.append(title,detail);
  const right=document.createElement('span');
  const bid=Number(market.bid),ask=Number(market.ask),quote=document.createElement('span');quote.className='desktop-watch-row-quote';quote.textContent=Number.isFinite(bid)?marketPrice(bid,market):'--';
  const spark=document.createElement('span');spark.className='desktop-watch-row-spark';
  const bars=Array.isArray(market.charts?.M5)?market.charts.M5.slice(-18):[];
  const closes=bars.map(bar=>Number(bar.close)).filter(Number.isFinite),low=closes.length?Math.min(...closes):0,high=closes.length?Math.max(...closes):0,range=Math.max(high-low,Number.EPSILON);
  closes.forEach((close,index)=>{const bar=document.createElement('i');bar.style.height=(5+Math.round(((close-low)/range)*13))+'px';if(index>0&&close<closes[index-1])bar.classList.add('down');spark.append(bar);});
  right.append(quote,spark);button.append(main,right);container.append(button);
 }
 if(!container.children.length){const empty=document.createElement('p');empty.className='small';empty.textContent='EA価格を待っています';container.append(empty);}
}
function renderDesktopWatchlists(){
 renderDesktopWatchlist('desktopWatchlistRows');
 renderDesktopWatchlist('desktopWatchlistIndicatorRows');
 const ticker=$('desktopTickerItems');
 if(!ticker)return;
 ticker.replaceChildren();
 for(const market of currencyMarkets().slice(0,5)){
  const item=document.createElement('span');item.className='desktop-ticker-item';
  const title=document.createElement('strong');title.textContent=tradeSymbolLabel(market.symbol).split('（')[0];
  const quote=document.createElement('span');quote.textContent=Number.isFinite(Number(market.bid))?marketPrice(Number(market.bid),market):'--';
  item.append(title,quote);ticker.append(item);
 }
}

function positionLevelDraftKey(positionId,key){return String(positionId)+'|'+key;}
function capturePositionLevelDrafts(container){
 if(!container)return;
 container.querySelectorAll('input[data-position-level]').forEach(input=>{
  const positionId=input.dataset.positionId,key=input.dataset.positionLevel;
  if(positionId&&key)positionLevelDrafts.set(positionLevelDraftKey(positionId,key),input.value);
 });
}
function clearPositionLevelDrafts(positionIds=[]){
 for(const positionId of positionIds){
  positionLevelDrafts.delete(positionLevelDraftKey(positionId,'stopLoss'));
  positionLevelDrafts.delete(positionLevelDraftKey(positionId,'takeProfit'));
 }
}
function render(){
 const container=$('rows');
 const opened=new Set([...container.querySelectorAll('details[open]')].map(el=>el.dataset.position));
 capturePositionLevelDrafts(container);
 container.replaceChildren();
 $('count').textContent=data.positions.length+'件';

 for(const p of visible()){
  const row=document.createElement('div');
  row.className='row';
  row.classList.toggle('is-selected',selected.has(p.id));

  const hit=document.createElement('label');
  hit.className='check-hit';
  const check=document.createElement('input');
  check.type='checkbox';
  check.checked=selected.has(p.id);
  check.id='pos-'+p.id;
  check.setAttribute('aria-label',p.symbol+' '+p.side+' '+p.id+'を選択');
  check.onchange=()=>{
   check.checked?selected.add(p.id):selected.delete(p.id);
   row.classList.toggle('is-selected',check.checked);
   summary();
   redrawTradeCharts();
  };
  hit.append(check);

  const details=document.createElement('details');
  details.className='position-details';
  details.dataset.position=p.id;
  details.open=opened.has(p.id);
  const toggle=document.createElement('summary');
  toggle.className='position-summary';

  const left=document.createElement('span');
  left.className='position-main';
  const identity=document.createElement('span');
  identity.className='identity';
  identity.textContent=p.symbol;
  const side=document.createElement('span');
  side.className='side '+(p.side==='SELL'?'sell':'');
  side.textContent=p.side;
  const title=document.createElement('span');
  title.className='position-title';
  title.append(identity,side);
  const meta=document.createElement('span');
  meta.className='position-meta';
  const volume=document.createElement('span');
  volume.textContent=p.volume+' lot';
  const hint=document.createElement('span');
  hint.className='detail-hint';
  hint.textContent='内訳';
  meta.append(volume,hint);
  left.append(title,meta);

  const right=document.createElement('span');
  right.className='position-result';
  const value=document.createElement('span');
  value.className='money';
  amount(value,C.net(p));
  const status=document.createElement('span');
  status.className='status';
  status.textContent=p.costStatus==='observed'?(data.source==='demo'?'手数料込み':'手数料取得済'):'手数料未確認';
  right.append(value,status);
  toggle.append(left,right);
  details.append(toggle);

  const breakdown=document.createElement('dl');
  breakdown.className='position-breakdown';
  for(const [name,valueText] of [
   ['売買損益',money(p.profit)],
   ['手数料（残数量分）',p.costStatus==='observed'?money(p.commission):'未確認'],
   ['スワップ',money(p.swap)],
   ['その他費用',money(p.fee)],
   ['現在pips',currentPositionPips(p)===null?'--':(currentPositionPips(p)>=0?'+':'')+currentPositionPips(p).toFixed(1)+' pips'],
   ['SL',Number(p.stopLoss)>0?chartPrice(p.stopLoss,marketForSymbol(p.symbol)):'なし'],
   ['TP',Number(p.takeProfit)>0?chartPrice(p.takeProfit,marketForSymbol(p.symbol)):'なし'],
   ['ポジション番号','#'+p.id]
  ]){
   const term=document.createElement('dt');
   term.textContent=name;
   const definition=document.createElement('dd');
   definition.textContent=valueText;
   breakdown.append(term,definition);
  }
  details.append(breakdown);

  const levelEditor=document.createElement('div');
  levelEditor.className='position-level-editor';
  const levelHead=document.createElement('div');
  levelHead.className='position-level-head';
  const levelTitle=document.createElement('strong');levelTitle.textContent='TP／SLを追加・変更';
  const levelNote=document.createElement('small');levelNote.textContent='pips距離・0で解除';
  levelHead.append(levelTitle,levelNote);
  const levelFields=document.createElement('div');levelFields.className='position-level-fields';
  const levelMarket=marketForSymbol(p.symbol);
  const createLevelInput=(key,label)=>{
   const field=document.createElement('label');field.textContent=label;
   const input=document.createElement('input');input.type='number';input.inputMode='decimal';input.min='0';input.step='0.1';input.placeholder='0＝解除';input.setAttribute('aria-label',p.symbol+' '+p.side+' '+label);
   const draftKey=positionLevelDraftKey(p.id,key);
   input.dataset.positionId=String(p.id);
   input.dataset.positionLevel=key;
   const draft=positionLevelDrafts.get(draftKey);
   const current=Number(p[key])>0?pipsForChartLevel(p,Number(p[key]),key,levelMarket):null;
   if(draft!==undefined)input.value=draft;
   else if(Number.isFinite(current)&&current>0)input.value=current.toFixed(1);
   input.addEventListener('input',()=>positionLevelDrafts.set(draftKey,input.value));
   field.append(input);levelFields.append(field);return input;
  };
  const levelStopLoss=createLevelInput('stopLoss','SL（pips）');
  const levelTakeProfit=createLevelInput('takeProfit','TP（pips）');
  const levelButton=document.createElement('button');levelButton.type='button';levelButton.className='position-level-submit';levelButton.dataset.positionModify='true';levelButton.dataset.positionId=String(p.id);levelButton.textContent='TP／SLを設定';
  levelButton.onclick=event=>{event.preventDefault();event.stopPropagation();openPositionModifyConfirm(p,levelStopLoss,levelTakeProfit);};
  levelEditor.append(levelHead,levelFields,levelButton);
  details.append(levelEditor);
  row.append(hit,details);
  container.append(row);
 }

 if(!visible().length){
  const empty=document.createElement('p');
  empty.className='empty';
  empty.textContent='表示するポジションはありません';
  container.append(empty);
 }
 const modeNotice=$('mode');
 if(modeNotice)modeNotice.textContent=data.source==='demo'
  ?'サンプル · 実口座への接続なし'
  :data.live?platformLabel(data)+'デモ口座 · リアルタイム照合中（実決済なし）'
  :data.schema===2?platformLabel(data)+'デモ連携 · 決済指示ファイル対応':platformLabel(data)+'照合 · 読み取り専用';
 $('timestamp').textContent='取得日時：'+new Date(data.generatedAt*1000).toLocaleString('ja-JP')+'（端末の時刻表示）';
 updateMarket();
 updateIndicatorMarket();
 updateBalance();
 renderHistory();
 renderDesktopWatchlists();
 if(appPage==='symbols')renderCurrencyList();
 if(appPage==='calendar'){updateCalendarScopeOptions();renderPnlCalendar();}
 summary();
 setNanpinBusy(nanpinInFlight);
 setModifyBusy(modifyInFlight);
}

function openCloseConfirm(items,label,skipConfirm=false){
 const closeSummary=C.sum(items);
 if(!canClose(items))return false;
 pending=items.map(p=>p.id);
 pendingLabel=label;
 updateConfirmLivePnl();

 if(data.source==='demo'){
  $('confirmTitle').textContent=label+'の確認';
  $('confirmText').textContent=pending.length+'件 / '+sumText(closeSummary)+' をサンプル上で決済します。';
  $('confirmNote').textContent=closeSummary.net===null
   ?'手数料が未確認のポジションを含みます。実際の注文は送信されません。'
   :'実際の注文は送信されません。';
  $('execute').textContent=label+'を実行';
 }else if(canCreateCloseCommand(items)){
  $('confirmTitle').textContent='デモ口座の'+label;
  $('confirmText').textContent=pending.length+'件 / 取得時点の'+sumText(closeSummary)+' の決済指示を'+currentPlatform()+'へ送信します。';
  $('confirmNote').textContent=closeSummary.net===null
   ?'手数料未確認を含みます。'+currentPlatform()+'側で再確認後にデモ口座の対象を決済します。'
   :currentPlatform()+'側で対象ポジションを再確認してから決済します。';
  $('execute').textContent='決済指示を送信';
 }else{
  pending=[];
  return false;
 }
 if(!skipConfirm)$('confirm').showModal();
 return true;
}

function openOrderConfirm(side){
 if(orderInFlight||!canCreateOrder())return;
 const volume=Number($('orderVolume').value),slPips=Number($('orderStopLoss').value||0),tpPips=Number($('orderTakeProfit').value||0),market=selectedMarket(),symbol=market?.symbol||selectedTradeSymbol;
 if(!symbol||!Number.isFinite(volume)||volume<=0||!Number.isFinite(slPips)||slPips<0||!Number.isFinite(tpPips)||tpPips<0){$('message').textContent='ロット・SL・TP（pips）の入力内容を確認してください。';return;}
 const levels=market?levelsFromPips(side,slPips,tpPips,market):{stopLoss:0,takeProfit:0};
 pendingOrder={side,volume,stopLoss:levels.stopLoss,takeProfit:levels.takeProfit,slPips,tpPips,symbol};
 $('orderConfirmTitle').textContent='デモ口座の成行 '+side;
 $('orderConfirmText').textContent=symbol+' / '+volume+' lot / '+(market?'現在 '+(side==='BUY'?'Ask ':'Bid ')+marketPrice(side==='BUY'?market.ask:market.bid,market):'現在価格はEA側で取得')+' / SL '+(side==='BUY'?'-':'+')+slPips+' pips / TP '+(side==='BUY'?'+':'-')+tpPips+' pips';
 $('orderConfirmNote').textContent='実口座・コンテスト口座では発注できません。'+currentPlatform()+'側で価格と注文条件を再確認してからデモ発注します。SL／TPは約定価格基準で自動設定され、到達時に自動決済されます。';
 $('orderExecute').textContent='注文指示を送信';
 $('orderConfirm').showModal();
}

function openReserveConfirm(side){
 if(orderInFlight||!canCreateOrder())return;
 const nowDate=new Date(),date=[nowDate.getFullYear(),String(nowDate.getMonth()+1).padStart(2,'0'),String(nowDate.getDate()).padStart(2,'0')].join('-'),time=selectedClockTime('reserve'),lead=0;
 const volume=Number($('orderVolume').value),slPips=Number($('orderStopLoss').value||0),tpPips=Number($('orderTakeProfit').value||0);
 const target=new Date(date+'T'+time);
 if(!/^\d{2}:\d{2}:\d{2}$/.test(time)||!Number.isFinite(target.getTime())){$('message').textContent='予約時刻を確認してください。';return;}
 const executeAt=Math.floor(target.getTime()/1000),now=Math.floor(Date.now()/1000);
 if(executeAt<=now){$('message').textContent='予約時刻は現在より後に設定してください。';return;}
 const market=selectedMarket(),symbol=market?.symbol||selectedTradeSymbol;
 if(!symbol||!Number.isFinite(volume)||volume<=0||!Number.isFinite(slPips)||slPips<0||!Number.isFinite(tpPips)||tpPips<0){$('message').textContent='ロット・SL・TP（pips）の入力内容を確認してください。';return;}
 const levels=market?levelsFromPips(side,slPips,tpPips,market):{stopLoss:0,takeProfit:0};
 pendingOrder={side,volume,stopLoss:levels.stopLoss,takeProfit:levels.takeProfit,slPips,tpPips,scheduled:true,executeAt,targetAt:Math.floor(target.getTime()/1000),lead,symbol};
 $('orderConfirmTitle').textContent='ゴトー日 予約エントリー '+side;
 $('orderConfirmText').textContent=symbol+' / '+volume+' lot / 予約時刻 '+target.toLocaleString('ja-JP')+' / SL '+(side==='BUY'?'-':'+')+slPips+' pips / TP '+(side==='BUY'?'+':'-')+tpPips+' pips';
 $('orderConfirmNote').textContent='予約をEAへ登録します。指定時刻に'+currentPlatform()+'側でデモ成行注文を実行します。約定価格基準でSL／TPを自動設定し、到達時に自動決済します。';
 $('orderExecute').textContent='予約を登録';
 $('orderConfirm').showModal();
}

async function sendMarketOrder(){
 if(orderInFlight||!pendingOrder||!canCreateOrder())return;
 const key=connectionKey(),order=pendingOrder,market=selectedMarket();
 const stopLossPips=Number.isFinite(Number(order.slPips))?Math.max(0,Number(order.slPips)):0;
 const takeProfitPips=Number.isFinite(Number(order.tpPips))?Math.max(0,Number(order.tpPips)):0;
 setOrderBusy(true);$('orderConfirm').close();$('message').textContent='デモ成行注文を'+currentPlatform()+'へ送信中です。SL／TPは約定価格基準で自動設定されます。画面はそのままお待ちください。';
 try{
  // 既存のEAプロトコルどおり、pips距離を渡して約定後の価格からSL／TPを自動設定する。
  const body=await fetchJsonWithTimeout(COMMAND_ENDPOINT,{method:'POST',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify({action:order.scheduled?'schedule_market_order':'market_order',account:data.account,snapshotGeneratedAt:Math.floor(data.generatedAt),symbol:order.symbol||market?.symbol||selectedTradeSymbol,side:order.side,volume:order.volume,stopLoss:0,takeProfit:0,stopLossPips,takeProfitPips,executeAt:order.scheduled?order.executeAt:0})},6000);
  pendingOrder=null;$('message').textContent='デモ成行注文を'+currentPlatform()+'へ送信しました。EAの処理結果を待っています。';
  waitForCommandResult(body.commandId,key,'order');
 }catch(err){setOrderBusy(false);$('message').textContent=err.name==='AbortError'?'注文指示を送信できません：通信がタイムアウトしました':commandSendErrorMessage(err.message,'注文');}
}

function readNanpinSettings(){
 return {
  enabled:Boolean($('nanpinEnabled')?.checked),
  // SELLのみのUIは廃止しても、既存EAの既定方向は変更しない。
  sellOnly:$('nanpinSellOnly')?Boolean($('nanpinSellOnly').checked):true,
  widthPips:Number($('nanpinWidth')?.value||0),
  lots:Number($('nanpinLots')?.value||0),
  takeProfitPips:Number($('nanpinTakeProfit')?.value||0)
 };
}
function updateNanpinToggleState(){
 const input=$('nanpinEnabled'),state=$('nanpinEnabledState');
 if(!input)return;
 const enabled=Boolean(input.checked);
 input.setAttribute('aria-checked',enabled?'true':'false');
 if(state){state.textContent=enabled?'ON':'OFF';state.classList.toggle('is-on',enabled);}
}
/* v0.5.17 固定仕様（変更禁止）
 * ホームの成行／予約／ナンピンは、設定パネル・チャート・一括決済バーの高さに関係なく
 * 常に下部メニューの直上に置く。同じタブの再タップ時だけ設定を閉じ、タブ自体は移動しない。
 */
function syncHomeFixedOrderTabsOffset(){
 const nav=$('bottomNav');
 if(document.body?.dataset.appPage!=='home'||!nav)return;
 const height=Math.ceil(nav.getBoundingClientRect().height||0);
 if(height>0)document.body.style.setProperty('--tom-bottom-nav-live-height',height+'px');
}
function setGotoOrderTab(target,{closeIfActive=false}={}){
 const panels={market:'marketOrderDetails',reserve:'reserveDetails',nanpin:'nanpinDetails'};
 if(!panels[target])return;
 syncHomeFixedOrderTabsOffset();
 const stage=$('gotoOrderStage');
 const targetButton=document.querySelector('[data-goto-order-tab="'+target+'"]');
 const wasActive=Boolean(targetButton?.classList.contains('is-active'));
 const wasOpen=Boolean(stage&&!stage.hidden);
 // 同じタブをもう一度押した時だけ、注文設定全体を閉じる。
 if(closeIfActive&&wasActive&&wasOpen){
  stage.hidden=true;
  requestAnimationFrame(()=>window.dispatchEvent(new Event('resize')));
  return;
 }
 if(stage)stage.hidden=false;
 // 成行／予約は同じ注文設定をBUY・SELLの間へ移動して表示する。
 const settings=$('orderCommonSettings');
 const controls=$(target==='reserve'?'reserveOrderControls':'marketOrderControls');
 const sell=$(target==='reserve'?'reserveSell':'orderSell');
 if(settings&&controls&&sell&&settings.parentElement!==controls)controls.insertBefore(settings,sell);
 Object.entries(panels).forEach(([key,id])=>{
  const panel=$(id);
  if(panel)panel.hidden=key!==target;
 });
 document.querySelectorAll('[data-goto-order-tab]').forEach(button=>{
  const active=button.dataset.gotoOrderTab===target;
  button.classList.toggle('is-active',active);
  button.setAttribute('aria-selected',active?'true':'false');
 });
 requestAnimationFrame(()=>{syncHomeFixedOrderTabsOffset();window.dispatchEvent(new Event('resize'));});
}
function setupOrderFieldSteppers(){
 document.querySelectorAll('[data-step-input]').forEach(button=>{
  button.onclick=()=>{
   const input=$(button.dataset.stepInput);if(!input)return;
   const step=Number(input.step)||1,minimum=input.min===''?-Infinity:Number(input.min),maximum=input.max===''?Infinity:Number(input.max);
   let next=Number(input.value||0)+(button.dataset.stepDirection==='-1'?-step:step);
   if(Number.isFinite(minimum))next=Math.max(minimum,next);
   if(Number.isFinite(maximum))next=Math.min(maximum,next);
   const decimals=(String(step).split('.')[1]||'').length;
   input.value=next.toFixed(decimals);
   input.dispatchEvent(new Event('input',{bubbles:true}));
   input.dispatchEvent(new Event('change',{bubbles:true}));
  };
 });
}
/* v0.5.18 固定仕様：下部の3ボタンはモード別の既存注文方式を表示する。
 * ゴトー日＝成行／予約／ナンピン、指標＝予約／即時／成行。
 * ボタンの固定座標・EAアクション・入力値は変更しない。
 */
/* v0.5.19 固定仕様：スマホの指標はゴトー日と同じメインチャート・固定3ボタンを使う。
 * 指標設定だけをタブの上側へ展開し、EA送信内容・入力値・チャート通信は変更しない。
 */
function placeIndicatorOrderPanel(inStage){
 const panel=$('indicatorOrderPanel'),slot=$('indicatorOrderPanelSlot'),stage=$('gotoOrderStage');
 const target=inStage?stage:slot;
 if(panel&&target&&panel.parentElement!==target)target.append(panel);
}
function syncIndicatorOrderTabActive(target=selectedIndicatorEntryMode()){
 document.querySelectorAll('[data-indicator-order-tab]').forEach(item=>{
  const active=item.dataset.indicatorOrderTab===target;
  item.classList.toggle('is-active',active);
  item.setAttribute('aria-selected',active?'true':'false');
 });
}
function syncIndicatorSymbolToHomeChart(){
 const indicator=$('indicatorSymbol'),trade=$('tradeSymbol');
 if(indicator&&trade&&[...indicator.options].some(option=>option.value===trade.value))indicator.value=trade.value;
}
function setIndicatorOrderTab(target,{closeIfActive=false}={}){
 const modes={scheduled:'予約',immediate:'即時',market:'成行'};
 if(!modes[target])return;
 const stage=$('gotoOrderStage');
 const button=document.querySelector('[data-indicator-order-tab="'+target+'"]');
 const wasActive=Boolean(button?.classList.contains('is-active'));
 if(closeIfActive&&wasActive&&stage&&!stage.hidden){stage.hidden=true;return;}
 // 指標タブではゴトー日側の設定を残さず、指標設定だけを同じ上側ステージへ出す。
 ['marketOrderDetails','reserveDetails','nanpinDetails'].forEach(id=>{const panel=$(id);if(panel)panel.hidden=true;});
 placeIndicatorOrderPanel(true);
 if(stage)stage.hidden=false;
 const radio=document.querySelector('input[name="indicatorEntryMode"][value="'+target+'"]');
 if(radio)radio.checked=true;
 updateIndicatorEntryMode();
 syncIndicatorOrderTabActive(target);
 requestAnimationFrame(()=>window.dispatchEvent(new Event('resize')));
}
function configureHomeOrderTabs(mode){
 const buttons=[...document.querySelectorAll('.goto-order-tabs button')];
 if(!buttons.length)return;
 const indicator=mode==='indicator';
 const actionIcon=kind=>({
  reserve:'<svg viewBox="0 0 24 24"><rect x="3.5" y="5" width="17" height="15.5" rx="2.2"/><path d="M7.5 3.5v3M16.5 3.5v3M3.5 9h17M8 13h3M13 13h3M8 16.5h3"/></svg>',
  immediate:'<svg viewBox="0 0 24 24"><path d="m13 2-8 12h6l-1 8 9-13h-6z"/></svg>',
  market:'<svg viewBox="0 0 24 24"><path d="m8 5 11 7-11 7z"/></svg>',
  nanpin:'<svg viewBox="0 0 24 24"><path d="M5 7h14M5 12h14M5 17h14"/><path d="m15.5 4 3.5 3-3.5 3M8.5 9 5 12l3.5 3M15.5 14l3.5 3-3.5 3"/></svg>'
 })[kind]||'';
 const config=indicator
  ?[{key:'scheduled',label:'予約',icon:'reserve'},{key:'immediate',label:'即時',icon:'immediate'},{key:'market',label:'成行',icon:'market'}]
  :[{key:'market',label:'成行',icon:'market'},{key:'reserve',label:'予約',icon:'reserve'},{key:'nanpin',label:'ナンピン',icon:'nanpin'}];
 const tabs=document.querySelector('.goto-order-tabs');
 if(tabs)tabs.setAttribute('aria-label',indicator?'指標注文メニュー':'ゴトー日注文メニュー');
 buttons.forEach((button,index)=>{
  const item=config[index];if(!item)return;
  button.innerHTML='<span class="action-button-icon" aria-hidden="true">'+actionIcon(item.icon)+'</span><span>'+item.label+'</span>';
  button.setAttribute('aria-label',item.label);
  button.classList.remove('is-active');
  if(indicator){
   delete button.dataset.gotoOrderTab;
   button.dataset.indicatorOrderTab=item.key;
   button.onclick=()=>setIndicatorOrderTab(item.key,{closeIfActive:true});
  }else{
   delete button.dataset.indicatorOrderTab;
   button.dataset.gotoOrderTab=item.key;
   button.onclick=()=>setGotoOrderTab(item.key,{closeIfActive:true});
  }
 });
 if(indicator)syncIndicatorOrderTabActive();
 else placeIndicatorOrderPanel(false);
}
function setupGotoOrderTabs(){
 if(!document.querySelector('.goto-order-tabs'))return;
 setupOrderFieldSteppers();
 configureHomeOrderTabs('goto');
 // 初期画面はチャートとタブのみ。成行タブで注文設定を開く。
 setGotoOrderTab('market');
 setGotoOrderTab('market',{closeIfActive:true});
}
function applyNanpinSettings(settings){
 const s={enabled:false,sellOnly:true,widthPips:5,lots:.01,takeProfitPips:2,...settings};
 if($('nanpinEnabled'))$('nanpinEnabled').checked=Boolean(s.enabled);
 if($('nanpinSellOnly'))$('nanpinSellOnly').checked=s.sellOnly!==false;
 if($('nanpinWidth'))$('nanpinWidth').value=s.widthPips;
 if($('nanpinLots'))$('nanpinLots').value=s.lots;
 if($('nanpinTakeProfit'))$('nanpinTakeProfit').value=s.takeProfitPips;
 updateNanpinToggleState();
 setNanpinStatus(s.applied?'EA反映済み':'未送信です');
}
function loadNanpinSettings(){
 try{const raw=localStorage.getItem(profileSettingKey(NANPIN_SETTINGS_KEY));if(raw)applyNanpinSettings(JSON.parse(raw));}catch{}
}
function loadOrderVolume(){
 try{
  const saved=Number(localStorage.getItem(profileSettingKey(ORDER_VOLUME_KEY)));
  if(Number.isFinite(saved)&&saved>0&&saved<=5)$('orderVolume').value=String(saved);
 }catch{}
}
function saveOrderVolume(){
 const value=Number($('orderVolume').value);
 if(Number.isFinite(value)&&value>0&&value<=5){
  try{localStorage.setItem(profileSettingKey(ORDER_VOLUME_KEY),String(value));}catch{}
 }
}
function readLotCalculator(){
 try{return JSON.parse(localStorage.getItem(profileSettingKey(LOT_CALCULATOR_KEY))||'{}')||{};}catch{return {};}
}
function saveLotCalculator(){
 const value={riskPercent:Number($('lotRiskPercent')?.value),stopPips:Number($('lotStopPips')?.value),pipValue:Number($('lotPipValue')?.value)};
 try{localStorage.setItem(profileSettingKey(LOT_CALCULATOR_KEY),JSON.stringify(value));}catch{}
 return value;
}
function calculateLot(){
 const {riskPercent,stopPips,pipValue}=saveLotCalculator(),balance=Number(data?.balance),result=$('lotCalculatorResult'),status=$('lotCalculatorStatus');
 const balanceField=$('lotAccountBalance'),riskAmountField=$('lotRiskAmount');
 if(balanceField)balanceField.value=Number.isFinite(balance)&&balance>0?(balanceHidden?'••••••':balanceMoney(balance)):'--';
 const riskAmount=Number.isFinite(balance)&&balance>0&&Number.isFinite(riskPercent)&&riskPercent>0?balance*riskPercent/100:null;
 if(riskAmountField)riskAmountField.value=Number.isFinite(riskAmount)?(balanceHidden?'••••••':Math.round(riskAmount).toLocaleString('ja-JP')+' 円'):'--';
 if(!Number.isFinite(balance)||balance<=0||!Number.isFinite(riskPercent)||riskPercent<=0||!Number.isFinite(stopPips)||stopPips<=0||!Number.isFinite(pipValue)||pipValue<=0){
  result.textContent='--';status.textContent=!Number.isFinite(balance)||balance<=0?'口座残高を取得できません。'+currentPlatform()+'デモ口座の更新を待ってください。':'リスク率・SL幅・1lotあたりのpips損益を確認してください。';return null;
 }
 const raw=riskAmount/(stopPips*pipValue),lot=Math.floor((raw+1e-9)*100)/100;
 if(lot<0.01){result.textContent='0.00 lot';status.textContent='最小0.01 lotを下回ります。リスク率・SL幅を確認してください。';return null;}
 const capped=Math.min(5,lot);
 result.textContent=capped.toFixed(2)+' lot';
 status.textContent=lot>5?'安全上限5.00 lotで表示しています。実際の銘柄・口座の上限も確認してください。':(data.live?'選択中の口座残高 '+(balanceHidden?'（非表示）':balanceMoney(balance))+' に対する '+riskPercent+'% で計算しました。':'サンプル残高に対する '+riskPercent+'% で計算しました。');
 return capped;
}
function openLotCalculator(){
 closeMenu();
 const saved=readLotCalculator();
 if(Number.isFinite(saved.riskPercent)&&saved.riskPercent>0&&[...$('lotRiskPercent').options].some(option=>Number(option.value)===saved.riskPercent))$('lotRiskPercent').value=String(saved.riskPercent);
 if(Number.isFinite(saved.stopPips)&&saved.stopPips>0)$('lotStopPips').value=saved.stopPips;
 if(Number.isFinite(saved.pipValue)&&saved.pipValue>0)$('lotPipValue').value=saved.pipValue;
 calculateLot();
 $('lotCalculatorDialog').showModal();
}
function applyLotCalculator(){
 const lot=calculateLot();
 if(!Number.isFinite(lot))return;
 ['orderVolume','nanpinLots','indicatorVolume'].forEach(id=>{const input=$(id);if(input)input.value=lot.toFixed(2);});
 saveOrderVolume();
 $('lotCalculatorStatus').textContent=lot.toFixed(2)+' lotを注文・ナンピン・指標のロット欄へ反映しました。ナンピン設定は「設定をEAへ送信」で確定します。';
}
async function sendNanpinSettings(){
 if(nanpinInFlight||!canSendLiveCommand())return false;
 const settings=readNanpinSettings();
 if(!Number.isFinite(settings.widthPips)||settings.widthPips<=0||!Number.isFinite(settings.lots)||settings.lots<=0||settings.lots>5||!Number.isFinite(settings.takeProfitPips)||settings.takeProfitPips<0){$('message').textContent='ナンピン幅・ロット（最大5.00）・一括利確pipsを確認してください。';return false;}
 localStorage.setItem(profileSettingKey(NANPIN_SETTINGS_KEY),JSON.stringify({...settings,applied:false}));
 const key=connectionKey();
 setNanpinBusy(true);$('message').textContent='ナンピン設定をEAへ送信中です。';
 try{
  const body=await fetchJsonWithTimeout(COMMAND_ENDPOINT,{method:'POST',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify({action:'nanpin_settings',account:data.account,snapshotGeneratedAt:Math.floor(data.generatedAt),enabled:settings.enabled,sellOnly:settings.sellOnly,widthPips:settings.widthPips,lots:settings.lots,takeProfitPips:settings.takeProfitPips})},6000);
  $('message').textContent='ナンピン設定を送信しました。EAの反映結果を待っています。';
  waitForCommandResult(body.commandId,key,'nanpin');
  return true;
 }catch(err){setNanpinBusy(false);setNanpinStatus('送信失敗');$('message').textContent=err.name==='AbortError'?'ナンピン設定を送信できません：通信がタイムアウトしました':commandSendErrorMessage(err.message,'ナンピン設定');return false;}
}
function nanpinSyncIdentity(){
 const key=connectionKey(),account=String(data.account||'');
 return data.live&&key&&account?activeProfile().id+'|'+account+'|'+key:'';
}
async function syncNanpinSettingsForConnection(){
 const identity=nanpinSyncIdentity();
 if(!identity||identity===nanpinSyncKey||nanpinInFlight)return;
 // EA再起動後に残った古いナンピン設定を使わせず、現在のPWA設定を
 // 最初のライブスナップショットで必ず再送する。OFFも明示的に送る。
 if(await sendNanpinSettings())nanpinSyncKey=identity;
}

function modifyTargetPositions(){
 if(Array.isArray(pendingModify?.positionIds))return data.positions.filter(position=>pendingModify.positionIds.includes(position.id));
 return chosen();
}
function readPositionLevelPips(input){
 const value=String(input?.value??'').trim();
 return value===''?0:Number(value);
}
function openPositionModifyConfirm(position,stopLossInput,takeProfitInput){
 if(modifyInFlight||!canCreateCloseCommand([position])){ $('message').textContent=currentPlatform()+'デモ口座へ接続し、最新ポジションを受信してから設定してください。';return; }
 const stopLossPips=readPositionLevelPips(stopLossInput),takeProfitPips=readPositionLevelPips(takeProfitInput);
 if(!Number.isFinite(stopLossPips)||stopLossPips<0||!Number.isFinite(takeProfitPips)||takeProfitPips<0){$('message').textContent='SL／TPのpips距離を確認してください。';return;}
 if(!position.ticket){$('message').textContent=currentPlatform()+'ポジション情報を更新してから、もう一度お試しください。';return;}
 pendingModify={tickets:[position.ticket],positionIds:[position.id],stopLossPips,takeProfitPips};
 $('modifyConfirmText').textContent=position.symbol+' '+position.side+' に SL '+stopLossPips.toFixed(1)+' pips / TP '+takeProfitPips.toFixed(1)+' pips を設定します。';
 $('modifyConfirm').showModal();
}
function openModifyConfirm(){
 if(modifyInFlight||!canCreateCloseCommand(chosen()))return;
 const items=chosen(),stopLossPips=Number($('selectedStopLoss').value||0),takeProfitPips=Number($('selectedTakeProfit').value||0);
 if(!Number.isFinite(stopLossPips)||stopLossPips<0||!Number.isFinite(takeProfitPips)||takeProfitPips<0){$('message').textContent='SL／TPのpips距離を確認してください。';return;}
 pendingModify={tickets:items.map(p=>p.ticket).filter(Boolean),positionIds:items.map(p=>p.id),stopLossPips,takeProfitPips};
 if(pendingModify.tickets.length!==items.length){$('message').textContent=currentPlatform()+'ポジション情報を更新してから、もう一度選択してください。';pendingModify=null;return;}
 $('modifyConfirmText').textContent=items.length+'件に SL '+stopLossPips+' pips / TP '+takeProfitPips+' pips を設定します。';
 $('modifyConfirm').showModal();
}
async function sendModifyLevels(){
 const targets=modifyTargetPositions();
 if(modifyInFlight||!pendingModify||!canCreateCloseCommand(targets))return;
 const key=connectionKey();
 setModifyBusy(true);$('modifyConfirm').close();$('message').textContent='SL／TP変更を'+currentPlatform()+'へ送信中です。';
 try{
  const body=await fetchJsonWithTimeout(COMMAND_ENDPOINT,{method:'POST',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify({action:'modify_position',account:data.account,snapshotGeneratedAt:Math.floor(data.generatedAt),tickets:pendingModify.tickets,stopLossPips:pendingModify.stopLossPips,takeProfitPips:pendingModify.takeProfitPips})},6000);
  $('message').textContent='SL／TP変更を送信しました。EAの反映結果を待っています。';
  waitForCommandResult(body.commandId,key,'modify');
 }catch(err){setModifyBusy(false);pendingModify=null;$('modifyStatus').textContent='送信失敗';$('message').textContent=err.name==='AbortError'?'SL／TP変更を送信できません：通信がタイムアウトしました':commandSendErrorMessage(err.message,'SL／TP変更');}
}

function clampChartLevel(position,key,value,market){
 const pip=pipSize(position.symbol,market),minimum=Math.max(pip*.1,Number(market?.ask||0)*.0000001);
 const bid=Number(market?.bid||0),ask=Number(market?.ask||0);
 if(position.side==='BUY')return key==='stopLoss'?Math.min(value,bid-minimum):Math.max(value,ask+minimum);
 return key==='stopLoss'?Math.max(value,ask+minimum):Math.min(value,bid-minimum);
}
function setChartZoom(next){
 chartZoom=Math.min(8,Math.max(1,next));
 redrawTradeCharts();
}
function resetChartPosition(canvasId){
 chartZoom=1;
 chartPinches.delete(canvasId);
 const layout=chartLayouts.get(canvasId);
 if(layout?.mode==='tradingview')layout.initialized=false;
 redrawTradeCharts();
}
function pinchState(canvasId){
 if(!chartPinches.has(canvasId))chartPinches.set(canvasId,new Map());
 return chartPinches.get(canvasId);
}
function pinchDistance(points){
 const pair=[...points.values()];return Math.hypot(pair[0].x-pair[1].x,pair[0].y-pair[1].y);
}
function chartLevelCoordinate(layout,level){
 if(!layout||!level)return null;
 if(layout.mode==='tradingview'){
  const y=layout.series?.priceToCoordinate?.(level.value);
  return Number.isFinite(y)?y:null;
 }
 return Number.isFinite(level.y)?level.y:null;
}
function chartValueFromCoordinate(layout,coordinate){
 if(!layout)return null;
 if(layout.mode==='tradingview'){
  const value=layout.series?.coordinateToPrice?.(coordinate);
  return Number.isFinite(value)?value:null;
 }
 const value=layout.valueAtY?.(coordinate);
 return Number.isFinite(value)?value:null;
}
function beginChartDrag(event,canvasId){
 const points=pinchState(canvasId);points.set(event.pointerId,{x:event.clientX,y:event.clientY});
 const layout=chartLayouts.get(canvasId);
 if(points.size>=2){
  chartDrag=null;
  if(layout?.mode==='tradingview')return;
  const distance=pinchDistance(points);points.pinch={distance,zoom:chartZoom};
  event.preventDefault();return;
 }
 if(!layout||!layout.levels.length)return;
 const rect=(layout.host||event.currentTarget).getBoundingClientRect(),pointX=event.clientX-rect.left,pointY=event.clientY-rect.top;
 if(layout.mode==='tradingview'&&pointX>rect.width-(layout.priceScaleWidth||84))return;
 let target=null,distance=Infinity;
 for(const level of layout.levels){
  if(level.reverse||level.key==='entry')continue;
  const y=chartLevelCoordinate(layout,level);if(!Number.isFinite(y))continue;
  const gap=Math.abs(y-pointY);if(gap<distance){distance=gap;target=level;}
 }
 const hitTolerance=layout.mode==='tradingview'?30:20;
 if(!target||distance>hitTolerance)return;
 event.preventDefault();event.stopPropagation();chartDrag={canvasId,positionId:target.positionId,key:target.key,changed:false};
 event.currentTarget.classList?.add('is-chart-dragging');
 event.currentTarget.setPointerCapture?.(event.pointerId);moveChartDrag(event,canvasId);
}
function moveChartDrag(event,canvasId=''){
 const activeCanvasId=canvasId||chartDrag?.canvasId||event.currentTarget?.id||'';
 const points=pinchState(activeCanvasId);
 if(points.has(event.pointerId))points.set(event.pointerId,{x:event.clientX,y:event.clientY});
 if(points.size>=2&&points.pinch){
  const distance=pinchDistance(points);
  if(distance>0)setChartZoom(points.pinch.zoom*(distance/points.pinch.distance));
  event.preventDefault();return;
 }
 if(!chartDrag)return;
 event.preventDefault();event.stopPropagation();
 const layout=chartLayouts.get(chartDrag.canvasId),host=layout?.host,position=data.positions.find(item=>item.id===chartDrag.positionId);
 if(!layout||!host||!position)return;
 const rect=host.getBoundingClientRect(),raw=chartValueFromCoordinate(layout,event.clientY-rect.top);
 if(!Number.isFinite(raw))return;
 const value=clampChartLevel(position,chartDrag.key,raw,layout.market);
 chartLevelDraft={positionId:position.id,stopLoss:chartLevelDraft?.positionId===position.id?chartLevelDraft.stopLoss:chartPositionLevel(position,'stopLoss'),takeProfit:chartLevelDraft?.positionId===position.id?chartLevelDraft.takeProfit:chartPositionLevel(position,'takeProfit')};
 const nextValue=Number(value.toFixed(8));
 if(Math.abs(Number(chartLevelDraft[chartDrag.key])-nextValue)>Math.max(pipSize(position.symbol,layout.market)*.01,0.00000001))chartDrag.changed=true;
 chartLevelDraft[chartDrag.key]=nextValue;redrawTradeCharts();
}
function endChartDrag(event,canvasId=''){
 const activeCanvasId=canvasId||chartDrag?.canvasId||event.currentTarget?.id||'';
 const layout=chartLayouts.get(activeCanvasId);
 if(activeCanvasId){const points=pinchState(activeCanvasId);points.delete(event.pointerId);if(points.size<2)delete points.pinch;}
 if(!chartDrag)return;
 const completedDrag=chartDrag;
 event.preventDefault();event.stopPropagation();
 try{layout?.host?.releasePointerCapture?.(event.pointerId);}catch{}
 layout?.host?.classList?.remove('is-chart-dragging');
 chartDrag=null;
 if(completedDrag.changed)applyChartLevels(true);
}
function applyChartLevels(automatic=false){
 if(!chartLevelDraft)return;
 const position=data.positions.find(item=>item.id===chartLevelDraft.positionId),market=position&&marketForSymbol(position.symbol);
 if(!position||!market||!canCreateCloseCommand([position])){ $('message').textContent=currentPlatform()+'の最新ポジションを確認してから、ラインを反映してください。';return; }
 const stopLossPips=pipsForChartLevel(position,chartLevelDraft.stopLoss,'stopLoss',market),takeProfitPips=pipsForChartLevel(position,chartLevelDraft.takeProfit,'takeProfit',market);
 if(!Number.isFinite(stopLossPips)||!Number.isFinite(takeProfitPips)){ $('message').textContent='SL／TPラインの位置を確認してください。';return; }
 if(!position.ticket){$('message').textContent=currentPlatform()+'ポジション情報を更新してから、もう一度お試しください。';return;}
 selected.add(position.id);
 pendingModify={tickets:[position.ticket],positionIds:[position.id],stopLossPips,takeProfitPips};
 if(automatic){
  $('message').textContent=position.symbol+'のSL／TPをライン移動後に自動反映しています。';
  sendModifyLevels();
  return;
 }
 $('modifyConfirmText').textContent=position.symbol+' '+position.side+' に SL '+stopLossPips.toFixed(1)+' pips / TP '+takeProfitPips.toFixed(1)+' pips を設定します。';
 $('modifyConfirm').showModal();
}
function setupChartInteractions(){
 for(const canvasId of ['marketChart','indicatorMarketChart']){
 const hosts=[$(canvasId),$(canvasId+'TradingView')].filter(Boolean);
 for(const host of hosts){
  const capture={capture:true};
  host.addEventListener('pointerdown',event=>beginChartDrag(event,canvasId),capture);
  host.addEventListener('pointermove',event=>moveChartDrag(event,canvasId),capture);
  host.addEventListener('pointerup',event=>endChartDrag(event,canvasId),capture);
  host.addEventListener('pointercancel',event=>endChartDrag(event,canvasId),capture);
  host.addEventListener('lostpointercapture',event=>endChartDrag(event,canvasId),capture);
 }
 }
}

$('symbol').onchange=()=>{selected.clear();render();};
function selectedIndicatorEntryMode(){return document.querySelector('input[name="indicatorEntryMode"]:checked')?.value||'scheduled';}
function selectedIndicatorOrderStyle(){return document.querySelector('[data-indicator-order-style].is-active')?.dataset.indicatorOrderStyle||'trend';}
function readReverseIndicatorSettings(){
 try{const stored=JSON.parse(localStorage.getItem(profileSettingKey(INDICATOR_REVERSE_SETTINGS_KEY))||'{}');return stored&&typeof stored==='object'?stored:{};}catch{return {};}
}
function reverseIndicatorSettingIds(){return ['reverseInnerDistance','reverseOuterDistance','reverseInnerLots','reverseOuterLots','reverseTP','reverseSL','reverseLotS2','reverseLotS1','reverseLotB1','reverseLotB2'];}
function saveReverseIndicatorSettings(){
 // 旧版で保存済みのreverseLagは消さずに保持するが、現在のUI・注文設定では使用しない。
 const values={...readReverseIndicatorSettings(),style:selectedIndicatorOrderStyle(),individualLots:Boolean($('reverseIndividualLots')?.checked)};
 reverseIndicatorSettingIds().forEach(id=>{const input=$(id);if(input)values[id]=input.value;});
 try{localStorage.setItem(profileSettingKey(INDICATOR_REVERSE_SETTINGS_KEY),JSON.stringify(values));}catch{}
 if(typeof activeMode!=='undefined'&&activeMode==='indicator'){drawChart();if(!$('indicatorMarketPanel')?.hidden)updateIndicatorMarket();}
 return values;
}
function updateReverseIndividualLotFields(){
 const enabled=Boolean($('reverseIndividualLots')?.checked),fields=$('reverseIndividualLotFields');
 if(fields)fields.hidden=!enabled;
}
function applyReverseIndicatorSettings(){
 const values=readReverseIndicatorSettings();
 reverseIndicatorSettingIds().forEach(id=>{if(values[id]!==undefined&&$(id))$(id).value=values[id];});
 if($('reverseIndividualLots'))$('reverseIndividualLots').checked=Boolean(values.individualLots);
 updateReverseIndividualLotFields();
 setIndicatorOrderStyle(values.style==='reverse'?'reverse':'trend',false);
}
function setIndicatorOrderStyle(style,save=true){
 const selected=style==='reverse'?'reverse':'trend';
 document.querySelectorAll('[data-indicator-order-style]').forEach(button=>{
  const active=button.dataset.indicatorOrderStyle===selected;
  button.classList.toggle('is-active',active);
  button.setAttribute('aria-selected',active?'true':'false');
 });
 if(save)saveReverseIndicatorSettings();
 updateIndicatorEntryMode();
 requestAnimationFrame(()=>window.dispatchEvent(new Event('resize')));
}
function setupReverseIndicatorSettings(){
 applyReverseIndicatorSettings();
 document.querySelectorAll('[data-indicator-order-style]').forEach(button=>button.onclick=()=>setIndicatorOrderStyle(button.dataset.indicatorOrderStyle));
 reverseIndicatorSettingIds().forEach(id=>$(id)?.addEventListener('input',saveReverseIndicatorSettings));
 $('reverseIndividualLots')?.addEventListener('change',()=>{updateReverseIndividualLotFields();saveReverseIndicatorSettings();});
 $('reverseReserve')?.addEventListener('click',reserveReverseIndicator);
}
function updateIndicatorEntryMode(){
 const mode=selectedIndicatorEntryMode(),scheduled=mode==='scheduled',immediate=mode==='immediate',market=mode==='market',orderMode=scheduled||immediate,reverse=orderMode&&selectedIndicatorOrderStyle()==='reverse';
 const panel=$('indicatorOrderPanel');if(panel){panel.dataset.entryMode=mode;panel.dataset.orderStyle=reverse?'reverse':'trend';}
 const style=$('indicatorOrderStyle'),trend=$('indicatorTrendSettings'),reverseSettings=$('indicatorReverseSettings');
 if(style)style.hidden=!orderMode;
 if(trend)trend.hidden=reverse;
 if(reverseSettings)reverseSettings.hidden=!reverse;
 $('indicatorTimeField').hidden=!scheduled;
 $('reverseTimeField').hidden=!scheduled;
 $('indicatorMarginField').hidden=market;
 $('indicatorCancel').hidden=market;
 $('indicatorReserve').hidden=reverse;
 if(reverse){
  $('reverseReserve').textContent=scheduled?'4ライン予約注文を登録':'4ライン予約注文を即時設置';
  $('indicatorStatus').textContent=scheduled?'逆張り4ラインの設定を確認してください。':'逆張り4ラインの設定を確認してください。即時モードでは予約時刻を使用しません。';
  return;
 }
 $('indicatorReserve').textContent=scheduled?'上下逆指値を予約':market?'両建て成行注文を送信':'上下逆指値を即時設置';
 $('indicatorStatus').textContent=scheduled?'予約時刻は秒まで指定できます。':market?'BUY／SELLを同時に成行注文します。TP／SLはそれぞれの約定価格からpipsで設定します。':'現在の'+currentPlatform()+'価格を基準に、すぐBuy Stop／Sell Stopを設置します。';
}
function indicatorScheduledTime(){
 const date=$('indicatorDate').value,time=selectedClockTime('indicator');
 if(!date||!time)return null;
 const at=date+'T'+time,executeAt=Math.floor(new Date(at).getTime()/1000);
 return Number.isFinite(executeAt)?{at,executeAt}:null;
}
function reverseScheduledTime(){
 const time=selectedClockTime('reverse');if(!time)return null;
 const today=new Date(),date=[today.getFullYear(),twoDigits(today.getMonth()+1),twoDigits(today.getDate())].join('-'),at=date+'T'+time,executeAt=Math.floor(new Date(at).getTime()/1000);
 return Number.isFinite(executeAt)?{at,executeAt}:null;
}
function readIndicatorPresets(){
 try{
  const stored=JSON.parse(localStorage.getItem(profileSettingKey(INDICATOR_PRESETS_KEY))||'[]');
  return Array.isArray(stored)?stored.filter(preset=>preset&&typeof preset.id==='string'&&typeof preset.name==='string'&&preset.name.trim()&&preset.values&&typeof preset.values==='object').slice(0,30):[];
 }catch{return [];}
}
function writeIndicatorPresets(presets){try{localStorage.setItem(profileSettingKey(INDICATOR_PRESETS_KEY),JSON.stringify(presets.slice(0,30)));}catch{}}
function syncIndicatorPresetSymbolOptions(){
 const source=$('indicatorSymbol'),target=$('indicatorPresetSymbol');
 if(!source||!target)return;
 const previous=target.value;
 target.replaceChildren(...[...source.options].map(option=>new Option(option.textContent,option.value,false,option.value===source.value)));
 target.value=[...target.options].some(option=>option.value===previous)?previous:source.value;
}
function syncIndicatorPresetFormFromIndicator(){
 const fields={
  indicatorPresetVolume:'indicatorVolume',indicatorPresetMargin:'indicatorMargin',indicatorPresetSL:'indicatorSL',indicatorPresetTP:'indicatorTP',
  indicatorPresetReverseInnerDistance:'reverseInnerDistance',indicatorPresetReverseOuterDistance:'reverseOuterDistance',
  indicatorPresetReverseInnerLots:'reverseInnerLots',indicatorPresetReverseOuterLots:'reverseOuterLots',
  indicatorPresetReverseTP:'reverseTP',indicatorPresetReverseSL:'reverseSL'
 };
 syncIndicatorPresetSymbolOptions();
 if($('indicatorPresetSymbol'))$('indicatorPresetSymbol').value=$('indicatorSymbol').value;
 Object.entries(fields).forEach(([target,source])=>{if($(target)&&$(source))$(target).value=$(source).value;});
 if($('indicatorPresetEntryMode'))$('indicatorPresetEntryMode').value=selectedIndicatorEntryMode();
 if($('indicatorPresetOrderStyle'))$('indicatorPresetOrderStyle').value=selectedIndicatorOrderStyle();
 [['indicatorPresetHour','indicatorHour'],['indicatorPresetMinute','indicatorMinute'],['indicatorPresetSecond','indicatorSecond']].forEach(([target,source])=>{if($(target)&&$(source))$(target).value=$(source).value;});
 updateIndicatorPresetReverseFields();
}
function indicatorPresetFormValues(){
 const values={
  symbol:$('indicatorPresetSymbol')?.value,
  volume:$('indicatorPresetVolume')?.value,
  marginPips:$('indicatorPresetMargin')?.value,
  stopLossPips:$('indicatorPresetSL')?.value,
  takeProfitPips:$('indicatorPresetTP')?.value,
  mode:$('indicatorPresetEntryMode')?.value,
  orderStyle:$('indicatorPresetOrderStyle')?.value,
  reverseInnerDistance:$('indicatorPresetReverseInnerDistance')?.value,
  reverseOuterDistance:$('indicatorPresetReverseOuterDistance')?.value,
  reverseInnerLots:$('indicatorPresetReverseInnerLots')?.value,
  reverseOuterLots:$('indicatorPresetReverseOuterLots')?.value,
  reverseTP:$('indicatorPresetReverseTP')?.value,
  reverseSL:$('indicatorPresetReverseSL')?.value,
  hour:$('indicatorPresetHour')?.value,
  minute:$('indicatorPresetMinute')?.value,
  second:$('indicatorPresetSecond')?.value
 };
 return Object.values(values).some(value=>value!==undefined)?values:null;
}
function updateIndicatorPresetReverseFields(){
 const reverse=$('indicatorPresetOrderStyle')?.value==='reverse';
 const fields=$('indicatorPresetReverseFields');
 if(fields)fields.hidden=!reverse;
}
function syncIndicatorFromPresetForm(){
 const values=indicatorPresetFormValues();if(!values)return;
 if(values.symbol&&[...$('indicatorSymbol').options].some(option=>option.value===values.symbol))$('indicatorSymbol').value=values.symbol;
 [['indicatorVolume',values.volume],['indicatorMargin',values.marginPips],['indicatorSL',values.stopLossPips],['indicatorTP',values.takeProfitPips],['reverseInnerDistance',values.reverseInnerDistance],['reverseOuterDistance',values.reverseOuterDistance],['reverseInnerLots',values.reverseInnerLots],['reverseOuterLots',values.reverseOuterLots],['reverseTP',values.reverseTP],['reverseSL',values.reverseSL],['indicatorHour',values.hour],['indicatorMinute',values.minute],['indicatorSecond',values.second]].forEach(([id,value])=>{if(value!==undefined&&value!==null&&$(id))$(id).value=value;});
 const mode=document.querySelector('input[name="indicatorEntryMode"][value="'+values.mode+'"]');
 if(mode)mode.checked=true;
 if(values.orderStyle)setIndicatorOrderStyle(values.orderStyle,false);
 updateReverseIndividualLotFields();
 updateIndicatorEntryMode();
 updateIndicatorMarket();
}
function setupIndicatorPresetForm(){
 setupClockSelects('indicatorPreset',new Date().getHours(),new Date().getMinutes(),new Date().getSeconds());
 syncIndicatorPresetFormFromIndicator();
 ['indicatorPresetSymbol','indicatorPresetEntryMode','indicatorPresetOrderStyle','indicatorPresetVolume','indicatorPresetMargin','indicatorPresetSL','indicatorPresetTP','indicatorPresetHour','indicatorPresetMinute','indicatorPresetSecond','indicatorPresetReverseInnerDistance','indicatorPresetReverseOuterDistance','indicatorPresetReverseInnerLots','indicatorPresetReverseOuterLots','indicatorPresetReverseTP','indicatorPresetReverseSL'].forEach(id=>$(id)?.addEventListener('input',()=>{updateIndicatorPresetReverseFields();syncIndicatorFromPresetForm();}));
 ['indicatorPresetSymbol','indicatorPresetEntryMode','indicatorPresetOrderStyle','indicatorPresetHour','indicatorPresetMinute','indicatorPresetSecond'].forEach(id=>$(id)?.addEventListener('change',()=>{updateIndicatorPresetReverseFields();syncIndicatorFromPresetForm();}));
 updateIndicatorPresetReverseFields();
}
function indicatorPresetValues(){
 return {
  symbol:$('indicatorSymbol').value,
  volume:$('indicatorVolume').value,
  marginPips:$('indicatorMargin').value,
  stopLossPips:$('indicatorSL').value,
  takeProfitPips:$('indicatorTP').value,
  mode:selectedIndicatorEntryMode(),
  orderStyle:selectedIndicatorOrderStyle(),
  reverseInnerDistance:$('reverseInnerDistance')?.value,
  reverseOuterDistance:$('reverseOuterDistance')?.value,
  reverseInnerLots:$('reverseInnerLots')?.value,
  reverseOuterLots:$('reverseOuterLots')?.value,
  reverseIndividualLots:Boolean($('reverseIndividualLots')?.checked),
  reverseLotS2:$('reverseLotS2')?.value,
  reverseLotS1:$('reverseLotS1')?.value,
  reverseLotB1:$('reverseLotB1')?.value,
  reverseLotB2:$('reverseLotB2')?.value,
  reverseTP:$('reverseTP')?.value,
  reverseSL:$('reverseSL')?.value,
  hour:$('indicatorHour').value,
  minute:$('indicatorMinute').value,
  second:$('indicatorSecond').value
 };
}
function renderIndicatorPresets(selectedId=''){
 const select=$('indicatorPreset');if(!select)return;
 syncIndicatorPresetFormFromIndicator();
 const previous=selectedId||select.value;
 const presets=readIndicatorPresets();
 select.replaceChildren(new Option('＋ 新規プリセットを作成','__new__'),...presets.map(preset=>new Option(preset.name,preset.id)));
 select.value=presets.some(preset=>preset.id===previous)?previous:'__new__';
 const hasSelected=select.value!=='__new__';
 $('indicatorPresetDuplicate').disabled=!hasSelected;
 $('indicatorPresetDelete').disabled=!hasSelected;
 $('indicatorPresetSave').textContent=hasSelected?'保存／更新':'新規として保存';
}
function applyIndicatorPreset(preset){
 const values=preset?.values||{};
 if([...$('indicatorSymbol').options].some(option=>option.value===values.symbol))$('indicatorSymbol').value=values.symbol;
 ['indicatorVolume','indicatorMargin','indicatorSL','indicatorTP'].forEach((id,index)=>{
  const value=[values.volume,values.marginPips,values.stopLossPips,values.takeProfitPips][index];
  if(value!==undefined&&value!==null)$(id).value=value;
 });
 reverseIndicatorSettingIds().forEach(id=>{
  const value=values[id];
  if(value!==undefined&&value!==null&&$(id))$(id).value=value;
 });
 if($('reverseIndividualLots')&&values.reverseIndividualLots!==undefined)$('reverseIndividualLots').checked=Boolean(values.reverseIndividualLots);
 updateReverseIndividualLotFields();
 setIndicatorOrderStyle(values.orderStyle==='reverse'?'reverse':'trend',false);
 const mode=document.querySelector('input[name="indicatorEntryMode"][value="'+values.mode+'"]');
 if(mode)mode.checked=true;
 [['indicatorHour',values.hour],['indicatorMinute',values.minute],['indicatorSecond',values.second]].forEach(([id,value])=>{if(value!==undefined&&[...$(id).options].some(option=>option.value===value))$(id).value=value;});
 updateIndicatorEntryMode();
 updateIndicatorMarket();
 syncIndicatorPresetFormFromIndicator();
 $('indicatorPresetStatus').textContent='「'+preset.name+'」を読み込みました。必要なら数値を変えて「保存／更新」で上書きできます。';
}
function createIndicatorPreset(copyFrom=null){
 const suggested=copyFrom?copyFrom.name+' コピー':'米CPI';
 const name=window.prompt('プリセット名を入力してください。',suggested);
 if(!name||!name.trim())return null;
 const preset={id:'preset_'+Date.now()+'_'+Math.random().toString(36).slice(2,7),name:name.trim().slice(0,40),values:copyFrom?JSON.parse(JSON.stringify(copyFrom.values)):indicatorPresetValues()};
 const presets=readIndicatorPresets();presets.push(preset);writeIndicatorPresets(presets);renderIndicatorPresets(preset.id);
 $('indicatorPresetStatus').textContent='「'+preset.name+'」を保存しました。';
 return preset;
}
function saveIndicatorPreset(){
 const id=$('indicatorPreset').value,presets=readIndicatorPresets(),index=presets.findIndex(preset=>preset.id===id);
 if(index<0){createIndicatorPreset();return;}
 presets[index]={...presets[index],values:indicatorPresetValues()};writeIndicatorPresets(presets);renderIndicatorPresets(id);
 $('indicatorPresetStatus').textContent='「'+presets[index].name+'」を更新しました。';
}
function duplicateIndicatorPreset(){
 const preset=readIndicatorPresets().find(item=>item.id===$('indicatorPreset').value);
 if(preset)createIndicatorPreset(preset);
}
function deleteIndicatorPreset(){
 const preset=readIndicatorPresets().find(item=>item.id===$('indicatorPreset').value);
 if(!preset||!window.confirm('「'+preset.name+'」を削除しますか？'))return;
 writeIndicatorPresets(readIndicatorPresets().filter(item=>item.id!==preset.id));renderIndicatorPresets();
 $('indicatorPresetStatus').textContent='「'+preset.name+'」を削除しました。';
}
function reserveReverseIndicator(){
 const mode=selectedIndicatorEntryMode(),scheduledAt=mode==='scheduled'?reverseScheduledTime():null,executeAt=scheduledAt?.executeAt||0;
 const symbol=$('indicatorSymbol').value,innerDistance=Number($('reverseInnerDistance').value),outerDistance=Number($('reverseOuterDistance').value),innerLots=Number($('reverseInnerLots').value),outerLots=Number($('reverseOuterLots').value),individualLots=Boolean($('reverseIndividualLots').checked),lotS2=Number($('reverseLotS2').value),lotS1=Number($('reverseLotS1').value),lotB1=Number($('reverseLotB1').value),lotB2=Number($('reverseLotB2').value),takeProfitPips=Number($('reverseTP').value),stopLossPips=Number($('reverseSL').value);
 const lots=individualLots?[lotS2,lotS1,lotB1,lotB2]:[innerLots,outerLots];
 const validLot=value=>Number.isFinite(value)&&value>0&&value<=5;
 if(!canSendLiveCommand()){ $('reverseStatus').textContent=currentPlatform()+'デモ口座へ接続してから注文してください。';return; }
 if(!Number.isFinite(executeAt)||((mode==='scheduled')&&(executeAt<=Math.floor(Date.now()/1000)))||!Number.isFinite(innerDistance)||innerDistance<=0||!Number.isFinite(outerDistance)||outerDistance<=innerDistance||outerDistance>10000||!lots.every(validLot)||!Number.isFinite(takeProfitPips)||takeProfitPips<0||takeProfitPips>10000||!Number.isFinite(stopLossPips)||stopLossPips<0||stopLossPips>10000){
  $('reverseStatus').textContent=mode==='scheduled'?'銘柄・距離・ロット・TP／SL・予約時刻を確認してください。':'銘柄・距離・ロット・TP／SLを確認してください。';return;
 }
 saveReverseIndicatorSettings();
 const button=$('reverseReserve'),cycleId='r4'+Date.now().toString(36)+Math.random().toString(36).slice(2,8);
 button.disabled=true;button.textContent='注文を送信中…';$('reverseStatus').textContent=currentPlatform()+'へ4ライン注文を送信中…';
 const payload={action:'indicator_reverse_4line',account:data.account,snapshotGeneratedAt:Math.floor(data.generatedAt),symbol,side:'BUY',volume:innerLots,executeAt,cycleId,reverseInnerDistancePips:innerDistance,reverseOuterDistancePips:outerDistance,reverseInnerLots:innerLots,reverseOuterLots:outerLots,reverseIndividualLots:individualLots,reverseLotS2:lotS2,reverseLotS1:lotS1,reverseLotB1:lotB1,reverseLotB2:lotB2,reverseTP:takeProfitPips,reverseSL:stopLossPips};
 fetchJsonWithTimeout(COMMAND_ENDPOINT,{method:'POST',headers:{Authorization:'Bearer '+connectionKey(),'Content-Type':'application/json'},body:JSON.stringify(payload)}).then(body=>{
  if(mode==='scheduled'){
   $('reverseStatus').textContent='4ライン予約をEAへ登録しました。'+scheduledAt.at.replace('T',' ')+' にS2／S1／B1／B2を設置します。';
   if(executeAt-Math.floor(Date.now()/1000)<=30)waitForCommandResult(body.commandId,connectionKey(),'reverseIndicator');
  }else{
   $('reverseStatus').textContent='4ライン予約を'+currentPlatform()+'へ送信しました。結果を待っています。';
   waitForCommandResult(body.commandId,connectionKey(),'reverseIndicator');
  }
 }).catch(err=>{$('reverseStatus').textContent='注文失敗：'+commandSendErrorMessage(err.message,'逆張り4ライン');}).finally(()=>{button.disabled=false;updateIndicatorEntryMode();});
}
function reserveIndicator(){
 const mode=selectedIndicatorEntryMode(),scheduledAt=mode==='scheduled'?indicatorScheduledTime():null,at=scheduledAt?.at||'',executeAt=scheduledAt?.executeAt,volume=Number($('indicatorVolume').value),marginPips=Number($('indicatorMargin').value),slPips=Number($('indicatorSL').value||0),tpPips=Number($('indicatorTP').value||0),symbol=$('indicatorSymbol').value;
 if(!canSendLiveCommand()){ $('indicatorStatus').textContent=currentPlatform()+'デモ口座へ接続してから注文してください。'; return; }
 if(!Number.isFinite(volume)||volume<=0||!Number.isFinite(slPips)||slPips<0||!Number.isFinite(tpPips)||tpPips<0||((mode==='scheduled'||mode==='immediate')&&(!Number.isFinite(marginPips)||marginPips<=0))||(mode==='scheduled'&&(!Number.isFinite(executeAt)||executeAt<=Math.floor(Date.now()/1000)))){ $('indicatorStatus').textContent=mode==='scheduled'?'銘柄・ロット・マージン・注文設置日／時刻／秒を確認してください。':'銘柄・ロット・マージン・SL／TPを確認してください。'; return; }
 const button=$('indicatorReserve');
 const action=mode==='scheduled'?'indicator_order':mode==='market'?'indicator_market_hedge':'indicator_order_now';
 button.disabled=true;button.textContent='注文を送信中…';$('indicatorStatus').textContent=currentPlatform()+'へ注文指示を送信中…';
 const payload={action,account:data.account,snapshotGeneratedAt:Math.floor(data.generatedAt),symbol,side:'BUY',volume,marginPips:mode==='market'?0:marginPips,stopLossPips:slPips,takeProfitPips:tpPips,...(mode==='scheduled'?{executeAt}:{})};
 fetchJsonWithTimeout(COMMAND_ENDPOINT,{method:'POST',headers:{Authorization:'Bearer '+connectionKey(),'Content-Type':'application/json'},body:JSON.stringify(payload)}).then(body=>{
  if(mode==='scheduled'){
   $('indicatorStatus').textContent='予約をEAへ登録しました。'+at.replace('T',' ')+' にBuy Stop／Sell Stopを設置します。';
   if(executeAt-Math.floor(Date.now()/1000)<=30) waitForCommandResult(body.commandId,connectionKey(),'indicator');
  }else{
   $('indicatorStatus').textContent=mode==='market'?'両建て成行注文を'+currentPlatform()+'へ送信しました。結果を待っています。':'即時の上下逆指値を'+currentPlatform()+'へ送信しました。結果を待っています。';
   waitForCommandResult(body.commandId,connectionKey(),'indicator');
  }
 }).catch(err=>{$('indicatorStatus').textContent='注文失敗：'+commandSendErrorMessage(err.message,'指標トレード');}).finally(()=>{button.disabled=false;updateIndicatorEntryMode();});
}
$('indicatorCancel').onclick=async()=>{
 if(!canSendLiveCommand()){ $('indicatorStatus').textContent=currentPlatform()+'デモ口座へ接続してからキャンセルしてください。'; return; }
 const symbol=$('indicatorSymbol').value,button=$('indicatorCancel');
 button.disabled=true;button.textContent='キャンセルを送信中…';$('indicatorStatus').textContent=currentPlatform()+'へキャンセル指示を送信中…';
 try{
  const body=await fetchJsonWithTimeout(COMMAND_ENDPOINT,{method:'POST',headers:{Authorization:'Bearer '+connectionKey(),'Content-Type':'application/json'},body:JSON.stringify({action:'cancel_indicator',account:data.account,snapshotGeneratedAt:Math.floor(data.generatedAt),symbol})},6000);
  $('indicatorStatus').textContent=currentPlatform()+'へキャンセル指示を送信しました。処理結果を待っています。';
  waitForCommandResult(body.commandId,connectionKey(),'indicatorCancel');
 }catch(err){$('indicatorStatus').textContent='キャンセル失敗：'+commandSendErrorMessage(err.message,'指標注文のキャンセル');}
 finally{button.disabled=false;button.textContent='この銘柄の指標注文をキャンセル';}
};
$('indicatorReserve').onclick=reserveIndicator;
$('indicatorSymbol').onchange=updateIndicatorMarket;
$('indicatorPreset').onchange=()=>{
 const id=$('indicatorPreset').value;
 if(id==='__new__'){
  const preset=createIndicatorPreset();
  if(!preset)renderIndicatorPresets();
  return;
 }
 const preset=readIndicatorPresets().find(item=>item.id===id);
 if(preset)applyIndicatorPreset(preset);
};
$('indicatorPresetSave').onclick=saveIndicatorPreset;
$('indicatorPresetDuplicate').onclick=duplicateIndicatorPreset;
$('indicatorPresetDelete').onclick=deleteIndicatorPreset;
$('weekendBtcTest').onchange=()=>{
 const enabled=$('weekendBtcTest').checked;
 saveWeekendBtcTest(enabled);
 const btc=marketList(data).find(m=>isWeekendBtcSymbol(m.symbol));
 if(enabled&&btc)selectedTradeSymbol=btc.symbol;
 if(!enabled&&isWeekendBtcSymbol(selectedTradeSymbol))selectedTradeSymbol=marketList(data).find(m=>isCoreGotoSymbol(m.symbol))?.symbol||'USDJPYz';
 syncTradeSymbolOptions();
 syncIndicatorSymbolOptions();
 updateMarket();
 updateIndicatorMarket();
 $('message').textContent=enabled?'週末BTCテストを有効化しました。BTCを選択できない場合は、EAの「BTC週末テストを有効化」をtrueにして付け直してください。':'週末BTCテストを無効化しました。ドル円・ユーロ円の通常運用へ戻りました。';
};
document.querySelectorAll('input[name="indicatorEntryMode"]').forEach(input=>input.onchange=updateIndicatorEntryMode);
updateIndicatorEntryMode();
$('tradeSymbol').onchange=()=>{selectedTradeSymbol=$('tradeSymbol').value;if(activeMode==='indicator')syncIndicatorSymbolToHomeChart();updateMarket();};
$('balanceStrip').onclick=event=>{event.preventDefault();balanceView=balanceView==='balance'?'equity':'balance';updateBalance();};
const balanceVisibilitySetting=$('balanceVisibilitySetting');
const closeNoConfirmSetting=$('closeNoConfirmSetting');
try{balanceHidden=localStorage.getItem('tomFxZeroBalanceHiddenV1')==='1';}catch{}
try{closeNoConfirm=localStorage.getItem('tomFxZeroCloseNoConfirmV1')==='1';}catch{}
if(balanceVisibilitySetting){
 balanceVisibilitySetting.checked=balanceHidden;
 balanceVisibilitySetting.onchange=()=>{balanceHidden=balanceVisibilitySetting.checked;try{localStorage.setItem('tomFxZeroBalanceHiddenV1',balanceHidden?'1':'0');}catch{}updateBalance();};
}
if(closeNoConfirmSetting){
 closeNoConfirmSetting.checked=closeNoConfirm;
 closeNoConfirmSetting.onchange=()=>{closeNoConfirm=closeNoConfirmSetting.checked;try{localStorage.setItem('tomFxZeroCloseNoConfirmV1',closeNoConfirm?'1':'0');}catch{}};
}
setupChartTimeframeControls();
$('resetMarketChart').onclick=()=>resetChartPosition('marketChart');
$('resetIndicatorChart').onclick=()=>resetChartPosition('indicatorMarketChart');
$('orderBuy').onclick=()=>openOrderConfirm('BUY');
$('orderSell').onclick=()=>openOrderConfirm('SELL');
$('orderVolume').addEventListener('input',saveOrderVolume);
$('orderVolume').addEventListener('change',saveOrderVolume);
$('reserveBuy').onclick=()=>openReserveConfirm('BUY');
$('reserveSell').onclick=()=>openReserveConfirm('SELL');
$('nanpinSave')?.addEventListener('click',sendNanpinSettings);
$('nanpinEnabled').onchange=()=>{
 updateNanpinToggleState();
 // ON／OFF自体をEAへ即時反映する。ナンピンの送信ボタンは使用しない。
 sendNanpinSettings();
};
setupGotoOrderTabs();
$('modifySelected').onclick=openModifyConfirm;
$('modifyCancel').onclick=()=>{if(!modifyInFlight){pendingModify=null;$('modifyConfirm').close();}};
$('modifyExecute').onclick=sendModifyLevels;
$('restartVps').onclick=openVpsRestartConfirm;
$('vpsRestartCancel').onclick=()=>{if(!vpsRestartInFlight)$('vpsRestartConfirm').close();};
$('vpsRestartExecute').onclick=sendVpsRestart;
setupChartInteractions();
$('orderCancel').onclick=()=>{if(!orderInFlight){pendingOrder=null;$('orderConfirm').close();}};
$('orderExecute').onclick=sendMarketOrder;
window.addEventListener('resize',()=>{syncHomeFixedOrderTabsOffset();if(!$('marketPanel').hidden)drawChart();if(!$('indicatorMarketPanel').hidden)updateIndicatorMarket();});
function setMode(mode){
 activeMode=mode;
 const goto=mode==='goto';
 // スマホでは指標もゴトー日と同じメインチャートを使い、設定だけを固定タブの上へ開く。
 $('gotoMode').hidden=false;$('indicatorMode').hidden=true;$('modeGoto').classList.toggle('is-active',goto);$('modeIndicator').classList.toggle('is-active',!goto);$('modeGoto').setAttribute('aria-selected',goto?'true':'false');$('modeIndicator').setAttribute('aria-selected',goto?'false':'true');
 if(!goto){syncIndicatorSymbolToHomeChart();resetChartPosition('marketChart');}
 else {$('gotoOrderStage').hidden=true;placeIndicatorOrderPanel(false);}
 configureHomeOrderTabs(mode);
 updateChartLevelAction();
 moveBalanceStrip();
 updateProfileUi();
 const target=modeProfileId(mode);if(target!==activeConnectionProfileId)switchProfile(target);
 renderDesktopWatchlists();
}
$('modeGoto').onclick=()=>setMode('goto');
$('modeIndicator').onclick=()=>setMode('indicator');
function closeMenu(){const menu=$('menuDialog');if(menu?.open)menu.close();$('openMenu')?.setAttribute('aria-expanded','false');}
function openMenu(){const menu=$('menuDialog');if(menu&&!menu.open){syncIndicatorPresetFormFromIndicator();menu.showModal();$('openMenu')?.setAttribute('aria-expanded','true');}}
$('openMenu').onclick=openMenu;
$('closeMenu').onclick=closeMenu;
$('openLotCalculator').onclick=openLotCalculator;
function closeSettingsDialog(id){$(id).close();openMenu();}
$('closeLotCalculator').onclick=()=>closeSettingsDialog('lotCalculatorDialog');
['lotRiskPercent','lotStopPips','lotPipValue'].forEach(id=>$(id).addEventListener('input',calculateLot));
$('lotRiskPercent').addEventListener('change',calculateLot);
$('applyLotCalculator').onclick=applyLotCalculator;
 $('installPwa')?.addEventListener('click',closeMenu,{capture:true});
$('menuDialog').addEventListener('close',()=>{$('openMenu')?.setAttribute('aria-expanded','false');});
$('menuDialog').addEventListener('click',event=>{if(event.target===$('menuDialog'))closeMenu();});
document.querySelectorAll('[data-app-nav]').forEach(button=>button.onclick=()=>setAppPage(button.dataset.appNav));
const currencySearch=$('currencySearch');
if(currencySearch)currencySearch.oninput=()=>{currencySearchQuery=currencySearch.value;renderCurrencyList();};
$('calendarScope').onchange=renderPnlCalendar;
$('calendarMonth').onchange=renderPnlCalendar;
$('closeCalendarDay').onclick=()=>$('calendarDayDialog').close();
const today=new Date(),todayText=[today.getFullYear(),String(today.getMonth()+1).padStart(2,'0'),String(today.getDate()).padStart(2,'0')].join('-');
const reserveDate=$('reserveDate');if(reserveDate)reserveDate.value=todayText;
$('indicatorDate').value=todayText;
setupClockSelects('reserve',9,54,59);
setupClockSelects('indicator',today.getHours(),today.getMinutes(),today.getSeconds());
setupClockSelects('reverse',today.getHours(),today.getMinutes(),today.getSeconds());
renderIndicatorPresets();
setupReverseIndicatorSettings();
setupIndicatorPresetForm();
loadOrderVolume();
loadNanpinSettings();
updateNanpinToggleState();
document.querySelectorAll('[data-pick]').forEach(button=>button.onclick=()=>{
 selected=new Set(visible().filter(p=>
  button.dataset.pick==='all'||
  p.side===button.dataset.pick||
  (button.dataset.pick==='profit'&&C.net(p)!==null&&C.net(p)>0)||
  (button.dataset.pick==='loss'&&C.net(p)!==null&&C.net(p)<0)
 ).map(p=>p.id));
 render();
});
document.querySelectorAll('[data-quick-close]').forEach(button=>button.onclick=()=>{
 const kind=button.dataset.quickClose;
 const label=kind==='all'?'全決済':kind+'のみ決済';
 openCloseConfirm(closeTargets(kind),label);
});
$('reset').onclick=()=>{
 closeMenu();
 if(connectionKey()){
  if(!window.confirm('リアルタイム接続を解除してサンプルへ戻しますか？'))return;
  stopLiveConnection();
 }
 data=demo();
 selected=new Set(data.positions.slice(0,4).map(p=>p.id));
 $('message').textContent='サンプルを復元しました。金額は説明用です。';
 symbols();
 render();
};
$('file').onchange=async event=>{
 try{
  const file=event.target.files[0];
  if(!file)return;
  if(file.size>5*1024*1024)throw Error('ファイルは5MB以下で読み込んでください。');
  const imported=C.validate(JSON.parse((await file.text()).replace(/^\uFEFF/,'')));
  if(!isLiveSource(imported.source))throw Error('EAから出力したMT4/MT5ファイルを選択してください。');
  data=imported;
  selected=new Set(data.positions.filter(p=>p.costStatus==='observed').map(p=>p.id));
  symbols();
  render();
 $('message').textContent='読み込みました。'+platformLabel(data)+'の口座履歴と手数料を照合してください。データの外部送信はありません。';
 }catch(err){
  $('message').textContent='読み込みできません：'+err.message;
 }finally{
  event.target.value='';
 }
};
$('close').onclick=()=>{
  const skipConfirm=closeNoConfirm;
  const items=chosen();
  if(skipConfirm){
   if(!canClose(items))return;
   openCloseConfirm(items,'選択分を一括決済',true);
   executeClose();
   return;
  }
  openCloseConfirm(items,'選択分を一括決済',false);
};
$('cancel').onclick=()=>{
 if(closeInFlight)return;
 pending=[];
 $('confirm').close();
};
 const executeClose=()=>{
 if(closeInFlight||pending.length===0)return;
 setCloseBusy(true);
 if(data.source==='demo'){
  const closed=data.positions.filter(p=>pending.includes(p.id));
  const closedSummary=C.sum(closed);
  data.positions=data.positions.filter(p=>!pending.includes(p.id));
  selected.clear();
  $('confirm').close();
  setCloseBusy(false);
  $('message').textContent='サンプル'+pendingLabel+'完了：'+closed.length+'件／'+sumText(closedSummary)+'（仮の結果）';
  pending=[];
  render();
  return;
 }
 if(isLiveSource(data.source)&&connectionKey()){
  const key=connectionKey();
  $('confirm').close();
  $('message').textContent=pendingLabel+'を'+currentPlatform()+'へ送信中です。画面はそのままお待ちください。';
  fetchJsonWithTimeout(COMMAND_ENDPOINT,{method:'POST',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify({account:data.account,snapshotGeneratedAt:Math.floor(data.generatedAt),tickets:pending.map(id=>data.positions.find(p=>p.id===id)?.ticket).filter(Boolean)})},6000)
   .then(body=>{
    $('message').textContent=pendingLabel+'を'+currentPlatform()+'へ送信しました。EAの処理結果を待っています。';
    const commandId=body.commandId;
    pending=[];
    waitForCommandResult(commandId,key);
   })
   .catch(err=>{setCloseBusy(false);$('message').textContent=err.name==='AbortError'?'決済指示を送信できません：通信がタイムアウトしました':commandSendErrorMessage(err.message);});
  return;
 }
 try{
  const content=C.closeCommand(data,pending);
  const blob=new Blob([content],{type:'text/plain;charset=utf-8'});
  const link=document.createElement('a');
  link.href=URL.createObjectURL(blob);
  link.download='TOM_FX_Zero_close.txt';
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(()=>URL.revokeObjectURL(link.href),1000);
  $('confirm').close();
  setCloseBusy(false);
  $('message').textContent=pendingLabel+'の決済指示を作成しました。ファイル名を変えずにMQL5\\Filesへコピーしてください。';
  pending=[];
 }catch(err){
  setCloseBusy(false);
  $('message').textContent='決済指示を作成できません：'+err.message;
  $('confirm').close();
 }
};
$('execute').onclick=executeClose;

window.addEventListener('online',connection);
window.addEventListener('offline',connection);

function connectionKey(){return activeProfile().connectionKey||'';}

function updateProfileUi(){
 const profile=activeProfile(),select=$('accountProfile');
 if(select){
  const available=connectedProfiles();
  if(available.length){
   select.replaceChildren(...available.map(item=>new Option(profileTitle(item),item.id)));
   select.disabled=false;
   select.value=available.some(item=>item.id===profile.id)?profile.id:available[0].id;
  }else{
   const empty=new Option('接続口座なし（メニューから追加）','');
   empty.disabled=true;
   empty.selected=true;
   select.replaceChildren(empty);
   select.disabled=true;
  }
 }
 const title=$('accountTitle');if(title)title.textContent=profileTitle(profile);
 const intro=$('connectionDialogIntro');if(intro)intro.textContent='検証版では'+profileTitle(profile)+'のみ送信できます。初回はMT4／MT5の6桁コード、2台目以降は1台目に表示する端末追加コードで接続できます。';
 const rows=$('profileRows');
 if(rows){
  rows.replaceChildren();
  connectionProfiles.forEach(item=>{
   const row=document.createElement('div');row.className='profile-row';row.dataset.profileId=item.id;row.title='長押しでこの口座を削除';
   const detail=document.createElement('div');const name=document.createElement('strong');name.textContent=profileTitle(item);const note=document.createElement('small');const accountMeta=[item.accountNumber,item.server].filter(Boolean).join(' · ');const status=item.pairingPending?'ペアリング中':isConnectedProfile(item)?'接続キー設定済み':hasConnectionHistory(item)?'接続履歴あり・現在未接続':'未接続';note.textContent=status+(accountMeta?' · '+accountMeta:'');detail.append(name,note);
   const hint=document.createElement('small');hint.className='profile-delete-hint';hint.textContent='長押しで削除';detail.append(hint);
   const button=document.createElement('button');button.type='button';button.textContent=item.id===profile.id?'選択中':'この口座に切替';button.disabled=item.id===profile.id;button.onclick=()=>switchProfile(item.id);
   row.append(detail,button);rows.append(row);
   attachProfileLongPress(row,item.id);
  });
 }
 const titanButton=$('addTitanProfile');if(titanButton)titanButton.disabled=connectionProfiles.some(item=>item.id==='titan-fx-blade-demo');
 const hfmButton=$('addHfmProfile');if(hfmButton)hfmButton.disabled=connectionProfiles.some(item=>item.id==='hfm-mt5-demo');
 const mt4Button=$('addMt4Profile');if(mt4Button)mt4Button.disabled=connectionProfiles.filter(item=>item.accountType==='MT4').length>=4;
 updateAccountConnectionStatus();
}
function attachProfileLongPress(row,id){
 let timer=0;
 const cancel=()=>{if(timer){window.clearTimeout(timer);timer=0;}};
 row.addEventListener('pointerdown',event=>{
  if(event.pointerType==='mouse'&&event.button!==0)return;
  cancel();
  timer=window.setTimeout(()=>{timer=0;removeProfile(id);},650);
 });
 ['pointerup','pointercancel','pointerleave'].forEach(type=>row.addEventListener(type,cancel));
 row.addEventListener('contextmenu',event=>event.preventDefault());
}
function removeProfile(id){
 const target=connectionProfiles.find(profile=>profile.id===id);
 if(!target)return;
 if(connectionProfiles.length<=1){
  window.alert('最後の口座は削除できません。再接続用として残します。');
  return;
 }
 if(!window.confirm(profileTitle(target)+'をこのPWAから削除しますか？\nEA側の接続設定は変更されません。'))return;
 const wasActive=activeConnectionProfileId===id;
 const next=connectionProfiles.find(profile=>profile.id!==id&&hasConnectionHistory(profile))||connectionProfiles.find(profile=>profile.id!==id);
 pauseLiveConnection();
 [LIVE_SNAPSHOT_KEY,WEEKEND_BTC_TEST_KEY,NANPIN_SETTINGS_KEY,ORDER_VOLUME_KEY,LOT_CALCULATOR_KEY,INDICATOR_PRESETS_KEY].forEach(key=>{try{localStorage.removeItem(key+'_'+id);}catch{}});
 connectionProfiles=connectionProfiles.filter(profile=>profile.id!==id);
 ['goto','indicator'].forEach(mode=>{if(modeProfiles[mode]===id)modeProfiles[mode]=next.id;});
 try{localStorage.setItem(MODE_PROFILE_KEY,JSON.stringify(modeProfiles));}catch{}
 if(wasActive){
  activeConnectionProfileId=next.id;
  persistProfiles();
  data=demo();data.live=false;selected=new Set(data.positions.slice(0,4).map(position=>position.id));liveReceivedAt=0;lastLiveCacheSavedAt=0;selectedTradeSymbol='USDJPYz';
  updateProfileUi();restoreCachedLiveSnapshot();syncTradeSymbolOptions();syncIndicatorSymbolOptions();renderIndicatorPresets();symbols();render();connection();showStoredKey();
 }else{
  persistProfiles();
  updateProfileUi();
 }
}
function moveBalanceStrip(){
 const balance=$('accountMetrics');
 const slot=document.querySelector('.trade-quickbar');
 if(balance&&slot&&balance.parentElement!==slot)slot.prepend(balance);
}
function pauseLiveConnection(){clearInterval(liveTimer);liveTimer=null;liveBusy=false;}
function switchProfile(id){
 if(!connectionProfiles.some(profile=>profile.id===id)||id===activeConnectionProfileId)return;
 pauseLiveConnection();
 nanpinSyncKey='';
 activeConnectionProfileId=id;persistProfiles();
 data=demo();data.live=false;selected=new Set(data.positions.slice(0,4).map(position=>position.id));liveReceivedAt=0;lastLiveCacheSavedAt=0;selectedTradeSymbol='USDJPYz';
 updateProfileUi();
 restoreCachedLiveSnapshot();syncTradeSymbolOptions();syncIndicatorSymbolOptions();renderIndicatorPresets();symbols();render();connection();showStoredKey();
 if($('profileDialog').open)$('profileDialog').close();
}
function addTitanProfile(){
 if(connectionProfiles.some(profile=>profile.id==='titan-fx-blade-demo'))return;
 connectionProfiles.push({id:'titan-fx-blade-demo',broker:'Titan FX',accountType:'Blade',label:'Titan FX Blade（デモ）',tradeMode:'demo',connectionKey:''});
 persistProfiles();saveModeProfile(activeMode,'titan-fx-blade-demo');updateProfileUi();switchProfile('titan-fx-blade-demo');
 $('syncDialog').showModal();showStoredKey();
 $('pairingMessage').textContent='Titan FX Bladeのデモ口座を選択しました。Titan MT5で最新版EAを起動し、表示された6桁コードを入力してください。';
}
function addHfmProfile(){
 if(connectionProfiles.some(profile=>profile.id==='hfm-mt5-demo'))return;
 connectionProfiles.push({id:'hfm-mt5-demo',broker:'HFM',accountType:'MT5',label:'HFM MT5（デモ・テスト用）',tradeMode:'demo',connectionKey:''});
 persistProfiles();saveModeProfile(activeMode,'hfm-mt5-demo');updateProfileUi();switchProfile('hfm-mt5-demo');
 $('syncDialog').showModal();showStoredKey();
 $('pairingMessage').textContent='HFMのMT5デモ口座を選択しました。HFM MT5で最新版EAを起動し、表示された6桁コードを入力してください。KATANAではなくデモ対応口座でテストします。';
}
function addMt4Profile(){
 const index=connectionProfiles.filter(item=>item.accountType==='MT4').length+1;
 if(index>4)return;
 const id='mt4-demo-'+index;
 connectionProfiles.push({id,broker:'MT4',accountType:'MT4',label:'MT4デモ口座 '+index,tradeMode:'demo',connectionKey:''});
 persistProfiles();saveModeProfile(activeMode,id);updateProfileUi();switchProfile(id);
 $('syncDialog').showModal();showStoredKey();
 $('pairingMessage').textContent='MT4デモ口座 '+index+'を追加しました。最新版EAの「スマホ再接続」を押して表示された6桁コードを入力してください。';
}
function addMt5Profile(){
 const index=connectionProfiles.filter(item=>profilePlatform(item)==='MT5').length+1;
 const id='mt5-demo-'+index;
 if(connectionProfiles.some(profile=>profile.id===id))return;
 connectionProfiles.push({id,broker:'MT5',accountType:'MT5',label:'MT5デモ口座 '+index,tradeMode:'demo',connectionKey:''});
 persistProfiles();saveModeProfile(activeMode,id);updateProfileUi();switchProfile(id);
 $('syncDialog').showModal();showStoredKey();
 $('pairingMessage').textContent='MT5デモ口座 '+index+'を追加しました。最新版EAの「スマホ再接続」を押して表示された6桁コードを入力してください。';
}

function makeConnectionKey(){
 const bytes=new Uint8Array(32);
 crypto.getRandomValues(bytes);
 let binary='';
 for(const byte of bytes)binary+=String.fromCharCode(byte);
 return btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}

let currentSyncState='idle';
let currentSyncDetail='';
function updateAccountConnectionStatus(){
 const status=$('accountConnectionStatus'),age=$('accountConnectionAge');
 if(!status||!age)return;
 const seconds=String(currentSyncDetail||'').match(/(\d+)\s*秒/)?.[1]||'0';
 const online=currentSyncState==='online';
 status.dataset.state=online?'online':'offline';
 age.textContent=seconds+'秒';
 status.setAttribute('aria-label',(online?'接続中 ':'未接続 ')+seconds+'秒');
}
function setSyncState(state,label,detail){
 currentSyncState=state;
 currentSyncDetail=detail||'';
 const strip=$('syncStrip');
 if(strip)strip.dataset.state=state;
 const syncLabel=$('syncLabel');if(syncLabel)syncLabel.textContent=label;
 const syncAge=$('syncAge');if(syncAge)syncAge.textContent=detail;
 updateAccountConnectionStatus();
}

function refreshSyncAge(){
 const key=connectionKey();
 const platform=currentPlatform();
 if(!key){
  setSyncState('idle',platform+' 未接続','0秒');
  updateVpsUi();
  return;
 }
 if(!navigator.onLine){
  const age=liveReceivedAt?Math.max(0,Math.floor(Date.now()/1000-liveReceivedAt)):0;
  setSyncState('stale','通信オフライン',age+'秒');
  updateVpsUi();
  return;
 }
 if(!liveReceivedAt){
  setSyncState('waiting',platform+' 接続待ち','0秒');
  updateVpsUi();
  return;
 }
 const age=Math.max(0,Math.floor(Date.now()/1000-liveReceivedAt));
 if(age<=10)setSyncState('online',platform+' リアルタイム接続','最終受信 '+age+'秒前');
 else if(age<=30)setSyncState('waiting',platform+' 更新待ち','最終受信 '+age+'秒前');
 else setSyncState('stale',platform+' 接続切れ','最終受信 '+age+'秒前');
 updateVpsUi();
}

function applyLiveSnapshot(payload){
 const snapshot=C.validate(payload.snapshot);
 if(snapshot.schema!==2||!isLiveSource(snapshot.source)||snapshot.tradeMode!=='demo')throw Error('デモ口座の対応データではありません。');
 updateProfileFromSnapshot(snapshot);
 const first=!data.live;
 const previousSelected=new Set(selected);
 const previousPositionIds=new Set(data.positions.map(p=>p.id));
 const incomingMarkets=marketList(snapshot);
 if(!incomingMarkets.some(m=>m.symbol===selectedTradeSymbol)&&!isTradingViewCatalogSymbol(selectedTradeSymbol)){
  const gotobiMarket=incomingMarkets.find(m=>/^(USDJPY|EURJPY)/i.test(m.symbol));
  selectedTradeSymbol=gotobiMarket?.symbol||incomingMarkets[0]?.symbol||selectedTradeSymbol;
 }
 data=snapshot;
 data.live=true;
 if(chartLevelDraft){
  const position=data.positions.find(item=>item.id===chartLevelDraft.positionId);
  if(!position||(
   chartLevelIsApplied(position,'stopLoss',chartLevelDraft.stopLoss)&&
   chartLevelIsApplied(position,'takeProfit',chartLevelDraft.takeProfit)
  ))chartLevelDraft=null;
 }
 liveReceivedAt=Number(payload.receivedAt)||Date.now()/1000;
 if(liveReceivedAt-lastLiveCacheSavedAt>=5||!lastLiveCacheSavedAt){
  try{localStorage.setItem(profileCacheKey(activeProfile().id),JSON.stringify({snapshot,receivedAt:liveReceivedAt}));lastLiveCacheSavedAt=liveReceivedAt;}catch{}
 }
 if(first)selected=new Set(data.positions.filter(p=>p.costStatus==='observed').map(p=>p.id));
 else{
  const nextSelected=new Set(data.positions.filter(p=>previousSelected.has(p.id)).map(p=>p.id));
  data.positions.forEach(p=>{if(!previousPositionIds.has(p.id))nextSelected.add(p.id);});
  selected=nextSelected;
 }
 syncTradeSymbolOptions();
 syncIndicatorSymbolOptions();
 symbols();
 render();
 // render完了後だけでなく、受信直後にも固定決済バーの状態を同期する。
 updateActionFooter();
 refreshSyncAge();
 void syncNanpinSettingsForConnection();
}

function restoreCachedLiveSnapshot(){
 if(!connectionKey())return false;
 try{
  const cached=JSON.parse(localStorage.getItem(profileCacheKey(activeProfile().id))||'null');
  const receivedAt=Number(cached?.receivedAt);
  if(!cached?.snapshot||!Number.isFinite(receivedAt)||Date.now()/1000-receivedAt>86_400){
   localStorage.removeItem(profileCacheKey(activeProfile().id));
   return false;
  }
  const snapshot=C.validate(cached.snapshot);
  if(snapshot.schema!==2||!isLiveSource(snapshot.source)||snapshot.tradeMode!=='demo')return false;
  updateProfileFromSnapshot(snapshot);
  data=snapshot;
  data.live=true;
  liveReceivedAt=receivedAt;
  lastLiveCacheSavedAt=receivedAt;
  selected=new Set(data.positions.filter(p=>p.costStatus==='observed').map(p=>p.id));
  syncTradeSymbolOptions();
  syncIndicatorSymbolOptions();
  symbols();
  return true;
 }catch{return false;}
}

async function pollLive(){
 const key=connectionKey();
 if(!key||liveBusy||!navigator.onLine)return;
 liveBusy=true;
 try{
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),3500);
  let response;
  try{
   response=await fetch(LIVE_ENDPOINT,{headers:{Authorization:'Bearer '+key},cache:'no-store',signal:controller.signal});
  }finally{clearTimeout(timeout);}
  if(response.status===404){
   liveReceivedAt=0;
   $('syncMessage').textContent='接続キーは準備済みです。EAから最初のデータが届くのを待っています。';
   refreshSyncAge();
   return;
  }
  if(!response.ok)throw Error(response.status===401?'接続キーが認証されませんでした。':'通信エラー '+response.status);
  applyLiveSnapshot(await response.json());
  $('syncMessage').textContent='接続済みです。デモ口座の情報を約1秒ごとに取得しています。';
 }catch(err){
  if(err.name!=='AbortError')$('syncMessage').textContent='取得できません：'+err.message;
  refreshSyncAge();
 }finally{liveBusy=false;}
}

function startLiveConnection(){
 pauseLiveConnection();
 refreshSyncAge();
 pollLive();
 liveTimer=setInterval(pollLive,1000);
}

function stopLiveConnection(){
 const key=connectionKey();
 pauseLiveConnection();
 nanpinSyncKey='';
 liveReceivedAt=0;
 lastLiveCacheSavedAt=0;
 if(key&&navigator.onLine){
  fetch(LIVE_ENDPOINT,{method:'DELETE',headers:{Authorization:'Bearer '+key},keepalive:true}).catch(()=>{});
 }
 setActiveConnectionKey('');
 localStorage.removeItem(profileCacheKey(activeProfile().id));
 $('connectionKey').value='';
 $('copyConnection').disabled=true;
 $('downloadConnection').disabled=true;
 $('removeConnection').hidden=true;
 $('createConnection').textContent='接続キーを作成';
 $('syncMessage').textContent='接続を解除しました。保存されていた最新データも削除します。';
 refreshSyncAge();
}

async function copyKey(){
 const key=connectionKey();
 if(!key)return;
 try{
  await navigator.clipboard.writeText(key);
 }catch{
  $('connectionKey').focus();
  $('connectionKey').select();
  document.execCommand('copy');
 }
 $('syncMessage').textContent='接続キーをコピーしました。MT4／MT5のEA設定へ貼り付けてください。';
}

async function claimPairing(){
 const input=$('pairingCode'),button=$('claimPairing'),message=$('pairingMessage');
 const code=String(input.value||'').replace(/\D/g,'').slice(0,6);
 input.value=code;
 if(!/^\d{6}$/.test(code)){message.textContent='MT4／MT5チャートまたは1台目の画面に表示された6桁コードを入力してください。';return;}
 button.disabled=true;
 message.textContent='ペアリング中です…';
 try{
  const body=await fetchJsonWithTimeout(PAIRING_ENDPOINT,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'claim',code})},6000);
  if(!body.connectionKey)throw Error('pairing_invalid_response');
  pendingPairingKey=body.connectionKey;
  const current=activeProfile();
  const useBlankSlot=!current.connectionKey&&(
   (current.id==='exness-mt5-zero-demo'&&connectionProfiles.length===1)||
   current.id.indexOf('mt4-demo-')===0||
   current.id.indexOf('mt5-demo-')===0||
   current.id==='titan-fx-blade-demo'||
   current.id==='hfm-mt5-demo'
  );
  const profile=useBlankSlot?current:{id:nextPairingProfileId(),broker:'接続中',accountType:'PENDING',label:'ペアリング中の口座',tradeMode:'demo',connectionKey:'',pairingPending:true};
  if(!useBlankSlot)connectionProfiles.push(profile);
  profile.connectionKey=body.connectionKey;
  profile.pairingPending=true;
  pendingPairingProfileId=profile.id;
  pendingPairingPreviousKey=current.id===profile.id?'':current.connectionKey||'';
  activeConnectionProfileId=profile.id;
  saveModeProfile(activeMode,profile.id);
  persistProfiles();
  liveReceivedAt=0;
  input.value='';
  showStoredKey();
  message.textContent='ペアリング完了。MT4／MT5との接続を開始しました。';
  $('syncMessage').textContent='ペアリングで接続しました。EAの接続キー入力は不要です。';
 }catch(err){
  const codeMessage={pairing_expired:'コードの有効期限が切れています。もう一度コードを発行してください。',pairing_already_used:'このコードはすでに使用済みです。新しいコードを発行してください。'}[err.message];
  message.textContent=codeMessage||'ペアリングできません：'+(err.name==='AbortError'?'通信がタイムアウトしました':'コードを確認してください。');
 }finally{button.disabled=false;}
}

async function addDevice(){
 const button=$('addDevice'),codeOutput=$('addDeviceCode'),message=$('pairingMessage');
 const key=connectionKey();
 if(!key||!isLiveSource(data.source)||data.tradeMode!=='demo'||!/^\d{4,20}$/.test(String(data.account||''))){
  message.textContent='まず1台目をMT4／MT5へ接続してから押してください。';
  return;
 }
 button.disabled=true;
 codeOutput.textContent='発行中…';
 message.textContent='端末追加コードを発行しています…';
 try{
  const body=await fetchJsonWithTimeout(PAIRING_ENDPOINT,{method:'POST',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify({action:'start_add',connectionKey:key,account:data.account,tradeMode:data.tradeMode})},6000);
  if(!/^\d{6}$/.test(String(body.code||'')))throw Error('pairing_invalid_response');
  codeOutput.textContent=body.code;
  message.textContent='この6桁コードを2台目の「ペアリングする」に入力してください。有効時間は5分です。';
 }catch(err){
  codeOutput.textContent='';
  message.textContent='端末追加コードを発行できません：'+(err.name==='AbortError'?'通信がタイムアウトしました':'接続を確認してください。');
 }finally{button.disabled=false;}
}

function downloadKeyFile(){
 const key=connectionKey();
 if(!key)return;
 const blob=new Blob([key+'\n'],{type:'text/plain;charset=utf-8'});
 const url=URL.createObjectURL(blob);
 const link=document.createElement('a');
 link.href=url;
 link.download='TOM_FX_Zero_connection.txt';
 document.body.append(link);
 link.click();
 link.remove();
 setTimeout(()=>URL.revokeObjectURL(url),1000);
 $('syncMessage').textContent='接続キー.txtを保存しました。MT4はMQL4\\Files、MT5はMQL5\\Filesへコピーしてください。';
}

function showStoredKey(){
 updateProfileUi();
 const key=connectionKey();
 $('connectionKey').value=key;
 $('copyConnection').disabled=!key;
 $('downloadConnection').disabled=!key;
 $('removeConnection').hidden=!key;
 $('createConnection').textContent=key?'接続キーを作り直す':'接続キーを作成';
 if(key)startLiveConnection();
 else refreshSyncAge();
}

$('openSync').onclick=()=>{closeMenu();$('syncDialog').showModal();showStoredKey();};
$('openChartSettings').onclick=()=>{closeMenu();const setting=$('chartBarsSetting');if(setting)setting.value=chartDisplayBars>=Number.MAX_SAFE_INTEGER?'max':String(chartDisplayBars);const received=selectedMarket()?.charts?.[chartTimeframe]?.length||0;const status=$('chartBarsStatus');if(status)status.textContent=received?'現在はEAから'+received+'本を受信しています。表示本数はこの範囲内で切り替わります。':'EAからローソク足を受信すると、表示本数を反映します。';$('chartSettingsDialog').showModal();};
$('closeChartSettings').onclick=()=>closeSettingsDialog('chartSettingsDialog');
$('chartBarsSetting').onchange=event=>{const count=event.target.value==='max'?Number.MAX_SAFE_INTEGER:Number(event.target.value);if(![60,120,180,Number.MAX_SAFE_INTEGER].includes(count))return;chartDisplayBars=count;try{localStorage.setItem(CHART_DISPLAY_BARS_KEY,event.target.value==='max'?'max':String(count));}catch{};redrawTradeCharts();};
$('resetChartView').onclick=()=>{chartZoom=1;redrawTradeCharts();};
$('closeSyncDialog').onclick=()=>closeSettingsDialog('syncDialog');
$('manageProfiles').onclick=()=>{closeMenu();$('profileDialog').showModal();updateProfileUi();};
$('closeProfileDialog').onclick=()=>closeSettingsDialog('profileDialog');
const addTitanButton=$('addTitanProfile');if(addTitanButton)addTitanButton.onclick=addTitanProfile;
const addHfmButton=$('addHfmProfile');if(addHfmButton)addHfmButton.onclick=addHfmProfile;
const addMt4Button=$('addMt4Profile');if(addMt4Button)addMt4Button.onclick=addMt4Profile;
const addMt5Button=$('addMt5Profile');if(addMt5Button)addMt5Button.onclick=addMt5Profile;
$('accountProfile').onchange=event=>{saveModeProfile(activeMode,event.target.value);switchProfile(event.target.value);};
$('copyConnection').onclick=copyKey;
$('downloadConnection').onclick=downloadKeyFile;
const importConnection=$('importConnection');if(importConnection)importConnection.onchange=async event=>{
  try{const file=event.target.files[0];if(!file)return;const key=(await file.text()).trim();if(!/^[A-Za-z0-9_-]{40,128}$/.test(key))throw Error('接続キーの形式が正しくありません。');setActiveConnectionKey(key);liveReceivedAt=0;showStoredKey();$('syncMessage').textContent='接続キーを読み込みました。MT4／MT5との接続を開始します。';}catch(err){$('syncMessage').textContent='読み込み失敗：'+err.message;}finally{event.target.value='';}
};
$('claimPairing').onclick=claimPairing;
$('addDevice').onclick=addDevice;
$('createConnection').onclick=()=>{
 if(connectionKey()&&!window.confirm('接続キーを作り直すと、現在のEA設定では接続できなくなります。続けますか？'))return;
 const key=makeConnectionKey();
 setActiveConnectionKey(key);
 liveReceivedAt=0;
 showStoredKey();
 $('syncMessage').textContent='接続キーを作成しました。コピーしてMT4／MT5のEA設定へ貼り付けてください。';
};
$('removeConnection').onclick=()=>{
 if(window.confirm('この端末のリアルタイム接続を解除しますか？'))stopLiveConnection();
};
function applyTheme(theme){
 const selected=['default','graphite','emerald','violet'].includes(theme)?theme:'default';
 document.body.dataset.theme=selected;
 try{localStorage.setItem(THEME_KEY,selected);}catch{}
 document.querySelectorAll('[data-theme-choice]').forEach(button=>{
  const active=button.dataset.themeChoice===selected;
  button.setAttribute('aria-pressed',active?'true':'false');
 });
}
document.querySelectorAll('[data-theme-choice]').forEach(button=>button.onclick=()=>applyTheme(button.dataset.themeChoice));
try{applyTheme(localStorage.getItem(THEME_KEY)||'default');}catch{applyTheme('default');}
try{localStorage.setItem(CHART_DISPLAY_BARS_KEY,'max');}catch{}
chartDisplayBars=Number.MAX_SAFE_INTEGER;
try{tradingViewPreviewSymbol=localStorage.getItem('tomFxZeroTradingViewPreviewSymbolV1')||tradingViewPreviewSymbol;}catch{}
document.addEventListener('visibilitychange',()=>{if(!document.hidden)pollLive();});
setInterval(refreshSyncAge,1000);
restoreCachedLiveSnapshot();
syncTradeSymbolOptions();
syncIndicatorSymbolOptions();
symbols();
movePageSurfaces();
updateCalendarScopeOptions();
render();
connection();
updateProfileUi();
showStoredKey();
// 起動・復帰時に設定ダイアログが残らず、常にホームを表示する。
closeMenu();
window.addEventListener('pageshow',closeMenu);
setAppPage('home');
// 初期DOMや旧キャッシュの画面が一瞬見えないよう、起動処理完了後にだけ表示する。
document.documentElement.classList.add('app-ready');
