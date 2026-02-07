export function initSwipe() {
  let startX = 0;

  document.body.addEventListener('touchstart', e => {
    startX = e.touches[0].clientX;
  });

  document.body.addEventListener('touchend', e => {
    const dx = e.changedTouches[0].clientX - startX;
    if (Math.abs(dx) > 50) {
      parent.postMessage({ type: 'QQ_SWIPE', dir: dx < 0 ? 1 : -1 }, '*');
    }
  });
}
