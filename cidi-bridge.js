/* =====================================================================
   CiDi Bridge (PLACEHOLDER) - Nuts and Bolts Screw Puzzle
   Concede a recompensa direto (sem CiDi real) para manter o jogo
   funcionando/testavel enquanto o app na CiDi nao foi criado.
   O bridge REAL (storage+ads+login) esta salvo em cidi-bridge.REAL.js.
   ===================================================================== */
(function () {
  "use strict";
  var TAG = "[CiDi-Bridge]";
  function log(){ try{ console.log.apply(console,[TAG].concat([].slice.call(arguments))); }catch(e){} }
  var REWARD_RESULT = JSON.stringify(["reward", 1]);

  function showCidiRewarded(onReward, onFail) {
    log("PLACEHOLDER -> concedendo recompensa direto");
    try { (onReward||function(){})(); } catch (e) { try { (onFail||function(){})(); } catch (e2) {} }
  }

  function ok(cb,result){ try{ cb(null, result==null?"ok":result); }catch(e){} }
  function fail(cb,msg){ try{ cb(msg||"cancelled"); }catch(e){} }
  function runReward(cb){ showCidiRewarded(function(){ ok(cb,REWARD_RESULT); }, function(){ fail(cb,"no-fill"); }); }
  function lastArg(){ return arguments.length?arguments[arguments.length-1]:null; }

  var cidiWeb = {
    Configure:function(){ ok(lastArg.apply(null,arguments)); },
    RequestConsent:function(){ ok(lastArg.apply(null,arguments)); },
    SetUserPersonalisation:function(){ ok(lastArg.apply(null,arguments)); },
    SetMaxAdContentRating:function(){ ok(lastArg.apply(null,arguments)); },
    TagForChildDirectedTreatment:function(){ ok(lastArg.apply(null,arguments)); },
    TagForUnderAgeOfConsent:function(){ ok(lastArg.apply(null,arguments)); },
    RequestIDFA:function(){ ok(lastArg.apply(null,arguments),"not-determined"); },
    StatusUpdate:function(){ ok(lastArg.apply(null,arguments),"UNKNOWN&&not-determined&&true"); },
    CreateBannerAdvert:function(){ ok(lastArg.apply(null,arguments)); },
    ShowBannerAdvert:function(cb){ ok(cb); },
    HideBannerAdvert:function(cb){ ok(cb); },
    CreateInterstitialAdvert:function(){ ok(lastArg.apply(null,arguments)); },
    ShowInterstitialAdvert:function(cb){ ok(cb); },
    CreateRewardedInterstitialAdvert:function(){ ok(lastArg.apply(null,arguments)); },
    ShowRewardedInterstitialAdvert:function(cb){ runReward(cb); },
    CreateVideoAdvert:function(){ ok(lastArg.apply(null,arguments)); },
    ShowVideoAdvert:function(cb){ runReward(cb); },
    CreateRewardedAdvert:function(){ ok(lastArg.apply(null,arguments)); },
    ShowRewardedAdvert:function(cb){ runReward(cb); }
  };
  var api=(self["C3MobileAdvertsAPI"]=self["C3MobileAdvertsAPI"]||{});
  try{ Object.defineProperty(api,"web",{configurable:true,get:function(){return cidiWeb;},set:function(v){api._realWeb=v;}}); }
  catch(e){ api.web=cidiWeb; }
  log("pronto (placeholder concede direto).");
})();
