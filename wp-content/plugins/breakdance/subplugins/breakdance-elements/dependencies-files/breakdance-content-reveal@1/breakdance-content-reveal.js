const { mergeObjects, isBuilder } = BreakdanceFrontend.utils;

class BreakdanceContentReveal {
  defaultOptions = {
    hideBy: "height",
    maxHeight: { unit: "px", value: "250", style: "250px" },
    maxLines: 10,
    scrollToTop: false,
  };

  isTransitioning = false;
  visibleClass = "is-visible";
  hiddenClass = "is-hidden";
  transitionClass = "is-transitioning";
  hideOverlayClass = "hide-overlay";

  constructor(selector, options) {
    this.show = this.show.bind(this);
    this.hide = this.hide.bind(this);
    this.toggle = this.toggle.bind(this);
    this.onShowComplete = this.onShowComplete.bind(this);
    this.onHideComplete = this.onHideComplete.bind(this);

    this.selector = selector;
    this.options = mergeObjects(this.defaultOptions, options);
    this.isBuilder = isBuilder();

    this.init();
  }

  isVisible() {
    return this.container.classList.contains(this.visibleClass);
  }

  show() {
    if (this.isTransitioning || this.isVisible()) {
      return;
    }

    this.buttonContent.textContent = this.i18nLess;

    this.container.classList.remove(this.hiddenClass);
    this.container.classList.add(this.transitionClass);
    this.container.classList.add(this.hideOverlayClass);

    this.isTransitioning = true;

    // Start height
    this.setHiddenHeight();

    this.content.offsetHeight; // force repaint

    this.onTransitionComplete()
      .then(this.onShowComplete);

    // End height
    this.setVisibleHeight();
  }

  hide() {
    if (this.isTransitioning || !this.isVisible()) {
      return;
    }

    this.buttonContent.textContent = this.i18nMore;

    this.container.classList.remove(this.visibleClass);
    this.container.classList.add(this.transitionClass);
    this.container.classList.remove(this.hideOverlayClass);

    this.isTransitioning = true;

    this.setVisibleHeight();

    this.content.offsetHeight; // force repaint

    this.onTransitionComplete()
      .then(this.onHideComplete);

    // End height
    this.setHiddenHeight();
  }

  onTransitionComplete() {
    const duration = window.getComputedStyle(this.content).getPropertyValue("transition-duration");

    // If duration is 0s, transitionend will not fire.
    if (duration === "0s") {
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      this.content.addEventListener("transitionend", resolve, { once: true });
    });
  }

  onShowComplete(event) {
    this.isTransitioning = false;
    this.container.classList.remove(this.transitionClass);
    this.container.classList.add(this.visibleClass);
  }

  onHideComplete(event) {
    this.isTransitioning = false;
    this.container.classList.remove(this.transitionClass);
    this.container.classList.add(this.hiddenClass);

    if (this.options.scrollToTop) {
      this.scrollToTop();
    }
  }

  forceHide() {
    this.container.classList.add(this.hiddenClass);
    this.container.classList.remove(this.visibleClass);
    this.container.classList.remove(this.transitionClass);
    this.setHiddenHeight();
  }

  toggle() {
    if (this.isVisible()) {
      this.hide();
    } else {
      this.show();
    }
  }

  setHiddenHeight() {
    if (this.options.hideBy === "height") {
      this.setHeight(this.options.maxHeight.style);
    } else if (this.options.hideBy === "lines") {
      const lineHeight = this.calculateLineHeight();
      this.setHeight(`${lineHeight}px`);
    }
  }

  setVisibleHeight() {
    this.setHeight(`${this.content.scrollHeight}px`);
  }

  calculateLineHeight() {
    const element = this.content;
    const rawLineHeight = window.getComputedStyle(element).getPropertyValue("line-height");
    const lineHeight = Number(rawLineHeight.replace("px", ""));
    const maxLines = this.options.maxLines;
    const padding = 10;

    if (isNaN(lineHeight)) {
      let clone = element.cloneNode();
      clone.innerHTML = "<br>";
      element.appendChild(clone);
      let singleLineHeight = clone.offsetHeight;
      clone.innerHTML = "<br><br>";
      let doubleLineHeight = clone.offsetHeight;
      element.removeChild(clone);
      return (doubleLineHeight - singleLineHeight) * maxLines + padding;
    }

    return lineHeight * maxLines + padding;
  }

  setHeight(newHeight) {
    this.element.style.setProperty("--bde-content-reveal-height", newHeight);
  }

  init() {
    this.element = document.querySelector(this.selector);
    this.container = this.element.querySelector(".bde-content-reveal__container");
    this.content = this.element.querySelector(".bde-content-reveal__content");
    this.revealButton = this.element.querySelector(".bde-content-reveal__button");
    this.buttonContent = this.revealButton.querySelector(".button-atom__text");

    this.i18nMore = this.revealButton.dataset.i18nMore;
    this.i18nLess = this.revealButton.dataset.i18nLess;

    if (isBuilder()) {
      // Force builder to show the correct button text on property change.
      // This is a workaround for Vue not updating the button text.
      this.buttonContent.textContent = this.i18nMore;
    }

    this.revealButton.addEventListener("click", this.toggle);

    this.forceHide();
  }

  update(options) {
    if (options) {
      this.options = mergeObjects(this.defaultOptions, options);
    }

    this.destroy();
    this.init();
  }

  destroy() {
    this.container.classList.remove(this.hideOverlayClass);
    this.revealButton.removeEventListener("click", this.toggle);
  }

  scrollToTop() {
    this.element.scrollIntoView({ behavior: "smooth", block: "center" });
  }
}
