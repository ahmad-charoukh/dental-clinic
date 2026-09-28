from __future__ import annotations
import math
import os, re, json, uuid, hmac, hashlib, secrets, mimetypes, urllib.request
from datetime import datetime, date, time, timedelta
from pathlib import Path
from typing import Optional
from fastapi import FastAPI, Request, Form, UploadFile, File, HTTPException, Depends
from fastapi.responses import HTMLResponse, RedirectResponse, JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from sqlalchemy import create_engine, String, Integer, DateTime, Date, Time, Text, Boolean, ForeignKey, UniqueConstraint, select, func, inspect, text
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship, sessionmaker, Session
from sqlalchemy.exc import IntegrityError
from itsdangerous import URLSafeTimedSerializer, BadSignature, SignatureExpired
from pydantic import BaseModel, field_validator

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"; DATA_DIR.mkdir(exist_ok=True)
STATIC_DIR = BASE_DIR / "app" / "static"
UPLOAD_DIR = STATIC_DIR / "uploads" / "media"; UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
DATABASE_URL = os.getenv("DATABASE_URL", f"sqlite:///{DATA_DIR/'wael.db'}")
SECRET = os.getenv("APP_SECRET", "dev-only-change-this-secret")
BASE_URL = os.getenv("BASE_URL", "http://localhost:8000")
ADMIN_EMAIL = os.getenv("ADMIN_EMAIL", "admin@waelbash.local").lower()
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "ChangeMe!123")
MAX_UPLOAD = int(os.getenv("MAX_UPLOAD_MB", "10")) * 1024 * 1024
ALLOWED_MIME = {"image/jpeg","image/png","image/webp","application/pdf","video/mp4"}
BLOCKING_STATUSES = {"pending","confirmed","rescheduled","completed","no_show"}
PUBLIC_APPT_STATUSES = {"pending","confirmed","rescheduled"}

class Base(DeclarativeBase): pass

class User(Base):
    __tablename__="users"
    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    role: Mapped[str] = mapped_column(String(32), default="admin")
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

class Service(Base):
    __tablename__="services"
    id: Mapped[int] = mapped_column(primary_key=True)
    slug: Mapped[str] = mapped_column(String(120), unique=True, index=True)
    title_ar: Mapped[str] = mapped_column(String(200)); title_tr: Mapped[str] = mapped_column(String(200)); title_en: Mapped[str] = mapped_column(String(200))
    description_ar: Mapped[str] = mapped_column(Text, default=""); description_tr: Mapped[str] = mapped_column(Text, default=""); description_en: Mapped[str] = mapped_column(Text, default="")
    image: Mapped[str] = mapped_column(String(300), default="")
    duration: Mapped[int] = mapped_column(Integer, default=30)
    sessions: Mapped[int] = mapped_column(Integer, default=1)
    price: Mapped[Optional[float]] = mapped_column(nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    active: Mapped[bool] = mapped_column(Boolean, default=True)

class Patient(Base):
    __tablename__="patients"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(200), index=True)
    phone: Mapped[str] = mapped_column(String(60), index=True)
    email: Mapped[str] = mapped_column(String(255), default="", index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

class Appointment(Base):
    __tablename__="appointments"
    id: Mapped[int] = mapped_column(primary_key=True)
    patient_id: Mapped[int] = mapped_column(ForeignKey("patients.id"), index=True)
    service_id: Mapped[int] = mapped_column(ForeignKey("services.id"), index=True)
    starts_at: Mapped[datetime] = mapped_column(DateTime, index=True)
    slot_key: Mapped[Optional[str]] = mapped_column(String(32), unique=True, nullable=True, index=True)
    status: Mapped[str] = mapped_column(String(32), default="pending", index=True)
    notes: Mapped[str] = mapped_column(Text, default="")
    locale: Mapped[str] = mapped_column(String(5), default="ar")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    patient = relationship(Patient)
    service = relationship(Service)

class WorkingHour(Base):
    __tablename__="working_hours"
    id: Mapped[int] = mapped_column(primary_key=True)
    weekday: Mapped[int] = mapped_column(Integer, unique=True)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    start_time: Mapped[time] = mapped_column(Time, default=time(9,0))
    end_time: Mapped[time] = mapped_column(Time, default=time(17,0))
    break_start: Mapped[Optional[time]] = mapped_column(Time, nullable=True)
    break_end: Mapped[Optional[time]] = mapped_column(Time, nullable=True)

class BlockedDate(Base):
    __tablename__="blocked_dates"
    id: Mapped[int] = mapped_column(primary_key=True)
    day: Mapped[date] = mapped_column(Date, unique=True, index=True)
    reason: Mapped[str] = mapped_column(String(200), default="")

class ClinicalCase(Base):
    __tablename__="clinical_cases"
    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(200)); treatment_type: Mapped[str] = mapped_column(String(160), default="")
    description: Mapped[str] = mapped_column(Text, default="")
    before_image: Mapped[str] = mapped_column(String(300), default=""); after_image: Mapped[str] = mapped_column(String(300), default="")
    status: Mapped[str] = mapped_column(String(20), default="draft")
    case_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)

class SiteSetting(Base):
    __tablename__="site_settings"
    key: Mapped[str] = mapped_column(String(100), primary_key=True)
    value: Mapped[str] = mapped_column(Text, default="")

class Media(Base):
    __tablename__="media"
    id: Mapped[int] = mapped_column(primary_key=True)
    filename: Mapped[str] = mapped_column(String(255)); path: Mapped[str] = mapped_column(String(300)); mime: Mapped[str] = mapped_column(String(100)); category: Mapped[str] = mapped_column(String(80), default="General")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

class ClinicalNote(Base):
    __tablename__="clinical_notes"
    id: Mapped[int] = mapped_column(primary_key=True)
    patient_id: Mapped[int] = mapped_column(ForeignKey("patients.id"), index=True)
    note: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

class TreatmentPlan(Base):
    __tablename__="treatment_plans"
    id: Mapped[int] = mapped_column(primary_key=True)
    patient_id: Mapped[int] = mapped_column(ForeignKey("patients.id"), index=True)
    title: Mapped[str] = mapped_column(String(200)); status: Mapped[str] = mapped_column(String(30), default="planned"); notes: Mapped[str] = mapped_column(Text, default="")

    tooth: Mapped[str] = mapped_column(String(30), default="")
    treatment_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    cost: Mapped[Optional[float]] = mapped_column(nullable=True)
    created_at: Mapped[Optional[datetime]] = mapped_column(DateTime, default=datetime.utcnow, nullable=True)

class PatientFile(Base):
    __tablename__="patient_files"
    id: Mapped[int] = mapped_column(primary_key=True)
    patient_id: Mapped[int] = mapped_column(ForeignKey("patients.id"), index=True)
    filename: Mapped[str] = mapped_column(String(255))
    stored_name: Mapped[str] = mapped_column(String(80))
    mime: Mapped[str] = mapped_column(String(100))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

class Message(Base):
    __tablename__="messages"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(200)); email: Mapped[str] = mapped_column(String(255), default=""); phone: Mapped[str] = mapped_column(String(60), default=""); body: Mapped[str] = mapped_column(Text); created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

class EmailLog(Base):
    __tablename__="email_logs"
    id: Mapped[int] = mapped_column(primary_key=True)
    recipient: Mapped[str] = mapped_column(String(255)); subject: Mapped[str] = mapped_column(String(255)); status: Mapped[str] = mapped_column(String(30)); provider_id: Mapped[str] = mapped_column(String(120), default=""); error: Mapped[str] = mapped_column(Text, default=""); created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

class AuditLog(Base):
    __tablename__="audit_logs"
    id: Mapped[int] = mapped_column(primary_key=True)
    actor: Mapped[str] = mapped_column(String(255), default="system"); action: Mapped[str] = mapped_column(String(120)); entity: Mapped[str] = mapped_column(String(80)); entity_id: Mapped[str] = mapped_column(String(80), default=""); detail: Mapped[str] = mapped_column(Text, default=""); created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

class Review(Base):
    __tablename__="reviews"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(160))
    body_ar: Mapped[str] = mapped_column(Text, default="")
    body_tr: Mapped[str] = mapped_column(Text, default="")
    body_en: Mapped[str] = mapped_column(Text, default="")
    rating: Mapped[int] = mapped_column(Integer, default=5)
    published: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

class FAQ(Base):
    __tablename__="faq"
    id: Mapped[int] = mapped_column(primary_key=True)
    question_ar: Mapped[str] = mapped_column(String(300))
    question_tr: Mapped[str] = mapped_column(String(300), default="")
    question_en: Mapped[str] = mapped_column(String(300), default="")
    answer_ar: Mapped[str] = mapped_column(Text, default="")
    answer_tr: Mapped[str] = mapped_column(Text, default="")
    answer_en: Mapped[str] = mapped_column(Text, default="")
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    published: Mapped[bool] = mapped_column(Boolean, default=False)

class Article(Base):
    __tablename__="articles"
    id: Mapped[int] = mapped_column(primary_key=True)
    slug: Mapped[str] = mapped_column(String(160), unique=True); title_ar: Mapped[str] = mapped_column(String(240)); title_tr: Mapped[str] = mapped_column(String(240)); title_en: Mapped[str] = mapped_column(String(240)); body_ar: Mapped[str] = mapped_column(Text, default=""); body_tr: Mapped[str] = mapped_column(Text, default=""); body_en: Mapped[str] = mapped_column(Text, default=""); published: Mapped[bool] = mapped_column(Boolean, default=False)

engine_args = {"connect_args":{"check_same_thread":False}} if DATABASE_URL.startswith("sqlite") else {}
engine=create_engine(DATABASE_URL, future=True, **engine_args)
SessionLocal=sessionmaker(engine, expire_on_commit=False)
serializer=URLSafeTimedSerializer(SECRET, salt="session")

def db():
    s=SessionLocal()
    try: yield s
    finally: s.close()

def hash_password(p:str)->str:
    salt=secrets.token_bytes(16); key=hashlib.scrypt(p.encode(),salt=salt,n=2**14,r=8,p=1,dklen=32)
    return f"scrypt${salt.hex()}${key.hex()}"

def verify_password(p:str, encoded:str)->bool:
    try:
        _,sh,kh=encoded.split("$"); salt=bytes.fromhex(sh); expected=bytes.fromhex(kh)
        actual=hashlib.scrypt(p.encode(),salt=salt,n=2**14,r=8,p=1,dklen=32)
        return hmac.compare_digest(actual, expected)
    except Exception: return False

def current_user(request:Request, s:Session)->Optional[User]:
    tok=request.cookies.get("wael_session")
    if not tok: return None
    try: payload=serializer.loads(tok,max_age=60*60*12)
    except (BadSignature,SignatureExpired): return None
    return s.get(User,int(payload.get("uid",0)))

def require_admin(request:Request, s:Session=Depends(db))->User:
    u=current_user(request,s)
    if not u or not u.active or u.role not in {"admin","doctor","assistant","receptionist"}: raise HTTPException(401)
    return u

def audit(s:Session, action:str, entity:str, entity_id="", detail="", actor="system"):
    s.add(AuditLog(action=action,entity=entity,entity_id=str(entity_id),detail=detail,actor=actor))

def slot_key(dt:datetime)->str: return dt.strftime("%Y%m%d%H%M")

def settings_dict(s:Session):
    return {x.key:x.value for x in s.scalars(select(SiteSetting)).all()}

I18N={
"ar":{"dir":"rtl","home":"الرئيسية","about":"عن الطبيب","services":"الخدمات","cases":"الحالات","reviews":"آراء المرضى","articles":"المقالات","faq":"الأسئلة الشائعة","contact":"تواصل معنا","book":"احجز موعد","whatsapp":"تواصل عبر واتساب","hero":"ابتسامة صحية .. لحياة أجمل","sub":"رعاية أسنان حديثة ومريحة مبنية على الجودة والثقة.","choose":"اختر الخدمة","date":"اختر التاريخ","time":"الوقت المتاح","name":"الاسم الكامل","phone":"الهاتف","email":"البريد الإلكتروني","notes":"ملاحظات","submit":"إرسال طلب الحجز"},
"tr":{"dir":"ltr","home":"Ana Sayfa","about":"Hakkında","services":"Hizmetler","cases":"Vakalar","reviews":"Yorumlar","articles":"Makaleler","faq":"SSS","contact":"İletişim","book":"Randevu Al","whatsapp":"WhatsApp","hero":"Sağlıklı gülüş, daha güzel bir hayat","sub":"Kalite ve güven odaklı modern, konforlu diş hekimliği.","choose":"Hizmet seçin","date":"Tarih seçin","time":"Uygun saat","name":"Ad Soyad","phone":"Telefon","email":"E-posta","notes":"Notlar","submit":"Randevu isteği gönder"},
"en":{"dir":"ltr","home":"Home","about":"About","services":"Services","cases":"Cases","reviews":"Reviews","articles":"Articles","faq":"FAQ","contact":"Contact","book":"Book Appointment","whatsapp":"WhatsApp","hero":"A healthy smile for a better life","sub":"Modern, comfortable dentistry built around quality and trust.","choose":"Choose service","date":"Choose date","time":"Available time","name":"Full name","phone":"Phone","email":"Email","notes":"Notes","submit":"Send booking request"}}

def lang(request:Request):
    x=request.query_params.get("lang") or request.cookies.get("lang") or "ar"
    return x if x in I18N else "ar"

def tr_service(x:Service,l:str): return {"id":x.id,"slug":x.slug,"title":getattr(x,f"title_{l}"),"description":getattr(x,f"description_{l}"),"duration":x.duration,"sessions":x.sessions,"price":x.price,"image":x.image}

class BookingIn(BaseModel):
    service_id:int; day:date; time:str; name:str; phone:str; email:str=""; notes:str=""; locale:str="ar"
    @field_validator("name")
    @classmethod
    def nm(cls,v):
        if len(v.strip())<2: raise ValueError("name")
        return v.strip()
    @field_validator("phone")
    @classmethod
    def ph(cls,v):
        if not re.fullmatch(r"[+0-9 ()-]{7,25}",v): raise ValueError("phone")
        return v

app=FastAPI(title="Dr. Wael Al-Bash Dental Platform", docs_url=None if os.getenv("APP_ENV")=="production" else "/docs")
app.mount("/static",StaticFiles(directory=STATIC_DIR),name="static")
templates=Jinja2Templates(directory=BASE_DIR/"app"/"templates")

@app.middleware("http")
async def security_headers(request:Request, call_next):
    r=await call_next(request)
    r.headers["X-Content-Type-Options"]="nosniff"; r.headers["X-Frame-Options"]="DENY"; r.headers["Referrer-Policy"]="strict-origin-when-cross-origin"
    r.headers["Content-Security-Policy"]="default-src 'self'; img-src 'self' data: blob: https://*.openstreetmap.org; media-src 'self' https: blob:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' data: https://fonts.gstatic.com; script-src 'self' 'unsafe-inline'; connect-src 'self'; frame-src https://www.youtube.com https://player.vimeo.com; frame-ancestors 'none'"
    return r

@app.on_event("startup")
def startup():
    Base.metadata.create_all(engine)
    # Additive, repeatable migration; existing plans remain untouched.
    columns={c["name"] for c in inspect(engine).get_columns("treatment_plans")}
    with engine.begin() as connection:
        for name,kind in {"tooth":"VARCHAR(30) DEFAULT ''", "treatment_date":"DATE", "cost":"FLOAT", "created_at":"TIMESTAMP"}.items():
            if name not in columns: connection.execute(text(f"ALTER TABLE treatment_plans ADD COLUMN {name} {kind}"))
    with SessionLocal() as s:
        if not s.scalar(select(User).where(User.email==ADMIN_EMAIL)):
            s.add(User(email=ADMIN_EMAIL,password_hash=hash_password(ADMIN_PASSWORD),role="admin"))
        if not s.scalar(select(Service.id).limit(1)):
            seed=[("implants","زراعة الأسنان","İmplant","Dental Implants","تعويض الأسنان المفقودة.","Eksik dişlerin implant ile tamamlanması.","Replacement of missing teeth."),("cleaning","تنظيف الأسنان","Diş Taşı Temizliği","Dental Cleaning","إزالة الجير والتصبغات.","Diş taşı ve lekelerin temizliği.","Plaque and stain removal."),("orthodontics","تقويم الأسنان","Ortodonti","Orthodontics","تحسين اصطفاف الأسنان والعضة.","Diş dizilimi ve kapanış düzenleme.","Alignment and bite improvement."),("whitening","تبييض الأسنان","Diş Beyazlatma","Whitening","تفتيح آمن ومخطط للابتسامة.","Güvenli diş beyazlatma.","Planned and safe whitening."),("root-canal","حشو العصب","Kanal Tedavisi","Root Canal","علاج جذور الأسنان بعناية دقيقة.","Kök kanal tedavisi.","Precise root canal treatment."),("pediatric","طب أسنان الأطفال","Çocuk Diş Hekimliği","Pediatric Dentistry","رعاية مريحة للأطفال.","Çocuklara uygun diş bakımı.","Gentle dental care for children.")]
            for i,a in enumerate(seed): s.add(Service(slug=a[0],title_ar=a[1],title_tr=a[2],title_en=a[3],description_ar=a[4],description_tr=a[5],description_en=a[6],duration=30,sort_order=i))
        for wd in range(7):
            if not s.scalar(select(WorkingHour).where(WorkingHour.weekday==wd)):
                s.add(WorkingHour(weekday=wd,enabled=wd<6,start_time=time(9),end_time=time(17),break_start=time(13),break_end=time(14)))
        defaults={
            "doctor_name_ar":"د. وائل الباش",
            "doctor_name_en":"Dr. Wael Al-Bash",
            "phone":"+90 555 000 0000",
            "whatsapp":"905550000000",
            "email":"info@waelbash.com",
            "address_ar":"سيتم تحديث عنوان العيادة عند الافتتاح",
            "address_tr":"Klinik adresi açılışta güncellenecektir",
            "address_en":"Clinic address will be updated when opened",
            "hero_image":"/static/uploads/doctor/wael-hero-v5.webp",
            "hero_title_ar":"ابتسامة صحية .. لحياة أجمل",
            "hero_title_tr":"Sağlıklı bir gülüş, daha güzel bir hayat",
            "hero_title_en":"A healthier smile for a better life",
            "hero_subtitle_ar":"نقدم رعاية أسنان متكاملة بأحدث التقنيات في بيئة مريحة وآمنة، لنمنحك ابتسامة أكثر صحة وجمالًا وثقة.",
            "hero_subtitle_tr":"Modern teknolojilerle güvenli ve konforlu bir ortamda kapsamlı diş bakımı sunuyoruz.",
            "hero_subtitle_en":"Comprehensive modern dental care in a calm, safe environment built around health and confidence.",
            "about_ar":"طبيب أسنان يركز على الرعاية الحديثة، التواصل الواضح وتجربة مريحة للمريض.",
            "about_tr":"Modern bakım, açık iletişim ve konforlu hasta deneyimine odaklanan diş hekimi.",
            "about_en":"Dentist focused on modern care, clear communication and a comfortable patient experience.",
            "video_enabled":"1",
            "video_title_ar":"تعرف على د. وائل",
            "video_title_tr":"Dr. Wael'i tanıyın",
            "video_title_en":"Meet Dr. Wael",
            "video_subtitle_ar":"فيديو تعريفي قصير عن أسلوب الرعاية وتجربة المريض.",
            "video_subtitle_tr":"Tedavi yaklaşımı ve hasta deneyimi hakkında kısa tanıtım.",
            "video_subtitle_en":"A short introduction to the care approach and patient experience.",
            "video_url":"",
            "video_poster":"/static/uploads/doctor/wael-casual.jpeg"
        }
        for k,v in defaults.items():
            if not s.get(SiteSetting,k): s.add(SiteSetting(key=k,value=v))
        s.commit()

@app.get("/",response_class=HTMLResponse)
def home(request:Request,s:Session=Depends(db)):
    l=lang(request)
    services=s.scalars(select(Service).where(Service.active==True).order_by(Service.sort_order)).all()
    cases=s.scalars(select(ClinicalCase).where(ClinicalCase.status=="published").order_by(ClinicalCase.id.desc()).limit(6)).all()
    arts=s.scalars(select(Article).where(Article.published==True).order_by(Article.id.desc()).limit(3)).all()
    reviews=s.scalars(select(Review).where(Review.published==True).order_by(Review.id.desc()).limit(6)).all()
    faqs=s.scalars(select(FAQ).where(FAQ.published==True).order_by(FAQ.sort_order, FAQ.id)).all()
    r=templates.TemplateResponse(request,"home.html",{"request":request,"l":l,"t":I18N[l],"services":[tr_service(x,l) for x in services],"cases":cases,"settings":settings_dict(s),"articles":arts,"reviews":reviews,"faqs":faqs})
    r.set_cookie("lang",l,max_age=31536000,samesite="lax"); return r

@app.get("/booking",response_class=HTMLResponse)
def booking_page(request:Request,s:Session=Depends(db)):
    l=lang(request); services=s.scalars(select(Service).where(Service.active==True).order_by(Service.sort_order)).all(); r=templates.TemplateResponse(request,"booking.html",{"request":request,"l":l,"t":I18N[l],"services":[tr_service(x,l) for x in services],"settings":settings_dict(s)}); r.set_cookie("lang",l,max_age=31536000,samesite="lax"); return r

@app.get("/api/availability")
def availability(day:date, service_id:int, s:Session=Depends(db)):
    if day < date.today(): return {"slots":[]}
    if s.scalar(select(BlockedDate).where(BlockedDate.day==day)): return {"slots":[]}
    wh=s.scalar(select(WorkingHour).where(WorkingHour.weekday==day.weekday()))
    svc=s.get(Service,service_id)
    if not wh or not wh.enabled or not svc or not svc.active: return {"slots":[]}
    cur=datetime.combine(day,wh.start_time); end=datetime.combine(day,wh.end_time); step=timedelta(minutes=max(10,svc.duration)); out=[]
    reserved=s.scalars(select(Appointment).where(Appointment.slot_key!=None, Appointment.starts_at>=datetime.combine(day,time.min), Appointment.starts_at<=datetime.combine(day,time.max))).all()
    while cur+step<=end:
        in_break=wh.break_start and wh.break_end and cur<datetime.combine(day,wh.break_end) and cur+step>datetime.combine(day,wh.break_start)
        overlaps=any(cur<a.starts_at+timedelta(minutes=max(10,a.service.duration)) and cur+step>a.starts_at for a in reserved)
        if not in_break and not overlaps and (day>date.today() or cur>datetime.now()+timedelta(minutes=30)): out.append(cur.strftime("%H:%M"))
        cur+=step
    return {"slots":out}

@app.get("/api/availability/nearest")
def nearest_availability(service_id:int,s:Session=Depends(db)):
    svc=s.get(Service,service_id)
    if not svc or not svc.active: raise HTTPException(404,"service")
    for offset in range(30):
        day=date.today()+timedelta(days=offset)
        slots=availability(day,service_id,s)["slots"]
        if slots: return {"day":day.isoformat(),"time":slots[0]}
    return {"day":None,"time":None}

def send_email(s:Session,to:str,subject:str,html:str):
    if not to: return None
    api=os.getenv("RESEND_API_KEY","")
    if not api:
        s.add(EmailLog(recipient=to,subject=subject,status="configuration_required",error="RESEND_API_KEY missing")); return None
    payload=json.dumps({"from":os.getenv("EMAIL_FROM","Appointments <onboarding@resend.dev>"),"to":[to],"subject":subject,"html":html}).encode()
    req=urllib.request.Request("https://api.resend.com/emails",data=payload,headers={"Authorization":f"Bearer {api}","Content-Type":"application/json"},method="POST")
    try:
        with urllib.request.urlopen(req,timeout=10) as resp: data=json.loads(resp.read().decode()); pid=data.get("id","")
        s.add(EmailLog(recipient=to,subject=subject,status="sent",provider_id=pid)); return pid
    except Exception as e:
        s.add(EmailLog(recipient=to,subject=subject,status="failed",error=str(e)[:500])); return None

def email_text(locale,status,appt):
    dicts={"ar":{"pending":"تم استلام طلب موعدك","confirmed":"تم تأكيد موعدك","rejected":"تعذر قبول الموعد","cancelled":"تم إلغاء الموعد","rescheduled":"تم تعديل موعدك"},"tr":{"pending":"Randevu talebiniz alındı","confirmed":"Randevunuz onaylandı","rejected":"Randevu talebi kabul edilemedi","cancelled":"Randevunuz iptal edildi","rescheduled":"Randevunuz güncellendi"},"en":{"pending":"Booking request received","confirmed":"Appointment confirmed","rejected":"Appointment request declined","cancelled":"Appointment cancelled","rescheduled":"Appointment rescheduled"}}
    l=locale if locale in dicts else "ar"; subj=dicts[l].get(status,"Appointment update"); body=f"<h2>{subj}</h2><p>{appt.starts_at:%Y-%m-%d %H:%M}</p><p>{appt.service.title_en}</p><p><a href='{BASE_URL}/booking?lang={l}'>Book another appointment</a></p>"; return subj,body

@app.post("/api/bookings")
def create_booking(payload:BookingIn,s:Session=Depends(db)):
    svc=s.get(Service,payload.service_id)
    if not svc or not svc.active: raise HTTPException(404,"service")
    try: hh,mm=map(int,payload.time.split(":")); dt=datetime.combine(payload.day,time(hh,mm))
    except: raise HTTPException(422,"time")
    valid={x for x in availability(payload.day,payload.service_id,s)["slots"]}
    if payload.time not in valid: raise HTTPException(409,"slot_unavailable")
    patient=s.scalar(select(Patient).where(Patient.phone==payload.phone))
    if not patient:
        patient=Patient(name=payload.name,phone=payload.phone,email=payload.email); s.add(patient); s.flush()
    else:
        patient.name=payload.name; patient.email=payload.email or patient.email
    a=Appointment(patient_id=patient.id,service_id=svc.id,starts_at=dt,slot_key=slot_key(dt),status="pending",notes=payload.notes,locale=payload.locale if payload.locale in I18N else "ar")
    s.add(a)
    try:
        s.flush(); audit(s,"appointment.created","appointment",a.id,f"{dt.isoformat()} {svc.slug}","public"); subj,html=email_text(a.locale,"pending",a); send_email(s,patient.email,subj,html); s.commit()
    except IntegrityError:
        s.rollback(); raise HTTPException(409,"slot_unavailable")
    return {"ok":True,"id":a.id,"status":a.status,"starts_at":a.starts_at.isoformat()}

@app.get("/booking/confirmation/{appointment_id}",response_class=HTMLResponse)
def confirmation(appointment_id:int,request:Request,s:Session=Depends(db)):
    a=s.get(Appointment,appointment_id)
    if not a: raise HTTPException(404)
    l=lang(request); return templates.TemplateResponse(request,"confirmation.html",{"request":request,"a":a,"l":l,"t":I18N[l],"settings":settings_dict(s)})

@app.post("/contact")
def contact(name:str=Form(...),email:str=Form(""),phone:str=Form(""),body:str=Form(...),s:Session=Depends(db)):
    if len(body.strip())<5: raise HTTPException(422)
    s.add(Message(name=name.strip(),email=email.strip(),phone=phone.strip(),body=body.strip())); s.commit(); return RedirectResponse("/?sent=1",303)

@app.get("/admin/login",response_class=HTMLResponse)
def login_page(request:Request): return templates.TemplateResponse(request,"login.html",{"request":request,"error":None})

@app.post("/admin/login")
def login(request:Request,email:str=Form(...),password:str=Form(...),s:Session=Depends(db)):
    u=s.scalar(select(User).where(User.email==email.lower().strip()))
    if not u or not verify_password(password,u.password_hash): return templates.TemplateResponse(request,"login.html",{"request":request,"error":"بيانات الدخول غير صحيحة"},status_code=401)
    tok=serializer.dumps({"uid":u.id}); r=RedirectResponse("/admin",303); r.set_cookie("wael_session",tok,httponly=True,samesite="strict",secure=os.getenv("APP_ENV")=="production",max_age=43200); return r

@app.post("/admin/logout")
def logout(): r=RedirectResponse("/admin/login",303); r.delete_cookie("wael_session"); return r

@app.get("/admin",response_class=HTMLResponse)
def admin(request:Request,s:Session=Depends(db),u:User=Depends(require_admin)):
    today=date.today(); start=datetime.combine(today,time.min); end=datetime.combine(today,time.max)
    stats={"today":s.scalar(select(func.count(Appointment.id)).where(Appointment.starts_at>=start,Appointment.starts_at<=end)) or 0,"patients":s.scalar(select(func.count(Patient.id))) or 0,"pending":s.scalar(select(func.count(Appointment.id)).where(Appointment.status=="pending")) or 0,"messages":s.scalar(select(func.count(Message.id))) or 0}
    appts=s.scalars(select(Appointment).order_by(Appointment.starts_at.desc()).limit(50)).all(); patients=s.scalars(select(Patient).order_by(Patient.id.desc()).limit(50)).all(); services=s.scalars(select(Service).order_by(Service.sort_order)).all(); cases=s.scalars(select(ClinicalCase).order_by(ClinicalCase.id.desc())).all(); media=s.scalars(select(Media).order_by(Media.id.desc()).limit(50)).all(); messages=s.scalars(select(Message).order_by(Message.id.desc()).limit(30)).all(); reviews=s.scalars(select(Review).order_by(Review.id.desc())).all(); faqs=s.scalars(select(FAQ).order_by(FAQ.sort_order, FAQ.id)).all(); articles=s.scalars(select(Article).order_by(Article.id.desc())).all()
    return templates.TemplateResponse(request,"admin.html",{"request":request,"u":u,"stats":stats,"appts":appts,"patients":patients,"services":services,"cases":cases,"media":media,"messages":messages,"settings":settings_dict(s),"reviews":reviews,"faqs":faqs,"articles":articles})

@app.post("/admin/appointments/{aid}/status")
def appointment_status(aid:int,status:str=Form(...),new_day:str=Form(""),new_time:str=Form(""),s:Session=Depends(db),u:User=Depends(require_admin)):
    if status not in {"confirmed","rejected","rescheduled","completed","cancelled","no_show"}: raise HTTPException(422)
    a=s.get(Appointment,aid)
    if not a: raise HTTPException(404)
    old=f"{a.status} {a.starts_at.isoformat()}"
    if status=="rescheduled":
        try: nd=date.fromisoformat(new_day); hh,mm=map(int,new_time.split(":")); newdt=datetime.combine(nd,time(hh,mm))
        except: raise HTTPException(422,"new slot")
        a.starts_at=newdt; a.slot_key=slot_key(newdt)
    elif status in {"rejected","cancelled"}: a.slot_key=None
    else: a.slot_key=slot_key(a.starts_at)
    a.status=status
    try:
        s.flush(); audit(s,"appointment.status_changed","appointment",a.id,f"{old} -> {status} {a.starts_at.isoformat()}",u.email); subj,html=email_text(a.locale,status,a); send_email(s,a.patient.email,subj,html); s.commit()
    except IntegrityError: s.rollback(); raise HTTPException(409,"slot already reserved")
    return RedirectResponse("/admin#appointments",303)

@app.post("/admin/services")
def service_create(title_ar:str=Form(...),title_tr:str=Form(...),title_en:str=Form(...),description_ar:str=Form(""),description_tr:str=Form(""),description_en:str=Form(""),duration:int=Form(30),price:str=Form(""),image:str=Form(""),s:Session=Depends(db),u:User=Depends(require_admin)):
    slug=re.sub(r"[^a-z0-9]+","-",title_en.lower()).strip("-")+"-"+secrets.token_hex(2)
    svc=Service(image=valid_image(image),slug=slug,title_ar=title_ar,title_tr=title_tr,title_en=title_en,description_ar=description_ar,description_tr=description_tr,description_en=description_en,duration=max(10,duration),price=valid_cost(price),sort_order=(s.scalar(select(func.max(Service.sort_order))) or 0)+1); s.add(svc); s.flush(); audit(s,"service.created","service",svc.id,title_ar,u.email); s.commit(); return RedirectResponse("/admin#services",303)

@app.post("/admin/services/{sid}/toggle")
def service_toggle(sid:int,s:Session=Depends(db),u:User=Depends(require_admin)):
    x=s.get(Service,sid)
    if not x: raise HTTPException(404)
    x.active=not x.active; audit(s,"service.toggled","service",sid,str(x.active),u.email); s.commit(); return RedirectResponse("/admin#services",303)

@app.post("/admin/settings")
def settings_save(
    hero_title_ar:str=Form(""), hero_title_tr:str=Form(""), hero_title_en:str=Form(""),
    hero_subtitle_ar:str=Form(""), hero_subtitle_tr:str=Form(""), hero_subtitle_en:str=Form(""),
    hero_image:str=Form(""), phone:str=Form(""), whatsapp:str=Form(""), email:str=Form(""),
    address_ar:str=Form(""), address_tr:str=Form(""), address_en:str=Form(""),
    about_ar:str=Form(""), about_tr:str=Form(""), about_en:str=Form(""),
    video_enabled:str=Form("0"), video_title_ar:str=Form(""), video_title_tr:str=Form(""), video_title_en:str=Form(""),
    video_subtitle_ar:str=Form(""), video_subtitle_tr:str=Form(""), video_subtitle_en:str=Form(""),
    video_url:str=Form(""), video_poster:str=Form(""),
    s:Session=Depends(db),u:User=Depends(require_admin)):
    vals=locals().copy(); vals.pop("s"); vals.pop("u")
    vals["video_enabled"]="1" if str(video_enabled).lower() in {"1","true","on","yes"} else "0"
    for k,v in vals.items():
        x=s.get(SiteSetting,k)
        if x: x.value=str(v)
        else: s.add(SiteSetting(key=k,value=str(v)))
    audit(s,"site.settings_updated","site","settings",json.dumps(vals,ensure_ascii=False),u.email); s.commit(); return RedirectResponse("/admin#cms",303)

@app.post("/admin/media")
async def media_upload(request:Request,category:str=Form("General"),file:UploadFile=File(...),s:Session=Depends(db),u:User=Depends(require_admin)):
    mime=file.content_type or mimetypes.guess_type(file.filename or "")[0] or ""
    if mime not in ALLOWED_MIME: raise HTTPException(415,"unsupported file")
    content=await file.read(MAX_UPLOAD+1)
    if len(content)>MAX_UPLOAD: raise HTTPException(413,"file too large")
    ext={"image/jpeg":"jpg","image/png":"png","image/webp":"webp","application/pdf":"pdf","video/mp4":"mp4"}[mime]; name=f"{uuid.uuid4().hex}.{ext}"; path=UPLOAD_DIR/name; path.write_bytes(content)
    m=Media(filename=(file.filename or name)[:255],path=f"/static/uploads/media/{name}",mime=mime,category=category[:80]); s.add(m); s.flush(); audit(s,"media.uploaded","media",m.id,m.filename,u.email); s.commit(); return JSONResponse({"path":m.path}) if request.headers.get("accept")=="application/json" else RedirectResponse("/admin#media",303)

@app.post("/admin/patients/{pid}/note")
def add_note(pid:int,note:str=Form(...),s:Session=Depends(db),u:User=Depends(require_admin)):
    if not s.get(Patient,pid): raise HTTPException(404)
    s.add(ClinicalNote(patient_id=pid,note=note)); audit(s,"patient.note_added","patient",pid,"clinical note",u.email); s.commit(); return RedirectResponse(f"/admin/patients/{pid}",303)

def valid_cost(value):
    if not str(value).strip(): return None
    try: number=float(value)
    except ValueError: raise HTTPException(422,"invalid cost")
    if not math.isfinite(number) or number<0: raise HTTPException(422,"invalid cost")
    return number

def valid_image(value):
    value=value.strip()
    if value and (not value.startswith('/static/uploads/media/') or '..' in value or not value.lower().endswith(('.jpg','.jpeg','.png','.webp'))):
        raise HTTPException(422,"Choose an uploaded image")
    return value

def owned(s, model, key, pid):
    item=s.get(model,key)
    if not item or item.patient_id!=pid: raise HTTPException(404)
    return item

@app.post("/admin/patients/{pid}/plan")
@app.post("/admin/patients/{pid}/plan/{plan_id}/edit")
def save_plan(pid:int,plan_id:int=0,title:str=Form(...),status:str=Form("planned"),notes:str=Form(""),tooth:str=Form(""),treatment_date:str=Form(""),cost:str=Form(""),s:Session=Depends(db),u:User=Depends(require_admin)):
    if not s.get(Patient,pid): raise HTTPException(404)
    if status not in {"planned","in_progress","completed"} or not title.strip() or len(tooth)>30: raise HTTPException(422)
    try: day=date.fromisoformat(treatment_date) if treatment_date else None
    except ValueError: raise HTTPException(422,"invalid date")
    amount=valid_cost(cost)
    x=owned(s,TreatmentPlan,plan_id,pid) if plan_id else TreatmentPlan(patient_id=pid)
    x.title=title.strip(); x.status=status; x.notes=notes; x.tooth=tooth; x.treatment_date=day; x.cost=amount
    s.add(x);s.flush();audit(s,"patient.plan_updated" if plan_id else "patient.plan_added","patient",pid,title,u.email);s.commit()
    return RedirectResponse(f"/admin/patients/{pid}#plans",303)

@app.post("/admin/patients/{pid}/plan/{plan_id}/delete")
def delete_plan(pid:int,plan_id:int,s:Session=Depends(db),u:User=Depends(require_admin)):
    x=owned(s,TreatmentPlan,plan_id,pid);s.delete(x);audit(s,"patient.plan_deleted","patient",pid,x.title,u.email);s.commit()
    return RedirectResponse(f"/admin/patients/{pid}#plans",303)

@app.post("/admin/patients/{pid}/files")
async def patient_upload(pid:int,file:UploadFile=File(...),s:Session=Depends(db),u:User=Depends(require_admin)):
    if not s.get(Patient,pid): raise HTTPException(404)
    mime=file.content_type
    if mime not in {"image/jpeg","image/png","image/webp","application/pdf"}: raise HTTPException(415)
    content=await file.read(MAX_UPLOAD+1)
    if not content or len(content)>MAX_UPLOAD: raise HTTPException(413)
    folder=DATA_DIR/'patient_files';folder.mkdir(exist_ok=True)
    name=uuid.uuid4().hex;path=folder/name;path.write_bytes(content)
    x=PatientFile(patient_id=pid,filename=Path((file.filename or 'file').replace('\\','/')).name[:255],stored_name=name,mime=mime)
    try:
        s.add(x);audit(s,"patient.file_added","patient",pid,x.filename,u.email);s.commit()
    except Exception:
        path.unlink(missing_ok=True);raise
    return RedirectResponse(f"/admin/patients/{pid}#files",303)

@app.get("/admin/patients/{pid}/files/{fid}")
def patient_download(pid:int,fid:int,s:Session=Depends(db),u:User=Depends(require_admin)):
    x=owned(s,PatientFile,fid,pid);path=DATA_DIR/'patient_files'/x.stored_name
    if not path.is_file(): raise HTTPException(404)
    return FileResponse(path,media_type=x.mime,filename=x.filename,headers={"Cache-Control":"no-store"})

@app.post("/admin/patients/{pid}/files/{fid}/delete")
def patient_delete_file(pid:int,fid:int,s:Session=Depends(db),u:User=Depends(require_admin)):
    x=owned(s,PatientFile,fid,pid);path=DATA_DIR/'patient_files'/x.stored_name
    s.delete(x);audit(s,"patient.file_deleted","patient",pid,x.filename,u.email);s.commit();path.unlink(missing_ok=True)
    return RedirectResponse(f"/admin/patients/{pid}#files",303)

@app.get("/admin/patients/{pid}",response_class=HTMLResponse)
def patient_file(pid:int,request:Request,s:Session=Depends(db),u:User=Depends(require_admin)):
    p=s.get(Patient,pid)
    if not p: raise HTTPException(404)
    appts=s.scalars(select(Appointment).where(Appointment.patient_id==pid).order_by(Appointment.starts_at.desc())).all(); notes=s.scalars(select(ClinicalNote).where(ClinicalNote.patient_id==pid).order_by(ClinicalNote.id.desc())).all(); plans=s.scalars(select(TreatmentPlan).where(TreatmentPlan.patient_id==pid).order_by(TreatmentPlan.id.desc())).all()
    files=s.scalars(select(PatientFile).where(PatientFile.patient_id==pid).order_by(PatientFile.id.desc())).all()
    events=[(p.created_at,"إنشاء ملف المريض")]+[(n.created_at,"ملاحظة سريرية: "+n.note) for n in notes]+[(a.starts_at,"موعد: "+a.service.title_ar+" · "+a.status) for a in appts]+[(f.created_at,"إرفاق ملف: "+f.filename) for f in files]+[(x.created_at,"إضافة علاج: "+x.title) for x in plans if x.created_at]
    events.sort(key=lambda e:e[0],reverse=True)
    return templates.TemplateResponse(request,"patient.html",{"request":request,"p":p,"appts":appts,"notes":notes,"plans":plans,"files":files,"events":events})

@app.post("/admin/cases")
def case_create(title:str=Form(...),treatment_type:str=Form(""),description:str=Form(""),before_image:str=Form(""),after_image:str=Form(""),status:str=Form("draft"),s:Session=Depends(db),u:User=Depends(require_admin)):
    if status not in {"draft","private","published"}: raise HTTPException(422)
    x=ClinicalCase(title=title,treatment_type=treatment_type,description=description,before_image=valid_image(before_image),after_image=valid_image(after_image),status=status,case_date=date.today()); s.add(x); s.flush(); audit(s,"case.created","clinical_case",x.id,title,u.email); s.commit(); return RedirectResponse("/admin#cases",303)

@app.post("/admin/reviews")
def review_create(name:str=Form(...),body_ar:str=Form(""),body_tr:str=Form(""),body_en:str=Form(""),rating:int=Form(5),published:str=Form("0"),s:Session=Depends(db),u:User=Depends(require_admin)):
    x=Review(name=name.strip(),body_ar=body_ar.strip(),body_tr=body_tr.strip(),body_en=body_en.strip(),rating=max(1,min(5,rating)),published=str(published).lower() in {"1","true","on","yes"}); s.add(x); s.flush(); audit(s,"review.created","review",x.id,name,u.email); s.commit(); return RedirectResponse("/admin#reviews",303)

@app.post("/admin/faqs")
def faq_create(question_ar:str=Form(...),question_tr:str=Form(""),question_en:str=Form(""),answer_ar:str=Form(...),answer_tr:str=Form(""),answer_en:str=Form(""),published:str=Form("0"),s:Session=Depends(db),u:User=Depends(require_admin)):
    order=(s.scalar(select(func.max(FAQ.sort_order))) or 0)+1; x=FAQ(question_ar=question_ar.strip(),question_tr=question_tr.strip(),question_en=question_en.strip(),answer_ar=answer_ar.strip(),answer_tr=answer_tr.strip(),answer_en=answer_en.strip(),sort_order=order,published=str(published).lower() in {"1","true","on","yes"}); s.add(x); s.flush(); audit(s,"faq.created","faq",x.id,question_ar,u.email); s.commit(); return RedirectResponse("/admin#faq",303)

@app.post("/admin/articles")
def article_create(title_ar:str=Form(...),title_tr:str=Form(""),title_en:str=Form(""),body_ar:str=Form(""),body_tr:str=Form(""),body_en:str=Form(""),published:str=Form("0"),s:Session=Depends(db),u:User=Depends(require_admin)):
    base=(title_en or title_ar).lower(); slug=re.sub(r"[^a-z0-9]+","-",base).strip("-") or "article"; slug=f"{slug}-{secrets.token_hex(2)}"; x=Article(slug=slug,title_ar=title_ar.strip(),title_tr=title_tr.strip(),title_en=title_en.strip() or title_ar.strip(),body_ar=body_ar.strip(),body_tr=body_tr.strip(),body_en=body_en.strip(),published=str(published).lower() in {"1","true","on","yes"}); s.add(x); s.flush(); audit(s,"article.created","article",x.id,title_ar,u.email); s.commit(); return RedirectResponse("/admin#articles",303)

@app.get("/sitemap.xml")
def sitemap(s:Session=Depends(db)):
    urls=["/","/booking"]+[f"/?lang={x}" for x in ["ar","tr","en"]]
    xml="<?xml version='1.0' encoding='UTF-8'?><urlset xmlns='http://www.sitemaps.org/schemas/sitemap/0.9'>"+"".join(f"<url><loc>{BASE_URL}{u}</loc></url>" for u in urls)+"</urlset>"
    return HTMLResponse(xml,media_type="application/xml")

@app.get("/robots.txt")
def robots(): return HTMLResponse(f"User-agent: *\nAllow: /\nDisallow: /admin\nSitemap: {BASE_URL}/sitemap.xml",media_type="text/plain")

@app.exception_handler(404)
async def not_found(request,exc): return templates.TemplateResponse(request,"error.html",{"request":request,"code":404,"message":"الصفحة غير موجودة"},status_code=404)
@app.exception_handler(500)
async def server_error(request,exc): return templates.TemplateResponse(request,"error.html",{"request":request,"code":500,"message":"حدث خطأ غير متوقع"},status_code=500)

@app.post("/admin/cases/{cid}/edit")
async def case_edit(cid:int,request:Request,s:Session=Depends(db),u:User=Depends(require_admin)):
    x=s.get(ClinicalCase,cid)
    if not x: raise HTTPException(404)
    f=await request.form()
    if not f.get('title','').strip() or f.get('status') not in {'draft','private','published'}: raise HTTPException(422)
    for k in ['title','treatment_type','description','status']: setattr(x,k,str(f.get(k,'')))
    for k in ['before_image','after_image']:
        value=str(f.get(k,''));setattr(x,k,valid_image(value) if value!=getattr(x,k) else value)
    audit(s,"case.updated","clinical_case",cid,x.title,u.email);s.commit();return RedirectResponse('/admin#cases',303)

@app.post("/admin/cases/{cid}/delete")
def case_delete(cid:int,s:Session=Depends(db),u:User=Depends(require_admin)):
    x=s.get(ClinicalCase,cid)
    if not x: raise HTTPException(404)
    s.delete(x);audit(s,"case.deleted","clinical_case",cid,x.title,u.email);s.commit();return RedirectResponse('/admin#cases',303)

@app.post("/admin/services/{sid}/edit")
async def service_edit(sid:int,request:Request,s:Session=Depends(db),u:User=Depends(require_admin)):
    x=s.get(Service,sid)
    if not x: raise HTTPException(404)
    f=await request.form()
    if any(not str(f.get('title_'+lang,'')).strip() for lang in ['ar','tr','en']): raise HTTPException(422)
    try: duration=int(f.get('duration',30))
    except ValueError: raise HTTPException(422)
    if duration<10: raise HTTPException(422)
    x.duration=duration;x.price=valid_cost(f.get('price',''));x.image=valid_image(str(f.get('image',''))) if str(f.get('image',''))!=x.image else x.image
    for k in ['title_ar','title_tr','title_en','description_ar','description_tr','description_en']: setattr(x,k,str(f.get(k,'')))
    audit(s,"service.updated","service",sid,x.title_ar,u.email);s.commit();return RedirectResponse('/admin#services',303)
