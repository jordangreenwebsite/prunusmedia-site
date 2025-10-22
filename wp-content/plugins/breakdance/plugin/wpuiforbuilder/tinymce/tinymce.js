(function ($) {
  function getEditor() {
    return tinyMCE.get("breakdance-tinymce-control");
  }

  function getTextarea() {
    return document.querySelector("#breakdance-tinymce-control");
  }

  function parseJson( s, defaultValue ) {
    try {
      return JSON.parse( s );
    } catch ( e ) {
      return defaultValue;
    }
  }

  function pushTextToBreakdance(newText) {
    const event = new CustomEvent("breakdanceTinyMceControlInput", {
      detail: newText,
    });

    window.parent.document.dispatchEvent(event);
  }

  function onContentChange() {
    const content = getEditor().getContent();
    pushTextToBreakdance(content);
  }

  function onTextareaChange(event) {
    pushTextToBreakdance(event.target.value);
  }

  function dispatchReadyEvent() {
    window.parent.document.dispatchEvent(
      new CustomEvent("breakdanceTinyMceControlReady")
    );
  }

  function switchEditorMode(event) {
    const isEditor = event.target.classList?.contains("switch-tmce");

    unbindListeners();

    if (isEditor) {
      bindEditor();
    } else {
      bindTextarea();
    }
  }

  function updateEditorContent(event) {
    const data = typeof event.data === 'string' ? parseJson(event.data, {}) : event.data;

    if (event.origin !== location.origin) return;
    if (data.type !== 'breakdanceIframeMessage') return;

    const editor = getEditor();

    if (editor.initialized) {
      editor.setContent(data.value);
      return;
    }

    editor.on("init", () => {
      editor.setContent(data.value);
    });
  }

  function updateTextareaContent(event) {
    const data = typeof event.data === 'string' ? parseJson(event.data, {}) : event.data;

    if (event.origin !== location.origin) return;
    if (data.type !== 'breakdanceIframeMessage') return;

    const textarea = getTextarea();
    textarea.value = data.value;
  }

  function bindEditor() {
    addEventListener("message", updateEditorContent);

    if (!getEditor()) {
      tinymce.on("addeditor", () => {
        const editor = getEditor();
        editor.on("paste change input undo redo", onContentChange);
      });
    } else {
      const editor = getEditor();
      editor.on("paste change input undo redo", onContentChange);
    }
  }

  function bindTextarea() {
    const textarea = getTextarea();
    textarea.addEventListener("change", onTextareaChange);
    textarea.addEventListener("input", onTextareaChange);
    addEventListener("message", updateTextareaContent);
  }

  function unbindListeners() {
    // Clear editor
    const editor = getEditor();
    editor?.off("Paste Change input Undo Redo", onContentChange);
    removeEventListener("message", updateEditorContent);

    // Clear textarea
    const textarea = getTextarea();
    textarea?.removeEventListener("change", onTextareaChange);
    textarea?.removeEventListener("input", onTextareaChange);
    removeEventListener("message", updateTextareaContent);
  }

  function bindListeners() {
    const editor = getEditor();

    if (editor) {
      bindEditor();
    } else {
      bindTextarea();
    }

    dispatchReadyEvent();

    // Listen for switch editor mode button clicks.
    document.querySelectorAll(".wp-switch-editor").forEach((button) => {
      button.addEventListener("click", switchEditorMode);
    });

    // Media Libray
    document.querySelector(".insert-media").addEventListener("click", () => {
      const event = new CustomEvent("breakdanceTinyMceControlExpand");
      window.parent.document.dispatchEvent(event);

      setTimeout(() => {
        wp.media.frame.on("close", (e) => {
          const event = new CustomEvent("breakdanceTinyMceControlCollapse");
          window.parent.document.dispatchEvent(event);
        });
      });
    });
  }

  $(document).ready(bindListeners);
})(jQuery);
