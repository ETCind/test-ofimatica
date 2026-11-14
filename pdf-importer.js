(()=>{
'use strict';
const C=window.TestParserCore;
const clean=C.clean;
function tokenFromItem(item,pageHeight){
  const tr=item.transform||[1,0,0,1,0,0],x=Number(tr[4]||0),baseY=Number(tr[5]||0),h=Math.max(1,Number(item.height||Math.hypot(tr[2]||0,tr[3]||0)||10)),w=Math.max(0,Number(item.width||0));
  const top=pageHeight-baseY-h;
  return {text:clean(item.str),x,x1:x+w,y:top+h/2,top,height:h,width:w,hasEOL:!!item.hasEOL};
}
function joinTokens(tokens){
  tokens=tokens.slice().sort((a,b)=>a.x-b.x);let s='',lastX=null;
  for(const t of tokens){if(!t.text)continue;if(s&&lastX!=null&&t.x-lastX>0.8)s+=' ';s+=t.text;lastX=Math.max(lastX??-Infinity,t.x1||t.x);}
  return clean(s);
}
function groupRows(tokens,tol=3.4){
  const sorted=tokens.filter(t=>t.text).slice().sort((a,b)=>a.y-b.y||a.x-b.x),rows=[];
  for(const tok of sorted){let best=null,bestD=Infinity;for(let i=rows.length-1;i>=Math.max(0,rows.length-8);i--){const d=Math.abs(rows[i].y-tok.y);if(d<=tol&&d<bestD){best=rows[i];bestD=d;}}
    if(!best){best={y:tok.y,tokens:[]};rows.push(best);}best.tokens.push(tok);best.y=(best.y*(best.tokens.length-1)+tok.y)/best.tokens.length;
  }
  for(const r of rows)r.tokens.sort((a,b)=>a.x-b.x);return rows.sort((a,b)=>a.y-b.y);
}
function linesFromRows(rows,pageHeight){return rows.map(r=>{const text=joinTokens(r.tokens);return {text,y:r.y,edge:/^\d{1,3}$/.test(text)&&(r.y<65||r.y>pageHeight-50)}}).filter(x=>x.text);}
function nativeLines(tokens,pageHeight,pageWidth){
  const out=[];let cur=[],cy=null,lastRight=null;
  const flush=()=>{if(!cur.length)return;const text=joinTokens(cur);if(text){const y=cur.reduce((a,t)=>a+t.y,0)/cur.length,x=Math.min(...cur.map(t=>t.x));out.push({text,y,x,edge:/^\d{1,3}$/.test(text)&&((y<70)||(y>pageHeight-90&&x>pageWidth*0.65))});}cur=[];cy=null;lastRight=null;};
  for(const tok of tokens){if(!tok.text)continue;const jumpY=cy!=null&&Math.abs(tok.y-cy)>4.2;const rewind=lastRight!=null&&tok.x<lastRight-24;if(cur.length&&(jumpY||rewind))flush();cur.push(tok);cy=cy==null?tok.y:(cy*(cur.length-1)+tok.y)/cur.length;lastRight=Math.max(lastRight??-Infinity,tok.x1||tok.x);if(tok.hasEOL)flush();}
  flush();return out;
}
function columnLines(tokens,pageWidth,pageHeight,count){
  const buckets=Array.from({length:count},()=>[]),wide=[];
  for(const t of tokens){const cx=(t.x+(t.x1||t.x))/2;const span=Math.max(0,(t.x1||t.x)-t.x);if(span>pageWidth*0.55){wide.push(t);continue;}let idx=Math.floor(cx/(pageWidth/count));idx=Math.max(0,Math.min(count-1,idx));buckets[idx].push(t);}
  const head=linesFromRows(groupRows(wide),pageHeight).filter(l=>l.y<125);
  const parts=buckets.map(b=>linesFromRows(groupRows(b),pageHeight));return head.concat(...parts);
}
async function readTextContentSafe(page,params={}){
  // Safari 26.x puede lanzar "undefined is not a function" dentro de
  // PDFPageProxy.getTextContent() porque ReadableStream no expone
  // Symbol.asyncIterator. Consumir el mismo stream con getReader() evita
  // ese camino y conserva los mismos chunks de PDF.js.
  if(page&&typeof page.streamTextContent==='function'){
    const stream=page.streamTextContent(params);
    if(stream&&typeof stream.getReader==='function'){
      const reader=stream.getReader(),out={items:[],styles:Object.create(null),lang:null};
      try{
        while(true){
          const part=await reader.read();
          if(part.done)break;
          const value=part.value||{};
          if(out.lang==null&&value.lang!=null)out.lang=value.lang;
          if(value.styles&&typeof value.styles==='object')Object.assign(out.styles,value.styles);
          if(Array.isArray(value.items))out.items.push(...value.items);
        }
      }finally{
        try{reader.releaseLock?.();}catch{}
      }
      return out;
    }
  }
  // Compatibilidad defensiva para mocks/implementaciones antiguas. En Safari
  // real con PDF.js 6.x se usa siempre el camino getReader() anterior.
  if(page&&typeof page.getTextContent==='function')return page.getTextContent(params);
  throw new Error('El motor PDF no ofrece un método compatible para extraer texto.');
}
async function extractPage(pdf,pageNo){
  const page=await pdf.getPage(pageNo),viewport=page.getViewport({scale:1}),tc=await readTextContentSafe(page,{normalizeWhitespace:false,disableCombineTextItems:false});
  const tokens=tc.items.map(i=>tokenFromItem(i,viewport.height)).filter(t=>t.text);
  if(tokens.length<2)return {pageNo,width:viewport.width,height:viewport.height,modes:{native:[],one:[],two:[],three:[]},rows:[],textItems:0};
  const rows=groupRows(tokens),one=linesFromRows(rows,viewport.height),native=nativeLines(tokens,viewport.height,viewport.width),two=columnLines(tokens,viewport.width,viewport.height,2),three=columnLines(tokens,viewport.width,viewport.height,3);
  // Some PDF generators place the page number first in content order, even though it is visually in the footer.
  const headHasTitle=native.slice(0,4).some(l=>C.isTitle(l.text));if(headHasTitle)native.slice(0,4).forEach(l=>{if(/^\d{1,3}$/.test(l.text))l.edge=true;});
  return {pageNo,width:viewport.width,height:viewport.height,modes:{native,one,two,three},rows:rows.map(r=>({y:r.y,tokens:r.tokens.map(t=>({text:t.text,x:t.x}))})),textItems:tokens.length};
}
// Cerrar documentos PDF de forma compatible con distintas versiones de PDF.js.
// PDFDocumentLoadingTask.destroy() es la alternativa cuando el proxy
// PDFDocumentProxy no expone destroy(); un fallo al liberar recursos
// no debe descartar preguntas que ya se han leído correctamente.
async function releasePdf(task,pdf){
  try{
    if(pdf&&typeof pdf.destroy==='function')await pdf.destroy();
    else if(task&&typeof task.destroy==='function')await task.destroy();
    else if(pdf&&typeof pdf.cleanup==='function')await pdf.cleanup();
  }catch(error){
    console.warn('No se pudieron liberar todos los recursos del PDF:',error);
  }
}
async function extractPdf(file,onProgress){
  if(!window.pdfjsLib)throw new Error('No se ha podido cargar el motor PDF seguro. Comprueba la conexión del Mac y vuelve a intentarlo.');
  const data=new Uint8Array(await file.arrayBuffer());let task;
  try{task=window.pdfjsLib.getDocument({data,disableAutoFetch:false,disableStream:false,isEvalSupported:false,enableScripting:false,enableXfa:false});}catch(e){throw new Error('No se puede abrir el PDF: '+(e.message||e));}
  let pdf;try{pdf=await task.promise;}catch(e){if(e?.name==='PasswordException')throw new Error('El PDF está protegido con contraseña. Guarda una copia sin contraseña e impórtala de nuevo.');throw new Error('No se puede leer el PDF: '+(e.message||e));}
  const pages=[];let itemCount=0;
  try{
    for(let n=1;n<=pdf.numPages;n++){onProgress?.(n,pdf.numPages);const p=await extractPage(pdf,n);itemCount+=p.textItems;pages.push(p);}
    if(itemCount<8)throw new Error('El PDF parece ser un escaneo sin capa de texto. Esta versión no lo importa automáticamente para evitar errores de OCR.');
    return pages;
  }finally{await releasePdf(task,pdf);}
}
function titleFromFile(name){const base=String(name||'Test').replace(/\.pdf$/i,'').trim();const m=base.match(/test\s*n[ºo°]?\s*(\d+)/i);return m?`Test nº ${Number(m[1])}`:base;}
function slug(s){return C.norm(s).replace(/\s+/g,'-').replace(/^-+|-+$/g,'').slice(0,120)||'test';}
function stableId(topic,title){return `${slug(topic)}::${slug(title)}`;}
function imageQuestion(q){return C.requiresVisual(q?.question||'');}
function findOriginalQuestion(pages,n){
 const first=(pages[0]?.modes?.one||[]).map(x=>x.text||'').join(' ');
 const studyFormat=/analisis/i.test(first)&&/cantabria/i.test(first)&&pages.length>=40;
 const cantabria2023=studyFormat&&/2023/i.test(first);
 // En material de estudio, páginas 3-9 contienen el cuestionario SIN resolver.
 // En documentos corrientes, localizar la primera aparición, antes del solucionario.
 const start=studyFormat?2:0,end=studyFormat?Math.min(cantabria2023?13:9,pages.length):Math.min(pages.length,75);
 const header=/^\s*(\d{1,3})\s*[.)]\s+(.+)$/;
 const other=/^\s*Pregunta\s+(\d{1,3})(?:\b|\s*[:.)])/i;
 for(let i=start;i<end;i++){
  const lines=pages[i].modes?.one||[];
  for(let j=0;j<lines.length;j++){
   const line=lines[j],m=String(line.text||'').match(header)||String(line.text||'').match(other);
   if(!m||Number(m[1])!==n||line.y==null)continue;
   let endY=pages[i].height-45;
   for(let k=j+1;k<lines.length;k++){
    const t=String(lines[k].text||''),next=t.match(header)||t.match(other);
    if(next&&Number(next[1])!==n&&Number(next[1])===n+1&&lines[k].y!=null){endY=lines[k].y-27;break;}
    if(/^\s*(?:HOJA DE RESPUESTAS|SOLUCIONES DETALLADAS|PLANTILLA DE RESPUESTAS)\b/i.test(t)){endY=(lines[k].y||endY)-8;break;}
   }
   return {pageIndex:i,y:line.y,endY:Math.max(line.y+70,endY)};
  }
 }
 return null;
}
async function clipQuestionImage(pdf,spot){
 const page=await pdf.getPage(spot.pageIndex+1);
 const natural=page.getViewport({scale:1}),scale=1.55;
 // Captura el bloque de la pregunta, no solo 60 puntos: Word/Excel pueden
 // colocar la imagen DESPUÉS del enunciado o entre las alternativas.
 const y0=Math.max(0,spot.y-23),y1=Math.min(natural.height,spot.endY||spot.y+190);
 if(y1-y0<25)throw new Error('Región de ilustración demasiado pequeña');
 const view=page.getViewport({scale}),full=document.createElement('canvas');
 full.width=Math.ceil(view.width);full.height=Math.ceil(view.height);
 const ctx=full.getContext('2d',{alpha:false});
 await page.render({canvasContext:ctx,viewport:view}).promise;
 const crop=document.createElement('canvas');
 crop.width=full.width;crop.height=Math.ceil((y1-y0)*scale);
 crop.getContext('2d',{alpha:false}).drawImage(full,0,Math.floor(y0*scale),full.width,crop.height,0,0,crop.width,crop.height);
 const uri=crop.toDataURL('image/jpeg',0.79);
 if(!/^data:image\/jpeg;base64,/.test(uri)||uri.length<1200)throw new Error('No se pudo conservar el fragmento original');
 full.width=full.height=crop.width=crop.height=0;
 return uri;
}
function multiplyMatrix(m,n){
 return [m[0]*n[0]+m[2]*n[1],m[1]*n[0]+m[3]*n[1],
         m[0]*n[2]+m[2]*n[3],m[1]*n[2]+m[3]*n[3],
         m[0]*n[4]+m[2]*n[5]+m[4],m[1]*n[4]+m[3]*n[5]+m[5]];
}
async function pageImageRegions(pdf,index){
 const page=await pdf.getPage(index+1),vp=page.getViewport({scale:1}),ops=await page.getOperatorList(),N=window.pdfjsLib?.OPS||{};
 const pictures=new Set([N.paintImageXObject,N.paintInlineImageXObject,N.paintJpegXObject,N.paintImageMaskXObject,N.paintSolidColorImageMask].filter(Number.isFinite));
 let matrix=[1,0,0,1,0,0],stack=[];const regions=[];
 for(let i=0;i<(ops.fnArray||[]).length;i++){
  const f=ops.fnArray[i],args=ops.argsArray?.[i]||[];
  if(f===N.save){stack.push(matrix.slice());continue;}
  if(f===N.restore){matrix=stack.pop()||[1,0,0,1,0,0];continue;}
  if(f===N.transform){if(args.length===6&&args.every(Number.isFinite))matrix=multiplyMatrix(matrix,args);continue;}
  // En gráficos vectoriales (tablas, barras, iconos dibujados) PDF.js
  // construye trayectorias, no paintImageXObject. Recoger sus límites sin
  // confundir el texto normal con un recurso gráfico.
  const isVector=f===N.constructPath;
  if(!pictures.has(f)&&!isVector)continue;
  let pathBox=null;
  if(isVector){
    if(args.length>=6&&[args[2],args[3],args[4],args[5]].every(Number.isFinite))pathBox=[args[2],args[3],args[4],args[5]];
    else if(args[1]&&typeof args[1].length==='number'){
      const values=Array.from(args[1]).filter(Number.isFinite);
      if(values.length>=4&&values.length%2===0){const xx=values.filter((_,i)=>i%2===0),yy=values.filter((_,i)=>i%2===1);pathBox=[Math.min(...xx),Math.min(...yy),Math.max(...xx),Math.max(...yy)];}
    }
    if(!pathBox||!pathBox.every(Number.isFinite))continue;
  }
  const rect=pathBox||[0,0,1,1];
  const corners=[[rect[0],rect[1]],[rect[2],rect[1]],[rect[0],rect[3]],[rect[2],rect[3]]].map(([x,y])=>[matrix[0]*x+matrix[2]*y+matrix[4],matrix[1]*x+matrix[3]*y+matrix[5]]);
  const xs=corners.map(x=>x[0]),ys=corners.map(x=>x[1]);
  // PDF.js 6 no ofrece convertToViewportRectangle en algunas builds.
  // La matriz de viewport transforma coordenadas PDF a coordenadas de pantalla.
  const vt=vp.transform;
  if(!vt||vt.length!==6||!Array.from(vt).every(Number.isFinite)){
    throw new Error('Matriz de transformación del PDF no válida');
  }
  const mapped=corners.map(([px,py])=>[vt[0]*px+vt[2]*py+vt[4],vt[1]*px+vt[3]*py+vt[5]]);
  const mx=mapped.map(pt=>pt[0]),my=mapped.map(pt=>pt[1]);
  const box=[Math.min(...mx),Math.min(...my),Math.max(...mx),Math.max(...my)];
  const x0=Math.min(box[0],box[2]),x1=Math.max(box[0],box[2]),y0=Math.min(box[1],box[3]),y1=Math.max(box[1],box[3]);
  if(x1-x0>6&&y1-y0>6)regions.push({x0,x1,y0,y1});
 }
 return regions;
}
function regionContainsVisual(spot,regions,pageWidth){
 if(!spot)return false;
 const y0=spot.y-10,y1=spot.endY||spot.y+160;
 return regions.some(r=>r.y1>y0&&r.y0<y1&&r.x1>35&&r.x0<pageWidth-35&&!(r.x0>pageWidth*0.78&&r.y0<145&&r.y1<165));
}
async function enrichWithImages(file,pages,analysis,pageOffset=0){
 const questions=analysis.questions||[];
 if(!questions.length)return analysis;
 // El catálogo 2024 usa imágenes editoriales decorativas en cada página: no
 // atribuirlas a preguntas que solo describen herramientas.
 if(analysis.marker?.source==='estado-2024-catalogo'&&!questions.some(imageQuestion))return analysis;
 const raw=new Uint8Array(await file.arrayBuffer());
 const task=window.pdfjsLib.getDocument({data:raw,isEvalSupported:false,enableScripting:false,enableXfa:false});
 const pdf=await task.promise;
 const flags=(analysis.flags||[]).filter(f=>!f.why?.every(x=>x.includes('imagen gráfica asociada')));
 try{
  const rasterAreas=new Map(),spots=new Map();
  for(const q of questions){const spot=analysis.marker?.source==='estado-2024-catalogo'?null:findOriginalQuestion(pages,q.n);if(spot)spots.set(q.n,spot);}
  // Examinar la posición de imágenes rasterizadas, no solo su presencia en una
  // página. Un logo o una imagen de otra pregunta NO debe añadir una quinta
  // opción visual ni bloquear preguntas que son solamente de texto.
  for(const spot of spots.values())if(!rasterAreas.has(spot.pageIndex)){
   rasterAreas.set(spot.pageIndex,await pageImageRegions(pdf,spot.pageIndex+pageOffset));
  }
  for(const q of questions){
   const spot=spots.get(q.n);
   const graphics=spot&&regionContainsVisual(spot,rasterAreas.get(spot.pageIndex)||[],pages[spot.pageIndex].width);
   const needsVisual=imageQuestion(q)||Boolean(graphics);
   if(!needsVisual)continue;
   q.requiresImage=true;
   if(!spot){flags.push({n:q.n,why:['no se localizó el enunciado original para conservar su imagen']});continue;}
   try{q.imageDataUri=await clipQuestionImage(pdf,{...spot,pageIndex:spot.pageIndex+pageOffset});q.imageCaption='Fragmento original de la pregunta, incluyendo elementos visuales';}
   catch(e){flags.push({n:q.n,why:['no se pudo recuperar la imagen: '+(e.message||e)]});}
  }
 }finally{await releasePdf(task,pdf);}
 analysis.flags=flags;
 if(flags.length){analysis.status='review';analysis.confidence='low';analysis.reason='Hay elementos que requieren revisión';}
 else if(analysis.status==='review'&&questions.every(q=>!q.requiresImage||q.imageDataUri)&&questions.length===Object.keys(analysis.solutions||{}).length){
  // IMPORTANTE: este estado solo significa consistencia documental y visual,
  // NO una verificación académica contra la plantilla oficial.
  analysis.status='verified';analysis.confidence='high';analysis.reason='Estructura del PDF cotejada; fragmentos visuales recuperados';
 }
 return analysis;
}
function scanPrintedNumbers(pages){
 const printed=new Set();
 for(const page of pages){
    const lines=page.modes?.one||[];
    for(let i=0;i<lines.length;i++){
      const line=String(lines[i].text||'');
      const m=line.match(/^\s*Pregunta\s+(\d{1,3})\b/i)||line.match(/^\s*(\d{1,3})\s*[.):]\s*\S/i);
      if(!m||Number(m[1])<1||Number(m[1])>500)continue;
      const n=Number(m[1]);let choices=new Set();
      for(let k=i+1;k<Math.min(i+24,lines.length);k++){
        const x=String(lines[k].text||'');
        const o=x.match(/^\s*([a-f])\s*[.)]\s*\S/i);
        if(o)choices.add(o[1].toUpperCase());
        const next=x.match(/^\s*Pregunta\s+(\d{1,3})\b/i)||x.match(/^\s*(\d{1,3})\s*[.):]\s*\S/i);
        if(next&&Number(next[1])===n+1)break;
      }
      if(choices.size>=3)printed.add(n);
    }
  }
 return printed;
}

function pageCompact(page){
 const ls=(page?.modes?.native||page?.modes?.one||[]).slice(0,30).map(x=>String(x.text??x));
 return ls.join(' ').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,'').toUpperCase();
}
function documentSections(pages){
 const first=pageCompact(pages[0]);
 if(!first.includes('ANALISIS')||!first.includes('TRAMITACIONPROCESAL2026')||pages.length<=40)
   return [{pages,offset:0,label:null}];
 const last40=pageCompact(pages[39]);
 if(!last40.includes('PAGINA40DE40'))return [{pages,offset:0,label:null}];
 const bounds=[0,40];
 for(let i=42;i<pages.length;i++){
  const tag=pageCompact(pages[i]);
  const previous=pages[i-1];
  if(tag.includes('TURNOLIBRE')&&tag.includes('OPCIONB')&&i-1>40&&Number(previous?.textItems||0)<6){bounds.push(i-1);break;}
 }
 bounds.push(pages.length);
 const out=[];for(let i=0;i<bounds.length-1;i++){
  const offset=bounds[i],end=bounds[i+1];
  if(end<=offset)continue;
  const label=offset===0?'Tramitación Procesal 2026 · Informática':pageCompact(pages[Math.min(end-1,offset+1)]).includes('OPCIONB')?'Auxiliar Estado 2024 · Modelo B':pageCompact(pages[Math.min(end-1,offset+1)]).includes('OPCIONA')?'Auxiliar Estado 2024 · Modelo A':'Exámenes Estado · Compilación';
  out.push({pages:pages.slice(offset,end),offset,label});
 }
 return out;
}
function isAnthology(pages){
 if(!pages.length)return false;
 // Recopilación de múltiples exámenes por materia, con 1..N reiniciados
 // y varias claves; no es correcto convertirla en un examen de 7 preguntas.
 const heading=pages.slice(0,7).map(pageCompact).join('');
 return heading.includes('EXAMENES')&&heading.includes('ESTADO')&&heading.includes('2019')&&!heading.includes('TUR NOLIBRE'.replace(/ /g,''));
}
async function processSection(file,topic,part){
 const {pages,offset,label}=part;
 let title=label||titleFromFile(file.name);
 if(isAnthology(pages))throw new Error('Este PDF reúne varios exámenes por año y materia, con numeraciones repetidas. No es un cuestionario único: se ha rechazado para no generar preguntas ni soluciones incorrectas.');
 const analysis=await enrichWithImages(file,pages,C.analyze(pages),offset);
 if(!label){
  if(analysis.marker?.source==='cantabria-2023')title='Cantabria 2023 · Informática';
  else if(analysis.marker?.source==='tramitacion-2026')title='Tramitación Procesal 2026 · Informática';
  else if(analysis.marker?.source==='estado-2024-catalogo'){
   const model=String(analysis.questions?.[0]?.sourceNote||'').match(/modelo\s+([AB])/i)?.[1]?.toUpperCase();
   if(model)title='Auxiliar Estado 2024 · Modelo '+model;
  }
 }
 const printed=analysis.expectedQuestionCount?new Set():scanPrintedNumbers(pages);
 const minimumPrinted=analysis.expectedQuestionCount||printed.size;
 analysis.minPrintedQuestions=minimumPrinted;
 const parsedNumbers=new Set((analysis.questions||[]).map(q=>Number(q.n)));
 const missingNumbers=[...printed].filter(n=>!parsedNumbers.has(n));
 if(minimumPrinted>analysis.questions.length){
   analysis.status='review';analysis.confidence='low';analysis.manualApproved=false;
   analysis.reason='Se detectaron '+minimumPrinted+' preguntas originales, pero solo se han reconstruido '+analysis.questions.length;
   analysis.flags=[...(analysis.flags||[]),{n:0,why:['importación incompleta: '+analysis.questions.length+'/'+minimumPrinted+'; identificadores ausentes: '+missingNumbers.slice(0,12).join(', ')]}];
 }else if(!analysis.expectedQuestionCount&&minimumPrinted===analysis.questions.length&&minimumPrinted>0&&missingNumbers.length){
   analysis.status='review';analysis.confidence='low';analysis.manualApproved=false;
   analysis.flags=[...(analysis.flags||[]),{n:0,why:['la numeración original no coincide con las preguntas importadas'] }];
 }
 if(!(analysis.questions||[]).length)throw new Error('No se ha reconstruido ninguna pregunta completa. Ningún examen se ha guardado.');
 if(analysis.questions.length!==Object.keys(analysis.solutions||{}).length){
   analysis.status='review';analysis.confidence='low';analysis.flags=[...(analysis.flags||[]),{n:0,why:['el número de preguntas y claves no coincide']}];
 }
 for(const q of analysis.questions||[]){
   if(C.questionProblems(q,q.correct).length){analysis.status='review';analysis.confidence='low';analysis.flags=[...(analysis.flags||[]),{n:q.n,why:C.questionProblems(q,q.correct)}];}
   if((imageQuestion(q)||q.requiresImage)&&!q.imageDataUri){
     analysis.status='review';analysis.confidence='low';analysis.flags=[...(analysis.flags||[]),{n:q.n,why:['falta imagen imprescindible para responder']}];
   }
 }
 return {...analysis,fileName:file.name,title,topic,id:stableId(topic,title),expectedQuestionCount:minimumPrinted,pagesMeta:{count:pages.length,sourceStart:offset+1},processedAt:new Date().toISOString()};
}
async function processDocuments(file,topic,onProgress){
 const pages=await extractPdf(file,onProgress),segments=documentSections(pages),results=[];
 for(const part of segments){
  try{results.push(await processSection(file,topic,part));}
  catch(e){results.push({status:'error',confidence:'none',fileName:file.name,title:part.label||titleFromFile(file.name),topic,error:e.message||String(e),questions:[],solutions:{}});}
 }
 return results;
}
async function processFile(file,topic,onProgress){
 const results=await processDocuments(file,topic,onProgress);
 if(results.length!==1)throw new Error('El PDF contiene '+results.length+' documentos. Utiliza processDocuments para importarlos por separado.');
 if(results[0].status==='error')throw new Error(results[0].error);
 return results[0];
}

let verifyPromise=null;
async function verifyEngine(){
  if(globalThis.TestPlatform?.isIPadOrIPhone)return {ok:false,mobileDisabled:true,reason:'La importación PDF está desactivada en iPad.'};
  if(!globalThis.TestPdfEngine?.ready||!window.pdfjsLib)return {ok:false,reason:globalThis.TestPdfEngine?.error||'El motor PDF todavía no está disponible.'};
  if(globalThis.TestPdfEngine?.selfTestPassed)return {ok:true,cached:true,detail:globalThis.TestPdfEngine.selfTestDetail||'Autotest previo correcto'};
  if(verifyPromise)return verifyPromise;
  verifyPromise=(async()=>{
    try{
      const response=await fetch('assets/import-selftest.pdf?build=ofimatica-v5-3-examenes-reales-20261110',{cache:'no-store'});
      if(!response.ok)throw new Error('No se pudo abrir el PDF interno de comprobación ('+response.status+').');
      const bytes=await response.arrayBuffer();
      const fakeFile={name:'Test nº 999 - Autotest del importador.pdf',arrayBuffer:async()=>bytes.slice(0)};
      const r=await processFile(fakeFile,'Autotest interno');
      const expected=['A','B','C','D'];
      const good=r.status==='verified'&&r.confidence==='high'&&r.questions.length===4&&Object.keys(r.solutions||{}).length===4&&
        r.questions.every((q,i)=>q.n===i+1&&q.correct===expected[i]&&String(q.question||'').trim()&&Object.keys(q.options||{}).length===4);
      if(!good)throw new Error(`El PDF interno no se reconstruyó de forma exacta (estado ${r.status}, ${r.questions.length}/4 preguntas, ${Object.keys(r.solutions||{}).length}/4 soluciones).`);
      const detail='PDF real interno: 4/4 preguntas y 4/4 soluciones';
      globalThis.TestPdfEngine=Object.freeze({...globalThis.TestPdfEngine,selfTestPassed:true,selfTestDetail:detail});
      window.dispatchEvent(new CustomEvent('test-pdf-selftest-ready',{detail:globalThis.TestPdfEngine}));
      return {ok:true,detail,result:r};
    }catch(e){
      const reason=e?.message||String(e);
      globalThis.TestPdfEngine=Object.freeze({...globalThis.TestPdfEngine,selfTestPassed:false,selfTestError:reason});
      window.dispatchEvent(new CustomEvent('test-pdf-selftest-ready',{detail:globalThis.TestPdfEngine}));
      return {ok:false,reason};
    }finally{verifyPromise=null;}
  })();
  return verifyPromise;
}
window.PdfImporter={extractPdf,processFile,processDocuments,titleFromFile,stableId,readTextContentSafe,verifyEngine,securityOptions:Object.freeze({isEvalSupported:false,enableScripting:false,enableXfa:false}),_qa:Object.freeze({findOriginalQuestion,pageImageRegions,regionContainsVisual,scanPrintedNumbers,releasePdf,documentSections,isAnthology})};
})();
