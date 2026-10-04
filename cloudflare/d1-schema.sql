PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS patients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT NOT NULL DEFAULT '',
  identity_no TEXT,
  birth_date TEXT,
  created_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS patients_identity_no_uq
ON patients(identity_no)
WHERE identity_no IS NOT NULL AND identity_no <> '';

CREATE TABLE IF NOT EXISTS services (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE,
  title_ar TEXT NOT NULL,
  title_tr TEXT NOT NULL,
  title_en TEXT NOT NULL,
  description_ar TEXT NOT NULL,
  description_tr TEXT NOT NULL,
  description_en TEXT NOT NULL,
  image TEXT NOT NULL DEFAULT '',
  duration INTEGER NOT NULL,
  sessions INTEGER NOT NULL,
  price REAL,
  sort_order INTEGER NOT NULL,
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS appointments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  patient_id INTEGER NOT NULL,
  service_id INTEGER NOT NULL,
  starts_at TEXT NOT NULL,
  slot_key TEXT,
  status TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  locale TEXT NOT NULL DEFAULT 'ar',
  created_at TEXT NOT NULL,
  FOREIGN KEY(patient_id) REFERENCES patients(id),
  FOREIGN KEY(service_id) REFERENCES services(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS appointments_slot_key_uq
ON appointments(slot_key)
WHERE slot_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS appointments_starts_at_idx
ON appointments(starts_at);

CREATE INDEX IF NOT EXISTS appointments_patient_id_idx
ON appointments(patient_id);

CREATE INDEX IF NOT EXISTS appointments_service_id_idx
ON appointments(service_id);

CREATE TABLE IF NOT EXISTS articles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE,
  title_ar TEXT NOT NULL,
  title_tr TEXT NOT NULL,
  title_en TEXT NOT NULL,
  body_ar TEXT NOT NULL,
  body_tr TEXT NOT NULL,
  body_en TEXT NOT NULL,
  published INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  entity TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  detail TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS blocked_dates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  day TEXT NOT NULL UNIQUE,
  reason TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS clinical_cases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  treatment_type TEXT NOT NULL,
  description TEXT NOT NULL,
  before_image TEXT NOT NULL,
  after_image TEXT NOT NULL,
  status TEXT NOT NULL,
  case_date TEXT
);

CREATE TABLE IF NOT EXISTS clinical_notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  patient_id INTEGER NOT NULL,
  note TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY(patient_id) REFERENCES patients(id)
);

CREATE INDEX IF NOT EXISTS clinical_notes_patient_id_idx
ON clinical_notes(patient_id);

CREATE TABLE IF NOT EXISTS email_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  recipient TEXT NOT NULL,
  subject TEXT NOT NULL,
  status TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  error TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS faq (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  question_ar TEXT NOT NULL,
  question_tr TEXT NOT NULL,
  question_en TEXT NOT NULL,
  answer_ar TEXT NOT NULL,
  answer_tr TEXT NOT NULL,
  answer_en TEXT NOT NULL,
  sort_order INTEGER NOT NULL,
  published INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS media (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  filename TEXT NOT NULL,
  path TEXT NOT NULL,
  mime TEXT NOT NULL,
  category TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  body_ar TEXT NOT NULL,
  body_tr TEXT NOT NULL,
  body_en TEXT NOT NULL,
  rating INTEGER NOT NULL,
  published INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS site_settings (
  "key" TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS treatment_plans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  patient_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL,
  notes TEXT NOT NULL,
  tooth TEXT NOT NULL DEFAULT '',
  treatment_date TEXT,
  cost REAL,
  created_at TEXT NOT NULL,
  FOREIGN KEY(patient_id) REFERENCES patients(id)
);

CREATE INDEX IF NOT EXISTS treatment_plans_patient_id_idx
ON treatment_plans(patient_id);

CREATE TABLE IF NOT EXISTS patient_files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  patient_id INTEGER NOT NULL,
  filename TEXT NOT NULL,
  stored_name TEXT NOT NULL UNIQUE,
  mime TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY(patient_id) REFERENCES patients(id)
);

CREATE INDEX IF NOT EXISTS patient_files_patient_id_idx
ON patient_files(patient_id);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS working_hours (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  weekday INTEGER NOT NULL UNIQUE,
  enabled INTEGER NOT NULL DEFAULT 1,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  break_start TEXT,
  break_end TEXT
);

CREATE TABLE IF NOT EXISTS appointment_slot_overrides (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  day TEXT NOT NULL,
  slot_time TEXT NOT NULL,
  is_open INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(day, slot_time)
);

CREATE INDEX IF NOT EXISTS appointment_slot_overrides_day_idx
ON appointment_slot_overrides(day);
