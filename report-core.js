(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.TestReportCore=api;
})(typeof self!=='undefined'?self:this,function(){
  'use strict';
  const esc=(s='')=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  const fmtPct=n=>Number(n||0).toFixed(2).replace('.',',')+' %';
  function asDate(value){const d=value instanceof Date?value:new Date(value);return Number.isNaN(d.getTime())?new Date():d}
  function normalizeMode(mode){return mode==='errors'?'errors':'full'}
  function statusOf(detail){if(!detail.answer)return'blank';return detail.answer===detail.q.correct?'correct':'wrong'}
  function reportRows(result,mode='full'){
    mode=normalizeMode(mode);
    const rows=(result&&Array.isArray(result.details)?result.details:[]).map((d,index)=>({...d,index,status:statusOf(d)}));
    return mode==='errors'?rows.filter(d=>d.status!=='correct'):rows;
  }
  function optionHTML(detail,letter){
    const q=detail.q||{},answer=detail.answer,correct=q.correct,isCorrect=letter===correct,isUser=letter===answer;
    let cls='print-option',label='';
    if(isCorrect)cls+=' answer-correct';
    if(isUser&&isCorrect){cls+=' user-correct';label='<span class="print-tag tag-good">✓ Tu respuesta · Correcta</span>';}
    else if(isUser){cls+=' user-wrong';label='<span class="print-tag tag-bad">✕ Tu respuesta</span>';}
    else if(isCorrect){label='<span class="print-tag tag-good">✓ Respuesta correcta</span>';}
    return `<div class="${cls}" data-option="${esc(letter)}"><span class="print-letter">${esc(letter)}.</span><span class="print-option-text">${esc((q.options||{})[letter]||'')}</span>${label}</div>`;
  }
  function notesHTML(q){
    const parts=[];
    if(q.explanation)parts.push(`<p class="print-explanation"><strong>Explicación:</strong> ${esc(q.explanation)}</p>`);
    if(q.optionExplanations&&typeof q.optionExplanations==='object'){
      const rows=Object.keys(q.options||{}).sort().filter(L=>q.optionExplanations[L]).map(L=>`<p class="print-explanation"><strong>${esc(L)}.</strong> ${esc(q.optionExplanations[L])}</p>`).join('');
      if(rows)parts.push(`<div class="print-explanation"><strong>Por qué cada opción:</strong>${rows}</div>`);
    }
    if(q.memoryTip)parts.push(`<p class="print-explanation"><strong>Regla de memoria:</strong> ${esc(q.memoryTip)}</p>`);
    if(q.trap)parts.push(`<p class="print-explanation"><strong>Trampa:</strong> ${esc(q.trap)}</p>`);
    if(q.sourceNote)parts.push(`<p class="print-explanation"><strong>Fuente:</strong> ${esc(q.sourceNote)}</p>`);
    return parts.join('');
  }
  function questionHTML(detail){
    const q=detail.q||{},status=detail.status||statusOf(detail),letters=Object.keys(q.options||{}).sort();
    const resultLabel=status==='correct'?'<span class="print-result-label result-good">CORRECTA</span>':status==='wrong'?'<span class="print-result-label result-bad">INCORRECTA</span>':'<span class="print-result-label result-blank">SIN CONTESTAR</span>';
    const responseLine=status==='blank'?`<p class="print-user-summary"><strong>Tu respuesta:</strong> Sin contestar · <strong>Correcta:</strong> ${esc(q.correct)}. ${esc((q.options||{})[q.correct]||'')}</p>`:'';
    return `<section class="print-q" data-question-id="${esc(q.n??detail.index+1)}"><div class="print-q-head"><h3>${esc(q.n??detail.index+1)}. ${esc(q.question||'')}</h3>${resultLabel}</div><div class="print-options">${letters.map(l=>optionHTML(detail,l)).join('')}</div>${responseLine}${notesHTML(q)}</section>`;
  }
  function buildPrintHTML(result,mode='full'){
    if(!result||!result.test)throw new Error('Resultado de test no válido');
    mode=normalizeMode(mode);
    const rows=reportRows(result,mode),date=asDate(result.date),title=mode==='full'?'Test corregido completo':'Errores y preguntas sin contestar';
    const omitted=mode==='errors'?Math.max(0,(result.total||result.details?.length||0)-rows.length):0;
    return `<div class="print-report" data-report-mode="${mode}"><header class="print-header"><p class="print-kicker">${esc(result.test.topic||'')}</p><h1>${esc(result.test.title||'Test')}</h1><p class="subtitle">${title} · ${esc(date.toLocaleString('es-ES'))}</p></header><div class="print-summary"><div><span>Aciertos</span><strong>${Number(result.correct||0)}</strong></div><div><span>Errores</span><strong>${Number(result.wrong||0)}</strong></div><div><span>Sin responder</span><strong>${Number(result.blank||0)}</strong></div><div><span>Resultado</span><strong>${fmtPct(result.percentTotal)}</strong></div></div><div class="print-report-note">${mode==='full'?`Incluye las ${Number(result.total||rows.length)} preguntas, todas sus opciones, tu respuesta y la solución correcta.`:`Incluye ${rows.length} pregunta${rows.length===1?'':'s'} fallada${rows.length===1?'':'s'} o sin contestar. Se omiten ${omitted} acertada${omitted===1?'':'s'}.`}</div>${rows.length?`<div class="print-question-list">${rows.map(questionHTML).join('')}</div>`:'<p class="print-empty">No hay errores ni preguntas sin contestar.</p>'}</div>`;
  }
  return{buildPrintHTML,reportRows,statusOf,escapeHtml:esc};
});
