(() => {
    "use strict";

    let confirmationId = 0;

    function confirmBpaAction({
        titleText,
        messageText,
        confirmText = "Teruskan",
        cancelText = "Batal"
    }) {
        return new Promise(resolve => {
            const activeElement = document.activeElement;
            const id = `bpa-confirmation-${++confirmationId}`;
            const overlay = document.createElement("div");
            overlay.className = "delete-confirmation-overlay";
            overlay.setAttribute("aria-hidden", "false");

            const dialog = document.createElement("div");
            dialog.className = "delete-confirmation sku-delete-confirmation";
            dialog.setAttribute("role", "alertdialog");
            dialog.setAttribute("aria-modal", "true");
            dialog.setAttribute("aria-labelledby", `${id}-title`);
            dialog.setAttribute("aria-describedby", `${id}-message`);

            const icon = document.createElement("div");
            icon.className = "delete-confirmation-icon";
            icon.textContent = "!";

            const content = document.createElement("div");
            content.className = "delete-confirmation-content";

            const title = document.createElement("h6");
            title.id = `${id}-title`;
            title.textContent = titleText;

            const message = document.createElement("p");
            message.id = `${id}-message`;
            message.textContent = messageText;

            const actions = document.createElement("div");
            actions.className = "delete-confirmation-actions";

            const cancel = document.createElement("button");
            cancel.type = "button";
            cancel.className = "cancel-delete";
            cancel.textContent = cancelText;

            const confirm = document.createElement("button");
            confirm.type = "button";
            confirm.className = "confirm-delete";
            confirm.textContent = confirmText;

            actions.append(cancel, confirm);
            content.append(title, message, actions);
            dialog.append(icon, content);
            document.body.append(overlay, dialog);

            let settled = false;
            const finish = accepted => {
                if (settled) return;
                settled = true;
                document.removeEventListener("keydown", onKeyDown, true);
                overlay.remove();
                dialog.remove();
                if (activeElement instanceof HTMLElement && activeElement.isConnected) {
                    activeElement.focus({ preventScroll: true });
                }
                resolve(accepted);
            };
            const onKeyDown = event => {
                if (event.key !== "Escape") return;
                event.preventDefault();
                finish(false);
            };

            cancel.addEventListener("click", () => finish(false));
            confirm.addEventListener("click", () => finish(true));
            overlay.addEventListener("click", () => finish(false));
            document.addEventListener("keydown", onKeyDown, true);
            requestAnimationFrame(() => {
                overlay.classList.add("show");
                dialog.classList.add("show");
                cancel.focus();
            });
        });
    }

    window.confirmBpaAction = confirmBpaAction;

    document.addEventListener("submit", async event => {
        const form = event.target;
        if (!(form instanceof HTMLFormElement)) return;
        if (form.dataset.bpaConfirmationApproved === "true") {
            delete form.dataset.bpaConfirmationApproved;
            return;
        }

        const submitter = event.submitter;
        const titleText = form.dataset.bpaConfirmTitle || submitter?.dataset.bpaConfirmTitle;
        const messageText = form.dataset.bpaConfirmMessage || submitter?.dataset.bpaConfirmMessage;
        if (!titleText || !messageText) return;

        event.preventDefault();
        event.stopImmediatePropagation();
        if (form.dataset.bpaConfirmationPending === "true") return;
        form.dataset.bpaConfirmationPending = "true";
        try {
            const confirmed = await confirmBpaAction({
                titleText,
                messageText,
                confirmText: form.dataset.bpaConfirmText || submitter?.dataset.bpaConfirmText || "Teruskan"
            });
            if (!confirmed) return;
            if (typeof form.reportValidity === "function" && !form.reportValidity()) return;

            form.dataset.bpaConfirmationApproved = "true";
            try {
                if (submitter instanceof HTMLElement && typeof form.requestSubmit === "function") {
                    form.requestSubmit(submitter);
                } else if (typeof form.requestSubmit === "function") {
                    form.requestSubmit();
                } else {
                    form.submit();
                }
            } finally {
                delete form.dataset.bpaConfirmationApproved;
            }
        } finally {
            delete form.dataset.bpaConfirmationPending;
        }
    }, true);
})();
