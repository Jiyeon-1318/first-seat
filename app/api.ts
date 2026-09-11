export type Chain = 'cgv' | 'lotte' | 'megabox';
export type CinemaAlert = {id:string;chain:Chain;movieTitle:string;theaterId:string|null;theaterName:string;date:string;format:string;enabled:boolean;createdAt:string;regionCode?:string;regionDetailCode?:string};
export type Theater = {id:string;name:string;regionCode?:string;regionDetailCode?:string};
export type CheckResult = {alertId:string;status:string;checkedAt:string;message:string;openCount:number;showtimes:Array<{time?:string;startTime?:string;screenName?:string;bookingUrl?:string}>};
export type HistoryItem = {id:string;alertId:string;title?:string;message?:string;createdAt:string;bookingUrl?:string};
export const CHAINS = {cgv:{name:'CGV',formats:['일반관','IMAX','4DX','SCREENX'],url:'https://cgv.co.kr/'},lotte:{name:'롯데시네마',formats:['일반관','수퍼플렉스','수퍼 MX4D'],url:'https://www.lottecinema.co.kr/'},megabox:{name:'메가박스',formats:['일반관','돌비시네마','MEGA MX4D'],url:'https://www.megabox.co.kr/'}};
export class ApiError extends Error {constructor(message:string,public status:number){super(message)}}
export async function api<T>(url:string,method='GET',body?:unknown):Promise<T>{
 const response=await fetch(url,{method,headers:body?{'Content-Type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined});
 const data=await response.json().catch(()=>({}));
 if(!response.ok)throw new ApiError(typeof data.error==='string'?data.error:data.message||'요청을 완료하지 못했습니다. 잠시 후 다시 시도해 주세요.',response.status);
 return data as T;
}
export function today(){return new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul'}).format(new Date())}
