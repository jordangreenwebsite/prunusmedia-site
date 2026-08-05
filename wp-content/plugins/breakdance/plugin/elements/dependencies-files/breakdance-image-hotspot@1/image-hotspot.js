(function () {
  const { mergeObjects } = BreakdanceFrontend.utils;

  class BreakdanceImageHotspot {
    options = {
      trigger: "hover",
    };

    constructor(selector, options) {
      this.selector = selector;
      this.popups = document.querySelectorAll(
        `${this.selector} .un-hotspot-point`
      );
      this.instances = [];
      this.options = mergeObjects(this.options, options || {});
      this.showEvents = ["mouseenter", "focus"];
      this.hideEvents = ["mouseleave", "blur"];
      this.init();
    }

    initPopups() {
      const { trigger } = this.options;

      this.popups.forEach((button) => {
        const tooltip = button.querySelector(".un-hotspot-tooltip");

        const popperInstance = Popper.createPopper(button, tooltip, {
          placement: "auto",
          modifiers: [
            {
              name: "preventOverflow",
              options: {
                boundary: this.selector,
                altAxis: true,
              },
            },
            {
              name: "offset",
              options: {
                offset: [10, 10],
              },
            },
          ],
        });

        if (button.getAttribute("listener") !== "true") {
          if (trigger === "hover") {
            this.showEvents.forEach((event) => {
              button.setAttribute("listener", "true");
              button.addEventListener(event, () =>
                this.showTooltip(tooltip, popperInstance)
              );
            });

            this.hideEvents.forEach((event) => {
              button.setAttribute("listener", "true");
              button.addEventListener(event, () =>
                this.hideTooltip(tooltip, popperInstance)
              );
            });
          }

          if (trigger === "link") {
            button.setAttribute("listener", "true");

            this.showEvents.forEach((event) => {
              button.addEventListener(event, () =>
                this.showTooltip(tooltip, popperInstance)
              );
            });

            this.hideEvents.forEach((event) => {
              button.addEventListener(event, () =>
                this.hideTooltip(tooltip, popperInstance)
              );
            });

            button.addEventListener("click", () => {
              this.goToUrl(tooltip);
            });
          }

          if (trigger === "click") {
            button.setAttribute("listener", "true");
            button.addEventListener("click", (e) => {
              e.preventDefault();
              this.toggleTooltip(tooltip, popperInstance);
            });
          }
        }

        this.instances.push({ popper: popperInstance, button: button });
      });
    }

    goToUrl(tooltip) {
      if (tooltip.dataset.url.length > 0) {
        window.location = tooltip.dataset.url;
      }
    }

    showTooltip(tooltip, popperInstance) {
      // Make the tooltip visible
      tooltip.setAttribute("data-show", "");
      tooltip
        .querySelector(".un-hotspot-tooltip-arrow")
        .setAttribute("data-popper-arrow", "");

      // Enable the event listeners
      popperInstance.setOptions((options) => ({
        ...options,
        modifiers: [
          ...options.modifiers,
          { name: "eventListeners", enabled: true },
        ],
      }));

      // Update its position
      popperInstance.update();
    }

    hideTooltip(tooltip, popperInstance) {
      // Hide the tooltip
      tooltip.removeAttribute("data-show");
      tooltip
        .querySelector(".un-hotspot-tooltip-arrow")
        .removeAttribute("data-popper-arrow");

      // Disable the event listeners
      popperInstance.setOptions((options) => ({
        ...options,
        modifiers: [
          ...options.modifiers,
          { name: "eventListeners", enabled: false },
        ],
      }));
    }

    toggleTooltip(tooltip, popperInstance) {
      if (tooltip.hasAttribute("data-show")) {
        this.hideTooltip(tooltip, popperInstance);
      } else {
        this.showTooltip(tooltip, popperInstance);
      }
    }

    destroy() {
      this.instances.forEach((instance) => {
        instance.button.removeAttribute("listener");
        // remove the event listeners dirty way
        // https://stackoverflow.com/questions/4386300/javascript-dom-how-to-remove-all-event-listeners-of-a-dom-object
        instance.button.outerHTML = instance.button.outerHTML;
        instance.popper.destroy();
      });
    }

    init() {
      this.initPopups();
    }
  }

  window.BreakdanceImageHotspot = BreakdanceImageHotspot;
})();
