# تشغيل Dr. Wael على Netlify

تم تحويل نسخة الإنتاج من FastAPI/SQLite إلى Netlify Functions + Netlify Database، مع إبقاء ملفات الواجهة والتصميم نفسها.

## 1) استبدال ملفات المشروع
انسخ محتويات هذه الحزمة فوق مجلد المشروع الحالي `dr.wael`.

## 2) متغيرات Netlify المطلوبة
من Netlify: Project configuration > Environment variables أضف:

- `APP_SECRET`: قيمة عشوائية بطول 32 حرفًا على الأقل
- `BASE_URL`: رابط الموقع الفعلي؛ يمكن تركه ليستخدم `URL` الذي يوفره Netlify
- `ADMIN_EMAIL`: بريد دخول لوحة التحكم
- `ADMIN_PASSWORD`: كلمة مرور قوية (تُستخدم فقط إذا كانت قاعدة البيانات بلا مستخدم)
- `RESEND_API_KEY`: اختياري لإرسال البريد
- `EMAIL_FROM`: اختياري عند استخدام Resend
- `MAX_UPLOAD_MB`: مثل `10`

`NETLIFY_DB_URL` يتم توفيره تلقائيًا بواسطة Netlify Database ولا تضفه يدويًا.

## 3) محليًا
```powershell
npm install
netlify database migrations apply
netlify dev
```

## 4) الرفع إلى GitHub
```powershell
git add .
git commit -m "Run dental clinic on Netlify"
git push origin main
```

Netlify سيعمل Deploy تلقائيًا من GitHub، وسيطبق migrations على قاعدة الإنتاج.

## ملاحظات
- الصور والملفات الجديدة من لوحة التحكم تُحفظ في Netlify Blobs بدل نظام الملفات المؤقت.
- ملفات المرضى في مخزن `patient-files` خاص، والتنزيل يتطلب تسجيل الدخول. مكتبة الموقع في `media-uploads`.
- لا توجد بيانات دخول افتراضية لوظيفة Netlify؛ المتغيرات الثلاثة مطلوبة. قاعدة موجودة تحتفظ بالمستخدمين وكلمات مرورهم المشفرة.
- المايغريشن `20260928190000_patient_records.sql` يضيف حقول الخطط العلاجية وملفات المرضى دون حذف البيانات السابقة.
- ملفات CSS/JS/الصور الحالية تُنسخ إلى `public/static` أثناء build.
- FastAPI الأصلي بقي في `app/main.py` كمرجع محلي، لكنه ليس runtime الخاص بـNetlify.
