(function () {
  const { mergeObjects } = BreakdanceFrontend.utils;

  class BreakdanceTabbedTour {
    options = {
      accordion: false,
      openFirst: false,
    };

    constructor(selector, options) {
      this.selector = selector;
      this.elements = document.querySelectorAll(
        `${this.selector} .js-tabbed-tour-item`
      );
      this.images = document.querySelectorAll(
        `${this.selector} .js-tabbed-tour-image`
      );
      this.options = mergeObjects(this.options, options || {});
      this.init();
    }

    toggleClass(event) {
      const { accordion } = this.options;

      if (accordion === true) {
        this.hideAll();
      }

      const tab = event.target.closest(".bde-tabbed-tour__item");

      const image = Array.from(this.images).find(
        (el) => el.dataset.tab === tab.dataset.tab
      );

      tab.classList.toggle("is-active");
      image.classList.toggle("is-active");
    }

    hideAll() {
      this.elements.forEach((item) =>
        item.closest(".bde-tabbed-tour__item").classList.remove("is-active")
      );
      this.images.forEach((item) => item.classList.remove("is-active"));
    }

    update(options = {}) {
      this.options = mergeObjects(this.options, options);
      this.destroy();
      this.init();
    }

    openFirst() {
      if (this.elements[0]) {
        this.elements[0]
          .closest(".bde-tabbed-tour__item")
          .classList.add("is-active");
      }
      if (this.images[0]) {
        this.images[0].classList.add("is-active");
      }
    }

    destroy() {
      if (!this.elements) return;
      this.hideAll();
      this.elements.forEach((item) => {
        item.onclick = "";
      });
    }

    init() {
      const { openFirst } = this.options;

      if (openFirst === true) {
        this.openFirst();
      }

      this.elements.forEach(
        (item) => (item.onclick = (event) => this.toggleClass(event))
      );
    }
  }

  window.BreakdanceTabbedTour = BreakdanceTabbedTour;
})();
