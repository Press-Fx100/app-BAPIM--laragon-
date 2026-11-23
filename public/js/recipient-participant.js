(() => {
    const views = {
        recipients: {
            path: "/penerima-bantuan",
            panelId: "recipientParticipantRecipients",
            label: "penerima",
            title: "Penerima Bantuan",
            titleDescription: "Senarai penerima bantuan.",
            heading: "Carian Penerima Bantuan",
            description: "Cari rekod penerima dan tapis mengikut maklumat.",
            addButtonId: "recipientAddButton",
            exportButtonId: "recipientExportButton",
            uploadButtonId: "recipientUploadButton"
        },
        participants: {
            path: "/peserta-program",
            panelId: "recipientParticipantParticipants",
            label: "peserta",
            title: "Peserta Program",
            titleDescription: "Senarai peserta dan program yang disertai.",
            heading: "Carian Peserta Program",
            description: "Cari rekod peserta dan tapis mengikut program.",
            addButtonId: "participantAddButton",
            exportButtonId: "participantExportButton",
            uploadButtonId: "participantUploadButton"
        }
    };
    const titleActionsByView = {};
    const entranceTimers = new WeakMap();

    function animateBpaElement(element, className, delay = 0, duration = 750) {
        const previousAnimation = entranceTimers.get(element);
        if (previousAnimation) {
            window.clearTimeout(previousAnimation.timer);
            element.removeEventListener("animationend", previousAnimation.finish);
        }

        element.classList.remove(className);
        if (delay) {
            element.style.setProperty("--bpa-dashboard-toolbar-enter-delay", `${delay}ms`);
        }
        void element.offsetWidth;
        element.classList.add(className);

        const cleanup = () => {
            element.classList.remove(className);
            element.style.removeProperty("--bpa-dashboard-toolbar-enter-delay");
            window.clearTimeout(animation.timer);
            element.removeEventListener("animationend", animation.finish);
            entranceTimers.delete(element);
        };
        const animation = {
            timer: window.setTimeout(cleanup, delay + duration + 100),
            finish: event => {
                if (event.target === element && event.animationName === "recipient-participant-bpa-fade-in-up") {
                    cleanup();
                }
            }
        };
        entranceTimers.set(element, animation);

        element.addEventListener("animationend", animation.finish);
    }

    function animateViewTransition(key) {
        const panel = document.getElementById(views[key].panelId);
        const root = document.querySelector(".recipient-participant-shell");
        if (!panel || !root) return;

        const title = root.querySelector(".recipient-participant-title-copy");
        const searchText = panel.querySelector(".dataset-page-header > div:first-child");
        const searchInput = panel.querySelector(".search-toolbar-group .search-box input");
        const tableCard = panel.querySelector(".recipient-table-card, .participant-table-card");

        if (title?.getClientRects().length) {
            animateBpaElement(title, "bpa-dashboard-title-enter", 0, 450);
        }
        [searchText, searchInput].forEach(element => {
            if (element?.getClientRects().length) {
                animateBpaElement(element, "bpa-dashboard-content-enter", 70);
            }
        });
        if (tableCard?.getClientRects().length) {
            animateBpaElement(tableCard, "bpa-dashboard-content-enter", 140);
        }
    }

    function isViewSelected(key) {
        return Boolean(document.querySelector(
            `[data-recipient-participant-view="${key}"][aria-pressed="true"]`
        ));
    }

    function preloadViewAfterPageReady(key) {
        const preload = () => window.requestAnimationFrame(() => {
            void loadView(key);
        });
        if (!document.body.classList.contains("app-page-loading")) {
            preload();
            return;
        }

        const observer = new MutationObserver(() => {
            if (document.body.classList.contains("app-page-loading")) return;
            observer.disconnect();
            preload();
        });
        observer.observe(document.body, { attributes: true, attributeFilter: ["class"] });
    }

    function styleTitleAction(button, label, icon, variant, text) {
        button.className = `recipient-participant-title-action recipient-participant-title-action--${variant}`;
        button.title = label;
        button.setAttribute("aria-label", label);
        button.innerHTML = `
            <span class="recipient-participant-title-action-icon" aria-hidden="true">
                <i class="bi ${icon}"></i>
            </span>
            <span>${text}</span>
        `;
    }

    function updateTitle(key) {
        const view = views[key];
        document.getElementById("recipientParticipantPageTitle").textContent = view.title;
        document.getElementById("recipientParticipantPageDescription").textContent = view.titleDescription;
    }

    function showTitleActions(key) {
        const selectedView = document.querySelector(
            `[data-recipient-participant-view="${key}"][aria-pressed="true"]`
        );
        if (!selectedView) return;
        const actions = document.getElementById("recipientParticipantTitleActions");
        actions.replaceChildren(...(titleActionsByView[key] || []));
    }

    async function loadView(key) {
        const view = views[key];
        const panel = document.getElementById(view.panelId);
        if (!panel || panel.dataset.loaded === "true" || panel.dataset.loading === "true") return;

        panel.dataset.loading = "true";
        const status = panel.querySelector("[data-view-status]");
        if (status) {
            status.classList.remove("recipient-participant-load-error");
            status.textContent = `Memuatkan senarai ${view.label}...`;
        }

        try {
            const response = await fetch(view.path, {
                headers: { "X-App-Fragment": "true" }
            });
            if (!response.ok) throw new Error(`Halaman ${view.label} gagal dimuatkan (HTTP ${response.status}).`);

            const documentPage = new DOMParser().parseFromString(await response.text(), "text/html");
            const main = documentPage.querySelector("main.main-content");
            if (!main) throw new Error(`Kandungan halaman ${view.label} tidak ditemui.`);
            const heading = main.querySelector(".dataset-page-header > div:first-child h4");
            const description = main.querySelector(".dataset-page-header > div:first-child p");
            if (!heading || !description) throw new Error(`Tajuk carian halaman ${view.label} tidak ditemui.`);
            heading.textContent = view.heading;
            description.textContent = view.description;

            panel.innerHTML = main.innerHTML;
            const addButton = panel.querySelector(`#${view.addButtonId}`);
            const exportButton = panel.querySelector(`#${view.exportButtonId}`);
            const uploadButton = panel.querySelector(`#${view.uploadButtonId}`);
            if (!addButton || !exportButton || !uploadButton) {
                throw new Error(`Tindakan halaman ${view.label} tidak ditemui.`);
            }
            styleTitleAction(exportButton, "Muat turun Excel", "bi-file-earmark-spreadsheet", "excel", "Excel");
            styleTitleAction(uploadButton, "Muat Naik & Set Data", "bi-cloud-arrow-up", "upload", "Muat Naik");
            styleTitleAction(addButton, "Tambah Rekod", "bi-plus-lg", "add", "Tambah");
            titleActionsByView[key] = [addButton, exportButton, uploadButton];
            showTitleActions(key);
            panel.dataset.loaded = "true";
            delete panel.dataset.loading;
            document.dispatchEvent(new Event("app:page-loaded"));
            const root = document.querySelector(".recipient-participant-shell");
            if (isViewSelected(key) && root?.dataset.transitionTo === key) {
                animateViewTransition(key);
                delete root.dataset.transitionTo;
            }
        } catch (error) {
            delete panel.dataset.loading;
            console.error("Combined recipient/participant page load error:", error);
            const message = panel.querySelector("[data-view-status]");
            if (message) {
                message.textContent = `Gagal memuatkan senarai ${view.label}. Pilih kad ini untuk cuba semula.`;
                message.classList.add("recipient-participant-load-error");
            }
        }
    }

    function initialize() {
        const root = document.querySelector(".recipient-participant-shell");
        const pathname = typeof window.appPathname === "function"
            ? window.appPathname(window.location.pathname)
            : window.location.pathname;
        if (!root || pathname !== "/penerima-peserta" || root.dataset.switcherReady === "true") return;

        root.dataset.switcherReady = "true";
        const buttons = [...root.querySelectorAll("[data-recipient-participant-view]")];
        const selectView = key => {
            if (!views[key]) return;
            const previousKey = buttons.find(button => button.getAttribute("aria-pressed") === "true")
                ?.dataset.recipientParticipantView;
            const switched = previousKey !== key;
            const panel = document.getElementById(views[key].panelId);
            const shouldAnimate = switched;

            buttons.forEach(button => {
                const selected = button.dataset.recipientParticipantView === key;
                button.setAttribute("aria-pressed", String(selected));
                document.getElementById(views[button.dataset.recipientParticipantView].panelId).hidden = !selected;
            });
            updateTitle(key);
            showTitleActions(key);
            const root = document.querySelector(".recipient-participant-shell");
            if (shouldAnimate) root.dataset.transitionTo = key;
            const loading = loadView(key);
            if (shouldAnimate && panel?.dataset.loaded === "true") {
                animateViewTransition(key);
                delete root.dataset.transitionTo;
            }
            return loading;
        };

        buttons.forEach(button => {
            button.addEventListener("click", () => {
                selectView(button.dataset.recipientParticipantView);
            });
        });
        preloadViewAfterPageReady("participants");
        return selectView("recipients");
    }

    function registerInitialization() {
        window.registerAppPageLoadTask?.(initialize());
    }

    document.addEventListener("DOMContentLoaded", registerInitialization);
    document.addEventListener("app:page-loaded", registerInitialization);
})();
