import {env} from 'cloudflare:workers';
import {getChatGPTUser} from '../chatgpt-auth';
import {ApiError,validateAlert,conditionKey,todaySeoul,matchRows} from './alert-validation.mjs';
import {detectOpenings} from './cinema.mjs';
import {fetchGroup,theaters} from './cinema-source';
type Alert={id:string,chain:string,movieTitle:string,theaterId:string|null,theaterName:string,date:string,format:string,enabled:boolean,createdAt:string};
type Row={id:string,payload:string,created_at:string,updated_at?:string};
const decode=(r:Row):Alert=>({...JSON.parse(r.payload),id:r.id,createdAt:r.created_at});
const response=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
async function context(request:Request){
 const user=await getChatGPTUser();
 const userId=user?.userId??(process.env.NODE_ENV==='development'?'local-dev':null);
 if(!userId)throw new ApiError(401,'로그인이 필요합니다.');
 if(request.method!=='GET'){const origin=request.headers.get('origin');if(origin&&origin!==new URL(request.url).origin)throw new ApiError(403,'다른 사이트에서 요청할 수 없습니다.');}
 if(!env.DB)throw new ApiError(503,'저장소 연결을 준비 중입니다.');
 return {db:env.DB,userId};
}
async function body(request:Request){
 if(Number(request.headers.get('content-length')??0)>16384)throw new ApiError(413,'요청이 너무 큽니다.');
 const text=await request.text();if(text.length>16384)throw new ApiError(413,'요청이 너무 큽니다.');
 if(!text.trim())return {};
 try{const value=JSON.parse(text);if(!value||typeof value!=='object'||Array.isArray(value))throw new Error();return value;}catch{throw new ApiError(400,'JSON 요청을 확인해 주세요.');}
}
async function guarded(fn:()=>Promise<Response>){try{return await fn();}catch(error){if(error instanceof ApiError)return response({error:error.message},error.status);console.error('Alert API failure',error instanceof Error?error.message:'unknown');return response({error:'요청을 완료하지 못했습니다. 잠시 후 다시 시도해 주세요.'},503);}}
export const listAlerts=(request:Request)=>guarded(async()=>{const {db,userId}=await context(request);const rows=await db.prepare('SELECT id,payload,created_at FROM alerts WHERE user_id=? ORDER BY created_at DESC').bind(userId).all<Row>();return response({alerts:rows.results.map(decode)});});
export const createAlert=(request:Request)=>guarded(async()=>{
 const {db,userId}=await context(request);const input=validateAlert(await body(request));
 const id=crypto.randomUUID(),now=new Date().toISOString();
 const inserted=await db.prepare('INSERT OR IGNORE INTO alerts(id,user_id,condition_key,payload,enabled,created_at,updated_at) SELECT ?,?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM alerts WHERE user_id=?)<30 RETURNING id').bind(id,userId,conditionKey(input),JSON.stringify(input),input.enabled?1:0,now,now,userId).first();
 if(!inserted)throw new ApiError(409,'같은 알림이 이미 있거나 최대 30개에 도달했습니다.');
 return response({alert:{...input,id,createdAt:now}},201);
});
export const updateAlert=(request:Request,id:string)=>guarded(async()=>{
 const {db,userId}=await context(request);const row=await db.prepare('SELECT id,payload,created_at FROM alerts WHERE id=? AND user_id=?').bind(id,userId).first<Row>();if(!row)throw new ApiError(404,'알림을 찾을 수 없습니다.');
 const previous=decode(row),patch=await body(request);const input=validateAlert({...previous,...patch},{allowPast:Object.keys(patch).every(k=>k==='enabled')});
 const changed=conditionKey(input)!==conditionKey(previous);const now=new Date().toISOString();
 try{
  const statements=[db.prepare('UPDATE alerts SET condition_key=?,payload=?,enabled=?,updated_at=?,check_token=NULL,check_until=0,last_attempt=0 WHERE id=? AND user_id=?').bind(conditionKey(input),JSON.stringify(input),input.enabled?1:0,now,id,userId)];
  if(changed)statements.push(db.prepare('DELETE FROM snapshots WHERE alert_id=? AND user_id=?').bind(id,userId));
  await db.batch(statements);
 }catch(error){if(error instanceof Error&&error.message.includes('UNIQUE'))throw new ApiError(409,'같은 알림이 이미 있습니다.');throw error;}
 return response({alert:{...input,id,createdAt:previous.createdAt}});
});
export const deleteAlert=(request:Request,id:string)=>guarded(async()=>{
 const {db,userId}=await context(request);
 const result=await db.prepare('DELETE FROM alerts WHERE id=? AND user_id=? RETURNING id').bind(id,userId).first();
 if(!result)throw new ApiError(404,'알림을 찾을 수 없습니다.');return response({ok:true});
});
export const history=(request:Request)=>guarded(async()=>{
 const {db,userId}=await context(request);const rows=await db.prepare('SELECT id,payload,created_at FROM notifications WHERE user_id=? ORDER BY created_at DESC LIMIT 100').bind(userId).all<Row>();
 return response({notifications:rows.results.map(r=>({...JSON.parse(r.payload),id:r.id,createdAt:r.created_at}))});
});
export const theaterList=(request:Request)=>guarded(async()=>{
 const user=await getChatGPTUser();if(!user?.userId&&process.env.NODE_ENV!=='development')throw new ApiError(401,'로그인이 필요합니다.');
 const chain=new URL(request.url).searchParams.get('chain')??'';
 return response({theaters:await theaters(chain),status:chain==='cgv'?'unavailable':'available',message:chain==='cgv'?'CGV 자동 확인 연동 준비 중입니다.':chain==='megabox'?'현재 예매 목록에서 제공하는 극장입니다. 목록에 없는 극장은 직접 입력할 수 있습니다.':undefined});
});
export const check=(request:Request)=>guarded(async()=>{
 const {db,userId}=await context(request);const input=await body(request);
 if(input.ids!==undefined&&(!Array.isArray(input.ids)||input.ids.length>30||input.ids.some((id:unknown)=>typeof id!=='string'||id.length>100)))throw new ApiError(400,'알림 ID 목록을 확인해 주세요.');
 const rows=await db.prepare('SELECT id,payload,created_at,updated_at FROM alerts WHERE user_id=? AND enabled=1 ORDER BY created_at DESC LIMIT 30').bind(userId).all<Row>();
 const versions=new Map(rows.results.map(r=>[r.id,r.updated_at]));
 const selected=rows.results.map(decode).filter(a=>!input.ids||input.ids.includes(a.id));
 const results:Array<Record<string,unknown>>=[],notifications:Array<Record<string,unknown>>=[];
 const groups=new Map<string,Promise<Awaited<ReturnType<typeof fetchGroup>>>>();
 let active=0;const waiters:Array<()=>void>=[];
 const limited=async(chain:string,theaterId:string,date:string)=>{if(active>=3)await new Promise<void>(resolve=>waiters.push(resolve));active++;try{return await fetchGroup(chain,theaterId,date);}finally{active--;waiters.shift()?.();}};
 await Promise.all(selected.map(async alert=>{
  const checkedAt=new Date().toISOString();const base={alertId:alert.id,checkedAt,openCount:0};
  if(alert.chain==='cgv'||!alert.theaterId||alert.date<todaySeoul()){results.push({...base,status:'unavailable',message:alert.chain==='cgv'?'CGV 자동 확인 연동 준비 중입니다.':!alert.theaterId?'극장을 목록에서 연결하면 확인할 수 있습니다.':'관람 날짜가 지났습니다.'});return;}
  const token=crypto.randomUUID(),now=Date.now();
  const lock=await db.prepare('UPDATE alerts SET check_token=?,check_until=?,last_attempt=? WHERE id=? AND user_id=? AND enabled=1 AND updated_at=? AND check_until<? AND last_attempt<? RETURNING id').bind(token,now+300000,now,alert.id,userId,versions.get(alert.id),now,now-60000).first();
  if(!lock){results.push({...base,status:'unavailable',message:'최근 확인했거나 확인 중입니다. 1분 후 다시 시도해 주세요.'});return;}
  try{
   const key=JSON.stringify([alert.chain,alert.theaterId,alert.date]);let promise=groups.get(key);if(!promise){promise=limited(alert.chain,alert.theaterId,alert.date);groups.set(key,promise);}
   const matching=matchRows(await promise,alert);const snapshot=await db.prepare('SELECT state FROM snapshots WHERE alert_id=? AND user_id=?').bind(alert.id,userId).first<{state:string}>();
   const previous=snapshot?JSON.parse(snapshot.state):undefined;
   const transition=detectOpenings(previous,{ok:true,showtimes:matching},{id:alert.id});
   const statements:D1PreparedStatement[]=[];const candidates:Array<Record<string,unknown>>=[];
   for(const event of transition.events){
    const notification={id:crypto.randomUUID(),alertId:alert.id,movieTitle:alert.movieTitle,theaterName:alert.theaterName,chain:alert.chain,date:alert.date,format:alert.format,showtime:event.showtime,bookingUrl:event.showtime.bookingUrl,createdAt:checkedAt,type:'booking_open'};
    candidates.push(notification);
    statements.push(db.prepare('INSERT OR IGNORE INTO notifications(id,user_id,alert_id,event_key,payload,created_at) SELECT ?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM alerts WHERE id=? AND user_id=? AND check_token=?)').bind(notification.id,userId,alert.id,event.id,JSON.stringify(notification),checkedAt,alert.id,userId,token));
   }
   statements.push(db.prepare('INSERT INTO snapshots(alert_id,user_id,state,checked_at) SELECT ?,?,?,? WHERE EXISTS (SELECT 1 FROM alerts WHERE id=? AND user_id=? AND check_token=?) ON CONFLICT(alert_id) DO UPDATE SET state=excluded.state,checked_at=excluded.checked_at').bind(alert.id,userId,JSON.stringify(transition.state),checkedAt,alert.id,userId,token));
   statements.push(db.prepare('UPDATE alerts SET check_token=NULL,check_until=0 WHERE id=? AND user_id=? AND check_token=?').bind(alert.id,userId,token));
   const committed=await db.batch(statements);for(let i=0;i<candidates.length;i++)if(committed[i].meta.changes>0)notifications.push(candidates[i]);
   const open=matching.filter(r=>r.bookingOpen??r.available);
   results.push({...base,status:'checked',openCount:open.length,showtimes:open,message:!previous?'첫 확인을 완료했습니다. 현재 회차를 기준으로 다음 오픈부터 알립니다.':open.length?`예매가 열린 회차 ${open.length}개를 확인했습니다.`:'조건에 맞는 오픈 회차가 아직 없습니다.'});
  }catch(error){results.push({...base,status:'error',message:error instanceof ApiError?error.message:'영화관 정보를 확인하지 못했습니다. 이전 확인 상태는 유지됩니다.'});}
  finally{await db.prepare('UPDATE alerts SET check_token=NULL,check_until=0 WHERE id=? AND user_id=? AND check_token=?').bind(alert.id,userId,token).run();}
 }));
 return response({results,notifications,monitoring:'page-open-only',message:'이 페이지가 열린 동안 확인합니다. 백그라운드 푸시는 아직 연결되지 않았습니다.'});
});
