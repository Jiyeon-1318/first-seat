export const formats={cgv:['일반관','IMAX','4DX','SCREENX'],lotte:['일반관','수퍼플렉스','수퍼 MX4D'],megabox:['일반관','돌비시네마','MEGA MX4D']};
export const canonical=x=>String(x).normalize('NFKC').trim().toLowerCase().replace(/\s+/g,' ');
export const todaySeoul=(now=new Date())=>new Date(now.getTime()+9*3600000).toISOString().slice(0,10);
export class ApiError extends Error {constructor(status,message){super(message);this.status=status;}}
export function validateAlert(input,{allowPast=false,now=new Date()}={}){
 if(!input || typeof input!=='object' || Array.isArray(input)) throw new ApiError(400,'알림 조건을 확인해 주세요.');
 if(!Object.hasOwn(formats,input.chain)) throw new ApiError(400,'영화관을 확인해 주세요.');
 const clean=(x,max)=>{if(typeof x!=='string' || !x.trim() || x.length>max)throw new ApiError(400,'입력 길이를 확인해 주세요.');return x.trim().replace(/\s+/g,' ');};
 const date=input.date;
 if(typeof date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date||(!allowPast&&date<todaySeoul(now)))throw new ApiError(400,'오늘 이후의 유효한 날짜를 선택해 주세요.');
 if(!formats[input.chain].includes(input.format))throw new ApiError(400,'상영관 종류를 확인해 주세요.');
 if(input.enabled!==undefined && typeof input.enabled!=='boolean')throw new ApiError(400,'알림 상태를 확인해 주세요.');
 const theaterId=input.theaterId==null||input.theaterId===''?null:clean(input.theaterId,20);
 if(theaterId && !/^[0-9A-Za-z_-]+$/.test(theaterId))throw new ApiError(400,'극장 코드가 올바르지 않습니다.');
 return {chain:input.chain,movieTitle:clean(input.movieTitle,120),theaterId,theaterName:clean(input.theaterName,100),date,format:input.format,enabled:input.enabled??true};
}
export const conditionKey=a=>JSON.stringify([a.chain,canonical(a.movieTitle),a.theaterId??canonical(a.theaterName),a.date,a.format]);
export function formatMatches(value,format){
 const s=canonical(value).replace(/\s/g,'');
 if(format==='일반관')return !/imax|4dx|screenx|돌비|dolby|mx4d|수퍼플렉스|superplex|샤롯데|charlotte|부티크|boutique|리클라이너|recliner/.test(s);
 const aliases={'수퍼플렉스':['수퍼플렉스','superplex'],'수퍼 MX4D':['mx4d'],'MEGA MX4D':['mx4d'],'돌비시네마':['돌비시네마','dolbycinema']};
 return (aliases[format]??[format]).some(f=>s.includes(canonical(f).replace(/\s/g,'')));
}
export const matchRows=(rows,a)=>rows.filter(r=>r.chain===a.chain&&r.theaterId===a.theaterId&&r.date===a.date&&canonical(r.movieTitle)===canonical(a.movieTitle)&&formatMatches(r.format,a.format));
