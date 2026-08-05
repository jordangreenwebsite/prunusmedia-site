(function () {
  class BreakdanceSearchForm {
    constructor(selector) {
      this.selector = selector;
      this.element = this.queryElement(`${this.selector} .js-search-form`);
      this.type = this.element.dataset.type;
      this.expandButton = this.queryElement(
        `${this.selector} .js-search-form-expand-button`
      );
      this.closeButton = this.queryElement(
        `${this.selector} .js-search-form-close`
      );
      this.searchField = this.queryElement(
        `${this.selector} .js-search-form-field`
      );
      this.lightboxBg = this.queryElement(
        `${this.selector} .js-search-form-lightbox-bg`
      );
      this.lightbox = this.queryElement(`${this.selector} .js-search-form-lightbox`);

      this.previousFocus = null;

      this.init();
    }

    queryElement(element) {
      if (typeof element == "string") {
        return document.querySelector(element);
      }
      return element;
    }

    toggleForm() {
      this.element.classList.toggle("is-active");
      this.element.setAttribute("aria-hidden", "false");
      this.expandButton.setAttribute("aria-expanded", "true");

      this.lightbox.addEventListener("transitionend", this.handleAutofocus, {
        once: true
      });
    }

    closeFormEscape(event) {
      if (event.key !== "Escape") return;
      this.closeForm();
    }

    closeForm() {
      this.lightbox.addEventListener("transitionend", this.handleAutofocus, {
        once: true
      });

      this.element.classList.remove("is-active");
      this.element.setAttribute("aria-hidden", "true");
      this.expandButton.setAttribute("aria-expanded", "false");
    }

    // Methods
    destroy() {
      if (this.type === "expand") {
        this.expandButton.removeEventListener("click", this.handleToggleForm);
      }

      if (this.type === "full-screen") {
        this.expandButton.removeEventListener("click", this.handleToggleForm);
        this.closeButton.removeEventListener("click", this.handleCloseForm);
        this.lightbox.removeEventListener("transitionend", this.handleAutofocus);
        this.lightboxBg.removeEventListener("click", this.handleCloseForm);
        removeEventListener("keydown", this.handleCloseFromEscape);
      }
    }

    handleAutofocus() {
      if (this.element.classList.contains("is-active")) {
        this.previousFocus = document.activeElement;
        this.searchField.focus();
      } else if (this.previousFocus) {
        this.previousFocus?.focus();
        this.previousFocus = null;
      } else {
        this.searchField.blur();
      }
    }

    update() {
      this.destroy();
      this.init();
    }

    bindListeners() {
      this.handleToggleForm = this.toggleForm.bind(this);
      this.handleCloseForm = this.closeForm.bind(this);
      this.handleCloseFromEscape = this.closeFormEscape.bind(this);
      this.handleAutofocus = this.handleAutofocus.bind(this);

      if (this.type === "expand") {
        this.expandButton.addEventListener("click", this.handleToggleForm);
      }

      if (this.type === "full-screen") {
        this.expandButton.addEventListener("click", this.handleToggleForm);
        this.closeButton.addEventListener("click", this.handleCloseForm);
        this.lightboxBg.addEventListener("click", this.handleCloseForm);
        addEventListener("keydown", this.handleCloseFromEscape);
      }
    }

    init() {
      this.bindListeners();
    }
  }

  window.BreakdanceSearchForm = BreakdanceSearchForm;
})();
