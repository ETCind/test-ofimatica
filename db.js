(()=>{
'use strict';
const DB_NAME='TestOfimaticaC2Universal',DB_VERSION=1,BUILD='ofimatica-v5-3-examenes-reales-20261110';
let dbPromise=null;
function openDB(){
 if(dbPromise)return dbPromise;
 dbPromise=new Promise((resolve,reject)=>{const req=indexedDB.open(DB_NAME,DB_VERSION);req.onupgradeneeded=()=>{const db=req.result;if(!db.objectStoreNames.contains('tests'))db.createObjectStore('tests',{keyPath:'id'});if(!db.objectStoreNames.contains('history'))db.createObjectStore('history',{keyPath:'testId'});if(!db.objectStoreNames.contains('settings'))db.createObjectStore('settings',{keyPath:'key'});};req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});
 return dbPromise;
}
async function tx(store,mode,fn){const db=await openDB();return new Promise((resolve,reject)=>{const t=db.transaction(store,mode),s=t.objectStore(store);let result;try{result=fn(s,t);}catch(e){reject(e);return;}t.oncomplete=()=>resolve(result);t.onerror=()=>reject(t.error);t.onabort=()=>reject(t.error||new Error('Transacción cancelada'));});}
async function getAll(store){const db=await openDB();return new Promise((resolve,reject)=>{const t=db.transaction(store,'readonly'),r=t.objectStore(store).getAll();r.onsuccess=()=>resolve(r.result||[]);r.onerror=()=>reject(r.error);});}
async function get(store,key){const db=await openDB();return new Promise((resolve,reject)=>{const t=db.transaction(store,'readonly'),r=t.objectStore(store).get(key);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
async function put(store,value){return tx(store,'readwrite',s=>s.put(value));}
async function remove(store,key){return tx(store,'readwrite',s=>s.delete(key));}
async function clear(store){return tx(store,'readwrite',s=>s.clear());}
async function seed(){const version='ofimatica-seed-v1-20261103',current=await get('settings','seedVersion');if(current?.value===version)return;const seeds=Array.isArray(window.SEED_LIBRARY)?window.SEED_LIBRARY:[];for(const t of seeds){const existing=await get('tests',t.id);if(!existing)await put('tests',{...t,deletedAt:null,createdAt:new Date().toISOString(),sourceType:'seed'});}await put('settings',{key:'seedVersion',value:version});}
function uuid(){return globalThis.crypto?.randomUUID?crypto.randomUUID():'dev-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2);}
async function getSyncState(){
 const row=await get('settings','syncState');
 if(row?.value)return row.value;
 const value={deviceId:uuid(),libraryId:null,masterRevision:0,lastMasterChecksum:null,lastLoadedAt:null,lastExportAt:null,dirty:true,lastLocalChangeAt:new Date().toISOString(),lastReason:'Biblioteca existente sin copia maestra'};
 await put('settings',{key:'syncState',value});return value;
}
async function setSyncState(patch){const cur=await getSyncState(),value={...cur,...patch};await put('settings',{key:'syncState',value});return value;}
async function markDirty(reason='Cambios en la biblioteca'){return setSyncState({dirty:true,lastLocalChangeAt:new Date().toISOString(),lastReason:reason});}
async function prepareMaster(){
 const S=window.TestSyncCore;if(!S)throw new Error('No está disponible el módulo de biblioteca maestra.');
 const sync=await getSyncState(),libraryId=sync.libraryId||uuid(),revision=(Number(sync.masterRevision)||0)+1;
 const master=await S.makeMaster({tests:await getAll('tests'),history:await getAll('history'),libraryId,revision,originDevice:sync.deviceId,appBuild:BUILD});
 return {master,nextState:{...sync,libraryId,masterRevision:revision,lastMasterChecksum:master.checksum,lastExportAt:master.exportedAt,dirty:false,lastReason:'Copia maestra exportada'}};
}
async function commitPreparedMaster(prepared){if(!prepared?.master||!prepared?.nextState)throw new Error('No hay una copia preparada válida.');await put('settings',{key:'syncState',value:prepared.nextState});return prepared.nextState;}
async function replaceFromValidated(validation){
 if(!validation?.ok||!validation.payload)throw new Error('La copia no ha superado la validación.');
 // Una sola transacción IndexedDB: si falla cualquier put por cuota, disco o
 // cierre inesperado, se revierte la operación íntegra (sin borrado parcial).
 const cur=await getSyncState();
 const state=validation.legacy
  ?{...cur,dirty:true,lastLoadedAt:new Date().toISOString(),lastReason:'Copia antigua cargada; exporta una nueva biblioteca maestra'}
  :{...cur,libraryId:validation.libraryId,masterRevision:validation.revision,lastMasterChecksum:validation.checksum,lastLoadedAt:new Date().toISOString(),dirty:false,lastReason:'Biblioteca maestra cargada'};
 const db=await openDB();
 await new Promise((resolve,reject)=>{
  const transaction=db.transaction(['tests','history','settings'],'readwrite');
  transaction.oncomplete=()=>resolve();
  transaction.onerror=()=>reject(transaction.error||new Error('Error de transacción IndexedDB'));
  transaction.onabort=()=>reject(transaction.error||new Error('Sustitución atómica cancelada'));
  try{
   const tests=transaction.objectStore('tests'),hist=transaction.objectStore('history');
   tests.clear();hist.clear();
   for(const t of validation.payload.tests)tests.put(t);
   for(const h of validation.payload.history)hist.put(h);
   transaction.objectStore('settings').put({key:'syncState',value:state});
  }catch(err){transaction.abort();}
 });
 return state;
}
async function exportBackup(){return {format:'test-ofimatica-c2-universal',version:1,exportedAt:new Date().toISOString(),tests:await getAll('tests'),history:await getAll('history'),settings:await getAll('settings')};}
async function importBackup(data,{replace=false}={}){
 if(!data||data.format!=='test-ofimatica-c2-universal'||!Array.isArray(data.tests))throw new Error('La copia no tiene un formato válido de Test Ofimática C2.');
 const testRows=data.tests||[],historyRows=data.history||[];
 if(testRows.some(t=>!t?.id||!Array.isArray(t.questions))||historyRows.some(h=>!h?.testId))throw new Error('La copia incluye tests o resultados sin identificar. No se ha modificado nada.');
 const sync=await getSyncState(),next={...sync,dirty:true,lastLocalChangeAt:new Date().toISOString(),lastReason:'Copia antigua importada'};
 const db=await openDB();
 await new Promise((resolve,reject)=>{
  const tr=db.transaction(['tests','history','settings'],'readwrite');
  tr.oncomplete=resolve;tr.onerror=()=>reject(tr.error||new Error('Error al cargar copia antigua'));tr.onabort=()=>reject(tr.error||new Error('Carga de copia antigua revertida'));
  try{
   const ts=tr.objectStore('tests'),hs=tr.objectStore('history');
   if(replace){ts.clear();hs.clear();}
   for(const t of testRows)ts.put(t);
   for(const h of historyRows)hs.put(h);
   tr.objectStore('settings').put({key:'syncState',value:next});
  }catch(e){try{tr.abort();}catch{}reject(e);}
 });
 return {tests:testRows.length,history:historyRows.length};
}
async function mergeMissingFromValidated(validation){
 if(!validation?.ok||!validation.payload)throw new Error('La biblioteca de recuperación no ha superado la validación de integridad.');
 const localTests=await getAll('tests'),localHistory=await getAll('history');
 const incoming=validation.payload.tests||[],incomingHistory=validation.payload.history||[];
 const ids=new Set(localTests.map(t=>String(t.id))),resultIds=new Set(localHistory.map(h=>String(h.testId)));
 const normalized=t=>[t.title||'',t.topic||''].map(x=>String(x).normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase()).join('||');
 const names=new Set(localTests.map(normalized));
 const missing=[];let duplicates=0;
 for(const t of incoming){
   if(ids.has(String(t.id))||names.has(normalized(t))){duplicates++;continue;}
   if(!t.id||!Array.isArray(t.questions)||!t.questions.length)throw new Error('Copia con test incompleto: no se ha incorporado nada.');
   missing.push(t);ids.add(String(t.id));names.add(normalized(t));
 }
 const restoredIds=new Set(missing.map(t=>String(t.id)));
 const results=[];
 // Solo recuperamos historiales de tests también recuperados. Los historiales
 // de tests existentes se conservan tal como están en este dispositivo.
 for(const h of incomingHistory){if(!resultIds.has(String(h.testId))&&restoredIds.has(String(h.testId))){results.push(h);resultIds.add(String(h.testId));}}
 if(!missing.length&&!results.length)return {added:0,results:0,existing:duplicates};
 const cur=await getSyncState(),next={...cur,dirty:true,lastLocalChangeAt:new Date().toISOString(),lastReason:'Recuperados tests ausentes desde copia sin sustituir los actuales'};
 const db=await openDB();
 await new Promise((resolve,reject)=>{
   const tr=db.transaction(['tests','history','settings'],'readwrite');
   tr.oncomplete=()=>resolve();tr.onerror=()=>reject(tr.error||new Error('Error al recuperar'));tr.onabort=()=>reject(tr.error||new Error('Recuperación cancelada y revertida'));
   try{
     const st=tr.objectStore('tests'),hs=tr.objectStore('history');
     for(const t of missing)st.add(t); // add nunca sobrescribe un test existente
     for(const h of results)hs.add(h); // add nunca sobrescribe resultados
     tr.objectStore('settings').put({key:'syncState',value:next});
   }catch(e){try{tr.abort()}catch{}reject(e);}
 });
 return {added:missing.length,results:results.length,existing:duplicates};
}
async function applyImportedTests(tests){
 if(!Array.isArray(tests)||tests.some(t=>!t?.id||!Array.isArray(t.questions)))throw new Error('Hay tests importados con estructura inválida. No se ha guardado nada.');
 const sync=await getSyncState(),next={...sync,dirty:true,lastLocalChangeAt:new Date().toISOString(),lastReason:'PDF importados o reemplazados'};
 const db=await openDB();
 await new Promise((resolve,reject)=>{
  const tr=db.transaction(['tests','settings'],'readwrite');
  tr.oncomplete=resolve;tr.onerror=()=>reject(tr.error||new Error('Error al guardar el lote de tests'));tr.onabort=()=>reject(tr.error||new Error('El lote se ha revertido íntegramente'));
  try{const store=tr.objectStore('tests');for(const t of tests)store.put(t);tr.objectStore('settings').put({key:'syncState',value:next});}
  catch(e){try{tr.abort();}catch{}reject(e);}
 });
 return tests.length;
}
window.TestDB={openDB,getAll,get,put,remove,clear,seed,exportBackup,importBackup,getSyncState,setSyncState,markDirty,prepareMaster,commitPreparedMaster,replaceFromValidated,mergeMissingFromValidated,applyImportedTests};
})();
