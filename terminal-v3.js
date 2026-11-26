// UI uses the exact same engine embedded in the generated n8n workflow.
let assessmentBusy=false;
function handleChokepointSelect() {} // Selection never adds stale zones to the manual chain.
async function evaluateVoyageRisk() {
 if(assessmentBusy)return;
 const [inputImo,inputVessel,inputCountry,inputRoute,inputPrice,inputChokepoint,inputManualChokepoints]=['inputImo','inputVessel','inputCountry','inputRoute','inputPrice','inputChokepoint','inputManualChokepoints'].map(id=>document.getElementById(id));
 const btn=document.getElementById('btnSubmitAssessment');
 const original=btn.innerHTML;
 let n;
 try {
  n=MarineRisk.normalize({imo:inputImo.value,vessel_name:inputVessel.value,destination_country:inputCountry.value,route:inputRoute.value,declared_price_usd:inputPrice.value,chokepoint:inputChokepoint.value,manual_chokepoints:inputManualChokepoints.value,policy_price_limit:document.getElementById('policyPriceLimit').value});
  inputPrice.value=n.declared_price_usd.toFixed(2);
 }catch(e){currentAssessment=null;document.getElementById('resultsContainer').classList.add('hidden');showToast(e.message,'error');document.getElementById('assessmentStatus').textContent=e.message;return;}
 const ri=MarineRisk.routeInfo(n);
 if(ri.errors.length){showAssessment(MarineRisk.assess(n),false);return;}
 assessmentBusy=true;btn.disabled=true;btn.textContent='ОЖИДАНИЕ РАСЧЁТА N8N…';
 currentAssessment=null;
 document.getElementById('resultsContainer').classList.add('hidden');
 document.getElementById('assessmentStatus').textContent='Запрос отправляется в n8n. Решение всегда принимает офицер.';
 const requestId=crypto.randomUUID?crypto.randomUUID():String(Date.now())+'-'+Math.random();
 try {
  const result=await dispatchToN8n({...n,request_id:requestId});
  if(result.schema_version!==MarineRisk.VERSION||result.request_id!==requestId||!result.parameters||!result.scores||!result.route_info||!['RED','YELLOW','GREEN'].includes(result.level)||!Number.isFinite(result.totalRisk)||result.isAutoApproved!==false||result.requires_officer!==true) throw Error('Ответ не соответствует версии 3. Импортируйте обновлённый workflow.');
  if(result.workflow_revision!=='4.0'||!result.server_audit||!result.assessment_id||!result.access_token)throw Error('Импортируйте AI_Marine_Risk_Radar_FULL.json: требуется серверный журнал и согласование.');
  const expected=MarineRisk.normalize(result.parameters);
  if(JSON.stringify(expected)!==JSON.stringify(n)) throw Error('n8n вернул результат для других параметров.');
  const verified=MarineRisk.assess(n,result.weather,requestId);
  if(JSON.stringify(verified.scores)!==JSON.stringify(result.scores)||verified.totalRisk!==result.totalRisk||verified.status!==result.status) throw Error('Расчёт n8n не прошёл проверку правил.');
  showAssessment(result,true);
 }catch(e){
  document.getElementById('assessmentStatus').textContent='Результат не получен: '+e.message+'. Локальное решение не подставлено. Проверьте Executions и повторите.';
  showToast(e.message,'error');
 }finally{assessmentBusy=false;btn.disabled=false;btn.innerHTML=original;lucide.createIcons();}
}
function showAssessment(res,confirmed) {
 currentAssessment=res;
 document.getElementById('emptyStatePlaceholder').classList.add('hidden');
 document.getElementById('resultsContainer').classList.remove('hidden');
 if(!leafletMap)initMap();
 renderVerdictBanner(res);renderRiskMatrix(res);renderRadarChart(res);renderEconomicsTab(res);renderHitlTab(res);updateGeospatialMap(res);
 document.getElementById('assessmentStatus').textContent=confirmed?'Получен и проверен ответ n8n. Ожидается решение офицера.':'Исправьте противоречия маршрута перед отправкой в n8n.';
 if(confirmed)recordAssessmentInAudit(res);
 lucide.createIcons();setTimeout(()=>leafletMap.invalidateSize(),100);
}
function renderVerdictBanner(res) {
 const c=res.level==='RED'?'#f87171':res.level==='YELLOW'?'#fbbf24':'#34d399';
 document.getElementById('verdictBanner').style.borderColor=c;
 const pill=document.getElementById('verdictPill');pill.textContent=(res.status==='INPUT_REVIEW_REQUIRED'?'ПРОВЕРЬТЕ ВВОД':'ОЖИДАЕТ РИСК-ОФИЦЕРА')+' • '+res.level;pill.style.color=c;
 document.getElementById('verdictTitle').textContent='Наблюдаемый риск '+res.totalRisk+'/100. Полнота проверки ограничена; автоодобрения нет.';
 document.getElementById('resVesselName').textContent=res.vessel;
 document.getElementById('resImo').textContent=res.imo;
 document.getElementById('resRoute').textContent=res.route;
 document.getElementById('totalRiskScore').textContent=res.totalRisk;
 document.getElementById('totalRiskScore').style.color=c;
 document.getElementById('dominanceStatusLabel').textContent='Максимум известных индикаторов';
 document.getElementById('dominanceStatusLabel').style.color=c;
 document.getElementById('wormShortBadge').textContent='ID: '+(res.request_id||'ввод');
 const detail=document.getElementById('assessmentDetails');
  detail.textContent=[...res.route_info.errors,...res.reasons,...res.warnings,'Достроенные точки каталога: '+(res.route_info.assumed.join(' → ')||'нет'),'Помощник LLM (непроверенный текст): '+((res.llm_checklist||[]).join('; ')||'ответ не получен')].join('\n• ');
 document.getElementById('liveWaveHeight').textContent=res.weather.live?res.weather.wave+' м':'Нет данных';
 document.getElementById('liveCurrentSpeed').textContent=res.weather.current===null?'Нет данных':res.weather.current+' '+res.weather.current_unit;
 document.getElementById('weatherZoneLabel').textContent=res.weather.source+' • '+(res.weather.sample_time||'время неизвестно');
}
function renderRiskMatrix(res) {
 const labels={compliance:'Цена относительно заданного порога',war:'Маршрутный индикатор (сценарная модель)',ais:'Проверка AIS и реестров',weather:'Высота волны в одной контрольной точке',bottleneck:'Наличие узостей в коридоре'};
 document.getElementById('riskMatrixTableBody').innerHTML=Object.entries(res.scores).map(([key,v])=>`<tr><td class="py-3">${labels[key]}</td><td>${v===null?'Нет данных':'Сценарное правило'}</td><td>${v===null?'—':v+'/100'}</td><td>${v===null?'Неизвестно':v>=65?'Красный':v>=40?'Жёлтый':'Зелёный'}; проверяет офицер</td></tr>`).join('');
}
function renderRadarChart(res) {
 if(radarChartInstance)radarChartInstance.destroy();
 const keys=['compliance','war','ais','weather','bottleneck'],names=['Цена','Военный риск','AIS / STS','Погода','Узости'];
 radarChartInstance=new Chart(document.getElementById('riskRadarChart').getContext('2d'),{type:'radar',data:{labels:names.map((v,i)=>v+(res.scores[keys[i]]===null?' (?)':'')),datasets:[{label:'Известные индикаторы',data:keys.map(k=>res.scores[k]),borderColor:res.level==='RED'?'#f87171':'#60a5fa',pointBackgroundColor:'#93c5fd',pointRadius:4,borderWidth:2,backgroundColor:'rgba(96,165,250,.22)',spanGaps:false,fill:true}]},options:{responsive:true,maintainAspectRatio:false,layout:{padding:12},plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>c.raw===null?'Нет данных':c.raw+'/100'}}},scales:{r:{min:0,max:100,grid:{color:'#52647e'},angleLines:{color:'#52647e'},pointLabels:{color:'#e2e8f0',font:{size:12,weight:'600'}},ticks:{display:true,stepSize:20,color:'#94a3b8',showLabelBackdrop:false,font:{size:9}}}}}});
}
function renderEconomicsTab(res) {
 document.getElementById('tabContent-economics').replaceChildren();
}
function renderHitlTab(res) {
 document.getElementById('fullWormSignature').textContent=res.request_id||'Нет ID';
 document.querySelectorAll('[onclick^="submitOfficerResolution"]').forEach(b=>b.disabled=res.status==='INPUT_REVIEW_REQUIRED');
}
function updateGeospatialMap(res) {
 for(const key of ['directRoute','capeRoute','vesselMarker'])if(mapLayers[key]){leafletMap.removeLayer(mapLayers[key]);mapLayers[key]=null;}
 for(const key of ['hazardCircles','corridorMarkers']){mapLayers[key].forEach(x=>leafletMap.removeLayer(x));mapLayers[key]=[];}
 const r=res.route_info;
 if(r.errors.length||!r.points.length){leafletMap.setView([20,50],2);return;}
 mapLayers.directRoute=L.polyline(r.points,{color:res.level==='RED'?'#ef4444':'#60a5fa',weight:3}).bindTooltip('Схема выбранного коридора; не навигационная прокладка').addTo(leafletMap);
 const alt=r.alternatives?.[0];if(alt?.points.length)mapLayers.capeRoute=L.polyline(alt.points,{color:'#fbbf24',weight:3,dashArray:'8,6'}).bindTooltip(alt.label,{sticky:true}).addTo(leafletMap);
 [...r.labels,...r.zones].forEach(p=>mapLayers.corridorMarkers.push(L.circleMarker(p.point,{radius:4}).bindTooltip(p.name).addTo(leafletMap)));
 const bounds=mapLayers.directRoute.getBounds();if(mapLayers.capeRoute)bounds.extend(mapLayers.capeRoute.getBounds());leafletMap.fitBounds(bounds,{padding:[30,30],maxZoom:5});
}
function submitOfficerResolution() {
 if(!currentAssessment?.server_audit)return showToast('Сначала получите сохранённую оценку из полного workflow.','error');
 const url=new URL(currentAssessment.officer_form_url);
 if(url.origin!=='https://lavrik.app.n8n.cloud'||url.pathname!=='/form/marine-risk-officer-v4')return showToast('Неверный адрес формы офицера.','error');
 window.open(url.href,'_blank','noopener,noreferrer');
 document.getElementById('assessmentStatus').textContent='Решение вводится в защищённой форме n8n. После сохранения нажмите «Обновить решение». ID: '+currentAssessment.assessment_id;
}
async function refreshOfficerDecision() {
 const a=currentAssessment;if(!a?.server_audit)return;
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),20000);
 try{
  const r=await fetch('https://lavrik.app.n8n.cloud/webhook/marine-risk-status',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded;charset=UTF-8'},body:new URLSearchParams({assessment_id:a.assessment_id,access_token:a.access_token}),signal:controller.signal});
  if(!r.ok)throw Error('HTTP '+r.status);const d=await r.json();
  if(currentAssessment!==a)return;
  if(d.assessment_id!==a.assessment_id||d.imo!==a.imo||!d.server_audit||!['AWAITING_OFFICER','MORE_DATA_REQUIRED','OFFICER_BLOCKED','OFFICER_APPROVED'].includes(d.status))throw Error('Серверный статус не прошёл проверку');
  a.status=d.status;a.officer_decision=d.decision;
  const labels={AWAITING_OFFICER:'Ожидается решение офицера',MORE_DATA_REQUIRED:'Офицер запросил дополнительные данные',OFFICER_BLOCKED:'Офицер заблокировал рейс',OFFICER_APPROVED:'Решение офицера: согласовано'};
  document.getElementById('verdictPill').textContent=labels[d.status];
  document.getElementById('assessmentStatus').textContent=labels[d.status]+'. Подтверждено n8n, запись '+d.audit_row_id+(d.decision?' — '+d.decision.officer+': '+d.decision.note:'');
  const e=auditHistory.find(x=>x.id===a.request_id);if(e){e.decision=labels[d.status];e.officer_decision=d.decision;saveAuditHistory();}
 }catch(e){showToast('Не удалось получить решение: '+e.message,'error');}finally{clearTimeout(timer);}
}
function recordAssessmentInAudit(res) {
 auditHistory.unshift({id:res.request_id,timestamp:res.timestamp,vessel:res.vessel,imo:res.imo,route:res.route,totalRisk:res.totalRisk,decision:res.status,wormHash:res.request_id});auditHistory=auditHistory.slice(0,50);saveAuditHistory();
}
async function copyWormSignature(){try{await navigator.clipboard.writeText(currentAssessment?.request_id||'');showToast('ID скопирован');}catch{showToast('Выделите ID и скопируйте вручную.');}}
window.addEventListener('DOMContentLoaded',()=>{
 const inputPrice=document.getElementById('inputPrice'),inputManualChokepoints=document.getElementById('inputManualChokepoints');
 const country=document.getElementById('inputCountry');
 const input=document.createElement('input');input.id='inputCountry';input.className=country.className;input.value='Индия';input.required=true;input.maxLength=300;input.setAttribute('list','countries');
 const list=document.createElement('datalist');list.id='countries';list.innerHTML=['Индия','Китай','Турция','ОАЭ','Нидерланды','Сингапур'].map(v=>'<option value="'+v+'">').join('');country.replaceWith(input);input.after(list);
 inputPrice.type='text';inputPrice.inputMode='decimal';inputPrice.removeAttribute('step');inputPrice.removeAttribute('min');inputPrice.removeAttribute('max');
 const info=(text)=>'<details class="price-info"><summary aria-label="Информация">ⓘ</summary><span role="tooltip">'+text+'</span></details>';
 const style=document.createElement('style');style.textContent='.price-info{display:inline-block;position:relative;vertical-align:middle;margin-left:6px}.price-info summary{list-style:none;cursor:pointer;color:#93c5fd;border-radius:50%;padding:2px 4px}.price-info summary::-webkit-details-marker{display:none}.price-info>span{display:none;position:absolute;z-index:100;right:0;bottom:100%;width:230px;padding:10px;background:#020617;color:#e2e8f0;border:1px solid #475569;border-radius:8px;font-size:12px;font-weight:400;line-height:1.5}.price-info:hover>span,.price-info:focus-within>span,.price-info[open]>span{display:block}.price-info summary:focus-visible{outline:2px solid #60a5fa}';document.head.append(style);
 inputPrice.parentElement.querySelector('label').insertAdjacentHTML('beforeend',info('Точка или запятая; до 6 знаков после разделителя. Цена округляется до 2 знаков по правилу: третья цифра 5 и выше увеличивает вторую на 1.'));
 inputPrice.insertAdjacentHTML('afterend','<div class="mt-3"><label for="policyPriceLimit">Порог цены, $/bbl</label>'+info('Необязательный порог для сценарного контроля. Превышение даёт красный индикатор цены. Это не действующий правовой лимит. Без порога ценовой комплаенс не оценён.')+'<input id="policyPriceLimit" inputmode="decimal" placeholder="Не задан" class="w-full bg-slate-900 border rounded p-2"></div>');
 inputManualChokepoints.value='';document.getElementById('officerNameInput').value='';document.getElementById('officerNoteInput').value='';
 document.getElementById('voyageForm').insertAdjacentHTML('afterend','<p id="assessmentStatus" role="status" class="p-3 text-amber-300">Все рейсы требуют проверки офицера. Текущие котировки, AIS и санкционные реестры не подключены.</p>');
 document.getElementById('verdictBanner').insertAdjacentHTML('afterend','<div id="assessmentDetails" class="p-4 text-sm text-slate-300" style="white-space:pre-line"></div>');
 document.getElementById('map').insertAdjacentHTML('afterend','<div class="p-3 text-xs text-slate-300">━ Синий / красный: выбранный путь · <span style="color:#fbbf24">┄ Жёлтый пунктир: вариант обхода / сравнения</span><br>Обход требует проверки глубин, ограничений судна, погоды, расстояния и стоимости. Наличие линии не означает согласование.</div>');
 const hiddenEconomics=document.createElement('style');hiddenEconomics.textContent='#tabBtn-economics,#tabContent-economics{display:none!important}';document.head.append(hiddenEconomics);
 document.getElementById('tabContent-economics').replaceChildren();
 for(const id of ['tabBtn-hitl','tabBtn-audit']){const b=document.getElementById(id);if(b)for(const span of b.querySelectorAll('span'))span.textContent=span.textContent.replace('3. Решение','2. Решение').replace('4. Журнал','3. Журнал');}
 const buttons=document.querySelectorAll('[onclick^="submitOfficerResolution"]');
 buttons[0].textContent='Открыть защищённую форму офицера';buttons[0].setAttribute('onclick','submitOfficerResolution()');
 buttons[1].textContent='Обновить решение из n8n';buttons[1].setAttribute('onclick','refreshOfficerDecision()');buttons[2].remove();buttons[3].remove();
 document.getElementById('officerNameInput').closest('.grid').innerHTML='<p>Офицер вводит имя, обоснование и ссылки на документы в защищённой форме n8n. Решение сохраняется на сервере, затем программа запрашивает его по ключу оценки.</p>';
 document.querySelectorAll('#voyageForm input,#voyageForm select').forEach(el=>el.addEventListener('input',()=>{if(!assessmentBusy&&currentAssessment){currentAssessment=null;document.getElementById('resultsContainer').classList.add('hidden');document.getElementById('assessmentStatus').textContent='Параметры изменены. Выполните новый расчёт.';}}));
});
