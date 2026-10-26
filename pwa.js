'use strict';
(() => {
  const installButton=document.getElementById('installPwa');
  const installGuide=document.getElementById('installGuide');
  const closeInstallGuide=document.getElementById('closeInstallGuide');
  const message=document.getElementById('message');
  let installPrompt=null;
  const standalone=window.matchMedia('(display-mode: standalone)').matches||window.navigator.standalone===true;
  const desktopWeb=window.matchMedia('(min-width:1000px)').matches&&!standalone;
  // Android/PWAのブラウザ領域・システムバーへ黒を明示する。
  const applyBlackSystemBars=()=>{
    document.documentElement.style.backgroundColor='#000000';
    document.body?.style.setProperty('background-color','#000000','important');
    document.querySelectorAll('meta[name="theme-color"]').forEach(meta=>meta.setAttribute('content','#000000'));
  };
  applyBlackSystemBars();

  function showManualInstall(){
    if(!installButton||standalone||installPrompt)return;
    installButton.hidden=false;
    installButton.disabled=false;
    installButton.textContent='ホーム画面へ追加';
  }

  function showNativeInstall(){
    if(!installButton||standalone)return;
    installButton.hidden=false;
    installButton.disabled=false;
    installButton.textContent='アプリとして追加';
  }

  if(installButton){
    if(standalone){
      installButton.hidden=true;
    }else{
      installButton.hidden=false;
      installButton.disabled=true;
    }
  }

  window.addEventListener('beforeinstallprompt',event=>{
    if(!installButton)return;
    event.preventDefault();
    installPrompt=event;
    showNativeInstall();
  });

  installButton?.addEventListener('click',async()=>{
    if(!installPrompt){
      installGuide.showModal();
      return;
    }
    installButton.disabled=true;
    installPrompt.prompt();
    const choice=await installPrompt.userChoice;
    if(choice.outcome==='accepted'){
      installButton.hidden=true;
      message.textContent='ホーム画面へ追加しました。TOM FX ZEROのアイコンから起動できます。';
    }else{
      installButton.disabled=false;
    }
    installPrompt=null;
  });

  closeInstallGuide?.addEventListener('click',()=>installGuide?.close());
  window.addEventListener('appinstalled',()=>{
    installPrompt=null;
    if(installButton)installButton.hidden=true;
    message.textContent='PWAとしてインストールしました。';
  });

  if(desktopWeb&&'serviceWorker' in navigator){
    // PC Web版は常にネットワークから最新画面を読む。端末内の接続情報は削除しない。
    window.addEventListener('load',()=>{
      navigator.serviceWorker.getRegistrations()
        .then(registrations=>Promise.all(registrations.map(registration=>registration.unregister())))
        .catch(()=>{});
    });
  }else if('serviceWorker' in navigator&&location.protocol.startsWith('http')){
    navigator.serviceWorker.addEventListener('controllerchange',()=>{
      const reloadKey='tomFxPwaControllerReloaded_0.5.25';
      if(sessionStorage.getItem(reloadKey)==='done')return;
      sessionStorage.setItem(reloadKey,'done');
      location.reload();
    },{once:true});

    window.addEventListener('load',async()=>{
      try{
        const registration=await navigator.serviceWorker.register('./service-worker.js?v=0.5.25',{scope:'./'});
        await registration.update();
        await navigator.serviceWorker.ready;
        if(navigator.serviceWorker.controller)showManualInstall();
        setTimeout(showManualInstall,3000);
      }catch{
        showManualInstall();
        message.textContent='PWAの準備に失敗しました。Chromeでページを再読み込みしてください。';
      }
    });
  }else{
    showManualInstall();
  }
})();
