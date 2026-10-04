INSERT OR IGNORE INTO services
(id,slug,title_ar,title_tr,title_en,description_ar,description_tr,description_en,image,duration,sessions,price,sort_order,active)
VALUES
(1,'root-canal','حشو العصب','Kanal Tedavisi','Root Canal','علاج جذور الأسنان بعناية دقيقة.','Kök kanal tedavisi.','Precise root canal treatment.','',30,1,NULL,4,1),
(2,'cleaning','تنظيف الأسنان','Diş Taşı Temizliği','Dental Cleaning','إزالة الجير والتصبغات.','Diş taşı ve lekelerin temizliği.','Plaque and stain removal.','',30,1,NULL,1,1),
(3,'whitening','تبييض الأسنان','Diş Beyazlatma','Whitening','تفتيح آمن ومخطط للابتسامة.','Güvenli diş beyazlatma.','Planned and safe whitening.','',30,1,NULL,3,1),
(4,'implants','زراعة الأسنان','İmplant','Dental Implants','تعويض الأسنان المفقودة.','Eksik dişlerin implant ile tamamlanması.','Replacement of missing teeth.','',30,1,NULL,0,1),
(5,'pediatric','طب أسنان الأطفال','Çocuk Diş Hekimliği','Pediatric Dentistry','رعاية مريحة للأطفال.','Çocuklara uygun diş bakımı.','Gentle dental care for children.','',30,1,NULL,5,1),
(6,'orthodontics','تقويم الأسنان','Ortodonti','Orthodontics','تحسين اصطفاف الأسنان والعضة.','Diş dizilimi ve kapanış düzenleme.','Alignment and bite improvement.','',30,1,NULL,2,1);

INSERT OR IGNORE INTO working_hours
(id,weekday,enabled,start_time,end_time,break_start,break_end)
VALUES
(1,0,1,'09:00','17:00','13:00','14:00'),
(2,1,1,'09:00','17:00','13:00','14:00'),
(3,2,1,'09:00','17:00','13:00','14:00'),
(4,3,1,'09:00','17:00','13:00','14:00'),
(5,4,1,'09:00','17:00','13:00','14:00'),
(6,5,1,'09:00','17:00','13:00','14:00'),
(7,6,0,'09:00','17:00','13:00','14:00');
