/* Shared deterministic assessment for browser and n8n. No navigation or registry claims. */
(function(root) {
 'use strict';
 const VERSION = '3.0.0';
 const fields = [
 ['imo','IMO номер танкера (7 цифр)'], ['vessel_name','Название танкера'],
 ['destination_country','Страна назначения / Покупатель'], ['route','Маршрут следования (Порты)'],
 ['declared_price_usd','Заявленная цена нефти ($/баррель)'],
 ['chokepoint','Критический пролив / опасная зона (выбор из списка)'],
 ['manual_chokepoints','Дополнительные проливы / ручной ввод нескольких зон (через запятую)'],
 ['policy_price_limit','Порог цены для сценарного контроля ($/баррель)']
 ];
 const zones = [
 ['bab','Баб-эль-Мандеб / Красное море',12.58,43.33,/мандеб|красное море/i],
 ['suez','Суэцкий канал',29.97,32.55,/суэц/i],
 ['bos','Босфор',41.11,29.07,/босфор/i], ['dar','Дарданеллы',40.2,26.4,/дарданелл/i],
 ['cape','Мыс Доброй Надежды',-35,19,/надежд|африк/i],
 ['gib','Гибралтар',35.95,-5.6,/гибралтар/i],
 ['dan','Датские проливы',55.3,11,/датск|балтийск|storeb/i],
 ['east','Восточно-Китайское море',29.5,123.5,/восточно-китайск|восточно китайск/i],
 ['taiwan','Тайваньский пролив',24,119,/тайван/i],
 ['japan','Японское море',40,135,/японск/i],
 ['hormuz','Ормузский пролив',26.56,56.25,/ормуз|персидск/i],
 ['malacca','Малаккский пролив',2.5,101.8,/малакк/i],
 ['sing','Сингапурский пролив',1.25,103.8,/сингапур/i],
 ['sts','Лаконский залив',36.55,22.6,/лаконск|sts/i]
 ];
 const ports = [
 ['nov','Новороссийск',44.72,37.77,/новороссийск/i], ['prim','Приморск',60.33,28.72,/приморск/i],
 ['ust','Усть-Луга',59.68,28.4,/усть[ -]луга/i], ['koz','Козьмино',42.72,133.02,/козьмин/i],
 ['mundra','Мундра',22.83,69.7,/мундр/i], ['vadinar','Вадинар',22.4,69.72,/вадинар/i],
 ['rizhao','Жичжао',35.35,119.55,/жичжао|жичжау|rizhao/i],
 ['rot','Роттердам',51.95,4.05,/роттердам/i], ['sg','Сингапур',1.25,103.8,/сингапур/i]
 ];
 const identify = (text, list) => list.filter(z=>z[4].test(text)).map(z=>z[0]);
 function validImo(s) {return /^\d{7}$/.test(s) && s.slice(0,6).split('').reduce((v,d,i)=>v+Number(d)*(7-i),0)%10===Number(s[6]);}
 function decimal(v, optional=false) {
  const s=String(v??'').trim();
  if (!s && optional) return null;
  if (!/^\d+(?:[.,]\d{1,6})?$/.test(s)) throw Error('Цена: положительное число, точка или запятая, до 6 знаков после разделителя.');
  const [a,b='']=s.replace(',','.').split('.');
  const cents=Number(a)*100+Number((b+'00').slice(0,2))+(Number(b[2]||0)>=5?1:0);
  if (!Number.isSafeInteger(cents)||cents<=0||cents>1000000) throw Error('Цена должна быть больше 0 и не более 10000.');
  return cents/100;
 }
 function normalize(raw) {
  const body=raw.body&&typeof raw.body==='object'?raw.body:raw; const n={};
  for (const [key,label] of fields) n[key]=String(body[key]??body[label]??'').trim();
  if (!validImo(n.imo)) throw Error('IMO: нужны 7 цифр и правильная контрольная сумма mod 10.');
  for (const key of ['vessel_name','destination_country','route']) if(n[key].length<2||n[key].length>300) throw Error('Заполните '+fields.find(f=>f[0]===key)[1]+' (2–300 символов).');
  if(n.chokepoint.length>300||n.manual_chokepoints.length>500) throw Error('Слишком длинный список зон.');
  n.declared_price_usd=decimal(n.declared_price_usd);
  n.policy_price_limit=decimal(n.policy_price_limit,true);
  if (/свой вариант/i.test(n.chokepoint)) n.chokepoint='';
  n.chokepoints=[n.chokepoint,n.manual_chokepoints].filter(Boolean).join(', ');
  return n;
 }
 function routeInfo(n,withAlternatives=true) {
  const parts=n.route.split(/\s*(?:→|->|=>|;)\s*/).filter(Boolean);
  const errors=[], warnings=[];
  if(parts.length<2) errors.push('Укажите порт отправления и назначения через → или ->.');
  const start=ports.find(p=>p[4].test(parts[0]||''));
  const end=ports.find(p=>p[4].test(parts.at(-1)||''));
  const declared=identify(n.route+' '+n.chokepoints,zones);
  let corridor=null, inferred=[];
  if(start?.[0]==='koz'&&end?.[0]==='rizhao') {corridor='pacific'; inferred=['japan','east'];}
  const india=['mundra','vadinar'].includes(end?.[0]);
  if(['nov','prim','ust'].includes(start?.[0])&&india) {
   if(declared.includes('cape')) {corridor='cape';inferred=start[0]==='nov'?['bos','dar','gib','cape']:['dan','cape'];}
   else if(declared.includes('suez')||declared.includes('bab')) {corridor='suez';inferred=start[0]==='nov'?['bos','dar','suez','bab']:['dan','gib','suez','bab'];}
   else warnings.push('Для пути в Индию уточните коридор: Суэц или мыс Доброй Надежды.');
  }
  if(!start||!end||!corridor) warnings.push('Маршрут вне проверяемого каталога. Промежуточные моря автоматически не достраиваются; нужна проверка офицера.');
  const allowed=new Set([...inferred]);
  if(corridor) for(const id of declared) if(!allowed.has(id)) errors.push('Зона «'+zones.find(z=>z[0]===id)[1]+'» не входит в выбранный коридор. Проверьте маршрут и цепочку.');
  for(const token of n.chokepoints.split(/[,;]/).filter(s=>s.trim())) if(!identify(token,zones).length) warnings.push('Неизвестная зона: '+token.trim()+'. Её риск не оценён.');
  for(const token of parts.slice(1,-1)) if(!identify(token,zones).length&&!/северное море/i.test(token)) warnings.push('Промежуточная точка не распознана: '+token);
  if(declared.includes('cape')&&declared.includes('bab')) errors.push('Одновременно заданы обход Африки и Баб-эль-Мандеб. Уточните один маршрут.');
  if(end&&(['rizhao'].includes(end[0])&&!/китай|china/i.test(n.destination_country)||india&&!/индия|india/i.test(n.destination_country))) errors.push('Страна назначения не соответствует известному порту назначения.');
  const ids=[...new Set([...inferred,...declared])];
  const known=(id)=>{const z=zones.find(z=>z[0]===id);return {id,name:z[1],point:[z[2],z[3]]};};
  let points=[];
  if(corridor) {
   const middle=inferred.flatMap(id=>id==='japan'?[[40,135],[35.2,130],[34,129.5],[32,126]]:id==='cape'?[[30,-15],[0,-15],[-25,3],[-35,19],[-30,40],[-5,60]]:id==='gib'?[[36,18],[36,2],[35.95,-5.6]]:id==='bab'?[[23,36],[16,41],[12.58,43.33],[13,50]]:[known(id).point]);
   points=[[start[2],start[3]],...middle,[end[2],end[3]]];
  }
  const alternatives=[];
  if(withAlternatives&&corridor&&errors.length===0){
   if(corridor==='suez'||corridor==='cape'){
    const other=routeInfo({...n,route:start[1]+' → '+end[1],chokepoints:corridor==='suez'?'Мыс Доброй Надежды':'Суэц, Баб-эль-Мандеб'},false);
    alternatives.push({label:corridor==='suez'?'Вариант обхода через мыс Доброй Надежды':'Сравнение через Суэц: критическая зона, не рекомендация',points:other.points,requires_verification:true});
   }else if(corridor==='pacific'){
    alternatives.push({label:'Вариант через Цугару и Тихий океан: требует проверки офицера',points:[[start[2],start[3]],[42,137],[41.6,140],[41.6,141.6],[40,144],[35,142],[30,133],[29,130],[29,125],[end[2],end[3]]],requires_verification:true});
   }
  }
  return {corridor,errors,warnings,assumed:inferred.map(id=>known(id).name),zones:ids.map(known),points,alternatives,labels:[start,end].filter(Boolean).map(p=>({point:[p[2],p[3]],name:p[1]}))};
 }
 function weather(raw,now=Date.now()) {
  const h=raw?.hourly, t=h?.time||[];
  const candidates=t.map((v,i)=>({i,delta:Math.abs(Date.parse(v.endsWith('Z')?v:v+'Z')-now)})).filter(x=>Number.isFinite(x.delta)&&x.delta<=3*3600000).sort((a,b)=>a.delta-b.delta);
  const i=candidates[0]?.i;
  const w=i===undefined?null:h.wave_height?.[i], c=i===undefined?null:h.ocean_current_velocity?.[i];
  const live=typeof w==='number'&&Number.isFinite(w)&&w>=0;
  return {wave:live?w:null,current:typeof c==='number'&&Number.isFinite(c)?c:null,live,sample_time:i===undefined?null:t[i],source:live?'Open-Meteo Marine':'Нет актуальных данных',current_unit:raw?.hourly_units?.ocean_current_velocity||'не указана'};
 }
 function assess(n,w={live:false,wave:null,current:null},requestId='') {
  const route=routeInfo(n), ids=route.zones.map(z=>z.id), reasons=[],warnings=[...route.warnings];
  const compliance=n.policy_price_limit===null?null:n.declared_price_usd>n.policy_price_limit?90:15;
  if(compliance===null) warnings.push('Порог цены не задан: санкционный комплаенс не проверен.');
  else reasons.push(`Цена $${n.declared_price_usd.toFixed(2)} ${compliance===90?'>':'≤'} сценарного порога $${n.policy_price_limit.toFixed(2)}: ${compliance}/100. Порог не является правовым заключением.`);
  const war=ids.includes('bab')?88:ids.includes('hormuz')?65:ids.includes('east')?20:15;
  reasons.push('Маршрутный сценарный индикатор: '+war+'/100. Это не вероятность атаки и не актуальная сводка UKMTO.');
  const wave=w.live&&typeof w.wave==='number'?Math.min(100,Math.round(w.wave*25)):null;
  if(wave===null) warnings.push('Актуальная высота волны не получена; погодный риск неизвестен.');
  else reasons.push(`Волна ${w.wave} м × 25, максимум 100 → ${wave}/100.`);
  warnings.push('Реестры санкций, AIS, страхование и ограничения судна не подключены; требуется ручная проверка.');
  const bottleneck=ids.some(id=>['bos','suez','bab','malacca','hormuz'].includes(id))?70:20;
  const scores={compliance,war,ais:null,weather:wave,bottleneck};
  const observed=[war,bottleneck,compliance,wave].filter(Number.isFinite);
  const totalRisk=Math.max(...observed), level=totalRisk>=65?'RED':totalRisk>=40?'YELLOW':'GREEN';
  const status=route.errors.length?'INPUT_REVIEW_REQUIRED':'AWAITING_OFFICER';
  return {schema_version:VERSION,request_id:requestId,imo:n.imo,vessel:n.vessel_name,route:n.route,country:n.destination_country,price:n.declared_price_usd,chokepoints:n.chokepoints,parameters:n,route_info:route,totalRisk,level,status,isLowRisk:level==='GREEN',isAutoApproved:false,requires_officer:true,scores,weather:w,reasons,warnings,dominanceReason:route.errors[0]||reasons.join(' '),economics:{warPremium:null,capeFuel:null,capeDemurrage:null},wormHash:'',timestamp:new Date().toISOString()};
 }
 const api={VERSION,fields,zones,ports,validImo,decimal,normalize,routeInfo,weather,assess};
 if(typeof module!=='undefined'&&module.exports) module.exports=api;
 root.MarineRisk=api;
})(typeof globalThis!=='undefined'?globalThis:this);
