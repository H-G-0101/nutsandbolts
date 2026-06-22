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
     UI  -- indicador "carregando anuncio" (overlay HTML/CSS)
     =================================================================== */
  var adUIReady = false, adHideTimer = null;
  function ensureAdUI() {
    if (adUIReady || !document.body) return adUIReady;
    adUIReady = true;
    var st = document.createElement("style");
    st.textContent =
      "#cidi-ad-ov{position:fixed;inset:0;z-index:99990;display:flex;flex-direction:column;" +
      "align-items:center;justify-content:center;background:rgba(8,10,22,.74);" +
      "font-family:Arial,Helvetica,sans-serif;color:#fff;opacity:0;visibility:hidden;" +
      "transition:opacity .18s;pointer-events:none;-webkit-tap-highlight-color:transparent}" +
      "#cidi-ad-ov.on{opacity:1;visibility:visible;pointer-events:auto}" +
      "#cidi-ad-ov .sp{width:56px;height:56px;border-radius:50%;border:5px solid rgba(255,255,255,.22);" +
      "border-top-color:#ffd34d;animation:cidiSpin .8s linear infinite}" +
      "#cidi-ad-ov.msg .sp{display:none}" +
      "#cidi-ad-ov .tx{margin-top:18px;font-size:17px;font-weight:bold;letter-spacing:.3px;text-align:center;padding:0 24px}" +
      "#cidi-ad-ov .sub{margin-top:5px;font-size:12px;opacity:.65}" +
      "#cidi-ad-ov.msg .sub{display:none}" +
      "@keyframes cidiSpin{to{transform:rotate(360deg)}}";
    document.head.appendChild(st);
    var ov = document.createElement("div");
    ov.id = "cidi-ad-ov";
    ov.innerHTML = '<div class="sp"></div><div class="tx" id="cidi-ad-tx">Loading ad\u2026</div><div class="sub">please wait</div>';
    document.body.appendChild(ov);
    return true;
  }
  function showAdLoading(msg) {
    try {
      if (!ensureAdUI()) return;
      var ov = document.getElementById("cidi-ad-ov"), tx = document.getElementById("cidi-ad-tx");
      ov.classList.remove("msg");
      if (tx) tx.textContent = msg || "Loading ad\u2026";
      ov.classList.add("on");
      if (adHideTimer) { clearTimeout(adHideTimer); adHideTimer = null; }
      // recolhe o spinner depois de um tempinho pra nao cobrir o anuncio quando ele abrir
      adHideTimer = setTimeout(function () { hideAdLoading(); }, 1500);
    } catch (e) {}
  }
  function hideAdLoading() {
    try {
      if (adHideTimer) { clearTimeout(adHideTimer); adHideTimer = null; }
      var ov = document.getElementById("cidi-ad-ov");
      if (ov) ov.classList.remove("on");
    } catch (e) {}
  }
  function showAdMessage(msg, ms) {
    try {
      if (!ensureAdUI()) return;
      var ov = document.getElementById("cidi-ad-ov"), tx = document.getElementById("cidi-ad-tx");
      if (tx) tx.textContent = msg || "No ad available";
      ov.classList.add("msg"); ov.classList.add("on");
      if (adHideTimer) { clearTimeout(adHideTimer); }
      adHideTimer = setTimeout(function () { hideAdLoading(); ov.classList.remove("msg"); }, ms || 1600);
    } catch (e) {}
  }

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

    var settled = false;
    showAdLoading("Loading ad\u2026");                 // <-- indicador ON
    function grant() { if (settled) return; settled = true; hideAdLoading(); onReward(); }
    function deny(reason) {
      if (settled) return; settled = true;
      hideAdLoading();
      showAdMessage("No ad available");               // <-- feedback de falha
      onFail();
    }
    var safety = setTimeout(function () { deny("timeout"); }, 30000); // nunca trava

    if (self.CiDiSDK && typeof CiDiSDK.showRewardedAd === "function") {
      try {
        CiDiSDK.showRewardedAd() // options.timeout opcional (default 300000ms)
          .then(function (result) {
            clearTimeout(safety);
            if (result && result.success === true) { log("rewarded SUCCESS"); grant(); }
            else { log("rewarded sem recompensa:", result); deny("no-reward"); }
          })
          .catch(function (err) {
            clearTimeout(safety);
            warn("rewarded FALHOU:", err && (err.error || err.message || err));
            deny("error");
          });
      } catch (e) { clearTimeout(safety); warn("showRewardedAd excecao:", e); deny("exception"); }
      return;
    }

    // SDK ainda nao disponivel:
    if (isDev()) {
      // Em dev (localhost/file) concede direto, com o spinner aparecendo ~0.8s p/ voce ver o indicador.
      log("DEV: CiDiSDK ausente -> concedendo recompensa p/ teste");
      setTimeout(function () { clearTimeout(safety); grant(); }, 800);
    } else {
      // Em producao sem SDK = sem anuncio confiavel -> NAO concede.
      clearTimeout(safety);
      warn("CiDiSDK ausente em producao -> sem recompensa");
      deny("no-sdk");
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
