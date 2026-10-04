import {Buffer} from 'node:buffer';
export function pool(runtime){
 const api={async query(sql,params=[]){
  const bindings=[];sql=sql.replace(/\$(\d+)/g,(_,n)=>{const v=params[Number(n)-1];bindings.push(typeof v==='boolean'?Number(v):v??null);return '?';});
  try{const result=await runtime().dr_wael_clinic_db.prepare(sql).bind(...bindings).all();return {rows:result.results||[]};}
  catch(e){if(/UNIQUE|slot_unavailable/i.test(e.message))e.code='23505';throw e;}
 },async connect(){return api;},release(){}};return api;
}
// R2 when bound; persistent small uploads in D1 otherwise (1 MiB limit).
export function storage(env,scope){
 const db=env.dr_wael_clinic_db,bucket=env.UPLOADS;
 return {
 async set(key,data,{metadata={}}={}){
  if(bucket){await bucket.put(scope+'/'+key,data,{customMetadata:metadata});return;}
  if(data.byteLength>1024*1024)throw Object.assign(new Error('Uploads over 1 MiB require R2'),{status:413});
  await db.prepare('INSERT INTO upload_objects(scope,key,data) VALUES(?,?,?) ON CONFLICT(scope,key) DO UPDATE SET data=excluded.data').bind(scope,key,data).run();
 },async get(key){if(bucket){const item=await bucket.get(scope+'/'+key);if(item)return item.arrayBuffer();}const item=await db.prepare('SELECT data FROM upload_objects WHERE scope=? AND key=?').bind(scope,key).first();return item?new Uint8Array(item.data).buffer:null;},
 async delete(key){if(bucket)await bucket.delete(scope+'/'+key);await db.prepare('DELETE FROM upload_objects WHERE scope=? AND key=?').bind(scope,key).run();}
 };
}
