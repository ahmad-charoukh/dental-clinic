import os, tempfile, importlib
from datetime import date, timedelta
os.environ['APP_ENV']='test'
os.environ['DATABASE_URL']='sqlite:///./data/test.db'
os.environ['APP_SECRET']='test-secret-123456789'
os.environ['ADMIN_EMAIL']='admin@test.local'
os.environ['ADMIN_PASSWORD']='TestPass!123'
from fastapi.testclient import TestClient
from app.main import app, SessionLocal, Base, engine, Appointment, AuditLog
client=TestClient(app)

def setup_module():
    Base.metadata.drop_all(engine); Base.metadata.create_all(engine)
    with client: pass

def test_home_and_languages():
    assert client.get('/').status_code==200
    assert client.get('/?lang=tr').status_code==200
    assert client.get('/?lang=en').status_code==200

def test_booking_and_double_booking_database_constraint():
    d=(date.today()+timedelta(days=2))
    r=client.get(f'/api/availability?day={d.isoformat()}&service_id=1'); assert r.status_code==200 and r.json()['slots']
    slot=r.json()['slots'][0]
    payload={'service_id':1,'day':d.isoformat(),'time':slot,'name':'Patient A','phone':'+905551111111','email':'a@example.com','locale':'en'}
    a=client.post('/api/bookings',json=payload); assert a.status_code==200
    payload['name']='Patient B'; payload['phone']='+905552222222'; payload['email']='b@example.com'
    b=client.post('/api/bookings',json=payload); assert b.status_code==409

def test_admin_login_and_confirm_audit():
    r=client.post('/admin/login',data={'email':'admin@test.local','password':'TestPass!123'},follow_redirects=False); assert r.status_code==303
    cookie=r.cookies.get('wael_session'); assert cookie
    with SessionLocal() as s: aid=s.query(Appointment).first().id
    x=client.post(f'/admin/appointments/{aid}/status',data={'status':'confirmed'},cookies={'wael_session':cookie},follow_redirects=False); assert x.status_code==303
    with SessionLocal() as s:
        a=s.get(Appointment,aid); assert a.status=='confirmed' and a.slot_key
        assert s.query(AuditLog).filter(AuditLog.entity=='appointment').count()>=2

def test_service_crud_toggle_and_patient_private():
    r=client.post('/admin/login',data={'email':'admin@test.local','password':'TestPass!123'},follow_redirects=False); cookie=r.cookies.get('wael_session')
    cr=client.post('/admin/services',data={'title_ar':'فحص','title_tr':'Muayene','title_en':'Exam','duration':'20'},cookies={'wael_session':cookie},follow_redirects=False); assert cr.status_code==303
    client.cookies.clear()
    assert client.get('/admin').status_code==401
    assert client.get('/admin/patients/1').status_code==401
    assert client.get('/admin/patients/1',cookies={'wael_session':cookie}).status_code==200

def test_sitemap_robots():
    assert client.get('/sitemap.xml').status_code==200
    assert 'Disallow: /admin' in client.get('/robots.txt').text
