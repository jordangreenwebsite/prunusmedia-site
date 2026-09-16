(function () {
  /**
   * Moves the WooCommerce review form (#review_form_wrapper) of the element
   * matched by `selector` into a modal, and puts the trigger button where the
   * form originally was. The trigger and modal shell are rendered by the
   * element's SSR (.bde-review-modal markup).
   */
  function BreakdanceReviewFormModal(selector) {
    var root = document.querySelector(selector);
    if (!root) return;

    // An element can render nested inside another one that also has the modal
    // enabled (e.g. a product's content inside a template's tabs description
    // panel), so only accept nodes whose nearest element root is this root.
    function owned(sel) {
      return Array.prototype.find.call(root.querySelectorAll(sel), function (candidate) {
        return candidate.closest(".bde-product-reviews, .bde-wooproducttabs") === root;
      }) || null;
    }

    var modal = owned(".bde-review-modal");
    var trigger = owned(".bde-review-modal-trigger");
    var body = modal && modal.querySelector(".bde-review-modal__body");
    var form = owned("#review_form_wrapper");
    if (!modal || !trigger || !body || !form) return;

    // The trigger takes the form's original place; the form goes into the modal.
    form.parentNode.insertBefore(trigger, form);
    body.appendChild(form);

    function onKeydown(e) {
      if (e.key === "Escape") close();
    }

    function open() {
      modal.classList.add("is-open");
      modal.setAttribute("aria-hidden", "false");
      document.addEventListener("keydown", onKeydown);
    }

    function close() {
      modal.classList.remove("is-open");
      modal.setAttribute("aria-hidden", "true");
      document.removeEventListener("keydown", onKeydown);
    }

    trigger.addEventListener("click", open);
    modal.addEventListener("click", function (e) {
      if (e.target.closest(".bde-review-modal__close") || !e.target.closest(".bde-review-modal__content")) {
        close();
      }
    });
  }

  window.BreakdanceReviewFormModal = BreakdanceReviewFormModal;
})();
