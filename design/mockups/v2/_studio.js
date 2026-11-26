// 12-stüdyo ve 13-montaj için inceleme düzeni (ürünün parçası değil).
// ?durum=<ad>&tema=acik|koyu : tek durum. Parametresiz: pano (her durum 1280 ve 390, açık ve koyu yan yana).
window.WIRE = (() => {
  const q = new URLSearchParams(location.search);
  const tema = q.get('tema') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'koyu' : 'acik');
  document.documentElement.dataset.theme = tema === 'koyu' ? 'dark' : 'light';
  const bar = document.querySelector('.wire-bar');
  const links = [...bar.querySelectorAll('a[data-s]')];
  const states = links.map((a) => [a.dataset.s, a.textContent.trim()]);
  const durum = q.get('durum');

  // Tema bağlantıları ve durum bağlantıları seçili temayı korur.
  links.forEach((a) => { a.href = `?durum=${a.dataset.s}&tema=${tema}`; });
  bar.querySelectorAll('a[data-tema]').forEach((a) => {
    a.href = durum ? `?durum=${durum}&tema=${a.dataset.tema}` : `?tema=${a.dataset.tema}`;
    if (a.dataset.tema === tema) a.setAttribute('aria-current', 'page');
  });

  if (!durum) {
    // Pano: her durum için dört çerçeve.
    document.body.classList.add('board-mode');
    const board = document.createElement('main');
    board.className = 'board';
    const title = document.title.split(' · ')[0];
    board.innerHTML = `<p class="board-note">${title}: her durum 1280 ve 390 px, açık ve koyu temada. Bir durumu tam boyutta açmak için başlığına bas.</p>` +
      states.map(([s, label]) => `<section class="board-row"><h2><a href="?durum=${s}&tema=${tema}">${label}</a></h2><div class="frames">${
        ['acik', 'koyu'].map((t) => `
          <figure class="fr fr--d"><iframe loading="lazy" title="${label} · 1280 · ${t}" src="?durum=${s}&tema=${t}" width="1280" height="800" tabindex="-1"></iframe><figcaption>1280 · ${t === 'acik' ? 'açık' : 'koyu'}</figcaption></figure>
          <figure class="fr fr--m"><iframe loading="lazy" title="${label} · 390 · ${t}" src="?durum=${s}&tema=${t}" width="390" height="844" tabindex="-1"></iframe><figcaption>390 · ${t === 'acik' ? 'açık' : 'koyu'}</figcaption></figure>`).join('')
      }</div></section>`).join('');
    [...document.body.children].forEach((el) => { if (el !== bar && el.tagName !== 'SCRIPT') el.remove(); });
    bar.after(board);
    bar.querySelector('a[data-pano]')?.setAttribute('aria-current', 'page');
    return { board: true, durum: null };
  }

  document.body.dataset.durum = durum;
  document.querySelectorAll('[data-durum]').forEach((el) => { el.hidden = !el.dataset.durum.split(' ').includes(durum); });
  document.querySelectorAll('[data-durum-not]').forEach((el) => { el.hidden = el.dataset.durumNot.split(' ').includes(durum); });
  links.forEach((a) => { if (a.dataset.s === durum) a.setAttribute('aria-current', 'page'); });
  const pano = bar.querySelector('a[data-pano]');
  if (pano) pano.href = `?tema=${tema}`;
  return { board: false, durum, tema, in: (...xs) => xs.includes(durum) };
})();
