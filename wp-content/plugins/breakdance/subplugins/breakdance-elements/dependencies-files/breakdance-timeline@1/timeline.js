(function () {
  const { onResize } = BreakdanceFrontend.utils;

  class BreakdanceTimeline {
    constructor(selector) {
      this.selector = selector;
      this.element = document.querySelector(`${this.selector} .js-timeline`);
      this.timeLineSteps = document.querySelectorAll(
        `${this.selector} .js-timeline-step`
      );
      this.timeLineItems = document.querySelectorAll(
        `${this.selector} .js-timeline-item`
      );
      this.timeLineLine = document.querySelector(
        `${this.selector} .js-timeline-line`
      );
      this.init();
    }

    setLineHeight() {
      if (this.timeLineSteps && this.element) {
        const firstItem = this.timeLineSteps[0];
        const lastItem = this.timeLineSteps[this.timeLineSteps.length - 1];

        const parentPos = this.element.getBoundingClientRect();
        const firstItemPos = firstItem.getBoundingClientRect();
        const lastItemPos = lastItem.getBoundingClientRect();

        const bottom = parentPos.bottom - lastItemPos.bottom;
        const top = firstItemPos.top - parentPos.top;

        this.timeLineLine.style.top = `${top}px`;
        this.timeLineLine.style.bottom = `${bottom + 1}px`;
      }
    }

    observeSteps() {
      // obeserve at 50% of the viewport
      const config = {
        rootMargin: "0% 0% -50% 0%",
        threshold: 0,
      };

      this.observer = new IntersectionObserver((steps) => {
        steps.forEach((step) => {
          if (step.isIntersecting) {
            step.target.classList.add("is-in-view");
          } else {
            step.target.classList.remove("is-in-view");
          }
        });
      }, config);

      this.timeLineSteps.forEach((step) => {
        this.observer.observe(step);
      });
    }

    // Methods
    destroy() {
      if (!this.element) return;
      this.element = null;

      this.timeLineSteps.forEach((step) => {
        this.observer.unobserve(step);
      });
    }

    update() {
      this.destroy();
      this.init();
    }

    init() {
      this.observeSteps();
      onResize(this.setLineHeight.bind(this));
    }
  }

  window.BreakdanceTimeline = BreakdanceTimeline;
})();
