/**
 * Progressive enhancement for native details: animated open and close.
 * Summary and its answer still function without JavaScript or on old Safari.
 */
(() => {
  const ready = (fn) => document.readyState === 'loading'
    ? document.addEventListener('DOMContentLoaded', fn, { once:true }) : fn();
  ready(() => {
    const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
    document.querySelectorAll('.pm-faq__item').forEach((details) => {
      const summary = details.querySelector(':scope > .pm-faq__question');
      const answer = details.querySelector(':scope > .pm-faq__answer');
      if (!summary || !answer || !answer.animate) return;
      let current = null;
      let closing = false;
      const clear = () => {
        if (current) current.cancel();
        current = null;
        closing = false;
      };
      summary.addEventListener('click', (event) => {
        if (!details.open || reduceMotion.matches) return;
        event.preventDefault();
        // Tapping again during a close keeps the FAQ open, never stranded.
        if (closing) { clear(); return; }
        clear();
        closing = true;
        const start = Math.max(answer.getBoundingClientRect().height, answer.scrollHeight);
        const animation = answer.animate([
          { height:start + 'px', opacity:1 },
          { height:'0px', opacity:0 }
        ], { duration:290, easing:'cubic-bezier(.25,.8,.25,1)' });
        current = animation;
        animation.finished.then(() => {
          if (current !== animation) return;
          current = null;
          closing = false;
          details.open = false;
        }).catch(() => {});
      });
      details.addEventListener('toggle', () => {
        // Native details handles the opening, so content is accessible even
        // when animation APIs are absent or reduced motion is enabled.
        if (!details.open || reduceMotion.matches || closing) return;
        clear();
        const end = answer.scrollHeight;
        const animation = answer.animate([
          { height:'0px', opacity:0 },
          { height:end + 'px', opacity:1 }
        ], { duration:320, easing:'cubic-bezier(.22,.8,.25,1)' });
        current = animation;
        animation.finished.then(() => {
          if (current === animation) current = null;
        }).catch(() => {});
      });
    });
  });
})();
