(function () {
  function BreakdanceSwiper() {
    const { mergeObjects, matchMedia, getCurrentBreakpoint, is, isBuilder, prefersReducedMotion } = BreakdanceFrontend.utils;

    const DEFAULT_SWIPER_OPTIONS = Object.freeze({
      settings: {
        effect: "slide",
        coverflow: {
          rotate: { number: 50 },
          depth: { number: 100 },
          stretch: { number: 0 }
        },
        speed: { number: 1000 },
        autoplay_settings: {
          speed: { number: 3000 }
        },
        advanced: {
          between_slides: 0,
          slides_per_view: 1,
          slides_per_group: 1,
          initial_slide: 0
        },
        direction: "horizontal"
      },
      pagination: {
        type: "bullets"
      }
    });

    function isElementInDom(selector) {
      return !!document.querySelector(selector);
    }

    /**
     * Breakpoints support
     */

    function setBreakpoint(swiper, settings) {
      const { BASE_BREAKPOINT_ID } = window.BreakdanceFrontend.data;
      const { realIndex, initialized, params } = swiper;

      const hasLoop = swiper.params.loop && !isBuilder();
      const { advanced, effect } = settings;
      const { slides_per_view, slides_per_group, between_slides, one_per_view_at } = advanced;

      const alwaysOne =
        effect === "fade" ||
        effect === "flip" ||
        one_per_view_at === BASE_BREAKPOINT_ID ||
        matchMedia(one_per_view_at);

      if (alwaysOne) {
        swiper.params.slidesPerView = 1;
        swiper.params.slidesPerGroup = 1;
      } else {
        setBreakpointProperty(swiper, "slidesPerView", slides_per_view);
        setBreakpointProperty(swiper, "slidesPerGroup", slides_per_group);
      }

      setBreakpointProperty(swiper, "spaceBetween", between_slides);

      if (!initialized) {
        return;
      }

      const breakpointSlidesPerView = getBreakpointValue(slides_per_view);
      const needsReLoop = hasLoop && breakpointSlidesPerView !== params.slidesPerView;

      // https://github.com/nolimits4web/swiper/blob/master/src/core/breakpoints/setBreakpoint.mjs#L105
      if (initialized && needsReLoop) {
        swiper.loopDestroy();
        swiper.loopCreate(realIndex);
      }

      swiper.updateSlides();
      swiper.slideReset(0);
    }

    function getBreakpointValue(value) {
      if (Number.isFinite(value)) {
        return value;
      }

      if (!is.obj(value)) {
        return undefined;
      }

      const availableBreakpoints = Object.keys(value);
      const current = getCurrentBreakpoint(availableBreakpoints);

      if (!current) {
        return undefined;
      }

      const resolvedValue = value[current.id];
      return isUnitValue(resolvedValue) ? resolvedValue.number : resolvedValue;
    }

    function setBreakpointProperty(swiper, key, value) {
      if (Number.isFinite(value)) {
        swiper.params[key] = value;
        return;
      }

      if (!is.obj(value)) {
        return;
      }

      const breakpointValue = getBreakpointValue(value);

      if (Number.isFinite(breakpointValue)) {
        swiper.params[key] = breakpointValue;
        return;
      }

      if (isUnitValue(value) && !isResponsiveValue(value)) {
        swiper.params[key] = value.number;
      }
    }

    function isResponsiveValue(value) {
      const { breakpoints } = window.BreakdanceFrontend.data;
      const ids = breakpoints.map((bp) => bp.id);
      return Object.keys(value).some((key) => ids.includes(key));
    }

    function isUnitValue(value) {
      return is.obj(value) && "number" in value;
    }

    function supportBreakpoints(swiper, settings) {
      setBreakpoint(swiper, settings);
      swiper.on("resize", () => {
        setBreakpoint(swiper, settings);
      });
    }

    function syncSliders(sliderA, sliderB, syncMode = "thumbs") {
      if (!sliderA || !sliderB) return;

      if (syncMode === "controller") {
        if (!sliderA.controller || !sliderB.controller) return;
        sliderA.controller.control = sliderB;
        sliderB.controller.control = sliderA;
        sliderA.update();
        sliderB.update();
        return;
      }

      if (!sliderA.thumbs) return;

      sliderB.params.freeMode = { enabled: true };
      sliderB.params.watchSlidesProgress = true;
      sliderB.params.loop = false;
      sliderB.params.slideToClickedSlide = true;
      sliderB.update();

      sliderA.thumbs.swiper = sliderB;
      sliderA.thumbs.init();
      sliderA.thumbs.update(true);
      sliderA.update();
    }

    function initSliderSync(sliderSelector, advancedSettings) {
      const sliderA = document.querySelector(sliderSelector);
      const sliderB = advancedSettings.sync_with_another_slider ? document.querySelector(`.${advancedSettings.slider_to_sync} .swiper`) : null;
      const syncMode = advancedSettings.sync_mode;

      if (!sliderB) return;

      if (sliderB.swiper) {
        syncSliders(sliderA.swiper, sliderB.swiper, syncMode);
      } else {
        sliderB.addEventListener("breakdance_swiper_init", () => {
          syncSliders(sliderA.swiper, sliderB.swiper, syncMode);
        });
      }
    }

    /**
     * Animations support
     */

    function resetSlideAnimations(slide) {
      const customEvent = new Event("breakdance_reset_animations", { bubbles: true });
      slide.dispatchEvent(customEvent);
    }

    function playSlideAnimations(slide, delay) {
      const customEvent = new CustomEvent("breakdance_play_animations", {
        bubbles: true,
        detail: { delay: delay / 1000 }
      });
      slide.dispatchEvent(customEvent);
    }

    function supportEntranceAnimations(swiper, settings) {
      let lastVisibleSlides = swiper.visibleSlides || [];
      const playOn = settings.advanced.play_animations_on || "transition_end";

      const getNewestSlides = () => swiper.visibleSlides?.filter((slide) => !lastVisibleSlides.includes(slide)) || [];
      const getHiddenSlides = () => swiper.slides?.filter((slide) => !swiper.visibleSlides.includes(slide)) || [];

      swiper.on("sliderFirstMove", () => {
        getHiddenSlides().forEach(resetSlideAnimations);
      });

      swiper.on("slideChange", () => {
        const delay = playOn === "transition_start" ? 0 : swiper.params.speed * 0.3;
        const newSlides = getNewestSlides();

        newSlides.forEach((slide) => {
          resetSlideAnimations(slide);
          playSlideAnimations(slide, delay);
        });

        lastVisibleSlides = swiper.visibleSlides;
      });
    }

    /**
     * Instance management
     */

    function destroy(id) {
      if (
        window.swiperInstances &&
        window.swiperInstances[id] &&
        typeof window.swiperInstances[id].el === "object"
      ) {
        window.swiperInstances[id].destroy(true, true);
        delete window.swiperInstances[id];
      }
    }

    function update({ id, selector, settings, paginationSettings, extras }) {
      const swiperSelector = `${selector} > .breakdance-swiper-wrapper > .swiper`;

      if (!isElementInDom(swiperSelector)) {
        return;
      }

      destroy(id);

      const mergedSettings = mergeObjects(DEFAULT_SWIPER_OPTIONS.settings, settings);
      const mergedPagination = mergeObjects(DEFAULT_SWIPER_OPTIONS.pagination, paginationSettings);
      const mergedExtras = extras || {};

      const isBuilderMode = Boolean(window?.BreakdanceFrontend.utils.isBuilder());
      const forceAutoplay = mergedExtras.autoplay === true;

      const swiperInstance = new Swiper(swiperSelector, {
        ...mergedExtras,
        ...buildBaseConfig(mergedSettings, isBuilderMode),
        ...buildAutoplayConfig(mergedSettings, isBuilderMode, forceAutoplay),
        ...buildPaginationConfig(selector, mergedPagination),
        ...buildNavigationConfig(selector),
        ...buildEffectConfig(mergedSettings),
        ...buildBuilderOverrides(isBuilderMode),
        mousewheel: buildMouseWheelConfig(mergedSettings.advanced),
        initialSlide: mergedSettings.advanced.initial_slide,
        on: {
          init: (event) => {
            const customEvent = new Event("breakdance_swiper_init");
            event.el.dispatchEvent(customEvent);
          }
        }
      });

      supportBreakpoints(swiperInstance, mergedSettings);
      supportEntranceAnimations(swiperInstance, mergedSettings);
      initSliderSync(swiperSelector, mergedSettings.advanced);

      window.swiperInstances = {
        ...window.swiperInstances,
        [id]: swiperInstance
      };
    }

    /**
     * Config builders
     */

    function buildBaseConfig(settings, isBuilderMode) {
      const { advanced, speed, infinite, direction, center_slides } = settings;
      const isCoverflow = settings.effect === "coverflow";

      return {
        speed: speed.number,
        loop: infinite === "enabled" && !isBuilderMode,
        keyboard: !advanced.disable_keyboard_control,
        autoHeight: Boolean(advanced.auto_height),
        loopPreventsSlide: false,
        centeredSlides: isCoverflow ? true : center_slides,
        watchSlidesProgress: advanced.slides_per_view !== 1,
        parallax: true,
        effect: settings.effect,
        direction,
        a11y: {
          slideRole: ""
        }
      };
    }

    function buildAutoplayConfig(settings, isBuilderMode, forceAutoplay) {
      if (prefersReducedMotion()) return { autoplay: false };

      const autoplayEnabled =
        settings.autoplay === "enabled" && (!isBuilderMode || forceAutoplay);

      if (!autoplayEnabled) {
        return { autoplay: false };
      }

      const { autoplay_settings, infinite } = settings;

      return {
        autoplay: {
          delay: autoplay_settings.speed.number,
          pauseOnMouseEnter: Boolean(autoplay_settings.pause_on_hover),
          disableOnInteraction: Boolean(autoplay_settings.stop_on_interaction),
          stopOnLastSlide: infinite !== "enabled"
        }
      };
    }

    function buildPaginationConfig(rootSelector, paginationSettings) {
      return {
        pagination: {
          el: `${rootSelector} > .breakdance-swiper-wrapper > .swiper-pagination`,
          type: paginationSettings.type,
          clickable: true
        }
      };
    }

    function buildNavigationConfig(rootSelector) {
      return {
        navigation: {
          nextEl: `${rootSelector} > .breakdance-swiper-wrapper > .swiper-button-next`,
          prevEl: `${rootSelector} > .breakdance-swiper-wrapper > .swiper-button-prev`
        }
      };
    }

    function buildEffectConfig(settings) {
      const configs = {};

      if (settings.effect === "coverflow") {
        configs.coverflowEffect = {
          rotate: settings.coverflow.rotate.number,
          slideShadows: Boolean(settings.coverflow.shadow),
          depth: settings.coverflow.depth.number,
          stretch: settings.coverflow.stretch.number
        };
      }

      if (settings.effect === "fade") {
        configs.fadeEffect = { crossFade: true };
      }

      return configs;
    }

    function buildBuilderOverrides(isBuilderMode) {
      if (!isBuilderMode) {
        return {};
      }

      return {
        preventClicksPropagation: false,
        preventClicks: false,
        simulateTouch: false,
        allowTouchMove: false
      };
    }

    function buildMouseWheelConfig(advancedSettings) {
      if (!advancedSettings.swipe_on_scroll) {
        return false;
      }

      return {
        releaseOnEdges: true
      };
    }

    /**
     * Builder utils
     */

    function updateSliderFromChild(id) {
      const sliderId = document
        // select itself
        .querySelector(`[data-node-id="${id}"]`)
        // get parent (slider) node id
        .parentElement.closest("[data-node-id]").dataset.nodeId;

      const sliderIdNumber = sliderId && parseInt(sliderId);

      if (window.swiperInstances && window.swiperInstances[sliderIdNumber]) {
        window.swiperInstances[sliderIdNumber].update();
      }
    }

    function selectSlide(id) {
      const slideElement = document
        .querySelector(`[data-node-id="${id}"]`)
        .closest(".swiper-slide");

      if (slideElement) {
        const slideIndex = Array.from(
          slideElement.parentElement.children
        ).indexOf(slideElement);

        const sliderElement =
          slideElement.parentElement &&
          slideElement.parentElement.closest("[data-node-id]");

        const sliderId = sliderElement ? sliderElement.dataset.nodeId : null;

        if (
          sliderId &&
          slideIndex !== null &&
          window.swiperInstances &&
          window.swiperInstances[sliderId]
        ) {
          if (window.swiperInstances[sliderId].visibleSlides.includes(slideElement)) {
            return;
          }

          window.swiperInstances[sliderId].slideTo(slideIndex, 0);
        }
      }
    }

    return {
      update,
      destroy,
      updateSliderFromChild,
      selectSlide
    };
  }

  window.BreakdanceSwiper = BreakdanceSwiper;
})();