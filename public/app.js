'use strict';
(() => {
  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];
  let currentUser = null;
  let authMode = 'login';
  let flashTimer;
  const portal = $('#portal');
  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const api = async (url, options = {}) => {
    let result;
    try {
      const response = await fetch(url, {
        credentials: 'same-origin',
        ...options,
        headers: options.body instanceof FormData ? options.headers : { 'Content-Type': 'application/json', ...(options.headers || {}) }
      });
      if (response.headers.get('content-type')?.includes('application/json')) result = await response.json();
      else result = {};
      if (!response.ok) throw new Error(result.error || `İstek başarısız (${response.status}).`);
      return result;
    } catch (err) { throw new Error(err.message || 'Bağlantı kurulamadı.'); }
  };
  function flash(message, isError = false) {
    clearTimeout(flashTimer);
    const el = $('#flash');
    el.textContent = message;
    el.classList.remove('hidden');
    el.classList.toggle('error', isError);
    flashTimer = setTimeout(() => el.classList.add('hidden'), 7000);
  }
  const openPortal = async () => {
    portal.classList.remove('hidden');
    document.body.classList.add('modal-open');
    $('#closePortal').focus();
    try {
      const result = await api('/api/me');
      currentUser = result.user;
      renderAuthState();
    } catch { flash('Sunucuya ulaşılamadı. Lütfen tekrar deneyin.', true); }
  };
  const closePortal = () => { portal.classList.add('hidden'); document.body.classList.remove('modal-open'); };
  ['#portalShortcut','#startProject','#contactPortal'].forEach(s => $(s).addEventListener('click', openPortal));
  $('#closePortal').addEventListener('click', closePortal);
  $('#portalBackdrop').addEventListener('click', closePortal);
  document.addEventListener('keydown', e => { if(e.key === 'Escape' && !portal.classList.contains('hidden')) closePortal(); });
  $('#year').textContent = String(new Date().getFullYear());
  const setAuthMode = mode => {
    authMode = mode;
    $('#loginTab').classList.toggle('active', mode === 'login');
    $('#registerTab').classList.toggle('active', mode === 'register');
    $('#authSubmit').textContent = mode === 'login' ? 'Giriş Yap ↗' : 'Hesap Oluştur ↗';
    $('#passwordInput').autocomplete = mode === 'login' ? 'current-password' : 'new-password';
    $('#passwordInput').placeholder = mode === 'login' ? 'Şifreniz' : 'En az 12 karakter';
  };
  $('#loginTab').addEventListener('click', () => setAuthMode('login'));
  $('#registerTab').addEventListener('click', () => setAuthMode('register'));
  $('#authForm').addEventListener('submit', async ev => {
    ev.preventDefault();
    const btn = $('#authSubmit'); btn.disabled = true;
    const body = Object.fromEntries(new FormData(ev.target));
    try { const result = await api(authMode === 'login' ? '/api/login' : '/api/register', { method: 'POST', body: JSON.stringify(body) }); currentUser = result.user; ev.target.reset(); renderAuthState(); flash('Hoş geldiniz!'); }
    catch (err) { flash(err.message, true); }
    finally { btn.disabled = false; }
  });
  $('#logoutBtn').addEventListener('click', async () => { try { await api('/api/logout', { method: 'POST', body: '{}' }); currentUser = null; renderAuthState(); flash('Oturum kapatıldı.'); } catch (e) { flash(e.message, true); } });
  const showView = view => {
    const admin = currentUser?.role === 'admin';
    if (view === 'prices' && !admin) view = 'jobs';
    for(const name of ['jobs','new','prices']) $(`#${name}View`).classList.toggle('hidden', view !== name);
    $$('.dash-nav button').forEach(btn => btn.classList.toggle('active', btn.dataset.view === view));
    if (view === 'jobs') loadJobs();
    if (view === 'prices') loadPrices();
  };
  $$('.dash-nav button').forEach(b => b.addEventListener('click', () => showView(b.dataset.view)));
  function renderAuthState() {
    $('#authArea').classList.toggle('hidden', !!currentUser);
    $('#dashboard').classList.toggle('hidden', !currentUser);
    if (currentUser) {
      $('#userEmail').textContent = currentUser.email;
      $('#dashboardTitle').textContent = currentUser.role === 'admin' ? 'Yönetici Paneli' : 'İşleriniz';
      $('#pricesTab').classList.toggle('hidden', currentUser.role !== 'admin');
      showView('jobs');
    }
  }
  const statusOptions = ['Alındı','İnceleniyor','Tasarımda','Kontrolde','Tamamlandı','Teslim edildi'];
  async function loadJobs() {
    const box = $('#jobList'); box.innerHTML = '<div class="empty-state">İşler yükleniyor...</div>';
    try {
      const {jobs} = await api('/api/jobs');
      if (!jobs.length) { box.innerHTML = '<div class="empty-state">Henüz iş bulunmuyor. “Yeni İş Gönder” bölümünden ilk talebinizi oluşturabilirsiniz.</div>'; return; }
      box.innerHTML = jobs.map(job => `<article class="job-card"><div class="job-top"><div><h3>${escapeHtml(job.title)}</h3><p>${escapeHtml(job.service)}</p></div><span class="status-pill">${escapeHtml(job.status)}</span></div><p class="job-meta">${escapeHtml(new Date(job.created_at).toLocaleString('tr-TR'))}${currentUser.role === 'admin' ? ' · ' + escapeHtml(job.customer_email) : ''}</p>${job.notes ? '<p>' + escapeHtml(job.notes) + '</p>' : ''}<div class="dash-label" style="margin:14px 0 4px">MÜŞTERİ DOSYALARI</div><div class="files-list">${job.files.filter(f=>f.direction!=='outgoing').map(f=>`<a href="/api/files/${encodeURIComponent(f.id)}" download>↓ ${escapeHtml(f.original_name)} (${Math.max(1,Math.round(f.size/1024))} KB)</a>`).join('')}</div>${job.files.some(f=>f.direction==='outgoing')?`<div class="dash-label" style="margin:18px 0 4px">TAMAMLANAN TASARIMLAR</div><div class="files-list">${job.files.filter(f=>f.direction==='outgoing').map(f=>`<a href="/api/files/${encodeURIComponent(f.id)}" download>↓ ${escapeHtml(f.original_name)} (${Math.max(1,Math.round(f.size/1024))} KB)</a>`).join('')}</div>`:''}${currentUser.role==='admin'?`<form class="stack-form" data-deliver="${escapeHtml(job.id)}" style="margin-top:18px"><label>Bitmiş tasarımı müşteriye teslim et<input name="files" type="file" multiple required accept=".stl,.ply,.obj,.3mf,.zip,.rar,.7z,.pdf,.jpg,.jpeg,.png,.webp,.dcm,.dicom"><small>En fazla 8 dosya, her biri 150 MB.</small></label><button class="btn btn-gold" type="submit">Dosyaları Teslim Et ↗</button></form><div class="status-row"><select aria-label="İş durumu" data-job="${escapeHtml(job.id)}">${statusOptions.map(status=>`<option ${job.status === status ? 'selected' : ''}>${escapeHtml(status)}</option>`).join('')}</select><button data-save="${escapeHtml(job.id)}">Güncelle</button></div>` : ''}</article>`).join('');
      $$('#jobList [data-deliver]').forEach(form => form.addEventListener('submit', async event => {
        event.preventDefault();
        const files=[...form.querySelector('input[type="file"]').files];
        if (!files.length || files.length>8 || files.some(file=>file.size>150*1024*1024)) {flash('1–8 dosya, en fazla 150 MB.',true);return;}
        const button=form.querySelector('button[type="submit"]');
        button.disabled=true;button.textContent='Yükleniyor...';
        try {
          await api(`/api/admin/jobs/${encodeURIComponent(form.dataset.deliver)}/deliver`,{method:'POST',body:new FormData(form)});
          flash('Tasarım dosyaları müşteriye teslim edildi.');await loadJobs();
        } catch(error) {flash(error.message,true);button.disabled=false;button.textContent='Dosyaları Teslim Et ↗';}
      }));
      $$('#jobList [data-save]').forEach(btn => btn.addEventListener('click', async () => {
        const jobId = btn.dataset.save; const select = $$('#jobList [data-job]').find(s => s.dataset.job === jobId);
        try { await api(`/api/admin/jobs/${encodeURIComponent(jobId)}`, {method:'PATCH',body:JSON.stringify({status:select.value})}); flash('İş durumu güncellendi.'); loadJobs(); } catch (e) { flash(e.message,true); }
      }));
    } catch (e) {box.innerHTML = '<div class="empty-state">İşler yüklenemedi.</div>'; flash(e.message,true);}
  }
  $('#jobForm').addEventListener('submit', async ev => {
    ev.preventDefault(); const btn = $('#sendJob'), fd = new FormData(ev.target);
    const files = fd.getAll('files').filter(f => f instanceof File && f.size);
    if(!files.length || files.length > 8 || files.some(f => f.size > 150*1024*1024)) { flash('1–8 dosya ekleyin; dosya başına en fazla 150 MB.', true); return; }
    btn.disabled = true; btn.textContent = 'Gönderiliyor...';
    try { await api('/api/jobs', {method:'POST',body:fd}); ev.target.reset(); showView('jobs'); flash('İşiniz başarıyla alındı.'); }
    catch(e) { flash(e.message,true); }
    finally {btn.disabled=false;btn.textContent='İşi Gönder ↗';}
  });
  async function loadPrices() {
    const box = $('#priceList');box.textContent = 'Yükleniyor...';
    try {const {prices} = await api('/api/admin/prices');box.innerHTML = prices.map(p => `<div class="price-row"><span>${escapeHtml(p.service)}</span><strong>${escapeHtml(p.price || 'Belirlenmedi')}</strong></div>`).join('');}
    catch(e){box.textContent='Fiyatlar yüklenemedi.';flash(e.message,true);}
  }
  $('#priceForm').addEventListener('submit', async ev => {
    ev.preventDefault();const body=Object.fromEntries(new FormData(ev.target));
    try { await api('/api/admin/prices',{method:'PUT',body:JSON.stringify(body)});ev.target.reset();loadPrices();flash('Fiyat kaydedildi.'); }
    catch(e){flash(e.message,true);}
  });
})();
