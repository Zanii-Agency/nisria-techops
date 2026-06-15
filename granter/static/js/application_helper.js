// Application Helper. Posts a question to /grants/{id}/ask and renders the
// Claude-drafted answer plus the recommended attachments. Used on both the
// grant detail page (inline card) and the tracker page (modal).
//
// Usage on detail page:
//   <form data-helper-form data-grant-id="123">
//     <textarea data-helper-question></textarea>
//     <select data-helper-tone>...</select>
//     <input data-helper-max-words type="number" value="220">
//     <button data-helper-submit>Generate</button>
//     <div data-helper-result></div>
//   </form>
//
// Usage in tracker modal:
//   Same structure inside a Bootstrap modal. Set data-grant-id when the modal
//   opens (the tracker page does this via the trigger button).

(function () {
    "use strict";

    function escapeHtml(str) {
        if (str === null || str === undefined) return "";
        return String(str)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }

    function setLoading(form, isLoading) {
        const submit = form.querySelector("[data-helper-submit]");
        if (!submit) return;
        if (isLoading) {
            submit.disabled = true;
            submit.dataset.originalHtml = submit.innerHTML;
            submit.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Drafting...';
        } else {
            submit.disabled = false;
            if (submit.dataset.originalHtml) {
                submit.innerHTML = submit.dataset.originalHtml;
            }
        }
    }

    function renderError(resultEl, message) {
        resultEl.innerHTML = '<div class="alert alert-danger mb-0">'
            + '<strong>Could not draft answer.</strong> '
            + escapeHtml(message)
            + '</div>';
    }

    function renderResult(resultEl, payload) {
        const answer = payload.answer || "";
        const attach = Array.isArray(payload.attach) ? payload.attach : [];
        const model = payload.model || "";
        const tokens = payload.tokens_used || 0;

        const attachHtml = attach.length
            ? '<div class="mt-3"><strong>Attach:</strong><ul class="mb-0">'
                + attach.map(function (f) {
                    return '<li><code>' + escapeHtml(f) + '</code></li>';
                }).join("")
                + '</ul></div>'
            : '';

        resultEl.innerHTML = ''
            + '<div class="card border-success">'
            +   '<div class="card-header d-flex justify-content-between align-items-center bg-success-subtle">'
            +     '<strong><i class="bi bi-stars"></i> Drafted Answer</strong>'
            +     '<button type="button" class="btn btn-sm btn-outline-success" data-helper-copy>'
            +       '<i class="bi bi-clipboard"></i> Copy'
            +     '</button>'
            +   '</div>'
            +   '<div class="card-body">'
            +     '<pre class="mb-0" style="white-space: pre-wrap; word-wrap: break-word; font-family: inherit; font-size: 0.95rem;" data-helper-answer-text>'
            +       escapeHtml(answer)
            +     '</pre>'
            +     attachHtml
            +   '</div>'
            +   '<div class="card-footer small text-muted">'
            +     'Model: <code>' + escapeHtml(model) + '</code>'
            +     ' &nbsp;|&nbsp; '
            +     'Tokens used: <strong>' + tokens + '</strong>'
            +   '</div>'
            + '</div>';

        const copyBtn = resultEl.querySelector("[data-helper-copy]");
        if (copyBtn) {
            copyBtn.addEventListener("click", function () {
                const txt = answer;
                if (navigator.clipboard && navigator.clipboard.writeText) {
                    navigator.clipboard.writeText(txt).then(function () {
                        copyBtn.innerHTML = '<i class="bi bi-check2"></i> Copied';
                        setTimeout(function () {
                            copyBtn.innerHTML = '<i class="bi bi-clipboard"></i> Copy';
                        }, 1500);
                    }).catch(function () {
                        fallbackCopy(txt, copyBtn);
                    });
                } else {
                    fallbackCopy(txt, copyBtn);
                }
            });
        }
    }

    function fallbackCopy(text, btn) {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.setAttribute("readonly", "");
        ta.style.position = "absolute";
        ta.style.left = "-9999px";
        document.body.appendChild(ta);
        ta.select();
        try {
            document.execCommand("copy");
            if (btn) {
                btn.innerHTML = '<i class="bi bi-check2"></i> Copied';
                setTimeout(function () {
                    btn.innerHTML = '<i class="bi bi-clipboard"></i> Copy';
                }, 1500);
            }
        } catch (e) {
            // No-op. Operator can still select manually.
        }
        document.body.removeChild(ta);
    }

    async function submitForm(form) {
        const grantId = form.dataset.grantId;
        if (!grantId) {
            return;
        }
        const questionEl = form.querySelector("[data-helper-question]");
        const toneEl = form.querySelector("[data-helper-tone]");
        const wordsEl = form.querySelector("[data-helper-max-words]");
        const resultEl = form.querySelector("[data-helper-result]");

        const question = (questionEl && questionEl.value || "").trim();
        const tone = (toneEl && toneEl.value) || "warm";
        const maxWords = (wordsEl && wordsEl.value) || "220";

        if (!question) {
            if (resultEl) {
                renderError(resultEl, "Please paste a question first.");
            }
            return;
        }

        if (resultEl) {
            resultEl.innerHTML = '<div class="text-muted py-3 text-center">'
                + '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>'
                + ' Drafting your answer. This typically takes 4 to 8 seconds.'
                + '</div>';
        }
        setLoading(form, true);

        try {
            const body = new FormData();
            body.append("question", question);
            body.append("tone", tone);
            body.append("max_words", maxWords);

            const resp = await fetch("/grants/" + encodeURIComponent(grantId) + "/ask", {
                method: "POST",
                body: body,
            });

            let payload;
            try {
                payload = await resp.json();
            } catch (e) {
                payload = { ok: false, error: "Server returned a non-JSON response (HTTP " + resp.status + ")" };
            }

            if (!resp.ok || !payload.ok) {
                renderError(resultEl, payload.error || "Unknown error");
                return;
            }
            renderResult(resultEl, payload);
        } catch (err) {
            renderError(resultEl, "Network error: " + (err && err.message ? err.message : err));
        } finally {
            setLoading(form, false);
        }
    }

    function bindForm(form) {
        if (form.dataset.helperBound === "1") return;
        form.dataset.helperBound = "1";
        form.addEventListener("submit", function (ev) {
            ev.preventDefault();
            submitForm(form);
        });
    }

    function bindAll() {
        const forms = document.querySelectorAll("[data-helper-form]");
        forms.forEach(bindForm);
    }

    // Expose a hook so the tracker page can set data-grant-id on the modal
    // form when an "Ask Claude" button is clicked, then trigger bind/submit
    // independently.
    window.NisriaApplicationHelper = {
        bindAll: bindAll,
        bindForm: bindForm,
        submitForm: submitForm,
    };

    document.addEventListener("DOMContentLoaded", bindAll);
})();
