(function () {
  /**
   * Search Form V2 behavior.
   *
   * Modal mode: the toggle button opens the dialog, the field gets focus,
   * and Escape, the backdrop, or the close button dismiss it, returning
   * focus to the toggle. Closing plays exit keyframes through an is-closing
   * state.
   *
   * Autocomplete (works in inline and modal mode): debounced requests to
   * the admin-ajax endpoint, which returns rendered result HTML (built-in
   * items or the configured Global Block per result).
   *
   * Instances are destroyable so the builder can re-instantiate on
   * property changes.
   */
  class BreakdanceSearchFormV2 {
    constructor(selector, options) {
      this.options = options || {};
      this.root = document.querySelector(selector);
      if (!this.root) return;

      this.toggle = this.root.querySelector(".bde-search-form-v2__toggle");
      this.modal = this.root.querySelector(".bde-search-form-v2__modal");
      this.form = this.root.querySelector(".bde-search-form-v2__form");
      this.field = this.root.querySelector(".bde-search-form-v2__field");
      this.results = this.root.querySelector(".bde-search-form-v2__results");

      if (this.toggle && this.modal) this.bindModal();

      const autocomplete = this.options.autocomplete;
      if (this.results && this.field && autocomplete && autocomplete.enabled) {
        this.bindAutocomplete(autocomplete);
      }
    }

    bindModal() {
      this.panel = this.modal.querySelector(".bde-search-form-v2__panel");
      this.backdrop = this.modal.querySelector(".bde-search-form-v2__backdrop");
      this.closeButton = this.modal.querySelector(".bde-search-form-v2__close");

      this.onToggleClick = this.open.bind(this);
      this.onDismissClick = this.close.bind(this);
      this.onKeydown = (event) => {
        if (event.key === "Escape") this.close();
      };

      this.toggle.addEventListener("click", this.onToggleClick);
      if (this.backdrop) this.backdrop.addEventListener("click", this.onDismissClick);
      if (this.closeButton) this.closeButton.addEventListener("click", this.onDismissClick);
    }

    open() {
      this.modal.classList.remove("is-closing", "is-restoring");
      this.modal.classList.add("is-open");
      this.toggle.setAttribute("aria-expanded", "true");
      document.addEventListener("keydown", this.onKeydown);
      if (this.field) this.field.focus();
    }

    isOpen() {
      return !!(this.modal && this.modal.classList.contains("is-open"));
    }

    /**
     * Re-apply the open state without focus or the entrance animation. The
     * builder uses this after a property change re-rendered the markup, so
     * an open modal stays open while it is being designed.
     */
    restore() {
      if (!this.modal) return;
      this.modal.classList.add("is-restoring", "is-open");
      this.toggle.setAttribute("aria-expanded", "true");
      document.addEventListener("keydown", this.onKeydown);
    }

    close() {
      if (!this.modal.classList.contains("is-open")) return;
      this.modal.classList.remove("is-open", "is-restoring");
      this.toggle.setAttribute("aria-expanded", "false");
      document.removeEventListener("keydown", this.onKeydown);
      this.toggle.focus();

      // Play the exit keyframes: is-closing keeps the modal displayed while
      // they run, then drops away. Under prefers-reduced-motion the exit
      // animation is disabled in CSS, so close instantly (there is no
      // animationend to wait for).
      const reducedMotion =
        window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (reducedMotion || !this.panel) return;

      this.modal.classList.add("is-closing");
      let finished = false;
      const finish = () => {
        if (finished) return;
        finished = true;
        this.modal.classList.remove("is-closing");
      };
      this.panel.addEventListener("animationend", finish, { once: true });
      // Fallback in case animationend never fires (e.g. the exit animation
      // was overridden away).
      setTimeout(finish, 300);
    }

    bindAutocomplete(settings) {
      this.minCharacters = parseInt(settings.min_characters, 10) || 2;
      this.maxResults = parseInt(settings.results, 10) || 5;
      this.itemBlockId = parseInt(settings.item_block, 10) || 0;
      this.emptyBlockId = parseInt(settings.empty_block, 10) || 0;
      this.activeIndex = -1;

      this.onInput = () => {
        clearTimeout(this.searchTimer);
        this.searchTimer = setTimeout(() => this.fetchResults(), 250);
      };
      this.onFieldKeydown = (event) => {
        if (event.key === "Escape") {
          // With the list open, Escape dismisses it and stops there; in
          // modal mode a second Escape then closes the modal (the modal's
          // own listener sits on document).
          if (this.results && !this.results.hidden) event.stopPropagation();
          this.hideResults();
          return;
        }

        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          const options = this.resultOptions();
          if (!options.length) return;
          event.preventDefault();
          const step = event.key === "ArrowDown" ? 1 : -1;
          // Wraps past either end, and -1 (nothing active) steps to the
          // first or last item, so ArrowUp from the field lands on the
          // last result the way native comboboxes do.
          const index = (this.activeIndex + step + options.length + 1) % (options.length + 1);
          this.setActiveOption(index === options.length ? -1 : index);
          return;
        }

        if (event.key === "Enter") {
          const options = this.resultOptions();
          const active = options[this.activeIndex];
          if (!active) return;
          // A highlighted result takes Enter over submitting the form.
          event.preventDefault();
          const link = active.matches("a[href]") ? active : active.querySelector("a[href]");
          if (link) {
            link.click();
          } else if (this.form) {
            // A Global Block item with no link inside: fall back to the
            // regular search submit.
            this.form.requestSubmit ? this.form.requestSubmit() : this.form.submit();
          }
        }
      };
      this.onDocumentClick = (event) => {
        if (!this.root.contains(event.target)) this.hideResults();
      };

      this.field.addEventListener("input", this.onInput);
      this.field.addEventListener("keydown", this.onFieldKeydown);
      document.addEventListener("click", this.onDocumentClick);
    }

    fetchResults() {
      const term = this.field.value.trim();
      if (term.length < this.minCharacters) {
        this.hideResults();
        return;
      }

      if (this.abortController) this.abortController.abort();
      this.abortController = new AbortController();

      const body = new FormData();
      body.append("action", "breakdance_search_form_v2_autocomplete");
      body.append("s", term);
      body.append("limit", String(this.maxResults));
      if (this.itemBlockId) body.append("block_id", String(this.itemBlockId));
      if (this.emptyBlockId) body.append("empty_block_id", String(this.emptyBlockId));
      const postTypeInput = this.form && this.form.querySelector('input[name="post_type"]');
      if (postTypeInput && postTypeInput.value) body.append("post_type", postTypeInput.value);

      const frontendData = window.BreakdanceFrontend && window.BreakdanceFrontend.data;
      const ajaxUrl = (frontendData && frontendData.ajaxUrl) || "/wp-admin/admin-ajax.php";

      fetch(ajaxUrl, {
        method: "POST",
        credentials: "same-origin",
        body,
        signal: this.abortController.signal,
      })
        .then((response) => response.json())
        .then((json) => {
          const html = json && json.data && json.data.html;
          if (typeof html === "string" && this.field.value.trim().length >= this.minCharacters) {
            this.showResults(html);
          }
        })
        .catch(() => {});
    }

    /**
     * Snapshot of the autocomplete state, taken by the builder before a
     * property change tears this instance down.
     */
    resultsState() {
      if (!this.results || this.results.hidden) return null;
      return {
        html: this.results.innerHTML,
        value: this.field ? this.field.value : "",
      };
    }

    /**
     * Re-apply a results snapshot on the freshly rendered markup, without
     * the entrance animation, so an open list stays open while its design
     * is being edited.
     */
    restoreResults(state) {
      if (!state || !this.results) return;
      if (this.field && state.value) this.field.value = state.value;
      this.results.innerHTML = state.html;
      this.results.hidden = false;
      this.activeIndex = -1;
      this.setResultsExpanded(true);
    }

    resultOptions() {
      if (!this.results || this.results.hidden) return [];
      return Array.prototype.slice.call(this.results.querySelectorAll('[role="option"]'));
    }

    /**
     * Highlight the option at index (-1 for none) and mirror it into the
     * combobox ARIA: aria-selected on the option, aria-activedescendant on
     * the field. Focus stays on the field throughout.
     */
    setActiveOption(index) {
      const options = this.resultOptions();
      this.activeIndex = index;

      options.forEach((option, i) => {
        // Ids are assigned lazily; results arrive as rendered HTML from the
        // endpoint and only need ids once keyboard focus reaches them.
        if (!option.id) option.id = this.field.id + "-result-" + i;
        option.classList.toggle("is-active", i === index);
        if (i === index) {
          option.setAttribute("aria-selected", "true");
        } else {
          option.removeAttribute("aria-selected");
        }
      });

      const active = options[index];
      if (active) {
        this.field.setAttribute("aria-activedescendant", active.id);
        if (active.scrollIntoView) active.scrollIntoView({ block: "nearest" });
      } else {
        this.field.removeAttribute("aria-activedescendant");
      }
    }

    setResultsExpanded(expanded) {
      if (this.field) this.field.setAttribute("aria-expanded", expanded ? "true" : "false");
    }

    prefersReducedMotion() {
      return !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    }

    cancelResultsClose() {
      if (this.resultsCloseFinish) {
        clearTimeout(this.resultsCloseTimer);
        this.results.removeEventListener("animationend", this.resultsCloseFinish);
        this.resultsCloseFinish = null;
      }
      this.results.classList.remove("is-closing");
    }

    showResults(html) {
      if (!this.results) return;
      if (html === "") {
        this.hideResults();
        return;
      }

      this.cancelResultsClose();

      // Only a hidden-to-visible transition animates: content updates while
      // the list is already open (typing refining results) swap in place.
      const wasHidden = this.results.hidden;
      this.results.innerHTML = html;
      this.results.hidden = false;
      // Fresh content: any keyboard highlight pointed at the old items.
      this.activeIndex = -1;
      if (this.field) this.field.removeAttribute("aria-activedescendant");
      this.setResultsExpanded(true);

      if (wasHidden && !this.prefersReducedMotion()) {
        this.results.classList.add("is-opening");
        const finish = () => this.results.classList.remove("is-opening");
        this.results.addEventListener("animationend", finish, { once: true });
        setTimeout(finish, 250);
      }
    }

    hideResults() {
      if (!this.results) return;

      this.activeIndex = -1;
      if (this.field) this.field.removeAttribute("aria-activedescendant");
      this.setResultsExpanded(false);

      const conceal = () => {
        this.results.hidden = true;
        this.results.innerHTML = "";
      };

      if (this.results.hidden || this.prefersReducedMotion()) {
        conceal();
        return;
      }

      // Play the exit keyframes before hiding, mirroring the modal close.
      this.results.classList.remove("is-opening");
      this.results.classList.add("is-closing");
      this.resultsCloseFinish = () => {
        // The animationend listener and the fallback timer share this
        // closure; only the first caller may act, or a stale timer could
        // conceal a list the user reopened in the meantime.
        if (!this.resultsCloseFinish) return;
        this.resultsCloseFinish = null;
        clearTimeout(this.resultsCloseTimer);
        this.results.classList.remove("is-closing");
        conceal();
      };
      this.results.addEventListener("animationend", this.resultsCloseFinish, { once: true });
      this.resultsCloseTimer = setTimeout(this.resultsCloseFinish, 200);
    }

    destroy() {
      if (!this.root) return;

      if (this.toggle && this.modal) {
        this.toggle.removeEventListener("click", this.onToggleClick);
        if (this.backdrop) this.backdrop.removeEventListener("click", this.onDismissClick);
        if (this.closeButton) this.closeButton.removeEventListener("click", this.onDismissClick);
        document.removeEventListener("keydown", this.onKeydown);
        this.modal.classList.remove("is-open", "is-closing", "is-restoring");
        this.toggle.setAttribute("aria-expanded", "false");
      }

      if (this.onInput) {
        clearTimeout(this.searchTimer);
        if (this.abortController) this.abortController.abort();
        this.field.removeEventListener("input", this.onInput);
        this.field.removeEventListener("keydown", this.onFieldKeydown);
        document.removeEventListener("click", this.onDocumentClick);
        this.cancelResultsClose();
        this.results.classList.remove("is-opening");
        this.results.hidden = true;
        this.results.innerHTML = "";
        this.field.removeAttribute("aria-activedescendant");
        this.setResultsExpanded(false);
      }
    }
  }

  window.BreakdanceSearchFormV2 = BreakdanceSearchFormV2;
})();
