(()=>{
  'use strict';

  const isMobile=()=>Boolean(
    globalThis.TestPlatform?.isIPadOrIPhone ||
    /iPad|iPhone|iPod/i.test(navigator.userAgent) ||
    (navigator.platform==='MacIntel' && navigator.maxTouchPoints>1)
  );

  let scheduled=false;
  let verifyStarted=false;

  function setButtonState(button,{text,disabled,title,ariaDisabled}){
    if(!button)return;
    if(button.textContent!==text)button.textContent=text;
    if(button.disabled!==disabled)button.disabled=disabled;
    if(button.title!==title)button.title=title;
    if(ariaDisabled){
      if(button.getAttribute('aria-disabled')!=='true')button.setAttribute('aria-disabled','true');
    }else if(button.hasAttribute('aria-disabled')){
      button.removeAttribute('aria-disabled');
    }
  }

  const maybeVerify=async()=>{
    if(isMobile() || verifyStarted || !globalThis.TestPdfEngine?.ready || !globalThis.PdfImporter?.verifyEngine)return;
    verifyStarted=true;
    scheduleApply();
    try{
      await globalThis.PdfImporter.verifyEngine();
    }finally{
      scheduleApply();
    }
  };

  const apply=()=>{
    scheduled=false;

    const mobile=isMobile();
    const platform=mobile?'ipad':'mac';
    if(document.documentElement.dataset.testPlatform!==platform){
      document.documentElement.dataset.testPlatform=platform;
    }

    const b=document.getElementById('importBtn');
    if(b){
      if(mobile){
        setButtonState(b,{
          text:'Importar PDF en el Mac',
          disabled:true,
          title:'En el iPad los PDF se importan en el Mac. Después carga la biblioteca maestra desde iCloud Drive.',
          ariaDisabled:true
        });
      }else if(globalThis.TestPdfEngine?.selfTestPassed){
        setButtonState(b,{
          text:'+ Importar PDF',
          disabled:false,
          title:'Importador verificado con un PDF real interno. El PDF seleccionado se procesa en este navegador.',
          ariaDisabled:false
        });
      }else if(globalThis.TestPdfEngine?.ready){
        setButtonState(b,{
          text:'Comprobando importador PDF…',
          disabled:true,
          title:'La aplicación está verificando extracción y parser con un PDF interno.',
          ariaDisabled:true
        });
      }else if(globalThis.TestPdfEngine?.error){
        setButtonState(b,{
          text:'Importador PDF no disponible',
          disabled:true,
          title:String(globalThis.TestPdfEngine.error),
          ariaDisabled:true
        });
      }else{
        setButtonState(b,{
          text:'Cargando importador PDF…',
          disabled:true,
          title:'La aplicación está cargando el motor PDF seguro.',
          ariaDisabled:true
        });
      }
    }

    const desired=mobile
      ? '<strong>Modo iPad:</strong> GitHub Pages contiene sólo el programa. Carga tu biblioteca desde iCloud Drive; la importación de PDF está desactivada aquí.'
      : globalThis.TestPdfEngine?.selfTestPassed
        ? '<strong>Modo Mac:</strong> importador PDF verificado (PDF real 4/4). Puedes importar y después guardar la biblioteca maestra en iCloud Drive.'
        : '<strong>Modo Mac:</strong> la importación se habilita sólo después de superar el autotest real del motor PDF.';

    document.querySelectorAll('.install-note').forEach(n=>{
      if(n.innerHTML!==desired)n.innerHTML=desired;
    });

    maybeVerify();
  };

  const scheduleApply=()=>{
    if(scheduled)return;
    scheduled=true;
    queueMicrotask(apply);
  };

  // Observamos sólo la creación/eliminación de nodos. Todas las mutaciones que
  // hace este archivo son idempotentes: no vuelve a escribir texto/HTML si ya
  // coincide. Así el observer no puede realimentarse indefinidamente.
  new MutationObserver(scheduleApply).observe(document.documentElement,{subtree:true,childList:true});

  window.addEventListener('test-pdf-engine-ready',scheduleApply);
  window.addEventListener('test-pdf-selftest-ready',scheduleApply);

  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',scheduleApply,{once:true});
  }else{
    scheduleApply();
  }
})();
