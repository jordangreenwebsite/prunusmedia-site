'use strict';
// Presentation-only navigation and compact calendar. Existing authentication,
// tenant data access, editorial approvals and uploads stay server-enforced.
const calendarState = {
  month: new Date(Date.UTC(new Date().getFullYear(),new Date().getMonth(),1)),
  posts:[], research:[], selectedDay:null, requestNumber:0
};
const shortMonth = new Intl.DateTimeFormat('en-GB',{month:'long',year:'numeric',timeZone:'UTC'});
const readableDay = new Intl.DateTimeFormat('en-GB',{day:'numeric',month:'short',timeZone:'UTC'});
const todayUTC = () => new Date().toISOString().slice(0,10);
function padDay(n){return String(n).padStart(2,'0');}
function calendarMonthKey(){
  return calendarState.month.getUTCFullYear()+'-'+padDay(calendarState.month.getUTCMonth()+1);
}
function updateWorkspaceNavigation(){
  const admin=!!state.session?.admin;
  const clients=state.session?.clients||[];
  const hasClients=clients.length>0;
  for(const entry of document.querySelectorAll('[data-role],[data-needs-client]')){
    const role=entry.getAttribute('data-role');
    entry.hidden=(role && role!==(admin?'admin':'client'))||(!hasClients && entry.hasAttribute('data-needs-client'));
  }
  const selector=$('calendar-client-filter');
  const previous=selector.value;
  selector.replaceChildren();
  const any=element('option','All clients');any.value='';selector.append(any);
  if(admin) {
    for(const client of clients){
      const item=element('option',client.name);item.value=client.id;selector.append(item);
    }
  }
  if(admin && clients.some(c=>c.id===previous))selector.value=previous;
  else selector.value='';
  $('calendar-client-label').hidden=!admin;
  refreshWorkspaceNavSelection();
}
function refreshWorkspaceNavSelection(){
  const active=location.hash||'#overview';
  for(const anchor of document.querySelectorAll('a[data-workspace-link]')){
    const selected=!anchor.hidden && anchor.getAttribute('href')===active;
    anchor.classList.toggle('is-active',selected);
    if(selected)anchor.setAttribute('aria-current','location');
    else anchor.removeAttribute('aria-current');
  }
  const more=$('mobile-more-toggle');
  if(more){
    const activeInMore=!!document.querySelector('#mobile-more-sheet a[data-workspace-link][href="'+active+'"]:not([hidden])');
    more.classList.toggle('is-active',activeInMore);
  }
}
function showMobileMore(open){
  const sheet=$('mobile-more-sheet'),btn=$('mobile-more-toggle');
  sheet.hidden=!open;
  btn.setAttribute('aria-expanded',String(open));
  if(open)$('mobile-more-close').focus();
}
$('mobile-more-toggle').addEventListener('click',()=>{
  showMobileMore($('mobile-more-sheet').hidden);
});
$('mobile-more-close').addEventListener('click',()=>{
  showMobileMore(false);$('mobile-more-toggle').focus();
});
document.querySelectorAll('a[data-workspace-link]').forEach(anchor=>{
  anchor.addEventListener('click',()=>{
    showMobileMore(false);
    // hashchange fires after anchor navigation; update immediately for same-hash clicks.
    refreshWorkspaceNavSelection();
  });
});
document.addEventListener('keydown',event=>{
  if(event.key==='Escape'&&!$('mobile-more-sheet').hidden){
    showMobileMore(false);$('mobile-more-toggle').focus();
  }
});
window.addEventListener('hashchange',refreshWorkspaceNavSelection);
window.addEventListener('resize',()=>{
  if(window.innerWidth>760 && !$('mobile-more-sheet').hidden)showMobileMore(false);
});

function calendarEvents(){
  return [
    ...calendarState.posts.map(post=>({
      type:'article',id:post.id,clientId:post.client_id,clientName:post.client_name,
      title:post.title,status:post.status,day:post.day,occursAt:post.occurs_at
    })),
    ...calendarState.research.map(job=>({
      type:'research',id:job.id,clientId:job.client_id,clientName:job.client_name,
      title:'Weekly blog research',status:job.status,day:job.day,occursAt:job.day
    }))
  ].sort((a,b)=>a.occursAt.localeCompare(b.occursAt)||a.title.localeCompare(b.title));
}
function renderCompactCalendar(){
  const month=calendarState.month,year=month.getUTCFullYear(),index=month.getUTCMonth();
  const monthKey=calendarMonthKey();
  $('calendar-month').textContent=shortMonth.format(month);
  const grid=$('calendar-day-grid');grid.replaceChildren();
  for(const name of ['M','T','W','T','F','S','S'])add(grid,'span',name,'calendar-weekday');
  const offset=(new Date(Date.UTC(year,index,1)).getUTCDay()+6)%7;
  for(let i=0;i<offset;i++)add(grid,'span','','calendar-blank');
  const all=calendarEvents();
  const counts=new Map();
  for(const item of all)counts.set(item.day,(counts.get(item.day)||0)+1);
  const last=new Date(Date.UTC(year,index+1,0)).getUTCDate();
  for(let day=1;day<=last;day++){
    const dateKey=monthKey+'-'+padDay(day);
    const box=add(grid,'button',String(day),'calendar-day');
    box.type='button';
    box.dataset.date=dateKey;
    const count=counts.get(dateKey)||0;
    if(count)box.classList.add('has-events');
    if(dateKey===todayUTC())box.classList.add('is-today');
    if(dateKey===calendarState.selectedDay)box.classList.add('is-selected');
    box.setAttribute('aria-pressed',String(dateKey===calendarState.selectedDay));
    box.setAttribute('aria-label',dateKey+': '+count+' planned item'+(count===1?'':'s'));
    if(count)add(box,'span',String(count),'calendar-day-count');
    box.addEventListener('click',()=>{
      calendarState.selectedDay=calendarState.selectedDay===dateKey?null:dateKey;
      renderCompactCalendar();
    });
  }
  const heading=$('calendar-agenda-heading'),agenda=$('calendar-upcoming');
  agenda.replaceChildren();
  let events=all;
  if(calendarState.selectedDay){
    events=all.filter(item=>item.day===calendarState.selectedDay);
    heading.textContent='On '+readableDay.format(new Date(calendarState.selectedDay+'T00:00:00Z'));
  } else {
    const key=calendarMonthKey();
    events=all.filter(item=>key<todayUTC().slice(0,7)||item.day>=todayUTC());
    heading.textContent='Next up';
  }
  if(!events.length){
    add(agenda,'p',calendarState.selectedDay?'Nothing planned for this date.':'No upcoming dated items this month. Set a planned publication date in the blog planner.','calendar-empty');
    return;
  }
  for(const item of events.slice(0,6)){
    const row=add(agenda,'article',null,'calendar-agenda-item');
    const when=add(row,'div',null,'calendar-agenda-date');
    add(when,'strong',readableDay.format(new Date(item.day+'T00:00:00Z')));
    add(when,'span',item.type==='research'?'Research week':item.status.replaceAll('-',' '));
    const content=add(row,'div',null,'calendar-agenda-detail');
    const link=add(content,'a',item.title,'calendar-agenda-link');
    link.href=item.type==='research'?'#research-queue':'#editorial';
    link.addEventListener('click',()=>{
      if(item.type==='article' && state.session?.admin && item.clientId!==state.clientId){
        const client=state.session.clients.find(c=>c.id===item.clientId);
        if(client){
          state.clientId=client.id;
          $('client-picker').value=client.id;
          loadDashboard();
        }
      }
      showMobileMore(false);
    });
    add(content,'p',item.clientName+(item.type==='article'?' · Planned article':' · Research queue'),'calendar-agenda-caption');
  }
  if(events.length>6)add(agenda,'p','+'+(events.length-6)+' more scheduled items this month.','calendar-overflow');
}
async function loadCompactCalendar(){
  if(!state.session)return;
  const admin=!!state.session.admin;
  const clientId=admin?$('calendar-client-filter').value:state.clientId;
  if(!admin&&!clientId)return;
  const ticket=++calendarState.requestNumber;
  const path='/api/calendar?month='+encodeURIComponent(calendarMonthKey())+
    (clientId?'&client='+encodeURIComponent(clientId):'');
  const message=$('calendar-message');
  message.textContent='';
  try{
    const data=await api(path);
    if(ticket!==calendarState.requestNumber)return;
    calendarState.posts=data.posts||[];
    calendarState.research=admin?(data.research||[]):[];
    renderCompactCalendar();
  }catch(err){
    if(ticket!==calendarState.requestNumber)return;
    calendarState.posts=[];calendarState.research=[];
    renderCompactCalendar();
    message.textContent='Unable to load the calendar: '+err.message;
    message.classList.add('error');
  }
}
function moveCalendarMonth(delta){
  const d=calendarState.month;
  calendarState.month=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+delta,1));
  calendarState.selectedDay=null;
  loadCompactCalendar();
}
$('calendar-prev').addEventListener('click',()=>moveCalendarMonth(-1));
$('calendar-next').addEventListener('click',()=>moveCalendarMonth(1));
$('calendar-client-filter').addEventListener('change',()=>{
  calendarState.selectedDay=null;
  loadCompactCalendar();
});
// Static empty-calendar shell before login data becomes available.
renderCompactCalendar();
