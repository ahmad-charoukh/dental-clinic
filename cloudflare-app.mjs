const SERVICES = [
 [1,"root-canal","حشو العصب","Kanal Tedavisi","Root Canal",4],
 [2,"cleaning","تنظيف الأسنان","Diş Taşı Temizliği","Dental Cleaning",1],
 [3,"whitening","تبييض الأسنان","Diş Beyazlatma","Whitening",3],
 [4,"implants","زراعة الأسنان","İmplant","Dental Implants",0],
 [5,"pediatric","طب أسنان الأطفال","Çocuk Diş Hekimliği","Pediatric Dentistry",5],
 [6,"orthodontics","تقويم الأسنان","Ortodonti","Orthodontics",2]
];

async function seed(env){
  const q=env.dr_wael_clinic_db;

  for(const s of SERVICES){
    await q.prepare(`
      INSERT OR IGNORE INTO services
      (id,slug,title_ar,title_tr,title_en,
       description_ar,description_tr,description_en,
       image,duration,sessions,price,sort_order,active)
      VALUES(?,?,?,?,?,?,?,?,?,30,1,NULL,?,1)
    `).bind(
      s[0],s[1],s[2],s[3],s[4],
      s[2],s[3],s[4],
      '/static/service-3d/'+s[1]+'.webp',
      s[5]
    ).run();
  }

  for(let d=0;d<7;d++){
    await q.prepare(`
      INSERT OR IGNORE INTO working_hours
      (weekday,enabled,start_time,end_time,break_start,break_end)
      VALUES(?,?,?,?,?,?)
    `).bind(
      d,d===6?0:1,"09:00","17:00","13:00","14:00"
    ).run();
  }
}

const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({
 "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
}[c]));

function locale(url){
 const l=url.searchParams.get("lang")||"ar";
 return ["ar","tr","en"].includes(l)?l:"ar";
}

function page(title,body,l,extra=""){
 return `<!doctype html>
<html lang="${l}" dir="${l==="ar"?"rtl":"ltr"}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Alexandria:wght@400;500;600;700;800&family=Tajawal:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/static/style.css">
${extra}
</head>
<body>${body}</body>
</html>`;
}

function timeToMin(t){
 const [h,m]=String(t).slice(0,5).split(":").map(Number);
 return h*60+m;
}

function minToTime(n){
 return String(Math.floor(n/60)).padStart(2,"0")+":"+
        String(n%60).padStart(2,"0");
}

function weekday(day){
 const x=new Date(day+"T12:00:00Z").getUTCDay();
 return (x+6)%7;
}

async function slots(env,day,service){
 const db=env.dr_wael_clinic_db;

 if(!/^\d{4}-\d{2}-\d{2}$/.test(day)) return [];

 const blocked=await db.prepare(
   "SELECT id FROM blocked_dates WHERE day=?"
 ).bind(day).first();

 if(blocked) return [];

 const svc=await db.prepare(
   "SELECT * FROM services WHERE id=? AND active=1"
 ).bind(service).first();

 if(!svc) return [];

 const wh=await db.prepare(
   "SELECT * FROM working_hours WHERE weekday=?"
 ).bind(weekday(day)).first();

 if(!wh || !Number(wh.enabled)) return [];

 const reserved=(await db.prepare(`
   SELECT starts_at
   FROM appointments
   WHERE substr(starts_at,1,10)=?
   AND status <> 'cancelled'
 `).bind(day).all()).results||[];

 const used=new Set(
   reserved.map(x=>String(x.starts_at).slice(11,16))
 );

 const result=[];
 const start=timeToMin(wh.start_time);
 const end=timeToMin(wh.end_time);
 const bs=timeToMin(wh.break_start);
 const be=timeToMin(wh.break_end);

 for(let x=start;x<end;x+=Number(svc.duration||30)){
   if(x>=bs && x<be) continue;

   const t=minToTime(x);

   if(!used.has(t))
     result.push(t);
 }

 return result;
}

async function home(env,l){
 const db=env.dr_wael_clinic_db;

 const services=(await db.prepare(`
   SELECT * FROM services
   WHERE active=1
   ORDER BY sort_order,id
 `).all()).results||[];

 const cards=services.map(s=>{
   const title=s["title_"+l]||s.title_en;

   return `
   <article class="service-card">
    <a class="service-image"
       href="/booking?lang=${l}&service=${s.id}">
     <img src="${esc(s.image)}" alt="${esc(title)}">
    </a>
    <div>
     <h3>${esc(title)}</h3>
     <a class="more"
        href="/booking?lang=${l}&service=${s.id}">
      ${l==="ar"?"احجز الآن":l==="tr"?"Randevu al":"Book now"}
     </a>
    </div>
   </article>`;
 }).join("");

 const title=l==="ar"
 ? 'ابتسامة <em>صحية</em> ..<strong>لحياة أجمل</strong>'
 :l==="tr"
 ? 'Sağlıklı bir gülüş<strong>Daha güzel bir hayat</strong>'
 : 'A healthier smile<strong>For a better life</strong>';

 return page("Dr. Wael Al-Bash",`
 <div class="premium-site">

 <header class="site-header">
  <div class="header-shell">
   <a class="brand" href="/?lang=${l}">
    <span class="brand-copy">
     <b>${l==="ar"?"د. وائل الباش":"Dr. Wael Al-Bash"}</b>
     <small>${l==="tr"?"Diş Hekimliği":l==="ar"?"طب وجراحة الفم والأسنان":"Dentistry"}</small>
    </span>
   </a>

   <div class="header-actions">
    <div class="lang-switch">
     <a href="/?lang=ar">عربي</a>
     <a href="/?lang=tr">TR</a>
     <a href="/?lang=en">EN</a>
    </div>

    <a class="btn btn-primary header-book"
       href="/booking?lang=${l}">
     ${l==="ar"?"احجز موعد":l==="tr"?"Randevu Al":"Book Appointment"}
    </a>
   </div>
  </div>
 </header>

 <main>
 <section class="hero">

  <div class="hero-doctor">
   <div class="doctor-backdrop"></div>
   <img src="/static/uploads/doctor/wael-doctor-cutout-v6.png">
  </div>

  <div class="hero-copy">
   <div class="kicker">
    DR. WAEL AL-BASH · MODERN DENTISTRY
   </div>

   <div class="hero-3d">
    <div class="tooth-glow"></div>
    <img src="/static/service-3d/hero-tooth.webp">
   </div>

   <h1>${title}</h1>

   <p>${
    l==="ar"
    ?"رعاية أسنان حديثة ومريحة مبنية على الجودة والثقة."
    :l==="tr"
    ?"Kalite ve güven odaklı modern diş hekimliği."
    :"Modern dentistry built around quality and trust."
   }</p>

   <a class="btn btn-primary"
      href="/booking?lang=${l}">
    ${l==="ar"?"احجز موعد":l==="tr"?"Randevu Al":"Book Appointment"}
   </a>
  </div>

 </section>

 <section class="services section">
  <div class="section-heading">
   <span>SERVICES</span>
   <h2>${
    l==="ar"
    ?"رعاية متكاملة لابتسامتك"
    :l==="tr"
    ?"Gülüşünüz için kapsamlı bakım"
    :"Complete care for your smile"
   }</h2>
  </div>

  <div class="service-grid">${cards}</div>
 </section>
 </main>

 </div>`,l,
 '<link rel="stylesheet" href="/static/home-v8.css?v=17">');
}

async function booking(env,l,url){
 const db=env.dr_wael_clinic_db;

 const services=(await db.prepare(`
   SELECT * FROM services
   WHERE active=1
   ORDER BY sort_order,id
 `).all()).results||[];

 const selected=url.searchParams.get("service")||"";

 const options=services.map(s=>
   `<option value="${s.id}" ${String(s.id)===selected?"selected":""}>
    ${esc(s["title_"+l]||s.title_en)}
   </option>`
 ).join("");

 return page("Booking",`
 <div class="booking-page">

 <header class="booking-header">
  <a class="booking-brand" href="/?lang=${l}">
   <span>
    <b>${l==="ar"?"د. وائل الباش":"Dr. Wael Al-Bash"}</b>
   </span>
  </a>

  <div class="booking-lang">
   <a href="/booking?lang=ar">عربي</a>
   <a href="/booking?lang=tr">TR</a>
   <a href="/booking?lang=en">EN</a>
  </div>
 </header>

 <main class="booking-layout">

 <aside class="booking-intro">
  <span class="eyebrow">APPOINTMENT</span>
  <h1>${l==="ar"?"احجز موعد":l==="tr"?"Randevu Al":"Book Appointment"}</h1>
  <div class="booking-visual">
   <img src="/static/service-3d/hero-tooth.webp">
  </div>
 </aside>

 <section class="booking-panel">

 <form id="bookingForm" class="booking-form">

  <label>
   <span>${l==="ar"?"الخدمة":l==="tr"?"Hizmet":"Service"}</span>
   <select id="service" required>
    <option value="">—</option>
    ${options}
   </select>
  </label>

  <button type="button"
          id="nearest"
          class="nearest-slot">
   ${l==="ar"?"أقرب موعد متاح":l==="tr"?"İlk uygun randevu":"Next available"}
  </button>

  <label>
   <span>${l==="ar"?"التاريخ":l==="tr"?"Tarih":"Date"}</span>
   <input id="day" type="date" required>
  </label>

  <div class="slot-field">
   <span>${l==="ar"?"الوقت":l==="tr"?"Saat":"Time"}</span>
   <div id="slots" class="slots"></div>
   <input id="time" type="hidden" required>
  </div>

  <div class="two">
   <label>
    <span>${l==="ar"?"الاسم الكامل":l==="tr"?"Ad Soyad":"Full name"}</span>
    <input id="name" required>
   </label>

   <label>
    <span>${l==="ar"?"الهاتف":l==="tr"?"Telefon":"Phone"}</span>
    <input id="phone" required>
   </label>
  </div>

  <div class="two">
   <label>
    <span>${l==="ar"?"رقم الهوية":l==="tr"?"T.C. Kimlik No / Yabancı Kimlik No":"ID No"}</span>
    <input id="identity_no"
           maxlength="11"
           pattern="[0-9]{11}"
           required>
   </label>

   <label>
    <span>${l==="ar"?"تاريخ الميلاد":l==="tr"?"Doğum Tarihi":"Birth date"}</span>
    <input id="birth_date"
           type="date"
           required>
   </label>
  </div>

  <label>
   <span>${l==="ar"?"ملاحظات":l==="tr"?"Notlar":"Notes"}</span>
   <textarea id="notes"></textarea>
  </label>

  <div id="bookingSummary"
       class="booking-summary"
       hidden></div>

  <button class="submit-booking"
          type="submit">
   ${l==="ar"?"إرسال طلب الحجز":l==="tr"?"Randevu isteği gönder":"Send booking request"}
  </button>

  <div id="msg" class="form-msg"></div>

 </form>

 </section>
 </main>
 </div>

 <script>window.WAEL_LOCALE="${l}"</script>
 <script src="/static/booking-v8.js?v=3" defer></script>
 `,l,
 '<link rel="stylesheet" href="/static/booking-v8.css?v=2">');
}

async function createBooking(env,p){
 const db=env.dr_wael_clinic_db;

 const available=await slots(
   env,
   String(p.day||""),
   Number(p.service_id)
 );

 if(!available.includes(String(p.time||"")))
   return Response.json(
     {detail:"slot_unavailable"},
     {status:409}
   );

 const identity=String(p.identity_no||"").trim();

 if(!/^\d{11}$/.test(identity))
   return Response.json(
     {detail:"invalid_data"},
     {status:422}
   );

 let patient=await db.prepare(
   "SELECT id FROM patients WHERE identity_no=?"
 ).bind(identity).first();

 const now=new Date().toISOString()
   .replace("T"," ")
   .slice(0,19);

 let patientId;

 if(patient){
   patientId=patient.id;
 }else{
   const r=await db.prepare(`
     INSERT INTO patients
     (name,phone,email,identity_no,birth_date,created_at)
     VALUES(?,?,'',?,?,?)
   `).bind(
     String(p.name||""),
     String(p.phone||""),
     identity,
     String(p.birth_date||""),
     now
   ).run();

   patientId=r.meta.last_row_id;
 }

 try{
   const r=await db.prepare(`
     INSERT INTO appointments
     (patient_id,service_id,starts_at,slot_key,status,notes,locale,created_at)
     VALUES(?,?,?,?,?,?,?,?)
   `).bind(
     patientId,
     Number(p.service_id),
     `${p.day} ${p.time}:00`,
     `${p.day}T${p.time}`,
     "pending",
     String(p.notes||""),
     String(p.locale||"ar"),
     now
   ).run();

   return Response.json({
     ok:true,
     id:r.meta.last_row_id
   });

 }catch(e){
   return Response.json(
     {detail:"slot_unavailable"},
     {status:409}
   );
 }
}

export default {
 async fetch(request,env){
  const url=new URL(request.url);
  const path=url.pathname;

  try{
   if(path.startsWith("/static/"))
     return env.ASSETS.fetch(request);

   await seed(env);

   const l=locale(url);

   if(request.method==="GET" && path==="/")
     return new Response(
       await home(env,l),
       {headers:{"content-type":"text/html;charset=utf-8"}}
     );

   if(request.method==="GET" && path==="/booking")
     return new Response(
       await booking(env,l,url),
       {headers:{"content-type":"text/html;charset=utf-8"}}
     );

   if(request.method==="GET" &&
      path==="/api/availability")
     return Response.json({
       slots:await slots(
         env,
         url.searchParams.get("day"),
         Number(url.searchParams.get("service_id"))
       )
     });

   if(request.method==="GET" &&
      path==="/api/availability/nearest"){

     const sid=Number(
       url.searchParams.get("service_id")
     );

     const today=new Date();

     for(let i=0;i<30;i++){
       const d=new Date(today);
       d.setDate(d.getDate()+i);

       const day=
         d.getFullYear()+"-"+
         String(d.getMonth()+1).padStart(2,"0")+"-"+
         String(d.getDate()).padStart(2,"0");

       const s=await slots(env,day,sid);

       if(s.length)
         return Response.json({
           day,
           time:s[0]
         });
     }

     return Response.json({
       day:null,
       time:null
     });
   }

   if(request.method==="POST" &&
      path==="/api/bookings")
     return createBooking(
       env,
       await request.json()
     );

   const m=path.match(
     /^\/booking\/confirmation\/(\d+)$/
   );

   if(m){
     return new Response(
       page("Appointment",`
        <main class="center">
         <div class="confirm card">
          <div class="check">✓</div>
          <h1>تم استلام طلب الموعد</h1>
          <p>رقم الطلب #${m[1]}</p>
          <a class="btn" href="/">العودة للرئيسية</a>
         </div>
        </main>
       `,l),
       {headers:{"content-type":"text/html;charset=utf-8"}}
     );
   }

   return env.ASSETS.fetch(request);

  }catch(e){
   return new Response(
     "Worker error: "+e.message,
     {status:500}
   );
  }
 }
};
