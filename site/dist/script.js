const menu = document.querySelector('.menu-toggle');
const nav = document.querySelector('#navigation');
function closeMenu() { menu.setAttribute('aria-expanded', 'false'); nav.classList.remove('open'); }
menu.addEventListener('click', () => { const open = menu.getAttribute('aria-expanded') !== 'true'; menu.setAttribute('aria-expanded', String(open)); nav.classList.toggle('open', open); });
nav.querySelectorAll('a').forEach(link => link.addEventListener('click', closeMenu));
document.addEventListener('keydown', event => { if (event.key === 'Escape') closeMenu(); });
document.querySelectorAll('[data-dialog]').forEach(button => button.addEventListener('click', () => document.getElementById(button.dataset.dialog).showModal()));
document.querySelectorAll('dialog').forEach(dialog => { dialog.querySelector('.dialog-close').addEventListener('click', () => dialog.close()); dialog.addEventListener('click', event => { if (event.target === dialog) { const rect = dialog.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close(); } }); });

// Local background video: no YouTube iframe, cookies, or third-party requests.
const heroVideo = document.getElementById('hero-video');
const videoToggle = document.getElementById('video-toggle');
if (heroVideo && videoToggle) {
  const hero = heroVideo.closest('.hero');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const saveData = Boolean(navigator.connection && navigator.connection.saveData);
  let userWantsPlayback = !reducedMotion.matches && !saveData;
  let inView = true;
  let failed = false;
  heroVideo.muted = true;
  videoToggle.hidden = false;
  function updateVideoButton() {
    const playing = !heroVideo.paused;
    videoToggle.textContent = playing ? 'Video pausieren' : 'Video abspielen';
    videoToggle.setAttribute('aria-label', playing ? 'Hintergrundvideo pausieren' : 'Hintergrundvideo abspielen');
  }
  async function startVideo() {
    if (failed || document.hidden || !inView) return;
    if (!heroVideo.getAttribute('src')) heroVideo.src = heroVideo.dataset.src;
    try { await heroVideo.play(); } catch { updateVideoButton(); }
  }
  function syncPlayback() {
    if (userWantsPlayback && inView && !document.hidden) startVideo();
    else heroVideo.pause();
  }
  heroVideo.addEventListener('playing', () => { hero.classList.add('video-ready'); updateVideoButton(); });
  heroVideo.addEventListener('pause', updateVideoButton);
  heroVideo.addEventListener('error', () => { failed = true; hero.classList.remove('video-ready'); videoToggle.hidden = true; });
  videoToggle.addEventListener('click', () => {
    userWantsPlayback = heroVideo.paused;
    syncPlayback();
  });
  reducedMotion.addEventListener('change', () => {
    userWantsPlayback = !reducedMotion.matches && !saveData;
    syncPlayback();
  });
  document.addEventListener('visibilitychange', syncPlayback);
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(entries => { inView = entries[0].isIntersecting; syncPlayback(); }, {threshold:0.05}).observe(hero);
  }
  updateVideoButton();
  syncPlayback();
}
