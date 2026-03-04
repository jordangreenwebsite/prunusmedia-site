document.addEventListener('DOMContentLoaded', () => {
    const { url: ajaxUrl, nonceKey, nonce } = breakdanceAjax;

    /**
     * Send code to CodeBox and return the snippet ID.
     * @param {string} code
     * @returns {Promise<number>}
     */
    async function sendAndUpdate(code) {
        const payload = new URLSearchParams({
            action: 'breakdance_codebox_send',
            code: `<?php ?>\n${code}`,
            _wpnonce: nonce,
        });
        const res = await fetch(ajaxUrl, {
            method: 'POST',
            credentials: 'same-origin',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
            },
            body: payload,
        });
        const json = await res.json();
        if (json.status !== 'success') {
            throw new Error(json.data?.message || 'CodeBox error');
        }
        return json.data.snippetId;
    }

    /**
     * Wire up a Send button for the given location ('header' or 'footer').
     * @param {'header'|'footer'} location
     */
    function bindSend(location) {
        const sendBtn = document.getElementById(`send_to_codebox_${location}`);
        const textarea = document.getElementById(`tracking_code_${location}`);
        if (!sendBtn || !textarea) return;

        sendBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            sendBtn.disabled = true;
            try {
                const snippetId = await sendAndUpdate(textarea.value);
                textarea.value = `\\BreakdanceWPCodeBox\\runSnippet(${snippetId});`;
            } catch (err) {
                alert(`Send to CodeBox failed: ${err.message}`);
            } finally {
                sendBtn.disabled = false;
                initializeControls();
            }
        });
    }

    // Bind both header and footer buttons
    ['header', 'footer'].forEach(bindSend);

    // Initialize UI state on load
    initializeControls();

    // Function to toggle button visibility and textarea state
    function initializeControls() {
        ['header', 'footer'].forEach(function (location) {
            var sendBtn = document.getElementById('send_to_codebox_' + location);
            var openBtn = document.getElementById('open_codebox_' + location);
            var clearBtn = document.getElementById('clear_codebox_' + location);
            var textarea = document.getElementById('tracking_code_' + location);
            if (!textarea) return;

            var hasRun = textarea.value.indexOf('\\BreakdanceWPCodeBox\\runSnippet') !== -1;

            if (hasRun) {
                if (sendBtn) sendBtn.style.display = 'none';
                if (openBtn) openBtn.style.display = '';
                textarea.readOnly = true;
            } else {
                if (sendBtn) sendBtn.style.display = '';
                if (openBtn) openBtn.style.display = 'none';
                textarea.readOnly = false;
            }

            if (openBtn) {
                openBtn.onclick = function () {
                    var match = textarea.value.match(/runSnippet\((\d+)\)/);
                    var snippetId = match ? match[1] : '';
                    window.location.href = 'admin.php?page=wpcodebox2&snippet=' + snippetId;
                };
            }

            if (clearBtn) {
                clearBtn.onclick = function () {
                    if (confirm('Really clear the current code?')) {
                        textarea.value = '';
                        textarea.readOnly = false;
                        if (sendBtn) sendBtn.style.display = '';
                        if (openBtn) openBtn.style.display = 'none';
                    }
                };
            }
        });
    }
});