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
  var dbgLog = [];
  function dbgCapture(kind, a) {
    try {
      var t = new Date().toTimeString().substr(0, 8);
      var msg = [].map.call(a, function (x) {
        try { return (x && typeof x === "object") ? JSON.stringify(x) : String(x); } catch (e) { return "?"; }
      }).join(" ");
      dbgLog.push((kind === "w" ? "! " : "  ") + t + " " + msg);
      if (dbgLog.length > 250) dbgLog.shift();
      if (typeof refreshDbgPanel === "function") refreshDbgPanel();
    } catch (e) {}
  }
  function log()  { dbgCapture("l", arguments); try { console.log.apply(console, [TAG].concat([].slice.call(arguments))); } catch (e) {} }
  function warn() { dbgCapture("w", arguments); try { console.warn.apply(console, [TAG].concat([].slice.call(arguments))); } catch (e) {} }

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
      "#cidi-ad-ov.on{opacity:1;visibility:visible}" +  /* nunca bloqueia toque: so visual */
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
    var safety = setTimeout(function () { deny("timeout"); }, 90000); // so dispara em travamento real (anuncio normal < 90s)

    if (self.CiDiSDK && typeof CiDiSDK.showRewardedAd === "function") {
      try {
        CiDiSDK.showRewardedAd({ timeout: 90000 }) // limite do proprio SDK (default era 300000ms)
          .then(function (result) {
            clearTimeout(safety);
            // promise resolveu = anuncio assistido/recompensado.
            // So nega se a CiDi disser explicitamente que NAO recompensou.
            if (result && result.success === false) { log("rewarded sem recompensa:", result); deny("no-reward"); }
            else { log("rewarded SUCCESS", result); grant(); }
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

  /* ===================================================================
     DEBUG PANEL  -- botao "DBG" flutuante p/ checar o SDK no Pi Browser
     (remover/desligar antes do lancamento final)
     =================================================================== */
  function liveState() {
    function yn(b){ return b ? "SIM" : "nao"; }
    var hasSDK   = (typeof self.CiDiSDK !== "undefined");
    var hasProxy = (typeof self.CidiProxySDK !== "undefined");
    var lines = [
      "host: " + (location.hostname || "(vazio)") + "  proto: " + location.protocol,
      "isDev: " + yn(isDev()),
      "tempToken na URL: " + yn(/tempToken=/.test((location.search || "") + (location.hash || ""))),
      "",
      "cidi-sdk.js (CiDiSDK): " + (hasSDK ? "CARREGADO" : "AUSENTE"),
      "   .init(): " + (hasSDK && typeof CiDiSDK.init === "function" ? "ok" : "-"),
      "   .showRewardedAd(): " + (hasSDK && typeof CiDiSDK.showRewardedAd === "function" ? "ok" : "-"),
      "",
      "proxy-sdk (CidiProxySDK): " + (hasProxy ? "CARREGADO" : "AUSENTE"),
      "   proxyClient: " + (proxyClient ? "criado" : "-"),
      "   loggedIn: " + yn(loggedIn),
      "",
      "API key: " + (CIDI_API_KEY ? CIDI_API_KEY.substr(0, 10) + "..." : "-")
    ];
    return lines.join("\n");
  }
  function refreshDbgPanel() {
    try {
      var st = document.getElementById("cidi-dbg-state");
      var lg = document.getElementById("cidi-dbg-log");
      if (st) st.textContent = liveState();
      if (lg) { lg.textContent = dbgLog.join("\n"); lg.scrollTop = lg.scrollHeight; }
    } catch (e) {}
  }
  function buildDebugButton() {
    try {
      if (!document.body || document.getElementById("cidi-dbg-btn")) return;
      var st = document.createElement("style");
      st.textContent =
        "#cidi-dbg-btn{position:fixed;left:6px;bottom:6px;z-index:100000;background:#1f2540;color:#ffd34d;" +
        "font:bold 11px Arial;padding:7px 10px;border-radius:6px;opacity:.9;border:1px solid #3a4060;cursor:pointer}" +
        "#cidi-dbg-panel{position:fixed;left:6px;bottom:44px;width:min(92vw,360px);z-index:100000;display:none;" +
        "background:#0d1020;color:#cfe;border:1px solid #3a4060;border-radius:8px;padding:9px;box-shadow:0 4px 20px rgba(0,0,0,.5)}" +
        "#cidi-dbg-head{font:bold 13px Arial;color:#fff;margin-bottom:7px;display:flex;justify-content:space-between;align-items:center}" +
        "#cidi-dbg-close{cursor:pointer;color:#f88;font-size:16px}" +
        "#cidi-dbg-state{white-space:pre-wrap;color:#9fd;margin:0 0 8px;font:11px/1.45 monospace}" +
        "#cidi-dbg-actions{margin-bottom:8px}" +
        "#cidi-dbg-actions button{font:11px Arial;padding:6px 9px;margin-right:6px;background:#2a335c;color:#fff;border:0;border-radius:5px;cursor:pointer}" +
        "#cidi-dbg-log{white-space:pre-wrap;color:#bcd;background:#070a16;max-height:32vh;overflow:auto;padding:7px;margin:0;border-radius:5px;font:10px/1.4 monospace}";
      document.head.appendChild(st);

      var btn = document.createElement("div");
      btn.id = "cidi-dbg-btn"; btn.textContent = "DBG";
      document.body.appendChild(btn);

      var panel = document.createElement("div");
      panel.id = "cidi-dbg-panel";
      panel.innerHTML =
        '<div id="cidi-dbg-head"><span>CiDi Debug</span><span id="cidi-dbg-close">&#10006;</span></div>' +
        '<pre id="cidi-dbg-state"></pre>' +
        '<div id="cidi-dbg-actions"><button id="cidi-dbg-test">Testar an&uacute;ncio</button>' +
        '<button id="cidi-dbg-reload">Atualizar</button></div>' +
        '<pre id="cidi-dbg-log"></pre>';
      document.body.appendChild(panel);

      btn.addEventListener("click", function () {
        panel.style.display = (panel.style.display === "block" ? "none" : "block");
        refreshDbgPanel();
      });
      document.getElementById("cidi-dbg-close").addEventListener("click", function () { panel.style.display = "none"; });
      document.getElementById("cidi-dbg-reload").addEventListener("click", refreshDbgPanel);
      document.getElementById("cidi-dbg-test").addEventListener("click", function () {
        log("DEBUG: teste manual de rewarded iniciado");
        showCidiRewarded(
          function () { log("DEBUG: rewarded -> SUCCESS (premio concedido)"); },
          function () { log("DEBUG: rewarded -> FAIL (sem premio)"); }
        );
      });
      refreshDbgPanel();
      log("painel DBG pronto (botao no canto inferior esquerdo)");
    } catch (e) { warn("falha ao montar DBG:", e); }
  }
  if (document.body) buildDebugButton();
  else document.addEventListener("DOMContentLoaded", buildDebugButton);
  // reforco: tenta de novo apos o load (caso o body so exista depois)
  setTimeout(buildDebugButton, 1500);
  setTimeout(buildDebugButton, 4000);

  loadCidiSdk();
  log("pronto. rewarded/video -> CiDi real (key:", CIDI_API_KEY === "CIDI_PLACEHOLDER_KEY" ? "PLACEHOLDER!" : "ok", ")");
})();
