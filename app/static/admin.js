(() => {
  const q = (s, root = document) => root.querySelector(s);
  const qa = (s, root = document) => [...root.querySelectorAll(s)];
  const sidebar = q('.sidebar'), menu = q('.admin-menu'), backdrop = q('.sidebar-backdrop');
  const sections = qa('.admin-main > section');
  const links = qa('.sidebar nav a');
  const mobile = matchMedia('(max-width:800px)');
  function setMenu(open) {
    if (!sidebar) return;
    sidebar.classList.toggle('open', open);
    sidebar.inert = mobile.matches && !open;
    menu?.setAttribute('aria-expanded', String(open));
    if (backdrop) backdrop.hidden = !open;
  }
  menu?.addEventListener('click', () => setMenu(!sidebar.classList.contains('open')));
  backdrop?.addEventListener('click', () => setMenu(false));
  mobile.addEventListener('change', () => setMenu(false));
  setMenu(false);
  function showSection(focus = false) {
    if (!sections.length) return;
    const id = location.hash.slice(1);
    const active = sections.find(s => s.id === id) || sections[0];
    sections.forEach(s => { s.hidden = s !== active; });
    links.forEach(a => {
      if (a.hash === '#' + active.id) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });
    const label = q('h2', active)?.textContent || 'نظرة عامة';
    q('#pageTitle').textContent = active.id === 'overview' ? 'نظرة عامة' : label;
    q('#sectionCrumb').textContent = active.id === 'overview' ? 'الرئيسية' : label;
    setMenu(false);
    if (focus) { window.scrollTo(0, 0); q('#pageTitle').focus({preventScroll:true}); }
  }
  addEventListener('hashchange', () => showSection(true));
  showSection();
  links.forEach(a => a.addEventListener('click', () => { if (a.hash === location.hash) setMenu(false); }));
  addEventListener('keydown', e => { if (e.key === 'Escape' && sidebar?.classList.contains('open')) { setMenu(false); menu?.focus(); } });
  const notice = q('#adminNotice');
  try { if (notice && sessionStorage.getItem('wael-admin-saved')) { notice.textContent = 'تم حفظ التغييرات بنجاح.'; notice.hidden = false; sessionStorage.removeItem('wael-admin-saved'); } } catch {}
  // Keep all settings fields in one form, so saving a group never erases the others.
  const cms = q('#cms form');
  if (cms) {
    let group;
    [...cms.children].forEach(el => {
      if (el.tagName === 'H3') {
        group = document.createElement('details'); group.className = 'cms-group';
        group.open = !q('.cms-group', cms);
        const summary = document.createElement('summary'); summary.textContent = el.textContent;
        cms.insertBefore(group, el); group.append(summary); el.remove();
      } else if (group && el.tagName !== 'BUTTON') group.append(el);
    });
  }
  qa('[data-search]').forEach(input => {
    const section = input.closest('section'), rows = qa(input.dataset.search, section);
    const count = q('[data-result-count]', section);
    const empty = document.createElement('p'); empty.className = 'field-hint'; empty.hidden = true; empty.textContent = 'لا توجد نتائج مطابقة.';
    input.closest('.list-tools').after(empty);
    function filter() {
      const term = input.value.trim().toLocaleLowerCase(); let shown = 0;
      rows.forEach(row => { row.hidden = !row.textContent.toLocaleLowerCase().includes(term) || (section.id==='appointments' && ((q('#appointmentFilter')?.value && row.dataset.status!==q('#appointmentFilter').value) || (q('#appointmentDay')?.value && row.dataset.day!==q('#appointmentDay').value))); if (!row.hidden) shown++; });
      count.textContent = `${shown} من ${rows.length}`; empty.hidden = shown > 0 || (!term && !q('#appointmentFilter',section)?.value && !q('#appointmentDay',section)?.value);
    }
    input.addEventListener('input', filter);
    if(section.id==='appointments') {
      q('#appointmentFilter')?.addEventListener('change',filter);q('#appointmentDay')?.addEventListener('change',filter);
      q('#clearAppointments')?.addEventListener('click',()=>{input.value='';q('#appointmentFilter').value='';q('#appointmentDay').value='';filter()});
    }
    filter();
  });
  qa('[data-copy]').forEach(button => button.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(button.dataset.copy); button.textContent = 'تم نسخ الرابط'; }
    catch { const field = q('.media-path', button.parentElement); field?.focus(); field?.select(); button.textContent = 'حدد الرابط ثم انسخه'; }
  }));
  const picker = q('#mediaPicker'); let target;
  const media = qa('[data-media-path]').filter(el => el.dataset.mediaMime.startsWith('image/'));
  if (picker) {
    const items = q('#pickerItems');
    media.forEach(el => {
      const button = document.createElement('button'); button.type = 'button';
      const img = document.createElement('img'); img.src = el.dataset.mediaPath; img.alt = '';
      const name = document.createElement('span'); name.textContent = el.dataset.mediaName;
      button.append(img, name); items.append(button);
      button.addEventListener('click', () => { if (target) { target.value = el.dataset.mediaPath; target.dispatchEvent(new Event('input', {bubbles:true})); } picker.close(); });
    });
    if (!media.length) items.textContent = 'لا توجد صور مرفوعة بعد. ارفع صورة من مكتبة الملفات أولًا.';
    qa('[data-picker-close]').forEach(el => el.addEventListener('click', () => picker.close()));
    picker.addEventListener('click', e => { if (e.target === picker) { const r=picker.getBoundingClientRect(); if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom) picker.close(); } });
    qa('input[name=image],input[name=before_image],input[name=after_image],input[name=hero_image],input[name=video_poster]').forEach(input => {
      const button = document.createElement('button'); button.type='button'; button.className='image-picker-button'; button.textContent='اختيار من مكتبة الصور';
      // Keep the button outside the input label.
      const field=input.closest('.field'); const preview=document.createElement('img'); preview.className='image-preview'; preview.alt='معاينة الصورة المختارة'; preview.hidden=true;
      const wrapper=document.createElement('div');wrapper.className='asset-field';field.before(wrapper);wrapper.append(field,button,preview);
      const refresh=()=>{ const value=input.value.trim(); preview.hidden=true; if (/^(\/static\/|https?:\/\/)/i.test(value)) preview.src=value; else preview.removeAttribute('src'); };
      preview.addEventListener('load',()=>{preview.hidden=false}); preview.addEventListener('error',()=>{preview.hidden=true});
      input.addEventListener('input', refresh); refresh();
      const uploadLabel=document.createElement('label');uploadLabel.className='field';
      const uploadText=document.createElement('span');uploadText.textContent='رفع صورة جديدة';
      const uploadFile=document.createElement('input');uploadFile.type='file';uploadFile.accept='image/jpeg,image/png,image/webp';
      const uploadStatus=document.createElement('small');uploadStatus.setAttribute('role','status');
      uploadLabel.append(uploadText,uploadFile,uploadStatus);wrapper.append(uploadLabel);
      uploadFile.addEventListener('change',async()=>{
        const file=uploadFile.files[0];if(!file)return;
        const body=new FormData();body.append('file',file);body.append('category',input.name==='image'?'Services':'Clinical Cases');
        const submit=qa('button:not([type=button])',input.form);submit.forEach(b=>b.disabled=true);uploadFile.disabled=true;uploadStatus.textContent='جارٍ رفع الصورة…';
        try{const response=await fetch('/admin/media',{method:'POST',body,headers:{Accept:'application/json'},credentials:'same-origin'});if(!response.ok)throw Error();const result=await response.json();input.value=result.path;refresh();uploadStatus.textContent='تم الرفع. احفظ النموذج لتطبيق الصورة.'}
        catch{uploadStatus.textContent='تعذر الرفع. تحقق من حجم الصورة ونوعها والجلسة.'}
        finally{uploadFile.disabled=false;submit.forEach(b=>b.disabled=false);uploadFile.value=''}
      });
      const remove=document.createElement('button');remove.type='button';remove.textContent='إزالة الصورة';remove.className='image-picker-button danger';wrapper.append(remove);
      remove.addEventListener('click',()=>{input.value='';refresh()});
      button.addEventListener('click',()=>{target=input;picker.showModal()});
    });
  }
  const upload = q('#media input[type=file]');
  if (upload) {
    const preview = document.createElement('img'); preview.className='upload-preview'; preview.alt='معاينة الملف قبل الرفع'; preview.hidden=true;
    upload.closest('.field').after(preview);
    let previewUrl;
    upload.addEventListener('change', () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      preview.hidden=true; preview.removeAttribute('src');
      const file=upload.files[0];
      if (file && ['image/jpeg','image/png','image/webp'].includes(file.type)) {
        previewUrl=URL.createObjectURL(file); preview.src=previewUrl; preview.hidden=false;
      }
    });
  }
  // Display form failures without discarding entered values; successful requests retain the server redirect.
  qa('form[method=post]').forEach(form => form.addEventListener('submit', async e => {
    if (!window.fetch || form.action.endsWith('/admin/logout')) return;
    e.preventDefault(); if (form.dataset.confirm && !confirm(form.dataset.confirm)) return; if (form.dataset.busy) return;
    const buttons=qa('button:not([type=button]),input[type=submit]',form);
    let error=q('.form-error',form); if (!error) {error=document.createElement('p');error.className='form-error';error.setAttribute('role','alert');form.prepend(error)} error.hidden=true;
    form.dataset.busy='1';buttons.forEach(b=>{b.disabled=true;b.classList.add('busy')});
    try {
      const response=await fetch(form.action,{method:'POST',body:new FormData(form),credentials:'same-origin'});
      if (!response.ok) {
        const messages={401:'انتهت الجلسة. افتح صفحة تسجيل الدخول في تبويب جديد ثم أعد المحاولة.',409:'هذا الموعد محجوز بالفعل. اختر وقتًا آخر.',413:'الملف أكبر من الحجم المسموح.',415:'نوع الملف غير مدعوم.',422:'تحقق من الحقول المطلوبة والقيم المدخلة.'};
        throw new Error(messages[response.status] || 'تعذر حفظ التغييرات. حاول مرة أخرى.');
      }
      if (!response.redirected) throw new Error('لم يصل تأكيد الحفظ من الخادم. تحقق من الاتصال قبل إعادة المحاولة.');
      try {sessionStorage.setItem('wael-admin-saved','1')} catch {}
      const destination=new URL(response.url,location.href);
      const section=form.closest('section[id]');
      if (section) destination.hash=section.id;
      if (destination.pathname===location.pathname && destination.search===location.search) { history.replaceState(null,'',destination.href); location.reload(); }
      else location.assign(destination.href);
    } catch (err) { error.textContent=err.message || 'تعذر الاتصال بالخادم.';error.hidden=false;error.scrollIntoView({block:'nearest'}); }
    finally {delete form.dataset.busy;buttons.forEach(b=>{b.disabled=false;b.classList.remove('busy')})}
  }));
})();
