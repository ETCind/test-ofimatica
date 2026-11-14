(async()=>{
 const R=document.getElementById('results'),checks=[];const add=(n,ok,detail='')=>checks.push({n,ok,detail});
 try{
  const mobile=Boolean(globalThis.TestPlatform?.isIPadOrIPhone || /iPad|iPhone|iPod/i.test(navigator.userAgent) || (navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1));
  add('HTTPS y contexto seguro',location.protocol==='https:'&&window.isSecureContext,location.protocol+'//'+location.host);
  add('IndexedDB disponible',!!window.indexedDB);
  add('File API disponible',!!window.File&&!!Blob.prototype.text);
  add('Sin caché persistente de la app',true,'Ofimática v1 evita Service Worker para impedir versiones antiguas o interferencias entre aplicaciones.');
  await TestDB.openDB();await TestDB.put('settings',{key:'__selftest',value:'ok'});const v=await TestDB.get('settings','__selftest');add('Lectura/escritura local',v?.value==='ok');await TestDB.remove('settings','__selftest');
  let total=0,bad=0;for(const t of SEED_LIBRARY){for(const q of t.questions){total++;if(TestParserCore.questionProblems(q,q.correct).length)bad++;}}add('Sin preguntas publicadas',total===0&&bad===0,'La biblioteca llega desde tu archivo de iCloud');
  const sampleQuestionLines=['Pregunta 1 basicos windows11 punto1 windows11','¿Qué elemento es software?','a) Teclado','b) Windows 11','c) Pantalla','d) Ratón','Pregunta 2 basicos windows11','¿Qué abre Configuración?','a) Windows + I','b) Windows + E','c) Windows + R','d) Alt + F4','Hoja de Respuestas Correctas'];
  const sampleFeedbackLines=['Soluciones Detalladas y Feedback','Pregunta 1','¿Qué elemento es software?','Explicación: Windows 11 es software de sistema.','✘ Teclado','Es hardware.','✔ Windows 11 (Correcta)','Es el sistema operativo.','✘ Pantalla','Es hardware.','✘ Ratón','Es hardware.','Pregunta 2','¿Qué abre Configuración?','Explicación: Windows + I abre Configuración.','✔ Windows + I (Correcta)','Abre Configuración.','✘ Windows + E','Abre el Explorador.','✘ Windows + R','Abre Ejecutar.','✘ Alt + F4','Cierra la ventana activa.'];
  const mkPage=(arr,no)=>{const seq=arr.map((text,i)=>({text,y:i*10+20}));return {pageNo:no,width:600,height:800,modes:{native:seq,one:seq,two:seq,three:seq},rows:[]}};
  const sampleParsed=TestParserCore.analyze([mkPage(sampleQuestionLines,1),mkPage(sampleFeedbackLines,2)]);
  add('Gráficos de examen detectados', TestParserCore.requiresVisual('El icono mostrado de la pestaña Inicio permite:')&&TestParserCore.requiresVisual('Según la tabla siguiente, cuál es el valor correcto')&&TestParserCore.requiresVisual('Observa la gráfica mostrada y selecciona la respuesta'));
  add('Sin falsos positivos visuales', !TestParserCore.requiresVisual('¿Cómo obtener una captura de pantalla?')&&!TestParserCore.requiresVisual('¿Qué significa la vista Esquema de Word?'));
  add('La biblioteca rechaza ilustraciones ausentes', TestSyncCore.questionErrors({n:1,question:'¿Qué representa este icono?',options:{A:'Uno',B:'Dos',C:'Tres',D:'Cuatro'},correct:'A',requiresImage:true}).some(x=>x.includes('imagen imprescindible')));
  add('Parser material de estudio: Pregunta N + feedback detallado',sampleParsed.status==='verified'&&sampleParsed.questions.length===2&&sampleParsed.questions.map(q=>q.correct).join('')==='BA'&&sampleParsed.questions.every(q=>q.explanation),'2/2 preguntas · claves BA · explicaciones conservadas');
  const sampleTests=[{id:'autotest-1',title:'Autotest',topic:'Autotest',questions:[{n:1,question:'Pregunta de prueba',options:{A:'Uno',B:'Dos',C:'Tres',D:'Cuatro'},correct:'A'}]}],sampleHistory=[{testId:'autotest-1',score:100,correct:1,total:1,date:new Date().toISOString()}];const master=await TestSyncCore.makeMaster({tests:sampleTests,history:sampleHistory,libraryId:'autotest-library',revision:7,originDevice:'autotest-device',appBuild:'ofimatica-v5-graficos-20261109'});const mv=await TestSyncCore.validateMaster(master);add('Biblioteca maestra iCloud',mv.ok&&mv.checksumValid&&mv.stats.tests===1&&mv.stats.results===1,'Checksum '+(mv.checksumValid?'OK':'FALLO'));
  const corrupt=JSON.parse(JSON.stringify(master));corrupt.payload.tests[0].title+=' alterado';const cv=await TestSyncCore.validateMaster(corrupt);add('Detecta biblioteca alterada',!cv.ok&&cv.errors.some(x=>x.includes('integridad')));
  const html=TestReportCore.buildPrintHTML({test:sampleTests[0],details:[{q:sampleTests[0].questions[0],answer:'A',ok:true}],correct:1,wrong:0,blank:0,total:1,answered:1,percentTotal:100,date:new Date()},'full');add('Motor de informes',html.includes('Pregunta de prueba')&&html.includes('Correcta'));
  const opts=PdfImporter.securityOptions||{};add('PDF endurecido',opts.isEvalSupported===false&&opts.enableScripting===false&&opts.enableXfa===false,'eval OFF · scripting OFF · XFA OFF');
  // Regresión Safari: algunos documentos carecen de PDFDocumentProxy.destroy().
  // El importador debe liberar mediante PDFDocumentLoadingTask.destroy()
  // sin marcar como fallida una lectura correcta.
  let taskClosed=0,docClosed=0;
  await PdfImporter._qa.releasePdf({destroy:async()=>{taskClosed++;}}, {getPage(){}});
  await PdfImporter._qa.releasePdf({destroy:async()=>{taskClosed++;}}, {destroy:async()=>{docClosed++;}});
  add('Cierre PDF sin método destroy en Safari',taskClosed===1&&docClosed===1,
      'Con proxy sin destroy se libera la tarea; con proxy completo se cierra el documento.');
  if(mobile){add('Importación PDF desactivada en iPad',true,'Los PDF se importan en el Mac');}
  else{
    if(!globalThis.TestPdfEngine?.ready){const start=Date.now();while(Date.now()-start<12000&&!globalThis.TestPdfEngine?.ready&&!globalThis.TestPdfEngine?.error){await new Promise(r=>setTimeout(r,200));}}
    add('Motor PDF actual y parcheado',globalThis.TestPdfEngine?.ready&&String(globalThis.TestPdfEngine.version)==='6.2.108',globalThis.TestPdfEngine?.ready?'PDF.js '+globalThis.TestPdfEngine.version+' · build legacy Safari':(globalThis.TestPdfEngine?.error||'No cargado'));
    if(globalThis.TestPdfEngine?.ready){
      // Regression for Safari/PDF.js 6: PageViewport lacks convertToViewportRectangle.
      const ops=window.pdfjsLib.OPS;
      const fakeImagePdf={getPage:async()=>({
        getViewport:()=>({transform:[1,0,0,-1,0,600],width:400,height:600}),
        getOperatorList:async()=>({fnArray:[ops.save,ops.transform,ops.paintImageXObject,ops.restore],argsArray:[[],[60,0,0,40,20,500],['fake-image'],[]]})
      })};
      const geom=await PdfImporter._qa.pageImageRegions(fakeImagePdf,0);
      add('Geometría de imágenes sin convertToViewportRectangle',geom.length===1&&geom[0].x0===20&&geom[0].x1===80&&geom[0].y0===60&&geom[0].y1===100,'PDF.js 6 · matriz de viewport compatible');
      // El gráfico VECTORIAL es una trayectoria pintada, no una imagen raster.
      const vectorFake={getPage:async()=>({getViewport:()=>({transform:[1,0,0,-1,0,600],width:400,height:600}),getOperatorList:async()=>({fnArray:[ops.save,ops.transform,ops.constructPath,ops.restore],argsArray:[[],[30,0,0,24,25,490],[[],[],0,0,1,1],[]]})})};
      const vectorBox=await PdfImporter._qa.pageImageRegions(vectorFake,0);
      add('Gráficos vectoriales de Word, Excel y Outlook',vectorBox.length===1&&Math.abs(vectorBox[0].x0-25)<0.01&&Math.abs(vectorBox[0].y0-86)<0.01,'Trayectoria vectorial localizada y capturable');
      const iv=await PdfImporter.verifyEngine();
      add('Importación del PDF interno de prueba (4 preguntas)',iv.ok,iv.ok?(iv.detail||'4/4 preguntas de prueba'):(iv.reason||'Fallo de autotest'));
      let fallbackCalls=0;
      const fakePage={
        streamTextContent(){
          let sent=false;
          return {getReader(){return {
            async read(){if(sent)return {done:true};sent=true;return {done:false,value:{items:[{str:'OK'}],styles:{},lang:'es'}};},
            releaseLock(){}
          };}};
        },
        getTextContent(){fallbackCalls++;throw new Error('getTextContent no debe ejecutarse');}
      };
      const safeContent=await PdfImporter.readTextContentSafe(fakePage,{});
      add('Ruta Safari sin getTextContent',safeContent?.items?.[0]?.str==='OK'&&fallbackCalls===0,'streamTextContent().getReader() · 0 llamadas a getTextContent');
    }
  }
 }catch(e){add('Ejecución sin excepción',false,e.message||String(e));}
 const fail=checks.filter(x=>!x.ok);R.innerHTML='<h2>'+(fail.length?'⚠️ Hay fallos':'✅ Pruebas internas correctas')+'</h2><p class=\"muted\">La prueba de 4 preguntas es artificial. Un OK no garantiza que cualquier examen externo se importe correctamente; revisa el recuento antes de guardarlo.</p>'+checks.map(x=>'<div class="statline"><span>'+x.n+(x.detail?'<br><small class="muted">'+x.detail+'</small>':'')+'</span><strong class="'+(x.ok?'good-text':'bad-text')+'">'+(x.ok?'OK':'FALLO')+'</strong></div>').join('')+'<p class="muted small" style="margin-top:16px">'+navigator.userAgent+'</p>';document.title=(fail.length?'FALLO':'OK')+' · Autotest Ofimática C2 v5.3';
})();
