import { getDatabase } from "@netlify/database";
import { getStore } from "@netlify/blobs";
import nunjucks from "nunjucks";
import { createHmac, randomBytes, scryptSync, timingSafeEqual, randomUUID } from "node:crypto";
import { resolve } from "node:path";

nunjucks.installJinjaCompat();
const env = nunjucks.configure(resolve(process.cwd(), "app/templates"), {
  autoescape: true,
  noCache: true,
});

const db = getDatabase();
const SECRET = process.env.APP_SECRET || "dev-only-change-this-secret";
const BASE_URL = process.env.BASE_URL || process.env.URL || "http://localhost:8888";
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || "admin@waelbash.local").toLowerCase();
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "ChangeMe!123";
const MAX_UPLOAD = Number(process.env.MAX_UPLOAD_MB || 10) * 1024 * 1024;
const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf", "video/mp4"]);
const BLOCKING_STATUSES = new Set(["pending", "confirmed", "rescheduled", "completed", "no_show"]);

const I18N = {
  ar: {dir:"rtl",home:"الرئيسية",about:"عن الطبيب",services:"الخدمات",cases:"الحالات",reviews:"آراء المرضى",articles:"المقالات",faq:"الأسئلة الشائعة",contact:"تواصل معنا",book:"احجز موعد",whatsapp:"تواصل عبر واتساب",hero:"ابتسامة صحية .. لحياة أجمل",sub:"رعاية أسنان حديثة ومريحة مبنية على الجودة والثقة.",choose:"اختر الخدمة",date:"اختر التاريخ",time:"الوقت المتاح",name:"الاسم الكامل",phone:"الهاتف",email:"البريد الإلكتروني",notes:"ملاحظات",submit:"إرسال طلب الحجز"},
  tr: {dir:"ltr",home:"Ana Sayfa",about:"Hakkında",services:"Hizmetler",cases:"Vakalar",reviews:"Yorumlar",articles:"Makaleler",faq:"SSS",contact:"İletişim",book:"Randevu Al",whatsapp:"WhatsApp",hero:"Sağlıklı gülüş, daha güzel bir hayat",sub:"Kalite ve güven odaklı modern, konforlu diş hekimliği.",choose:"Hizmet seçin",date:"Tarih seçin",time:"Uygun saat",name:"Ad Soyad",phone:"Telefon",email:"E-posta",notes:"Notlar",submit:"Randevu isteği gönder"},
  en: {dir:"ltr",home:"Home",about:"About",services:"Services",cases:"Cases",reviews:"Reviews",articles:"Articles",faq:"FAQ",contact:"Contact",book:"Book Appointment",whatsapp:"WhatsApp",hero:"A healthy smile for a better life",sub:"Modern, comfortable dentistry built around quality and trust.",choose:"Choose service",date:"Choose date",time:"Available time",name:"Full name",phone:"Phone",email:"Email",notes:"Notes",submit:"Send booking request"}
};

const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Content-Security-Policy": "default-src 'self'; img-src 'self' data: https://*.openstreetmap.org; media-src 'self' https: blob:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' data: https://fonts.gstatic.com; script-src 'self' 'unsafe-inline'; connect-src 'self'; frame-src https://www.youtube.com https://player.vimeo.com; frame-ancestors 'none'"
};

function withSecurity(response) {
  const h = new Headers(response.headers);
  for (const [k,v] of Object.entries(SECURITY_HEADERS)) h.set(k,v);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers: h });
}
function html(body, status=200, extra={}) {
  return withSecurity(new Response(body, { status, headers: {"content-type":"text/html; charset=utf-8", ...extra} }));
}
function json(data, status=200) {
  return withSecurity(Response.json(data, {status}));
}
function redirect(location, status=303, extra={}) {
  return withSecurity(new Response(null, {status, headers:{Location:location, ...extra}}));
}
function parseCookies(req) {
  const out = {};
  const raw = req.headers.get("cookie") || "";
  for (const p of raw.split(";")) {
    const i = p.indexOf("="); if (i < 0) continue;
    out[p.slice(0,i).trim()] = decodeURIComponent(p.slice(i+1).trim());
  }
  return out;
}
function lang(req, url) {
  const x = url.searchParams.get("lang") || parseCookies(req).lang || "ar";
  return I18N[x] ? x : "ar";
}
function cookie(name, value, opts={}) {
  let s = `${name}=${encodeURIComponent(value)}; Path=/`;
  if (opts.maxAge) s += `; Max-Age=${opts.maxAge}`;
  if (opts.httpOnly) s += "; HttpOnly";
  if (opts.sameSite) s += `; SameSite=${opts.sameSite}`;
  if (opts.secure) s += "; Secure";
  if (opts.expires) s += `; Expires=${opts.expires.toUTCString()}`;
  return s;
}
function signSession(uid) {
  const exp = Math.floor(Date.now()/1000) + 43200;
  const payload = `${uid}.${exp}`;
  const sig = createHmac("sha256", SECRET).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}
function verifySession(token) {
  try {
    const [uid, exp, sig] = token.split(".");
    if (!uid || !exp || !sig || Number(exp) < Math.floor(Date.now()/1000)) return null;
    const expected = createHmac("sha256", SECRET).update(`${uid}.${exp}`).digest("base64url");
    const a=Buffer.from(sig), b=Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a,b)) return null;
    return Number(uid);
  } catch { return null; }
}
function hashPassword(p) {
  const salt = randomBytes(16);
  const key = scryptSync(p, salt, 32, {N:16384, r:8, p:1, maxmem:64*1024*1024});
  return `scrypt$${salt.toString("hex")}$${key.toString("hex")}`;
}
function verifyPassword(p, encoded) {
  try {
    const [kind, sh, kh] = String(encoded||"").split("$");
    if (kind !== "scrypt") return false;
    const salt = Buffer.from(sh,"hex"), expected=Buffer.from(kh,"hex");
    const actual=scryptSync(p,salt,32,{N:16384,r:8,p:1,maxmem:64*1024*1024});
    return actual.length===expected.length && timingSafeEqual(actual,expected);
  } catch { return false; }
}
function formatDate(value, fmt="%Y-%m-%d %H:%M") {
  if (!value) return "";
  const d = value instanceof Date ? value : new Date(String(value).replace(" ","T") + (String(value).includes("Z") ? "" : "Z"));
  if (Number.isNaN(d.getTime())) return String(value);
  const parts = new Intl.DateTimeFormat("en-CA", {timeZone:"Europe/Istanbul", year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hour12:false}).formatToParts(d);
  const m=Object.fromEntries(parts.map(x=>[x.type,x.value]));
  if (fmt === "%Y-%m-%d") return `${m.year}-${m.month}-${m.day}`;
  return `${m.year}-${m.month}-${m.day} ${m.hour}:${m.minute}`;
}
function dateProxy(value){ return { strftime:(fmt)=>formatDate(value,fmt), raw:value }; }
function localNow() {
  const parts=new Intl.DateTimeFormat("en-CA",{timeZone:"Europe/Istanbul",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hour12:false,weekday:"short"}).formatToParts(new Date());
  return Object.fromEntries(parts.map(x=>[x.type,x.value]));
}
function cleanPath(url) {
  let p=url.pathname;
  const prefix="/.netlify/functions/app";
  if (p.startsWith(prefix)) p=p.slice(prefix.length) || "/";
  if (!p.startsWith("/")) p="/"+p;
  return p.replace(/\/{2,}/g,"/");
}
function slugify(s) {
  const base=String(s||"").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"") || "item";
  return `${base}-${randomBytes(2).toString("hex")}`;
}
async function query(sql, params=[]) { return (await db.pool.query(sql, params)).rows; }
async function one(sql, params=[]) { return (await query(sql,params))[0] || null; }
async function settingsDict() {
  const rows=await query('SELECT "key", value FROM site_settings');
  return Object.fromEntries(rows.map(r=>[r.key,r.value]));
}
async function currentUser(req) {
  const uid=verifySession(parseCookies(req).wael_session || "");
  if (!uid) return null;
  return one("SELECT * FROM users WHERE id=$1 AND active=TRUE",[uid]);
}
async function requireAdmin(req) {
  const u=await currentUser(req);
  if (!u || !["admin","doctor","assistant","receptionist"].includes(u.role)) return null;
  return u;
}
function serviceView(x,l){return {id:x.id,slug:x.slug,title:x[`title_${l}`],description:x[`description_${l}`],duration:x.duration,sessions:x.sessions,price:x.price,image:x.image};}
function apptView(r){return {...r,starts_at:dateProxy(r.starts_at),patient:{name:r.patient_name,phone:r.patient_phone,email:r.patient_email},service:{id:r.service_id,title_ar:r.service_title_ar,title_en:r.service_title_en,slug:r.service_slug}};}
function noteView(r){return {...r,created_at:dateProxy(r.created_at)};}
function render(name, ctx={}) { return env.render(name,ctx); }
function isPhone(v){return /^[+0-9 ()-]{7,25}$/.test(String(v||""));}
function minutes(t){ const [h,m]=String(t||"00:00").slice(0,5).split(":").map(Number); return h*60+m; }
function hhmm(total){ return `${String(Math.floor(total/60)).padStart(2,"0")}:${String(total%60).padStart(2,"0")}`; }
function slotKey(day,t){ return `${day.replaceAll("-","")}${String(t).replace(":","")}`; }
function weekdayPython(day){ const d=new Date(`${day}T12:00:00Z`); return (d.getUTCDay()+6)%7; }

async function availableSlots(day, serviceId) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return [];
  const now=localNow(), today=`${now.year}-${now.month}-${now.day}`;
  if (day < today) return [];
  if (await one("SELECT id FROM blocked_dates WHERE day=$1",[day])) return [];
  const wh=await one("SELECT * FROM working_hours WHERE weekday=$1",[weekdayPython(day)]);
  const svc=await one("SELECT * FROM services WHERE id=$1 AND active=TRUE",[serviceId]);
  if (!wh || !wh.enabled || !svc) return [];
  const reservedRows=await query("SELECT slot_key FROM appointments WHERE slot_key IS NOT NULL AND starts_at::date=$1::date AND status = ANY($2::text[])",[day,[...BLOCKING_STATUSES]]);
  const reserved=new Set(reservedRows.map(x=>x.slot_key));
  const start=minutes(wh.start_time), end=minutes(wh.end_time), step=Math.max(10,Number(svc.duration||30));
  const bs=wh.break_start ? minutes(wh.break_start):null, be=wh.break_end?minutes(wh.break_end):null;
  const out=[];
  const nowMin=Number(now.hour)*60+Number(now.minute)+30;
  for(let cur=start; cur+step<=end; cur+=step){
    const t=hhmm(cur); const inBreak=bs!==null&&be!==null&&cur>=bs&&cur<be;
    if(!inBreak && !reserved.has(slotKey(day,t)) && (day>today || cur>nowMin)) out.push(t);
  }
  return out;
}
async function audit(action, entity, entityId="", detail="", actor="system") {
  await db.pool.query("INSERT INTO audit_logs(actor,action,entity,entity_id,detail,created_at) VALUES($1,$2,$3,$4,$5,NOW())",[actor,action,entity,String(entityId),detail]);
}
async function sendEmail(to, subject, htmlBody) {
  if(!to) return;
  const api=process.env.RESEND_API_KEY || "";
  if(!api){ await db.pool.query("INSERT INTO email_logs(recipient,subject,status,provider_id,error,created_at) VALUES($1,$2,'configuration_required','',$3,NOW())",[to,subject,"RESEND_API_KEY missing"]); return; }
  try{
    const r=await fetch("https://api.resend.com/emails",{method:"POST",headers:{Authorization:`Bearer ${api}`,"Content-Type":"application/json"},body:JSON.stringify({from:process.env.EMAIL_FROM||"Appointments <onboarding@resend.dev>",to:[to],subject,html:htmlBody})});
    const d=await r.json().catch(()=>({}));
    if(!r.ok) throw new Error(d.message||`HTTP ${r.status}`);
    await db.pool.query("INSERT INTO email_logs(recipient,subject,status,provider_id,error,created_at) VALUES($1,$2,'sent',$3,'',NOW())",[to,subject,d.id||""]);
  }catch(e){ await db.pool.query("INSERT INTO email_logs(recipient,subject,status,provider_id,error,created_at) VALUES($1,$2,'failed','',$3,NOW())",[to,subject,String(e).slice(0,500)]); }
}
function emailText(locale,status,appt){
  const dicts={ar:{pending:"تم استلام طلب موعدك",confirmed:"تم تأكيد موعدك",rejected:"تعذر قبول الموعد",cancelled:"تم إلغاء الموعد",rescheduled:"تم تعديل موعدك"},tr:{pending:"Randevu talebiniz alındı",confirmed:"Randevunuz onaylandı",rejected:"Randevu talebi kabul edilemedi",cancelled:"Randevunuz iptal edildi",rescheduled:"Randevunuz güncellendi"},en:{pending:"Booking request received",confirmed:"Appointment confirmed",rejected:"Appointment request declined",cancelled:"Appointment cancelled",rescheduled:"Appointment rescheduled"}};
  const l=dicts[locale]?locale:"ar", subj=dicts[l][status]||"Appointment update";
  const body=`<h2>${subj}</h2><p>${formatDate(appt.starts_at)}</p><p>${appt.service_title_en||""}</p><p><a href="${BASE_URL}/booking?lang=${l}">Book another appointment</a></p>`;
  return [subj,body];
}

let bootstrapped=false;
async function ensureBootstrap(){
  if(bootstrapped) return;
  const u=await one("SELECT id FROM users LIMIT 1");
  if(!u){ await db.pool.query("INSERT INTO users(email,password_hash,role,active,created_at) VALUES($1,$2,'admin',TRUE,NOW())",[ADMIN_EMAIL,hashPassword(ADMIN_PASSWORD)]); }
  bootstrapped=true;
}

async function handle(req) {
  await ensureBootstrap();
  const url=new URL(req.url), path=cleanPath(url), method=req.method.toUpperCase();

  if(method==="GET" && path==="/"){
    const l=lang(req,url);
    const [services,cases,arts,reviews,faqs,settings]=await Promise.all([
      query("SELECT * FROM services WHERE active=TRUE ORDER BY sort_order,id"),
      query("SELECT * FROM clinical_cases WHERE status='published' ORDER BY id DESC LIMIT 6"),
      query("SELECT * FROM articles WHERE published=TRUE ORDER BY id DESC LIMIT 3"),
      query("SELECT * FROM reviews WHERE published=TRUE ORDER BY id DESC LIMIT 6"),
      query("SELECT * FROM faq WHERE published=TRUE ORDER BY sort_order,id"),settingsDict()
    ]);
    for(const r of reviews) r.stars="★".repeat(Math.max(0,Math.min(5,Number(r.rating||0))));
    const body=render("home.html",{l,t:I18N[l],services:services.map(x=>serviceView(x,l)),cases,settings,articles:arts,reviews,faqs});
    return html(body,200,{"Set-Cookie":cookie("lang",l,{maxAge:31536000,sameSite:"Lax"})});
  }

  if(method==="GET" && path==="/booking"){
    const l=lang(req,url), [services,settings]=await Promise.all([query("SELECT * FROM services WHERE active=TRUE ORDER BY sort_order,id"),settingsDict()]);
    const selected_service_id=Number(url.searchParams.get("service")||0);
    return html(render("booking.html",{l,t:I18N[l],services:services.map(x=>serviceView(x,l)),settings,selected_service_id}),200,{"Set-Cookie":cookie("lang",l,{maxAge:31536000,sameSite:"Lax"})});
  }

  if(method==="GET" && path==="/api/availability"){
    const day=url.searchParams.get("day")||"", serviceId=Number(url.searchParams.get("service_id")||0);
    return json({slots:await availableSlots(day,serviceId)});
  }

  if(method==="POST" && path==="/api/bookings"){
    let p; try{p=await req.json();}catch{return json({detail:"invalid_json"},422);}
    const serviceId=Number(p.service_id), day=String(p.day||""), tm=String(p.time||""), name=String(p.name||"").trim(), phone=String(p.phone||"").trim(), email=String(p.email||"").trim(), notes=String(p.notes||""), locale=I18N[p.locale]?p.locale:"ar";
    if(name.length<2 || !isPhone(phone) || !/^\d{4}-\d{2}-\d{2}$/.test(day) || !/^\d{2}:\d{2}$/.test(tm)) return json({detail:"invalid_data"},422);
    const svc=await one("SELECT * FROM services WHERE id=$1 AND active=TRUE",[serviceId]); if(!svc) return json({detail:"service"},404);
    const slots=await availableSlots(day,serviceId); if(!slots.includes(tm)) return json({detail:"slot_unavailable"},409);
    const client=await db.pool.connect(); let appt;
    try{
      await client.query("BEGIN");
      let pr=(await client.query("SELECT * FROM patients WHERE phone=$1 ORDER BY id LIMIT 1",[phone])).rows[0];
      if(!pr) pr=(await client.query("INSERT INTO patients(name,phone,email,created_at) VALUES($1,$2,$3,NOW()) RETURNING *",[name,phone,email])).rows[0];
      else await client.query("UPDATE patients SET name=$1,email=CASE WHEN $2<>'' THEN $2 ELSE email END WHERE id=$3",[name,email,pr.id]);
      const starts=`${day} ${tm}:00`;
      appt=(await client.query("INSERT INTO appointments(patient_id,service_id,starts_at,slot_key,status,notes,locale,created_at) VALUES($1,$2,$3,$4,'pending',$5,$6,NOW()) RETURNING *",[pr.id,serviceId,starts,slotKey(day,tm),notes,locale])).rows[0];
      await client.query("INSERT INTO audit_logs(actor,action,entity,entity_id,detail,created_at) VALUES('public','appointment.created','appointment',$1,$2,NOW())",[String(appt.id),`${starts} ${svc.slug}`]);
      await client.query("COMMIT");
      const [subj,body]=emailText(locale,"pending",{...appt,service_title_en:svc.title_en}); await sendEmail(email,subj,body);
      return json({ok:true,id:appt.id,status:appt.status,starts_at:appt.starts_at});
    }catch(e){ await client.query("ROLLBACK").catch(()=>{}); if(e?.code==="23505") return json({detail:"slot_unavailable"},409); throw e; } finally{client.release();}
  }

  let m=path.match(/^\/booking\/confirmation\/(\d+)$/);
  if(method==="GET" && m){
    const r=await one("SELECT a.*,s.title_ar AS service_title_ar,s.title_en AS service_title_en,s.slug AS service_slug FROM appointments a JOIN services s ON s.id=a.service_id WHERE a.id=$1",[Number(m[1])]);
    if(!r) return render404(req,url);
    const l=lang(req,url), a={...r,starts_at:dateProxy(r.starts_at),service:{title_ar:r.service_title_ar,title_en:r.service_title_en,slug:r.service_slug}};
    return html(render("confirmation.html",{a,l,t:I18N[l],settings:await settingsDict()}));
  }

  if(method==="POST" && path==="/contact"){
    const f=await req.formData(), name=String(f.get("name")||"").trim(), email=String(f.get("email")||"").trim(), phone=String(f.get("phone")||"").trim(), body=String(f.get("body")||"").trim();
    if(body.length<5) return html(render("error.html",{code:422,message:"تحقق من الرسالة"}),422);
    await db.pool.query("INSERT INTO messages(name,email,phone,body,created_at) VALUES($1,$2,$3,$4,NOW())",[name,email,phone,body]); return redirect("/?sent=1");
  }

  if(method==="GET" && path==="/admin/login") return html(render("login.html",{error:null,l:"ar",t:I18N.ar}));
  if(method==="POST" && path==="/admin/login"){
    const f=await req.formData(), email=String(f.get("email")||"").toLowerCase().trim(), password=String(f.get("password")||"");
    const u=await one("SELECT * FROM users WHERE email=$1",[email]);
    if(!u || !verifyPassword(password,u.password_hash)) return html(render("login.html",{error:"بيانات الدخول غير صحيحة",l:"ar",t:I18N.ar}),401);
    const tok=signSession(u.id); return redirect("/admin",303,{"Set-Cookie":cookie("wael_session",tok,{maxAge:43200,httpOnly:true,sameSite:"Strict",secure:true})});
  }
  if(method==="POST" && path==="/admin/logout") return redirect("/admin/login",303,{"Set-Cookie":cookie("wael_session","",{httpOnly:true,sameSite:"Strict",secure:true,expires:new Date(0)})});

  if(path.startsWith("/admin")){
    const u=await requireAdmin(req); if(!u) return redirect("/admin/login",303);

    if(method==="GET" && path==="/admin"){
      const today=localNow(); const d=`${today.year}-${today.month}-${today.day}`;
      const [statToday,statPatients,statPending,statMessages,appts0,patients,services,cases,media,messages,reviews,faqs,articles,settings]=await Promise.all([
        one("SELECT COUNT(*)::int AS n FROM appointments WHERE starts_at::date=$1::date",[d]),one("SELECT COUNT(*)::int AS n FROM patients"),one("SELECT COUNT(*)::int AS n FROM appointments WHERE status='pending'"),one("SELECT COUNT(*)::int AS n FROM messages"),
        query("SELECT a.*,p.name patient_name,p.phone patient_phone,p.email patient_email,s.title_ar service_title_ar,s.title_en service_title_en,s.slug service_slug FROM appointments a JOIN patients p ON p.id=a.patient_id JOIN services s ON s.id=a.service_id ORDER BY a.starts_at DESC LIMIT 50"),
        query("SELECT * FROM patients ORDER BY id DESC LIMIT 50"),query("SELECT * FROM services ORDER BY sort_order,id"),query("SELECT * FROM clinical_cases ORDER BY id DESC"),query("SELECT * FROM media ORDER BY id DESC LIMIT 50"),query("SELECT * FROM messages ORDER BY id DESC LIMIT 30"),query("SELECT * FROM reviews ORDER BY id DESC"),query("SELECT * FROM faq ORDER BY sort_order,id"),query("SELECT * FROM articles ORDER BY id DESC"),settingsDict()
      ]);
      return html(render("admin.html",{u,stats:{today:statToday.n,patients:statPatients.n,pending:statPending.n,messages:statMessages.n},appts:appts0.map(apptView),patients,services,cases,media,messages,settings,reviews,faqs,articles}));
    }

    m=path.match(/^\/admin\/appointments\/(\d+)\/status$/);
    if(method==="POST" && m){
      const aid=Number(m[1]), f=await req.formData(), status=String(f.get("status")||""), allowed=new Set(["confirmed","rejected","rescheduled","completed","cancelled","no_show"]); if(!allowed.has(status)) return json({detail:"invalid_status"},422);
      const a=await one("SELECT a.*,p.email patient_email,s.title_en service_title_en FROM appointments a JOIN patients p ON p.id=a.patient_id JOIN services s ON s.id=a.service_id WHERE a.id=$1",[aid]); if(!a) return render404(req,url);
      let starts=a.starts_at, sk=a.slot_key;
      if(status==="rescheduled"){
        const nd=String(f.get("new_day")||""), nt=String(f.get("new_time")||""); if(!/^\d{4}-\d{2}-\d{2}$/.test(nd)||!/^\d{2}:\d{2}$/.test(nt)) return json({detail:"new slot"},422);
        const slots=await availableSlots(nd,a.service_id); if(!slots.includes(nt)) return json({detail:"slot_unavailable"},409); starts=`${nd} ${nt}:00`; sk=slotKey(nd,nt);
      } else if(["rejected","cancelled"].includes(status)) sk=null; else { const d=formatDate(a.starts_at).replace(/[- :]/g,""); sk=d.slice(0,12); }
      try{ await db.pool.query("UPDATE appointments SET status=$1,starts_at=$2,slot_key=$3 WHERE id=$4",[status,starts,sk,aid]); }catch(e){ if(e?.code==="23505") return json({detail:"slot already reserved"},409); throw e; }
      await audit("appointment.status_changed","appointment",aid,status,u.email); const [subj,body]=emailText(a.locale,status,{...a,starts_at:starts}); await sendEmail(a.patient_email,subj,body); return redirect("/admin#appointments");
    }

    if(method==="POST" && path==="/admin/services"){
      const f=await req.formData(); const vals=["title_ar","title_tr","title_en","description_ar","description_tr","description_en"].map(k=>String(f.get(k)||"")); const duration=Math.max(10,Number(f.get("duration")||30)), price=String(f.get("price")||"").trim();
      const max=await one("SELECT COALESCE(MAX(sort_order),0)::int AS n FROM services");
      const r=await one("INSERT INTO services(slug,title_ar,title_tr,title_en,description_ar,description_tr,description_en,image,duration,sessions,price,sort_order,active) VALUES($1,$2,$3,$4,$5,$6,$7,'',$8,1,$9,$10,TRUE) RETURNING id",[slugify(vals[2]),...vals,duration,price?Number(price):null,max.n+1]); await audit("service.created","service",r.id,vals[0],u.email); return redirect("/admin#services");
    }
    m=path.match(/^\/admin\/services\/(\d+)\/toggle$/);
    if(method==="POST" && m){ const sid=Number(m[1]); const r=await one("UPDATE services SET active=NOT active WHERE id=$1 RETURNING active",[sid]); if(!r)return render404(req,url); await audit("service.toggled","service",sid,String(r.active),u.email); return redirect("/admin#services"); }

    if(method==="POST" && path==="/admin/settings"){
      const f=await req.formData(); const keys=["hero_title_ar","hero_title_tr","hero_title_en","hero_subtitle_ar","hero_subtitle_tr","hero_subtitle_en","hero_image","phone","whatsapp","email","address_ar","address_tr","address_en","about_ar","about_tr","about_en","video_title_ar","video_title_tr","video_title_en","video_subtitle_ar","video_subtitle_tr","video_subtitle_en","video_url","video_poster"];
      const vals={}; for(const k of keys) vals[k]=String(f.get(k)||""); vals.video_enabled=f.get("video_enabled")?"1":"0";
      const client=await db.pool.connect(); try{await client.query("BEGIN"); for(const [k,v] of Object.entries(vals)) await client.query('INSERT INTO site_settings("key",value) VALUES($1,$2) ON CONFLICT("key") DO UPDATE SET value=EXCLUDED.value',[k,v]); await client.query("COMMIT");}catch(e){await client.query("ROLLBACK");throw e;}finally{client.release();}
      await audit("site.settings_updated","site","settings",JSON.stringify(vals),u.email); return redirect("/admin#cms");
    }

    if(method==="POST" && path==="/admin/media"){
      const f=await req.formData(), category=String(f.get("category")||"General").slice(0,80), file=f.get("file");
      if(!file || typeof file.arrayBuffer !== "function") return json({detail:"file required"},422); if(!ALLOWED_MIME.has(file.type)) return json({detail:"unsupported file"},415); if(file.size>MAX_UPLOAD)return json({detail:"file too large"},413);
      const ext={"image/jpeg":"jpg","image/png":"png","image/webp":"webp","application/pdf":"pdf","video/mp4":"mp4"}[file.type], key=`${randomUUID()}.${ext}`; const store=getStore("media-uploads"); await store.set(key,file,{metadata:{mime:file.type,filename:file.name||key}});
      const p=`/media/${key}`; const row=await one("INSERT INTO media(filename,path,mime,category,created_at) VALUES($1,$2,$3,$4,NOW()) RETURNING id",[(file.name||key).slice(0,255),p,file.type,category]); await audit("media.uploaded","media",row.id,file.name||key,u.email); return redirect("/admin#media");
    }

    m=path.match(/^\/admin\/patients\/(\d+)\/note$/);
    if(method==="POST" && m){const pid=Number(m[1]), f=await req.formData(), note=String(f.get("note")||"").trim(); if(!(await one("SELECT id FROM patients WHERE id=$1",[pid])))return render404(req,url); await db.pool.query("INSERT INTO clinical_notes(patient_id,note,created_at) VALUES($1,$2,NOW())",[pid,note]); await audit("patient.note_added","patient",pid,"clinical note",u.email); return redirect(`/admin/patients/${pid}`);}
    m=path.match(/^\/admin\/patients\/(\d+)\/plan$/);
    if(method==="POST" && m){const pid=Number(m[1]),f=await req.formData(),title=String(f.get("title")||""),status=String(f.get("status")||"planned"),notes=String(f.get("notes")||""); if(!["planned","in_progress","completed"].includes(status))return json({detail:"invalid status"},422); await db.pool.query("INSERT INTO treatment_plans(patient_id,title,status,notes) VALUES($1,$2,$3,$4)",[pid,title,status,notes]); await audit("patient.plan_added","patient",pid,title,u.email); return redirect(`/admin/patients/${pid}`);}
    m=path.match(/^\/admin\/patients\/(\d+)$/);
    if(method==="GET" && m){const pid=Number(m[1]),p=await one("SELECT * FROM patients WHERE id=$1",[pid]); if(!p)return render404(req,url); const [appts0,notes,plans]=await Promise.all([query("SELECT a.*,s.title_ar service_title_ar,s.title_en service_title_en,s.slug service_slug,p.name patient_name,p.phone patient_phone,p.email patient_email FROM appointments a JOIN services s ON s.id=a.service_id JOIN patients p ON p.id=a.patient_id WHERE a.patient_id=$1 ORDER BY a.starts_at DESC",[pid]),query("SELECT * FROM clinical_notes WHERE patient_id=$1 ORDER BY id DESC",[pid]),query("SELECT * FROM treatment_plans WHERE patient_id=$1 ORDER BY id DESC",[pid])]); return html(render("patient.html",{p,appts:appts0.map(apptView),notes:notes.map(noteView),plans}));}

    if(method==="POST" && path==="/admin/cases"){
      const f=await req.formData(), status=String(f.get("status")||"draft"); if(!["draft","private","published"].includes(status)) return json({detail:"invalid status"},422); const row=await one("INSERT INTO clinical_cases(title,treatment_type,description,before_image,after_image,status,case_date) VALUES($1,$2,$3,$4,$5,$6,CURRENT_DATE) RETURNING id",[String(f.get("title")||""),String(f.get("treatment_type")||""),String(f.get("description")||""),String(f.get("before_image")||""),String(f.get("after_image")||""),status]); await audit("case.created","clinical_case",row.id,String(f.get("title")||""),u.email); return redirect("/admin#cases");
    }
    if(method==="POST" && path==="/admin/reviews"){
      const f=await req.formData(), name=String(f.get("name")||"").trim(), rating=Math.max(1,Math.min(5,Number(f.get("rating")||5))), published=!!f.get("published"); const row=await one("INSERT INTO reviews(name,body_ar,body_tr,body_en,rating,published,created_at) VALUES($1,$2,$3,$4,$5,$6,NOW()) RETURNING id",[name,String(f.get("body_ar")||"").trim(),String(f.get("body_tr")||"").trim(),String(f.get("body_en")||"").trim(),rating,published]); await audit("review.created","review",row.id,name,u.email); return redirect("/admin#reviews");
    }
    if(method==="POST" && path==="/admin/faqs"){
      const f=await req.formData(), max=await one("SELECT COALESCE(MAX(sort_order),0)::int AS n FROM faq"), qa=String(f.get("question_ar")||"").trim(); const row=await one("INSERT INTO faq(question_ar,question_tr,question_en,answer_ar,answer_tr,answer_en,sort_order,published) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id",[qa,String(f.get("question_tr")||"").trim(),String(f.get("question_en")||"").trim(),String(f.get("answer_ar")||"").trim(),String(f.get("answer_tr")||"").trim(),String(f.get("answer_en")||"").trim(),max.n+1,!!f.get("published")]); await audit("faq.created","faq",row.id,qa,u.email); return redirect("/admin#faq");
    }
    if(method==="POST" && path==="/admin/articles"){
      const f=await req.formData(), ta=String(f.get("title_ar")||"").trim(), te=String(f.get("title_en")||"").trim()||ta; const row=await one("INSERT INTO articles(slug,title_ar,title_tr,title_en,body_ar,body_tr,body_en,published) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id",[slugify(te),ta,String(f.get("title_tr")||"").trim(),te,String(f.get("body_ar")||"").trim(),String(f.get("body_tr")||"").trim(),String(f.get("body_en")||"").trim(),!!f.get("published")]); await audit("article.created","article",row.id,ta,u.email); return redirect("/admin#articles");
    }
  }

  m=path.match(/^\/media\/(.+)$/);
  if(method==="GET" && m){
    const key=decodeURIComponent(m[1]), row=await one("SELECT * FROM media WHERE path=$1",[`/media/${key}`]); if(!row)return new Response("Not found",{status:404}); const store=getStore("media-uploads"), data=await store.get(key,{type:"arrayBuffer"}); if(data===null)return new Response("Not found",{status:404}); return withSecurity(new Response(data,{headers:{"content-type":row.mime||"application/octet-stream","cache-control":"public, max-age=31536000, immutable"}}));
  }

  if(method==="GET" && path==="/sitemap.xml"){
    const urls=["/","/booking","/?lang=ar","/?lang=tr","/?lang=en"]; const xml=`<?xml version='1.0' encoding='UTF-8'?><urlset xmlns='http://www.sitemaps.org/schemas/sitemap/0.9'>${urls.map(u=>`<url><loc>${BASE_URL}${u}</loc></url>`).join("")}</urlset>`; return withSecurity(new Response(xml,{headers:{"content-type":"application/xml; charset=utf-8"}}));
  }
  if(method==="GET" && path==="/robots.txt") return withSecurity(new Response(`User-agent: *\nAllow: /\nDisallow: /admin\nSitemap: ${BASE_URL}/sitemap.xml`,{headers:{"content-type":"text/plain; charset=utf-8"}}));
  return render404(req,url);
}

function render404(req,url){ const l=lang(req,url); return html(render("error.html",{code:404,message:"الصفحة غير موجودة",l,t:I18N[l]}),404); }

export default async (req) => {
  try { return await handle(req); }
  catch (e) {
    console.error(e);
    try { return html(render("error.html",{code:500,message:"حدث خطأ غير متوقع",l:"ar",t:I18N.ar}),500); }
    catch { return new Response("Internal Server Error",{status:500}); }
  }
};

export const config = {
  path: ["/", "/*"],
  preferStatic: true
};
