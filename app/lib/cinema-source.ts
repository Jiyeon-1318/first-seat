import {createCinemaAdapters,normalizeLotte} from './cinema.mjs';
import {ApiError,todaySeoul} from './alert-validation.mjs';
type Theater={id:string,name:string,regionCode?:string,regionDetailCode?:string};
const cache=new Map<string,{until:number,theaters:Theater[]}>();
async function request(url:string,body:BodyInit){
 const response=await fetch(url,{method:'POST',body,signal:AbortSignal.timeout(15000)});
 if(!response.ok)throw new ApiError(502,`영화관 응답 오류 (${response.status})`);
 const data=await response.json();if(data.IsOK===false)throw new ApiError(502,'영화관 조회에 실패했습니다.');return data;
}
async function lotte(method:string,fields:Record<string,string>){const form=new FormData();form.append('paramList',JSON.stringify({MethodName:method,channelType:'HO',osType:'W',osVersion:'CinemaAlert/0.1',...fields}));return request('https://www.lottecinema.co.kr/LCWS/Ticketing/TicketingData.aspx',form);}
export async function theaters(chain:string):Promise<Theater[]>{
 if(chain==='cgv')return [];
 if(chain!=='lotte'&&chain!=='megabox')throw new ApiError(400,'영화관을 선택해 주세요.');
 const old=cache.get(chain);if(old&&old.until>Date.now())return old.theaters;
 // Keep the selector usable during a local preview when a cinema blocks the
 // catalog request. These IDs were verified by the corresponding showtime
 // probes; live refresh replaces this small fallback when it succeeds.
 let items:Theater[];
 const previewFallback:Record<string,Theater[]>={
  megabox:[{id:'1372',name:'강남',regionCode:'11'}],
  lotte:[{id:'1016',name:'월드타워',regionCode:'1',regionDetailCode:'0001'}],
 };
 if(process.env.NODE_ENV==='development'){
  items=previewFallback[chain]??[];cache.set(chain,{until:Date.now()+300000,theaters:items});return items;
 }
 if(chain==='lotte'){
  const data=await lotte('GetTicketingPageTOBE',{memberOnNo:'0'});const source=data.Cinemas?.Cinemas?.Items;
  if(!Array.isArray(source))throw new ApiError(502,'극장 목록 형식이 변경되었습니다.');
  items=source.filter((r:Record<string,string>)=>r.CinemaID&&r.CinemaNameKR).map((r:Record<string,string>)=>({id:String(r.CinemaID),name:r.CinemaNameKR,regionCode:String(r.DivisionCode),regionDetailCode:String(r.DetailDivisionCode)}));
 }else{
  const data=await request('https://www.megabox.co.kr/on/oh/ohb/SimpleBooking/selectBokdList.do',new URLSearchParams({playDe:todaySeoul().replaceAll('-',''),sellChnlCd:'ONLINE',brchNoListCnt:'1',areaCd1:'11',spclbYn1:'N',theabKindCd1:''}));
  if(!Array.isArray(data.areaBrchList))throw new ApiError(502,'극장 목록 형식이 변경되었습니다.');
  items=data.areaBrchList.filter((r:Record<string,string>)=>r.brchNo&&r.brchNm).map((r:Record<string,string>)=>({id:String(r.brchNo),name:r.brchNm,regionCode:String(r.areaCd)}));
 }
 items=[...new Map(items.map(t=>[t.id,t])).values()];cache.set(chain,{until:Date.now()+300000,theaters:items});return items;
}
export async function fetchGroup(chain:string,theaterId:string,date:string){
 if(chain==='megabox')return createCinemaAdapters().megabox({date,theaterId});
 if(chain==='lotte'){
  const theater=(await theaters(chain)).find(t=>t.id===theaterId);if(!theater)throw new ApiError(422,'극장 연결 정보를 다시 선택해 주세요.');
  const data=await lotte('GetPlaySequence',{playDate:date,cinemaID:`${theater.regionCode}|${theater.regionDetailCode}|${theater.id}`,representationMovieCode:''});
  return normalizeLotte(data,{date});
 }
 throw new ApiError(503,'CGV 자동 확인 연동 준비 중입니다.');
}

