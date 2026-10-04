CREATE TABLE IF NOT EXISTS upload_objects(scope TEXT NOT NULL, key TEXT NOT NULL, data BLOB NOT NULL, PRIMARY KEY(scope,key));
CREATE TRIGGER IF NOT EXISTS appointments_no_overlap_insert BEFORE INSERT ON appointments
WHEN NEW.slot_key IS NOT NULL
BEGIN
 SELECT RAISE(ABORT,'slot_unavailable') WHERE EXISTS (
 SELECT 1 FROM appointments a JOIN services s ON s.id=a.service_id
 WHERE a.slot_key IS NOT NULL AND a.starts_at < datetime(NEW.starts_at,'+'||(SELECT duration FROM services WHERE id=NEW.service_id)||' minutes')
 AND datetime(a.starts_at,'+'||s.duration||' minutes') > NEW.starts_at);
END;
CREATE TRIGGER IF NOT EXISTS appointments_no_overlap_update BEFORE UPDATE OF starts_at,slot_key,service_id ON appointments
WHEN NEW.slot_key IS NOT NULL
BEGIN
 SELECT RAISE(ABORT,'slot_unavailable') WHERE EXISTS (
 SELECT 1 FROM appointments a JOIN services s ON s.id=a.service_id
 WHERE a.id<>NEW.id AND a.slot_key IS NOT NULL AND a.starts_at < datetime(NEW.starts_at,'+'||(SELECT duration FROM services WHERE id=NEW.service_id)||' minutes')
 AND datetime(a.starts_at,'+'||s.duration||' minutes') > NEW.starts_at);
END;
