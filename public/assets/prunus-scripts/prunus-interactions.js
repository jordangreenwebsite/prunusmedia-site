
/**
 * Prunus Media interactions.
 * No Breakdance/WordPress JavaScript runtime is required.
 * Keep this small; preserve existing markup until reviewed in browser.
 */
(function () {
  'use strict';
  const ready = (fn) => document.readyState === 'loading' ?
    document.addEventListener('DOMContentLoaded', fn, { once: true }) : fn();
  ready(() => {
    const mobileQuery = matchMedia('(max-width: 1119px)');
    const menu = document.querySelector('.breakdance-menu');
    const toggle = menu?.querySelector('.breakdance-menu-toggle');
    const close = menu?.querySelector('.breakdance-menu-close-button');
    const list = menu?.querySelector('.breakdance-menu-list');
    const dropdowns = [...(menu?.querySelectorAll('.breakdance-dropdown') || [])];
    menu?.classList.add('breakdance-menu--enabled');
    // The original responsive menu plugin added these offcanvas state
    // classes at mobile breakpoints. Without them the dropdown panel
    // sits behind the page hero and cannot receive taps.
    function syncResponsiveMenu() {
      menu?.classList.toggle('breakdance-menu--offcanvas', mobileQuery.matches);
      menu?.classList.toggle('breakdance-menu--offcanvas-right', mobileQuery.matches);
    }
    syncResponsiveMenu();
    mobileQuery.addEventListener?.('change', syncResponsiveMenu);


    function dropdownOpen(item, open) {
      item.classList.toggle('breakdance-dropdown--open', open);
      item.closest('.breakdance-menu-item')?.classList.toggle('breakdance-menu-item--dropdown-active', open);
      item.querySelectorAll('.breakdance-dropdown-toggle button').forEach((b) =>
        b.setAttribute('aria-expanded', String(open)));
      const panel = item.querySelector('.breakdance-dropdown-floater');
      if (panel) panel.setAttribute('aria-hidden', String(!open));
    }
    function menuOpen(open) {
      if (!menu) return;
      menu.classList.toggle('breakdance-menu--open', open);
      menu.classList.toggle('breakdance-responsive-menu--open', open);
      document.documentElement.classList.toggle('prunus-menu-open', open);
      toggle?.setAttribute('aria-expanded', String(open));
      toggle?.setAttribute('aria-label', open ? 'Close Menu' : 'Open Menu');
      if (!open) dropdowns.forEach((item) => dropdownOpen(item, false));
    }
    toggle?.addEventListener('click', () => menuOpen(!menu.classList.contains('breakdance-menu--open')));
    close?.addEventListener('click', () => menuOpen(false));
    menu?.querySelectorAll('.breakdance-dropdown-toggle').forEach((area) => {
      const drop = area.closest('.breakdance-dropdown');
      area.querySelectorAll('button').forEach((button) => button.addEventListener('click', (event) => {
        event.preventDefault();
        const active = drop.classList.contains('breakdance-dropdown--open');
        dropdowns.forEach((item) => dropdownOpen(item, false));
        dropdownOpen(drop, !active);
      }));
      if (drop) {
        drop.addEventListener('mouseenter', () => {
          if (!mobileQuery.matches) { dropdowns.forEach((item) => dropdownOpen(item, false)); dropdownOpen(drop, true); }
        });
        drop.addEventListener('mouseleave', () => {
          if (!mobileQuery.matches) dropdownOpen(drop, false);
        });
      }
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') { menuOpen(false); dropdowns.forEach((d) => dropdownOpen(d, false)); }
    });
    document.addEventListener('click', (event) => {
      if (menu && !menu.contains(event.target)) {
        menuOpen(false);
        dropdowns.forEach((d) => dropdownOpen(d, false));
      }
    });
    list?.querySelectorAll('a[href]').forEach((a) => a.addEventListener('click', () => {
      if (mobileQuery.matches) menuOpen(false);
    }));
    mobileQuery.addEventListener?.('change', () => menuOpen(false));


    // Browser-native lazy loading for any future data-src media assets.
    const lazyElements = [...document.querySelectorAll('img[data-src], iframe[data-src]')];
    const loadLazy = (element) => {
      if (element.dataset.src) element.src = element.dataset.src;
      if (element.dataset.srcset) element.srcset = element.dataset.srcset;
      element.removeAttribute('data-src');
    };
    if ('IntersectionObserver' in window) {
      const lazyObserver = new IntersectionObserver((entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            loadLazy(entry.target);
            lazyObserver.unobserve(entry.target);
          }
        }
      }, { rootMargin: '300px' });
      lazyElements.forEach((element) => lazyObserver.observe(element));
    } else lazyElements.forEach(loadLazy);

    // Former lite-youtube custom elements work without the builder's plugin.
    // No video is loaded until the visitor explicitly activates it.
    document.querySelectorAll('lite-youtube[videoid]').forEach((element) => {
      const id = element.getAttribute('videoid');
      if (!/^[A-Za-z0-9_-]{11}$/.test(id)) return;
      let playing = false;
      element.setAttribute('role', 'button');
      element.setAttribute('tabindex', '0');
      element.setAttribute('aria-label', 'Play video');
      const play = () => {
        if (playing) return;
        playing = true;
        const frame = document.createElement('iframe');
        frame.src = 'https://www.youtube-nocookie.com/embed/' + id +
          '?autoplay=1&playsinline=1&rel=0';
        frame.title = 'Video player';
        frame.allow = 'accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture';
        frame.allowFullscreen = true;
        frame.referrerPolicy = 'strict-origin-when-cross-origin';
        element.classList.add('prunus-video-playing');
        element.replaceChildren(frame);
        frame.focus();
      };
      element.addEventListener('click', play);
      element.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault(); play();
        }
      });
    });

    // FAQ accordion: original accessible buttons and panels, no plugin.
    document.querySelectorAll('.bde-faq__question').forEach((button) => {
      const controls = button.getAttribute('aria-controls');
      const panel = controls ? document.getElementById(controls) : null;
      if (panel) {
        panel.hidden = button.getAttribute('aria-expanded') !== 'true';
      }
      button.addEventListener('click', () => {
        const next = button.getAttribute('aria-expanded') !== 'true';
        button.setAttribute('aria-expanded', String(next));
        button.closest('.bde-faq__item')?.classList.toggle('bde-faq__item--active', next);
        if (panel) panel.hidden = !next;
      });
    });

    // Tabbed project showcase, retaining the precise DOM/content.
    document.querySelectorAll('.bde-advanced-tabs').forEach((tabs) => {
      const buttons = [...tabs.querySelectorAll('[role="tab"]')];
      const panels = [...tabs.querySelectorAll('.bde-tabs-content-container > .bde-advanced-tabs-content')];
      if (!buttons.length || !panels.length) return;
      const activate = (index) => {
        buttons.forEach((button, i) => {
          const selected = i === index;
          button.setAttribute('aria-selected', String(selected));
          button.classList.toggle('bde-tabs__tab--active', selected);
          button.tabIndex = selected ? 0 : -1;
        });
        panels.forEach((panel, i) => {
          const selected = i === index;
          panel.hidden = !selected;
          panel.classList.toggle('bde-advanced-tabs-content--active', selected);
        });
      };
      buttons.forEach((button, index) => {
        button.addEventListener('click', () => activate(index));
        button.addEventListener('keydown', (event) => {
          const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
          if (step) {
            event.preventDefault();
            const next = (index + step + buttons.length) % buttons.length;
            activate(next); buttons[next].focus();
          }
        });
      });
      activate(0);
    });

    // Slider built around the existing before/after DOM and original assets.
    document.querySelectorAll('.js-comparison-container').forEach((root) => {
      const images = root.querySelector('.images');
      const before = root.querySelector('.js-image-before');
      const after = root.querySelector('.js-image-after');
      const handle = root.querySelector('.dragger');
      if (!images || !before || !after) return;
      before.style.backgroundImage = 'url("' + before.dataset.src + '")';
      after.style.backgroundImage = 'url("' + after.dataset.src + '")';
      let fraction = .5;
      const update = (value) => {
        fraction = Math.min(.98, Math.max(.02, value));
        before.style.clipPath = 'inset(0 ' + (100 - fraction * 100) + '% 0 0)';
        after.style.clipPath = 'inset(0 0 0 ' + (fraction * 100) + '%)';
        if (handle) handle.style.left = (fraction * 100) + '%';
      };
      root.setAttribute('role', 'slider');
      root.setAttribute('aria-label', 'Compare the website before and after');
      root.setAttribute('aria-valuemin', '0');
      root.setAttribute('aria-valuemax', '100');
      root.tabIndex = 0;
      const adjust = (value) => {
        update(value);
        root.setAttribute('aria-valuenow', String(Math.round(fraction * 100)));
      };
      function fromPointer(event) {
        const rect = root.getBoundingClientRect();
        adjust((event.clientX - rect.left) / rect.width);
      }
      root.addEventListener('pointerdown', (event) => {
        root.setPointerCapture?.(event.pointerId);
        fromPointer(event);
      });
      root.addEventListener('pointermove', (event) => {
        if (event.buttons) fromPointer(event);
      });
      root.addEventListener('keydown', (event) => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        const value = event.key === 'Home' ? 0 : event.key === 'End' ? 1 :
          fraction + (event.key === 'ArrowRight' ? .05 : -.05);
        adjust(value);
      });
      adjust(.5);
    });


    // One original changing phrase: re-create its subtle flip in native CSS.
    const motionDisabled = matchMedia('(prefers-reduced-motion: reduce)').matches;
    document.querySelectorAll('.bde-animated-heading').forEach((root) => {
      const wrapper = root.querySelector('.bde-animated-heading__wrapper');
      if (!wrapper) return;
      wrapper.textContent = 'started in business,';
      if (!motionDisabled) wrapper.classList.add('prunus-animated-phrase');
    });

    // Original exported sections carry data-entrance; Astro renames that
    // marker to data-prunus-reveal. Respect preferred reduced motion, keep
    // all content visible if observers/JS aren't supported, and animate once
    // on arrival at the viewport (the source builder's play-on-enter rule).
    const reveals = [...document.querySelectorAll('[data-prunus-reveal]')];
    if (reveals.length && !motionDisabled && 'IntersectionObserver' in window) {
      document.documentElement.classList.add('prunus-motion-active');
      const observer = new IntersectionObserver((entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.classList.add('prunus-revealed');
          observer.unobserve(entry.target);
        }
      }, { threshold: 0, rootMargin: '0px 0px -120px 0px' });
      reveals.forEach((element) => observer.observe(element));
      // Fail-safe: never leave important content invisible permanently.
      // The observer itself owns reveal timing; the reduced-motion path
      // never sets the hide state at all.
      addEventListener('pageshow', () => {
        reveals.forEach((element) => {
          if (element.getBoundingClientRect().top < innerHeight - 120) {
            element.classList.add('prunus-revealed');
            observer.unobserve(element);
          }
        });
      }, { once:true });
    }
    document.querySelectorAll('[data-prunus-sticky]').forEach((element) => {
      element.classList.add('prunus-sticky');
    });

    const header = document.querySelector('.bde-header-builder');
    if (header) {
      let previous = window.scrollY;
      const onScroll = () => {
        const current = window.scrollY;
        header.classList.toggle('bde-header-builder--overlay', current < 48);
        const scrollDown = current > previous + 5;
        const scrollUp = current < previous - 5;
        if (current < 120 || scrollUp) header.style.transform = '';
        else if (scrollDown) header.style.transform = 'translateY(-100%)';
        previous = current;
      };
      window.addEventListener('scroll', onScroll, { passive: true });
      onScroll();
    }

    // All existing case-study buttons lead to verified editorial entries.
    // The three project showcases remain in their original visual order.
    const caseStudyPaths = [
      '/our-work/j-piper-cleaning-services/',
      '/our-work/caring-companions-pet-care/',
      '/our-work/car-care-tlc/'
    ];
    document.querySelectorAll('.bde-advanced-tabs').forEach((tabs) => {
      const panels = [...tabs.querySelectorAll('.bde-tabs-content-container > .bde-advanced-tabs-content')];
      panels.forEach((panel, index) => {
        const button = [...panel.querySelectorAll('button')].find((el) => /view (?:.* )?case study/i.test(el.textContent));
        if (!button || !caseStudyPaths[index]) return;
        button.addEventListener('click', () => { window.location.href = caseStudyPaths[index]; });
      });
    });
  });
})();
