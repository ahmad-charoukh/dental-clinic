(() => {
  const header = document.getElementById('siteHeader');
  const toggle = document.getElementById('menuToggle');
  const drawer = document.getElementById('mobileDrawer');
  const modal = document.getElementById('videoModal');
  const frame = document.getElementById('videoFrame');
  const heroPoster = document.querySelector('.video-chip img');
  if (heroPoster) {
    const fallback = () => { heroPoster.src = '/static/uploads/doctor/wael-doctor-cutout-v6.png'; };
    heroPoster.addEventListener('error', fallback, {once:true});
    if (heroPoster.complete && !heroPoster.naturalWidth) fallback();
  }
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  addEventListener('scroll', () => header?.classList.toggle('scrolled', scrollY > 16), {passive:true});
  function setMenu(open) {
    if (!drawer || !toggle) return;
    drawer.classList.toggle('open', open);
    drawer.inert = !open;
    toggle.setAttribute('aria-expanded', String(open));
    toggle.classList.toggle('open', open);
  }
  toggle?.addEventListener('click', () => setMenu(!drawer.classList.contains('open')));
  drawer?.querySelectorAll('a').forEach(a => a.addEventListener('click', () => setMenu(false)));
  document.addEventListener('click', e => { if (!header?.contains(e.target)) setMenu(false); });
  addEventListener('keydown', e => {
    if (e.key === 'Escape' && drawer?.classList.contains('open')) { setMenu(false); toggle?.focus(); }
  });
  matchMedia('(min-width: 1251px)').addEventListener('change', () => setMenu(false));
  if (!reduced) {
    const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('shown'); io.unobserve(e.target); } }), {threshold:.13});
    document.querySelectorAll('[data-reveal]').forEach(el => io.observe(el));
  } else document.querySelectorAll('[data-reveal]').forEach(el => el.classList.add('shown'));
  document.querySelectorAll('[data-compare]').forEach(c => { const r=c.querySelector('input'), wrap=c.querySelector('.before-wrap'), img=wrap.querySelector('img'), h=c.querySelector('.handle'); const set=()=>{wrap.style.width=r.value+'%';h.style.left=r.value+'%';img.style.width=c.clientWidth+'px'}; r.addEventListener('input',set); addEventListener('resize',set,{passive:true}); set(); });
  function youtubeEmbed(url){ try { const u=new URL(url); let id=''; if(u.hostname.includes('youtu.be')) id=u.pathname.slice(1); else id=u.searchParams.get('v') || u.pathname.split('/').pop(); return id ? `https://www.youtube.com/embed/${id}?autoplay=1&rel=0` : ''; } catch { return ''; } }
  function openVideo(url){ frame.innerHTML=''; const safe=(url||'').trim(); if(!safe){ frame.innerHTML='<div class="video-placeholder"><b>الفيديو جاهز للربط من لوحة التحكم</b><p>ارفع MP4 أو أضف رابط الفيديو من CMS.</p></div>'; }
    else if(/youtube\.com|youtu\.be/.test(safe)){ const src=youtubeEmbed(safe); frame.innerHTML=`<iframe src="${src}" title="Video" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe>`; }
    else { const v=document.createElement('video'); v.src=safe; v.controls=true; v.autoplay=true; v.playsInline=true; frame.appendChild(v); }
    modal.classList.add('open'); modal.setAttribute('aria-hidden','false'); document.body.style.overflow='hidden'; }
  function closeVideo(){ modal.classList.remove('open'); modal.setAttribute('aria-hidden','true'); frame.innerHTML=''; document.body.style.overflow=''; }
  document.querySelectorAll('[data-video-open]').forEach(b=>b.addEventListener('click',()=>openVideo(b.dataset.url)));
  document.querySelectorAll('[data-video-close]').forEach(b=>b.addEventListener('click',closeVideo));
  modal?.addEventListener('click',e=>{if(e.target===modal) closeVideo()});
  addEventListener('keydown',e=>{if(e.key==='Escape') closeVideo()});
})();
