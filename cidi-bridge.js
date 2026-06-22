/* =====================================================================
   CiDi Bridge  -  Nuts and Bolts Screw Puzzle
   ---------------------------------------------------------------------
   Sequestra o plugin "Mobile Advert" (AdMob) do Construct 3 (lado WEB)
   e redireciona TODO rewarded/video para o anuncio REAL da CiDi.

   Integra 3 coisas (docs CiDi):
     - STORAGE : CiDiSDK.init()                 (localStorage no Pi Browser)
     - ADS     : CiDiSDK.showRewardedAd()       (anuncio recompensado)
     - LOGIN   : CidiProxySDK.createClient().auth.login()  (autenticacao Pi)

   Carregado como <script> CLASSICO ANTES dos modulos do jogo.
   ===================================================================== */
(function () {
  "use strict";

  var TAG = "[CiDi-Bridge]";
  function log() { try { console.log.apply(console, [TAG].concat([].slice.call(arguments))); } catch (e) {} }
  function warn() { try { console.warn.apply(console, [TAG].concat([].slice.call(arguments))); } catch (e) {} }

  /* ===================================================================
     CONFIG  -- PREENCHER
     =================================================================== */
  // API key do app "Nuts and Bolts" na CiDi (usada pelo LOGIN/proxy).
  // Pegue no painel da CiDi depois de criar o app. Formato: "CIDI_xxxxxxxx".
  var CIDI_API_KEY   = "CIDI_375E328A49524C25";              // key real - app Nuts and Bolts
  var PROXY_BASE_URL = "https://elf-proxy.cidi.games/api/v1";

  // URLs dos SDKs (com versao p/ evitar cache velho)
  var SDK_VER   = "20260427-expose-init-await-pi-init-1";
  var CIDI_SDK  = "https://app.cidi.games/sdk/cidi-sdk.js?v=" + SDK_VER;       // storage + ads
  var PROXY_SDK = "https://elf-resource.cidi.games/sdk/cidi-proxy-sdk.umd.js"; // login/report

  var REWARD_RESULT = JSON.stringify(["reward", 1]); // [tipo, valor] entregue ao jogo

  /* ===================================================================
     1) CAMADA CiDi  (storage + ads + login)
     =================================================================== */
  var CiDiReady = false;     // SDK de ads/storage carregado
  var proxyClient = null;    // client de login/report
  var loggedIn = false;

  function isDev() {
    try {
      var h = location.hostname;
      return location.protocol === "file:" || h === "localhost" || h === "127.0.0.1" || h === "";
    } catch (e) { return false; }
  }

  function injectScript(src, onload, onerror) {
    var s = document.createElement("script");
    s.src = src; s.async = false;
    s.onload = function () { try { onload && onload(); } catch (e) { warn("onload erro", e); } };
    s.onerror = function () { try { onerror && onerror(); } catch (e) {} };
    (document.head || document.documentElement).appendChild(s);
  }

  function loadCidiSdk() {
    // --- 1) cidi-sdk.js : storage (init) + ads (showRewardedAd) ---
    injectScript(CIDI_SDK, function () {
      CiDiReady = (typeof self.CiDiSDK !== "undefined");
      log("cidi-sdk.js carregado. CiDiSDK:", CiDiReady);
      // STORAGE: garante localStorage no Pi Browser ANTES dos saves do jogo
      try {
        if (self.CiDiSDK && typeof CiDiSDK.init === "function") {
          CiDiSDK.init()
            .then(function () { log("CiDiSDK.init() OK (storage pronto)"); })
            .catch(function (e) { warn("CiDiSDK.init() falhou:", e && (e.message || e)); });
        }
      } catch (e) { warn("init excecao:", e); }
    }, function () {
      CiDiReady = false;
      warn("FALHA ao carregar cidi-sdk.js (ads/storage indisponiveis)");
    });

    // --- 2) cidi-proxy-sdk.umd.js : login (autenticacao Pi) ---
    injectScript(PROXY_SDK, function () {
      try {
        if (self.CidiProxySDK && typeof CidiProxySDK.createClient === "function") {
          proxyClient = CidiProxySDK.createClient({ baseURL: PROXY_BASE_URL, apiKey: CIDI_API_KEY });
          // login precisa de ?tempToken=... na URL (a plataforma injeta).
          // Em dev/navegador comum nao tem -> falha esperada, seguimos sem login.
          proxyClient.auth.login()
            .then(function () { loggedIn = true; log("login CiDi OK"); })
            .catch(function (err) {
              loggedIn = false;
              log("login CiDi nao concluido (" + (err && err.code) + ") - normal fora do Pi/sem tempToken");
            });
        }
      } catch (e) { warn("proxy/login excecao:", e); }
    }, function () {
      warn("FALHA ao carregar cidi-proxy-sdk.umd.js (login indisponivel)");
    });
  }

  // showCidiRewarded(onReward, onFail)
  //   onReward(): success === true  -> entrega o premio
  //   onFail()  : qualquer outro caso (sem fill, fechou no meio, erro, timeout)
  function showCidiRewarded(onReward, onFail) {
    onReward = onReward || function () {};
    onFail   = onFail   || function () {};

    if (self.CiDiSDK && typeof CiDiSDK.showRewardedAd === "function") {
      try {
        CiDiSDK.showRewardedAd() // options.timeout opcional (default 300000ms)
          .then(function (result) {
            if (result && result.success === true) {
              log("rewarded SUCCESS");
              onReward();
            } else {
              log("rewarded sem recompensa:", result);
              onFail();
            }
          })
          .catch(function (err) {
            warn("rewarded FALHOU:", err && (err.error || err.message || err));
            onFail();
          });
      } catch (e) { warn("showRewardedAd excecao:", e); onFail(); }
      return;
    }

    // SDK ainda nao disponivel:
    if (isDev()) {
      // Em dev (localhost/file) concede direto p/ voce conseguir testar o fluxo.
      log("DEV: CiDiSDK ausente -> concedendo recompensa p/ teste");
      onReward();
    } else {
      // Em producao sem SDK = sem anuncio confiavel -> NAO concede.
      warn("CiDiSDK ausente em producao -> sem recompensa");
      onFail();
    }
  }

  /* ===================================================================
     2) HIJACK do Mobile Advert (lado web)  -- inalterado
     =================================================================== */
  function ok(cb, result) { try { cb(null, result == null ? "ok" : result); } catch (e) {} }
  function fail(cb, msg) { try { cb(msg || "cancelled"); } catch (e) {} }

  function runReward(cb) {
    try { if (typeof cidiWeb.suspendRuntime === "function") cidiWeb.suspendRuntime(); } catch (e) {}
    showCidiRewarded(
      function () { ok(cb, REWARD_RESULT); },     // recompensa
      function () { fail(cb, "no-fill"); }         // cancelou / sem fill / erro
    );
  }

  function lastArg() { return arguments.length ? arguments[arguments.length - 1] : null; }

  var cidiWeb = {
    Configure: function () { ok(lastArg.apply(null, arguments)); },
    RequestConsent: function () { ok(lastArg.apply(null, arguments)); },
    SetUserPersonalisation: function () { ok(lastArg.apply(null, arguments)); },
    SetMaxAdContentRating: function () { ok(lastArg.apply(null, arguments)); },
    TagForChildDirectedTreatment: function () { ok(lastArg.apply(null, arguments)); },
    TagForUnderAgeOfConsent: function () { ok(lastArg.apply(null, arguments)); },
    RequestIDFA: function () { ok(lastArg.apply(null, arguments), "not-determined"); },
    StatusUpdate: function () { ok(lastArg.apply(null, arguments), "UNKNOWN&&not-determined&&true"); },

    CreateBannerAdvert: function () { ok(lastArg.apply(null, arguments)); },
    ShowBannerAdvert: function (cb) { ok(cb); },
    HideBannerAdvert: function (cb) { ok(cb); },

    CreateInterstitialAdvert: function () { ok(lastArg.apply(null, arguments)); },
    ShowInterstitialAdvert: function (cb) { ok(cb); },

    CreateRewardedInterstitialAdvert: function () { ok(lastArg.apply(null, arguments)); },
    ShowRewardedInterstitialAdvert: function (cb) { runReward(cb); },

    CreateVideoAdvert: function () { ok(lastArg.apply(null, arguments)); },
    ShowVideoAdvert: function (cb) { runReward(cb); },

    CreateRewardedAdvert: function () { ok(lastArg.apply(null, arguments)); },
    ShowRewardedAdvert: function (cb) { runReward(cb); }
  };

  var api = (self["C3MobileAdvertsAPI"] = self["C3MobileAdvertsAPI"] || {});
  try {
    Object.defineProperty(api, "web", {
      configurable: true,
      get: function () { return cidiWeb; },
      set: function (v) { api._realWeb = v; }
    });
    log("gancho instalado via getter/setter");
  } catch (e) {
    api.web = cidiWeb;
    log("gancho instalado via atribuicao direta");
  }

  loadCidiSdk();
  log("pronto. rewarded/video -> CiDi real (key:", CIDI_API_KEY === "CIDI_PLACEHOLDER_KEY" ? "PLACEHOLDER!" : "ok", ")");
})();
