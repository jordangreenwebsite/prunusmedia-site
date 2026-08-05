// Marquee Text Component
(function () {
  const { mergeObjects } = BreakdanceFrontend.utils;

  class BreakdanceMarqueeText {
    defaultOptions = {
      text: "Welcome to the future of web design",
      spacer: "",
      spacing: 20,
      direction: "ltr",
      shape: "straight",
      speed: 10,
      fontSize: 48,
      waveAmplitude: 50,
      waveFrequency: 4,
    };

    constructor(containerSelector, config = {}) {
      this.selector = containerSelector;

      // Find container element and SVG
      this.container = document.querySelector(
        `${this.selector} .marquee-container`
      );

      if (!this.container) {
        throw new Error(`Container element not found: ${this.selector}`);
      }

      this.svg = this.container.querySelector("svg");
      if (!this.svg) {
        throw new Error(`SVG element not found inside: ${this.selector}`);
      }

      // Find required child elements
      this.textGroup = this.svg.querySelector(".text-group");
      this.wavePath = this.svg.querySelector(".wave-path");
      this.straightPath = this.svg.querySelector(".straight-path");

      if (!this.textGroup || !this.wavePath || !this.straightPath) {
        throw new Error(
          "Required SVG elements (text-group, wave-path, straight-path) not found"
        );
      }

      // Make path IDs unique for this instance using the class name
      const uniqueId = this.selector.replace(".", "");
      this.straightPathId = `straightPath-${uniqueId}`;
      this.wavePathId = `wavePath-${uniqueId}`;
      this.straightPath.id = this.straightPathId;
      this.wavePath.id = this.wavePathId;

      // Merge defaults with config
      this.options = mergeObjects(this.defaultOptions, config);
      this.sanitizeOptions();

      // Animation state
      this.animationId = null;
      this.offset = 0;
      this.shouldAnimate = true; // Will be set to false if prefers-reduced-motion

      this.init();
    }

    sanitizeOptions() {
      // Convert all numeric options to numbers
      this.options.spacing = Number(this.options.spacing) || 0;
      this.options.speed = Number(this.options.speed);
      this.options.fontSize = Number(this.options.fontSize);
      this.options.waveAmplitude = Number(this.options.waveAmplitude) || 0;
      this.options.waveFrequency = Number(this.options.waveFrequency);

      // Ensure numeric values that shouldn't be zero or negative have minimum values
      if (!this.options.speed || this.options.speed <= 0) {
        this.options.speed = this.defaultOptions.speed;
      }
      if (!this.options.fontSize || this.options.fontSize <= 0) {
        this.options.fontSize = this.defaultOptions.fontSize;
      }
      if (!this.options.waveFrequency || this.options.waveFrequency <= 0) {
        this.options.waveFrequency = this.defaultOptions.waveFrequency;
      }
    }

    init() {
      this.setupAccessibility();
      this.render();
      if (this.shouldAnimate) {
        this.startAnimation();
      }
      this.setupFontLoadListener();
    }

    setupFontLoadListener() {
      // Listen for font load events and recalculate if needed
      if (document.fonts) {
        // Store initial text width for comparison
        const initialTextWidth = this.textWidth;

        // Set up a one-time font load handler
        const fontLoadHandler = () => {
          // Small delay to ensure font rendering is complete
          setTimeout(() => {
            // Re-measure to see if width changed
            const tempText = document.createElementNS(
              "http://www.w3.org/2000/svg",
              "text"
            );
            tempText.classList.add("marquee-text");
            tempText.textContent = this.options.text;
            tempText.style.visibility = "hidden";
            this.svg.appendChild(tempText);
            const newTextWidth = tempText.getComputedTextLength();
            this.svg.removeChild(tempText);

            // If width changed significantly, re-render
            if (Math.abs(newTextWidth - initialTextWidth) > 1) {
              this.render();
            }
          }, 100);
        };

        // Listen for font loading
        document.fonts.ready.then(fontLoadHandler);

        // Also listen for any font that loads after initial ready
        if (document.fonts.addEventListener) {
          document.fonts.addEventListener("loadingdone", fontLoadHandler, {
            once: true,
          });
        }
      }

      // Fallback: recalculate after a delay as a safety net
      setTimeout(() => {
        this.render();
      }, 500);
    }

    setupAccessibility() {
      // Add ARIA attributes
      this.container.setAttribute("role", "region");
      this.container.setAttribute("aria-label", "Animated text marquee");
      this.container.setAttribute("aria-live", "off"); // Don't announce changes

      // Create screen reader only text
      const srText = document.createElement("span");
      srText.className = "sr-only";
      srText.textContent = this.options.text;
      srText.setAttribute("aria-label", `Marquee text: ${this.options.text}`);
      this.srTextElement = srText;
      this.container.insertBefore(srText, this.svg);

      // Respect prefers-reduced-motion - pause animation if user prefers
      this.prefersReducedMotion = window.matchMedia(
        "(prefers-reduced-motion: reduce)"
      );

      if (this.prefersReducedMotion.matches) {
        this.shouldAnimate = false;
      }

      // Listen for changes to the preference
      this.motionChangeHandler = (e) => {
        this.shouldAnimate = !e.matches;
        if (!this.shouldAnimate && this.animationId) {
          cancelAnimationFrame(this.animationId);
          this.animationId = null;
        } else if (this.shouldAnimate && !this.animationId) {
          this.startAnimation();
        }
      };
      this.prefersReducedMotion.addEventListener(
        "change",
        this.motionChangeHandler
      );
    }

    // Public method to update configuration
    update(options) {
      if (options) {
        this.options = mergeObjects(this.defaultOptions, options);
        this.sanitizeOptions();
      }
      this.destroy();
      this.init();
    }

    updateWavePath() {
      // Generate wave path dynamically based on amplitude and frequency
      const svgWidth = 2000;
      const centerY = this.svgHeight / 2;
      const segmentWidth = svgWidth / this.options.waveFrequency;

      let pathData = `M 0,${centerY}`;

      for (let i = 0; i < this.options.waveFrequency; i++) {
        const x1 = i * segmentWidth + segmentWidth / 2;
        const y1 =
          centerY +
          (i % 2 === 0
            ? -this.options.waveAmplitude
            : this.options.waveAmplitude);
        const x2 = (i + 1) * segmentWidth;
        const y2 = centerY;

        pathData += ` Q ${x1},${y1} ${x2},${y2}`;
      }

      this.wavePath.setAttribute("d", pathData);
    }

    updateStraightPath() {
      // Update straight path to use dynamic center
      const svgWidth = 2000;
      const centerY = this.svgHeight / 2;
      this.straightPath.setAttribute(
        "d",
        `M 0,${centerY} L ${svgWidth},${centerY}`
      );
    }

    render() {
      // Calculate dynamic SVG height based on font size and wave amplitude
      const padding = 40; // Padding above and below
      const maxWaveHeight =
        this.options.shape === "wave" ? this.options.waveAmplitude * 2 : 0;
      this.svgHeight = this.options.fontSize + maxWaveHeight + padding;

      // Update SVG viewBox
      this.svg.setAttribute("viewBox", `0 0 2000 ${this.svgHeight}`);

      // Update paths with new center
      this.updateStraightPath();
      this.updateWavePath();

      // Clear existing text
      this.textGroup.innerHTML = "";

      // Determine which path to use
      const pathId =
        this.options.shape === "wave" ? this.wavePathId : this.straightPathId;

      // Measure text content width
      const tempText = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "text"
      );
      tempText.classList.add("marquee-text");
      tempText.textContent = this.options.text;
      tempText.style.visibility = "hidden";
      this.svg.appendChild(tempText);
      const textContentWidth = tempText.getComputedTextLength();

      // Measure spacer width if it exists
      let spacerWidth = 0;
      if (this.options.spacer) {
        tempText.textContent = this.options.spacer;
        spacerWidth = tempText.getComputedTextLength();
      }

      this.svg.removeChild(tempText);

      // Store widths for animation
      this.textContentWidth = textContentWidth;
      this.spacerWidth = spacerWidth;
      this.textWidth = textContentWidth + spacerWidth + this.options.spacing;
      this.pathLength = 2000; // SVG viewBox width

      // Calculate how many copies we need for seamless loop
      const copiesNeededForPath = Math.ceil(this.pathLength / this.textWidth);
      this.duplicateCount = copiesNeededForPath * 3;

      // Create text elements
      for (let i = 0; i < this.duplicateCount; i++) {
        // Create main text element
        const text = document.createElementNS(
          "http://www.w3.org/2000/svg",
          "text"
        );
        text.classList.add("marquee-text");
        text.setAttribute("data-index", i);
        text.setAttribute("data-type", "main");
        text.setAttribute("dominant-baseline", "middle");
        text.setAttribute("text-anchor", "start");

        const textPath = document.createElementNS(
          "http://www.w3.org/2000/svg",
          "textPath"
        );
        textPath.setAttributeNS(
          "http://www.w3.org/1999/xlink",
          "xlink:href",
          `#${pathId}`
        );
        textPath.setAttribute("alignment-baseline", "middle");
        textPath.textContent = this.options.text;

        text.appendChild(textPath);
        this.textGroup.appendChild(text);

        // Create spacer element if spacer exists - positioned in middle of gap
        if (this.options.spacer) {
          const spacerText = document.createElementNS(
            "http://www.w3.org/2000/svg",
            "text"
          );
          spacerText.classList.add("marquee-text");
          spacerText.setAttribute("data-index", i);
          spacerText.setAttribute("data-type", "spacer");
          spacerText.setAttribute("dominant-baseline", "middle");
          spacerText.setAttribute("text-anchor", "start");

          const spacerPath = document.createElementNS(
            "http://www.w3.org/2000/svg",
            "textPath"
          );
          spacerPath.setAttributeNS(
            "http://www.w3.org/1999/xlink",
            "xlink:href",
            `#${pathId}`
          );
          spacerPath.setAttribute("alignment-baseline", "middle");
          spacerPath.textContent = this.options.spacer;

          spacerText.appendChild(spacerPath);
          this.textGroup.appendChild(spacerText);
        }
      }

      // Reset offset when rendering
      this.offset = 0;
    }

    startAnimation() {
      const animate = () => {
        // Update offset continuously
        const speed = this.textWidth / (this.options.speed * 60); // pixels per frame at 60fps

        this.offset += speed;

        // Normalize offset when it completes one cycle
        if (this.offset > this.textWidth) {
          this.offset -= this.textWidth;
        }

        // Update all text positions
        const textElements = this.textGroup.querySelectorAll("text");

        textElements.forEach((text) => {
          const textPath = text.querySelector("textPath");
          const dataIndex = parseInt(text.getAttribute("data-index"));
          const dataType = text.getAttribute("data-type");

          // Calculate base position for this index
          let position = dataIndex * this.textWidth;

          // If this is a spacer, offset it to the middle of the gap
          if (dataType === "spacer") {
            // Position spacer exactly in the center: 50px after text, 50px before next text
            position += this.textContentWidth + this.options.spacing / 2;
          }

          // Apply the animation offset
          if (this.options.direction === "ltr") {
            position += this.offset;
          } else {
            position -= this.offset;
          }

          // Wrap position to create seamless loop
          // Keep wrapping until position is in a reasonable range
          while (position < -this.textWidth) {
            position += this.textWidth * this.duplicateCount;
          }
          while (position > this.pathLength + this.textWidth) {
            position -= this.textWidth * this.duplicateCount;
          }

          // Set the position on the path
          textPath.setAttribute("startOffset", `${position}px`);
        });

        this.animationId = requestAnimationFrame(animate);
      };

      // Start animation loop
      if (this.animationId) {
        cancelAnimationFrame(this.animationId);
      }
      animate();
    }

    destroy() {
      // Cancel animation frame
      if (this.animationId) {
        cancelAnimationFrame(this.animationId);
        this.animationId = null;
      }

      // Remove media query listener
      if (this.prefersReducedMotion && this.motionChangeHandler) {
        this.prefersReducedMotion.removeEventListener(
          "change",
          this.motionChangeHandler
        );
      }

      // Remove screen reader element
      if (this.srTextElement && this.srTextElement.parentNode) {
        this.srTextElement.parentNode.removeChild(this.srTextElement);
      }

      // Clear text group content
      if (this.textGroup) {
        this.textGroup.innerHTML = "";
      }

      // Remove ARIA attributes
      if (this.container) {
        this.container.removeAttribute("role");
        this.container.removeAttribute("aria-label");
        this.container.removeAttribute("aria-live");
      }

      // Clear only dynamic references (keep core DOM elements)
      this.srTextElement = null;
      this.prefersReducedMotion = null;
      this.motionChangeHandler = null;
    }
  }

  window.BreakdanceMarqueeText = BreakdanceMarqueeText;
})();
