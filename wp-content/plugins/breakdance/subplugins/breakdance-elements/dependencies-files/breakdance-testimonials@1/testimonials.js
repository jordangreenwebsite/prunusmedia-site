(function () {
  const { mergeObjects } = BreakdanceFrontend.utils;

  class BreakdanceTestimonials {
    options = {
      layout: {
        columns: 3,
        gap: {
          number: 24,
        },
      },
    };

    constructor(selector, options) {
      this.selector = selector;
      this.testimonials = document.querySelectorAll(
        `${this.selector} .js-testimonials`
      );
      this.options = mergeObjects(this.options, options.design);
      this.init();
    }

    initMacy() {
      if (this.testimonials) {
        this.macy = Macy({
          container: `${this.selector} .js-testimonials`,
          trueOrder: false,
          waitForImages: false,
          margin: this.options.layout.gap.number,
          columns: this.options.layout.columns,
          breakAt: {
            940: 3,
            767: 2,
            400: 1,
          },
        });
      }
    }

    // Methods
    destroy() {
      this.macy.reInit();
    }

    update(options = {}) {
      this.destroy();
      this.init();
    }

    init() {
      this.initMacy();
    }
  }

  window.BreakdanceTestimonials = BreakdanceTestimonials;
})();
