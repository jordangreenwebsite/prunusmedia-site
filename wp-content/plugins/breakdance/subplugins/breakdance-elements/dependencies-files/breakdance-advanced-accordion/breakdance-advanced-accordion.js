(function () {
  const accordionButtonSelector =
    ".bde-accordion__content-wrapper > .bde-accordion__title-tag > button[aria-expanded]";

  const { mergeObjects, isBuilder } = BreakdanceFrontend.utils;

  class BreakdanceAdvancedAccordion {
    defaultOptions = {
      accordion: false,
      openFirst: false,
      ignoreClickEvent: false
    };

    constructor(selector, options) {
      this.selector = selector;
      this.element = document.querySelector(`${this.selector}`);
      this.options = mergeObjects(this.defaultOptions, options);
      this.isBuilder = isBuilder();
      this.init();
    }

    init() {
      this.elements = this.getAccordions();
      this.handleOnClick = this.onClick.bind(this);

      // Builder: remove click listener in favor of `activateAccordionFromSelector`
      if (!this.options.ignoreClickEvent) {
        this.elements.forEach((accordion) => {
          accordion.addEventListener("click", this.handleOnClick);
        });
      }

      if (this.options.openFirst) {
        this.open(this.elements[0], true);
      }

      if (this.isBuilder && this.elements.length === 1) {
        this.open(this.elements[0], true);
      }
    }

    getAccordions() {
      // Return all accordions that are direct children of the selector.
      // This is to prevent nested accordions from being selected.
      return Array.from(document.querySelectorAll(`${this.selector} > ${accordionButtonSelector}`));
    }

    onClick(event) {
      if (this.options.accordion) {
        this.closeAllAccordions();
      }
      this.toggle(event.currentTarget);
    }

    isTransitioning(item) {
      return item.classList.contains("is-collapsing");
    }

    isActive(item) {
      return item.classList.contains("is-active");
    }

    getOpenAccordion() {
      return this.elements.find((accordion) => this.isActive(this.getAccordionContainer(accordion)));
    }

    getOpenAccordionIndex() {
      return this.elements.indexOf(this.getOpenAccordion());
    }

    getAccordionContent(button) {
      const controlsId = button.getAttribute("aria-controls");
      return this.element.querySelector(`#${controlsId}`);
    }

    getAccordionContainer(button) {
      return button.closest(".bde-accordion__content-wrapper");
    }

    async open(button, instant = false) {
      const containerEl = this.getAccordionContainer(button);
      const contentEl = this.getAccordionContent(button);

      if (this.isTransitioning(containerEl)) return;
      if (this.isActive(containerEl)) return;

      const event = new Event("breakdance_play_animations", {bubbles: true});
      contentEl.dispatchEvent(event);

      const complete = () => {
        containerEl.classList.add("is-active");
        containerEl.classList.remove("is-collapsing");
        contentEl.style.height = "";
      };

      if (instant) {
        complete();
        button.setAttribute("aria-expanded", true);
        return;
      }

      containerEl.classList.add("is-collapsing");
      contentEl.style.height = "0px";

      const endHeight = this.getEndHeight(contentEl);
      contentEl.style.height = `${endHeight}px`;
      button.setAttribute("aria-expanded", true);

      await this.onTransitionEnd(contentEl);

      complete();
    }

    async close(button, instant = false) {
      const containerEl = this.getAccordionContainer(button);
      const contentEl = this.getAccordionContent(button);

      if (this.isTransitioning(containerEl)) return;
      if (!this.isActive(containerEl) || this.options.ignoreClickEvent) return;

      if (instant) {
        containerEl.classList.remove("is-active");
        button.setAttribute("aria-expanded", false);
        return;
      }

      const endHeight = this.getEndHeight(contentEl);
      contentEl.style.height = `${endHeight}px`;

      this.reflow(contentEl);

      containerEl.classList.add("is-collapsing");
      containerEl.classList.remove("is-active");
      contentEl.style.height = "";
      button.setAttribute("aria-expanded", false);

      await this.onTransitionEnd(contentEl);

      containerEl.classList.remove("is-collapsing");
    }

    toggle(button) {
      const containerEl = this.getAccordionContainer(button);

      if (this.isActive(containerEl)) {
        this.close(button);
      } else {
        this.open(button);
      }
    }

    closeAllAccordions() {
      this.elements.forEach((accordion) => {
        this.close(accordion);
      });
    }

    closeAllItemsExcept(item, instant = false) {
      this.elements
        .filter((el) => el !== item)
        .forEach((el) => this.close(el, instant));
    }

    destroy() {
      this.elements.forEach((accordion) => {
        this.close(accordion, true);
        accordion.removeEventListener("click", this.handleOnClick);
      });
      this.elements = null;
    }

    getEndHeight(element) {
      const height = element.getBoundingClientRect().height;
      return Math.max(element.scrollHeight, height);
    }

    reflow(element) {
      element.offsetHeight;
    }

    onTransitionEnd(item) {
      const duration = window.getComputedStyle(item)
        .getPropertyValue("transition-duration");

      // If duration is 0s, transitionend will not fire.
      if (duration === "0s") {
        return Promise.resolve();
      }

      return new Promise((resolve) => {
        item.addEventListener("transitionend", resolve, {once: true});
      });
    }

    update() {
      this.elements = this.getAccordions();

      this.destroy();
      this.init();
    }

    activateAccordionFromSelector(selector) {
      this.elements = this.getAccordions();

      const buttonEl = selector.querySelector("button[aria-expanded]");
      const index = this.elements.indexOf(buttonEl);

      const item = index !== -1 ? this.elements[index] : this.elements[0];

      this.closeAllItemsExcept(item, true);
      this.open(this.elements[index], true);
    }
  }

  window.BreakdanceAdvancedAccordion = BreakdanceAdvancedAccordion;
})();