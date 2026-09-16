(function () {
  /**
   * BreakdanceSwiperFull
   *
   * Wrapper for the "Swiper" element that maps Swiper options 1:1 from the
   * element controls. Unlike the curated `BreakdanceSwiper` wrapper, this one
   * assembles the Swiper config object almost verbatim from the control tree:
   * control slugs are named to match Swiper's own (camelCase) parameter names,
   * so most of the work here is cleaning empty values and scoping module
   * elements (navigation / pagination / scrollbar) to this instance.
   *
   * The `options` argument is the json_encoded `settings` group from the
   * element, shaped like:
   *   {
   *     general: { direction, speed, slidesPerView, loop, ... },
   *     touch:   { allowTouchMove, touchRatio, ... },
   *     navigation: { enabled, hideOnClick },
   *     pagination: { enabled, type, clickable, ... },
   *     scrollbar:  { enabled, draggable, hide, snapOnRelease },
   *     autoplay:   { enabled, delay, ... },
   *     keyboard / mousewheel / freeMode / zoom / parallax / hashNavigation / a11y,
   *     grid:    { rows, fill },
   *     sync:    { enabled, mode: 'thumbs'|'controller', target: uniqueClassName, ... },
   *     effect:  { effect, fade:{}, coverflow:{}, cube:{}, flip:{}, cards:{}, creative:{} },
   *     breakpoints: { breakpoints: [ { minWidth, slidesPerView, ... } ] }
   *   }
   */
  function BreakdanceSwiperFull() {
    const { is, isBuilder, prefersReducedMotion } = BreakdanceFrontend.utils;

    function isElementInDom(selector) {
      return !!document.querySelector(selector);
    }

    function isFiniteNum(value) {
      return Number.isFinite(typeof value === "string" ? Number(value) : value);
    }

    /**
     * Strip null / undefined / "" so we never override a Swiper default with an
     * empty value. Keeps explicit `false` and `0` (both meaningful to Swiper).
     */
    function cleanObject(obj, omitKeys) {
      const out = {};
      const omit = omitKeys || [];
      if (!is.obj(obj)) {
        return out;
      }
      Object.keys(obj).forEach((key) => {
        if (omit.indexOf(key) !== -1) {
          return;
        }
        const val = obj[key];
        if (val === null || val === undefined || val === "") {
          return;
        }
        out[key] = val;
      });
      return out;
    }

    function moduleEnabled(section) {
      return is.obj(section) && Boolean(section.enabled);
    }

    function swiperRoot(selector) {
      // The element itself carries the `breakdance-swiper-wrapper` class and
      // contains `.swiper` as a direct child (no nested wrapper div).
      return `${selector} > .swiper`;
    }

    // Navigation / pagination / scrollbar live inside `.swiper` (canonical Swiper
    // markup), so the bundle CSS positions them with no extra styling.
    function swiperChild(selector, childClass) {
      return `${swiperRoot(selector)} > ${childClass}`;
    }

    /**
     * Config builders
     */

    function buildBreakpoints(breakpointsSection) {
      const rows = (is.obj(breakpointsSection) && breakpointsSection.breakpoints) || [];
      const breakpoints = {};

      if (!Array.isArray(rows)) {
        return breakpoints;
      }

      rows.forEach((row) => {
        if (!is.obj(row) || !isFiniteNum(row.minWidth)) {
          return;
        }

        const override = {};

        if (row.slidesPerViewAuto) {
          override.slidesPerView = "auto";
        } else if (isFiniteNum(row.slidesPerView)) {
          override.slidesPerView = Number(row.slidesPerView);
        }
        if (isFiniteNum(row.slidesPerGroup)) {
          override.slidesPerGroup = Number(row.slidesPerGroup);
        }
        if (isFiniteNum(row.spaceBetween)) {
          override.spaceBetween = Number(row.spaceBetween);
        }
        if (typeof row.centeredSlides === "boolean") {
          override.centeredSlides = row.centeredSlides;
        }

        breakpoints[Number(row.minWidth)] = override;
      });

      return breakpoints;
    }

    function buildEffectConfig(effectSection) {
      const config = {};
      const fx = is.obj(effectSection) ? effectSection.effect : null;

      if (!fx) {
        return config;
      }

      config.effect = fx;

      if (fx === "creative") {
        const c = is.obj(effectSection.creative) ? effectSection.creative : {};
        const num = (val, fallback) => (isFiniteNum(val) ? Number(val) : fallback);
        config.creativeEffect = {
          prev: {
            translate: [num(c.prevTranslateX, 0), num(c.prevTranslateY, 0), num(c.prevTranslateZ, 0)],
            rotate: [0, 0, num(c.prevRotate, 0)],
            opacity: num(c.prevOpacity, 1),
            scale: num(c.prevScale, 1)
          },
          next: {
            translate: [num(c.nextTranslateX, 0), num(c.nextTranslateY, 0), num(c.nextTranslateZ, 0)],
            rotate: [0, 0, num(c.nextRotate, 0)],
            opacity: num(c.nextOpacity, 1),
            scale: num(c.nextScale, 1)
          }
        };
        return config;
      }

      // fade / cube / coverflow / flip / cards: sub-object keys already match Swiper.
      const fxParams = cleanObject(effectSection[fx]);
      if (Object.keys(fxParams).length) {
        config[`${fx}Effect`] = fxParams;
      }

      return config;
    }

    function buildConfig(options, selector, isBuilderMode) {
      const o = is.obj(options) ? options : {};
      const config = {};

      // General + Touch: slugs already match Swiper param names -> clean + spread.
      Object.assign(config, cleanObject(o.general, ["slidesPerViewAuto"]));
      Object.assign(config, cleanObject(o.touch));

      // slidesPerView: "auto" toggle wins, otherwise coerce to a number.
      if (o.general && o.general.slidesPerViewAuto) {
        config.slidesPerView = "auto";
      } else if (config.slidesPerView != null) {
        config.slidesPerView = Number(config.slidesPerView);
      }
      if (config.slidesPerGroup != null) {
        config.slidesPerGroup = Number(config.slidesPerGroup);
      }

      // Effect + matching ${effect}Effect object.
      Object.assign(config, buildEffectConfig(o.effect));

      // Modules enabled by providing a params object (no `enabled` flag).
      if (moduleEnabled(o.navigation)) {
        config.navigation = Object.assign(
          {
            nextEl: swiperChild(selector, ".swiper-button-next"),
            prevEl: swiperChild(selector, ".swiper-button-prev")
          },
          cleanObject(o.navigation, ["enabled"])
        );
      }

      if (moduleEnabled(o.pagination)) {
        config.pagination = Object.assign(
          {
            el: swiperChild(selector, ".swiper-pagination"),
            clickable: true
          },
          cleanObject(o.pagination, ["enabled"])
        );
      }

      if (moduleEnabled(o.scrollbar)) {
        config.scrollbar = Object.assign(
          { el: swiperChild(selector, ".swiper-scrollbar") },
          cleanObject(o.scrollbar, ["enabled"])
        );
      }

      // Modules enabled via `enabled: true`.
      if (moduleEnabled(o.keyboard)) {
        config.keyboard = Object.assign({ enabled: true }, cleanObject(o.keyboard, ["enabled"]));
      }
      if (moduleEnabled(o.mousewheel)) {
        config.mousewheel = Object.assign({ enabled: true }, cleanObject(o.mousewheel, ["enabled"]));
      }
      if (moduleEnabled(o.freeMode)) {
        config.freeMode = Object.assign({ enabled: true }, cleanObject(o.freeMode, ["enabled"]));
      }
      if (moduleEnabled(o.zoom)) {
        // Swiper finds the zoom container by class, then takes the first
        // picture/img/svg/canvas/.swiper-zoom-target inside it. Every slide
        // already renders an inner `.bde-swiper__slide` wrapper, so point Swiper
        // at that instead of asking the user to add `.swiper-zoom-container`:
        // any slide holding an image becomes zoomable with no extra markup.
        // (Container and target must be different elements — Swiper resolves the
        // wrapper by walking up from the target — which our nesting satisfies.)
        config.zoom = Object.assign(
          { enabled: true, containerClass: "bde-swiper__slide" },
          cleanObject(o.zoom, ["enabled"])
        );
      }
      if (moduleEnabled(o.parallax)) {
        config.parallax = true;
      }
      if (moduleEnabled(o.hashNavigation)) {
        config.hashNavigation = Object.assign({ enabled: true }, cleanObject(o.hashNavigation, ["enabled"]));
      }
      if (moduleEnabled(o.a11y)) {
        config.a11y = Object.assign({ enabled: true }, cleanObject(o.a11y, ["enabled"]));
      }

      // Grid: only meaningful with more than one row.
      if (o.grid && isFiniteNum(o.grid.rows) && Number(o.grid.rows) > 1) {
        config.grid = {
          rows: Number(o.grid.rows),
          fill: o.grid.fill || "column"
        };

        // Swiper cannot build a loop with row fill. Drop loop instead of letting
        // it warn and silently render as non-looping.
        if (config.grid.fill === "row") {
          config.loop = false;
        }
      }

      // Autoplay: respect builder mode + reduced motion.
      if (moduleEnabled(o.autoplay) && !isBuilderMode && !prefersReducedMotion()) {
        config.autoplay = cleanObject(o.autoplay, ["enabled"]);
      } else {
        config.autoplay = false;
      }

      // Sync: thumbs / controller. Only the params are assembled here; the target
      // instance is attached in update() (see wireSync), because the other swiper
      // may not exist yet when this one initializes.
      //
      // Swiper does accept a selector for `thumbs.swiper` / `controller.control`,
      // but when the target is not yet initialized it waits for a `swiperinit`
      // DOM event — which only the <swiper-container> web component dispatches.
      // `new Swiper()` emits to JS listeners only, so that path would silently
      // never wire up. We use our own `breakdance_swiper_init` event instead.
      if (moduleEnabled(o.sync) && o.sync.target) {
        if (o.sync.mode === "controller") {
          config.controller = cleanObject(o.sync, [
            "enabled", "mode", "target", "multipleActiveThumbs", "autoScrollOffset"
          ]);
        } else {
          config.thumbs = cleanObject(o.sync, ["enabled", "mode", "target", "inverse", "by"]);
          if (config.thumbs.autoScrollOffset != null) {
            config.thumbs.autoScrollOffset = Number(config.thumbs.autoScrollOffset);
          }
        }
      }

      // Native Swiper breakpoints.
      const breakpoints = buildBreakpoints(o.breakpoints);
      if (Object.keys(breakpoints).length) {
        config.breakpoints = breakpoints;
      }

      // Builder overrides: keep slide editing usable in the canvas.
      if (isBuilderMode) {
        config.loop = false;
        config.rewind = false;
        config.simulateTouch = false;
        config.allowTouchMove = false;
        config.autoplay = false;
      }

      config.on = {
        init: (event) => {
          event.el.dispatchEvent(new Event("breakdance_swiper_init"));
        }
      };

      return config;
    }

    /**
     * Instance management
     */

    function destroy(id) {
      const instance = window.swiperFullInstances && window.swiperFullInstances[id];
      if (instance) {
        try {
          if (typeof instance.destroy === "function" && typeof instance.el === "object") {
            instance.destroy(true, true);
          }
        } catch (e) {
          // The instance's DOM may have been replaced by the builder's reactive
          // re-render, leaving it detached. Ignore — we re-create below.
        }
        delete window.swiperFullInstances[id];
      }
    }

    // The module containers (pagination / scrollbar) are always present in the
    // markup (so toggling a module never triggers a builder template re-render).
    // Clear any Swiper-generated markup before re-init so a disabled module
    // doesn't leave stale bullets / drag handles behind.
    function clearModuleContainers(selector) {
      [".swiper-pagination", ".swiper-scrollbar"].forEach((childClass) => {
        const el = document.querySelector(swiperChild(selector, childClass));
        if (el) {
          el.innerHTML = "";
        }
      });
    }

    /**
     * Attach a sync target (thumbs / controller) to an initialized instance.
     * Runs immediately when the target swiper already exists, otherwise once it
     * announces itself via `breakdance_swiper_init`, so the two elements can
     * initialize in either order.
     */
    function wireSync(instance, sync) {
      if (!moduleEnabled(sync) || !sync.target) {
        return;
      }

      const targetEl = document.querySelector(swiperRoot(`.${sync.target}`));
      if (!targetEl) {
        return;
      }

      const attach = () => {
        const target = targetEl.swiper;
        if (!target || target.destroyed || instance.destroyed) {
          return;
        }

        if (sync.mode === "controller") {
          instance.controller.control = target;
          instance.update();
          return;
        }

        instance.params.thumbs.swiper = target;
        instance.thumbs.init();
        instance.thumbs.update(true);
        instance.update();
      };

      if (targetEl.swiper) {
        attach();
      } else {
        targetEl.addEventListener("breakdance_swiper_init", attach, { once: true });
      }
    }

    function update({ id, selector, options }) {
      const swiperSelector = swiperRoot(selector);

      if (!isElementInDom(swiperSelector)) {
        return;
      }

      destroy(id);
      clearModuleContainers(selector);

      const isBuilderMode = Boolean(isBuilder());
      const config = buildConfig(options, selector, isBuilderMode);
      const swiperInstance = new Swiper(swiperSelector, config);

      wireSync(swiperInstance, is.obj(options) ? options.sync : null);

      window.swiperFullInstances = {
        ...window.swiperFullInstances,
        [id]: swiperInstance
      };
    }

    /**
     * Builder utils (mirror the curated wrapper so slide children stay in sync).
     */

    function updateSliderFromChild(id) {
      const childEl = document.querySelector(`[data-node-id="${id}"]`);
      if (!childEl) {
        return;
      }

      const sliderNode = childEl.parentElement && childEl.parentElement.closest("[data-node-id]");
      const sliderId = sliderNode && parseInt(sliderNode.dataset.nodeId, 10);

      if (sliderId && window.swiperFullInstances && window.swiperFullInstances[sliderId]) {
        window.swiperFullInstances[sliderId].update();
      }
    }

    function selectSlide(id) {
      const node = document.querySelector(`[data-node-id="${id}"]`);
      const slideElement = node && node.closest(".swiper-slide");

      if (!slideElement) {
        return;
      }

      const slideIndex = Array.from(slideElement.parentElement.children).indexOf(slideElement);
      const sliderElement = slideElement.parentElement && slideElement.parentElement.closest("[data-node-id]");
      const sliderId = sliderElement ? sliderElement.dataset.nodeId : null;

      if (
        sliderId &&
        slideIndex !== -1 &&
        window.swiperFullInstances &&
        window.swiperFullInstances[sliderId]
      ) {
        const instance = window.swiperFullInstances[sliderId];
        if (instance.visibleSlides && instance.visibleSlides.includes(slideElement)) {
          return;
        }
        instance.slideTo(slideIndex, 0);
      }
    }

    return {
      update,
      destroy,
      updateSliderFromChild,
      selectSlide
    };
  }

  window.BreakdanceSwiperFull = BreakdanceSwiperFull;
})();
