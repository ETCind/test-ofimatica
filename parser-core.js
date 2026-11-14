(()=>{
'use strict';
const Q_RE=/^\s*(\d{1,3})\s*(?:[-–—.)]|:)\s*(.*)$/;
const Q_HDR_RE=/^\s*pregunta\s+(\d{1,3})(?:\b.*)?$/i;
const O_RE=/^\s*([A-Fa-f])\s*(?:[.)]|[-–—]|:)\s*(.*)$/;
const clean=s=>String(s??'').replace(/\u00ad/g,'').replace(/￾/g,'-').replace(/[\u200B-\u200D\uFEFF]/g,'').replace(/[ \t]+/g,' ').trim();
const stripAccents=s=>String(s??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'');
const norm=s=>stripAccents(clean(s).toLowerCase()).replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim();

function requiresVisual(question){
  const t=norm(question);
  // Señales fuertes de que hay una ilustración que debe verse para responder.
  // No confundir «realizar una captura», «vista Esquema», «gráfico» como
  // concepto o «insertar imagen» como comando con una imagen presente.
  if(/\b(?:el|un|este|siguiente|adjunto|mostrado|representado)\s+icono\b/.test(t))return true;
  if(/\b(?:la|una|esta|siguiente|adjunta|mostrada)\s+(?:figura|ilustracion|imagen|captura|pantalla)\s+(?:siguiente|mostrada|adjunta|representada|que aparece|que se muestra)\b/.test(t))return true;
  if(/\b(?:segun|observa|observe|fijate|vease)\s+(?:en\s+)?(?:la|el|esta|este|siguiente)?\s*(?:imagen|figura|ilustracion|captura|pantalla|tabla|grafic[oa]|diagrama|esquema|cuadro)\b/.test(t))return true;
  if(/\b(?:tabla|grafic[oa]|diagrama|organigrama|esquema|cuadro|imagen|figura|captura)\s+(?:siguiente|mostrad[oa]|adjunt[oa]|representad[oa])\b/.test(t))return true;
  if(/\b(?:la|el)\s+(?:siguiente|presente)\s+(?:tabla|grafic[oa]|diagrama|imagen|figura|formulario|pantalla)\b/.test(t))return true;
  if(/\b(?:icono|figura|ilustracion)\s+(?:de|que|correspondiente|mostrado|siguiente|adjunto)\b/.test(t))return true;
  return false;
}

function stripRunningMatter(s){
  let t=clean(s);
  // Running headers/footers occasionally get glued to a question by column extraction.
  // Remove only suffixes that unmistakably identify the test itself.
  t=t.replace(/\s+[A-ZÁÉÍÓÚÜÑ][^\n]{0,90}?[–—-]\s*test\s+n[ºo°]?\s*\d+(?:\s+\d+)?\s*$/i,'');
  t=t.replace(/\s+test\s+n[ºo°]?\s*\d+\s+[–—-]\s*[^\n]{0,100}$/i,'');
  return clean(t);
}
function isTitle(t){
  t=clean(t); if(!t)return true;
  if(/\btest\s+n[ºo°]?\s*\d+\b/i.test(t)&&!Q_RE.test(t))return true;
  if(/^test\s+n[ºo°]?\s*\d+\s*[–—-]/i.test(t))return true;
  if(/^test\s+n[ºo°]?\s*\d+\s*$/i.test(t))return true;
  if(/^test\s+de\s+.+?\s+numero\s+\d+\b.*\bpor\b/i.test(t))return true;
  if(/^[A-ZÁÉÍÓÚÜÑ0-9 ]+\s+\S+\s+\S+\s+Pagina\s+\d+$/i.test(t))return true;
  if(/^tema\s+\d+\s*:\s*t[ií]tulo\s+del\s+tema/i.test(t))return true;
  return false;
}
function isQuestionMetadataLine(t){
  const n=norm(t);if(!n)return false;
  // Etiquetas temáticas impresas por material de estudio junto al rótulo “Pregunta N”.
  // Solo se descartan cuando toda la línea está formada por estas etiquetas.
  const parts=n.split(' ').filter(Boolean);return parts.length>0&&parts.every(x=>/^(?:basicos|avanzados|windows11|punto\d+)$/.test(x));
}
function detailedSolutionsMarkerText(t){
  const n=norm(t);
  return /\bsoluciones?\s+detalladas?\b/.test(n)||/\bfeedback\b/.test(n)&&/\bsoluciones?\b/.test(n);
}
function answerSheetMarkerText(t){return /^hoja\s+de\s+respuestas(?:\s+correctas)?$/i.test(clean(t));}
function solutionMarkerText(t){
  const u=clean(t).toUpperCase();
  if(!u||u.length>100)return false;
  return /\bPREG(?:UNTA)?S?\b/.test(u)&&/\b(?:SOL(?:UC(?:ION(?:ES)?)?)?|RESP(?:UESTA(?:S)?)?)\b/.test(u);
}
function answerHeaderOnly(t){return /^(?:SOL(?:UC(?:ION(?:ES)?)?)?|RESP(?:UESTA(?:S)?)?)$/i.test(clean(t));}
function questionHeaderOnly(t){return /^PREG(?:UNTA)?S?$/i.test(clean(t));}
function rowText(row){return clean((row.tokens||[]).map(x=>x.text).join(' '));}
function findMarker(pages){
  for(let p=0;p<pages.length;p++){
    const page=pages[p];
    for(const row of page.rows||[]){
      const rt=rowText(row);
      if(solutionMarkerText(rt))return {page:p,y:row.y};
      const toks=(row.tokens||[]).map(x=>clean(x.text).toUpperCase()).filter(Boolean);
      if(toks.some(questionHeaderOnly)&&toks.some(answerHeaderOnly))return {page:p,y:row.y};
    }
    for(const mode of Object.keys(page.modes||{})){
      const seq=page.modes[mode]||[];
      for(let i=0;i<seq.length;i++){
        const t=clean(seq[i].text??seq[i]);
        if(solutionMarkerText(t))return {page:p,y:seq[i].y??null};
        const next=i+1<seq.length?clean(seq[i+1].text??seq[i+1]):'';
        if((questionHeaderOnly(t)&&answerHeaderOnly(next))||(answerHeaderOnly(t)&&questionHeaderOnly(next)))return {page:p,y:seq[i].y??null};
      }
    }
  }
  for(let p=Math.max(0,pages.length-3);p<pages.length;p++){
    const pairs=solutionPairsPage(pages[p],null);
    let n=1; while(pairs[n])n++;
    if(n>=6)return {page:p,y:null,inferred:true};
  }
  return null;
}
function findDetailedFeedbackMarker(pages){
  for(let p=0;p<pages.length;p++){
    const page=pages[p];
    for(const row of page.rows||[]){const rt=rowText(row);if(detailedSolutionsMarkerText(rt))return {page:p,y:row.y,detailed:true};}
    for(const mode of Object.keys(page.modes||{})){
      const seq=page.modes[mode]||[];
      for(const item of seq){const t=clean(item.text??item);if(detailedSolutionsMarkerText(t))return {page:p,y:item.y??null,detailed:true};}
    }
  }
  return null;
}
function solutionPairsPage(page,minY){
  const found={};
  const put=(n,a)=>{n=Number(n);a=String(a||'').toUpperCase();if(n>0&&/^[A-F]$/.test(a)&&!found[n])found[n]=a};
  for(const row of page.rows||[]){
    if(minY!=null&&row.y<minY-2)continue;
    const txt=rowText(row);
    const re=/(?:^|\s)(\d{1,3})\s*[-.)]?\s*[:\-]?\s+([A-F])(?=\s|$)/gi;
    let m;while((m=re.exec(txt)))put(m[1],m[2]);
    const toks=(row.tokens||[]).map(x=>clean(x.text)).filter(Boolean);
    for(let i=0;i<toks.length;i++){
      const nm=toks[i].match(/^(\d{1,3})\s*[-.)]?$/);
      if(!nm)continue;
      for(let j=i+1;j<Math.min(i+4,toks.length);j++){
        if(/^[A-F]$/i.test(toks[j])){put(nm[1],toks[j]);break;}
        if(/^\d/.test(toks[j]))break;
      }
    }
  }
  for(const mode of Object.keys(page.modes||{})){
    const seq=page.modes[mode]||[];
    for(const x of seq){
      const txt=clean(x.text??x);
      const re=/(?:^|\s)(\d{1,3})\s*[-.)]?\s*[:\-]?\s+([A-F])(?=\s|$)/gi;
      let m;while((m=re.exec(txt)))put(m[1],m[2]);
    }
  }
  return found;
}
function parseSolutions(pages,marker){
  const start=marker?marker.page:Math.max(0,pages.length-3),found={};
  for(let p=start;p<pages.length;p++){
    const pairs=solutionPairsPage(pages[p],marker&&p===start?marker.y:null);
    for(const [n,a] of Object.entries(pairs))if(!found[n])found[n]=a;
  }
  // Sequence-state fallback. This ignores article-number columns by only accepting the next expected number.
  for(const mode of ['native','one','two','three']){
    let expected=1;const seqFound={};
    for(let p=start;p<pages.length;p++){
      const lines=(pages[p].modes&&pages[p].modes[mode])||[];
      let tokens=[];
      for(const l of lines){
        if(marker&&p===start&&marker.y!=null&&l.y!=null&&l.y<marker.y-2)continue;
        tokens=tokens.concat(clean(l.text??l).match(/\d{1,3}|[A-F]/gi)||[]);
      }
      for(let i=0;i<tokens.length;i++){
        if(/^\d+$/.test(tokens[i])&&Number(tokens[i])===expected){
          for(let j=i+1;j<Math.min(i+5,tokens.length);j++){
            if(/^[A-F]$/i.test(tokens[j])){seqFound[expected]=tokens[j].toUpperCase();expected++;i=j;break;}
          }
        }
      }
    }
    if(Object.keys(seqFound).length>Object.keys(found).length)Object.assign(found,seqFound);
  }
  const out={};let n=1;while(found[n]&&/^[A-F]$/.test(found[n])){out[n]=found[n];n++;}
  return out;
}
function linesBeforeMarker(pages,marker,mode){
  const out=[],last=marker?marker.page:pages.length-1;
  for(let p=0;p<=last;p++){
    // If the solution header is at the very top of its page, the whole page is an answer sheet.
    // This also covers multi-column answer tables whose second column may start slightly above the header row.
    if(marker&&p===marker.page&&marker.y!=null&&marker.y<150)continue;
    const seq=((pages[p].modes||{})[mode]||[]);
    for(let i=0;i<seq.length;i++){
      const item=seq[i],t=clean(item.text??item),y=item.y;
      if(marker&&p===marker.page&&marker.y!=null&&y!=null&&y>=marker.y-1)continue;
      if(solutionMarkerText(t)||detailedSolutionsMarkerText(t))break;
      const next=i+1<seq.length?clean(seq[i+1].text??seq[i+1]):'';
      if((questionHeaderOnly(t)&&answerHeaderOnly(next))||(answerHeaderOnly(t)&&questionHeaderOnly(next)))break;
      if(isTitle(t))continue;
      if(/^\d{1,3}$/.test(t)&&item.edge===true)continue;
      out.push(t);
    }
  }
  return out;
}
function parseQuestionLines(lines){
  const qs=[];let cur=null,currentOpt=null;
  const finish=()=>{
    if(!cur)return;
    cur.question=clean(cur.q.join(' '));delete cur.q;
    const opts={};for(const [k,v] of Object.entries(cur.options))opts[k]=clean(v.join(' '));cur.options=opts;
    qs.push(cur);cur=null;currentOpt=null;
  };
  for(const raw of lines){
    const l=stripRunningMatter(raw);if(!l||isTitle(l)||isQuestionMetadataLine(l))continue;
    if(answerSheetMarkerText(l)){finish();continue;}
    let m=l.match(Q_RE);
    if(m){
      // A line such as `10.` inside a Windows 10 explanation is not a question header.
      // Real questions must progress sequentially when a question is already open.
      const proposed=Number(m[1]);
      if(cur && proposed!==cur.n+1){
        if(currentOpt)cur.options[currentOpt].push(l);else cur.q.push(l);
        continue;
      }
      finish();cur={n:proposed,q:m[2]?[m[2]]:[],options:{}};continue;
    }
    m=l.match(Q_HDR_RE);
    if(m){finish();cur={n:Number(m[1]),q:[],options:{}};continue;}
    if(!cur)continue;
    m=l.match(O_RE);
    if(m){currentOpt=m[1].toUpperCase();if(!cur.options[currentOpt])cur.options[currentOpt]=[];if(m[2])cur.options[currentOpt].push(m[2]);continue;}
    if(currentOpt)cur.options[currentOpt].push(l);else cur.q.push(l);
  }
  finish();return qs;
}
function structuralScore(qs){
  const {by,dups}=normalizeSet(qs);let valid=0;
  for(const q of Object.values(by))if(questionProblems(q,null).length===0)valid++;
  const nums=Object.keys(by).map(Number).sort((a,b)=>a-b);let contiguous=0;for(let i=0;i<nums.length&&nums[i]===i+1;i++)contiguous++;
  return valid*100+contiguous*5+nums.length-dups.length*50;
}
function linesAfterMarker(pages,marker,mode){
  const out=[];if(!marker)return out;
  for(let p=marker.page;p<pages.length;p++){
    const seq=((pages[p].modes||{})[mode]||[]);
    for(const item of seq){
      const t=clean(item.text??item),y=item.y;
      if(p===marker.page&&marker.y!=null&&y!=null&&y<marker.y-1)continue;
      if(!t||isTitle(t)||isQuestionMetadataLine(t)||detailedSolutionsMarkerText(t))continue;
      out.push(t);
    }
  }
  return out;
}
function cleanFeedbackOptionText(t){
  return clean(String(t||'').replace(/^[\s✔✓✘✗×☒☑•·]+/u,'').replace(/\s*\(\s*correcta\s*\)\s*$/i,'').replace(/^[A-Fa-f]\s*[.)]\s*/,'')).trim();
}
function optionMatch(text,q){
  const cleaned=cleanFeedbackOptionText(text);
  const x=norm(cleaned);if(!x)return null;
  // Important: keyboard shortcuts differ by a single letter or punctuation.
  // Jaccard deliberately omits one-character tokens; exact match MUST win first.
  const exact=cleaned.toLocaleLowerCase('es-ES');
  for(const [L,v] of Object.entries(q?.options||{})){
    if(clean(v).toLocaleLowerCase('es-ES')===exact)return {letter:L,score:1};
  }
  let best=null,bestScore=0;
  for(const [L,v] of Object.entries(q?.options||{})){
    const y=norm(v);if(!y)continue;
    let score=tokenJaccard(x,y);
    if(x===y)score=1;
    else if(x.includes(y)||y.includes(x)){const ratio=Math.min(x.length,y.length)/Math.max(x.length,y.length);score=Math.max(score,0.72+0.28*ratio);}
    if(score>bestScore){bestScore=score;best=L;}
  }
  return bestScore>=0.68?{letter:best,score:bestScore}:null;
}
function parseDetailedFeedback(lines,referenceQuestions){
  const by=normalizeSet(referenceQuestions||[]).by,details={},solutions={};let currentN=null,currentOpt=null,phase='question',prevLine='',markedIndex=0;
  const ensure=n=>details[n]||(details[n]={explanationParts:[],optionParts:{}});
  for(let i=0;i<lines.length;i++){
    const l=clean(lines[i]);if(!l||isTitle(l)||isQuestionMetadataLine(l))continue;
    if(answerSheetMarkerText(l))break;
    const hm=l.match(Q_HDR_RE);if(hm){currentN=Number(hm[1]);currentOpt=null;phase='question';prevLine='';markedIndex=0;ensure(currentN);continue;}
    if(!currentN||!by[currentN]){prevLine=l;continue;}
    const q=by[currentN],d=ensure(currentN);
    const explicit=l.match(/^Clave verificada:\s*([A-D])$/i);
    if(explicit){solutions[currentN]=explicit[1].toUpperCase();prevLine=l;continue;}
    if(/^explicaci[oó]n\s*:/i.test(l)){
      phase='general';currentOpt=null;const rest=clean(l.replace(/^explicaci[oó]n\s*:/i,''));if(rest)d.explanationParts.push(rest);prevLine=l;continue;
    }
    const standaloneCorrect=/^\(?\s*correcta\s*\)?[.\s]*$/i.test(l);
    if(standaloneCorrect){const pm=optionMatch(prevLine,q);if(pm){currentOpt=pm.letter;solutions[currentN]=currentOpt;if(!d.optionParts[currentOpt])d.optionParts[currentOpt]=[];}prevLine=l;continue;}
    // No confundir una frase explicativa que contiene palabras de una opción con la opción misma.
    // Las líneas de opción del feedback vienen marcadas (✔/✘/etc.) o contienen “(Correcta)”.
    const marked=/^[\s]*[✔✓✘✗×☒☑]/u.test(l);
    const canBeOption=marked||/\(\s*correcta\s*\)/i.test(l);
    let optionLine=l,m=canBeOption?optionMatch(optionLine,q):null;
    if(marked&&i+1<lines.length){
      const nx=clean(lines[i+1]);
      const continuation=nx&&!isTitle(nx)&&!isQuestionMetadataLine(nx)&&!Q_HDR_RE.test(nx)&&!answerSheetMarkerText(nx)&&!detailedSolutionsMarkerText(nx)&&!/^\(?\s*correcta\s*\)?/i.test(nx)&&!/^[\s]*[✔✓✘✗×☒☑]/u.test(nx)&&!(/^(?:correcto|incorrecto|falso|verdadero|demasiado|esta\b|este\b|sirve\b|software\b|programas?\b|aplicaci[oó]n\b)/i.test(nx));
      if(continuation){const cm=optionMatch(optionLine+' '+nx,q);if(cm&&(!m||cm.score>=0.98||cm.score>m.score+0.01)){optionLine=optionLine+' '+nx;m=cm;i++;}}
    }
    if(marked){const expected='ABCDEF'[markedIndex++]||null;if(expected&&(!m||(m.letter!==expected&&m.score<0.995)))m={letter:expected,score:m?.score||0};}
    if(m){currentOpt=m.letter;phase='option';if(!d.optionParts[currentOpt])d.optionParts[currentOpt]=[];if(/\bcorrecta\b/i.test(optionLine))solutions[currentN]=currentOpt;prevLine=optionLine;continue;}
    // En el bloque inicial puede repetirse el enunciado; no debe entrar en la explicación.
    if(phase==='question'){const sim=tokenJaccard(l,q.question);if(sim>=0.65){prevLine=l;continue;}}
    if(phase==='general')d.explanationParts.push(l);
    else if(phase==='option'&&currentOpt)d.optionParts[currentOpt].push(l);
    prevLine=l;
  }
  const outDetails={};
  for(const [n,d] of Object.entries(details)){
    const item={};const ex=clean(d.explanationParts.join(' '));if(ex)item.explanation=ex;
    const oe={};for(const [L,parts] of Object.entries(d.optionParts)){const txt=clean(parts.join(' '));if(txt)oe[L]=txt;}
    const expectedOptions=Object.keys(by[Number(n)]?.options||{}).length;
    if(expectedOptions&&Object.keys(oe).length===expectedOptions)item.optionExplanations=oe;
    outDetails[n]=item;
  }
  return {solutions,details:outDetails};
}
function applyDidacticDetails(q,detail){
  if(!detail)return q;const out={...q};
  if(detail.explanation)out.explanation=detail.explanation;
  if(detail.optionExplanations&&Object.keys(detail.optionExplanations).length)out.optionExplanations={...detail.optionExplanations};
  return out;
}
function containsLeak(s,n){
  const t=clean(s);if(!t)return false;
  if(/\bPREG\b.*\b(?:SOL|RESP)/i.test(t))return true;
  if(/\bTEST\s+N[ºO°]?\s*\d+/i.test(t))return true;
  if(n&&new RegExp('(?:^|\\s)'+(n+1)+'\\s*[-–—.)]\\s+[A-ZÁÉÍÓÚÜÑ¿¡]').test(t))return true;
  return false;
}
function questionProblems(q,correct){
  const problems=[];
  if(!q||!Number(q.n))return ['pregunta inválida'];
  if(!clean(q.question))problems.push('enunciado vacío');
  if(containsLeak(q.question,q.n))problems.push('enunciado contaminado');
  const opts=q.options||{},letters=Object.keys(opts).sort();
  if(letters.length<3||letters.length>6)problems.push('número de opciones no válido: '+letters.length);
  const expected='ABCDEF'.slice(0,letters.length);if(letters.length&&letters.join('')!==expected)problems.push('opciones no consecutivas: '+letters.join(','));
  if(correct&&(!opts[correct]||!clean(opts[correct])))problems.push('falta la opción correcta '+correct);
  const seen={};
  for(const L of letters){
    const v=clean(opts[L]);if(!v)problems.push('opción '+L+' vacía');if(containsLeak(v,q.n))problems.push('opción '+L+' contaminada');
    // Preserve punctuation/signs when comparing options. `Ctrl++` and
    // `Ctrl+=`, or `Ctrl+Mayús+-` and `Ctrl+Mayús+*`, are NOT duplicates.
    const nv=stripAccents(v.toLowerCase()).replace(/\s+/g,' ').trim();
    if(nv&&nv.length>4){if(seen[nv])problems.push('opciones '+seen[nv]+' y '+L+' duplicadas');else seen[nv]=L;}
  }
  return problems;
}
function normalizeSet(qs){const by={},dups=[];for(const q of qs||[]){if(!q||!Number(q.n))continue;if(by[q.n])dups.push(Number(q.n));else by[q.n]=q;}return {by,dups};}
function validateSet(qs,sols){
  const normed=normalizeSet(qs),expected=Object.keys(sols).map(Number).sort((a,b)=>a-b),missing=[],bad=[];
  if(normed.dups.length)return {ok:false,missing:[],bad:normed.dups.map(n=>({n,why:['duplicada']})),by:normed.by};
  for(const n of expected){const q=normed.by[n];if(!q){missing.push(n);continue;}const why=questionProblems(q,sols[n]);if(why.length)bad.push({n,why});}
  const extras=Object.keys(normed.by).map(Number).filter(n=>!sols[n]);
  return {ok:missing.length===0&&bad.length===0&&extras.length===0&&Object.keys(normed.by).length===expected.length,missing,bad,extras,by:normed.by};
}
function tokenJaccard(a,b){
  const A=new Set(norm(a).split(' ').filter(x=>x.length>1)),B=new Set(norm(b).split(' ').filter(x=>x.length>1));if(!A.size&&!B.size)return 1;
  let inter=0;for(const x of A)if(B.has(x))inter++;return inter/(new Set([...A,...B]).size||1);
}
function comparable(q){let s=clean(q.question);for(const L of Object.keys(q.options||{}).sort())s+=' '+L+' '+clean(q.options[L]);return s;}
function setSimilarity(a,b,sols){const A=normalizeSet(a).by,B=normalizeSet(b).by;let sum=0,n=0;for(const k of Object.keys(sols).map(Number)){if(A[k]&&B[k]){sum+=tokenJaccard(comparable(A[k]),comparable(B[k]));n++;}}return n?sum/n:0;}
function cloneQuestion(q,correct){const out={n:Number(q.n),question:clean(q.question),options:{},correct};for(const L of Object.keys(q.options||{}))out.options[L]=clean(q.options[L]);for(const k of ['explanation','memoryTip','trap','sourceNote','ungraded'])if(q?.[k])out[k]=k==='ungraded'?true:clean(q[k]);if(q?.optionExplanations&&typeof q.optionExplanations==='object'){out.optionExplanations={};for(const [L,v] of Object.entries(q.optionExplanations))if(clean(v))out.optionExplanations[L]=clean(v);}return out;}

function studyAnswerSheet(page){
  const out={},rows=page?.rows||[];
  for(let i=0;i<rows.length-1;i++){
    const a=(rows[i].tokens||[]).map(x=>clean(x.text)),b=(rows[i+1].tokens||[]).map(x=>clean(x.text));
    if(a.length===5&&b.length===5&&a.every(x=>/^\d{1,2}$/.test(x))&&b.every(x=>/^[A-D]$/.test(x))){
      for(let j=0;j<5;j++)out[Number(a[j])]=b[j];
    }
    const match=a.join(' ').match(/^\s*(2[67])\s+([A-D])(?:\s|$)/);
    if(match)out[Number(match[1])]=match[2];
  }
  return out;
}
function studyAnswerSheetLayout(page){
  const tok=[];
  for(const row of page?.rows||[]){
    for(const t of row.tokens||[])tok.push({text:clean(t.text),x:Number(t.x),y:Number(row.y)});
  }
  const out={};
  for(let n=1;n<=27;n++){
    const options=[];
    for(const t of tok){
      if(t.text!==String(n))continue;
      for(const a of tok){
        if(!/^[A-D]$/i.test(a.text))continue;
        if(n<=25){
          if(a.y-t.y<12||a.y-t.y>40||Math.abs(a.x-t.x)>25)continue;
        }else{
          if(Math.abs(a.y-t.y)>5||a.x-t.x<20||a.x-t.x>110)continue;
        }
        options.push({v:a.text.toUpperCase(),dx:Math.abs(a.x-t.x),dy:Math.abs(a.y-t.y)});
      }
    }
    options.sort((a,b)=>a.dx+b.dy*2);
    if(options.length===1||options.length>1&&options[0].dx+options[0].dy*2<options[1].dx+options[1].dy*2-3)out[n]=options[0].v;
  }
  return Object.keys(out).length===27?out:{};
}
function studyAnswerSheetFallback(page){
  const lines=(page?.modes?.native||page?.modes?.one||[]).map(x=>clean(x.text??x));
  // PDFs académicos con la plantilla en cinco columnas: el extractor puede
  // devolver números y letras como líneas independientes en vez de filas.
  // Solo aceptar una secuencia EXACTA 1..25 y las dos reservas 26..27.
  const out={};let i=0;
  for(let expected=1;expected<=27;expected++){
    let found=false;
    while(i<lines.length){
      const t=lines[i++];if(!new RegExp('^'+expected+'$').test(t))continue;
      const next=lines[i]||'';
      if(/^[A-D]$/i.test(next)){out[expected]=next.toUpperCase();i++;found=true;break;}
    }
    if(!found)break;
  }
  return Object.keys(out).length===27?out:{};
}
// PDF de estudio con una respuesta bajo cada pregunta, diferente del formato
// hoja de soluciones o feedback. Se bloquean silencios y letras que no casan.
function parseInlineStudyPdf(pages){
  const all=pages.flatMap(p=>(p.modes?.one||[]).map(x=>clean(x.text??x)));
  if(!all.some(x=>/^Pregunta\s+1\s*\(original\s+\d+\)/i.test(x)))return null;
  const groups=[];let cur=null;
  for(const line of all){
    const m=line.match(/^Pregunta\s+(\d{1,3})\s*\(original\s+(?:(\d+)|(Reserva\s+\d+))\)\s*$/i);
    if(m){if(cur)groups.push(cur);cur={n:+m[1],original:m[2]||m[3],lines:[]};continue;}
    if(cur)cur.lines.push(line);
  }
  if(cur)groups.push(cur);
  const questions=[],solutions={},flags=[];
  const isTramitacionB=groups.some(g=>g.original==='117')&&groups.some(g=>g.original==='140');
  const optRE=/^([A-D])\)\s*(.*)$/;
  for(const group of groups){
    const q={n:group.n,question:'',options:{},correct:'',explanation:''};
    let phase='question',last=null,answerText='';
    for(const line of group.lines){
      if(/^Respuesta indicada\s*:/i.test(line)){
        phase='answer';const m=line.match(/^Respuesta indicada\s*:\s*([A-D])\s*[—–-]?\s*(.*)$/i);
        if(m){q.correct=m[1].toUpperCase();answerText=m[2]||'';}continue;
      }
      if(/^Explicaci[oó]n\s*:/i.test(line)){
        phase='explanation';q.explanation=clean(line.replace(/^Explicaci[oó]n\s*:/i,''));continue;
      }
      const om=phase!=='explanation'&&phase!=='answer'?line.match(optRE):null;
      if(om){phase='option';last=om[1];q.options[last]=clean(om[2]);continue;}
      if(phase==='question')q.question=clean(q.question+' '+line);
      else if(phase==='option'&&last)q.options[last]=clean(q.options[last]+' '+line);
      else if(phase==='answer')answerText=clean(answerText+' '+line);
      else if(phase==='explanation')q.explanation=clean(q.explanation+' '+line);
    }
    if(solutions[q.n])flags.push({n:q.n,why:['numeración duplicada']});
    if(q.correct)solutions[q.n]=q.correct;
    // Hay soluciones de estudio redactadas con el texto parcialmente abreviado;
    // comparar solo cuando su texto es razonablemente completo.
    if(answerText&&q.options[q.correct]){
      const a=norm(answerText),b=norm(q.options[q.correct]);
      if(a.length>13&&b.length>13&&!a.includes(b)&&!b.includes(a)&&tokenJaccard(a,b)<0.68)
        flags.push({n:q.n,why:['la opción marcada difiere del texto de respuesta indicado']});
    }
    const errors=questionProblems(q,q.correct);
    if(Object.keys(q.options).length!==4)errors.push('no hay cuatro alternativas A-D');
    if(!q.explanation||q.explanation.length<30)errors.push('explicación ausente o insuficiente');
    if(errors.length)flags.push({n:q.n,why:errors});
    if(/PREGUNTA TÉCNICAMENTE DISCUTIBLE|PREGUNTA CON NOTACIÓN AMBIGUA|NO figura entre las cuatro opciones/i.test(q.explanation)){
      q.ungraded=true;
      q.trap='Pregunta histórica discutible: la letra indicada procede del análisis, pero NO debe considerarse una respuesta técnica inequívoca. No puntúa en el entrenamiento.';
    }
    if(isTramitacionB){
      const original=Number(group.original);
      if(original===122||original===130){
        q.ungraded=true;
        q.trap='ANULADA por el Tribunal Calificador Único en la plantilla definitiva del 27/10/2026. La letra incluida en el material de estudio NO es una solución oficial válida. No puntúa.';
        q.sourceNote='Tercer ejercicio Tramitación 2026, modelo B. Plantilla definitiva del Tribunal Calificador Único de 27 de octubre de 2026.';
      }else if(original===139||original===140){
        q.ungraded=true;
        q.trap='Reserva no utilizada para sustituir las dos anulaciones del tercer ejercicio (122 y 130); se conserva solo para practicar, sin puntuación en la simulación oficial.';
        q.sourceNote='Plantilla definitiva del tercer ejercicio, modelo B: 137 y 138 sustituyen por orden las preguntas anuladas 122 y 130.';
      }
    }
    questions.push(q);
  }
  const expected=groups.length;
  if(!expected||questions.some((q,i)=>q.n!==i+1)||Object.keys(solutions).length!==expected)
    flags.push({n:0,why:['secuencia de preguntas/soluciones incompleta']});
  return {status:flags.length?'review':'verified',confidence:flags.length?'low':'high',
    reason:flags.length?'PDF de estudio: preguntas que requieren revisión':'Pregunta, opciones y clave extraídas del mismo bloque con coherencia de respuesta',
    marker:{source:'estudio-inline'},questions,solutions,flags,candidates:[],solutionSource:'respuesta asociada a cada pregunta'};
}
function studyDetails(lines){
  const find=re=>lines.findIndex(x=>re.test(x));
  const a=find(/QU[EÉ]\s+SE\s+PREGUNTA\s+Y\s+C[OÓ]MO\s+LO\s+RAZONO/i);
  const b=find(/AN[AÁ]LISIS\s+DE\s+LAS\s+CUATRO\s+OPCIONES/i);
  const c=find(/QU[EÉ]\s+QUIERO\s+QUE\s+RECUERDES/i);
  const d=find(/^\s*(?:Dificultad\b|Fuentes\s*:)/i);
  const details={};
  if(a>=0&&b>a){const explanation=clean(lines.slice(a+1,b).join(' '));if(explanation)details.explanation=explanation;}
  if(b>=0){
    const area=lines.slice(b+1,c>=0?c:(d>=0?d:lines.length));let current=null,acc=[],out={};
    const flush=()=>{if(current){const val=clean(acc.join(' '));if(val)out[current]=val;}};
    for(const line of area){
      const m=line.match(/^\s*([A-D])\s{0,5}(.+)/);
      if(m){flush();current=m[1];acc=[m[2]];continue;}
      if(current)acc.push(line);
    }
    flush();
    for(const [key,value] of Object.entries(out)){
      const mark=value.search(/\bObservaci[oó]n did[aá]ctica\s*[.:]/i);
      if(mark>=0){
        details.trap=clean(value.slice(mark));out[key]=clean(value.slice(0,mark));
      }
    }
    if(Object.keys(out).length===4)details.optionExplanations=out;
  }
  if(c>=0){
    const area=lines.slice(c+1,d>c?d:lines.length);
    const words=clean(area.join(' '));
    if(words)details.memoryTip=words.slice(0,450);
  }
  return details;
}

// Analyses material de estudio Cantabria: page 3-9 holds the original questionnaire;
// page 13 holds the answer table; pages 14-40 contain a detailed ficha per item.
// The picture-bearing items must NEVER be silently imported as text-only questions.
function parseCantabriaStudy(pages){
  if(!Array.isArray(pages)||pages.length<40)return null;
  const heading=(pages[0]?.modes?.one||pages[0]?.modes?.native||[]).map(x=>clean(x.text??x)).join(' ').toLowerCase();
  if(!heading.includes('cantabria')||!heading.includes('analisis'))return null;
  const text=(p,mode='one')=>((pages[p]?.modes||{})[mode]||[]).map(x=>clean(x.text??x)).filter(Boolean);
  const questions=parseQuestionLines(Array.from({length:7},(_,i)=>text(i+2)).flat());
  const answer={},details={},invalid=[];
  const sheetPrimary=studyAnswerSheet(pages[12]);
  const sheetLayout=studyAnswerSheetLayout(pages[12]);
  const answerSheet=Object.keys(sheetPrimary).length===27?sheetPrimary:(Object.keys(sheetLayout).length===27?sheetLayout:studyAnswerSheetFallback(pages[12]));
  for(let n=1;n<=27;n++){
    const lines=text(n+12); // e.g., page 14 is index 13 for question 1.
    const key=lines.map(l=>l.match(/\bRESPUESTA\s+([A-D])\b/i)).find(Boolean);
    if(key)answer[n]=key[1].toUpperCase();
    else invalid.push({n,why:['no se identifica la respuesta en su ficha']});
    details[n]=studyDetails(lines);
  }
  const qmap=normalizeSet(questions).by,flags=[];
  for(let n=1;n<=27;n++){
    const q=qmap[n];
    if(!q){flags.push({n,why:['pregunta original ausente']});continue;}
    const issues=questionProblems(q,answer[n]);
    if(issues.length)flags.push({n,why:issues});
    if(/\b(?:el|con el)\s+icono\b/i.test(q.question)){
      // Dejar esta pregunta en revisión hasta que el importador capture el icono de su página.
      flags.push({n,why:['necesita imagen gráfica asociada al enunciado']});
    }
    if(!details[n]?.explanation||details[n].explanation.length<30)flags.push({n,why:['no se ha reconstruido la justificación']});
    if(answerSheet[n]&&answerSheet[n]!==answer[n])flags.push({n,why:['la plantilla y la ficha no coinciden: '+answerSheet[n]+' frente a '+answer[n]]});
  }
  if(questions.length!==27||Object.keys(answer).length!==27)flags.push({n:0,why:[`examen incompleto: ${questions.length}/27 preguntas; ${Object.keys(answer).length}/27 soluciones`]});
  if(Object.keys(answerSheet).length!==27)flags.push({n:0,why:[`plantilla incompleta: ${Object.keys(answerSheet).length}/27 claves`]});
  const complete=flags.length===0;
  return {
    status:complete?'verified':'review',confidence:complete?'high':'low',
    reason:complete?'Cuestionario original cotejado contra 27 fichas de respuestas':'Hay elementos gráficos o elementos no verificables que requieren una importación enriquecida',
    solutionSource:'fichas individuales del mismo PDF',solutions:answer,
    questions:Array.from({length:27},(_,i)=>qmap[i+1]).filter(Boolean).map(q=>{
      const out=cloneQuestion(q,answer[q.n]);
      if(details[q.n])Object.assign(out,details[q.n]);
      if(/2016/i.test(heading)&&!(/2021/.test(heading)))out.sourceNote='Examen histórico; plantilla de estudio del análisis material de estudio (no consta verificación independiente de la plantilla oficial).';
      return out;
    }),flags,marker:{page:12,source:'material de estudio'},candidates:[]
  };
}


// Casos editoriales material de estudio: los bloques de cuestionario, plantilla y fichas son
// regiones DIFERENTES. El número total se obtiene del documento, nunca de 27.
function pdfLines(pages,i,mode='one'){
 return (pages[i]?.modes?.[mode]||[]).map(v=>clean(v.text??v)).filter(Boolean);
}
function detectStudyDocument(pages){
 const head=pdfLines(pages,0).join(' ').toUpperCase();
 if(!head.includes('ANALISIS EXAMEN'))return null;
 if(head.includes('AUXILIAR ADMINISTRATIVO 2023')&&head.includes('CANTABRIA'))return 'cantabria-2023';
 if(head.includes('TRAMITACION PROCESAL 2026'))return 'tramitacion-2026';
 return null;
}
function studySheetKey(pages,index,from,to){
 const page=pages[index];if(!page)return {};
 const result={};
 // PDF.js conserva habitualmente el orden n, letra de la tabla aun cuando
 // la lectura geometrica ordenada por filas los distribuya por columnas.
 for(const mode of ['native','one','two','three']){
  const ls=pdfLines(pages,index,mode);
  const keys={};
  for(let i=0;i<ls.length-1;i++){
   if(!/^\d{1,3}$/.test(ls[i])||!(/^[A-D]$/i).test(ls[i+1]))continue;
   const n=+ls[i];if(n>=from&&n<=to&&!keys[n])keys[n]=ls[i+1].toUpperCase();
  }
  if(Object.keys(keys).length>Object.keys(result).length)Object.assign(result,keys);
 }
 // Los cuadros de 5 u 8 columnas: identificar tokens por proximidad de eje X
 // y una distancia vertical positiva, ignorando texto de cabeceras.
 for(const row of page.rows||[]){
  const tokens=(row.tokens||[]).map(t=>({text:clean(t.text),x:+t.x,y:+row.y}));
  for(const t of tokens){const m=t.text.match(/^(\d{1,3})\s*[-.)]?\s+([A-D])$/i);if(m&&+m[1]>=from&&+m[1]<=to)result[+m[1]]=m[2].toUpperCase();}
 }
 return result;
}
function parseExtendedStudy(pages){
 const type=detectStudyDocument(pages);if(!type)return null;
 const c23=type==='cantabria-2023';
 const begin=c23?1:117,end=c23?42:140;
 const originalFirst=2,originalEnd=c23?13:8;
 const sheet=c23?16:11,ficheStart=c23?17:12;
 if(pages.length<ficheStart+(end-begin+1))return {status:'error',confidence:'none',error:'Este análisis material de estudio está cortado: faltan fichas de soluciones. No se ha guardado nada.',questions:[],solutions:{},flags:[]};
 const questions=parseQuestionLines(pages.slice(originalFirst,originalEnd).flatMap(p=>(p.modes?.one||[]).map(v=>clean(v.text??v))));
 const by=normalizeSet(questions).by,solutions={},flags=[],out=[];
 const sheetKeys=studySheetKey(pages,sheet,begin,end);
 for(let n=begin;n<=end;n++){
  const q=by[n],lines=pdfLines(pages,ficheStart+n-begin);
  const answer=lines.map(x=>x.match(/\bRESPUESTA\s+(?:CORRECTA\s+)?([A-D])\b/)).find(Boolean)?.[1];
  if(!q){flags.push({n,why:['falta la pregunta original']});continue;}
  if(!answer){flags.push({n,why:['falta respuesta en la ficha original']});continue;}
  solutions[n]=answer;
  const problems=questionProblems(q,answer);
  if(Object.keys(q.options).length!==4)problems.push('faltan opciones A-D');
  if(sheetKeys[n]&&sheetKeys[n]!==answer)problems.push(`plantilla y ficha discrepan (${sheetKeys[n]}/${answer})`);
  const details=studyDetails(lines);
  if(!details.explanation||details.explanation.length<28)problems.push('falta la explicación de la ficha');
  if(problems.length)flags.push({n,why:problems});
  const item=cloneQuestion(q,answer);Object.assign(item,details);
  if(c23){
   item.sourceNote='Cantabria 2023 · plantilla de estudio del PDF material de estudio; no acreditada aquí como plantilla definitiva del tribunal.';
   if(n>=41)item.officialStatus='reserva';
  }else{
   item.originalNumber=n;
   item.sourceNote='Tramitación Procesal 2026 · modelo B, cotejo interno con ficha. Preguntas 122 y 130 anuladas en la plantilla definitiva.';
   if(n===122||n===130){item.ungraded=true;item.officialStatus='anulada';item.trap='Pregunta anulada: no puntúa.';}
   else if(n>=139){item.ungraded=true;item.officialStatus='reserva-no-utilizada';item.trap='Pregunta de reserva no utilizada: no puntúa.';}
   else item.officialStatus=n>=137?'reserva-utilizada':'evaluada';
  }
  out.push(item);
 }
 const count=end-begin+1;
 if(Object.keys(by).length!==count||out.length!==count||Object.keys(solutions).length!==count)flags.push({n:0,why:[`documento incompleto: ${out.length}/${count} preguntas, ${Object.keys(solutions).length}/${count} claves`]});
 // Las parejas de la tabla aportan cotejo independiente cuando PDF.js permite
 // reconstruirlas. NUNCA se inventa una letra ausente.
 const exactSheet=Array.from({length:count},(_,i)=>begin+i).every(n=>sheetKeys[n]===solutions[n]);
 if(Object.keys(sheetKeys).length&&Object.keys(sheetKeys).length<count)flags.push({n:0,why:['la tabla de respuestas necesita cotejo adicional, aunque las fichas individuales son completas']});
 return {status:flags.length?'review':'verified',confidence:flags.length?'low':'high',reason:flags.length?'Hay elementos que necesitan cotejo':'Cuestionario completo, fichas numeradas y soluciones cotejadas dentro del documento'+(exactSheet?' y con la tabla':' (sin certificación externa)'),questions:out,solutions,flags,candidates:[],marker:{source:type},solutionSource:'fichas individuales y plantilla de estudio',expectedQuestionCount:count};
}

function parseState2024(pages){
 // Análisis material de estudio reorganizado por temas. El catálogo contiene las preguntas
 // 11..50 y cuatro reservas; NO usa el formato Pregunta N del cuestionario.
 if(!pages||pages.length<45)return null;
 const peek=pages.slice(1,3).flatMap(p=>(p.modes?.one||[]).map(x=>clean(x.text??x))).join(' ').replace(/\s+/g,'');
 if(!/TurnoLibre/i.test(peek)||!/Opción[AB]/i.test(peek)||!/Estado/i.test(peek))return null;
 const groups=[];let current=null,phase='none',letter=null;
 const flush=()=>{if(current)groups.push(current);current=null;phase='none';letter=null;};
 for(const p of pages.slice(6,26)){
  for(const v of p.modes?.one||[]){const line=clean(v.text??v);if(!line)continue;
   const m=line.match(/^2\.\d+\.\d+\s+(?:(\d{1,2})|Reserva\s+(\d))\s*[·•-]/i);
   if(m){flush();current={original:m[1]?Number(m[1]):'R'+Number(m[2]),stem:[],options:{},key:null};continue;}
   if(!current)continue;
   if(/^Enunciado\s*:/i.test(line)){phase='stem';letter=null;const t=clean(line.replace(/^Enunciado\s*:/i,''));if(t)current.stem.push(t);continue;}
   const ans=line.match(/^Respuesta\s+oficial\s*:\s*([A-D])\s*[.)]/i);
   if(ans){current.key=ans[1].toUpperCase();phase='key';letter=null;continue;}
   const opt=line.match(/^([A-D])\s*[.)]\s*(.*)$/i);
   if(opt&&phase!=='stem'){phase='option';letter=opt[1].toUpperCase();current.options[letter]=[clean(opt[2])];continue;}
   if(phase==='stem'){current.stem.push(line);continue;}
   if(phase==='option'&&letter){
    if(/^(?:\d\.\d+|[A-Z] [A-Z] [A-Z]|An[aá]lisis\s+Ex[aá]menes|Turno\s+Libre|Auxiliar\s+Administrativo\s+Estado)/i.test(line))continue;
    current.options[letter].push(line);
   }
  }
 }
 flush();
 if(groups.length<35)return {status:'error',confidence:'none',error:`Catálogo de 2024 no recuperado completamente (${groups.length}/44 grupos)`,questions:[],solutions:{},flags:[]};
 const by={};for(const g of groups){if(by[String(g.original)])return {status:'error',confidence:'none',error:'Pregunta duplicada en catálogo de Estado 2024: '+g.original,questions:[],solutions:{},flags:[]};by[String(g.original)]=g;}
 const keys=[...Array.from({length:40},(_,i)=>String(i+11)),'R1','R2','R3','R4'];
 const explanations=parseState2024Explanations(pages);
 const questions=[],solutions={},flags=[];
 for(let i=0;i<keys.length;i++){
  const g=by[keys[i]],n=i+1;
  if(!g){flags.push({n,why:['pregunta original no recuperada: '+keys[i]]});continue;}
  const q={n,originalNumber:g.original,question:clean(g.stem.join(' ')),options:Object.fromEntries(Object.entries(g.options).map(([L,ss])=>[L,clean(ss.join(' '))])),correct:g.key,sourceNote:'Auxiliar Administrativo del Estado 2024 · modelo '+(peek.match(/Opción([AB])/i)?.[1]?.toUpperCase()||'?')+'; transcripción del análisis material de estudio.'};
  const explanation=explanations[i+1];if(explanation)q.explanation=explanation;
  if(typeof g.original==='string')q.officialStatus='reserva';
  const errs=questionProblems(q,q.correct);
  if(!g.key||Object.keys(q.options).length!==4)errs.push('clave u opciones incompletas');
  if(!q.explanation||q.explanation.length<35)errs.push('explicación de la ficha ausente');
  if(errs.length)flags.push({n,why:errs});
  if(q.correct)solutions[n]=q.correct;
  questions.push(q);
 }
 if(questions.length!==44||Object.keys(solutions).length!==44)flags.push({n:0,why:[`examen incompleto: ${questions.length}/44 preguntas y ${Object.keys(solutions).length}/44 claves`]});
 return {status:flags.length?'review':'verified',confidence:flags.length?'low':'high',reason:flags.length?'Catálogo incompleto o ficha sin explicación':'44 preguntas y cuatro reservas reconstruidas por enunciados y claves de catálogo; explicaciones del apartado 4',questions,solutions,flags,candidates:[],marker:{source:'estado-2024-catalogo'},expectedQuestionCount:44,solutionSource:'catálogo de preguntas y respuesta oficial del análisis'};
}
function parseState2024Explanations(pages){
 const result={};let idx=null,active=false,parts=[];
 const flush=()=>{if(idx!=null){const t=clean(parts.join(' '));if(t)result[idx]=t;}parts=[];};
 for(const p of pages.slice(23,70))for(const item of p.modes?.one||[]){const line=clean(item.text??item);if(!line)continue;
  const m=line.match(/^4\.(\d{1,2})\s*$/)||line.match(/^4\.(\d{1,2})\s*P\s*R\s*E\s*G\s*U\s*N\s*T\s*A/i);
  if(m){flush();idx=Number(m[1]);active=false;continue;}
  if(idx==null)continue;
  if(/^An[aá]lisis\s+de\s+la\s+pregunta\s*:/i.test(line)){active=true;parts.push(clean(line.replace(/^An[aá]lisis\s+de\s+la\s+pregunta\s*:/i,'')));continue;}
  if(/^An[aá]lisis\s+de\s+las\s+respuestas\s+incorrectas\s*:/i.test(line)||/^Fuentes\s+de\s+contraste\s*:/i.test(line)){active=false;continue;}
  if(active)parts.push(line);
 }
 flush();return result;
}
function analyzeCore(pages){
  const extended=parseExtendedStudy(pages);
  const estado=parseState2024(pages);if(estado)return estado;if(extended)return extended;
  const inline=parseInlineStudyPdf(pages);if(inline)return inline;
  const studyCase=parseCantabriaStudy(pages);
  if(studyCase)return studyCase;
  const detailedMarker=findDetailedFeedbackMarker(pages),legacyMarker=findMarker(pages),questionMarker=detailedMarker||legacyMarker;
  const modes=['native','one','two','three'].filter(m=>pages.some(p=>(p.modes?.[m]||[]).length));
  const parsed=modes.map(mode=>({mode,questions:parseQuestionLines(linesBeforeMarker(pages,questionMarker,mode))}));
  let reference=(parsed.slice().sort((a,b)=>structuralScore(b.questions)-structuralScore(a.questions))[0]||{questions:[]}).questions;

  let detailedBest=null;
  if(detailedMarker&&reference.length){
    for(const mode of modes){
      const d=parseDetailedFeedback(linesAfterMarker(pages,detailedMarker,mode),reference);
      const count=Object.keys(d.solutions).length;
      if(!detailedBest||count>Object.keys(detailedBest.solutions).length)detailedBest={mode,...d};
    }
  }
  let sols=(detailedBest&&Object.keys(detailedBest.solutions).length)?detailedBest.solutions:parseSolutions(pages,legacyMarker);
  const nsol=Object.keys(sols).length;
  if(!nsol)return {status:'error',confidence:'none',error:'No se ha encontrado una tabla o bloque de soluciones válido.',marker:questionMarker,solutions:sols,questions:[],candidates:[]};

  const candidates=parsed.map(c=>({mode:c.mode,questions:c.questions,validation:validateSet(c.questions,sols)}));
  const good=candidates.filter(c=>c.validation.ok);
  if(good.length){
    let best=good[0],agreement=1,minAgreement=1,cluster=[good[0]];
    if(good.length>1){
      let bestCluster=[],bestClusterScore=-1;
      for(const c of good){
        const neighbors=[c];
        for(const d of good){if(c===d)continue;const sim=setSimilarity(c.questions,d.questions,sols);if(sim>=0.97)neighbors.push(d);}
        let internal=1,count=0,total=0;
        for(let i=0;i<neighbors.length;i++)for(let j=i+1;j<neighbors.length;j++){total+=setSimilarity(neighbors[i].questions,neighbors[j].questions,sols);count++;}
        if(count)internal=total/count;
        if(neighbors.length>bestCluster.length||(neighbors.length===bestCluster.length&&internal>bestClusterScore)){bestCluster=neighbors;bestClusterScore=internal;}
      }
      cluster=bestCluster.length?bestCluster:[good[0]];
      let bestScore=-1;
      for(const c of cluster){let sum=0,n=0;for(const d of cluster){if(c===d)continue;sum+=setSimilarity(c.questions,d.questions,sols);n++;}const score=n?sum/n:1;if(score>bestScore){bestScore=score;best=c;agreement=score;}}
      minAgreement=1;for(let i=0;i<cluster.length;i++)for(let j=i+1;j<cluster.length;j++)minAgreement=Math.min(minAgreement,setSimilarity(cluster[i].questions,cluster[j].questions,sols));
    }
    let questions=Object.keys(sols).map(Number).sort((a,b)=>a-b).map(n=>cloneQuestion(best.validation.by[n],sols[n]));
    if(detailedBest?.details)questions=questions.map(q=>applyDidacticDetails(q,detailedBest.details[q.n]));
    const high=cluster.length>=2&&minAgreement>=0.97;
    const source=detailedBest&&Object.keys(detailedBest.solutions).length===questions.length?'soluciones detalladas':'tabla de soluciones';
    const reason=high?`${cluster.length} lecturas independientes coinciden; claves verificadas mediante ${source}${good.length>cluster.length?`; ${good.length-cluster.length} lectura(s) discordante(s) descartada(s)`:''}`:`Solo una lectura completa; claves obtenidas mediante ${source}`;
    return {status:high?'verified':'review',confidence:high?'high':'medium',reason,marker:questionMarker,solutions:sols,questions,candidates,agreement,minAgreement,consensusModes:cluster.map(c=>c.mode),flags:high?[]:questions.map(q=>({n:q.n,why:['solo una lectura completa']})),solutionSource:source};
  }
  const normalized=candidates.map(c=>({mode:c.mode,by:normalizeSet(c.questions).by})),questions=[],flags=[];
  for(const n of Object.keys(sols).map(Number).sort((a,b)=>a-b)){
    const variants=[];
    for(const c of normalized){const q=c.by[n];if(q&&questionProblems(q,sols[n]).length===0)variants.push({mode:c.mode,q});}
    if(!variants.length){flags.push({n,why:['no hay reconstrucción válida']});continue;}
    let best=variants[0],agreement=1;
    if(variants.length>1){let bestScore=-1;for(const v of variants){let sum=0,k=0;for(const w of variants){if(v===w)continue;sum+=tokenJaccard(comparable(v.q),comparable(w.q));k++;}const sc=k?sum/k:1;if(sc>bestScore){bestScore=sc;best=v;agreement=sc;}}}
    if(variants.length<2||agreement<0.97)flags.push({n,why:[variants.length<2?'solo una reconstrucción válida':`lecturas discrepan (${Math.round(agreement*100)} %)`]});
    let q=cloneQuestion(best.q,sols[n]);if(detailedBest?.details?.[n])q=applyDidacticDetails(q,detailedBest.details[n]);questions.push(q);
  }
  const finalValidation=validateSet(questions,sols);
  if(!finalValidation.ok){
    const badMap=new Map(flags.map(x=>[x.n,x]));
    for(const n of finalValidation.missing)badMap.set(n,{n,why:['pregunta no reconstruida']});
    for(const b of finalValidation.bad)badMap.set(b.n,b);
    return {status:'review',confidence:'low',reason:'Se requiere revisión manual de preguntas concretas',marker:questionMarker,solutions:sols,questions,candidates,flags:[...badMap.values()]};
  }
  return {status:'review',confidence:'low',reason:'Reconstrucción por combinación de lecturas; requiere revisión manual',marker:questionMarker,solutions:sols,questions,candidates,flags};
}
// Cotejo explícito de la plantilla DEFINITIVA, tercer ejercicio Tramitación
// Procesal 2026, MODELO B (publicada por el Tribunal el 27/10/2026).
// No aplica a otros modelos, aun cuando compartan numeración.
function finalizeOfficial(analysis){
 const Q=analysis?.questions||[];
 const byOriginal=new Map();
 for(const q of Q){const m=String(q.question||'').match(/\bPregunta\s+original\s+(\d{3})\b/i);if(m)byOriginal.set(Number(m[1]),q);}
 if(Q.length!==24||!byOriginal.has(117)||!byOriginal.has(140)||byOriginal.get(117)?.correct!=='A')return analysis;
 const official='A D C D D X B A C B B B A X C B A C B C C A C C'.split(' ');
 for(let original=117;original<=140;original++){
  const q=byOriginal.get(original);if(!q)continue;
  const key=official[original-117];
  if(key==='X'){
   q.ungraded=true;
   q.officialStatus='anulada';
   q.trap='ANULADA por la plantilla definitiva del Tribunal de 27/10/2026. La letra del análisis no es una respuesta oficial válida. No puntúa.';
  }else if(original>=139){
   q.ungraded=true;
   q.officialStatus='reserva-no-utilizada';
   q.trap='RESERVA NO UTILIZADA: las preguntas 137 y 138 sustituyen a las anuladas 122 y 130. Esta se conserva para estudiar pero no puntúa en la simulación oficial.';
  }else{
   q.officialStatus=original>=137?'reserva-utilizada':'evaluada';
   if(q.correct!==key){
    analysis.flags=[...(analysis.flags||[]),{n:q.n,why:[`solución del PDF (${q.correct}) distinta de la plantilla definitiva (${key}); corregida`] }];
    q.correct=key;
    if(analysis.solutions)analysis.solutions[q.n]=key;
   }
   q.ungraded=false;
  }
  q.sourceNote='Tramitación Procesal 2026, modelo B. Plantilla definitiva del Tribunal Calificador Único, publicada el 27/10/2026.';
 }
 const wrong=analysis.flags?.filter(f=>f.why?.some(x=>x.includes('distinta de la plantilla definitiva')))||[];
 if(wrong.length){analysis.status='review';analysis.confidence='low';analysis.reason='Se corrigieron claves tras contraste oficial. Revisión del documento recomendada.';}
 return analysis;
}
function analyze(pages){return finalizeOfficial(analyzeCore(pages));}
function validateEdited(questions,solutions){return validateSet(questions,solutions);}
window.TestParserCore={clean,norm,requiresVisual,stripRunningMatter,isTitle,solutionMarkerText,detailedSolutionsMarkerText,answerSheetMarkerText,findMarker,findDetailedFeedbackMarker,parseSolutions,parseQuestionLines,parseDetailedFeedback,validateSet,questionProblems,setSimilarity,analyze,validateEdited};
if(typeof module!=='undefined'&&module.exports)module.exports=window.TestParserCore;
})();
