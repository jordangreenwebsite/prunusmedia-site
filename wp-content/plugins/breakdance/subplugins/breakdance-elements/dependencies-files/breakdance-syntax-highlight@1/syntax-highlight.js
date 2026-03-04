(function () {
  class BreakdanceSyntaxHighlight {
    constructor(selector) {
      this.selector = selector;
      this.element = document.querySelector(
        `${this.selector} .js-syntax-highlight`
      );
      this.code = this.element.querySelector("pre code");
      this.codeData = this.element.querySelector(".js-syntax-highlight-data");
      this.copyCodeButton = this.element.querySelector(".js-copy-code-btn");
      this.init();
    }

    highlightCode() {
      const codeHighlight = hljs.highlightAuto(this.codeData.textContent);
      this.code.innerHTML = codeHighlight.value;
      this.code.classList.add(`language-${codeHighlight.language}`);
    }

    // Methods
    destroy() {
      if (!this.element) return;
      this.element = null;
      this.code.innerHTML = "";
      if (this.copyCodeButton) {
        this.clipboard.destroy();
        this.copyCodeButton.classList.remove("is-copied");
      }
    }

    clipboard() {
      const elString = `${this.selector} .js-copy-code-btn`;
      this.clipboard = new ClipboardJS(elString, {
        target: () => {
          return this.code;
        },
      });

      this.clipboard.on("success", (e) => {
        this.copyCodeButton.classList.add("is-copied");
        setTimeout(() => {
          this.copyCodeButton.classList.remove("is-copied");
        }, 3000);
        e.clearSelection();
      });

      this.clipboard.on("error", (e) => {
        this.copyCodeButton.classList.remove("is-copied");
        console.warn("Error copy to clipboard:", e.action);
      });
    }

    update() {
      this.destroy();
      this.init();
    }

    init() {
      this.highlightCode();
      if (this.copyCodeButton) {
        this.clipboard();
      }
    }
  }

  window.BreakdanceSyntaxHighlight = BreakdanceSyntaxHighlight;
})();
