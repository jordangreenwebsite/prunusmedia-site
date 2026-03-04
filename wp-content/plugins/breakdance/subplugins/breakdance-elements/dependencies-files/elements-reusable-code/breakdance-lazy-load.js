(function () {
  class BreakdanceLazyLoad {
    constructor(element) {
      this.element = element;
      this.init();
    }

    init() {
      if (this.element.getAttribute('data-bde-lazy-bg') === 'waiting') {
        this.observer = new IntersectionObserver((entries, observer) => {
          entries.forEach(entry => {
            if (entry.isIntersecting) {
              this.loadBackground();
              observer.unobserve(entry.target);
            }
          });
        });

        this.observer.observe(this.element);
      }
    }

    loadBackground() {
      this.element.setAttribute('data-bde-lazy-bg', 'loaded');
    }

    destroy() {
      if (this.observer) {
        this.observer.unobserve(this.element);
        this.observer = null;
      }
    }

    static autoload(parent = null) {
      const container = parent ?? document;
      const selector = "[data-bde-lazy-bg]";
      const elements = container.querySelectorAll(selector);

      elements.forEach((element) => new this(element));
    }
  }

  document.addEventListener("DOMContentLoaded", () =>
    BreakdanceLazyLoad.autoload()
  );

  window.BreakdanceLazyLoad = BreakdanceLazyLoad;
})();
