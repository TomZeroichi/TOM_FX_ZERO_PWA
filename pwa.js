'use strict';
(() => {
  const installButton=document.getElementById('installPwa');
  const installGuide=document.getElementById('installGuide');
  const closeInstallGuide=document.getElementById('closeInstallGuide');
  const message=document.getElementById('message');
  let installPrompt=null;
  const standalone=window.matchMedia('(display-mode: standalone)').matches||window.navigator.standalone===true;

  function showManualInstall(){
    if(standalone||installPrompt)return;
    installButton.hidden=false;
    installButton.disabled=false;
    installButton.textContent='ホーム画面へ追加';
  }

  function showNativeInstall(){
    if(standalone)return;
    installButton.hidden=false;
    installButton.disabled=false;
    installButton.textContent='アプリとして追加';
  }

  if(standalone){
    installButton.hidden=true;
  }else{
    installButton.hidden=false;
    installButton.disabled=true;
    installButton.textContent='PWA準備中';
  }

  window.addEventListener('beforeinstallprompt',event=>{
    event.preventDefault();
    installPrompt=event;
    showNativeInstall();
  });

  installButton.addEventListener('click',async()=>{
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

  closeInstallGuide.addEventListener('click',()=>installGuide.close());
  window.addEventListener('appinstalled',()=>{
    installPrompt=null;
    installButton.hidden=true;
    message.textContent='PWAとしてインストールしました。';
  });

  if('serviceWorker' in navigator&&location.protocol.startsWith('http')){
    navigator.serviceWorker.addEventListener('controllerchange',()=>{
      const reloadKey='tomFxPwaControllerReloaded_0.4.85';
      if(sessionStorage.getItem(reloadKey)==='done')return;
      sessionStorage.setItem(reloadKey,'done');
      location.reload();
    },{once:true});

    window.addEventListener('load',async()=>{
      try{
        const registration=await navigator.serviceWorker.register('./service-worker.js?v=0.4.85',{scope:'./'});
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
