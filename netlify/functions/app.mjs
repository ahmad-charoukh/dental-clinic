import { getDatabase } from "@netlify/database";
import { getStore } from "@netlify/blobs";

import nunjucks from "nunjucks";
import { createHmac, randomBytes, scryptSync, timingSafeEqual, randomUUID } from "node:crypto";
import { resolve } from "node:path";

nunjucks.installJinjaCompat();
// Nunjucks' Jinja slice shim adds an undefined item and returns arrays for strings.
// Adapt the existing prefix slices at load time; keep the shared Jinja files intact.
class TemplateLoader extends nunjucks.FileSystemLoader {
  getSource(name) {
    const source=super.getSource(name);
    if(source)source.src=source.src.replace(/\[:(\d+)\]/g,"|prefix($1)").replace(/\.startswith\(/g,".startsWith(").replace("if not media %}","if not media|length %}");
    return source;
  }
}
const env = new nunjucks.Environment(new TemplateLoader(resolve(process.cwd(), "app/templates")), {autoescape:true});
env.addFilter("prefix",(value,count)=>(value||"").slice(0,count));

// Keep PostgreSQL's timezone-less values unchanged when the driver creates Dates.
process.env.TZ = "UTC";
const db = getDatabase();
// Postgres TIMESTAMP WITHOUT TIME ZONE holds the clinic's local wall time.
db.pool.on("connect", client => { client.query("SET TIME ZONE 'Europe/Istanbul'").catch(() => {}); });
const SECRET = process.env.APP_SECRET;
const BASE_URL = process.env.BASE_URL || process.env.URL || "http://localhost:8888";
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || "").toLowerCase();
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const MAX_UPLOAD = Number(process.env.MAX_UPLOAD_MB || 10) * 1024 * 1024;
const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf", "video/mp4"]);
const BLOCKING_STATUSES = new Set(["pending", "confirmed", "rescheduled", "completed", "no_show"]);

const I18N = {
  ar: {dir:"rtl",home:"\u0627\u0644\u0631\u0626\u064a\u0633\u064a\u0629",about:"\u0639\u0646 \u0627\u0644\u0637\u0628\u064a\u0628",services:"\u0627\u0644\u062e\u062f\u0645\u0627\u062a",cases:"\u0627\u0644\u062d\u0627\u0644\u0627\u062a",reviews:"\u0622\u0631\u0627\u0621 \u0627\u0644\u0645\u0631\u0636\u0649",articles:"\u0627\u0644\u0645\u0642\u0627\u0644\u0627\u062a",faq:"\u0627\u0644\u0623\u0633\u0626\u0644\u0629 \u0627\u0644\u0634\u0627\u0626\u0639\u0629",contact:"\u062a\u0648\u0627\u0635\u0644 \u0645\u0639\u0646\u0627",book:"\u0627\u062d\u062c\u0632 \u0645\u0648\u0639\u062f",whatsapp:"\u062a\u0648\u0627\u0635\u0644 \u0639\u0628\u0631 \u0648\u0627\u062a\u0633\u0627\u0628",hero:"\u0627\u0628\u062a\u0633\u0627\u0645\u0629 \u0635\u062d\u064a\u0629 .. \u0644\u062d\u064a\u0627\u0629 \u0623\u062c\u0645\u0644",sub:"\u0631\u0639\u0627\u064a\u0629 \u0623\u0633\u0646\u0627\u0646 \u062d\u062f\u064a\u062b\u0629 \u0648\u0645\u0631\u064a\u062d\u0629 \u0645\u0628\u0646\u064a\u0629 \u0639\u0644\u0649 \u0627\u0644\u062c\u0648\u062f\u0629 \u0648\u0627\u0644\u062b\u0642\u0629.",choose:"\u0627\u062e\u062a\u0631 \u0627\u0644\u062e\u062f\u0645\u0629",date:"\u0627\u062e\u062a\u0631 \u0627\u0644\u062a\u0627\u0631\u064a\u062e",time:"\u0627\u0644\u0648\u0642\u062a \u0627\u0644\u0645\u062a\u0627\u062d",name:"\u0627\u0644\u0627\u0633\u0645 \u0627\u0644\u0643\u0627\u0645\u0644",phone:"\u0627\u0644\u0647\u0627\u062a\u0641",email:"\u0627\u0644\u0628\u0631\u064a\u062f \u0627\u0644\u0625\u0644\u0643\u062a\u0631\u0648\u0646\u064a",notes:"\u0645\u0644\u0627\u062d\u0638\u0627\u062a",submit:"\u0625\u0631\u0633\u0627\u0644 \u0637\u0644\u0628 \u0627\u0644\u062d\u062c\u0632"},
  tr: {dir:"ltr",home:"Ana Sayfa",about:"Hakk\u0131nda",services:"Hizmetler",cases:"Vakalar",reviews:"Yorumlar",articles:"Makaleler",faq:"SSS",contact:"\u0130leti\u015fim",book:"Randevu Al",whatsapp:"WhatsApp",hero:"Sa\u011fl\u0131kl\u0131 g\u00fcl\u00fc\u015f, daha g\u00fczel bir hayat",sub:"Kalite ve g\u00fcven odakl\u0131 modern, konforlu di\u015f hekimli\u011fi.",choose:"Hizmet se\u00e7in",date:"Tarih se\u00e7in",time:"Uygun saat",name:"Ad Soyad",phone:"Telefon",email:"E-posta",notes:"Notlar",submit:"Randevu iste\u011fi g\u00f6nder"},
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
  const raw=value instanceof Date ? value.toISOString() : String(value);
  const text=raw.replace("T"," ");
  return fmt === "%Y-%m-%d" ? text.slice(0,10) : text.slice(0,16);

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
function invalid(detail="invalid_data",status=422){return Object.assign(new Error(detail),{status});}
function validCost(value){if(!String(value||"").trim())return null;const n=Number(value);if(!Number.isFinite(n)||n<0)throw invalid("invalid cost");return n;}
function validDay(value){if(!value)return null;if(!/^\d{4}-\d{2}-\d{2}$/.test(value)||Number.isNaN(Date.parse(value))||new Date(value).toISOString().slice(0,10)!==value)throw invalid("invalid date");return value;}
async function validImage(value,existing=""){
  value=String(value||"").trim();if(!value || value===existing)return value;
  if(!/^\/media\/[a-f0-9-]+\.(jpg|jpeg|png|webp)$/i.test(value) || !await one("SELECT id FROM media WHERE path=$1 AND mime LIKE 'image/%'",[value]))throw invalid("Choose an uploaded image");
  return value;
}
async function owned(table,id,pid){
  if(!["treatment_plans","patient_files"].includes(table))throw invalid();
  const row=await one(`SELECT * FROM ${table} WHERE id=$1 AND patient_id=$2`,[id,pid]);if(!row)throw invalid("not_found",404);return row;
}
function mediaStore(){return getStore({name:"media-uploads",consistency:"strong"});}
function patientStore(){return getStore({name:"patient-files",consistency:"strong"});}
async function uploadData(file,privateFile=false){
  if(!file || typeof file.arrayBuffer!=="function")throw invalid("file required");
  if(!ALLOWED_MIME.has(file.type)||(privateFile&&file.type==="video/mp4"))throw invalid("unsupported file",415);
  if(!file.size||file.size>MAX_UPLOAD)throw invalid("file too large or empty",413);
  return file.arrayBuffer();
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
function apptView(r){return {...r,starts_at:dateProxy(r.starts_at),patient:{id:r.patient_id,name:r.patient_name,phone:r.patient_phone,email:r.patient_email},service:{id:r.service_id,title_ar:r.service_title_ar,title_en:r.service_title_en,slug:r.service_slug}};}
function noteView(r){return {...r,created_at:dateProxy(r.created_at)};}
function render(name, ctx={}) { return env.render(name,ctx); }
function isPhone(v){return /^[+0-9 ()-]{7,25}$/.test(String(v||""));}
function minutes(t){ const [h,m]=String(t||"00:00").slice(0,5).split(":").map(Number); return h*60+m; }
function hhmm(total){ return `${String(Math.floor(total/60)).padStart(2,"0")}:${String(total%60).padStart(2,"0")}`; }
function slotKey(day,t){ return `${day.replaceAll("-","")}${String(t).replace(":","")}`; }
function weekdayPython(day){ const d=new Date(`${day}T12:00:00Z`); return (d.getUTCDay()+6)%7; }

async function availableSlots(day, serviceId, executor=db.pool, excludeId=0) {
  const one=async(sql,params)=>(await executor.query(sql,params)).rows[0];
  const query=async(sql,params)=>(await executor.query(sql,params)).rows;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return [];
  const now=localNow(), today=`${now.year}-${now.month}-${now.day}`;
  if (day < today) return [];
  if (await one("SELECT id FROM blocked_dates WHERE day=$1",[day])) return [];
  const wh=await one("SELECT * FROM working_hours WHERE weekday=$1",[weekdayPython(day)]);
  const svc=await one("SELECT * FROM services WHERE id=$1 AND active=TRUE",[serviceId]);
  if (!wh || !wh.enabled || !svc) return [];
  const reservedRows=await query("SELECT a.starts_at,s.duration FROM appointments a JOIN services s ON s.id=a.service_id WHERE a.slot_key IS NOT NULL AND a.starts_at::date=$1::date AND a.id<>$2",[day,excludeId]);
  const start=minutes(wh.start_time), end=minutes(wh.end_time), step=Math.max(10,Number(svc.duration||30));
  const bs=wh.break_start ? minutes(wh.break_start):null, be=wh.break_end?minutes(wh.break_end):null;
  const out=[];
  const nowMin=Number(now.hour)*60+Number(now.minute)+30;
  for(let cur=start; cur+step<=end; cur+=step){
    const t=hhmm(cur); const inBreak=bs!==null&&be!==null&&cur<be&&cur+step>bs;
    const overlaps=reservedRows.some(a=>{const at=minutes(formatDate(a.starts_at).slice(11));return cur<at+Math.max(10,a.duration)&&cur+step>at;});
    if(!inBreak && !overlaps && (day>today || cur>nowMin)) out.push(t);
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
  const dicts={ar:{pending:"\u062a\u0645 \u0627\u0633\u062a\u0644\u0627\u0645 \u0637\u0644\u0628 \u0645\u0648\u0639\u062f\u0643",confirmed:"\u062a\u0645 \u062a\u0623\u0643\u064a\u062f \u0645\u0648\u0639\u062f\u0643",rejected:"\u062a\u0639\u0630\u0631 \u0642\u0628\u0648\u0644 \u0627\u0644\u0645\u0648\u0639\u062f",cancelled:"\u062a\u0645 \u0625\u0644\u063a\u0627\u0621 \u0627\u0644\u0645\u0648\u0639\u062f",rescheduled:"\u062a\u0645 \u062a\u0639\u062f\u064a\u0644 \u0645\u0648\u0639\u062f\u0643"},tr:{pending:"Randevu talebiniz al\u0131nd\u0131",confirmed:"Randevunuz onayland\u0131",rejected:"Randevu talebi kabul edilemedi",cancelled:"Randevunuz iptal edildi",rescheduled:"Randevunuz g\u00fcncellendi"},en:{pending:"Booking request received",confirmed:"Appointment confirmed",rejected:"Appointment request declined",cancelled:"Appointment cancelled",rescheduled:"Appointment rescheduled"}};
  const l=dicts[locale]?locale:"ar", subj=dicts[l][status]||"Appointment update";
  const body=`<h2>${subj}</h2><p>${formatDate(appt.starts_at)}</p><p>${appt.service_title_en||""}</p><p><a href="${BASE_URL}/booking?lang=${l}">Book another appointment</a></p>`;
  return [subj,body];
}

let bootstrapped=false;
async function ensureBootstrap(){
  if(!SECRET || SECRET.length<32 || !ADMIN_EMAIL || !ADMIN_PASSWORD) throw Object.assign(new Error("Missing ADMIN_EMAIL / ADMIN_PASSWORD / APP_SECRET (32+ characters)"),{status:503});
  if(bootstrapped) return;
  const u=await one("SELECT id FROM users LIMIT 1");
  if(!u){ await db.pool.query("INSERT INTO users(email,password_hash,role,active,created_at) VALUES($1,$2,'admin',TRUE,NOW()) ON CONFLICT(email) DO NOTHING",[ADMIN_EMAIL,hashPassword(ADMIN_PASSWORD)]); }
  bootstrapped=true;
}

async function handle(req) {
  await ensureBootstrap();
  const url=new URL(req.url), path=cleanPath(url), method=req.method.toUpperCase();
  if(method!=="GET" && method!=="HEAD" && path.startsWith("/admin") && req.headers.get("origin") && req.headers.get("origin")!==url.origin) return json({detail:"invalid_origin"},403);

  if(method==="GET" && path==="/"){
    const l=lang(req,url);
    const [services,cases,arts,reviews,faqs,settings]=await Promise.all([
      query("SELECT * FROM services WHERE active=TRUE ORDER BY sort_order,id"),
      query("SELECT * FROM clinical_cases WHERE status='published' ORDER BY id DESC LIMIT 6"),
      query("SELECT * FROM articles WHERE published=TRUE ORDER BY id DESC LIMIT 3"),
      query("SELECT * FROM reviews WHERE published=TRUE ORDER BY id DESC LIMIT 6"),
      query("SELECT * FROM faq WHERE published=TRUE ORDER BY sort_order,id"),settingsDict()
    ]);
    for(const r of reviews) r.stars="\u2605".repeat(Math.max(0,Math.min(5,Number(r.rating||0))));
    const body=render("home.html",{l,t:I18N[l],services:services.map(x=>serviceView(x,l)),cases,settings,articles:arts,reviews,faqs});
    return html(body,200,{"Set-Cookie":cookie("lang",l,{maxAge:31536000,sameSite:"Lax"})});
  }

  if(method==="GET" && path==="/booking"){
    const l=lang(req,url), [services,settings]=await Promise.all([query("SELECT * FROM services WHERE active=TRUE ORDER BY sort_order,id"),settingsDict()]);
    const selected_service_id=Number(url.searchParams.get("service")||0);
    return html(render("booking.html",{l,t:I18N[l],services:services.map(x=>serviceView(x,l)),settings,selected_service_id,request:{query_params:{get:(key)=>url.searchParams.get(key)}}}),200,{"Set-Cookie":cookie("lang",l,{maxAge:31536000,sameSite:"Lax"})});
  }

  if(method==="GET" && path==="/api/availability"){
    const day=url.searchParams.get("day")||"", serviceId=Number(url.searchParams.get("service_id")||0);
    return json({slots:await availableSlots(day,serviceId)});
  }

  if(method==="GET" && path==="/api/availability/nearest"){
    const serviceId=Number(url.searchParams.get("service_id"));
    if(!await one("SELECT id FROM services WHERE id=$1 AND active=TRUE",[serviceId])) return json({detail:"service"},404);
    const now=localNow(), start=new Date(`${now.year}-${now.month}-${now.day}T12:00:00Z`);
    for(let i=0;i<30;i++){ const day=new Date(start.getTime()+i*86400000).toISOString().slice(0,10); const slots=await availableSlots(day,serviceId); if(slots.length) return json({day,time:slots[0]}); }
    return json({day:null,time:null});
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
      await client.query("SELECT pg_advisory_xact_lock(8675309)");
      if(!(await availableSlots(day,serviceId,client)).includes(tm)){await client.query("ROLLBACK");return json({detail:"slot_unavailable"},409);}
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
    if(!u || !u.active || !verifyPassword(password,u.password_hash)) return html(render("login.html",{error:"بيانات الدخول غير صحيحة",l:"ar",t:I18N.ar}),401);
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
      const client=await db.pool.connect();
      try{
        await client.query("BEGIN");await client.query("SELECT pg_advisory_xact_lock(8675309)");
        if(status==="rescheduled"){
          const nd=validDay(String(f.get("new_day")||"")),nt=String(f.get("new_time")||"");
          if(!nd||!/^\d{2}:\d{2}$/.test(nt))throw invalid("new slot");
          if(!(await availableSlots(nd,a.service_id,client,aid)).includes(nt))throw invalid("slot_unavailable",409);
          starts=`${nd} ${nt}:00`;sk=slotKey(nd,nt);
        } else if(["rejected","cancelled"].includes(status))sk=null;
        else {
          sk=slotKey(formatDate(starts,"%Y-%m-%d"),formatDate(starts).slice(11));
          const overlap=await client.query("SELECT a.id FROM appointments a JOIN services s ON s.id=a.service_id WHERE a.id<>$1 AND a.slot_key IS NOT NULL AND a.starts_at < $2::timestamp + (SELECT duration FROM services WHERE id=$3)*INTERVAL '1 minute' AND a.starts_at+s.duration*INTERVAL '1 minute' > $2::timestamp",[aid,starts,a.service_id]);
          if(overlap.rows.length)throw invalid("slot_unavailable",409);
        }
        await client.query("UPDATE appointments SET status=$1,starts_at=$2,slot_key=$3 WHERE id=$4",[status,starts,sk,aid]);await client.query("COMMIT");
      }catch(e){await client.query("ROLLBACK");if(e?.code==="23505")throw invalid("slot_unavailable",409);throw e;}finally{client.release();}
      await audit("appointment.status_changed","appointment",aid,status,u.email); const [subj,body]=emailText(a.locale,status,{...a,starts_at:starts}); await sendEmail(a.patient_email,subj,body); return redirect("/admin#appointments");
    }

    if(method==="POST" && path==="/admin/services"){
      const f=await req.formData(); const vals=["title_ar","title_tr","title_en","description_ar","description_tr","description_en"].map(k=>String(f.get(k)||"")); const duration=Number(f.get("duration")||30), price=validCost(f.get("price")), image=await validImage(f.get("image"));
      if(vals.slice(0,3).some(v=>!v.trim())||!Number.isInteger(duration)||duration<10)throw invalid();
      const max=await one("SELECT COALESCE(MAX(sort_order),0)::int AS n FROM services");
      const r=await one("INSERT INTO services(slug,title_ar,title_tr,title_en,description_ar,description_tr,description_en,image,duration,sessions,price,sort_order,active) VALUES($1,$2,$3,$4,$5,$6,$7,$11,$8,1,$9,$10,TRUE) RETURNING id",[slugify(vals[2]),...vals,duration,price,max.n+1,image]); await audit("service.created","service",r.id,vals[0],u.email); return redirect("/admin#services");
    }
    m=path.match(/^\/admin\/services\/(\d+)\/edit$/);
    if(method==="POST" && m){
      const sid=Number(m[1]),old=await one("SELECT * FROM services WHERE id=$1",[sid]);if(!old)throw invalid("not_found",404);
      const f=await req.formData(),vals=["title_ar","title_tr","title_en","description_ar","description_tr","description_en"].map(k=>String(f.get(k)||"")),duration=Number(f.get("duration")||30);
      if(vals.slice(0,3).some(v=>!v.trim())||!Number.isInteger(duration)||duration<10)throw invalid();
      await query("UPDATE services SET title_ar=$1,title_tr=$2,title_en=$3,description_ar=$4,description_tr=$5,description_en=$6,duration=$7,price=$8,image=$9 WHERE id=$10",[...vals,duration,validCost(f.get("price")),await validImage(f.get("image"),old.image),sid]);
      await audit("service.updated","service",sid,vals[0],u.email);return redirect("/admin#services");
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
      const data=await uploadData(file),ext={"image/jpeg":"jpg","image/png":"png","image/webp":"webp","application/pdf":"pdf","video/mp4":"mp4"}[file.type],key=`${randomUUID()}.${ext}`,store=mediaStore();
      await store.set(key,data,{metadata:{mime:file.type,filename:file.name||key}});
      const p=`/media/${key}`;let row;
      try{row=await one("INSERT INTO media(filename,path,mime,category,created_at) VALUES($1,$2,$3,$4,NOW()) RETURNING id",[(file.name||key).slice(0,255),p,file.type,category]);}catch(e){await store.delete(key);throw e;}
      await audit("media.uploaded","media",row.id,file.name||key,u.email);
      return req.headers.get("accept")?.includes("application/json")?json({path:p}):redirect("/admin#media");
    }

    m=path.match(/^\/admin\/patients\/(\d+)\/note$/);
    if(method==="POST" && m){const pid=Number(m[1]), f=await req.formData(), note=String(f.get("note")||"").trim(); if(!(await one("SELECT id FROM patients WHERE id=$1",[pid])))return render404(req,url); if(!note)throw invalid(); await db.pool.query("INSERT INTO clinical_notes(patient_id,note,created_at) VALUES($1,$2,NOW())",[pid,note]); await audit("patient.note_added","patient",pid,"clinical note",u.email); return redirect(`/admin/patients/${pid}`);}
    m=path.match(/^\/admin\/patients\/(\d+)\/plan(?:\/(\d+)\/(edit|delete))?$/);
    if(method==="POST" && m){
      const pid=Number(m[1]),id=Number(m[2]||0),old=id?await owned("treatment_plans",id,pid):null;
      if(!await one("SELECT id FROM patients WHERE id=$1",[pid]))throw invalid("not_found",404);
      if(m[3]==="delete")await query("DELETE FROM treatment_plans WHERE id=$1 AND patient_id=$2",[id,pid]);
      else {
        const f=await req.formData(),title=String(f.get("title")||"").trim(),status=String(f.get("status")||"planned"),tooth=String(f.get("tooth")||"");
        if(!title||tooth.length>30||!["planned","in_progress","completed"].includes(status))throw invalid();
        const vals=[title,status,String(f.get("notes")||""),tooth,validDay(String(f.get("treatment_date")||"")),validCost(f.get("cost"))];
        if(old)await query("UPDATE treatment_plans SET title=$1,status=$2,notes=$3,tooth=$4,treatment_date=$5,cost=$6 WHERE id=$7 AND patient_id=$8",[...vals,id,pid]);
        else await query("INSERT INTO treatment_plans(title,status,notes,tooth,treatment_date,cost,patient_id,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,NOW())",[...vals,pid]);
      }
      await audit(m[3]==="delete"?"patient.plan_deleted":id?"patient.plan_updated":"patient.plan_added","patient",pid,"treatment plan",u.email);
      return redirect(`/admin/patients/${pid}#plans`);
    }
    m=path.match(/^\/admin\/patients\/(\d+)\/files(?:\/(\d+)(\/delete)?)?$/);
    if(m && ["GET","POST"].includes(method)){
      const pid=Number(m[1]),fid=Number(m[2]||0),store=patientStore();
      if(!await one("SELECT id FROM patients WHERE id=$1",[pid]))throw invalid("not_found",404);
      if(fid){
        const f=await owned("patient_files",fid,pid);
        if(method==="POST" && m[3]){
          await store.delete(f.stored_name);await query("DELETE FROM patient_files WHERE id=$1 AND patient_id=$2",[fid,pid]);
          await audit("patient.file_deleted","patient",pid,String(fid),u.email);return redirect(`/admin/patients/${pid}#files`);
        }
        if(method!=="GET"||m[3])throw invalid("not_found",404);
        const data=await store.get(f.stored_name,{type:"arrayBuffer"});if(data===null)throw invalid("not_found",404);
        return withSecurity(new Response(data,{headers:{"content-type":f.mime,"cache-control":"no-store","content-disposition":`attachment; filename="patient-file"; filename*=UTF-8''${encodeURIComponent(f.filename).replaceAll("'","%27")}`}}));
      }
      if(method!=="POST")throw invalid("not_found",404);
      const form=await req.formData(),file=form.get("file"),data=await uploadData(file,true),key=randomUUID(),filename=(file.name||"file").replaceAll("\\","/").split("/").pop().slice(0,255);
      await store.set(key,data,{metadata:{mime:file.type}});
      try{await query("INSERT INTO patient_files(patient_id,filename,stored_name,mime,created_at) VALUES($1,$2,$3,$4,NOW())",[pid,filename,key,file.type]);}catch(e){await store.delete(key);throw e;}
      await audit("patient.file_added","patient",pid,"private file",u.email);return redirect(`/admin/patients/${pid}#files`);
    }
    m=path.match(/^\/admin\/patients\/(\d+)$/);
    if(method==="GET" && m){
      const pid=Number(m[1]),p=await one("SELECT * FROM patients WHERE id=$1",[pid]);if(!p)throw invalid("not_found",404);
      const [appts0,notes0,plans0,files0]=await Promise.all([
        query("SELECT a.*,s.title_ar service_title_ar,s.title_en service_title_en,s.slug service_slug,p.name patient_name,p.phone patient_phone,p.email patient_email FROM appointments a JOIN services s ON s.id=a.service_id JOIN patients p ON p.id=a.patient_id WHERE a.patient_id=$1 ORDER BY a.starts_at DESC",[pid]),
        query("SELECT * FROM clinical_notes WHERE patient_id=$1 ORDER BY id DESC",[pid]),query("SELECT * FROM treatment_plans WHERE patient_id=$1 ORDER BY id DESC",[pid]),query("SELECT * FROM patient_files WHERE patient_id=$1 ORDER BY id DESC",[pid])
      ]);
      const events=[[p.created_at,"إنشاء ملف المريض"],...notes0.map(n=>[n.created_at,"ملاحظة سريرية: "+n.note]),...appts0.map(a=>[a.starts_at,"موعد: "+a.service_title_ar+" · "+a.status]),...files0.map(f=>[f.created_at,"إرفاق ملف: "+f.filename]),...plans0.filter(x=>x.created_at).map(x=>[x.created_at,"إضافة علاج: "+x.title])];
      events.sort((a,b)=>new Date(b[0])-new Date(a[0]));
      const plans=plans0.map(x=>({...x,treatment_date:x.treatment_date?formatDate(x.treatment_date,"%Y-%m-%d"):null}));
      return html(render("patient.html",{p:{...p,created_at:dateProxy(p.created_at)},appts:appts0.map(apptView),notes:notes0.map(noteView),plans,files:files0.map(noteView),events:events.map(([at,label])=>[dateProxy(at),label])}));
    }

    if(method==="POST" && path==="/admin/cases"){
      const f=await req.formData(), status=String(f.get("status")||"draft"); if(!["draft","private","published"].includes(status)) return json({detail:"invalid status"},422); const row=await one("INSERT INTO clinical_cases(title,treatment_type,description,before_image,after_image,status,case_date) VALUES($1,$2,$3,$4,$5,$6,CURRENT_DATE) RETURNING id",[String(f.get("title")||""),String(f.get("treatment_type")||""),String(f.get("description")||""),await validImage(f.get("before_image")),await validImage(f.get("after_image")),status]); await audit("case.created","clinical_case",row.id,String(f.get("title")||""),u.email); return redirect("/admin#cases");
    }
    m=path.match(/^\/admin\/cases\/(\d+)\/(edit|delete)$/);
    if(method==="POST" && m){
      const cid=Number(m[1]),old=await one("SELECT * FROM clinical_cases WHERE id=$1",[cid]);if(!old)throw invalid("not_found",404);
      if(m[2]==="delete")await query("DELETE FROM clinical_cases WHERE id=$1",[cid]);
      else {
        const f=await req.formData(),title=String(f.get("title")||"").trim(),status=String(f.get("status")||"");if(!title||!["draft","private","published"].includes(status))throw invalid();
        await query("UPDATE clinical_cases SET title=$1,treatment_type=$2,description=$3,before_image=$4,after_image=$5,status=$6 WHERE id=$7",[title,String(f.get("treatment_type")||""),String(f.get("description")||""),await validImage(f.get("before_image"),old.before_image),await validImage(f.get("after_image"),old.after_image),status,cid]);
      }
      await audit(m[2]==="delete"?"case.deleted":"case.updated","clinical_case",cid,old.title,u.email);return redirect("/admin#cases");
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
    const key=decodeURIComponent(m[1]), row=await one("SELECT * FROM media WHERE path=$1",[`/media/${key}`]); if(!row)return new Response("Not found",{status:404}); const store=mediaStore(), data=await store.get(key,{type:"arrayBuffer"}); if(data===null)return new Response("Not found",{status:404}); return withSecurity(new Response(data,{headers:{"content-type":row.mime||"application/octet-stream","cache-control":"public, max-age=31536000, immutable"}}));
  }

  if(method==="GET" && path==="/sitemap.xml"){
    const urls=["/","/booking","/?lang=ar","/?lang=tr","/?lang=en"]; const xml=`<?xml version='1.0' encoding='UTF-8'?><urlset xmlns='http://www.sitemaps.org/schemas/sitemap/0.9'>${urls.map(u=>`<url><loc>${BASE_URL}${u}</loc></url>`).join("")}</urlset>`; return withSecurity(new Response(xml,{headers:{"content-type":"application/xml; charset=utf-8"}}));
  }
  if(method==="GET" && path==="/robots.txt") return withSecurity(new Response(`User-agent: *\nAllow: /\nDisallow: /admin\nSitemap: ${BASE_URL}/sitemap.xml`,{headers:{"content-type":"text/plain; charset=utf-8"}}));
  return render404(req,url);
}

function render404(req,url){ const l=lang(req,url); return html(render("error.html",{code:404,message:"الصفحة غير موجودة",l,t:I18N[l]}),404); }

export default async (req) => {
  try {
    const response=await handle(req);
    if(new URL(req.url).pathname.startsWith("/admin"))response.headers.set("Cache-Control","no-store");
    return response;
  }
  catch (e) {
    if(e.status)return json({detail:e.status===503?"Server configuration incomplete":e.message},e.status);
    console.error("Netlify request failed",e.code||e.name);
    try { return html(render("error.html",{code:500,message:"حدث خطأ غير متوقع",l:"ar",t:I18N.ar}),500); }
    catch { return new Response("Internal Server Error",{status:500}); }
  }
};

export const config = {
  path: ["/", "/*"],
  preferStatic: true
};
