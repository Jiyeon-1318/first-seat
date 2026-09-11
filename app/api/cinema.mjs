/** Server-only experimental adapters. Never call cinema origins from a browser. */
export class CinemaError extends Error {
  constructor(code, message) { super(message); this.name = 'CinemaError'; this.code = code; }
}
const fail = (message) => { throw new CinemaError('INVALID_RESPONSE', message); };
const string = (value, field) => value === undefined || value === null || String(value).trim() === '' ? fail(`Missing ${field}`) : String(value);
export function dateISO(value) {
  const s = String(value).replaceAll('-', '');
  if (!/^\d{8}$/.test(s)) throw new CinemaError('INVALID_QUERY', 'Expected YYYY-MM-DD date');
  const iso = `${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6,8)}`;
  if (!Number.isFinite(Date.parse(iso)) || new Date(iso).toISOString().slice(0,10) !== iso) throw new CinemaError('INVALID_QUERY', 'Invalid date');
  return iso;
}
function time(value) {
  const t = String(value).replace(':', '');
  if (!/^\d{4}$/.test(t) || Number(t.slice(0,2)) > 29 || Number(t.slice(2)) > 59) fail('Invalid start time');
  return `${t.slice(0,2)}:${t.slice(2)}`;
}
function count(value) { return value !== null && value !== '' && value !== undefined && Number.isFinite(Number(value)) ? Number(value) : null; }
function list(value) { if (!Array.isArray(value)) fail('Missing showtime array'); return value; }
export function normalizeMegabox(body, query) {
  return list(body.movieFormList).map(r => ({
    chain:'megabox', scheduleId:string(r.playSchdlNo,'scheduleId'), theaterId:string(r.brchNo,'theaterId'), theaterName:string(r.brchNm,'theaterName'),
    movieId:string(r.rpstMovieNo ?? r.movieNo,'movieId'), movieTitle:string(r.movieNm,'movieTitle'), date:dateISO(r.playDe ?? query.date), startTime:time(r.playStartTime),
    format:[r.playKindNm, r.theabExpoNm].filter(Boolean).join(' · ').replaceAll('&#40;', '(').replaceAll('&#41;', ')'),
    bookingUrl:'https://www.megabox.co.kr/booking', available:r.bokdAbleAt === 'Y' && r.brchBokdUnableAt !== 'Y' && (count(r.restSeatCnt) ?? 0) > 0,
    bookingOpen:r.bokdAbleAt === 'Y' && r.brchBokdUnableAt !== 'Y', remainingSeats:count(r.restSeatCnt), screenId:String(r.theabNo ?? ''),
  }));
}
export function normalizeLotte(body, query) {
  if (body.IsOK === false) fail('Lotte reported failure');
  return list(body.PlaySeqs?.Items).map(r => {
    const total=count(r.TotalSeatCount), booked=count(r.BookingSeatCount), remaining=total === null || booked === null ? null : Math.max(0,total-booked);
    return {chain:'lotte', scheduleId:[r.PlayDt,r.CinemaID,r.ScreenID,r.PlaySequence].map((v,i)=>string(v,`schedule[${i}]`)).join(':'),
      theaterId:string(r.CinemaID,'theaterId'), theaterName:string(r.CinemaNameKR,'theaterName'), movieId:string(r.RepresentationMovieCode,'movieId'), movieTitle:string(r.MovieNameKR,'movieTitle'),
      date:dateISO(r.PlayDt ?? query.date), startTime:time(r.StartTime), format:[r.FilmNameKR,r.ScreenDivisionNameKR,r.ScreenNameKR].filter(Boolean).join(' · '),
      bookingUrl:'https://www.lottecinema.co.kr/NLCHS/Ticketing', available:r.IsBookingYN === 'Y' && (remaining ?? 0)>0, bookingOpen:r.IsBookingYN === 'Y', remainingSeats:remaining, screenId:String(r.ScreenID ?? '')};
  });
}
async function jsonRequest(fetcher,url,options,timeoutMs) {
  const controller=new AbortController(); const timer=setTimeout(()=>controller.abort(),timeoutMs);
  try {
    const response=await fetcher(url,{...options,signal:controller.signal});
    if (!response.ok) throw new CinemaError(response.status===401 || response.status===403 ? 'ACCESS_DENIED':'UPSTREAM_HTTP', `Cinema HTTP ${response.status}`);
    try { return await response.json(); } catch { fail('Cinema did not return JSON'); }
  } catch(error) { if(error instanceof CinemaError) throw error; throw new CinemaError(error.name==='AbortError'?'TIMEOUT':'NETWORK',error.message); }
  finally {clearTimeout(timer);}
}
export function createCinemaAdapters({fetcher=globalThis.fetch,timeoutMs=15000,cgvProvider}={}) {
  return {
    async megabox(query) {
      const date=dateISO(query.date); string(query.theaterId,'theaterId');
      const body=new URLSearchParams({playDe:date.replaceAll('-',''),sellChnlCd:'ONLINE',brchNoListCnt:'1',areaCd1:query.areaCode ?? '11',spclbYn1:'N',theabKindCd1:'',brchNo1:query.theaterId});
      const data=await jsonRequest(fetcher,'https://www.megabox.co.kr/on/oh/ohb/SimpleBooking/selectBokdList.do',{method:'POST',body,headers:{'Content-Type':'application/x-www-form-urlencoded'}},timeoutMs);
      return normalizeMegabox(data,query).filter(r=>r.theaterId===query.theaterId && (!query.movieId || r.movieId===query.movieId));
    },
    async lotte(query) {
      const date=dateISO(query.date); string(query.theaterId,'theaterId'); string(query.movieId,'movieId');
      if (!query.regionCode || !query.regionDetailCode) throw new CinemaError('CONFIGURATION','Lotte requires regionCode and regionDetailCode from GetTicketingPageTOBE');
      const body=new FormData(); body.append('paramList',JSON.stringify({MethodName:'GetPlaySequence',channelType:'HO',osType:'W',osVersion:'CinemaAlert/0.1',playDate:date,cinemaID:`${query.regionCode}|${query.regionDetailCode}|${query.theaterId}`,representationMovieCode:query.movieId}));
      return normalizeLotte(await jsonRequest(fetcher,'https://www.lottecinema.co.kr/LCWS/Ticketing/TicketingData.aspx',{method:'POST',body},timeoutMs),query).filter(r=>r.theaterId===query.theaterId && r.movieId===query.movieId);
    },
    async cgv(query) {
      if (!cgvProvider) throw new CinemaError('NOT_CONFIGURED','CGV requires an authorized data provider; direct endpoint returned HTTP 403');
      return list(await cgvProvider(query));
    },
  };
}
export const showtimeKey = r => JSON.stringify(r.scheduleId
  ? [r.chain,r.theaterId,r.movieId,r.date,r.scheduleId]
  : [r.chain,r.theaterId,r.movieId,r.date,r.screenId ?? '',r.startTime,r.format]);
export function matchesWatch(row,watch) {
  return (!watch.chains?.length || watch.chains.includes(row.chain)) && (!watch.theaterIds?.length || watch.theaterIds.includes(row.theaterId)) &&
    (!watch.movieIds || watch.movieIds[row.chain]===row.movieId) && (!watch.dates?.length || watch.dates.includes(row.date)) &&
    (!watch.formats?.length || watch.formats.some(f=>row.format.toLowerCase().includes(f.toLowerCase())));
}
/** Immutable transition. Errors preserve state. First successful baseline emits no events unless requested.
 * Persist returned state AND outbox events atomically. Mark delivery separately; retry by event id.
 * One state per stable watch + chain/theater/date query; replace state when the query changes.
 */
export function detectOpenings(state, result, watch, {notifyExisting=false}={}) {
  if (!result.ok) return {state,events:[],error:result.error};
  const rows=list(result.showtimes); const matching=rows.filter(r=>matchesWatch(r,watch));
  const seen=new Set(state?.seen ?? []); const events=[];
  for (const row of matching) {
    if (!(row.bookingOpen ?? row.available)) continue;
    const key=showtimeKey(row);
    if (!seen.has(key) && (state?.initialized || notifyExisting)) events.push({id:`${watch.id}:${key}`,watchId:watch.id,type:'booking_open',showtime:row});
    seen.add(key);
  }
  return {state:{initialized:true,seen:[...seen]},events,error:null};
}
