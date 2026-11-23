// Durum seçici: ?durum=<ad>. data-durum="a b" olan öğeler yalnızca o durumlarda görünür.
(() => {
  const bar = document.querySelector('.wire-bar');
  const links = bar ? [...bar.querySelectorAll('a[href^="?durum="]')] : [];
  const fallback = links[0] ? new URLSearchParams(links[0].search).get('durum') : '';
  const current = new URLSearchParams(location.search).get('durum') || fallback;
  document.body.dataset.durum = current;
  document.querySelectorAll('[data-durum]').forEach((el) => {
    el.hidden = !el.dataset.durum.split(' ').includes(current);
  });
  document.querySelectorAll('[data-durum-not]').forEach((el) => {
    el.hidden = el.dataset.durumNot.split(' ').includes(current);
  });
  links.forEach((a) => {
    if (new URLSearchParams(a.search).get('durum') === current) a.setAttribute('aria-current', 'page');
  });
})();
