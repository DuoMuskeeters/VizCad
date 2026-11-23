// Ortak kenar menü ve mobil üst çubuk. <body data-page="projeler" data-viewer="admin|guest">
(() => {
  const page = document.body.dataset.page || '';
  const guest = document.body.dataset.viewer === 'guest';
  const item = (id, icon, label, extra = '') =>
    `<a href="${id}.html"${page === id ? ' aria-current="page"' : ''}><i data-lucide="${icon}"></i>${label}${extra}</a>`;
  const ws = guest
    ? `<span class="mark" style="background:#7c3aed">DM</span><span class="name">Demir Makina<small>Misafir</small></span>`
    : `<span class="mark">DM</span><span class="name">Demir Makina<small>Yönetici · 12 üye</small></span>`;
  const nav = guest
    ? item('05-proje', 'folder-kanban', 'Pompa revizyonu')
    : [
        item('04-projeler', 'folder-kanban', 'Projeler'),
        item('01-dosyalar', 'files', 'Tüm dosyalar'),
        item('paylasilanlar', 'share-2', 'Paylaşılanlar'),
        item('06-ekip', 'users', 'Ekip'),
        item('09-aktivite', 'activity', 'Aktivite'),
        item('10-ayarlar', 'settings', 'Ayarlar'),
      ].join('');
  const side = document.querySelector('aside.sidebar');
  if (side) side.innerHTML = `
    <button class="ws" type="button" data-ws>${ws}<i data-lucide="chevrons-up-down"></i></button>
    <button class="search-btn" type="button"><i data-lucide="search"></i>Ara<span class="kbd">⌘K</span></button>
    <nav class="nav" aria-label="Ana menü">${guest ? '<div class="dim" style="padding:8px 10px 4px;font-size:12px">Sana açılan projeler</div>' : ''}${nav}</nav>
    <div class="spacer"></div>
    ${guest ? '' : `<nav class="nav" aria-label="Diğer">${item('cop', 'trash-2', 'Çöp kutusu')}</nav>
    <div class="storage"><div class="row"><span>Depolama</span><span>153 MB / 5 GB</span></div><div class="meter"><span style="width:3%"></span></div></div>`}
    <div class="me"><span class="avatar ${guest ? 'a4' : 'a1'}">${guest ? 'ÖK' : 'AY'}</span><span class="who">${guest ? 'Ömer Koç<span>omer@koc-kalip.com.tr</span>' : 'Ayşe Yılmaz<span>ayse@demirmakina.com</span>'}</span></div>`;
  const top = document.querySelector('header.mobile-top');
  if (top) top.innerHTML = `
    <button class="btn btn--ghost btn--icon" type="button"><i data-lucide="menu"></i><span class="sr">Menü</span></button>
    <button class="ws" type="button">${guest ? '<span class="mark" style="background:#7c3aed">DM</span>' : '<span class="mark">DM</span>'}<span class="name">Demir Makina</span><i data-lucide="chevron-down"></i></button>
    <button class="btn btn--ghost btn--icon" type="button"><i data-lucide="search"></i><span class="sr">Ara</span></button>
    <span class="avatar ${guest ? 'a4' : 'a1'}">${guest ? 'ÖK' : 'AY'}</span>`;
})();
