'use strict';
(() => {
  const API_ORIGIN='https://tom-fx-zero.ryuichi512.chatgpt.site';
  const API_BASE=API_ORIGIN+'/api/v1/academy';
  const PROFILE_KEY='tomFxZeroConnectionProfilesV1';
  const ACTIVE_PROFILE_KEY='tomFxZeroActiveConnectionProfileV1';
  const FALLBACK_KEY='tomFxZeroConnectionKeyV1';
  const $=id=>document.getElementById(id);
  const state={progress:null,activeStage:'stage-1',view:'curriculum',session:null,chart:null};
  const stageFallback=[
    {id:'stage-1',number:1,title:'PC過去相場トレード',shortTitle:'PC過去相場トレード',description:'MT5で過去相場を使用した手動トレード（成行エントリー）',status:'in_progress',unlocked:true,progress:0,environment:'MT5 トレーニングEA'},
    {id:'stage-2',number:2,title:'MT5アプリ デモトレード',shortTitle:'MT5アプリ デモトレード',description:'スマホのMT5アプリでリアルタイムのデモトレード（成行エントリー）',status:'locked',unlocked:false,progress:0,environment:'MT5 アプリ'},
    {id:'stage-3',number:3,title:'TOM FX ZERO デモトレード',shortTitle:'TOM FX ZERO デモトレード',description:'TOM FX ZEROからのデモトレード（成行エントリー）',status:'locked',unlocked:false,progress:0,environment:'TOM FX ZERO PWA'}
  ];
  const fallbackTasks=[
    {id:'task-1-market',title:'課題1　成行注文の練習',detail:'BUY/SELL・ロット・TP/SL設定',required:true,complete:false},
    {id:'task-2-close',title:'課題2　手動決済の練習',detail:'ポジション確認・決済操作',required:true,complete:false},
    {id:'task-3-goto',title:'課題3　GOTO実践トレード',detail:'過去のゴトー日でルール通り取引',required:true,complete:false},
    {id:'task-4-reservations',title:'課題4　予約注文の練習（任意）',detail:'時間予約・予約確認・予約取消',required:false,complete:false}
  ];

  function connectionKey(){
    try{
      const profiles=JSON.parse(localStorage.getItem(PROFILE_KEY)||'[]');
      const activeId=localStorage.getItem(ACTIVE_PROFILE_KEY)||'';
      const profile=profiles.find(item=>item&&item.id===activeId)||profiles.find(item=>item&&item.connectionKey);
      if(profile&&typeof profile.connectionKey==='string')return profile.connectionKey.trim();
      return (localStorage.getItem(FALLBACK_KEY)||'').trim();
    }catch{return (localStorage.getItem(FALLBACK_KEY)||'').trim();}
  }
  function authHeaders(json=true){const key=connectionKey();return Object.assign({},key?{Authorization:'Bearer '+key}:{},json?{'Content-Type':'application/json'}:{});}
  async function api(path,options={}){
    const response=await fetch(API_BASE+path,Object.assign({headers:authHeaders()},options));
    const body=await response.json().catch(()=>({error:'invalid_server_response'}));
    if(!response.ok)throw new Error(body.error||'academy_api_error');
    return body;
  }
  function toast(message){const node=$('academyToast');node.textContent=message;node.hidden=false;clearTimeout(toast.timer);toast.timer=setTimeout(()=>node.hidden=true,4300);}
  function escapeHtml(value){return String(value??'').replace(/[&<>'"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));}
  function currentStages(){return state.progress?.stages?.length?state.progress.stages:stageFallback;}
  function activeStage(){return currentStages().find(stage=>stage.id===state.activeStage)||currentStages()[0];}
  function tasksFor(stageId){return state.progress?.tasks?.filter(task=>task.stageId===stageId)||fallbackTasks.map(task=>Object.assign({},task));}
  function scoreFor(stageId){return state.progress?.scores?.[stageId]||{totalTrades:0,winRate:0,totalPips:0,ruleCompliance:0,majorViolations:0,requiredTrades:10,requiredRuleCompliance:90};}
  function statusName(status){return ({locked:'未解放',in_progress:'進行中',completed:'修了',pending_review:'確認待ち'})[status]||'未解放';}
  function stageIcon(stage){return stage.id==='stage-1'?'▣':stage.id==='stage-2'?'▯':'ZF';}
  function renderStages(){
    const stages=currentStages();
    $('stageList').innerHTML=stages.map(stage=>{
      const selected=stage.id===state.activeStage;
      const locked=!stage.unlocked;
      const cls=['stage-card',selected?'is-active':'',locked?'is-locked':'',stage.status==='completed'?'is-complete':''].filter(Boolean).join(' ');
      const status=locked?'🔒':stage.status==='completed'?'✓':(Math.round(stage.progress||0)+'%');
      return `<button type="button" class="${cls}" data-stage-id="${escapeHtml(stage.id)}" aria-pressed="${selected}"><span class="stage-icon">${stageIcon(stage)}</span><span><h3>STAGE ${stage.number}</h3><strong>${escapeHtml(stage.title)}</strong><p>${escapeHtml(stage.description||'')}</p></span><span class="stage-status">${status}</span></button>`;
    }).join('');
    document.querySelectorAll('[data-stage-id]').forEach(button=>button.addEventListener('click',()=>{
      const stage=currentStages().find(item=>item.id===button.dataset.stageId);
      if(!stage?.unlocked){toast('このステージは、前の必須課題を合格すると解放されます。');return;}
      state.activeStage=stage.id;renderAll();
    }));
  }
  function renderMeta(){
    const stage=activeStage();
    $('activeStageTitle').textContent=`STAGE ${stage.number}：${stage.title}`;
    $('activeStageSub').textContent=`（${stage.environment||'TOM FX ZERO ACADEMY'}）`;
    $('metaSymbol').textContent=stage.id==='stage-1'?'USDJPY M1（過去相場検証モード）':stage.id==='stage-2'?'MT5アプリ デモ口座':'TOM FX ZERO デモ口座';
    $('metaDate').textContent=state.session?.targetDate?`検証日：${state.session.targetDate}（ゴトー日）`:'検証日：セッションを開始してください';
    $('metaTime').textContent='現在時刻（JST）'+new Intl.DateTimeFormat('ja-JP',{timeZone:'Asia/Tokyo',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(new Date());
    $('taskPanelTitle').innerHTML=`STAGE ${stage.number} の課題 <small>（${tasksFor(stage.id).length}ステップ）</small>`;
    $('scoreStage').textContent=`（STAGE ${stage.number}）`;
    const stageOne=stage.id==='stage-1';
    document.querySelectorAll('[data-stage-action="tester"]').forEach(node=>node.disabled=!stageOne);
  }
  function renderTasks(){
    const tasks=tasksFor(state.activeStage);
    const done=tasks.filter(task=>task.complete).length;
    $('taskSummary').textContent=`${done} / ${tasks.length} 完了`;
    $('taskList').innerHTML=tasks.map((task,index)=>`<li class="${task.complete?'complete':''} ${!task.complete&&index===done?'active':''}"><span><b>${escapeHtml(task.title||task.name||'課題')}</b><small>${escapeHtml(task.detail||task.description||'')}</small></span></li>`).join('');
  }
  function renderHistory(){
    const trades=(state.progress?.recentTrades||[]).filter(trade=>!trade.stageId||trade.stageId===state.activeStage).slice(0,6);
    const body=$('tradeHistory'),empty=$('historyEmpty');
    body.innerHTML=trades.map((trade,index)=>{
      const pips=Number(trade.pips||0);const side=String(trade.side||'').toUpperCase();
      return `<tr><td>${index+1}</td><td>${escapeHtml(trade.entryTimeJst||trade.entryTime||'--:--:--')}</td><td class="${side==='BUY'?'buy':'sell'}">${side||'--'}</td><td>${Number(trade.lot||0).toFixed(2)}</td><td>${escapeHtml(trade.exitTimeJst||trade.exitTime||'--:--:--')}</td><td class="${pips>=0?'positive':'negative'}">${pips>=0?'+':''}${pips.toFixed(1)}</td></tr>`;
    }).join('');
    empty.hidden=trades.length>0;
  }
  function renderScore(){
    const score=scoreFor(state.activeStage);const rule=Math.max(0,Math.min(100,Number(score.ruleCompliance||0)));
    $('ruleRate').textContent=score.totalTrades?Math.round(rule)+'%':'--%';
    $('scoreRing').style.strokeDashoffset=String(289-(289*rule/100));
    $('tradeCount').textContent=`${score.totalTrades||0} / ${score.requiredTrades||10} 回`;
    $('winRate').textContent=score.totalTrades?Number(score.winRate||0).toFixed(1)+'%':'--%';
    const pips=Number(score.totalPips||0);$('totalPips').textContent=score.totalTrades?(pips>=0?'+':'')+pips.toFixed(1)+' pips':'-- pips';
    $('majorViolations').textContent=(score.majorViolations||0)+' 件';
  }
  function renderPass(){
    const stage=activeStage();const score=scoreFor(stage.id);const tasks=tasksFor(stage.id);
    const required=tasks.filter(task=>task.required!==false);
    const taskPass=required.every(task=>task.complete);
    const tradePass=(score.totalTrades||0)>=(score.requiredTrades||10);
    const rulePass=(score.ruleCompliance||0)>=(score.requiredRuleCompliance||90);
    const violationPass=(score.majorViolations||0)===0;
    $('passTitle').textContent=`STAGE ${stage.number} 合格条件`;
    $('passConditions').innerHTML=[
      [taskPass,'必須課題：すべて完了'],[tradePass,`有効取引回数：${score.requiredTrades||10}回`],[rulePass,`ルール遵守率：${score.requiredRuleCompliance||90}%以上`],[violationPass,'重大違反：0件']
    ].map(([pass,label])=>`<li class="${pass?'':'not-ready'}">${label}</li>`).join('');
    const next=currentStages().find(item=>item.number===stage.number+1);const button=$('unlockStatus');
    button.textContent=stage.status==='completed'?(next?(next.unlocked?'✓ 次ステージ解放済み':'🔒 サーバー判定を確認中'):'✓ GOTO基礎カリキュラム修了'):next?`🔒 合格で STAGE ${next.number} をアンロック`:'🔒 合格で修了';
    button.classList.toggle('ready',stage.status==='completed');
  }
  function renderOverall(){
    const stages=currentStages();const value=Math.round(stages.reduce((sum,stage)=>sum+Number(stage.progress||0),0)/Math.max(stages.length,1));
    $('overallProgress').textContent=value+'%';$('overallProgressBar').style.width=value+'%';
  }
  function renderAll(){renderStages();renderMeta();renderTasks();renderHistory();renderScore();renderPass();renderOverall();drawChart();}
  function drawChart(){
    const canvas=$('academyChart');if(!canvas)return;const rect=canvas.getBoundingClientRect(),ratio=window.devicePixelRatio||1;
    canvas.width=Math.max(1,Math.floor(rect.width*ratio));canvas.height=Math.max(1,Math.floor(rect.height*ratio));const ctx=canvas.getContext('2d');ctx.scale(ratio,ratio);const width=rect.width,height=rect.height;
    ctx.clearRect(0,0,width,height);const seed=state.activeStage==='stage-1'?11:state.activeStage==='stage-2'?23:37;let value=height*.48;
    for(let i=0;i<48;i++){const x=12+i*((width-31)/48),open=value;const wave=Math.sin((i+seed)*1.83)*12+Math.cos((i+seed)*.47)*6;value=Math.max(22,Math.min(height-27,value+wave));const close=value,hi=Math.min(open,close)-8-Math.abs(Math.sin(i))*8,lo=Math.max(open,close)+8+Math.abs(Math.cos(i))*7;const up=close<=open;ctx.strokeStyle=up?'#31d8ff':'#fb566c';ctx.fillStyle=up?'#26ccef':'#e84660';ctx.lineWidth=1.3;ctx.beginPath();ctx.moveTo(x+4,hi);ctx.lineTo(x+4,lo);ctx.stroke();ctx.fillRect(x,Math.min(open,close),8,Math.max(2,Math.abs(close-open)));}
    ctx.setLineDash([5,4]);ctx.strokeStyle='#ffe651';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(0,height*.54);ctx.lineTo(width,height*.54);ctx.stroke();ctx.setLineDash([]);
  }
  async function loadProgress(){
    const key=connectionKey();const dot=$('connectionDot'),text=$('connectionText');
    if(!key){dot.className='status-dot error';text.textContent='TOM FX ZEROでデモ口座を接続してください';state.progress=null;renderAll();return;}
    try{state.progress=await api('/progress');dot.className='status-dot connected';text.textContent='ACADEMY サーバー接続済み';if(!currentStages().some(stage=>stage.id===state.activeStage))state.activeStage=currentStages()[0].id;renderAll();}
    catch(error){dot.className='status-dot error';text.textContent='同期待ち：'+(error.message==='invalid_connection_key'?'接続キーを確認':'サーバー接続を確認');state.progress=null;renderAll();}
  }
  function showDialog(html){$('academyDialogContent').innerHTML=html;$('academyDialog').showModal();}
  function download(name,content,type='application/json'){const url=URL.createObjectURL(new Blob([content],{type}));const link=document.createElement('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  async function startSession(){
    if(!connectionKey()){toast('先に通常のTOM FX ZEROでデモ口座をペアリングしてください。');return;}
    try{const result=await api('/session',{method:'POST',body:JSON.stringify({stageId:'stage-1',symbol:'USDJPY',timeframe:'M1',targetDate:null})});state.session=result.session;const config={apiBase:API_ORIGIN,sessionId:result.session.sessionId,uploadToken:result.uploadToken,stageId:'stage-1',resultFile:'TOM_FX_ZERO_TRAINER_results.jsonl'};download('TOM_FX_ZERO_Academy_Sync_Config.json',JSON.stringify(config,null,2));toast('同期設定ファイルをダウンロードしました。TRAINER EAと同期スクリプトへ同じ値を設定してください。');renderAll();}
    catch(error){toast('セッションを開始できません：'+error.message);}
  }
  function renderSecondary(view){
    const panel=$('academySecondaryView');const main=$('academyContent');if(view==='curriculum'){panel.hidden=true;main.hidden=false;return;}main.hidden=true;panel.hidden=false;
    const stage=activeStage();
    if(view==='training')panel.innerHTML=`<div class="secondary-head"><div><h2>トレーニングを開始</h2><p class="secondary-copy">STAGE 1 はMT5ストラテジーテスター内の専用パネルで操作します。PWAは結果を同期して、課題・成績・解放状態を表示します。</p></div></div><div class="session-actions"><button class="primary" id="startSession">STAGE 1 セッションを開始</button><button id="openTrainerGuide">TRAINER 導入手順</button><button id="refreshProgress">同期結果を更新</button></div><div class="settings-grid"><article class="settings-card"><h3>1. 過去相場を準備</h3><p>USDJPYまたはEURJPYのリアルティックを選び、MT5ストラテジーテスターでビジュアルモードを開始します。検証データ品質が不足する場合は正式採点から除外されます。</p></article><article class="settings-card"><h3>2. 結果を同期</h3><p>ここでセッションを開始すると、同期設定JSONをダウンロードします。EAの結果JSONLをPC側同期スクリプトが安全に送信します。</p></article><article class="settings-card"><h3>3. 必須課題を実施</h3><p>成行注文・手動決済・5日以上のゴトー日実践を完了します。勝率・利益額ではなく、ルール遵守を判定します。</p></article><article class="settings-card"><h3>現在のステージ</h3><p>${escapeHtml(stage.title)}：${escapeHtml(statusName(stage.status))}<br>次の解放判定はサーバー側で行われます。</p></article></div>`;
    else if(view==='report')panel.innerHTML=`<div class="secondary-head"><h2>戦績レポート</h2><button id="refreshProgress">更新</button></div><div class="settings-grid"><article class="settings-card"><h3>ルール遵守率</h3><p><strong>${scoreFor(stage.id).ruleCompliance||0}%</strong>　重大違反 ${scoreFor(stage.id).majorViolations||0} 件</p></article><article class="settings-card"><h3>取引集計</h3><p>取引回数 ${scoreFor(stage.id).totalTrades||0} 回<br>合計 ${Number(scoreFor(stage.id).totalPips||0).toFixed(1)} pips</p></article></div>`;
    else if(view==='settings')panel.innerHTML=`<div class="secondary-head"><h2>設定</h2></div><div class="settings-grid"><article class="settings-card"><h3>ACADEMY 接続</h3><p>通常のTOM FX ZEROで保存されたデモ接続キーを使用します。キーそのものはこの画面で表示・送信しません。</p><input value="${connectionKey()?'デモ接続済み':'未接続'}" readonly></article><article class="settings-card"><h3>同期結果の確認</h3><p>同期エラー時は、EAの結果ファイル・セッションID・アップロードトークンが一致しているか確認してください。同じ記録の再送はサーバーで重複集計されません。</p><button id="refreshProgress">同期結果を更新</button></article><article class="settings-card"><h3>管理者操作</h3><p>会員の例外解放、合格条件の変更、操作履歴確認は管理者APIで記録されます。管理画面用キーは会員端末へ保存しません。</p></article></div>`;
    else panel.innerHTML=`<div class="secondary-head"><h2>${({home:'ホーム',review:'検証・復習',badges:'実績・バッジ'})[view]||'ACADEMY'}</h2></div><p class="secondary-copy">この画面は、同期されたトレーニング結果に基づいて順次有効になります。まずSTAGE 1の必須課題を完了してください。</p>`;
    panel.querySelector('#startSession')?.addEventListener('click',startSession);
    panel.querySelector('#openTrainerGuide')?.addEventListener('click',()=>showDialog('<h2>MT5 TRAINER 導入手順</h2><p>1. <code>TOM_FX_ZERO_TRAINER.mq5</code> をMT5のMQL5/Expertsへコピーし、MetaEditorでコンパイルします。<br>2. ストラテジーテスターでUSDJPYまたはEURJPY、リアルティック、ビジュアルモードを選択します。<br>3. この画面で開始したセッションIDとアップロードトークンをEA設定へ入力します。<br>4. 同期設定JSONをPowerShellスクリプトへ渡し、結果JSONLを同期します。</p>'));
    panel.querySelectorAll('#refreshProgress').forEach(button=>button.addEventListener('click',loadProgress));
  }
  function bindNav(){document.querySelectorAll('#academyNav button').forEach(button=>button.addEventListener('click',()=>{state.view=button.dataset.view||'curriculum';document.querySelectorAll('#academyNav button').forEach(item=>item.classList.toggle('is-active',item===button));renderSecondary(state.view);}));}
  function bindControls(){document.querySelectorAll('[data-stage-action="tester"]').forEach(button=>button.addEventListener('click',()=>toast('STAGE 1の注文・決済・予約操作は、MT5ストラテジーテスター内のTOM FX ZERO TRAINERパネルで実行します。')));$('academyNotice').addEventListener('click',()=>toast('新しい通知はありません。'));$('academyProfile').addEventListener('click',()=>toast(connectionKey()?'デモ接続で学習記録を同期中です。':'デモ口座を接続すると学習記録を保存できます。'));window.addEventListener('resize',drawChart);}
  function tick(){if(!state.session)$('metaTime').textContent='現在時刻（JST）'+new Intl.DateTimeFormat('ja-JP',{timeZone:'Asia/Tokyo',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(new Date());}
  bindNav();bindControls();renderSecondary('curriculum');loadProgress();setInterval(tick,1000);setInterval(()=>connectionKey()&&loadProgress(),60000);
})();
