-- Preserve constraints from the original SQLite application.
CREATE UNIQUE INDEX IF NOT EXISTS users_email_uq ON users (email);
CREATE UNIQUE INDEX IF NOT EXISTS services_slug_uq ON services (slug);
CREATE UNIQUE INDEX IF NOT EXISTS appointments_slot_key_uq ON appointments (slot_key) WHERE slot_key IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS blocked_dates_day_uq ON blocked_dates (day);
CREATE INDEX IF NOT EXISTS appointments_starts_at_idx ON appointments (starts_at);
CREATE INDEX IF NOT EXISTS appointments_patient_id_idx ON appointments (patient_id);
CREATE INDEX IF NOT EXISTS appointments_service_id_idx ON appointments (service_id);

-- Seed users from the existing wael.db
INSERT INTO users (id, email, password_hash, role, active, created_at) VALUES (1, 'admin@waelbash.local', 'scrypt$f7c8bf6d566cc07aa9c8fa12e87ad7ea$31cbe32ae698c532325eb39cfc6cbf127f1b295517c2eae4a814a0fbbe9f10fe', 'admin', TRUE, '2026-09-26 04:40:34.857445') ON CONFLICT DO NOTHING;
SELECT setval(pg_get_serial_sequence('users', 'id'), COALESCE((SELECT MAX(id) FROM users), 1), true);

-- Seed services from the existing wael.db
INSERT INTO services (id, slug, title_ar, title_tr, title_en, description_ar, description_tr, description_en, image, duration, sessions, price, sort_order, active) VALUES (1, 'root-canal', 'حشو العصب', 'Kanal Tedavisi', 'Root Canal', 'علاج جذور الأسنان بعناية دقيقة.', 'Kök kanal tedavisi.', 'Precise root canal treatment.', '', 30, 1, NULL, 4, TRUE) ON CONFLICT DO NOTHING;
INSERT INTO services (id, slug, title_ar, title_tr, title_en, description_ar, description_tr, description_en, image, duration, sessions, price, sort_order, active) VALUES (2, 'cleaning', 'تنظيف الأسنان', 'Diş Taşı Temizliği', 'Dental Cleaning', 'إزالة الجير والتصبغات.', 'Diş taşı ve lekelerin temizliği.', 'Plaque and stain removal.', '', 30, 1, NULL, 1, TRUE) ON CONFLICT DO NOTHING;
INSERT INTO services (id, slug, title_ar, title_tr, title_en, description_ar, description_tr, description_en, image, duration, sessions, price, sort_order, active) VALUES (3, 'whitening', 'تبييض الأسنان', 'Diş Beyazlatma', 'Whitening', 'تفتيح آمن ومخطط للابتسامة.', 'Güvenli diş beyazlatma.', 'Planned and safe whitening.', '', 30, 1, NULL, 3, TRUE) ON CONFLICT DO NOTHING;
INSERT INTO services (id, slug, title_ar, title_tr, title_en, description_ar, description_tr, description_en, image, duration, sessions, price, sort_order, active) VALUES (4, 'implants', 'زراعة الأسنان', 'İmplant', 'Dental Implants', 'تعويض الأسنان المفقودة.', 'Eksik dişlerin implant ile tamamlanması.', 'Replacement of missing teeth.', '', 30, 1, NULL, 0, TRUE) ON CONFLICT DO NOTHING;
INSERT INTO services (id, slug, title_ar, title_tr, title_en, description_ar, description_tr, description_en, image, duration, sessions, price, sort_order, active) VALUES (5, 'pediatric', 'طب أسنان الأطفال', 'Çocuk Diş Hekimliği', 'Pediatric Dentistry', 'رعاية مريحة للأطفال.', 'Çocuklara uygun diş bakımı.', 'Gentle dental care for children.', '', 30, 1, NULL, 5, TRUE) ON CONFLICT DO NOTHING;
INSERT INTO services (id, slug, title_ar, title_tr, title_en, description_ar, description_tr, description_en, image, duration, sessions, price, sort_order, active) VALUES (6, 'orthodontics', 'تقويم الأسنان', 'Ortodonti', 'Orthodontics', 'تحسين اصطفاف الأسنان والعضة.', 'Diş dizilimi ve kapanış düzenleme.', 'Alignment and bite improvement.', '', 30, 1, NULL, 2, TRUE) ON CONFLICT DO NOTHING;
SELECT setval(pg_get_serial_sequence('services', 'id'), COALESCE((SELECT MAX(id) FROM services), 1), true);

-- Seed patients from the existing wael.db
INSERT INTO patients (id, name, phone, email, created_at) VALUES (1, 'MAHMUD AZİZ', '+905392298079', 'charoukhahmad@gmail.com', '2026-09-26 19:31:35.031719');
SELECT setval(pg_get_serial_sequence('patients', 'id'), COALESCE((SELECT MAX(id) FROM patients), 1), true);

-- Seed appointments from the existing wael.db
INSERT INTO appointments (id, patient_id, service_id, starts_at, slot_key, status, notes, locale, created_at) VALUES (1, 1, 4, '2026-10-02 16:30:00.000000', '202610021630', 'confirmed', '', 'ar', '2026-09-26 19:31:35.058734');
SELECT setval(pg_get_serial_sequence('appointments', 'id'), COALESCE((SELECT MAX(id) FROM appointments), 1), true);

-- Seed working_hours from the existing wael.db
INSERT INTO working_hours (id, weekday, enabled, start_time, end_time, break_start, break_end) VALUES (1, 0, TRUE, '09:00:00.000000', '17:00:00.000000', '13:00:00.000000', '14:00:00.000000') ON CONFLICT DO NOTHING;
INSERT INTO working_hours (id, weekday, enabled, start_time, end_time, break_start, break_end) VALUES (2, 1, TRUE, '09:00:00.000000', '17:00:00.000000', '13:00:00.000000', '14:00:00.000000') ON CONFLICT DO NOTHING;
INSERT INTO working_hours (id, weekday, enabled, start_time, end_time, break_start, break_end) VALUES (3, 2, TRUE, '09:00:00.000000', '17:00:00.000000', '13:00:00.000000', '14:00:00.000000') ON CONFLICT DO NOTHING;
INSERT INTO working_hours (id, weekday, enabled, start_time, end_time, break_start, break_end) VALUES (4, 3, TRUE, '09:00:00.000000', '17:00:00.000000', '13:00:00.000000', '14:00:00.000000') ON CONFLICT DO NOTHING;
INSERT INTO working_hours (id, weekday, enabled, start_time, end_time, break_start, break_end) VALUES (5, 4, TRUE, '09:00:00.000000', '17:00:00.000000', '13:00:00.000000', '14:00:00.000000') ON CONFLICT DO NOTHING;
INSERT INTO working_hours (id, weekday, enabled, start_time, end_time, break_start, break_end) VALUES (6, 5, TRUE, '09:00:00.000000', '17:00:00.000000', '13:00:00.000000', '14:00:00.000000') ON CONFLICT DO NOTHING;
INSERT INTO working_hours (id, weekday, enabled, start_time, end_time, break_start, break_end) VALUES (7, 6, FALSE, '09:00:00.000000', '17:00:00.000000', '13:00:00.000000', '14:00:00.000000') ON CONFLICT DO NOTHING;
SELECT setval(pg_get_serial_sequence('working_hours', 'id'), COALESCE((SELECT MAX(id) FROM working_hours), 1), true);

-- Seed site_settings from the existing wael.db
INSERT INTO site_settings ("key", value) VALUES ('doctor_name_ar', 'د. وائل الباش') ON CONFLICT DO NOTHING;
INSERT INTO site_settings ("key", value) VALUES ('doctor_name_en', 'Dr. Wael Al-Bash') ON CONFLICT DO NOTHING;
INSERT INTO site_settings ("key", value) VALUES ('phone', '+90 555 000 0000') ON CONFLICT DO NOTHING;
INSERT INTO site_settings ("key", value) VALUES ('whatsapp', '905550000000') ON CONFLICT DO NOTHING;
INSERT INTO site_settings ("key", value) VALUES ('email', 'info@waelbash.com') ON CONFLICT DO NOTHING;
INSERT INTO site_settings ("key", value) VALUES ('address_ar', 'سيتم تحديث عنوان العيادة عند الافتتاح') ON CONFLICT DO NOTHING;
INSERT INTO site_settings ("key", value) VALUES ('address_tr', 'Klinik adresi açılışta güncellenecektir') ON CONFLICT DO NOTHING;
INSERT INTO site_settings ("key", value) VALUES ('address_en', 'Clinic address will be updated when opened') ON CONFLICT DO NOTHING;
INSERT INTO site_settings ("key", value) VALUES ('hero_image', '/static/uploads/doctor/wael-hero-v5.webp') ON CONFLICT DO NOTHING;
INSERT INTO site_settings ("key", value) VALUES ('about_ar', 'طبيب أسنان يركز على الرعاية الحديثة، التواصل الواضح وتجربة مريحة للمريض.') ON CONFLICT DO NOTHING;
INSERT INTO site_settings ("key", value) VALUES ('about_tr', 'Modern bakım, açık iletişim ve konforlu hasta deneyimine odaklanan diş hekimi.') ON CONFLICT DO NOTHING;
INSERT INTO site_settings ("key", value) VALUES ('about_en', 'Dentist focused on modern care, clear communication and a comfortable patient experience.') ON CONFLICT DO NOTHING;
INSERT INTO site_settings ("key", value) VALUES ('hero_title_ar', 'ابتسامة صحية .. لحياة أجمل') ON CONFLICT DO NOTHING;
INSERT INTO site_settings ("key", value) VALUES ('hero_title_tr', 'Sağlıklı bir gülüş, daha güzel bir hayat') ON CONFLICT DO NOTHING;
INSERT INTO site_settings ("key", value) VALUES ('hero_title_en', 'A healthier smile for a better life') ON CONFLICT DO NOTHING;
INSERT INTO site_settings ("key", value) VALUES ('hero_subtitle_ar', 'نقدم رعاية أسنان متكاملة بأحدث التقنيات في بيئة مريحة وآمنة، لنمنحك ابتسامة أكثر صحة وجمالًا وثقة.') ON CONFLICT DO NOTHING;
INSERT INTO site_settings ("key", value) VALUES ('hero_subtitle_tr', 'Modern teknolojilerle güvenli ve konforlu bir ortamda kapsamlı diş bakımı sunuyoruz.') ON CONFLICT DO NOTHING;
INSERT INTO site_settings ("key", value) VALUES ('hero_subtitle_en', 'Comprehensive modern dental care in a calm, safe environment built around health and confidence.') ON CONFLICT DO NOTHING;
INSERT INTO site_settings ("key", value) VALUES ('video_enabled', '1') ON CONFLICT DO NOTHING;
INSERT INTO site_settings ("key", value) VALUES ('video_title_ar', 'تعرف على د. وائل') ON CONFLICT DO NOTHING;
INSERT INTO site_settings ("key", value) VALUES ('video_title_tr', 'Dr. Wael''i tanıyın') ON CONFLICT DO NOTHING;
INSERT INTO site_settings ("key", value) VALUES ('video_title_en', 'Meet Dr. Wael') ON CONFLICT DO NOTHING;
INSERT INTO site_settings ("key", value) VALUES ('video_subtitle_ar', 'فيديو تعريفي قصير عن أسلوب الرعاية وتجربة المريض.') ON CONFLICT DO NOTHING;
INSERT INTO site_settings ("key", value) VALUES ('video_subtitle_tr', 'Tedavi yaklaşımı ve hasta deneyimi hakkında kısa tanıtım.') ON CONFLICT DO NOTHING;
INSERT INTO site_settings ("key", value) VALUES ('video_subtitle_en', 'A short introduction to the care approach and patient experience.') ON CONFLICT DO NOTHING;
INSERT INTO site_settings ("key", value) VALUES ('video_url', '') ON CONFLICT DO NOTHING;
INSERT INTO site_settings ("key", value) VALUES ('video_poster', '/static/uploads/doctor/wael-doctor-cutout-v6.png') ON CONFLICT DO NOTHING;

-- Seed email_logs from the existing wael.db
INSERT INTO email_logs (id, recipient, subject, status, provider_id, error, created_at) VALUES (1, 'charoukhahmad@gmail.com', 'تم استلام طلب موعدك', 'configuration_required', '', 'RESEND_API_KEY missing', '2026-09-26 19:31:35.067122');
INSERT INTO email_logs (id, recipient, subject, status, provider_id, error, created_at) VALUES (2, 'charoukhahmad@gmail.com', 'تم تأكيد موعدك', 'configuration_required', '', 'RESEND_API_KEY missing', '2026-09-27 11:20:51.222374');
SELECT setval(pg_get_serial_sequence('email_logs', 'id'), COALESCE((SELECT MAX(id) FROM email_logs), 1), true);

-- Seed audit_logs from the existing wael.db
INSERT INTO audit_logs (id, actor, action, entity, entity_id, detail, created_at) VALUES (1, 'public', 'appointment.created', 'appointment', '1', '2026-10-02T16:30:00 implants', '2026-09-26 19:31:35.061244');
INSERT INTO audit_logs (id, actor, action, entity, entity_id, detail, created_at) VALUES (2, 'admin@waelbash.local', 'appointment.status_changed', 'appointment', '1', 'pending 2026-10-02T16:30:00 -> confirmed 2026-10-02T16:30:00', '2026-09-27 11:20:51.193867');
SELECT setval(pg_get_serial_sequence('audit_logs', 'id'), COALESCE((SELECT MAX(id) FROM audit_logs), 1), true);

