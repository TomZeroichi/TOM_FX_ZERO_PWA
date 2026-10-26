'use strict';
const CACHE_NAME='tom-fx-zero-shell-0.5.26';
const APP_SHELL=[
  './',
  './index.html',
  './style.css',
  './calc.js',
  './lightweight-charts.standalone.production.js',
  './app.js',
  './pwa.js',
  './manifest.webmanifest',
  './icons/app-icon.svg?v=0.5.26'
];

self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE_NAME).then(cache=>cache.addAll(APP_SHELL)).then(()=>self.skipWaiting()));
});

self.addEventListener('activate',event=>{
  event.waitUntil(
    caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE_NAME).map(key=>caches.delete(key)))).then(()=>self.clients.claim())
  );
});

self.addEventListener('fetch',event=>{
  const request=event.request;
  if(request.method!=='GET')return;
  const url=new URL(request.url);
  if(url.origin!==self.location.origin)return;
  if(url.pathname.startsWith('/api/'))return;

  event.respondWith((async()=>{
    const refresh=fetch(request).then(response=>{
      if(response.ok)caches.open(CACHE_NAME).then(cache=>cache.put(request,response.clone()));
      return response;
    }).catch(()=>null);

    // 起動画面は必ず最新ファイルを優先。オフライン時だけキャッシュへ戻す。
    if(request.mode==='navigate'){
      const network=await refresh;
      if(network)return network;
      return caches.match('./index.html');
    }

    const cached=await caches.match(request);
    if(cached){
      event.waitUntil(refresh);
      return cached;
    }
    const network=await refresh;
    if(network)return network;
    return new Response('Offline',{status:503,statusText:'Offline'});
  })());
});
