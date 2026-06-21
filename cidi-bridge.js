/* =====================================================================
   CiDi Bridge  -  Nuts and Bolts Screw Puzzle
   ---------------------------------------------------------------------
   Sequestra o plugin "Mobile Advert" (AdMob) do Construct 3 no lado WEB
   e redireciona TODO rewarded/video para o anuncio da CiDi.

   Como funciona (resumo):
   - O runtime do Construct chama   self.C3MobileAdvertsAPI.web[<Metodo>](...args, cb)
   - cb(err, result):  err "truthy" => o jogo dispara "On rewarded CANCELLED"
                       err null/false => o jogo dispara "On rewarded COMPLETE"
                                          (e entrega o bonus pela logica que ja existe)
   - Para rewarded/video, "result" deve ser um JSON "[tipo, valor]".

   Este arquivo e um <script> CLASSICO carregado ANTES dos modulos do jogo,
   entao instala o gancho antes do AdMob real ser registrado.
   ===================================================================== */
(function () {
  "use strict";

  var TAG = "[CiDi-Bridge]";
  function log() {
    try { console.log.apply(console, [TAG].concat([].slice.call(arguments))); } catch (e) {}
  }

  /* ===================================================================
     CONFIG
     =================================================================== */
  var CIDI_API_KEY = "CIDI_PLACEHOLDER_KEY"; // <-- TROQUE pela key real do app na CiDi
  var REWARD_RESULT = JSON.stringify(["reward", 1]); // [tipo, valor] entregue ao jogo

  /* ===================================================================
     1) CAMADA CiDi  -- PREENCHER com o seu codigo que ja funciona
     -------------------------------------------------------------------
     Cole aqui o que voce ja usa no Gemnova / Bubble Galaxy:
       - o carregamento do SDK da CiDi
       - a funcao que mostra o rewarded e chama de volta no sucesso

     A assinatura que o bridge espera:
       showCidiRewarded(onReward, onFail)
         onReward()  -> usuario assistiu e MERECE o premio
         onFail()    -> cancelou / sem anuncio / erro  (NAO entrega premio)
     =================================================================== */

  var CiDiReady = false;

  function loadCidiSdk() {
    // TODO: injetar o <script> do SDK da CiDi e inicializar com CIDI_API_KEY.
    // Ex. (ajuste para o seu SDK real):
    //   var s = document.createElement("script");
    //   s.src = "https://.../cidi-sdk.js";
    //   s.onload = function(){ /* CiDi.init(CIDI_API_KEY); */ CiDiReady = true; log("SDK CiDi pronto"); };
    //   s.onerror = function(){ CiDiReady = false; log("falha ao carregar SDK CiDi"); };
    //   document.head.appendChild(s);
    log("loadCidiSdk(): placeholder (SDK CiDi ainda nao plugado)");
  }

  function showCidiRewarded(onReward, onFail) {
    // -------- PLACEHOLDER DE TESTE --------
    // Enquanto o SDK da CiDi nao esta plugado, concede a recompensa direto
    // para voce validar que o fluxo do jogo (boosters/2x) responde certo.
    // Troque este corpo pela sua chamada real de rewarded da CiDi, ex.:
    //   showRewardedAd(function(){ onReward(); });   // sucesso
    //   ...e onFail() quando cancelar/sem fill.
    log("showCidiRewarded(): PLACEHOLDER -> concedendo recompensa direto");
    try { onReward(); } catch (e) { try { (onFail || function(){})(); } catch (e2) {} }
  }

  /* ===================================================================
     2) HIJACK do Mobile Advert (lado web)
     =================================================================== */

  function ok(cb, result) { try { cb(null, result == null ? "ok" : result); } catch (e) {} }
  function fail(cb, msg) { try { cb(msg || "cancelled"); } catch (e) {} }

  // roteia qualquer "show rewarded/video" para a CiDi
  function runReward(cb) {
    try { if (typeof cidiWeb.suspendRuntime === "function") cidiWeb.suspendRuntime(); } catch (e) {}
    showCidiRewarded(
      function () { // recompensa
        try { if (typeof cidiWeb.resumeRuntime === "function") cidiWeb.resumeRuntime(); } catch (e) {}
        ok(cb, REWARD_RESULT);
      },
      function () { // cancelou / sem fill
        try { if (typeof cidiWeb.resumeRuntime === "function") cidiWeb.resumeRuntime(); } catch (e) {}
        fail(cb, "no-fill");
      }
    );
  }

  function lastArg() { return arguments.length ? arguments[arguments.length - 1] : null; }

  var cidiWeb = {
    // ---- Config / consent: tudo sucesso (no-op) ----
    Configure: function () { ok(lastArg.apply(null, arguments)); },
    RequestConsent: function () { ok(lastArg.apply(null, arguments)); },
    SetUserPersonalisation: function () { ok(lastArg.apply(null, arguments)); },
    SetMaxAdContentRating: function () { ok(lastArg.apply(null, arguments)); },
    TagForChildDirectedTreatment: function () { ok(lastArg.apply(null, arguments)); },
    TagForUnderAgeOfConsent: function () { ok(lastArg.apply(null, arguments)); },
    RequestIDFA: function () { ok(lastArg.apply(null, arguments), "not-determined"); },
    StatusUpdate: function () { ok(lastArg.apply(null, arguments), "UNKNOWN&&not-determined&&true"); },

    // ---- Banner: no-op (CiDi/Pi nao usa banner AdMob) ----
    CreateBannerAdvert: function () { ok(lastArg.apply(null, arguments)); },
    ShowBannerAdvert: function (cb) { ok(cb); },
    HideBannerAdvert: function (cb) { ok(cb); },

    // ---- Interstitial: resolve "completo" pra NAO travar o fluxo do jogo ----
    CreateInterstitialAdvert: function () { ok(lastArg.apply(null, arguments)); },
    ShowInterstitialAdvert: function (cb) { ok(cb); }, // sem anuncio: segue o jogo

    // ---- Rewarded interstitial -> tratado como rewarded ----
    CreateRewardedInterstitialAdvert: function () { ok(lastArg.apply(null, arguments)); },
    ShowRewardedInterstitialAdvert: function (cb) { runReward(cb); },

    // ---- Rewarded video ----
    CreateVideoAdvert: function () { ok(lastArg.apply(null, arguments)); },
    ShowVideoAdvert: function (cb) { runReward(cb); },

    // ---- Rewarded ----
    CreateRewardedAdvert: function () { ok(lastArg.apply(null, arguments)); },
    ShowRewardedAdvert: function (cb) { runReward(cb); }
  };

  /* ---- instalar: garantir que o NOSSO objeto vence, seja qual for a ordem ----
     O AdMob real tambem faz  C3MobileAdvertsAPI.web = <objeto>.
     Definimos um getter/setter: o getter sempre devolve o nosso;
     o setter guarda o real em _realWeb mas o ignora. */
  var api = (self["C3MobileAdvertsAPI"] = self["C3MobileAdvertsAPI"] || {});
  try {
    Object.defineProperty(api, "web", {
      configurable: true,
      get: function () { return cidiWeb; },
      set: function (v) { api._realWeb = v; } // ignora o AdMob real
    });
    log("gancho instalado via getter/setter");
  } catch (e) {
    api.web = cidiWeb; // fallback
    log("gancho instalado via atribuicao direta");
  }

  loadCidiSdk();
  log("pronto. rewarded/video -> CiDi (placeholder concede direto).");
})();
