/* global BREAKDANCE_ADDED_TO_CART */
(function () {
  const { mergeObjects, matchMedia } = BreakdanceFrontend.utils;

  class BreakdanceMiniCart {
    defaultOptions = {
      full_screen_at: "breakpoint_phone_landscape",
      style: "dropdown",
      cart: {
        open_cart_on_add: false,
      },
    };

    constructor(selector, options) {
      this.open = this.open.bind(this);
      this.onEnterClick = this.onEnterClick.bind(this);
      this.onToggleClick = this.onToggleClick.bind(this);
      this.onCloseClick = this.onCloseClick.bind(this);
      this.onEscClick = this.onEscClick.bind(this);
      this.onMaybeClickOutside = this.onMaybeClickOutside.bind(this);
      this.onFocusOut = this.onFocusOut.bind(this);

      this.selector = selector;
      this.options = mergeObjects(this.defaultOptions, options);
      this.activeClass = "bde-mini-cart-offcanvas--active";

      this.init();
    }

    getScrollBarWidth() {
      // https://developer.mozilla.org/en-US/docs/Web/API/Window/innerWidth#usage_notes
      const documentWidth = document.documentElement.clientWidth
      return Math.abs(window.innerWidth - documentWidth)
    }

    update(options) {
      this.options = mergeObjects(this.defaultOptions, options);
      this.destroy();
      this.init();
    }

    destroy() {
      this.unbindListeners();
    }

    isOpen() {
      return this.offcanvas.classList.contains(this.activeClass);
    }

    toggle() {
      if (this.isOpen()) {
        this.close();
      } else {
        this.open();
      }
    }

    open() {
      if (this.shouldStopScrolling()) {
        this.setBalancePadding();
        document.documentElement.classList.add("bde-stop-scrolling");
      }

      this.offcanvas.classList.add(this.activeClass);
      document.documentElement.classList.add("is-breakdance-mini-cart-open");
    }

    close() {
      if (!this.isOpen()) return;

      this.offcanvas.classList.remove(this.activeClass);
      document.documentElement.classList.remove("is-breakdance-mini-cart-open");

      // Remove padding after transition to prevent flickering
      this.offcanvas.addEventListener("transitionend", () => {
        document.documentElement.classList.remove("bde-stop-scrolling");
        document.body.style.paddingRight = null;
      }, { once: true });
    }

    isFocusWithin() {
      return this.element.contains(document.activeElement);
    }

    shouldStopScrolling() {
      const isFullscreen = matchMedia(this.options.full_screen_at);
      return isFullscreen || this.options.style === "sidebar";
    }

    setBalancePadding() {
      const element = document.body;
      const scrollbarWidth = this.getScrollBarWidth();

      if (window.innerWidth <= element.clientWidth + scrollbarWidth) {
        const currPadding = window.getComputedStyle(element).getPropertyValue("padding-right");
        const currPaddingAsNum = Number.parseFloat(currPadding);
        const newPadding = currPaddingAsNum + scrollbarWidth;

        // Give padding to element to balance the hidden scrollbar width
        if (newPadding > 0) element.style.paddingRight = `${newPadding}px`;
      }
    }

    focusInside() {
      const firstNode = this.element.querySelector(".bde-mini-cart-item-thumbnail, .bde-mini-cart-item-title");
      const container = this.element.querySelector(".bde-mini-cart-offcanvas-body");

      container.addEventListener("transitionend", () => {
        firstNode?.focus();
      }, { once: true });
    }

    focusToggle() {
      this.toggleButton.focus();
    }

    onEnterClick(event) {
      if (!["Enter", " "].includes(event.key)) return;
      event.preventDefault();

      this.toggle();
      this.focusInside();
      this.element.addEventListener("focusout", this.onFocusOut);
    }

    onToggleClick(event) {
      event.preventDefault();
      this.toggle();
    }

    onCloseClick() {
      this.close();
    }

    onEscClick(event) {
      if (event.key !== "Escape") return;
      if (!this.isOpen()) return;

      this.close();
      this.focusToggle();
    }

    onMaybeClickOutside(event) {
      if (!this.element.contains(event.target)) {
        this.close();
      }
    }

    onFocusOut(event) {
      if (!event.relatedTarget) return;
      if (this.element.contains(event.relatedTarget)) return;

      this.close();
      this.element.removeEventListener("focusout", this.onFocusOut);
    }

    bindListeners() {
      if (!this.toggleButton || !this.closeButton || !this.overlay) {
        return;
      }

      this.toggleButton.addEventListener("click", this.onToggleClick);
      this.toggleButton.addEventListener("keydown", this.onEnterClick);
      this.closeButton.addEventListener("click", this.onCloseClick);
      this.overlay.addEventListener("click", this.onCloseClick);

      addEventListener("click", this.onMaybeClickOutside);
      addEventListener("keydown", this.onEscClick);

      if (this.options.cart.open_cart_on_add) {
        // Ajax add to cart
        jQuery(document.body).on("added_to_cart", this.open);

        // Non-ajax add to cart
        if (typeof BREAKDANCE_ADDED_TO_CART !== "undefined") this.open();
      }
    }

    unbindListeners() {
      if (!this.toggleButton || !this.closeButton || !this.overlay) {
        return;
      }

      this.toggleButton.removeEventListener("click", this.onToggleClick);
      this.toggleButton.removeEventListener("keydown", this.onEnterClick);
      this.closeButton.removeEventListener("click", this.onCloseClick);
      this.overlay.removeEventListener("click", this.onToggleClick);
      this.element.removeEventListener("focusout", this.onFocusOut);

      removeEventListener("click", this.onMaybeClickOutside);
      removeEventListener("keydown", this.onEscClick);

      jQuery(document.body).off("added_to_cart", this.open);
    }

    init() {
      this.element = document.querySelector(this.selector);

      if (!this.element) return;

      this.toggleButton = this.element.querySelector(".bde-mini-cart-toggle");
      this.closeButton = this.element.querySelector(".bde-mini-cart-offcanvas__close-button");
      this.offcanvas = this.element.querySelector(".bde-mini-cart-offcanvas");
      this.overlay = this.element.querySelector(".bde-mini-cart-offcanvas-overlay");

      this.bindListeners();
    }
  }

  window.BreakdanceMiniCart = BreakdanceMiniCart;
})();
