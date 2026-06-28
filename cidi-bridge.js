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

  // Forca o runtime do Construct a "resumir" (sair do estado Suspending) apos o anuncio.
  // O jogo suspende durante o ad via C3MobileAdvertsAPI.real.suspendRuntime(); se a falha
  // nao resumir, o jogo trava. Chamamos o resume real defensivamente.
  function forceResume(where) {
    var did = [];
    try {
      var api = self["C3MobileAdvertsAPI"];
      if (api) {
        // o resume e injetado pelo C3 no objeto que _GetApi() retorna; no web isso
        // e o nosso cidiWeb, mas varremos real/fake/web por seguranca.
        ["web", "real", "fake"].forEach(function (k) {
          try {
            var o = api[k];
            if (o && typeof o["resumeRuntime"] === "function") { o["resumeRuntime"](); did.push(k); }
          } catch (e) {}
        });
      }
      // o cidiWeb e o objeto que o C3 enriquece com resumeRuntime (caso o getter o esconda)
      try {
        if (typeof cidiWeb !== "undefined" && cidiWeb && typeof cidiWeb["resumeRuntime"] === "function") {
          cidiWeb["resumeRuntime"](); did.push("cidiWeb");
        }
      } catch (e) {}
    } catch (e) {}
    log("forceResume(" + where + ") -> " + (did.length ? did.join(",") : "nenhum alvo"));
  }

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
            .then(function () { loggedIn = true; log("login CiDi OK"); startProgressMonitor(); })
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

  /* ===================================================================
     TASK / EVENT / MEDAL  -- reporte via proxyClient (mesmo client do login)
     APIs (doc CiDi):
       task   : proxyClient.report.gameTask({completeTime, metadata})
       event  : proxyClient.report.tournamentScore({score, reportedAt})
       medal  : proxyClient.report.medal() / medalOwnership()
     =================================================================== */
  function loggedReady() { return !!(proxyClient && loggedIn); }

  function bizDateToday() {
    var d = new Date(); function p(n){ return (n<10?"0":"")+n; }
    return "" + d.getFullYear() + p(d.getMonth()+1) + p(d.getDate());
  }

  // status das 3 SDKs p/ exibir no painel DBG
  var cidiStat = { task: "—", event: "—", medal: "—" };
  function hhmmss() { return new Date().toTimeString().substr(0, 8); }
  function setStat(k, msg) { cidiStat[k] = msg + " (" + hhmmss() + ")"; try { if (typeof refreshDbgPanel === "function") refreshDbgPanel(); } catch (e) {} }

  var CidiReport = {
    task: function (metadata, onOk) {
      if (!loggedReady()) { warn("task: sem login"); setStat("task", "sem login"); return; }
      setStat("task", "enviando…");
      try {
        proxyClient.report.gameTask({
          completeTime: Math.floor(Date.now()/1000),
          metadata: (typeof metadata === "string") ? metadata : JSON.stringify(metadata || {})
        }).then(function(){ log("task diaria reportada"); setStat("task", "ENVIADA ok"); if (onOk) onOk(); })
          .catch(function(e){ var c=e&&(e.code||e.message); warn("task falhou:", c); setStat("task", "FALHA: "+c); });
      } catch (e) { warn("task excecao:", e); setStat("task", "EXCECAO"); }
    },
    tournament: function (score, onOk) {
      if (!loggedReady()) { warn("tournament: sem login"); setStat("event", "sem login"); return; }
      setStat("event", "enviando score "+score+"…");
      try {
        proxyClient.report.tournamentScore({
          score: String(score), reportedAt: Math.floor(Date.now()/1000)
        }).then(function(){ log("tournament score reportado:", score); setStat("event", "ENVIADO score="+score); if (onOk) onOk(); })
          .catch(function(e){ var c=e&&(e.code||e.message); warn("tournament falhou:", c); setStat("event", "FALHA: "+c); });
      } catch (e) { warn("tournament excecao:", e); setStat("event", "EXCECAO"); }
    },
    medalClaim: function (onOk) {
      if (!loggedReady()) { warn("medal: sem login"); setStat("medal", "sem login"); return; }
      setStat("medal", "reivindicando…");
      try {
        proxyClient.report.medal()
          .then(function(){ log("medalha reivindicada"); setStat("medal", "REIVINDICADA ok"); if (onOk) onOk(); })
          .catch(function(e){ var c=e&&(e.code||e.message); warn("medal falhou:", c); setStat("medal", "FALHA: "+c); });
      } catch (e) { warn("medal excecao:", e); setStat("medal", "EXCECAO"); }
    },
    medalOwned: function (cb) {
      if (!loggedReady()) { if (cb) cb(null); return; }
      try {
        proxyClient.report.medalOwnership()
          .then(function(r){
            // doc CiDi: { owned: boolean }. defensivo p/ outros formatos.
            var owned = (r === true) || !!(r && (r.owned === true || r.owned === 1 || r.hasOwned === true));
            setStat("medal", "owned=" + owned); if (cb) cb(owned);
          })
          .catch(function(e){ warn("medalOwnership falhou:", e && (e.code||e.message)); if (cb) cb(null); });
      } catch (e) { warn("medalOwnership excecao:", e); if (cb) cb(null); }
    }
  };

  // expoe p/ chamadas manuais (Browser.ExecuteJavaScript / botoes DBG)
  self.CidiBridge = self.CidiBridge || {};
  self.CidiBridge.reportTask       = function(m){ CidiReport.task(m); };
  self.CidiBridge.reportTournament = function(s){ CidiReport.tournament(s); };
  self.CidiBridge.claimMedal       = function(){ CidiReport.medalClaim(); };
  self.CidiBridge.checkMedal       = function(cb){ CidiReport.medalOwned(cb); };

  /* --- monitor de progresso: detecta vitoria de nivel pelo storage do C3 ---
     O plugin LocalStorage do C3 grava via localforage no IndexedDB:
       banco = "c3-localstorage-" + ProjectUniqueId , store = "keyvaluepairs"
     nivel do jogador = Arr_PlayerData.At(0,0) (chave "playerdata", c2array). */
  var MEDAL_LEVEL = 100;           // condicao da medalha (PRODUCAO)
  var IDB_DB_FALLBACK = "c3-localstorage-91bvv5ns4ka";
  var IDB_STORE = "keyvaluepairs";
  var idbDbName = null;
  var lastLevelSeen = null;
  var progressTimer = null;

  function resolveDbName(cb) {
    if (idbDbName) { cb(idbDbName); return; }
    try {
      if (self.indexedDB && indexedDB.databases) {
        indexedDB.databases().then(function (list) {
          var hit = (list || []).map(function (x) { return x && x.name; })
            .filter(function (n) { return n && n.indexOf("c3-localstorage-") === 0; });
          idbDbName = hit[0] || IDB_DB_FALLBACK; cb(idbDbName);
        }).catch(function () { idbDbName = IDB_DB_FALLBACK; cb(idbDbName); });
      } else { idbDbName = IDB_DB_FALLBACK; cb(idbDbName); }
    } catch (e) { idbDbName = IDB_DB_FALLBACK; cb(idbDbName); }
  }

  function idbGetPlayerdata(cb) {            // cb(raw | null)
    resolveDbName(function (name) {
      try {
        var req = indexedDB.open(name);
        req.onsuccess = function () {
          var db = req.result;
          try {
            if (!db.objectStoreNames.contains(IDB_STORE)) { cb(null); db.close(); return; }
            var g = db.transaction([IDB_STORE], "readonly").objectStore(IDB_STORE).get("playerdata");
            g.onsuccess = function () { cb(g.result != null ? g.result : null); try { db.close(); } catch (e) {} };
            g.onerror   = function () { cb(null); try { db.close(); } catch (e) {} };
          } catch (e) { cb(null); try { db.close(); } catch (_) {} }
        };
        req.onerror = function () { cb(null); };
      } catch (e) { cb(null); }
    });
  }

  function readPlayerLevel(cb) {             // cb(level:number | null)
    idbGetPlayerdata(function (raw) {
      if (raw == null) { cb(null); return; }
      try {
        var obj = (typeof raw === "string") ? JSON.parse(raw) : raw; // c2array
        if (obj && obj.data && obj.data[0] && obj.data[0][0] != null) {
          var v = obj.data[0][0][0];
          cb((typeof v === "number") ? v : parseInt(v, 10));
        } else cb(null);
      } catch (e) { cb(null); }
    });
  }

  function tryReportDailyTask(level) {
    try {
      var today = bizDateToday();
      if (self.localStorage && localStorage.getItem("cidi_task_date") === today) {
        setStat("task", "ja enviada hoje");   // 1x/dia: nao repete
        return;
      }
      // grava a data SO no sucesso (senao uma falha trancaria o dia inteiro)
      CidiReport.task({ level: level }, function () {
        try { localStorage.setItem("cidi_task_date", today); } catch (e) {}
      });
    } catch (e) {}
  }

  function getBestReported() {
    try { return parseInt((self.localStorage && localStorage.getItem("cidi_best_reported")) || "-1", 10); }
    catch (e) { return -1; }
  }
  function maybeNewRecord(lvl) {
    // EVENT: reporta o MAIOR nivel alcancado (recorde). So sobe, nunca cai.
    if (lvl > getBestReported()) {
      CidiReport.tournament(lvl, function () {
        try { localStorage.setItem("cidi_best_reported", String(lvl)); } catch (e) {}
      });
    }
  }

  function maybeClaimMedal(lvl) {
    // MEDAL (durante o jogo): reivindica 1x ao cruzar o alvo. Gatilho leve (sem rede extra).
    try { if (localStorage.getItem("cidi_medal_done") === "1") return; } catch (e) {}
    if (lvl >= MEDAL_LEVEL) {
      CidiReport.medalClaim(function () {
        try { localStorage.setItem("cidi_medal_done", "1"); } catch (e) {}
      });
    }
  }

  // MEDAL (startup): a plataforma e a fonte da verdade, nao a flag local.
  // Consulta ownership e reconcilia -> desbloqueia jogador "preso" e cobre
  // vitoria antes do login / falha de rede / parou de jogar apos atingir o alvo.
  function reconcileMedal(lvl) {
    if (!loggedReady() || lvl == null || lvl < MEDAL_LEVEL) return; // nao elegivel
    CidiReport.medalOwned(function (owned) {
      if (owned === true) {
        try { localStorage.setItem("cidi_medal_done", "1"); } catch (e) {}   // ja possui -> sincroniza
        setStat("medal", "ja possui (sincronizado)");
      } else if (owned === false) {
        try { localStorage.removeItem("cidi_medal_done"); } catch (e) {}     // elegivel e NAO possui -> forca reenvio
        CidiReport.medalClaim(function () { try { localStorage.setItem("cidi_medal_done", "1"); } catch (e) {} });
      } else {
        maybeClaimMedal(lvl);   // nao deu p/ checar ownership -> fluxo normal por flag
      }
    });
  }

  function checkProgress() {
    readPlayerLevel(function (lvl) {
      if (lvl == null) return;
      if (lastLevelSeen == null) { lastLevelSeen = lvl; maybeNewRecord(lvl); maybeClaimMedal(lvl); return; }
      if (lvl !== lastLevelSeen) {
        lastLevelSeen = lvl;
        tryReportDailyTask(lvl);   // TASK: 1x/dia em qualquer mudanca de nivel
        maybeNewRecord(lvl);       // EVENT: reporta se for novo recorde de nivel
        maybeClaimMedal(lvl);      // MEDAL: reivindica ao atingir MEDAL_LEVEL (1x)
      }
    });
  }

  function startProgressMonitor() {
    if (progressTimer) return;
    readPlayerLevel(function (lvl) {
      lastLevelSeen = lvl;
      try {
        setStat("task", (localStorage.getItem("cidi_task_date") === bizDateToday())
          ? "ja enviada hoje" : "aguardando vitoria de nivel");
      } catch (e) {}
      maybeNewRecord(lvl);   // EVENT self-heal: reenvia recorde se nao confirmado
      reconcileMedal(lvl);   // MEDAL self-heal: reconcilia contra a plataforma (ownership)
      log("monitor de progresso ON (nivel base =", lvl, ") - task+event+medal ativos");
    });
    progressTimer = setInterval(checkProgress, 3000);
  }

  // showCidiRewarded(onReward, onFail)
  //   onReward(): success === true  -> entrega o premio
  //   onFail()  : qualquer outro caso (sem fill, fechou no meio, erro, timeout)
  function showCidiRewarded(onReward, onFail) {
    onReward = onReward || function () {};
    onFail   = onFail   || function () {};

    var settled = false;
    showAdLoading("Loading ad\u2026");                 // <-- indicador ON
    function grant() {
      if (settled) return; settled = true;
      hideAdLoading();
      forceResume("grant");
      onReward();
      setTimeout(function () { forceResume("grant+250"); }, 250);
      setTimeout(function () { forceResume("grant+700"); }, 700);
    }
    function deny(reason) {
      if (settled) return; settled = true;
      hideAdLoading();
      showAdMessage("No ad available");               // <-- feedback de falha
      forceResume("deny:" + reason);
      onFail();
      setTimeout(function () { forceResume("deny+250"); }, 250);
      setTimeout(function () { forceResume("deny+700"); }, 700);
    }
    // rede de seguranca: so dispara se a promise do SDK NUNCA resolver (travamento real).
    // fica ACIMA do timeout do SDK (5min) p/ nao competir com o tempo de assistir/fechar o anuncio.
    var safety = setTimeout(function () { deny("timeout"); }, 360000); // 6 min

    // So tenta o anuncio real se o login da CiDi passou (no Pi). Fora do Pi o login
    // nao completa e o showRewardedAd fica pendurado no 'authenticate' -> trava o jogo.
    if (willTryRealAd()) {
      try {
        CiDiSDK.showRewardedAd({ timeout: 300000 }) // 5min: tempo do SDK p/ assistir+fechar (nao cortar ad em andamento)
          .then(function (result) {
            clearTimeout(safety);
            // doc CiDi: APENAS success === true conta como recompensa; qualquer outra coisa = falha.
            if (result && result.success === true) { log("rewarded SUCCESS", result); grant(); }
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
      // Producao sem SDK OU sem login da CiDi -> falha rapida (nao pendura o jogo).
      clearTimeout(safety);
      warn("sem anuncio: CiDiSDK ausente ou login nao concluido (loggedIn=" + loggedIn + ")");
      deny("no-sdk-or-login");
    }
  }

  /* ===================================================================
     2) HIJACK do Mobile Advert (lado web)  -- inalterado
     =================================================================== */
  function ok(cb, result) { try { cb(null, result == null ? "ok" : result); } catch (e) {} }
  function fail(cb, msg) { try { cb(msg || "cancelled"); } catch (e) {} }

  function willTryRealAd() {
    return !!(self.CiDiSDK && typeof CiDiSDK.showRewardedAd === "function" && (loggedIn || isDev()));
  }

  function runReward(cb) {
    // So suspende o runtime se o anuncio real vai abrir. No fast-fail (sem SDK/login)
    // nao suspende -> nada pra destravar depois.
    if (willTryRealAd()) {
      try { if (typeof cidiWeb.suspendRuntime === "function") cidiWeb.suspendRuntime(); } catch (e) {}
    }
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
      "== SDKs (envio) ==",
      "TASK : " + cidiStat.task,
      "EVENT: " + cidiStat.event,
      "MEDAL: " + cidiStat.medal,
      "nivel visto: " + (lastLevelSeen == null ? "-" : lastLevelSeen) +
        "  recorde rep.: " + getBestReported() + "  alvo medalha: " + MEDAL_LEVEL,
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
        '<button id="cidi-dbg-task">Task</button>' +
        '<button id="cidi-dbg-event">Event</button>' +
        '<button id="cidi-dbg-medal">Medal</button>' +
        '<button id="cidi-dbg-own">Own?</button>' +
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
      document.getElementById("cidi-dbg-task").addEventListener("click", function () {
        log("DEBUG: teste manual TASK"); CidiReport.task({ test: 1, level: lastLevelSeen });
      });
      document.getElementById("cidi-dbg-event").addEventListener("click", function () {
        log("DEBUG: teste manual EVENT"); CidiReport.tournament(lastLevelSeen != null ? lastLevelSeen : 1);
      });
      document.getElementById("cidi-dbg-medal").addEventListener("click", function () {
        log("DEBUG: teste manual MEDAL"); CidiReport.medalClaim();
      });
      document.getElementById("cidi-dbg-own").addEventListener("click", function () {
        log("DEBUG: consulta ownership"); CidiReport.medalOwned(function (o) { log("ownership =", o); });
      });
      refreshDbgPanel();
    } catch (e) { warn("falha ao montar DBG:", e); }
  }
  // DEBUG: troque para true se precisar do painel DBG de volta
  var DEBUG_ENABLED = false;
  if (DEBUG_ENABLED) {
    if (document.body) buildDebugButton();
    else document.addEventListener("DOMContentLoaded", buildDebugButton);
    setTimeout(buildDebugButton, 1500);
    setTimeout(buildDebugButton, 4000);
  }

  loadCidiSdk();
  log("pronto [build: medal100-nodbg-v4]. rewarded/video -> CiDi real (key:", CIDI_API_KEY === "CIDI_PLACEHOLDER_KEY" ? "PLACEHOLDER!" : "ok", ")");
})();
