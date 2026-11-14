(()=>{
'use strict';
const DB_NAME='TestOfimaticaC2Universal',DB_VERSION=1,BUILD='ofimatica-v2-alpe-20261103';
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
 const before={tests:await getAll('tests'),history:await getAll('history')};
 try{
  await clear('tests');await clear('history');
  for(const t of validation.payload.tests)await put('tests',t);
  for(const h of validation.payload.history)await put('history',h);
 }catch(e){
  try{await clear('tests');await clear('history');for(const t of before.tests)await put('tests',t);for(const h of before.history)await put('history',h);}catch{}
  throw new Error('No se pudo cargar la copia y se ha intentado restaurar la biblioteca anterior. '+(e.message||e));
 }
 const cur=await getSyncState();
 if(validation.legacy){
  const state={...cur,dirty:true,lastLoadedAt:new Date().toISOString(),lastReason:'Copia antigua cargada; guarda una nueva biblioteca maestra'};await put('settings',{key:'syncState',value:state});return state;
 }
 const state={...cur,libraryId:validation.libraryId,masterRevision:validation.revision,lastMasterChecksum:validation.checksum,lastLoadedAt:new Date().toISOString(),dirty:false,lastReason:'Biblioteca maestra cargada'};
 await put('settings',{key:'syncState',value:state});return state;
}
async function exportBackup(){return {format:'test-ofimatica-c2-universal',version:1,exportedAt:new Date().toISOString(),tests:await getAll('tests'),history:await getAll('history'),settings:await getAll('settings')};}
async function importBackup(data,{replace=false}={}){if(!data||data.format!=='test-ofimatica-c2-universal'||!Array.isArray(data.tests))throw new Error('La copia no tiene un formato válido de Test Ofimática C2.');if(replace){await clear('tests');await clear('history');}for(const t of data.tests){if(t&&t.id&&Array.isArray(t.questions))await put('tests',t);}for(const h of data.history||[]){if(h?.testId)await put('history',h);}await markDirty('Copia antigua importada');return {tests:data.tests.length,history:(data.history||[]).length};}
window.TestDB={openDB,getAll,get,put,remove,clear,seed,exportBackup,importBackup,getSyncState,setSyncState,markDirty,prepareMaster,commitPreparedMaster,replaceFromValidated};
})();
