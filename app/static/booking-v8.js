(() => {
 const service=document.querySelector('#service'),day=document.querySelector('#day'),slots=document.querySelector('#slots'),tm=document.querySelector('#time'),form=document.querySelector('#bookingForm'),msg=document.querySelector('#msg'),submit=form?.querySelector('button[type=submit]');
 if(!form)return; const today=new Date(),todayText=`${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;day.min=todayText;const birth=document.querySelector('#birth_date');if(birth)birth.max=todayText;
 const locale=window.WAEL_LOCALE||'ar';
 const words={ar:['اختر الخدمة والتاريخ أولًا','جارٍ تحميل الأوقات…','لا توجد أوقات متاحة','تعذر تحميل الأوقات','اختر الوقت المتاح','الوقت أصبح غير متاح، اختر وقتًا آخر','تحقق من البيانات','تعذر إرسال الطلب. حاول مجددًا.','اختر الخدمة أولًا','لا يوجد موعد خلال 30 يومًا','ملخص طلب الحجز'],tr:['Önce hizmet ve tarih seçin','Saatler yükleniyor…','Uygun saat bulunamadı','Saatler yüklenemedi','Uygun bir saat seçin','Bu saat artık uygun değil','Bilgilerinizi kontrol edin','Gönderilemedi. Tekrar deneyin.','Önce hizmet seçin','30 gün içinde uygun saat yok','Randevu özeti'],en:['Choose a service and date first','Loading available times…','No times available','Unable to load times','Choose an available time','This time is no longer available','Check your details','Unable to send. Please try again.','Choose a service first','No availability in the next 30 days','Booking request summary']}[locale];
 const summary=document.querySelector('#bookingSummary'),nearest=document.querySelector('#nearest');let requestId=0;
 const steps=[...document.querySelectorAll('.step')]; const update=()=>{let cur=1;if(service.value)cur=2;if(service.value&&day.value)cur=3;if(tm.value)cur=4;summary.hidden=!tm.value;if(tm.value)summary.textContent=`${words[10]}: ${service.selectedOptions[0].textContent} — ${day.value} · ${tm.value}`;steps.forEach((x,i)=>{x.classList.toggle('active',i+1===cur);x.classList.toggle('done',i+1<cur)})};
 async function load(preselect='') {
  const id=++requestId;tm.value='';update();
  const info=text=>{slots.replaceChildren();const p=document.createElement('p');p.className='muted';p.textContent=text;slots.append(p)};
  if(!service.value||!day.value){info(words[0]);return}info(words[1]);
  try{const r=await fetch(`/api/availability?day=${day.value}&service_id=${service.value}`);if(!r.ok)throw Error();const d=await r.json();if(id!==requestId)return;
    slots.replaceChildren();if(!d.slots.length)info(words[2]);
    d.slots.forEach(time=>{const button=document.createElement('button');button.type='button';button.textContent=time;button.setAttribute('aria-pressed','false');
      button.onclick=()=>{slots.querySelectorAll('button').forEach(b=>{b.classList.remove('selected');b.setAttribute('aria-pressed','false')});button.classList.add('selected');button.setAttribute('aria-pressed','true');tm.value=time;update()};slots.append(button);if(preselect===time)button.click()});
  }catch{if(id===requestId)info(words[3])}
 }
 nearest?.addEventListener('click',async()=>{
  if(!service.value){msg.textContent=words[8];service.focus();return}
  nearest.disabled=true;const chosen=service.value;const id=++requestId;tm.value='';update();msg.textContent=words[1];
  try{const r=await fetch(`/api/availability/nearest?service_id=${chosen}`);if(!r.ok)throw Error();const d=await r.json();if(chosen!==service.value||id!==requestId)return;
    if(!d.day){msg.textContent=words[9];return}day.value=d.day;msg.textContent='';await load(d.time);
  }catch{msg.textContent=words[3]}finally{nearest.disabled=false}
 });
 service.addEventListener('change',load);day.addEventListener('change',load);if(service.value)update();
 form.addEventListener('submit',async e=>{e.preventDefault();msg.textContent='';if(!tm.value){msg.textContent=words[4];return}submit.disabled=true;const body={service_id:+service.value,day:day.value,time:tm.value,name:document.querySelector('#name').value,phone:document.querySelector('#phone').value,identity_no:document.querySelector('#identity_no').value,birth_date:document.querySelector('#birth_date').value,notes:document.querySelector('#notes').value,locale:window.WAEL_LOCALE||'ar'};try{const r=await fetch('/api/bookings',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}),d=await r.json();if(r.ok)location.href=`/booking/confirmation/${d.id}?lang=${window.WAEL_LOCALE||'ar'}`;else{msg.textContent=d.detail==='slot_unavailable'?words[5]:words[6];load()}}catch{msg.textContent=words[7]}finally{submit.disabled=false}});
})();
