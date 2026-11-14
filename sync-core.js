(()=>{
'use strict';
const MASTER_FORMAT='test-ofimatica-c2-master';
const MASTER_VERSION=2;
const LEGACY_FORMAT='test-ofimatica-c2-universal';
const enc=new TextEncoder();
function clone(v){return JSON.parse(JSON.stringify(v));}
function stable(v){
 if(Array.isArray(v))return '['+v.map(stable).join(',')+']';
 if(v&&typeof v==='object')return '{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+stable(v[k])).join(',')+'}';
 return JSON.stringify(v);
}
async function sha256Hex(text){
 if(!globalThis.crypto?.subtle)throw new Error('Este navegador no permite verificar la integridad criptográfica de la copia.');
 const d=await crypto.subtle.digest('SHA-256',enc.encode(text));
 return [...new Uint8Array(d)].map(b=>b.toString(16).padStart(2,'0')).join('');
}
function cleanTest(t){
 const out=clone(t||{});out.id=String(t?.id||'');out.title=String(t?.title||'');out.topic=String(t?.topic||'');out.questions=clone(t?.questions||[]);return out;
}
function cleanHistory(h){const out=clone(h||{});out.testId=String(h?.testId||'');return out;}
function stats(payload){
 const tests=Array.isArray(payload?.tests)?payload.tests:[],history=Array.isArray(payload?.history)?payload.history:[];
 const active=tests.filter(t=>!t.deletedAt),trash=tests.length-active.length;
 return {tests:tests.length,activeTests:active.length,trashTests:trash,questions:tests.reduce((a,t)=>a+(Array.isArray(t.questions)?t.questions.length:0),0),results:history.length,topics:new Set(active.map(t=>String(t.topic||'Sin clasificar'))).size};
}
function questionErrors(q){
 const errs=[];
 if(!q||!Number.isFinite(Number(q.n)))errs.push('número inválido');
 if(!String(q?.question||'').trim())errs.push('enunciado vacío');
 if(q?.requiresImage&&!q?.imageDataUri)errs.push('falta la imagen imprescindible de la pregunta');
 if(q?.imageDataUri&&!/^data:image\/(?:png|jpeg|webp);base64,[a-zA-Z0-9+/=]+$/.test(q.imageDataUri))errs.push('imagen incrustada no válida');
 const opts=q?.options&&typeof q.options==='object'&&!Array.isArray(q.options)?q.options:{};
 const letters=Object.keys(opts).sort();
 if(letters.length<3||letters.length>6)errs.push('número de opciones fuera de 3-6');
 for(const L of letters){if(!/^[A-F]$/.test(L))errs.push(`opción ${L} no válida`);if(!String(opts[L]??'').trim())errs.push(`opción ${L} vacía`);}
 const correct=String(q?.correct||'').toUpperCase();
 if(!opts[correct])errs.push('la respuesta correcta no existe entre las opciones');
 return [...new Set(errs)];
}
function payloadErrors(payload){
 const errs=[];
 if(!payload||!Array.isArray(payload.tests))return ['La copia no contiene una lista de tests válida.'];
 if(!Array.isArray(payload.history))errs.push('El historial no tiene un formato válido.');
 const ids=new Set();
 for(const t of payload.tests){
  if(!t||!String(t.id||'').trim()){errs.push('Hay un test sin identificador.');continue;}
  if(ids.has(String(t.id)))errs.push(`Identificador de test duplicado: ${t.id}`);ids.add(String(t.id));
  if(!String(t.title||'').trim())errs.push(`Test ${t.id}: título vacío.`);
  if(!Array.isArray(t.questions)||!t.questions.length)errs.push(`Test ${t.title||t.id}: no contiene preguntas.`);
  const qnums=new Set();
  for(const q of t.questions||[]){const n=Number(q?.n);if(qnums.has(n))errs.push(`Test ${t.title||t.id}: pregunta ${n} duplicada.`);qnums.add(n);const qe=questionErrors(q);if(qe.length)errs.push(`Test ${t.title||t.id}, pregunta ${q?.n??'?'}: ${qe.join(', ')}.`);if(errs.length>60)return errs;}
 }
 for(const h of payload.history||[]){if(!h||!String(h.testId||'').trim())errs.push('Hay un resultado sin identificador de test.');}
 return errs;
}
function signedPart(master){return {format:master.format,version:master.version,libraryId:master.libraryId,revision:master.revision,exportedAt:master.exportedAt,appBuild:master.appBuild,originDevice:master.originDevice,stats:master.stats,payload:master.payload};}
async function makeMaster({tests,history,libraryId,revision,originDevice,appBuild}){
 const payload={tests:(tests||[]).map(cleanTest),history:(history||[]).map(cleanHistory)};
 const errors=payloadErrors(payload);if(errors.length)throw new Error('No se puede crear la copia porque la biblioteca contiene errores: '+errors.slice(0,4).join(' '));
 const master={format:MASTER_FORMAT,version:MASTER_VERSION,libraryId:String(libraryId),revision:Number(revision)||1,exportedAt:new Date().toISOString(),appBuild:String(appBuild||''),originDevice:String(originDevice||''),stats:stats(payload),payload};
 master.checksum=await sha256Hex(stable(signedPart(master)));
 return master;
}
async function validateMaster(data){
 if(!data||typeof data!=='object')return {ok:false,errors:['El archivo no contiene una copia válida.']};
 if(data.format===LEGACY_FORMAT){
  const payload={tests:Array.isArray(data.tests)?data.tests.map(cleanTest):[],history:Array.isArray(data.history)?data.history.map(cleanHistory):[]};
  const errors=payloadErrors(payload);return {ok:!errors.length,legacy:true,errors,payload,stats:stats(payload),exportedAt:data.exportedAt||null,revision:0,libraryId:null,checksumValid:null,raw:data};
 }
 if(data.format!==MASTER_FORMAT)return {ok:false,errors:['El archivo no es una biblioteca de Test Ofimática C2.']};
 const errors=[];
 if(Number(data.version)!==MASTER_VERSION)errors.push(`Versión de copia no compatible: ${data.version}.`);
 if(!String(data.libraryId||'').trim())errors.push('Falta el identificador de la biblioteca.');
 if(!Number.isInteger(Number(data.revision))||Number(data.revision)<1)errors.push('La revisión de la biblioteca no es válida.');
 if(!data.payload||!Array.isArray(data.payload.tests)||!Array.isArray(data.payload.history))errors.push('La estructura de datos de la copia no es válida.');
 if(errors.length)return {ok:false,errors};
 const pe=payloadErrors(data.payload);errors.push(...pe);
 let checksumValid=false,computed='';
 if(!errors.length){try{computed=await sha256Hex(stable(signedPart(data)));checksumValid=computed===String(data.checksum||'').toLowerCase();if(!checksumValid)errors.push('La comprobación de integridad no coincide: el archivo puede estar incompleto o modificado.');}catch(e){errors.push(e.message||String(e));}}
 return {ok:!errors.length,legacy:false,errors,payload:{tests:data.payload.tests.map(cleanTest),history:data.payload.history.map(cleanHistory)},stats:stats(data.payload),exportedAt:data.exportedAt||null,revision:Number(data.revision),libraryId:String(data.libraryId),originDevice:data.originDevice||'',checksumValid,checksum:data.checksum||'',computed,raw:data};
}
function compareIncoming(validation,syncState={}){
 if(!validation?.ok)return {kind:'invalid',label:'No válida',level:'error'};
 if(validation.legacy)return {kind:'legacy',label:'Copia antigua compatible',level:'review'};
 const localLib=syncState.libraryId||null,localRev=Number(syncState.masterRevision)||0;
 if(!localLib)return {kind:'first',label:'Primera biblioteca maestra',level:'ok'};
 if(localLib!==validation.libraryId)return {kind:'different-library',label:'Biblioteca distinta',level:'error'};
 if(validation.revision>localRev)return {kind:'newer',label:`Más reciente (rev. ${validation.revision})`,level:'ok'};
 if(validation.revision<localRev)return {kind:'older',label:`Más antigua (rev. ${validation.revision})`,level:'review'};
 if(syncState.lastMasterChecksum&&validation.checksum===syncState.lastMasterChecksum)return {kind:'same',label:'Es la misma copia',level:'ok'};
 return {kind:'same-revision-conflict',label:'Misma revisión con contenido distinto',level:'error'};
}
window.TestSyncCore={MASTER_FORMAT,MASTER_VERSION,LEGACY_FORMAT,stable,sha256Hex,stats,questionErrors,payloadErrors,makeMaster,validateMaster,compareIncoming};
})();
