const appPathname = pathname =>
    typeof window.appPathname === "function"
        ? window.appPathname(pathname)
        : pathname;

const pageContent =
    document.getElementById("page-content");
let displayedPagePath = appPathname(window.location.pathname);
const dashboardNode =
    appPathname(window.location.pathname) === "/"
        ? pageContent?.firstElementChild
        : null;
const pageCache = new Map();
let documentLoaded = document.readyState === "complete";
let layoutReady = false;
let initialRevealStarted = false;
let initialPageTasks = [];
let pageLoadTasks = initialPageTasks;
let tableHeaderDrag = null;
let suppressTableHeaderClick = null;
let leaveConfirmationPending = false;
let bpaAddModal = null;
let programFilterTimer = null;
const customSelectPortalMenus = new WeakMap();
const customSelectPortalPositions = new WeakMap();
const programDateRangeStates = new WeakMap();
let activeBpaAppAlert = null;
let bpaAppAlertTimer = null;

function showBpaAppAlert(message, type = "info") {
    if (!message) return;
    const topbar = document.querySelector(".topbar");
    if (!topbar) return;

    let badge = activeBpaAppAlert || document.querySelector(".save-success-badge");
    if (!badge) {
        badge = document.createElement("div");
        badge.className = "save-success-badge";
        document.body.appendChild(badge);
    }

    if (typeof badge.showPopover === "function") {
        badge.setAttribute("popover", "manual");
        if (!badge.matches(":popover-open")) badge.showPopover();
    }

    activeBpaAppAlert = badge;
    badge.textContent = message;
    badge.classList.toggle("is-error", type === "danger");
    badge.classList.toggle("is-bottom", type === "danger");
    badge.setAttribute("role", type === "danger" ? "alert" : "status");
    badge.setAttribute("aria-live", type === "danger" ? "assertive" : "polite");
    if (type === "danger") {
        badge.style.removeProperty("top");
    } else {
        badge.style.bottom = "auto";
        badge.style.top = `${topbar.getBoundingClientRect().bottom}px`;
    }
    window.clearTimeout(bpaAppAlertTimer);
    badge.classList.remove("is-visible");
    requestAnimationFrame(() => badge.classList.add("is-visible"));
    bpaAppAlertTimer = window.setTimeout(() => {
        badge.classList.remove("is-visible");
        window.setTimeout(() => {
            if (badge.matches(":popover-open")) badge.hidePopover();
            if (activeBpaAppAlert === badge) activeBpaAppAlert = null;
        }, 350);
    }, 1800);
}

window.showAppAlert = showBpaAppAlert;

function showBpaPageAlerts(root = document) {
    const alerts = [...root.querySelectorAll("[data-bpa-app-alert]")];
    alerts.forEach(alert => {
        showBpaAppAlert(alert.dataset.bpaAppAlert, alert.dataset.bpaAppAlertType);
        alert.remove();
    });

    if (alerts.length && new URLSearchParams(window.location.search).has("msg")) {
        const url = new URL(window.location.href);
        url.searchParams.delete("msg");
        window.history.replaceState(window.history.state, "", url.href);
    }
}

function showBpaFormAlerts(dialog) {
    const alerts = [...dialog.querySelectorAll(".bpa-create-dialog__body .alert")];
    alerts.forEach(alert => {
        const type = alert.classList.contains("alert-danger") ? "danger" :
            alert.classList.contains("alert-success") ? "success" : "info";
        const message = alert.textContent.trim();
        alert.remove();
        if (type === "success") {
            showBpaSaveConfirmation(message);
        } else {
            showBpaAppAlert(message, type);
        }
    });
}

function showBpaSaveConfirmation(message = "Disimpan") {
    showBpaAppAlert(message, "success");
}

function confirmLeavingWithUnsavedChanges() {
    if (leaveConfirmationPending) return Promise.resolve(false);
    leaveConfirmationPending = true;
    const isSaving = typeof window.isSavingTableChanges === "function" &&
        window.isSavingTableChanges();
    const messageText = isSaving
        ? "Penyimpanan sedang berlangsung. Meninggalkan halaman sekarang mungkin menyebabkan perubahan tidak tersimpan. Teruskan?"
        : "Terdapat perubahan yang belum disimpan. Jika meneruskan, perubahan ini akan hilang. Teruskan?";
    return window.confirmBpaAction({
        titleText: "Perubahan belum disimpan",
        messageText,
        confirmText: "Teruskan"
    }).finally(() => {
        leaveConfirmationPending = false;
    });
}

window.addEventListener("beforeunload", event => {
    const hasUnsavedChanges = typeof window.hasUnsavedTableChanges === "function" &&
        window.hasUnsavedTableChanges();
    const isSaving = typeof window.isSavingTableChanges === "function" &&
        window.isSavingTableChanges();

    if (!hasUnsavedChanges && !isSaving) return;

    event.preventDefault();
    event.returnValue = "";
});

function closeBpaCreateDialog(dialog) {
    if (!(dialog instanceof HTMLDialogElement) || !dialog.open || dialog.classList.contains("is-closing")) {
        return Promise.resolve();
    }

    dialog.classList.add("is-closing");
    return new Promise(resolve => {
        let finished = false;
        const finish = () => {
            if (finished) return;
            finished = true;
            clearTimeout(timeout);
            dialog.removeEventListener("animationend", onAnimationEnd);
            dialog.close();
            dialog.classList.remove("is-closing");
            resolve();
        };
        const onAnimationEnd = event => {
            if (event.target === dialog && event.animationName === "bpa-create-dialog-exit") finish();
        };
        const timeout = setTimeout(finish, 250);
        dialog.addEventListener("animationend", onAnimationEnd);
    });
}

window.closeBpaCreateDialog = closeBpaCreateDialog;

document.addEventListener("click", event => {
    const noteTrigger = event.target instanceof Element
        ? event.target.closest("[data-sku-note-open], [data-budget-note-open]")
        : null;
    if (noteTrigger) {
        const dialogId = noteTrigger.dataset.skuNoteOpen || noteTrigger.dataset.budgetNoteOpen;
        const dialog = document.getElementById(dialogId);
        if (dialog instanceof HTMLDialogElement && !dialog.open) {
            dialog.classList.remove("is-closing");
            if (dialog.dataset.noteCancelHandler !== "true") {
                dialog.addEventListener("cancel", cancelEvent => {
                    cancelEvent.preventDefault();
                    closeBpaCreateDialog(dialog);
                });
                dialog.addEventListener("keydown", keydownEvent => {
                    if (keydownEvent.key !== "Escape") return;
                    keydownEvent.preventDefault();
                    closeBpaCreateDialog(dialog);
                });
                dialog.dataset.noteCancelHandler = "true";
            }
            dialog.showModal();
        }
        return;
    }

    if (event.target instanceof HTMLDialogElement
        && event.target.matches(".bpa-note-dialog")
        && event.target.open) {
        const bounds = event.target.getBoundingClientRect();
        if (event.clientX < bounds.left || event.clientX > bounds.right
            || event.clientY < bounds.top || event.clientY > bounds.bottom) {
            closeBpaCreateDialog(event.target);
        }
        return;
    }

    if (event.target instanceof HTMLDialogElement && event.target.open) {
        const dialog = event.target;
        const bounds = dialog.getBoundingClientRect();
        const clickedOutside = event.clientX < bounds.left || event.clientX > bounds.right
            || event.clientY < bounds.top || event.clientY > bounds.bottom;
        if (!clickedOutside) return;

        event.preventDefault();
        event.stopImmediatePropagation();
        const cancelEvent = new Event("cancel", { cancelable: true });
        if (dialog.dispatchEvent(cancelEvent) && dialog.open) {
            dialog.close();
        }
        return;
    }

    const noteClose = event.target instanceof Element
        ? event.target.closest("[data-sku-note-close], [data-budget-note-close]")
        : null;
    if (noteClose) {
        const dialog = noteClose.closest("dialog");
        closeBpaCreateDialog(dialog);
        return;
    }

    const trigger = event.target instanceof Element
        ? event.target.closest(".search-toolbar-group button[aria-controls]")
        : null;
    if (!trigger) return;

    const targetMenuId = trigger.getAttribute("aria-controls");
    window.setTimeout(() => {
        const targetMenu = document.getElementById(targetMenuId);
        const targetIsOpen = targetMenu?.classList.contains("show") || false;
        document.querySelectorAll(
            ".search-toolbar-group .column-menu.show, " +
            ".search-toolbar-group .filter-menu.show, " +
            ".search-toolbar-group .audit-calendar-menu.show, " +
            ".search-toolbar-group .program-date-range-menu.show"
        ).forEach(menu => {
            if (!targetIsOpen || menu !== targetMenu) {
                menu.classList.remove("show");
            }
        });
        document.querySelectorAll(".search-toolbar-group button[aria-controls]")
            .forEach(button => {
                const menu = document.getElementById(button.getAttribute("aria-controls"));
                button.setAttribute("aria-expanded", String(menu?.classList.contains("show") || false));
            });
    }, 0);
}, true);

document.addEventListener("pointerdown", event => {
    if (event.button !== 0 || !(event.target instanceof Element)) {
        return;
    }

    const header = event.target.closest("th");
    const wrapper = header?.closest(
        ".table-wrapper, .table-container, .table-responsive, .dataset-upload-table-wrapper"
    );

    if (
        !header ||
        !wrapper ||
        (event.pointerType === "touch" && header.closest(".program-unit-table")) ||
        wrapper.scrollWidth <= wrapper.clientWidth ||
        event.target.closest("button, input, select, textarea, a, .column-resize-handle")
    ) {
        return;
    }

    tableHeaderDrag = {
        header,
        wrapper,
        pointerId: event.pointerId,
        startX: event.clientX,
        startScrollLeft: wrapper.scrollLeft,
        moved: false
    };
    header.setPointerCapture(event.pointerId);
});

document.addEventListener("pointermove", event => {
    if (!tableHeaderDrag || event.pointerId !== tableHeaderDrag.pointerId) {
        return;
    }

    const distance = event.clientX - tableHeaderDrag.startX;
    if (!tableHeaderDrag.moved && Math.abs(distance) < 5) {
        return;
    }

    tableHeaderDrag.moved = true;
    tableHeaderDrag.wrapper.classList.add("table-header-dragging");
    tableHeaderDrag.wrapper.scrollLeft =
        tableHeaderDrag.startScrollLeft - distance;
    event.preventDefault();
});

function finishTableHeaderDrag(event) {
    if (!tableHeaderDrag || event.pointerId !== tableHeaderDrag.pointerId) {
        return;
    }

    const drag = tableHeaderDrag;
    tableHeaderDrag = null;
    drag.wrapper.classList.remove("table-header-dragging");

    if (drag.moved) {
        suppressTableHeaderClick = drag.header;
        window.setTimeout(() => {
            suppressTableHeaderClick = null;
        }, 500);
    }
}

document.addEventListener("pointerup", finishTableHeaderDrag);
document.addEventListener("pointercancel", finishTableHeaderDrag);
document.addEventListener("click", event => {
    if (
        !suppressTableHeaderClick ||
        !(event.target instanceof Element) ||
        event.target.closest("th") !== suppressTableHeaderClick
    ) {
        return;
    }

    suppressTableHeaderClick = null;
    event.preventDefault();
    event.stopImmediatePropagation();
}, true);

document.addEventListener("click", event => {
    if (!(event.target instanceof Element)) return;
    const option = event.target.closest(".custom-select-option");
    if (option && !option.disabled) {
        const wrapper = option.closest(".custom-select");
        const select = wrapper?.querySelector("select");
        if (!wrapper || !select) return;

        event.preventDefault();
        event.stopImmediatePropagation();
        select.value = option.dataset.value || "";
        select.dispatchEvent(new Event("change", { bubbles: true }));

        const button = wrapper.querySelector(".custom-select-button");
        if (button && button.dataset.iconOnly !== "true") {
            button.textContent = option.textContent;
            button.setAttribute("aria-label", `${select.getAttribute("aria-label") || "Pilih"}: ${option.textContent.trim()}`);
        }
        wrapper.querySelectorAll(".custom-select-option").forEach(item => {
            item.classList.toggle("active", item === option);
        });
        closeCustomSelect(wrapper);
        return;
    }

    const button = event.target.closest(".custom-select-button");
    if (!button || button.disabled) return;
}, true);

function closeCustomSelect(wrapper) {
    wrapper.classList.remove("show", "drop-up");
    wrapper.querySelector(".custom-select-button")
        ?.setAttribute("aria-expanded", "false");
    const menu = customSelectPortalMenus.get(wrapper);
    const position = customSelectPortalPositions.get(wrapper);
    const select = wrapper.querySelector("select");
    if (position) {
        window.removeEventListener("resize", position);
        window.removeEventListener("scroll", position, true);
        customSelectPortalPositions.delete(wrapper);
    }
    if (!menu || !select) return;
    customSelectPortalMenus.delete(wrapper);
    menu.classList.remove(
        "custom-select-menu-portal",
        "custom-select-menu-dialog-portal",
        "custom-select-menu-card-portal",
        "recipient-add-select-menu"
    );
    menu.style.removeProperty("left");
    menu.style.removeProperty("top");
    menu.style.removeProperty("bottom");
    menu.style.removeProperty("width");
    menu.style.removeProperty("max-height");
    menu.style.removeProperty("right");
    wrapper.closest("dialog")?.classList.remove("bpa-create-dialog--select-open");
    wrapper.closest(".dataset-upload-card")
        ?.classList.remove("dataset-upload-card--select-open");
    wrapper.insertBefore(menu, select);
}

function resetCustomSelects(root = document) {
    root.querySelectorAll(".custom-select.show").forEach(closeCustomSelect);
    root.querySelectorAll("select[data-custom-select-initialized='true']").forEach(select => {
        const wrapper = select.closest(".custom-select");
        if (!wrapper) return;
        const menu = wrapper.querySelector(".custom-select-menu");
        wrapper.classList.remove("show", "drop-up");
        wrapper.querySelector(".custom-select-button")?.setAttribute("aria-expanded", "false");
        menu?.classList.remove("show");
    });
}

function positionCustomSelectPortal(menu, button) {
    const bounds = button.getBoundingClientRect();
    const menuHeight = Math.min(260, menu.children.length * 34 + 12);
    const container = button.closest("dialog, .dataset-upload-card");
    const containerBounds = container?.getBoundingClientRect();
    const viewportBottom = Math.min(window.innerHeight, containerBounds?.bottom ?? window.innerHeight);
    const viewportTop = Math.max(0, containerBounds?.top ?? 0);
    const availableBelow = Math.max(0, viewportBottom - bounds.bottom - 8);
    const availableAbove = Math.max(0, bounds.top - viewportTop - 8);
    const dropUp = availableBelow < menuHeight && availableAbove > availableBelow;
    const available = dropUp ? availableAbove : availableBelow;
    const menuLeft = container
        ? bounds.left - containerBounds.left - container.clientLeft
        : bounds.left;
    const menuTop = container
        ? bounds.bottom + 7 - containerBounds.top - container.clientTop
        : bounds.bottom + 7;
    menu.style.left = `${menuLeft}px`;
    menu.style.right = "auto";
    menu.style.width = `${bounds.width}px`;
    menu.style.maxHeight = `${Math.max(60, Math.min(260, available))}px`;
    menu.style.top = dropUp ? "auto" : `${menuTop}px`;
    const menuBottom = container
        ? container.clientHeight - (bounds.top - containerBounds.top - container.clientTop) + 7
        : window.innerHeight - bounds.top + 7;
    menu.style.bottom = dropUp ? `${menuBottom}px` : "auto";
}

function openCustomSelect(wrapper, button) {
    wrapper.classList.add("show");
    button.setAttribute("aria-expanded", "true");

    const menu = wrapper.querySelector(".custom-select-menu");
    const modalRoot = wrapper.closest(
        "#recipientAddForm, .bpa-create-dialog, .dataset-upload-card"
    );
    if (modalRoot && modalRoot.id !== "datasetEditOverlay") {
        menu.classList.add("custom-select-menu-portal");
        const dialog = button.closest("dialog");
        const uploadCard = button.closest(".dataset-upload-card");
        const portalRoot = dialog || uploadCard || modalRoot;
        if (dialog) {
            menu.classList.add("custom-select-menu-dialog-portal");
            dialog.classList.add("bpa-create-dialog--select-open");
        }
        if (uploadCard) {
            menu.classList.add("custom-select-menu-card-portal");
            uploadCard.classList.add("dataset-upload-card--select-open");
        }
        if (modalRoot.id === "recipientAddForm") {
            menu.classList.add("recipient-add-select-menu");
        }
        portalRoot.appendChild(menu);
        customSelectPortalMenus.set(wrapper, menu);
        positionCustomSelectPortal(menu, button);
        const reposition = () => {
            if (menu.classList.contains("custom-select-menu-portal")) {
                positionCustomSelectPortal(menu, button);
            }
        };
        customSelectPortalPositions.set(wrapper, reposition);
        window.addEventListener("resize", reposition);
        window.addEventListener("scroll", reposition, true);
        return;
    }

    const card = wrapper.closest(".dataset-upload-card.dataset-add-card");
    if (!card) return;
    const buttonBounds = button.getBoundingClientRect();
    const menuHeight = Math.min(260, menu.children.length * 34 + 12);
    const availableBelow = Math.max(0, window.innerHeight - buttonBounds.bottom - 20);
    const availableAbove = Math.max(0, buttonBounds.top - 20);
    const dropUp = availableBelow < menuHeight && availableAbove > availableBelow;
    const available = dropUp ? availableAbove : availableBelow;
    wrapper.classList.toggle("drop-up", dropUp);
    menu.style.setProperty(
        "--custom-select-max-height",
        `${Math.max(60, Math.min(260, available))}px`
    );
}

function initializeCustomSelects() {

    document.querySelectorAll("select").forEach(select => {
        if (
            select.id === "uploadUnitInCharge" ||
            select.id === "datasetEditUnit"
        ) {
            const units = [
                { value: "", label: select.id === "datasetEditUnit" ? "Tiada unit ditetapkan" : "Pilih unit" },
                { value: "UPP", label: "UPP" },
                { value: "UPU", label: "UPU" },
                { value: "ULK", label: "ULK" },
                { value: "UAK", label: "UAK" },
                { value: "UPA", label: "UPA" }
            ];
            units.forEach(unit => {
                if (![...select.options].some(option => option.value === unit.value)) {
                    select.add(new Option(unit.label, unit.value));
                }
            });
        }
        if (
            select.dataset.customSelectInitialized === "true" ||
            select.dataset.customSelectSkip === "true"
        ) {
            return;
        }

        const wrapper = document.createElement("div");
        wrapper.className = "custom-select";
        wrapper.dataset.customSelectInitialized = "true";

        const button = document.createElement("button");
        button.type = "button";
        button.className = "custom-select-button";
        button.setAttribute("aria-haspopup", "listbox");
        button.setAttribute("aria-expanded", "false");
        button.dataset.iconOnly = select.dataset.iconOnly || "false";

        const menu = document.createElement("div");
        menu.className = "custom-select-menu";
        menu.setAttribute("role", "listbox");

        const syncButton = () => {
            const option = select.options[select.selectedIndex];
            const optionLabel = option?.value === "" && select.dataset.emptyLabel
                ? select.dataset.emptyLabel
                : option?.textContent || "";
            const iconClass = option?.dataset.icon || select.dataset.icon;
            if (iconClass) {
                const icon = document.createElement("i");
                icon.className = `bi ${iconClass}`;
                icon.setAttribute("aria-hidden", "true");
                if (select.dataset.iconOnly === "true") {
                    button.replaceChildren(icon);
                    button.title = option?.textContent.trim() || "";
                    button.setAttribute(
                        "aria-label",
                        `${select.getAttribute("aria-label") || "Pilih"}: ${button.title}`
                    );
                } else {
                    const label = document.createElement("span");
                    label.textContent = optionLabel;
                    button.replaceChildren(icon, label);
                }
            } else {
                button.textContent = optionLabel;
            }
            button.disabled = select.disabled;
            button.setAttribute("aria-disabled", String(select.disabled));
            wrapper.classList.toggle("disabled", select.disabled);
            menu.querySelectorAll("[role='option']").forEach(item => {
                item.classList.toggle(
                    "active",
                    item.dataset.value === select.value
                );
                item.disabled = select.disabled;
            });
        };

        const rebuildMenu = () => {
            menu.replaceChildren();

            Array.from(select.options).forEach(option => {
            const item = document.createElement("button");
            item.type = "button";
            item.className = "custom-select-option";
            item.textContent = option.textContent;
            item.dataset.value = option.value;
            item.setAttribute("role", "option");
            item.addEventListener("click", () => {
                if (select.disabled) return;
                select.value = option.value;
                select.dispatchEvent(new Event("change", { bubbles: true }));
                syncButton();
                closeCustomSelect(wrapper);
            });
            menu.appendChild(item);
            });
            syncButton();
        };

        button.addEventListener("click", event => {
            event.preventDefault();
            event.stopPropagation();
            document.querySelectorAll(".custom-select.show").forEach(open => {
                if (open !== wrapper) closeCustomSelect(open);
            });
            if (wrapper.classList.contains("show")) {
                closeCustomSelect(wrapper);
                return;
            }
            openCustomSelect(wrapper, button);
        });

        select.dataset.customSelectInitialized = "true";
        select.hidden = true;
        select.parentNode.insertBefore(wrapper, select);
        wrapper.append(button, menu, select);
        select.addEventListener("change", syncButton);
        rebuildMenu();

        const observer = new MutationObserver(rebuildMenu);
        observer.observe(select, {
            attributes: true,
            attributeFilter: ["disabled"],
            childList: true
        });
    });

}

document.addEventListener("click", () => {
    document.querySelectorAll(".custom-select.show").forEach(wrapper => {
        closeCustomSelect(wrapper);
    });
});

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initializeCustomSelects, { once: true });
} else {
    initializeCustomSelects();
}

const customSelectObserver = new MutationObserver(initializeCustomSelects);
customSelectObserver.observe(document.body, { childList: true, subtree: true });

if (pageContent) {
    pageContent.classList.add("page-transition");
}

function registerPageLoadTask(task) {
    if (task && typeof task.then === "function") {
        pageLoadTasks.push(Promise.resolve(task));
    }
}

window.registerAppPageLoadTask = registerPageLoadTask;

if (window.appInitialPageReady) {
    registerPageLoadTask(window.appInitialPageReady);
}

function beginPageLoading() {
    document.body.classList.add("app-page-loading");
}

function waitForPageLoadTasks(tasks) {
    return Promise.allSettled(tasks).then(results => {
        results.forEach(result => {
            if (result.status === "rejected") {
                console.error("Page initialization failed:", result.reason);
            }
        });
    });
}

function waitForStylesheets() {
    const stylesheets = [...document.querySelectorAll('link[rel="stylesheet"]')]
        .filter(stylesheet => !stylesheet.disabled);

    return Promise.all(stylesheets.map(stylesheet => {
        if (stylesheet.sheet) {
            return Promise.resolve();
        }
        if (documentLoaded) {
            console.error(`Stylesheet unavailable after page load: ${stylesheet.href}`);
            return Promise.resolve();
        }

        return new Promise(resolve => {
            const finish = error => {
                stylesheet.removeEventListener("load", onLoad);
                stylesheet.removeEventListener("error", onError);
                if (error) {
                    console.error(`Stylesheet failed to load: ${stylesheet.href}`, error);
                }
                resolve();
            };
            const onLoad = () => finish();
            const onError = event => finish(event);

            stylesheet.addEventListener("load", onLoad, { once: true });
            stylesheet.addEventListener("error", onError, { once: true });
        });
    }));
}

async function finishPageLoading(initial = false, { animateDashboardCharts = true } = {}) {
    pageContent?.classList.add("is-ready");
    if (initial && pageContent) {
        pageContent.style.transition = "none";
        pageContent.classList.add("is-visible");
        document.body.classList.remove("app-page-loading");
        pageContent.offsetWidth;
        pageContent.style.removeProperty("transition");
        refreshBpaDashboardCharts(pageContent, { animate: animateDashboardCharts });
        document.dispatchEvent(new Event("app:initial-page-ready"));
        document.dispatchEvent(new Event("app:page-visible"));
        return;
    }

    document.body.classList.remove("app-page-loading");
    await nextFrame();
    pageContent?.classList.add("is-visible");
    refreshBpaDashboardCharts(pageContent, { animate: animateDashboardCharts });
    document.dispatchEvent(new Event("app:page-visible"));
}

function refreshBpaDashboardCharts(root = pageContent, { animate = false } = {}) {
    if (
        document.visibilityState === "hidden" ||
        appPathname(window.location.pathname) !== "/bpa/dashboard" ||
        !window.Chart
    ) {
        return;
    }

    window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
            root?.querySelectorAll("#unitChart, #statusChart").forEach(canvas => {
                const chart = window.Chart.getChart(canvas);
                if (!chart) return;

                const { width, height } = canvas.getBoundingClientRect();
                if (width <= 0 || height <= 0) return;

                chart.resize();
                if (animate) {
                    chart.reset();
                    chart.update();
                } else {
                    chart.update("none");
                }
            });
        });
    });
}

document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
        refreshBpaDashboardCharts();
    }
});

async function revealInitialPage() {
    if (
        !pageContent ||
        !documentLoaded ||
        !layoutReady ||
        initialRevealStarted
    ) {
        return;
    }

    initialRevealStarted = true;
    await waitForPageLoadTasks(initialPageTasks);
    await waitForStylesheets();
    await document.fonts.ready;
    await nextFrame();
    initializeBpaDashboardSwitcher();
    const bpaDashboardRoot = appPathname(window.location.pathname) === "/bpa/dashboard"
        ? pageContent.querySelector(".bpa-dashboard-content")
        : null;
    if (bpaDashboardRoot) animateBpaDashboardEntry(bpaDashboardRoot);
    await finishPageLoading(true);
}

function wait(milliseconds) {
    return new Promise(resolve => window.setTimeout(resolve, milliseconds));
}

function nextFrame() {
    if (document.visibilityState === "hidden") {
        return Promise.resolve();
    }

    return new Promise(resolve => window.requestAnimationFrame(() => resolve()));
}

async function replacePageContent(update) {
    if (!pageContent) {
        update();
        return;
    }

    if (pageContent.classList.contains("is-visible")) {
        update();
        return;
    }

    pageContent.classList.remove("is-ready");
    pageContent.classList.remove("is-visible");
    update();
    pageContent.offsetWidth;
    await nextFrame();
}

async function revealPageContent() {
    if (!pageContent) {
        return;
    }

    pageContent.offsetWidth;
    await nextFrame();
    pageContent.classList.add("is-visible");
    await wait(220);
}

function updateActiveNavigation(pathname) {
    pathname = appPathname(pathname);
    document.querySelectorAll("#sidebar .nav-item").forEach(item => {
        const page =
            pathname === "/"
                ? "dashboard"
                : pathname === "/muat-naik" ||
                    pathname.startsWith("/set-data") ||
                    pathname === "/penerima-peserta" ||
                    pathname === "/peserta-program" ||
                    pathname === "/penerima-bantuan"
                    ? "penerima-peserta"
                    : pathname === "/aktiviti-pengguna"
                        ? "user"
                        : "";

        item.classList.toggle(
            "active",
            item.dataset.page === page
        );
    });

    if (pathname.startsWith("/bpa/")) {
        document.querySelectorAll("#sidebar .nav-item[data-page^='bpa-']").forEach(item => {
            const itemPathname = appPathname(new URL(item.href, window.location.href).pathname);
            item.classList.toggle("active", itemPathname === pathname);
        });
    }
}

function removeBpaPageStyles() {
    document.querySelectorAll("style[data-bpa-page-style]").forEach(style => style.remove());
}

function installBpaPageStyles(parsedPage) {
    removeBpaPageStyles();
    parsedPage.querySelectorAll("head style[data-bpa-page-style]").forEach(style => {
        document.head.append(style.cloneNode(true));
    });
}

function installBpaModalPageStyles(parsedPage, backgroundStyles) {
    installBpaPageStyles(parsedPage);
    const installedStyles = new Set(
        [...document.querySelectorAll("style[data-bpa-page-style]")]
            .map(style => style.textContent)
    );
    backgroundStyles.forEach(style => {
        if (installedStyles.has(style.textContent)) return;
        installedStyles.add(style.textContent);
        document.head.append(style.cloneNode(true));
    });
}

async function executeBpaPageScripts(parsedPage, baseUrl) {
    const scripts = parsedPage.querySelectorAll("script[data-bpa-page-script]");
    if (appPathname(new URL(baseUrl, window.location.href).pathname) === "/bpa/dashboard") {
        bpaDashboardScripts = [...scripts]
            .filter(script => !script.src)
            .map(script => script.cloneNode(true));
    }

    for (const script of scripts) {
        if (script.src) {
            const source = new URL(script.getAttribute("src"), baseUrl).href;
            const existing = [...document.querySelectorAll("script[data-bpa-library]")]
                .some(loadedScript => loadedScript.src === source);
            if (existing) continue;

            await new Promise((resolve, reject) => {
                const loadedScript = document.createElement("script");
                loadedScript.src = source;
                loadedScript.async = false;
                loadedScript.dataset.bpaLibrary = "true";
                loadedScript.addEventListener("load", resolve, { once: true });
                loadedScript.addEventListener("error", () => {
                    reject(new Error(`Could not load BPA script: ${source}`));
                }, { once: true });
                document.head.append(loadedScript);
            });
            continue;
        }

    }
    executeBpaInlineScripts(scripts);
}

function executeBpaInlineScripts(scripts) {
    for (const script of scripts) {
        if (script.src || !script.matches("script[data-bpa-page-script]")) continue;
        const declarations = [...script.textContent.matchAll(/\bfunction\s+([A-Za-z_$][\w$]*)\s*\(/g)]
            .map(match => match[1]);
        const exports = declarations.length
            ? `\nreturn {${[...new Set(declarations)]
                .map(name => `${JSON.stringify(name)}: typeof ${name} === "undefined" ? undefined : ${name}`)
                .join(",")}};`
            : "";
        const pageFunctions = new Function(`${script.textContent}${exports}`)();
        if (pageFunctions) {
            Object.entries(pageFunctions).forEach(([name, value]) => {
                if (typeof value === "function") window[name] = value;
            });
        }
    }
}

const bpaDashboardCards = [
    { id: "BPA", label: "BPA", detail: "Bahagian Pembangunan Asnaf", icon: "bi-diagram-3", color: "red" },
    {
        id: "UPP",
        label: "UPP",
        detail: "Unit Pentadbiran dan Permantauan",
        icon: "bi-clipboard2-check",
        color: "teal"
    },
    { id: "UPU", label: "UPU", detail: "Usahawan", icon: "bi-briefcase", color: "blue" },
    { id: "ULK", label: "ULK", detail: "Latihan Kerjaya", icon: "bi-mortarboard", color: "purple" },
    { id: "UAK", label: "UAK", detail: "Agama Islam", icon: "bi-moon-stars", color: "green" },
    { id: "UPA", label: "UPA", detail: "Agrotani", icon: "bi-tree", color: "yellow" }
];
const bpaProgramListCards = [
    { id: "BPA", label: "BPA", detail: "Bahagian Pembangunan Asnaf", icon: "bi-diagram-3", color: "red" },
    { id: "UPP", label: "UPP", detail: "Unit Pentadbiran dan Pemantauan", icon: "bi-clipboard2-check", color: "teal" },
    { id: "UPU", label: "UPU", detail: "Usahawan", icon: "bi-briefcase", color: "blue" },
    { id: "ULK", label: "ULK", detail: "Latihan Kerjaya", icon: "bi-mortarboard", color: "purple" },
    { id: "UAK", label: "UAK", detail: "Agama Islam", icon: "bi-moon-stars", color: "green" },
    { id: "UPA", label: "UPA", detail: "Agrotani", icon: "bi-tree", color: "yellow" }
];
let bpaDashboardCache = new Map();
let bpaDashboardStyles = [];
let bpaDashboardScripts = [];

function getBpaCardsForAccess(cards, permissionPrefix) {
    const permissions = window.appCurrentUser?.permissions || {};
    return cards.filter(card =>
        permissions[`${permissionPrefix}${card.id}`]?.access === true
    );
}

function formatProgramDateKey(dateKey) {
    if (!dateKey) return "";
    const [year, month, day] = dateKey.split("-");
    return `${day}/${month}/${year}`;
}

function parseProgramDateKey(dateKey) {
    if (!dateKey) return null;
    const [year, month, day] = dateKey.split("-").map(Number);
    if (!year || !month || !day) return null;
    return new Date(year, month - 1, day);
}

function updateProgramDateFilterButton(root, start, end) {
    const picker = root.querySelector("[data-program-date-filter]");
    const button = picker?.querySelector(".program-date-button");
    if (!button) return;
    button.title = "Pilih julat tarikh";
    button.setAttribute("aria-label", "Pilih julat tarikh");
    button.classList.toggle(
        "active",
        start !== picker.dataset.defaultStart || end !== picker.dataset.defaultEnd
    );
}

function renderProgramDateRange(picker) {
    const state = programDateRangeStates.get(picker);
    const monthLabel = picker.querySelector("[data-program-calendar-month]");
    const daysContainer = picker.querySelector("[data-program-calendar-days]");
    const preview = picker.querySelector("[data-program-date-preview]");
    const applyButton = picker.querySelector("[data-program-date-apply]");
    if (!state || !monthLabel || !daysContainer || !preview || !applyButton) return;

    const year = state.month.getFullYear();
    const month = state.month.getMonth();
    const monthNames = [
        "Januari", "Februari", "Mac", "April", "Mei", "Jun",
        "Julai", "Ogos", "September", "Oktober", "November", "Disember"
    ];
    monthLabel.textContent = `${monthNames[month]} ${year}`;

    const firstWeekday = (new Date(year, month, 1).getDay() + 6) % 7;
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const hasRange = Boolean(state.draftStart && state.draftEnd);
    const rangeStart = hasRange ? (state.draftStart < state.draftEnd ? state.draftStart : state.draftEnd) : "";
    const rangeEnd = hasRange ? (state.draftStart > state.draftEnd ? state.draftStart : state.draftEnd) : "";
    const today = new Date();
    const todayKey = [
        today.getFullYear(),
        String(today.getMonth() + 1).padStart(2, "0"),
        String(today.getDate()).padStart(2, "0")
    ].join("-");
    const buttons = [];

    for (let index = 0; index < firstWeekday; index += 1) {
        buttons.push('<span class="audit-calendar-empty" aria-hidden="true"></span>');
    }

    for (let day = 1; day <= daysInMonth; day += 1) {
        const dateKey = [
            year,
            String(month + 1).padStart(2, "0"),
            String(day).padStart(2, "0")
        ].join("-");
        const classes = ["program-date-range-day"];
        if (hasRange && dateKey >= rangeStart && dateKey <= rangeEnd) classes.push("in-range");
        if (dateKey === state.draftStart) classes.push("range-start");
        if (dateKey === state.draftEnd) classes.push("range-end");
        if (dateKey === todayKey) classes.push("today");
        buttons.push(
            `<button type="button" class="${classes.join(" ")}" data-program-calendar-date="${dateKey}" aria-pressed="${dateKey === state.draftStart || dateKey === state.draftEnd}">${day}</button>`
        );
    }

    daysContainer.innerHTML = buttons.join("");
    preview.textContent = state.draftStart
        ? state.draftEnd
            ? `${formatProgramDateKey(state.draftStart)} hingga ${formatProgramDateKey(state.draftEnd)}`
            : formatProgramDateKey(state.draftStart)
        : "";
    applyButton.disabled = !hasRange;
}

function initializeProgramDateRangeFilters(root = document) {
    root.querySelectorAll("[data-program-date-filter]").forEach(picker => {
        if (programDateRangeStates.has(picker)) return;
        const form = picker.closest("form");
        const startInput = form?.querySelector("[data-program-date-start]");
        const endInput = form?.querySelector("[data-program-date-end]");
        const button = picker.querySelector(".program-date-button");
        if (!form || !startInput || !endInput || !button) return;

        const start = startInput.value;
        const end = endInput.value;
        const state = {
            month: parseProgramDateKey(start) || new Date(),
            draftStart: start,
            draftEnd: end
        };
        state.month.setDate(1);
        programDateRangeStates.set(picker, state);
        updateProgramDateFilterButton(root, start, end);
    });
}

function closeProgramDateRangePicker(picker) {
    const button = picker.querySelector(".program-date-button");
    const menu = picker.querySelector(".program-date-range-menu");
    menu?.classList.remove("show");
    button?.setAttribute("aria-expanded", "false");
}

function applyProgramDateRange(picker, start, end) {
    const form = picker.closest("form");
    const startInput = form?.querySelector("[data-program-date-start]");
    const endInput = form?.querySelector("[data-program-date-end]");
    const button = picker.querySelector(".program-date-button");
    if (!form || !startInput || !endInput || !button) return;

    startInput.value = start;
    endInput.value = end;
    updateProgramDateFilterButton(picker.closest(".bpa-shell-page") || document, start, end);
    closeProgramDateRangePicker(picker);
    form.requestSubmit();
}

document.addEventListener("click", event => {
    if (!(event.target instanceof Element)) return;
    const picker = event.target.closest("[data-program-date-filter]");
    if (!picker) {
        document.querySelectorAll("[data-program-date-filter] .program-date-range-menu.show")
            .forEach(menu => closeProgramDateRangePicker(menu.closest("[data-program-date-filter]")));
        return;
    }

    event.stopImmediatePropagation();
    const state = programDateRangeStates.get(picker);
    if (!state) return;
    const button = event.target.closest(".program-date-button");
    const menu = picker.querySelector(".program-date-range-menu");
    if (button) {
        event.preventDefault();
        const opening = !menu.classList.contains("show");
        document.querySelectorAll("[data-program-date-filter] .program-date-range-menu.show")
            .forEach(openMenu => closeProgramDateRangePicker(openMenu.closest("[data-program-date-filter]")));
        menu.classList.toggle("show", opening);
        button.setAttribute("aria-expanded", String(opening));
        if (opening) {
            state.draftStart = picker.closest("form").querySelector("[data-program-date-start]").value;
            state.draftEnd = picker.closest("form").querySelector("[data-program-date-end]").value;
            state.month = parseProgramDateKey(state.draftStart) || new Date();
            state.month.setDate(1);
            renderProgramDateRange(picker);
        }
        return;
    }

    const monthButton = event.target.closest("[data-program-month-offset]");
    if (monthButton) {
        state.month.setMonth(state.month.getMonth() + Number(monthButton.dataset.programMonthOffset));
        renderProgramDateRange(picker);
        return;
    }

    const dayButton = event.target.closest("[data-program-calendar-date]");
    if (dayButton) {
        const selectedDate = dayButton.dataset.programCalendarDate;
        if (!state.draftStart || state.draftEnd) {
            state.draftStart = selectedDate;
            state.draftEnd = "";
        } else if (selectedDate < state.draftStart) {
            state.draftEnd = state.draftStart;
            state.draftStart = selectedDate;
        } else {
            state.draftEnd = selectedDate;
        }
        renderProgramDateRange(picker);
        return;
    }

    if (event.target.closest("[data-program-date-apply]")) {
        if (state.draftStart && state.draftEnd) {
            applyProgramDateRange(picker, state.draftStart, state.draftEnd);
        }
        return;
    }

    if (event.target.closest("[data-program-date-clear]")) {
        applyProgramDateRange(picker, picker.dataset.defaultStart, picker.dataset.defaultEnd);
    }
});

document.addEventListener("click", event => {
    if (!(event.target instanceof Element)) return;
    document.querySelectorAll("[data-program-date-filter]").forEach(picker => {
        if (!picker.contains(event.target)) closeProgramDateRangePicker(picker);
    });
});

document.addEventListener("input", event => {
    const search = event.target instanceof Element
        ? event.target.closest("[data-program-filter-form] input[name='q'], [data-unit-program-filter-form] input[name='q']")
        : null;
    if (!search) return;
    window.clearTimeout(programFilterTimer);
    programFilterTimer = window.setTimeout(() => search.form?.requestSubmit(), 300);
});

document.addEventListener("change", event => {
    const control = event.target instanceof Element
        ? event.target.closest("[data-program-filter-form] select, [data-unit-program-filter-form] select")
        : null;
    if (!control || control.form?.dataset.programResetting === "true") return;
    window.clearTimeout(programFilterTimer);
    control.form?.requestSubmit();
});

function getProgramReportValue(row, key) {
    const value = Number.parseFloat(row.dataset[key] || "0");
    return Number.isFinite(value) ? value : 0;
}

function updateProgramReportSummary(table) {
    const rows = [...table.querySelectorAll("tbody tr[data-program-row]")];
    const selectedRows = rows.filter(row => row.classList.contains("is-selected"));
    const summaryRows = selectedRows.length ? selectedRows : rows;
    const totals = summaryRows.reduce((summary, row) => {
        summary.participants += getProgramReportValue(row, "programParticipants");
        summary.allocation += getProgramReportValue(row, "programAllocation");
        summary.spending += getProgramReportValue(row, "programSpending");
        summary.wakalah += getProgramReportValue(row, "programWakalah");
        return summary;
    }, {
        programs: summaryRows.length,
        participants: 0,
        allocation: 0,
        spending: 0,
        wakalah: 0
    });

    const summary = table.closest("[data-program-results]");
    if (!summary) return;

    const countFormatter = new Intl.NumberFormat("en-US", {
        maximumFractionDigits: 0
    });
    const moneyFormatter = new Intl.NumberFormat("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
    const values = {
        programs: countFormatter.format(totals.programs),
        participants: countFormatter.format(totals.participants),
        allocation: `RM ${moneyFormatter.format(totals.allocation)}`,
        spending: `RM ${moneyFormatter.format(totals.spending)}`,
        wakalah: `RM ${moneyFormatter.format(totals.wakalah)}`
    };

    summary.querySelectorAll("[data-program-summary]").forEach(cardValue => {
        const key = cardValue.dataset.programSummary;
        if (Object.hasOwn(values, key)) {
            cardValue.textContent = values[key];
        }
    });
    animateBpaDashboardKpiNumbers(summary, "[data-program-summary]");
}

function toggleProgramReportRow(row) {
    const table = row.closest("table.table-report");
    if (!table) return;

    const isSelected = !row.classList.contains("is-selected");
    row.classList.toggle("is-selected", isSelected);
    row.setAttribute("aria-selected", String(isSelected));
    updateProgramReportSummary(table);
}

document.addEventListener("click", event => {
    if (!(event.target instanceof Element)) return;
    const row = event.target.closest("tr[data-program-row]");
    if (!row || event.target.closest("a, button, input, select, textarea")) return;
    toggleProgramReportRow(row);
});

document.addEventListener("keydown", event => {
    if (!(event.target instanceof Element)) return;
    const row = event.target.closest("tr[data-program-row]");
    if (
        !row ||
        event.target !== row ||
        (event.key !== "Enter" && event.key !== " ")
    ) {
        return;
    }
    event.preventDefault();
    toggleProgramReportRow(row);
});

document.addEventListener("change", event => {
    const control = event.target instanceof Element
        ? event.target.closest("#bpa-dashboard-year, #bpa-unit-dashboard-year")
        : null;
    if (!control) return;

    const requestedYear = Number(control.value);
    if (!Number.isFinite(requestedYear) || requestedYear <= 0) return;

    const availableYears = (() => {
        try {
            return JSON.parse(control.dataset.availableYears || "[]");
        } catch {
            return [];
        }
    })();
    if (availableYears.length && !availableYears.includes(requestedYear)) return;

    window.updateBpaDashboardYear?.(String(requestedYear));
});

function initializeBpaProgramListSwitcher() {
    if (appPathname(window.location.pathname) !== "/bpa/laporan/program_list") return;
    const root = pageContent?.querySelector(".bpa-shell-page");
    if (!root || root.dataset.programListSwitcherReady === "true" || !window.appCurrentUser) return;

    root.dataset.programListSwitcherReady = "true";
    initializeProgramDateRangeFilters(root);
    const unitDescriptions = JSON.parse(root.dataset.unitDescriptions || "{}");
    bpaProgramListCards.forEach(card => {
        if (unitDescriptions[card.id]) {
            card.detail = unitDescriptions[card.id];
        }
    });
    const allowedCards = getBpaCardsForAccess(bpaProgramListCards, "bpaPrograms");
    const initialUnit = root.dataset.programListInitialUnit || allowedCards[0]?.id || "BPA";
    const selector = document.createElement("section");
    selector.className = "bpa-dashboard-selector bpa-program-list-selector";
    selector.setAttribute("aria-label", "Pilih senarai program");
    selector.innerHTML = allowedCards.map(card => `
        <button type="button" class="bpa-dashboard-card bpa-dashboard-card--${card.color}"
            data-bpa-program-list-unit="${card.id}" aria-pressed="${card.id === initialUnit}">
            <span class="bpa-dashboard-card__accent" aria-hidden="true"></span>
            <span class="bpa-dashboard-card__copy">
                <strong>${card.label}</strong>
                <small>${card.detail}</small>
            </span>
            <i class="bi ${card.icon}" aria-hidden="true"></i>
        </button>
    `).join("").trim();
    selector.dataset.activeUnit = initialUnit;
    selector.hidden = allowedCards.length <= 1;
    root.before(selector);

    if (initialUnit !== "BPA") root.dataset.programListUnit = initialUnit;
}

async function loadBpaProgramList(unit, parameters, request = {}) {
    const pathname = unit === "BPA"
        ? "/bpa/laporan/program_list"
        : `/bpa/${unit.toLowerCase()}/program_list`;
    const url = new URL(window.appUrl(pathname), window.location.origin);
    parameters.forEach((value, key) => {
        if (key !== "unit") url.searchParams.append(key, value);
    });

    const headers = { "X-BPA-PROGRAM-LIST-UNIT": unit };
    const response = await fetch(url.href, {
        method: request.method || "GET",
        headers,
        body: request.body
    });
    if (!response.ok) {
        throw new Error(`Senarai program ${unit} tidak dapat dimuatkan (HTTP ${response.status}).`);
    }

    const parsedPage = new DOMParser().parseFromString(await response.text(), "text/html");
    const list = parsedPage.querySelector("main.main-content .bpa-shell-page");
    if (!list) {
        throw new Error(`Kandungan senarai program ${unit} tiada dalam respons.`);
    }

    return {
        markup: list.innerHTML,
        styles: [...parsedPage.querySelectorAll("head style[data-bpa-page-style]")]
            .map(style => style.cloneNode(true)),
        scripts: [...parsedPage.querySelectorAll("script[data-bpa-page-script]")]
            .filter(script => !script.src)
            .map(script => script.cloneNode(true)),
        url: response.url
    };
}

function updateBpaProgramListResults(root, markup) {
    const incoming = document.createElement("div");
    incoming.innerHTML = markup;

    const currentResults = root.querySelector("[data-program-results]");
    if (currentResults) {
        const incomingResults = incoming.querySelector("[data-program-results]");
        if (!incomingResults) {
            throw new Error("Ringkasan dan jadual program tiada dalam respons.");
        }
        const currentSummaryCards = [...currentResults.querySelectorAll(".summary-number")];
        const incomingSummaryCards = [...incomingResults.querySelectorAll(".summary-number")];
        if (currentSummaryCards.length !== incomingSummaryCards.length) {
            throw new Error("Ringkasan program tidak sepadan dengan respons.");
        }
        currentSummaryCards.forEach((value, index) => {
            value.textContent = incomingSummaryCards[index].textContent;
        });
        animateBpaDashboardKpiNumbers(currentResults, ".summary-number");

        const currentReport = currentResults.querySelector(".program-report-card");
        const incomingReport = incomingResults.querySelector(".program-report-card");
        if (!currentReport || !incomingReport) {
            throw new Error("Jadual program tiada dalam respons.");
        }
        currentReport.replaceChildren(...incomingReport.childNodes);
        currentReport.classList.remove("program-report-enter");
        void currentReport.offsetWidth;
        currentReport.classList.add("program-report-enter");
    } else {
        const currentTable = root.querySelector("table");
        const incomingTable = incoming.querySelector("table");
        const currentTableCard = currentTable?.closest(".card, .content-card");
        const incomingTableCard = incomingTable?.closest(".card, .content-card");
        if (!currentTableCard || !incomingTableCard) {
            throw new Error("Jadual program tidak dapat dikemas kini.");
        }
        currentTableCard.replaceWith(incomingTableCard);
    }

    const currentError = root.querySelector(".alert.alert-danger.no-print");
    const incomingError = incoming.querySelector(".alert.alert-danger.no-print");
    if (currentError && incomingError) {
        currentError.replaceWith(incomingError);
    } else if (currentError) {
        currentError.remove();
    } else if (incomingError) {
        const filterCard = root.querySelector(".program-filter-card");
        if (filterCard) filterCard.before(incomingError);
    }

    const incomingExportLinks = [...incoming.querySelectorAll('a[href*="program_export"]')];
    root.querySelectorAll('a[href*="program_export"]').forEach(link => {
        const pathname = new URL(link.href, window.location.origin).pathname;
        const incomingLink = incomingExportLinks.find(candidate =>
            new URL(candidate.href, window.location.origin).pathname === pathname
        );
        if (incomingLink) link.href = incomingLink.href;
    });
}

function replaceBpaProgramListMarkup(root, markup) {
    const incoming = document.createElement("div");
    incoming.innerHTML = markup;

    const currentFilterCard = root.querySelector(".program-filter-card");
    const incomingFilterCard = incoming.querySelector(".program-filter-card");
    const currentHeading = currentFilterCard?.querySelector(".program-filter-heading");
    const incomingHeading = incomingFilterCard?.querySelector(".program-filter-heading");
    const currentHeadingTitle = currentHeading?.querySelector("h5");
    const incomingHeadingTitle = incomingHeading?.querySelector("h5");
    const currentHeadingDescription = currentHeading?.querySelector("p");
    const incomingHeadingDescription = incomingHeading?.querySelector("p");
    const currentForm = currentFilterCard?.querySelector(".program-filter-form");
    const incomingForm = incomingFilterCard?.querySelector(".program-filter-form");
    const currentSearch = currentForm?.querySelector(".program-search-box input");
    const incomingSearch = incomingForm?.querySelector(".program-search-box input");
    const currentGroup = currentForm?.querySelector(".program-filter-group");
    const incomingGroup = incomingForm?.querySelector(".program-filter-group");
    if (
        !currentFilterCard || !incomingFilterCard ||
        !currentHeadingTitle || !incomingHeadingTitle ||
        !currentHeadingDescription || !incomingHeadingDescription ||
        !currentForm || !incomingForm || !currentSearch || !incomingSearch ||
        !currentGroup || !incomingGroup
    ) {
        throw new Error("Kad carian program tiada dalam respons.");
    }

    currentHeadingTitle.textContent = incomingHeadingTitle.textContent;
    currentHeadingDescription.textContent = incomingHeadingDescription.textContent;

    [...currentForm.attributes].forEach(attribute => {
        currentForm.removeAttribute(attribute.name);
    });
    [...incomingForm.attributes].forEach(attribute => {
        currentForm.setAttribute(attribute.name, attribute.value);
    });

    currentForm.querySelectorAll('input[type="hidden"]').forEach(input => input.remove());
    [...incomingForm.querySelectorAll('input[type="hidden"]')].forEach(input => {
        currentForm.insertBefore(input.cloneNode(true), currentForm.firstChild);
    });
    currentSearch.value = incomingSearch.value;
    currentSearch.placeholder = incomingSearch.placeholder;
    currentSearch.setAttribute("aria-label", incomingSearch.getAttribute("aria-label") || "");
    currentGroup.replaceWith(incomingGroup.cloneNode(true));
    incomingFilterCard.replaceWith(currentFilterCard);

    root.replaceChildren(...incoming.childNodes);
}

function animateBpaProgramListElement(element, className, delay = 0) {
    if (!element) return;

    if (typeof element.animate === "function") {
        const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        window.requestAnimationFrame(() => {
            window.requestAnimationFrame(() => {
                if (!element.isConnected) return;

                const animation = element.animate(
                    [
                        { opacity: 0, transform: `translateY(${reducedMotion ? 6 : 16}px)` },
                        { opacity: 1, transform: "translateY(0)" }
                    ],
                    {
                        duration: reducedMotion ? 350 : (className === "bpa-dashboard-content-enter" ? 750 : 600),
                        delay,
                        easing: "cubic-bezier(.2, .75, .25, 1)",
                        fill: "both"
                    }
                );
                animation.onfinish = () => animation.cancel();
            });
        });
        return;
    }

    element.classList.remove(className);
    element.style.setProperty("--bpa-dashboard-toolbar-enter-delay", `${delay}ms`);
    void element.offsetWidth;
    element.classList.add(className);
    const finishAnimation = event => {
        if (event.target !== element) return;
        element.classList.remove(className);
        element.style.removeProperty("--bpa-dashboard-toolbar-enter-delay");
        element.removeEventListener("animationend", finishAnimation);
    };
    element.addEventListener("animationend", finishAnimation);
}

function animateChangedBpaProgramListText(root, previousRoot, selector, className, delay = 0) {
    const currentElements = [...root.querySelectorAll(selector)];
    const previousElements = [...previousRoot.querySelectorAll(selector)];

    currentElements.forEach((element, index) => {
        const previousText = previousElements[index]?.textContent.replace(/\s+/g, " ").trim();
        const currentText = element.textContent.replace(/\s+/g, " ").trim();
        if (previousText !== undefined && currentText !== previousText) {
            animateBpaProgramListElement(element, className, delay);
        }
    });
}

function animateBpaProgramListTransition(root, previousRoot) {
    root.dataset.programListView = "true";
    const container = root.querySelector(":scope > .container, :scope > .container-fluid");
    const previousContainer = previousRoot.querySelector(":scope > .container, :scope > .container-fluid");
    const titleCardSelector =
        ":scope > .program-page-header, :scope > .d-flex.justify-content-between.align-items-center.mb-3";
    const titleCard = container?.querySelector(titleCardSelector);
    const previousTitleCard = previousContainer?.querySelector(titleCardSelector);
    const titleText = titleCard?.firstElementChild;
    const previousTitleText = previousTitleCard?.firstElementChild;
    if (
        titleText &&
        previousTitleText?.textContent.replace(/\s+/g, " ").trim() !==
            titleText.textContent.replace(/\s+/g, " ").trim()
    ) {
        animateBpaProgramListElement(titleText, "bpa-dashboard-title-enter");
    }

    animateChangedBpaProgramListText(
        root,
        previousRoot,
        ".program-page-actions > *, .budget-page-actions > *",
        "bpa-dashboard-toolbar-control-enter"
    );

    animateChangedBpaProgramListText(
        root,
        previousRoot,
        ".program-filter-heading > *, .sku-filter-heading > *",
        "bpa-dashboard-content-enter",
        70
    );

    const searchInputSelector = ".program-filter-card .program-search-box input";
    const currentSearchInputs = [...root.querySelectorAll(searchInputSelector)];
    const previousSearchInputs = [...previousRoot.querySelectorAll(searchInputSelector)];
    currentSearchInputs.forEach((input, index) => {
        if (input.placeholder !== previousSearchInputs[index]?.placeholder) {
            animateBpaProgramListElement(input, "bpa-dashboard-content-enter", 70);
        }
    });

    const filterGroup = root.querySelector(".program-filter-group");
    const previousFilterGroup = previousRoot.querySelector(".program-filter-group");
    const switchingBetweenUnits =
        root.dataset.programListUnit !== undefined &&
        previousRoot.dataset.programListUnit !== undefined;
    if (filterGroup && previousFilterGroup && !switchingBetweenUnits) {
        filterGroup.querySelectorAll(
            ".custom-select-button, .program-date-button"
        ).forEach((button, index) => {
            animateBpaProgramListElement(
                button,
                "bpa-dashboard-toolbar-control-enter",
                40 + index * 55
            );
        });
    }

    const sections = [
        root.querySelector("[data-program-results] > .row.g-3.mb-3.no-print"),
        root.querySelector(".program-report-card") || container?.querySelector(":scope > .card:last-child")
    ].filter(Boolean);

    sections.forEach((section, index) => {
        animateBpaProgramListElement(section, "bpa-dashboard-content-enter", 140 + index * 90);
    });
}

async function selectBpaProgramList(unit, selector, root, parameters = new URLSearchParams(), request = {}) {
    const card = bpaProgramListCards.find(item => item.id === unit);
    if (!card || !selector.isConnected || !root.isConnected) return;

    selector.dataset.activeUnit = unit;
    selector.querySelectorAll("[data-bpa-program-list-unit]").forEach(button => {
        button.setAttribute("aria-pressed", String(button.dataset.bpaProgramListUnit === unit));
        button.disabled = true;
    });

    try {
        const result = await loadBpaProgramList(unit, parameters, request);
        if (request.preserveLayout) {
            updateBpaProgramListResults(root, result.markup);
        } else {
            const previousRoot = document.createElement("div");
            previousRoot.innerHTML = root.innerHTML;
            if (root.dataset.programListUnit !== undefined) {
                previousRoot.dataset.programListUnit = root.dataset.programListUnit;
            }
            removeBpaPageStyles();
            result.styles.forEach(style => document.head.append(style.cloneNode(true)));
            replaceBpaProgramListMarkup(root, result.markup);
            initializeProgramDateRangeFilters(root);
            if (unit === "BPA") {
                delete root.dataset.programListUnit;
            } else {
                root.dataset.programListUnit = unit;
            }
            if (result.scripts.length) executeBpaInlineScripts(result.scripts);
            initializeCustomSelects();
            animateBpaProgramListTransition(root, previousRoot);
        }

        const currentUrl = new URL(window.location.href);
        currentUrl.pathname = window.appUrl("/bpa/laporan/program_list");
        currentUrl.search = "";
        parameters.forEach((value, key) => currentUrl.searchParams.append(key, value));
        if (unit !== "BPA") currentUrl.searchParams.set("unit", unit);
        window.history.replaceState({}, "", currentUrl.href);
    } finally {
        selector.querySelectorAll("[data-bpa-program-list-unit]").forEach(button => {
            button.disabled = false;
        });
    }
}

function initializeBpaDashboardSwitcher() {
    if (appPathname(window.location.pathname) !== "/bpa/dashboard") return;
    const root = pageContent?.querySelector(".bpa-shell-page");
    if (!root || root.dataset.dashboardSwitcherReady === "true" || !window.appCurrentUser) return;

    root.dataset.dashboardSwitcherReady = "true";
    const allowedCards = getBpaCardsForAccess(bpaDashboardCards, "bpaDashboard");
    const initialUnit = root.dataset.dashboardInitialUnit || allowedCards[0]?.id || "BPA";
    root.dataset.dashboardUnit = initialUnit;
    const unitDescriptions = JSON.parse(root.dataset.unitDescriptions || "{}");
    bpaDashboardCards.forEach(card => {
        if (unitDescriptions[card.id]) {
            card.detail = unitDescriptions[card.id];
        }
    });
    bpaDashboardStyles = [...document.querySelectorAll("style[data-bpa-page-style]")]
        .map(style => style.cloneNode(true));
    const inlineDashboardScripts = [...document.querySelectorAll("script[data-bpa-page-script]")]
        .filter(script => !script.src);
    bpaDashboardScripts = inlineDashboardScripts.map(script => script.cloneNode(true));
    const initialUrl = new URL(window.location.href);
    const initialYear = initialUrl.searchParams.get("tahun")
        || String(new Date().getFullYear());
    bpaDashboardCache = new Map([[`${initialUnit === "UPP" ? "BPA" : initialUnit}:${initialYear}`, {
        markup: root.innerHTML,
        styles: bpaDashboardStyles,
        scripts: bpaDashboardScripts
    }]]);

    const toolbar = document.createElement("section");
    toolbar.className = "bpa-dashboard-selector bpa-dashboard-selector--units";
    toolbar.setAttribute("aria-label", "Pilih papan pemuka unit");
    toolbar.innerHTML = allowedCards.map(card => `
        <button type="button" class="bpa-dashboard-card bpa-dashboard-card--${card.color}"
            data-bpa-dashboard-unit="${card.id}" aria-pressed="${card.id === initialUnit}">
            <span class="bpa-dashboard-card__accent" aria-hidden="true"></span>
            <span class="bpa-dashboard-card__copy">
                <strong>${card.label}</strong>
                <small>${card.detail}</small>
            </span>
            <i class="bi ${card.icon}" aria-hidden="true"></i>
        </button>
    `).join("").trim();
    toolbar.querySelectorAll("[data-bpa-dashboard-unit]").forEach(button => {
        const card = allowedCards.find(item => item.id === button.dataset.bpaDashboardUnit);
        if (!card) return;
        button.title = card.detail;
        button.setAttribute("aria-label", `${card.label} - ${card.detail}`);
    });
    toolbar.hidden = allowedCards.length <= 1;
    root.before(toolbar);
    if (initialUnit === "UPP") {
        selectBpaDashboard(initialUnit, toolbar, root).catch(error => {
            console.error("UPP dashboard load error:", error);
            showBpaDashboardError(root, error);
        });
    }
}

function showBpaDashboardError(root, error) {
    root.innerHTML = "";
    const alert = document.createElement("div");
    alert.className = "alert alert-danger";
    alert.setAttribute("role", "alert");
    alert.textContent = error.message || "Papan pemuka unit tidak dapat dimuatkan.";
    root.append(alert);
}

let bpaDashboardYearController = null;
let cancelBpaDashboardChartExit = null;

function updateBpaDashboardUnitChart(root, incoming) {
    const canvas = root.querySelector("#unitChart");
    const chart = canvas && window.Chart?.getChart(canvas);
    const incomingCanvas = incoming.querySelector("#unitChart");
    if (!chart || !incomingCanvas) return;

    const labels = JSON.parse(incomingCanvas.dataset.chartLabels || "null");
    const values = JSON.parse(incomingCanvas.dataset.chartValues || "null");
    const colors = JSON.parse(incomingCanvas.dataset.chartColors || "null");
    if (
        !Array.isArray(labels) ||
        !Array.isArray(values) ||
        !Array.isArray(colors) ||
        labels.length !== values.length ||
        colors.length !== values.length ||
        !values.every(Number.isFinite)
    ) {
        throw new Error("Data carta unit dashboard tidak sah.");
    }

    chart.options.animation = {
        ...chart.options.animation,
        duration: 1100,
        animateRotate: true,
        animateScale: false
    };
    chart.data.labels = labels;
    chart.data.datasets[0].data = values;
    chart.data.datasets[0].backgroundColor = colors;
    chart.update();
}

function animateBpaDashboardStatusChart(root, incoming) {
    const canvas = root.querySelector("#statusChart");
    const chart = canvas && window.Chart?.getChart(canvas);
    const incomingCanvas = incoming.querySelector("#statusChart");
    if (!chart || !incomingCanvas) return;

    const values = JSON.parse(incomingCanvas.dataset.chartValues || "null");
    if (
        !Array.isArray(values) ||
        values.length !== chart.data.datasets[0]?.data?.length ||
        !values.every(Number.isFinite)
    ) {
        throw new Error("Data carta status dashboard tidak sah.");
    }

    chart.options.animation = {
        ...chart.options.animation,
        duration: 1300,
        easing: "easeOutCubic"
    };
    const stepSize = Math.max(...values) >= 2 ? 2 : 1;
    if (chart.options.scales?.y?.ticks) {
        chart.options.scales.y.ticks.stepSize = stepSize;
    }
    chart.data.datasets[0].data = values;
    chart.update();
}

function animateBpaDashboardPieChartOut(root) {
    const charts = [...root.querySelectorAll("#unitChart")]
        .map(canvas => window.Chart?.getChart(canvas))
        .filter(chart => chart && chart.data.datasets.some(dataset =>
            Array.isArray(dataset.data) && dataset.data.some(value => Number(value) !== 0)
        ));
    if (
        !charts.length ||
        window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
        return Promise.resolve();
    }

    const originals = charts.map(chart => ({
        animation: chart.options.animation,
        datasets: chart.data.datasets.map(dataset =>
            Array.isArray(dataset.data) ? [...dataset.data] : dataset.data
        )
    }));
    const maxDuration = Math.max(...originals.map(({ animation }) =>
        Number.isFinite(animation?.duration) ? animation.duration : 1100
    ));

    return new Promise((resolve, reject) => {
        const completed = new Set();
        let finished = false;
        const timeoutId = window.setTimeout(() => finish(false), maxDuration + 250);
        const finish = restore => {
            if (finished) return;
            finished = true;
            window.clearTimeout(timeoutId);
            if (cancelBpaDashboardChartExit === cancel) {
                cancelBpaDashboardChartExit = null;
            }

            charts.forEach((chart, chartIndex) => {
                if (window.Chart.getChart(chart.canvas) !== chart) return;
                chart.options.animation = originals[chartIndex].animation;
                if (!restore) return;

                chart.stop();
                chart.data.datasets.forEach((dataset, datasetIndex) => {
                    dataset.data = originals[chartIndex].datasets[datasetIndex];
                });
                chart.update("none");
            });
            resolve();
        };
        const cancel = () => finish(true);
        cancelBpaDashboardChartExit = cancel;

        try {
            charts.forEach((chart, chartIndex) => {
                const originalAnimation = originals[chartIndex].animation;
                const originalOnComplete = originalAnimation?.onComplete;
                chart.options.animation = {
                    ...originalAnimation,
                    duration: Number.isFinite(originalAnimation?.duration)
                        ? originalAnimation.duration
                        : 1100,
                    onComplete: function (...args) {
                        try {
                            if (typeof originalOnComplete === "function") {
                                originalOnComplete.apply(this, args);
                            }
                        } finally {
                            completed.add(chart);
                            if (completed.size === charts.length) finish(false);
                        }
                    }
                };
                chart.data.datasets.forEach(dataset => {
                    if (Array.isArray(dataset.data)) {
                        dataset.data = dataset.data.map(() => 0);
                    }
                });
                chart.update();
            });
        } catch (error) {
            finish(true);
            reject(error);
        }
    });
}

async function updateBpaDashboardYear(year) {
    const root = pageContent?.querySelector(".bpa-shell-page");
    if (!root) return;

    const unit = root.dataset.dashboardUnit
        || new URL(window.location.href).searchParams.get("unit")
        || "BPA";
    const target = unit === "BPA"
        ? window.appUrl(`/bpa/dashboard?unit=BPA&tahun=${encodeURIComponent(year)}`)
        : window.appUrl(`/bpa/${unit.toLowerCase()}/dashboard?tahun=${encodeURIComponent(year)}`);

    bpaDashboardYearController?.abort();
    cancelBpaDashboardChartExit?.();
    const controller = new AbortController();
    bpaDashboardYearController = controller;
    root.setAttribute("aria-busy", "true");

    try {
        resetCustomSelects(root);
        const response = await fetch(target, {
            signal: controller.signal,
            headers: {
                "X-Requested-With": "XMLHttpRequest",
                "X-BPA-DASHBOARD-UNIT": unit
            }
        });
        if (!response.ok) {
            throw new Error(`Dashboard tahun ${year} gagal dimuatkan (HTTP ${response.status}).`);
        }

        const parsedPage = new DOMParser().parseFromString(await response.text(), "text/html");
        const incoming = parsedPage.querySelector("main.main-content .bpa-shell-page");
        if (!incoming) {
            throw new Error("Kandungan dashboard tahun baharu tidak ditemui.");
        }
        if (controller.signal.aborted) return;

        if (unit === "BPA") {
            const numberSelector =
                ".card-kpi .kpi-number, .kpi-row .kpi-number, .kpi-sub-number, " +
                ".summary-number, .pie-center-number";
            const incomingNumbers = [...incoming.querySelectorAll(numberSelector)];
            root.querySelectorAll(numberSelector).forEach((element, index) => {
                if (incomingNumbers[index]) {
                    element.textContent = incomingNumbers[index].textContent;
                }
            });
            const numberAnimation = animateBpaDashboardKpiNumbers(
                root,
                numberSelector,
                450
            );
            await new Promise(resolve => window.requestAnimationFrame(resolve));
            if (controller.signal.aborted || !root.isConnected) return;
            animateBpaDashboardStatusChart(root, incoming);
            await animateBpaDashboardPieChartOut(root);
            updateBpaDashboardUnitChart(root, incoming);
            await numberAnimation;
        }
        if (controller.signal.aborted || !root.isConnected) return;

        const preservedChartCanvases = unit === "BPA"
            ? new Map(["unitChart", "statusChart"]
                .map(id => [id, root.querySelector(`#${id}`)])
                .filter(([, canvas]) => canvas))
            : new Map();
        root.querySelectorAll("canvas").forEach(canvas => {
            if (unit === "BPA" && ["unitChart", "statusChart"].includes(canvas.id)) return;
            const chart = window.Chart?.getChart(canvas);
            if (chart) chart.destroy();
        });
        const scrollTop = pageContent?.scrollTop || 0;
        const replacement = document.createDocumentFragment();
        Array.from(incoming.childNodes).forEach(node => {
            replacement.append(node.cloneNode(true));
        });
        preservedChartCanvases.forEach((canvas, id) => {
            replacement.querySelector(`#${id}`)?.replaceWith(canvas);
        });
        root.replaceChildren(replacement);
        root.dataset.dashboardUnit = unit;
        root.dataset.dashboardInitialUnit = unit;

        parsedPage.querySelectorAll("script:not([src])").forEach(script => {
            new Function(script.textContent)();
        });

        const url = new URL(window.location.href);
        url.searchParams.set("tahun", String(year));
        if (unit !== "BPA") {
            url.searchParams.set("unit", unit);
        } else {
            url.searchParams.delete("unit");
        }
        window.history.replaceState(window.history.state, "", url.href);

        if (pageContent) pageContent.scrollTop = scrollTop;
        [...(bpaDashboardCache?.keys() || [])].forEach(key => {
            if (String(key).startsWith(`${unit}:`)) {
                bpaDashboardCache.delete(key);
            }
        });
        initializeCustomSelects();
        if (unit !== "BPA") animateBpaDashboardKpiNumbers(root);
    } catch (error) {
        if (error.name !== "AbortError") {
            console.error("Dashboard year update error:", error);
            showBpaDashboardError(root, error);
        }
    } finally {
        if (bpaDashboardYearController === controller) {
            bpaDashboardYearController = null;
            root.removeAttribute("aria-busy");
        }
    }
}

window.updateBpaDashboardYear = updateBpaDashboardYear;

async function loadBpaDashboard(unit, year) {
    const cacheKey = `${unit}:${year}`;
    const cached = bpaDashboardCache.get(cacheKey);
    if (cached) return cached;

    const url = unit === "UPP"
        ? window.appUrl("/upp-dashboard")
        : unit === "BPA"
        ? window.appUrl(`/bpa/dashboard?unit=BPA&tahun=${encodeURIComponent(year)}`)
        : window.appUrl(`/bpa/${unit.toLowerCase()}/dashboard?tahun=${encodeURIComponent(year)}`);
    const response = await fetch(url, {
        headers: { "X-BPA-DASHBOARD-UNIT": unit }
    });
    if (!response.ok) {
        throw new Error(`Papan pemuka ${unit} tidak dapat dimuatkan (HTTP ${response.status}).`);
    }

    const parsedPage = new DOMParser().parseFromString(await response.text(), "text/html");
    const dashboard = unit === "UPP"
        ? parsedPage.querySelector("main.main-content .dashboard-page")
        : parsedPage.querySelector("main.main-content .bpa-shell-page");
    if (!dashboard) {
        throw new Error(`Kandungan papan pemuka ${unit} tiada dalam respons.`);
    }

    const result = {
        markup: dashboard.innerHTML,
        styles: [...parsedPage.querySelectorAll("head style[data-bpa-page-style]")]
            .map(style => style.cloneNode(true)),
        scripts: [...parsedPage.querySelectorAll("script[data-bpa-page-script]")]
            .filter(script => !script.src)
            .map(script => script.cloneNode(true))
    };
    bpaDashboardCache.set(cacheKey, result);
    return result;
}

function animateBpaDashboardKpiNumbers(
    root,
    selector = ".card-kpi .kpi-number, .kpi-row .kpi-number, .kpi-sub-number, " +
        ".summary-number, .pie-center-number",
    durationOverride
) {
    const duration = Number.isFinite(durationOverride)
        ? durationOverride
        : window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 450 : 800;
    const animations = [];
    root.querySelectorAll(selector).forEach(element => {
        const target = element.textContent;
        const digitCount = (target.match(/\d/g) || []).length;
        if (!digitCount) return;

        const ariaLabel = element.getAttribute("aria-label");
        element.setAttribute("aria-label", target);
        animations.push(new Promise(resolve => {
            const startedAt = performance.now();
            const updateDigits = now => {
                const progress = Math.min((now - startedAt) / duration, 1);
                let digitIndex = 0;
                element.textContent = target.replace(/\d/g, digit => {
                    const lockAt = .55 + ((digitIndex + 1) / digitCount) * .4;
                    digitIndex += 1;
                    if (progress >= lockAt) return digit;

                    const randomDigit = Math.floor(Math.random() * 9);
                    return String(randomDigit >= Number(digit) ? randomDigit + 1 : randomDigit);
                });

                if (progress < 1) {
                    window.requestAnimationFrame(updateDigits);
                } else {
                    if (ariaLabel === null) {
                        element.removeAttribute("aria-label");
                    } else {
                        element.setAttribute("aria-label", ariaLabel);
                    }
                    resolve();
                }
            };

            window.requestAnimationFrame(updateDigits);
        }));
    });
    return Promise.all(animations);
}

function animateBpaDashboardSections(root, { skipKpiSections = false } = {}) {
    const container = root.querySelector(":scope > .container, :scope > .container-fluid");
    const titleCard = container?.querySelector(":scope > .d-flex.justify-content-between.align-items-center.mb-3");
    if (!container) return;

    const sections = [...container.children].filter(section =>
        section !== titleCard && !(skipKpiSections && section.querySelector(".card-kpi"))
    );
    sections.forEach(section => {
        section.classList.remove("bpa-dashboard-content-enter");
    });
    if (sections.length) void container.offsetWidth;
    sections.forEach(section => {
        section.classList.add("bpa-dashboard-content-enter");
        const finishTransition = event => {
            if (event.target === section && event.animationName === "bpa-dashboard-fade-in-up") {
                section.classList.remove("bpa-dashboard-content-enter");
                section.removeEventListener("animationend", finishTransition);
            }
        };
        section.addEventListener("animationend", finishTransition);
    });
}

function animateUppDashboardSections(root) {
    const sections = [...root.children].filter(
        section => section.id !== "chartsSection" && section.id !== "statsSection"
    );
    const statCards = [...root.querySelectorAll(
        "#statsSection .stat-card:not(.dashboard-legend-card)"
    )].filter(card => card.getClientRects().length > 0);
    const legendCard = root.querySelector("#statsSection .dashboard-legend-card");
    const chartCards = [...root.querySelectorAll("#chartsSection .chart-card")]
        .filter(card => card.getClientRects().length > 0);
    const firstSections = sections.slice(0, 1);
    const targets = [
        ...firstSections,
        ...statCards,
        ...(legendCard && legendCard.getClientRects().length > 0 ? [legendCard] : []),
        ...chartCards,
        ...sections.slice(firstSections.length)
    ];

    targets.forEach((element, index) => {
        element.classList.remove("bpa-upp-dashboard-enter");
        const delay = index * 55;
        element.style.setProperty("--bpa-upp-enter-delay", `${delay}ms`);
        void element.offsetWidth;
        element.classList.add("bpa-upp-dashboard-enter");
        const finishAnimation = () => {
            element.classList.remove("bpa-upp-dashboard-enter");
            element.style.removeProperty("--bpa-upp-enter-delay");
        };
        element.addEventListener("animationend", event => {
            if (event.target !== element || event.animationName !== "bpa-upp-fade-in-up") return;
            finishAnimation();
        }, { once: true });
        window.setTimeout(finishAnimation, delay + 700);
    });
}

function animateUppPieChart(root) {
    const canvas = root.querySelector("#pieChart");
    const chart = canvas && window.Chart?.getChart(canvas);
    if (!chart || !canvas.isConnected) {
        return;
    }

    chart.reset();
    chart.update();
}

function animateBpaDashboardTitle(root) {
    const container = root.querySelector(":scope > .container, :scope > .container-fluid");
    const titleCard = container?.querySelector(":scope > .d-flex.justify-content-between.align-items-center.mb-3");
    const titleText = titleCard?.firstElementChild;
    if (!titleText) return;

    titleText.classList.remove("bpa-dashboard-title-enter");
    void titleText.offsetWidth;
    titleText.classList.add("bpa-dashboard-title-enter");
    titleText.addEventListener("animationend", () => {
        titleText.classList.remove("bpa-dashboard-title-enter");
    }, { once: true });
}

function animateBpaDashboardToolbarControls(root) {
    const controls = root.querySelectorAll(
        ".bpa-admin-year-form, .bpa-unit-dashboard-year-form, .bpa-admin-actions, .bpa-unit-dashboard-actions"
    );
    if (!controls.length) return;

    controls.forEach((control, index) => {
        control.classList.remove("bpa-dashboard-toolbar-control-enter");
        control.style.setProperty("--bpa-dashboard-toolbar-enter-delay", `${index * 70}ms`);
    });
    void controls[0].offsetWidth;
    controls.forEach(control => {
        control.classList.add("bpa-dashboard-toolbar-control-enter");
        control.addEventListener("animationend", () => {
            control.classList.remove("bpa-dashboard-toolbar-control-enter");
            control.style.removeProperty("--bpa-dashboard-toolbar-enter-delay");
        }, { once: true });
    });
}

function animateBpaDashboardEntry(
    root,
    { includeDashboard = true, includeSelector = true } = {}
) {
    if (!root?.classList.contains("bpa-dashboard-content")) return;

    const toolbar = root.parentElement?.querySelector(":scope > .bpa-dashboard-selector");
    const visibleElements = elements =>
        [...elements].filter(element => element.getClientRects().length > 0);
    const targets = [];

    if (includeSelector && toolbar?.matches(".bpa-dashboard-selector")) {
        targets.push(...visibleElements(toolbar.querySelectorAll(".bpa-dashboard-card")));
    }

    if (includeDashboard) {
        const container = root.querySelector(":scope > .container, :scope > .container-fluid");
        const dashboardToolbar = container?.querySelector(
            ":scope > .bpa-admin-toolbar, " +
            ":scope > .bpa-unit-dashboard-toolbar, " +
            ":scope > .d-flex.justify-content-between.align-items-center.mb-3"
        );
        if (dashboardToolbar) targets.push(dashboardToolbar);
        targets.push(...visibleElements(root.querySelectorAll(
            ".kpi-row .kpi-card, .row.g-3.mb-3 .card-kpi"
        )));
        targets.push(...visibleElements(root.querySelectorAll(
            ".bpa-admin-chart-grid .bpa-admin-chart-card, " +
            ".row.g-4.mb-4 > [class*=\"col-\"] > .card"
        )));

        const skuDashboard = container?.querySelector(":scope > .sku-dashboard");
        if (skuDashboard?.getClientRects().length > 0) targets.push(skuDashboard);
    }

    if (!targets.length) targets.push(root);

    if (includeDashboard) animateBpaDashboardKpiNumbers(root);

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    targets.forEach((element, index) => {
        const animation = element.animate(
            [
                { opacity: 0, transform: "translateY(12px)" },
                { opacity: 1, transform: "translateY(0)" }
            ],
            {
                duration: reducedMotion ? 250 : 750,
                delay: index * 55,
                easing: "cubic-bezier(.2, .75, .25, 1)",
                fill: "both"
            }
        );
        animation.addEventListener("finish", () => animation.cancel(), { once: true });
    });
}

function animatePageEntry(root) {
    if (!root) return;

    const legacyEntryClasses = [
        "bpa-dashboard-title-enter",
        "bpa-dashboard-content-enter",
        "bpa-dashboard-sku-enter",
        "bpa-dashboard-toolbar-control-enter",
        "bpa-upp-dashboard-enter",
        "bpa-upp-chart-area-enter",
        "bpa-upp-mode-title-enter",
        "bpa-upp-mode-control-enter",
        "budget-table-enter",
        "program-report-enter",
        "sku-table-enter"
    ];
    const legacyEntrySelector = legacyEntryClasses.map(className => `.${className}`).join(", ");
    const legacyEntryElements = [
        ...(root.matches(legacyEntrySelector) ? [root] : []),
        ...root.querySelectorAll(legacyEntrySelector)
    ];
    legacyEntryElements.forEach(element => element.classList.remove(...legacyEntryClasses));
    document.body.classList.remove("app-sidebar-page-navigation");

    const visible = element => element.getClientRects().length > 0;
    const surfaceSelector = [
        ".content-card",
        ".card",
        ".dataset-card",
        ".stat-card",
        ".kpi-card",
        ".chart-card",
        ".table-card",
        ".table-wrapper"
    ].join(", ");
    const targetSelector = [
        ".bpa-dashboard-selector > .bpa-dashboard-card",
        "[data-recipient-participant-view]",
        ".recipient-participant-title",
        ".budget-page-header",
        ".bpa-admin-toolbar",
        ".bpa-unit-dashboard-toolbar",
        ".bpa-upp-dashboard-title",
        ".dataset-toolbar",
        ".d-flex.justify-content-between.align-items-center.mb-3",
        ".budget-filter-heading",
        ".sku-filter-heading",
        ".program-filter-heading",
        "h1, h2, h3, h4",
        surfaceSelector
    ].join(", ");
    const candidates = [...root.querySelectorAll(targetSelector)].filter(visible);
    const candidateSet = new Set(candidates);
    const targets = candidates.filter(element => {
        let ancestor = element.parentElement;
        while (ancestor && ancestor !== root) {
            if (candidateSet.has(ancestor)) return false;
            ancestor = ancestor.parentElement;
        }
        return true;
    });

    if (!targets.length) {
        targets.push(...[...root.children].filter(visible));
    }

    targets.sort((first, second) => {
        if (first === second) return 0;
        return first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
    });

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    targets.forEach((element, index) => {
        const animation = element.animate(
            [
                { opacity: 0, transform: "translateY(12px)" },
                { opacity: 1, transform: "translateY(0)" }
            ],
            {
                duration: reducedMotion ? 250 : 750,
                delay: index * 55,
                easing: "cubic-bezier(.2, .75, .25, 1)",
                fill: "both"
            }
        );
        animation.addEventListener("finish", () => animation.cancel(), { once: true });
    });
}

async function selectBpaDashboard(unit, toolbar, root, { resetYear = false } = {}) {
    const card = bpaDashboardCards.find(item => item.id === unit);
    if (!card || !toolbar.isConnected || !root.isConnected) return;
    const previousUnit = root.dataset.dashboardUnit || "BPA";
    const requestedYear = resetYear
        ? String(new Date().getFullYear())
        : new URL(window.location.href).searchParams.get("tahun")
            || String(new Date().getFullYear());
    const isNonBpaUnitTransition =
        previousUnit !== unit &&
        previousUnit !== "BPA" &&
        previousUnit !== "UPP" &&
        unit !== "BPA" &&
        unit !== "UPP";
    const isNonUppUnitTransition =
        previousUnit !== unit && previousUnit !== "UPP" && unit !== "UPP";
    const isBpaUnitEntryTransition = previousUnit !== "BPA" && unit === "BPA";
    toolbar.classList.toggle("bpa-dashboard-selector--instant-unit-switch", isNonBpaUnitTransition);

    toolbar.querySelectorAll("[data-bpa-dashboard-unit]").forEach(button => {
        button.setAttribute("aria-pressed", String(button.dataset.bpaDashboardUnit === unit));
        button.disabled = true;
    });

    try {
        const result = await loadBpaDashboard(unit, requestedYear);

        Object.values(window.Chart?.instances || {}).forEach(chart => {
            const canvas = chart.canvas;
            if (
                root.contains(canvas) ||
                canvas.id === "unitChart" ||
                canvas.id === "statusChart"
            ) {
                chart.destroy();
            }
        });

        removeBpaPageStyles();
        result.styles.forEach(style => document.head.append(style.cloneNode(true)));
        root.innerHTML = result.markup;
        resetCustomSelects(root);
        root.dataset.dashboardUnit = unit;
        root.classList.toggle("dashboard-page", unit === "UPP");
        root.classList.remove("bpa-upp-dashboard-no-preload");
        root.classList.toggle("bpa-upp-dashboard-preloading", unit === "UPP");
        root.classList.toggle("bpa-dashboard-content", unit !== "UPP");
        const dashboardTitle = `Dashboard ${unit}`;
        const pageTitle = document.getElementById("pageTitle");
        if (pageTitle) {
            if (previousUnit !== unit) {
                window.typeHeaderTitle(pageTitle, dashboardTitle.toUpperCase());
            }
        }
        document.title = dashboardTitle;
        initializeCustomSelects();
        if (isBpaUnitEntryTransition) {
            animateBpaDashboardEntry(root, { includeSelector: false });
        } else {
            animateBpaDashboardKpiNumbers(root);
            if (unit !== "UPP" && previousUnit !== unit) {
                animateBpaDashboardTitle(root);
            }
            if (previousUnit !== unit && !isNonBpaUnitTransition) {
                animateBpaDashboardToolbarControls(root);
            }
            if (previousUnit !== unit && unit !== "UPP") {
                animateBpaDashboardSections(root, {
                    skipKpiSections: isNonBpaUnitTransition
                });
            }
        }
        if (unit === "UPP") {
            if (typeof window.initializeDashboard !== "function") {
                throw new Error("Dashboard BAPIM tidak dapat dimulakan.");
            }
            const existingModeTitle = document.getElementById("dashboardDataTitle");
            const picControl = root.querySelector(".pic-control");
            const title = document.createElement("header");
            title.className = "bpa-upp-dashboard-title";
            const titleCopy = document.createElement("div");
            titleCopy.className = "bpa-upp-dashboard-title-copy";
            const heading = document.createElement("h4");
            heading.append("Dashboard UPP (");
            const modeTitle = document.createElement("span");
            modeTitle.id = "dashboardDataTitle";
            modeTitle.textContent = existingModeTitle?.textContent.trim() || "Penerima Bantuan";
            heading.append(modeTitle, ")");
            const subtitle = document.createElement("p");
            subtitle.textContent = "Ringkasan penerima bantuan dan peserta program.";
            titleCopy.append(heading, subtitle);
            title.append(titleCopy);
            if (existingModeTitle) existingModeTitle.remove();

            const unitAction = document.createElement("div");
            unitAction.className = "bpa-admin-action bpa-upp-unit-action";
            unitAction.setAttribute("aria-label", "Tapis carta mengikut unit");
            const unitIcon = document.createElement("span");
            unitIcon.className = "bpa-admin-action-icon";
            unitIcon.setAttribute("aria-hidden", "true");
            unitIcon.innerHTML = '<i class="bi bi-diagram-3" aria-hidden="true"></i>';
            const unitSelect = document.createElement("select");
            unitSelect.id = "participantUnitSelect";
            unitSelect.className = "form-select";
            unitSelect.dataset.emptyLabel = "Unit";
            unitSelect.setAttribute("aria-label", "Tapis carta mengikut unit");
            [["", "Semua"], ["__NO_UNIT__", "Tiada"]].forEach(([value, label]) => {
                const option = document.createElement("option");
                option.value = value;
                option.textContent = label;
                unitSelect.appendChild(option);
            });
            unitAction.append(unitIcon, unitSelect);

            const yearAction = document.createElement("div");
            yearAction.className = "bpa-admin-action bpa-upp-year-action";
            yearAction.setAttribute("aria-label", "Tapis carta mengikut tahun");
            const yearIcon = document.createElement("span");
            yearIcon.className = "bpa-admin-action-icon";
            yearIcon.setAttribute("aria-hidden", "true");
            yearIcon.innerHTML = '<i class="bi bi-calendar3" aria-hidden="true"></i>';
            const yearSelect = document.createElement("select");
            yearSelect.id = "participantYearSelect";
            yearSelect.className = "form-select";
            yearSelect.dataset.emptyLabel = "Tahun";
            yearSelect.setAttribute("aria-label", "Tapis carta mengikut tahun");
            const allYearsOption = document.createElement("option");
            allYearsOption.value = "";
            allYearsOption.textContent = "Semua";
            yearSelect.appendChild(allYearsOption);
            const currentYearOption = document.createElement("option");
            currentYearOption.value = String(new Date().getFullYear());
            currentYearOption.textContent = currentYearOption.value;
            yearSelect.appendChild(currentYearOption);
            yearSelect.value = currentYearOption.value;
            yearAction.append(yearIcon, yearSelect);

            const isParticipantsMode = Boolean(root.querySelector(
                '.stat-card.is-selected[data-dashboard-mode="participants"]'
            ));
            unitAction.style.display = isParticipantsMode ? "" : "none";
            yearAction.style.display = isParticipantsMode ? "" : "none";

            const actions = document.createElement("div");
            actions.className = "bpa-upp-dashboard-actions";
            actions.append(unitAction, yearAction);

            if (picControl) {
                const action = document.createElement("div");
                action.className = "bpa-admin-action bpa-upp-pic-action";
                action.setAttribute("aria-label", "Tapis mengikut PIC");
                const picSelect = picControl.querySelector("select");
                if (picSelect) {
                    picSelect.dataset.emptyLabel = "PIC";
                    const picButton = picControl.querySelector(".custom-select-button");
                    if (picButton && picSelect.value === "") {
                        picButton.textContent = "PIC";
                    }
                }
                const icon = document.createElement("span");
                icon.className = "bpa-admin-action-icon";
                icon.setAttribute("aria-hidden", "true");
                icon.innerHTML = '<i class="bi bi-person-badge" aria-hidden="true"></i>';
                const label = document.createElement("span");
                label.className = "bpa-upp-pic-label";
                label.textContent = "PIC";
                action.append(icon, label, picControl);
                action.style.display = isParticipantsMode ? "none" : "";
                actions.append(action);
            }
            title.append(actions);

            root.querySelector(".dashboard-filter-card")?.remove();
            root.prepend(title);
            const dashboardInitialization = window.initializeDashboard(true, true);
            pageContent?.classList.add("is-ready", "is-visible");
            document.body.classList.remove("app-page-loading");
            animateUppDashboardSections(root);
            await dashboardInitialization;
            root.classList.remove("bpa-upp-dashboard-preloading");
            await new Promise(resolve => {
                window.requestAnimationFrame(() => {
                    window.requestAnimationFrame(resolve);
                });
            });
            animateUppPieChart(root);
        } else if (previousUnit === "UPP" && typeof window.initializeDashboard === "function") {
            await window.initializeDashboard();
        }
        if (result.scripts.length) executeBpaInlineScripts(result.scripts);
        refreshBpaDashboardCharts(root, { animate: true });
        const skuProgressHeading = [...root.querySelectorAll("h1, h2, h3, h4, h5, h6")]
            .find(heading => heading.textContent.includes("Progress SKU"));
        if (!isNonUppUnitTransition && previousUnit !== "BPA" && unit !== "BPA") {
            skuProgressHeading?.closest(".card")?.classList.add("bpa-dashboard-sku-enter");
        }

        const url = new URL(window.location.href);
        if (unit === "BPA") {
            url.searchParams.delete("unit");
        } else {
            url.searchParams.set("unit", unit);
        }
        if (resetYear) {
            const yearControl = root.querySelector(
                "#bpa-dashboard-year, #bpa-unit-dashboard-year, #participantYearSelect"
            );
            url.searchParams.set("tahun", yearControl?.value || requestedYear);
        }
        window.history.replaceState({}, "", url.href);
    } finally {
        toolbar.querySelectorAll("[data-bpa-dashboard-unit]").forEach(button => {
            button.disabled = false;
        });
        toolbar.classList.remove("bpa-dashboard-selector--instant-unit-switch");
    }
}

function addBpaFormAction(parsedPage, actionUrl) {
    parsedPage.querySelectorAll("form").forEach(form => {
        form.action = actionUrl;
    });
}

function resolveBpaPageLinks(container, baseUrl) {
    container.querySelectorAll("a[href]").forEach(link => {
        link.href = new URL(link.getAttribute("href"), baseUrl).href;
    });
}

function isBpaProgramModalPath(pathname) {
    return /^\/bpa\/(?:upp|uak|upu|upa|ulk)\/program_(?:view|edit)$/.test(pathname);
}

function isBpaUnitProgramAddPath(pathname) {
    return /^\/bpa\/(?:upp|uak|upu|upa|ulk)\/program_add(?:\.php)?$/.test(pathname);
}

function getBpaUnitProgramModalMode(pathname) {
    return pathname.match(/^\/bpa\/(?:upp|uak|upu|upa|ulk)\/program_(add|edit|view)(?:\.php)?$/)?.[1] || "";
}

function isBpaProgramListPath(pathname) {
    return /^\/bpa\/(?:upp|uak|upu|upa|ulk)\/program_list$/.test(pathname);
}

function closeBpaAddModal() {
    const modal = bpaAddModal;
    if (!modal) return Promise.resolve();

    bpaAddModal = null;
    const { dialog, previousStyles, trigger } = modal;
    const finishClosing = () => {
        if (dialog.open) dialog.close();
        dialog.remove();
        removeBpaPageStyles();
        previousStyles.forEach(style => document.head.append(style));
        updateActiveNavigation(appPathname(window.location.pathname));
        trigger?.focus({ preventScroll: true });
    };

    if (!dialog.open) {
        finishClosing();
        return Promise.resolve();
    }

    dialog.classList.add("is-closing");
    return new Promise(resolve => {
        let finished = false;
        const complete = () => {
            if (finished) return;
            finished = true;
            clearTimeout(timeout);
            dialog.removeEventListener("animationend", onAnimationEnd);
            finishClosing();
            resolve();
        };
        const onAnimationEnd = event => {
            if (event.target === dialog && event.animationName === "bpa-create-dialog-exit") {
                complete();
            }
        };
        const timeout = setTimeout(complete, 250);
        dialog.addEventListener("animationend", onAnimationEnd);
    });
}

function moveBpaModalFooter(dialog) {
    const footerSelector = ".bpa-budget-modal-footer, .bpa-sku-modal-footer";
    const body = dialog.querySelector(".bpa-create-dialog__body");
    const footer = body?.querySelector(footerSelector) || dialog.querySelector(footerSelector);
    if (!footer) return;

    dialog.querySelectorAll(footerSelector).forEach(existingFooter => {
        if (existingFooter !== footer) existingFooter.remove();
    });
    if (footer.parentElement !== dialog) dialog.append(footer);
}

function prepareBpaSkuModal(dialog) {
    const body = dialog.querySelector(".bpa-create-dialog__body");
    const page = body?.querySelector(".bpa-sku-add-page");
    const layout = page?.querySelector(".bpa-sku-modal-layout");
    const formWindow = layout?.querySelector(".bpa-sku-form-window");
    const exampleWindow = layout?.querySelector(".bpa-sku-example-window");
    const footer = dialog.querySelector(".bpa-sku-modal-footer");
    const header = dialog.querySelector(".bpa-create-dialog__header");
    if (!body || !page || !layout || !formWindow || !footer || !header) return;

    let headerActions = header.querySelector(".bpa-create-dialog__header-actions");
    if (!headerActions) {
        const closeButton = header.querySelector(".bpa-create-dialog__close");
        if (!closeButton) return;

        headerActions = document.createElement("div");
        headerActions.className = "bpa-create-dialog__header-actions";
        closeButton.replaceWith(headerActions);
        if (exampleWindow) {
            const exampleToggle = document.createElement("button");
            exampleToggle.type = "button";
            exampleToggle.className = "bpa-sku-example-toggle";
            exampleToggle.setAttribute("aria-label", "Tunjukkan contoh");
            exampleToggle.setAttribute("aria-expanded", "false");
            exampleToggle.setAttribute("aria-controls", "bpa-sku-example-window");
            exampleToggle.innerHTML = '<i class="bi bi-lightbulb" aria-hidden="true"></i>';
            headerActions.append(exampleToggle);
        }
        headerActions.append(closeButton);
    }
    if (exampleWindow) exampleWindow.id = "bpa-sku-example-window";

    const content = [...formWindow.childNodes];
    body.replaceChildren(...content);
    body.classList.add("bpa-sku-form-body");
    formWindow.replaceChildren(header, body, footer);
    dialog.replaceChildren(formWindow);
    if (exampleWindow) dialog.append(exampleWindow);
    dialog.classList.add(
        "bpa-create-dialog--sku-split",
        "bpa-create-dialog--sku-example-collapsed"
    );
    const exampleToggle = dialog.querySelector(".bpa-sku-example-toggle");
    if (exampleToggle) {
        exampleToggle.setAttribute("aria-label", "Tunjukkan contoh");
        exampleToggle.setAttribute("aria-expanded", "false");
        exampleToggle.innerHTML = '<i class="bi bi-lightbulb" aria-hidden="true"></i>';
    }
}

function prepareBpaSkuEditModal(dialog) {
    const body = dialog.querySelector(".bpa-create-dialog__body");
    const page = body?.querySelector(".bpa-sku-edit-page");
    const formWindow = page?.querySelector(".bpa-sku-edit-form-window");
    const form = formWindow?.querySelector("form");
    const footer = dialog.querySelector(".bpa-sku-modal-footer");
    if (!body || !page || !formWindow || !form || !footer) return;

    form.id = "bpa-sku-edit-form";
    form.classList.add("bpa-sku-add-form");
    formWindow.querySelectorAll(".bpa-sku-modal-footer").forEach(existing => existing.remove());
    body.classList.add("bpa-sku-edit-body");
    dialog.classList.add("bpa-create-dialog--sku-edit");
    dialog.append(footer);
}

function formatUnitProgramDate(value) {
    return value ? formatProgramDateKey(value) : "Pilih tarikh";
}

function updateUnitProgramDateButtons(picker) {
    const form = picker.closest("form");
    const start = form?.querySelector('[name="tarikh_mula"]')?.value || "";
    const end = form?.querySelector('[name="tarikh_tamat"]')?.value || "";
    const startButton = form?.querySelector('[data-unit-program-date="start"]');
    const endButton = form?.querySelector('[data-unit-program-date="end"]');
    if (startButton) startButton.querySelector("[data-date-label]").textContent = formatUnitProgramDate(start);
    if (endButton) endButton.querySelector("[data-date-label]").textContent = formatUnitProgramDate(end);
}

function initializeUnitProgramDatePicker(form) {
    const startInput = form.querySelector('[name="tarikh_mula"][type="date"]');
    const endInput = form.querySelector('[name="tarikh_tamat"][type="date"]');
    if (!startInput || !endInput || startInput.dataset.unitProgramDateReady === "true") return;

    const picker = document.createElement("div");
    picker.className = "unit-program-date-picker";
    picker.dataset.unitProgramDatePicker = "";
    const menu = document.createElement("div");
    menu.className = "program-date-range-menu unit-program-date-menu";
    menu.innerHTML = `
        <div class="audit-calendar-header">
            <button type="button" class="audit-calendar-nav" data-program-month-offset="-1" aria-label="Bulan sebelumnya">‹</button>
            <strong data-program-calendar-month></strong>
            <button type="button" class="audit-calendar-nav" data-program-month-offset="1" aria-label="Bulan seterusnya">›</button>
        </div>
        <div class="audit-calendar-weekdays" aria-hidden="true">
            <span>Isn</span><span>Sel</span><span>Rab</span><span>Kha</span><span>Jum</span><span>Sab</span><span>Aha</span>
        </div>
        <div class="program-date-range-days" data-program-calendar-days></div>
        <div class="program-date-range-footer">
            <span data-program-date-preview></span>
            <button type="button" class="program-date-clear" data-unit-program-date-clear>Kosongkan</button>
            <button type="button" class="program-date-apply" data-program-date-apply data-unit-program-date-apply>Pilih</button>
        </div>
    `;

    const buttons = [
        { input: startInput, key: "start", label: "Pilih tarikh mula" },
        { input: endInput, key: "end", label: "Pilih tarikh tamat" }
    ];
    for (const { input, key, label } of buttons) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "unit-program-date-button";
        button.dataset.unitProgramDate = key;
        button.setAttribute("aria-label", label);
        button.setAttribute("aria-haspopup", "dialog");
        button.setAttribute("aria-expanded", "false");
        button.innerHTML = '<i class="bi bi-calendar3" aria-hidden="true"></i><span data-date-label></span>';
        input.classList.add("unit-program-date-value");
        input.dataset.unitProgramDateReady = "true";
        input.tabIndex = -1;
        input.setAttribute("aria-hidden", "true");
        input.parentElement?.append(button);
    }

    const startColumn = startInput.closest(".col-md-3") || startInput.parentElement;
    startColumn?.classList.add("unit-program-date-anchor");
    startColumn?.append(picker);
    picker.append(menu);
    const startButton = startInput.parentElement?.querySelector('[data-unit-program-date="start"]');
    const endButton = endInput.parentElement?.querySelector('[data-unit-program-date="end"]');
    if (startButton) picker.prepend(startButton);
    if (endButton) endInput.parentElement?.append(endButton);

    const initialStart = startInput.value;
    const initialEnd = endInput.value;
    const month = parseProgramDateKey(initialStart) || parseProgramDateKey(initialEnd) || new Date();
    month.setDate(1);
    programDateRangeStates.set(picker, {
        month,
        draftStart: initialStart,
        draftEnd: initialEnd
    });
    updateUnitProgramDateButtons(picker);
}

function closeUnitProgramDatePicker(picker) {
    picker.querySelector(".program-date-range-menu")?.classList.remove("show");
    picker.closest("form")?.querySelectorAll(".unit-program-date-button")
        .forEach(button => button.setAttribute("aria-expanded", "false"));
}

document.addEventListener("click", event => {
    if (!(event.target instanceof Element)) return;
    const dateButton = event.target.closest(".unit-program-date-button");
    const picker = event.target.closest("[data-unit-program-date-picker]") ||
        (dateButton ? dateButton.closest("form")?.querySelector("[data-unit-program-date-picker]") : null);
    if (!picker) {
        document.querySelectorAll("[data-unit-program-date-picker] .program-date-range-menu.show")
            .forEach(menu => closeUnitProgramDatePicker(menu.closest("[data-unit-program-date-picker]")));
        return;
    }

    const state = programDateRangeStates.get(picker);
    const menu = picker.querySelector(".program-date-range-menu");
    if (!state || !menu) return;

    if (dateButton) {
        event.preventDefault();
        const opening = !menu.classList.contains("show");
        document.querySelectorAll("[data-unit-program-date-picker] .program-date-range-menu.show")
            .forEach(openMenu => closeUnitProgramDatePicker(openMenu.closest("[data-unit-program-date-picker]")));
        if (opening) {
            const form = picker.closest("form");
            state.draftStart = form?.querySelector('[name="tarikh_mula"]')?.value || "";
            state.draftEnd = form?.querySelector('[name="tarikh_tamat"]')?.value || "";
            state.month = parseProgramDateKey(state.draftStart) || parseProgramDateKey(state.draftEnd) || new Date();
            state.month.setDate(1);
            menu.classList.add("show");
            picker.closest("form")?.querySelectorAll(".unit-program-date-button")
                .forEach(button => button.setAttribute("aria-expanded", "true"));
            renderProgramDateRange(picker);
        }
        return;
    }

    const monthButton = event.target.closest("[data-program-month-offset]");
    if (monthButton) {
        state.month.setMonth(state.month.getMonth() + Number(monthButton.dataset.programMonthOffset));
        renderProgramDateRange(picker);
        return;
    }

    const dayButton = event.target.closest("[data-program-calendar-date]");
    if (dayButton) {
        const selectedDate = dayButton.dataset.programCalendarDate;
        if (!state.draftStart || state.draftEnd) {
            state.draftStart = selectedDate;
            state.draftEnd = "";
        } else if (selectedDate < state.draftStart) {
            state.draftEnd = state.draftStart;
            state.draftStart = selectedDate;
        } else {
            state.draftEnd = selectedDate;
        }
        renderProgramDateRange(picker);
        return;
    }

    if (event.target.closest("[data-unit-program-date-apply]")) {
        if (!state.draftStart || !state.draftEnd) return;
        const form = picker.closest("form");
        if (!form) return;
        form.querySelector('[name="tarikh_mula"]').value = state.draftStart;
        form.querySelector('[name="tarikh_tamat"]').value = state.draftEnd;
        updateUnitProgramDateButtons(picker);
        closeUnitProgramDatePicker(picker);
        return;
    }

    if (event.target.closest("[data-unit-program-date-clear]")) {
        const form = picker.closest("form");
        if (!form) return;
        form.querySelector('[name="tarikh_mula"]').value = "";
        form.querySelector('[name="tarikh_tamat"]').value = "";
        state.draftStart = "";
        state.draftEnd = "";
        updateUnitProgramDateButtons(picker);
        closeUnitProgramDatePicker(picker);
    }
});

function prepareBpaUnitProgramModal(dialog, mode) {
    const body = dialog.querySelector(".bpa-create-dialog__body");
    const container = body?.querySelector(".container");
    const form = container?.querySelector("form");
    const modalHeader = dialog.querySelector(".bpa-create-dialog__header");
    if (!body || !container || !modalHeader) return;

    const heading = container.querySelector("h4")?.parentElement;
    const subtitle = heading?.querySelector("small")?.textContent?.trim();
    if (subtitle) {
        let modalSubtitle = modalHeader.querySelector(".bpa-create-dialog__subtitle");
        if (!modalSubtitle) {
            modalSubtitle = document.createElement("p");
            modalSubtitle.className = "bpa-create-dialog__subtitle";
            modalHeader.querySelector(".bpa-create-dialog__heading")?.append(modalSubtitle);
        }
        modalSubtitle.textContent = subtitle;
    }

    const alerts = [...container.querySelectorAll(":scope > .alert")];
    if (mode === "view") {
        const cardBody = container.querySelector(".card .card-body");
        if (!cardBody) return;
        const title = cardBody.querySelector("h5");
        let status = "";
        let year = "";
        let currentSection = "";
        const programFields = [];
        const financialFields = [];
        const notesFields = [];
        const additionalSections = new Map();
        const normalizeLabel = label => label
            .replace(/[:：]/g, "")
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9]/g, "");
        const getFieldLabel = field => field.querySelector(".label, .k");
        const getFieldValue = (field, label) => [...field.childNodes]
            .filter(node => node !== label)
            .map(node => node.textContent)
            .join(" ")
            .trim();
        const addAdditionalField = field => {
            field.classList.add("unit-program-detail-field");
            const section = currentSection || "Maklumat Tambahan";
            if (!additionalSections.has(section)) additionalSections.set(section, []);
            additionalSections.get(section).push(field);
        };
        const classifyField = field => {
            const label = getFieldLabel(field);
            if (!label) {
                addAdditionalField(field);
                return;
            }

            const fieldName = normalizeLabel(label.textContent);
            const value = getFieldValue(field, label);
            if (["sku", "linksku"].includes(fieldName)) {
                field.remove();
                return;
            }
            if (fieldName === "status") {
                status = status || value;
                field.remove();
                return;
            }
            if (fieldName === "tahun") {
                year = year || value;
                field.remove();
                return;
            }
            if (fieldName === "catatan") {
                field.classList.add("unit-program-detail-field");
                notesFields.push(field);
                field.remove();
                return;
            }

            field.classList.add("unit-program-detail-field");
            if ([
                "nkjkb",
                "tarikhtempoh",
                "tarikhkontrakasal",
                "tempat",
                "tempatpengajian",
                "kerjasamakonsultan",
                "bilpeserta",
                "bilanganpeserta"
            ].includes(fieldName)) {
                programFields.push(field);
            } else if (
                fieldName.startsWith("peruntukan")
                || fieldName.startsWith("perbelanjaan")
                || fieldName.startsWith("danawakalah")
                || fieldName.startsWith("bakibelanja")
            ) {
                financialFields.push(field);
            } else {
                addAdditionalField(field);
            }
            field.remove();
        };

        for (const child of [...cardBody.children]) {
            if (child === title) continue;
            if (child.matches("h6")) {
                currentSection = child.textContent.trim();
                continue;
            }
            if (child.matches("hr")) continue;

            for (const badge of [...child.querySelectorAll(".badge")]) {
                if (badge.classList.contains("bg-dark")) {
                    status = status || badge.textContent.trim();
                    badge.remove();
                } else if (badge.classList.contains("bg-secondary")) {
                    year = year || badge.textContent.trim().replace(/^Tahun\s*/i, "");
                    badge.remove();
                }
            }

            if (child.matches(".row")) {
                for (const field of [...child.children]) classifyField(field);
            } else if (child.textContent.trim()) {
                classifyField(child);
            }
            child.remove();
        }

        const metadata = document.createElement("div");
        metadata.className = "bpa-unit-program-detail-meta";
        const statusColor = {
            draft: "secondary",
            aktif: "primary",
            selesai: "success",
            batal: "danger"
        }[status.trim().toLowerCase()] || "secondary";
        if (status) {
            const statusBadge = document.createElement("span");
            statusBadge.className = `status-badge bg-${statusColor}`;
            statusBadge.textContent = status;
            metadata.append(statusBadge);
        }
        if (year) {
            const yearBadge = document.createElement("span");
            yearBadge.className = "badge bpa-unit-program-detail-year-badge";
            yearBadge.textContent = `Tahun ${year}`;
            metadata.append(yearBadge);
        }

        const createSection = (heading, iconName) => {
            const section = document.createElement("section");
            section.className = "bpa-unit-program-detail-section";
            const sectionHeading = document.createElement("h6");
            sectionHeading.className = "bpa-unit-program-detail-section-title";
            const icon = document.createElement("span");
            icon.className = "bpa-unit-program-detail-section-icon";
            icon.setAttribute("aria-hidden", "true");
            icon.innerHTML = `<i class="bi ${iconName}"></i>`;
            const headingText = document.createElement("span");
            headingText.textContent = heading;
            sectionHeading.append(icon, headingText);
            section.append(sectionHeading);
            return section;
        };
        const createFieldGrid = fields => {
            const grid = document.createElement("div");
            grid.className = "unit-program-detail-grid";
            grid.append(...fields);
            return grid;
        };

        cardBody.replaceChildren();
        const hero = document.createElement("div");
        hero.className = "bpa-unit-program-detail-hero";
        if (status) hero.classList.add(`bpa-unit-program-detail-hero--${statusColor}`);
        if (title) hero.append(title);
        if (status || year) hero.append(metadata);
        cardBody.append(hero);

        if (programFields.length) {
            const section = createSection("Maklumat Program", "bi-card-text");
            section.append(createFieldGrid(programFields));
            cardBody.append(section);
        }
        if (financialFields.length) {
            const section = createSection("Maklumat Kewangan", "bi-cash-stack");
            section.append(createFieldGrid(financialFields));
            cardBody.append(section);
        }
        if (additionalSections.size) {
            const section = createSection("Maklumat Tambahan", "bi-info-circle");
            for (const [heading, fields] of additionalSections) {
                if (heading !== "Maklumat Tambahan") {
                    const sectionTitle = document.createElement("h6");
                    sectionTitle.className = "bpa-unit-program-detail-subheading";
                    sectionTitle.textContent = heading;
                    section.append(sectionTitle);
                }
                section.append(createFieldGrid(fields));
            }
            cardBody.append(section);
        }
        if (notesFields.length) {
            const section = createSection("Catatan", "bi-chat-left-text");
            section.append(createFieldGrid(notesFields));
            cardBody.append(section);
        }

        cardBody.classList.add("bpa-unit-program-details-content");
        body.replaceChildren(...alerts, cardBody);
        dialog.querySelector(".bpa-unit-program-modal-footer")?.remove();
        dialog.classList.add("bpa-create-dialog--unit-program-details");
        return;
    }

    if (!form) return;
    const submitButton = form.querySelector('button[type="submit"], input[type="submit"], button:not([type])');
    const actionRow = submitButton?.closest(".col-12");
    actionRow?.remove();

    const formSections = [
        { key: "program", title: "Maklumat Program", icon: "bi-card-text", fields: [] },
        { key: "implementation", title: "Pelaksanaan Program", icon: "bi-calendar2-week", fields: [] },
        { key: "participants", title: "Maklumat Peserta", icon: "bi-people", fields: [] },
        { key: "finance", title: "Maklumat Kewangan", icon: "bi-cash-stack", fields: [] },
        { key: "status", title: "Status & Catatan", icon: "bi-clipboard-check", fields: [] },
        { key: "additional", title: "Maklumat Tambahan", icon: "bi-info-circle", fields: [] }
    ];
    const sectionsByKey = new Map(formSections.map(section => [section.key, section]));
    const normalizeFieldName = value => value.toLowerCase().replace(/[^a-z0-9]/g, "");
    const classifyFormField = (field, control) => {
        const name = normalizeFieldName(control?.name || "");
        const label = normalizeFieldName(
            field.querySelector(".form-label, label")?.textContent?.trim() || ""
        );
        if (name === "tahun" || name === "namaprogram" || name === "nkjkb") return "program";
        if (name === "status" || name === "catatan") return "status";
        if (
            name.includes("peruntukan")
            || name.includes("perbelanjaan")
            || name.includes("danawakalah")
            || name.includes("bakibelanja")
            || label.includes("peruntukan")
            || label.includes("perbelanjaan")
            || label.includes("wakalah")
            || label.includes("bakibelanja")
        ) return "finance";
        if (
            name.includes("peserta")
            || name.includes("kuota")
            || name.includes("sektor")
            || name.includes("siribatch")
            || name.includes("jumlahsediaada")
            || label.includes("peserta")
            || label.includes("kuota")
            || label.includes("sektor")
            || label.includes("batch")
        ) return "participants";
        if (
            name.startsWith("tarikh")
            || name.includes("tempoh")
            || name === "tempat"
            || name === "tempatpengajian"
            || name.includes("kerjasama")
            || label.includes("tarikh")
            || label.includes("tempoh")
            || label.includes("tempat")
            || label.includes("kerjasama")
        ) return "implementation";
        return "additional";
    };
    const hiddenFormElements = [];
    for (const child of [...form.children]) {
        const controls = [...child.querySelectorAll("input, select, textarea")];
        const hasVisibleControl = controls.some(control => control.type !== "hidden");
        if (hasVisibleControl) {
            child.classList.add("bpa-unit-program-form-field");
            if (child.querySelector("textarea")) child.classList.add("bpa-unit-program-form-field--wide");
            if (child.querySelector('[name="nama_program"], [name="sektor_perniagaan_peserta"]')) {
                child.classList.add("bpa-unit-program-form-field--wide");
            }
            sectionsByKey.get(classifyFormField(child, controls.find(control => control.type !== "hidden"))).fields.push(child);
            child.remove();
            continue;
        }

        if (controls.length || child.matches('input[type="hidden"]')) {
            hiddenFormElements.push(child);
        } else if (
            child.matches("hr, p, .w-100")
            || (child.matches('[class*="col-"]') && child.querySelector("h1, h2, h3, h4, h5, h6"))
        ) {
            child.remove();
        } else if (child.textContent.trim()) {
            sectionsByKey.get("additional").fields.push(child);
            child.remove();
        }
    }

    const sectionElements = formSections
        .filter(section => section.fields.length)
        .map(section => {
            const sectionElement = document.createElement("section");
            sectionElement.className = "bpa-unit-program-form-section";
            const heading = document.createElement("h6");
            heading.className = "bpa-unit-program-form-section-title";
            const icon = document.createElement("span");
            icon.className = "bpa-unit-program-form-section-icon";
            icon.setAttribute("aria-hidden", "true");
            icon.innerHTML = `<i class="bi ${section.icon}"></i>`;
            const title = document.createElement("span");
            title.textContent = section.title;
            heading.append(icon, title);
            const grid = document.createElement("div");
            grid.className = "bpa-unit-program-form-grid";
            grid.append(...section.fields);
            sectionElement.append(heading, grid);
            return sectionElement;
        });

    form.id = `bpa-unit-program-${mode}-form`;
    form.classList.remove("row", "g-3");
    form.classList.add("bpa-unit-program-add-form", "bpa-unit-program-form");
    form.replaceChildren(...hiddenFormElements, ...sectionElements);
    const footer = document.createElement("footer");
    footer.className = "bpa-unit-program-modal-footer";
    const saveButton = document.createElement("button");
    saveButton.type = "submit";
    saveButton.setAttribute("form", form.id);
    saveButton.className = "budget-list-action budget-list-action--primary bpa-budget-save-button";
    saveButton.innerHTML = mode === "add"
        ? '<span class="budget-list-action-icon"><i class="bi bi-plus-lg" aria-hidden="true"></i></span><span>Tambah</span>'
        : '<span class="budget-list-action-icon"><i class="bi bi-check2" aria-hidden="true"></i></span><span>Simpan</span>';
    footer.append(saveButton);

    body.replaceChildren(...alerts, form);
    dialog.querySelector(".bpa-unit-program-modal-footer")?.remove();
    dialog.append(footer);
    dialog.classList.add(`bpa-create-dialog--unit-program-${mode}`);
    initializeUnitProgramDatePicker(form);
}

async function submitBpaAddForm(form) {
    const modal = bpaAddModal;
    if (!modal) return;

    const submitButton = form.querySelector('button[type="submit"], button:not([type]), input[type="submit"]') ||
        [...modal.dialog.querySelectorAll('button[type="submit"][form]')]
            .find(button => button.form === form);
    if (submitButton) submitButton.disabled = true;

    try {
        const response = await fetch(modal.url, {
            method: "POST",
            body: new FormData(form),
            headers: {
                "X-Requested-With": "XMLHttpRequest",
                "X-App-Modal": "true"
            }
        });

        if (response.headers.get("content-type")?.includes("application/json")) {
            const result = await response.json();
            if (!response.ok || !result.success) {
                throw new Error(result.message || `Borang tidak dapat disimpan (HTTP ${response.status}).`);
            }
            if (!modal.returnUrl) {
                throw new Error("Borang berjaya dihantar tetapi halaman senarai tidak dapat dikenal pasti.");
            }

            const returnUrl = modal.returnUrl;
            const submittedPath = appPathname(new URL(modal.url).pathname);
            const refreshUrl = new URL(returnUrl);
            const isBudgetForm = ["/bpa/admin/bajet_add", "/bpa/admin/bajet_edit"].includes(submittedPath);
            const isSkuForm = ["/bpa/admin/sku_add", "/bpa/admin/sku_edit"].includes(submittedPath);
            if (isBudgetForm || isSkuForm) {
                const year = form.elements.namedItem("tahun")?.value;
                if (year) refreshUrl.searchParams.set("tahun", year);
                refreshUrl.searchParams.delete("unit_id");
                refreshUrl.searchParams.delete("q");
                if (isSkuForm) refreshUrl.searchParams.delete("scope_type");
            }
            await closeBpaAddModal();
            if (isBudgetForm || isSkuForm) {
                const listRefreshed = isSkuForm
                    ? await updateSkuFilterResults(refreshUrl, { updateAddress: true })
                    : await updateBudgetFilterResults(refreshUrl, {
                        updateAddress: submittedPath === "/bpa/admin/bajet_add"
                    });
                if (!listRefreshed) {
                    showBpaAppAlert(
                        `${result.message || (isSkuForm ? "SKU berjaya dikemaskini." : "Bajet berjaya dikemaskini.")} Senarai gagal dikemas kini.`,
                        "danger"
                    );
                    return;
                }
                showBpaSaveConfirmation(
                    result.message ||
                    ({
                        "/bpa/admin/bajet_add": "Bajet berjaya ditambah.",
                        "/bpa/admin/bajet_edit": "Bajet berjaya dikemaskini.",
                        "/bpa/admin/sku_add": "SKU berjaya ditambah.",
                        "/bpa/admin/sku_edit": "SKU berjaya dikemaskini."
                    }[submittedPath] || "Disimpan")
                );
                return;
            }

            try {
                await navigateTo(returnUrl, true);
            } catch (error) {
                console.error("BPA page refresh error after form submission:", error);
                window.location.assign(returnUrl);
            }
            showBpaSaveConfirmation(result.message || "Disimpan");
            return;
        }

        if (!response.ok) {
            throw new Error(`Borang tidak dapat disimpan (HTTP ${response.status}).`);
        }

        const parsedPage = new DOMParser().parseFromString(
            await response.text(),
            "text/html"
        );
        const main = parsedPage.querySelector("main.main-content");
        if (!main) {
            throw new Error("Respons borang tidak mengandungi kandungan yang dijangka.");
        }

        const submittedPath = appPathname(new URL(modal.url).pathname);
        const refreshAfterSuccess = submittedPath.endsWith("/program_edit") ||
            submittedPath.endsWith("/bajet_add");
        const successAlert = main.querySelector(".alert.alert-success");
        if (modal.returnUrl && refreshAfterSuccess && successAlert) {
            const successMessage = successAlert.textContent.trim() || "Disimpan";
            const returnUrl = modal.returnUrl;
            await closeBpaAddModal();
            try {
                await navigateTo(returnUrl, true);
            } catch (error) {
                console.error("BPA page refresh error after form submission:", error);
                window.location.assign(returnUrl);
            }
            showBpaSaveConfirmation(successMessage);
            return;
        }

        installBpaModalPageStyles(parsedPage, modal.previousStyles);
        const body = bpaAddModal.dialog.querySelector(".bpa-create-dialog__body");
        resolveBpaPageLinks(main, modal.url);
        body.innerHTML = main.innerHTML;
        moveBpaModalFooter(bpaAddModal.dialog);
        prepareBpaSkuModal(bpaAddModal.dialog);
        const unitProgramMode = getBpaUnitProgramModalMode(submittedPath);
        if (unitProgramMode === "add" || unitProgramMode === "edit") {
            prepareBpaUnitProgramModal(bpaAddModal.dialog, unitProgramMode);
        }
        addBpaFormAction(bpaAddModal.dialog, bpaAddModal.url);
        await executeBpaPageScripts(parsedPage, modal.url);
        showBpaFormAlerts(bpaAddModal.dialog);
        body.scrollTop = 0;
        bpaAddModal.dialog.querySelector(".bpa-create-dialog__close").focus();
    } catch (error) {
        console.error("BPA form submission error:", error);
        showBpaAppAlert(error.message || "Borang tidak dapat disimpan.", "danger");
    } finally {
        if (submitButton?.isConnected) submitButton.disabled = false;
    }
}

async function openBpaAddModal(url, trigger) {
    const target = new URL(url, window.location.href);
    const response = await fetch(target.href, {
        headers: { "X-App-Modal": "true" }
    });
    if (!response.ok) {
        throw new Error(`Borang tidak dapat dimuat (HTTP ${response.status}).`);
    }

    const parsedPage = new DOMParser().parseFromString(
        await response.text(),
        "text/html"
    );
    const main = parsedPage.querySelector("main.main-content");
    if (!main) {
        throw new Error("Halaman borang tidak mengandungi kandungan yang dijangka.");
    }

    const titleByPath = {
        "/bpa/admin/user_add": "Tambah User",
        "/bpa/admin/bajet_add": "Tambah Bajet",
        "/bpa/admin/bajet_edit": "Edit Bajet",
        "/bpa/admin/sku_add": "Tambah SKU",
        "/bpa/admin/sku_edit": "Edit SKU",
        "/bpa/upp/program_add": "Tambah Program UPP",
        "/bpa/uak/program_add": "Tambah Program UAK",
        "/bpa/upu/program_add": "Tambah Program UPU",
        "/bpa/upa/program_add": "Tambah Program UPA",
        "/bpa/ulk/program_add": "Tambah Program ULK",
        "/bpa/upp/program_view": "Detail Program UPP",
        "/bpa/uak/program_view": "Detail Program UAK",
        "/bpa/upu/program_view": "Detail Program UPU",
        "/bpa/upa/program_view": "Detail Program UPA",
        "/bpa/ulk/program_view": "Detail Program ULK",
        "/bpa/upp/program_edit": "Edit Program UPP",
        "/bpa/uak/program_edit": "Edit Program UAK",
        "/bpa/upu/program_edit": "Edit Program UPU",
        "/bpa/upa/program_edit": "Edit Program UPA",
        "/bpa/ulk/program_edit": "Edit Program ULK"
    };
    const targetPathname = appPathname(target.pathname);
    const targetRoutePath = targetPathname.replace(/\.php$/, "");
    const isProgramModal = isBpaProgramModalPath(targetPathname);
    const unitProgramMode = getBpaUnitProgramModalMode(targetPathname);
    const isUnitProgramModal = Boolean(unitProgramMode);
    const title = titleByPath[targetRoutePath] || "Tambah";
    const subtitle = main.querySelector("[data-bpa-modal-subtitle]")?.dataset.bpaModalSubtitle || "";
    resolveBpaPageLinks(main, target.href);
    const dialog = document.createElement("dialog");
    dialog.className = `bpa-create-dialog${["/bpa/admin/sku_add", "/bpa/admin/sku_edit"].includes(targetPathname) ? " bpa-create-dialog--sku" : ""}${targetPathname === "/bpa/admin/bajet_edit" ? " bpa-create-dialog--budget-edit" : ""}${isProgramModal ? " bpa-create-dialog--program" : ""}${isUnitProgramModal ? ` bpa-create-dialog--unit-program bpa-create-dialog--unit-program-${unitProgramMode}` : ""}`;
    dialog.setAttribute("aria-labelledby", "bpa-create-dialog-title");
    dialog.innerHTML = `
        <header class="bpa-create-dialog__header">
            <div class="bpa-create-dialog__heading">
                <h2 id="bpa-create-dialog-title"></h2>
                ${subtitle ? '<p class="bpa-create-dialog__subtitle"></p>' : ""}
            </div>
            <button type="button" class="bpa-create-dialog__close" aria-label="Tutup borang">&times;</button>
        </header>
        <div class="bpa-create-dialog__body"></div>
    `;
    dialog.querySelector("#bpa-create-dialog-title").textContent = title;
    if (subtitle) dialog.querySelector(".bpa-create-dialog__subtitle").textContent = subtitle;
    dialog.querySelector(".bpa-create-dialog__body").innerHTML = main.innerHTML;
    moveBpaModalFooter(dialog);
    prepareBpaSkuModal(dialog);
    prepareBpaSkuEditModal(dialog);
    if (isUnitProgramModal) prepareBpaUnitProgramModal(dialog, unitProgramMode);
    addBpaFormAction(dialog, target.href);

    bpaAddModal = {
        dialog,
        url: target.href,
        trigger,
        returnUrl: isProgramModal || ["/bpa/admin/bajet_add", "/bpa/admin/bajet_edit", "/bpa/admin/sku_add", "/bpa/admin/sku_edit"].includes(targetPathname)
            ? window.location.href
            : null,
        previousStyles: [...document.querySelectorAll("style[data-bpa-page-style]")]
            .map(style => style.cloneNode(true))
    };

    dialog.addEventListener("cancel", event => {
        event.preventDefault();
        closeBpaAddModal();
    });
    dialog.addEventListener("keydown", event => {
        if (event.key === "Escape") {
            event.preventDefault();
            closeBpaAddModal();
        }
    }, true);
    dialog.addEventListener("click", async event => {
        if (event.target === dialog) {
            closeBpaAddModal();
            return;
        }

        const skuExampleToggle = event.target.closest(".bpa-sku-example-toggle, .bpa-sku-example-close");
        if (skuExampleToggle) {
            const isCollapsed = dialog.classList.toggle("bpa-create-dialog--sku-example-collapsed");
            const toggle = dialog.querySelector(".bpa-sku-example-toggle");
            toggle.setAttribute("aria-expanded", String(!isCollapsed));
            toggle.setAttribute(
                "aria-label",
                isCollapsed ? "Tunjukkan contoh" : "Sembunyikan contoh"
            );
            toggle.innerHTML = `<i class="bi ${isCollapsed ? "bi-lightbulb" : "bi-lightbulb-fill"}" aria-hidden="true"></i>`;
            return;
        }

        if (event.target.closest(".bpa-create-dialog__close")) {
            closeBpaAddModal();
            return;
        }

        const link = event.target.closest("a[href]");
        if (!link) return;

        event.preventDefault();
        const href = link.href;
        const target = new URL(href, window.location.href);
        const targetPathname = appPathname(target.pathname);
        if (isBpaProgramModalPath(targetPathname)) {
            const trigger = bpaAddModal?.trigger;
            await closeBpaAddModal();
            openBpaAddModal(href, trigger).catch(error => {
                console.error("Program modal navigation error:", error);
                window.alert(error.message || "Halaman program tidak dapat dimuat.");
            });
            return;
        }
        if (isBpaProgramListPath(targetPathname)) {
            const returnUrl = bpaAddModal?.returnUrl;
            await closeBpaAddModal();
            if (returnUrl) {
                navigateTo(returnUrl, true).catch(error => {
                    console.error("Program list navigation error:", error);
                    window.location.assign(returnUrl);
                });
            }
            return;
        }
        await closeBpaAddModal();
        navigateTo(href).catch(error => {
            console.error("Page navigation error:", error);
        });
    });
    dialog.addEventListener("submit", event => {
        const form = event.target;
        if (!(form instanceof HTMLFormElement)) return;
        event.preventDefault();
        submitBpaAddForm(form);
    });

    document.body.append(dialog);
    installBpaModalPageStyles(parsedPage, bpaAddModal.previousStyles);
    try {
        await executeBpaPageScripts(parsedPage, target.href);
        dialog.showModal();
        showBpaFormAlerts(dialog);
        document.querySelectorAll("#sidebar .nav-item").forEach(item => {
            item.classList.toggle("active", item.href === target.href);
        });
        const firstField = dialog.querySelector(".bpa-create-dialog__body input:not([type='hidden']), .bpa-create-dialog__body select, .bpa-create-dialog__body textarea");
        (firstField || dialog.querySelector(".bpa-create-dialog__close")).focus();
    } catch (error) {
        await closeBpaAddModal();
        throw error;
    }
}

function updateHistory(target, replace) {
    if (replace) {
        window.history.replaceState({}, "", target.href);
    } else {
        window.history.pushState({}, "", target.href);
    }
}

async function notifyPageLoaded() {
    pageLoadTasks = [];
    document.dispatchEvent(new Event("app:page-loaded"));
    showBpaPageAlerts();
    initializeCustomSelects();

    if (typeof window.initHeader === "function") {
        await window.initHeader();
    }
    await waitForPageLoadTasks(pageLoadTasks);
    initializeBpaDashboardSwitcher();
    initializeBpaProgramListSwitcher();
}

async function navigateTo(url, replace = false) {
    const target = new URL(url, window.location.origin);
    const targetAppPath = appPathname(target.pathname);
    if (targetAppPath !== "/bpa/dashboard") {
        bpaDashboardCache?.clear();
    } else if (!target.searchParams.has("tahun")) {
        bpaDashboardCache?.clear();
    }
    if (
        window.APP_BASE_PATH &&
        target.origin === window.location.origin &&
        target.pathname !== window.APP_BASE_PATH &&
        !target.pathname.startsWith(`${window.APP_BASE_PATH}/`)
    ) {
        target.pathname = window.appUrl(target.pathname);
    }
    let targetPathname = appPathname(target.pathname);
    if (targetPathname === "/bpa/admin/dashboard_admin") {
        target.pathname = window.appUrl("/bpa/dashboard");
        targetPathname = "/bpa/dashboard";
    } else {
        const unitDashboard = targetPathname.match(/^\/bpa\/(uak|upu|upa|ulk)\/dashboard$/i);
        if (unitDashboard) {
            target.pathname = window.appUrl("/bpa/dashboard");
            target.searchParams.set("unit", unitDashboard[1].toUpperCase());
            targetPathname = "/bpa/dashboard";
        } else {
            const unitProgramList = targetPathname.match(/^\/bpa\/(upp|uak|upu|upa|ulk)\/program_list$/i);
            if (unitProgramList) {
                target.pathname = window.appUrl("/bpa/laporan/program_list");
                target.searchParams.set("unit", unitProgramList[1].toUpperCase());
                targetPathname = "/bpa/laporan/program_list";
            }
        }
    }
    const supported =
        targetPathname === "/" ||
        targetPathname === "/set-data" ||
        /^\/set-data\/\d+$/.test(targetPathname) ||
        targetPathname === "/muat-naik" ||
        targetPathname === "/penerima-peserta" ||
        targetPathname === "/peserta-program" ||
        targetPathname === "/penerima-bantuan" ||
        targetPathname === "/aktiviti-pengguna" ||
        targetPathname === "/akaun-pengguna" ||
        targetPathname === "/pengurusan-pengguna";
    const navigableBpaPages = [
        "/bpa/dashboard",
        "/bpa/admin/bajet_list",
        "/bpa/admin/sku_list",
        "/bpa/admin/user_list",
        "/bpa/admin/user_edit",
        "/bpa/laporan/program_list"
    ];
    const isBpaPage = navigableBpaPages.some(path =>
        targetPathname === path || targetPathname === `${path}.php`
    );

    if (target.origin !== window.location.origin) {
        window.location.assign(target.href);
        return;
    }
    if (targetPathname.startsWith("/bpa/") && !isBpaPage) {
        const dashboardUrl = typeof window.appUrl === "function"
            ? window.appUrl("/bpa/dashboard")
            : "/bpa/dashboard";
        window.location.assign(dashboardUrl);
        return;
    }
    if (!supported && !isBpaPage) {
        window.location.assign(target.href);
        return;
    }

    const targetDashboardUnit = (target.searchParams.get("unit") || "BPA").toUpperCase();
    const displayedDashboardRoot = displayedPagePath === "/bpa/dashboard"
        ? pageContent?.querySelector(".bpa-shell-page")
        : null;
    const displayedDashboardUnit = displayedDashboardRoot
        ? (displayedDashboardRoot.dataset.dashboardUnit ||
            new URL(window.location.href).searchParams.get("unit") ||
            "BPA").toUpperCase()
        : null;
    const dashboardUnitChanged =
        targetPathname === "/bpa/dashboard" &&
        displayedDashboardUnit !== null &&
        displayedDashboardUnit !== targetDashboardUnit;
    const pageChanged = displayedPagePath !== targetPathname || dashboardUnitChanged;
    const isSidebarPage = [...document.querySelectorAll("#sidebar a")].some(link =>
        appPathname(new URL(link.href, window.location.href).pathname) === targetPathname
    );
    const hasPageEntryTransition =
        isSidebarPage ||
        targetPathname === "/muat-naik" ||
        targetPathname === "/set-data" ||
        targetPathname.startsWith("/set-data/") ||
        targetPathname === "/pengurusan-pengguna" ||
        targetPathname === "/aktiviti-pengguna" ||
        targetPathname === "/akaun-pengguna";
    const suppressPageEntryAnimations = isSidebarPage && pageChanged;
    const animateBpaDashboardOnEntry =
        targetPathname === "/bpa/dashboard" &&
        targetDashboardUnit === "BPA";
    const shouldAnimatePageEntry =
        hasPageEntryTransition && !animateBpaDashboardOnEntry;
    let pageEntryHidden = false;

    if (leaveConfirmationPending) return;

    const hasUnsavedChanges = typeof window.hasUnsavedTableChanges === "function" &&
        window.hasUnsavedTableChanges();
    const isSaving = typeof window.isSavingTableChanges === "function" &&
        window.isSavingTableChanges();
    if (hasUnsavedChanges || isSaving) {
        if (!await confirmLeavingWithUnsavedChanges()) return;
        if (typeof window.resetTableState === "function") window.resetTableState();
    }

    initialPageTasks = [];
    pageLoadTasks = [];
    if (suppressPageEntryAnimations) {
        document.body.classList.add("app-sidebar-page-navigation");
    }

    try {
        let parsedPage = null;
        if (targetPathname === "/" && dashboardNode) {
            await replacePageContent(() => {
                removeBpaPageStyles();
                pageContent.replaceChildren(dashboardNode);
                if (pageChanged) pageContent.scrollTop = 0;
            });
            if (pageChanged && pageContent) pageContent.scrollTop = 0;
            displayedPagePath = targetPathname;
            updateHistory(target, replace);
            updateActiveNavigation(targetPathname);
            await notifyPageLoaded();
            await finishPageLoading();
            return;
        }

        const cacheKey = target.pathname + target.search;
        let markup = isBpaPage ? null : pageCache.get(cacheKey);

        if (!markup) {
            const response = await fetch(
                target.pathname + target.search,
                isBpaPage ? {
                    headers: {
                        "X-App-Navigation": "true"
                    }
                } : {
                    headers: {
                        "X-App-Fragment": "true"
                    }
                }
            );

            if (!response.ok) {
                throw new Error(`Page HTTP ${response.status}`);
            }

            const fragment = await response.text();
            parsedPage = new DOMParser().parseFromString(
                fragment,
                "text/html"
            );
            const main = parsedPage.querySelector("main.main-content");

            if (!main) {
                if (isBpaPage) {
                    console.warn(
                        "BPA page returned without BAPIM shell content; falling back to full navigation.",
                        target.href
                    );
                    window.location.assign(target.href);
                    return;
                }
                throw new Error("Page fragment is missing main content.");
            }

            markup = main.innerHTML;
            if (!isBpaPage) pageCache.set(cacheKey, markup);
        }

        if ((animateBpaDashboardOnEntry || shouldAnimatePageEntry) && pageContent) {
            pageContent.style.visibility = "hidden";
            pageEntryHidden = true;
        }

        await replacePageContent(() => {
            if (isBpaPage && parsedPage) {
                installBpaPageStyles(parsedPage);
            } else if (!isBpaPage) {
                removeBpaPageStyles();
            }
            pageContent.innerHTML = markup;
            if (pageChanged) pageContent.scrollTop = 0;
        });
        if (pageChanged && pageContent) pageContent.scrollTop = 0;
        displayedPagePath = targetPathname;
        if (isBpaPage && parsedPage) {
            await executeBpaPageScripts(parsedPage, target.href);
        }
        updateHistory(target, replace);
        updateActiveNavigation(targetPathname);
        if (animateBpaDashboardOnEntry) {
            initializeBpaDashboardSwitcher();
            document.body.classList.remove("app-sidebar-page-navigation");
            const root = pageContent?.querySelector(".bpa-dashboard-content");
            if (!root) {
                throw new Error("Kandungan papan pemuka BPA tiada selepas pemuatan halaman.");
            }
            animateBpaDashboardEntry(root);
            pageContent.style.removeProperty("visibility");
            pageEntryHidden = false;
        }

        await notifyPageLoaded();
        if (shouldAnimatePageEntry) {
            animatePageEntry(pageContent);
            pageContent.style.removeProperty("visibility");
            pageEntryHidden = false;
        }
        await finishPageLoading();
    } catch (error) {
        await finishPageLoading();
        throw error;
    } finally {
        if (pageEntryHidden) {
            pageContent?.style.removeProperty("visibility");
        }
        document.body.classList.remove("app-sidebar-page-navigation");
    }
}

document.addEventListener("click", event => {
    const dashboardCard = event.target instanceof Element
        ? event.target.closest("[data-bpa-dashboard-unit]")
        : null;
    if (dashboardCard) {
        const toolbar = dashboardCard.closest(".bpa-dashboard-selector");
        const root = toolbar?.nextElementSibling;
        if (toolbar && root?.classList.contains("bpa-shell-page")) {
            selectBpaDashboard(dashboardCard.dataset.bpaDashboardUnit, toolbar, root, {
                resetYear: true
            })
                .catch(error => {
                    console.error("BPA dashboard load error:", error);
                    showBpaDashboardError(root, error);
                });
        }
        return;
    }

    const programListCard = event.target instanceof Element
        ? event.target.closest("[data-bpa-program-list-unit]")
        : null;
    if (programListCard) {
        const selector = programListCard.closest(".bpa-program-list-selector");
        const root = selector?.nextElementSibling;
        if (selector && root?.classList.contains("bpa-shell-page")) {
            const parameters = new URLSearchParams(window.location.search);
            parameters.delete("unit");
            selectBpaProgramList(
                programListCard.dataset.bpaProgramListUnit,
                selector,
                root,
                parameters
            ).catch(error => {
                console.error("BPA program list load error:", error);
                showBpaDashboardError(root, error);
            });
        }
        return;
    }

    const link = event.target instanceof Element
        ? event.target.closest("a[href]")
        : null;
    if (
        !link ||
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey ||
        link.target ||
        link.hasAttribute("download")
    ) {
        return;
    }

    const target = new URL(link.href, window.location.href);
    const targetPathname = appPathname(target.pathname);
    const isBpaFormPage = [
        "/bpa/admin/user_add",
        "/bpa/admin/bajet_add",
        "/bpa/admin/bajet_edit",
        "/bpa/admin/sku_add",
        "/bpa/admin/sku_edit"
    ].includes(targetPathname) || isBpaUnitProgramAddPath(targetPathname);
    if (
        (!isBpaFormPage && !isBpaProgramModalPath(targetPathname)) ||
        target.origin !== window.location.origin
    ) return;

    event.preventDefault();
    openBpaAddModal(target.href, link).catch(error => {
        console.error("BPA form open error:", error);
        window.alert(error.message || "Borang tidak dapat dimuat.");
    });
});

document.addEventListener("submit", event => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement)) return;
    if (!form.matches("[data-program-filter-form], [data-unit-program-filter-form]")) return;
    const root = form.closest(".bpa-shell-page");
    const selector = root?.previousElementSibling;
    if (!selector?.classList.contains("bpa-program-list-selector")) return;

    event.preventDefault();
    const unit = selector.dataset.activeUnit || "BPA";
    const method = (form.method || "GET").toUpperCase();
    const parameters = method === "GET"
        ? new URLSearchParams(new FormData(form))
        : new URLSearchParams(window.location.search);
    parameters.delete("unit");
    const body = method === "GET" ? undefined : new FormData(form);
    selectBpaProgramList(unit, selector, root, parameters, {
        method,
        body,
        preserveLayout: unit === "BPA"
    }).catch(error => {
        console.error("BPA program list filter error:", error);
        showBpaDashboardError(root, error);
    });
});

document.addEventListener("click", event => {
    const link = event.target.closest("#sidebar a, a[data-app-navigation]");

    if (
        !link ||
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
    ) {
        return;
    }

    event.preventDefault();
    navigateTo(link.href).catch(error => {
        console.error("Page navigation error:", error);
    });
});

let skuFilterTimer = null;
let skuFilterController = null;
let restoringSkuFilterControls = false;

async function updateSkuFilterResults(target, { updateAddress = true, replaceHistory = false } = {}) {
    const form = document.querySelector("[data-sku-filter-form]");
    const page = form?.closest('[data-bpa-list-page="sku"]');
    const table = page?.querySelector(".sku-table-card");
    if (!form || !page || !table) {
        throw new Error("SKU filter results could not be found.");
    }
    const scrollContainer = document.querySelector("#page-content") || page;

    skuFilterController?.abort();
    const controller = new AbortController();
    skuFilterController = controller;
    table.setAttribute("aria-busy", "true");

    try {
        const response = await fetch(`${target.pathname}${target.search}`, {
            signal: controller.signal,
            headers: { "X-Requested-With": "XMLHttpRequest" }
        });
        if (!response.ok) {
            throw new Error(`SKU filter request failed with status ${response.status}.`);
        }

        const markup = await response.text();
        const documentFromResponse = new DOMParser().parseFromString(markup, "text/html");
        const updatedPage = documentFromResponse.querySelector('[data-bpa-list-page="sku"]');
        const updatedForm = updatedPage?.querySelector("[data-sku-filter-form]");
        const updatedTable = updatedPage?.querySelector(".sku-table-card");
        const updatedTitle = updatedPage?.querySelector("[data-sku-year-title]");
        if (!updatedForm || !updatedTable || !updatedTitle) {
            throw new Error("SKU filter response did not contain updated results.");
        }
        if (controller.signal.aborted) return false;

        const scrollTop = scrollContainer.scrollTop;
        page.querySelector("[data-sku-year-title]")?.replaceWith(updatedTitle.cloneNode(true));
        page.querySelector("[data-sku-filter-error]")?.remove();
        const currentSearch = form.querySelector("input[name='q']");
        const updatedSearch = updatedForm.querySelector("input[name='q']");
        if (currentSearch && updatedSearch) currentSearch.value = updatedSearch.value;

        restoringSkuFilterControls = true;
        try {
            form.querySelectorAll("select").forEach(select => {
                const updatedSelect = Array.from(updatedForm.querySelectorAll("select"))
                    .find(option => option.name === select.name);
                if (!updatedSelect) return;

                select.replaceChildren(
                    ...Array.from(updatedSelect.options, option => option.cloneNode(true))
                );
                select.value = updatedSelect.value;
                select.dispatchEvent(new Event("change", { bubbles: true }));
            });
        } finally {
            restoringSkuFilterControls = false;
        }

        updatedTable.classList.add("sku-table-enter");
        table.replaceWith(updatedTable);
        scrollContainer.scrollTop = scrollTop;
        window.requestAnimationFrame(() => {
            if (scrollContainer.isConnected) scrollContainer.scrollTop = scrollTop;
        });

        page.querySelectorAll("a[data-sku-export]").forEach(link => {
            const exportUrl = new URL(link.href, window.location.href);
            exportUrl.search = target.search;
            link.href = exportUrl.href;
        });

        if (updateAddress && target.href !== window.location.href) {
            updateHistory(target, replaceHistory);
        }
        return true;
    } catch (error) {
        if (error.name === "AbortError") return false;
        console.error("SKU filter error:", error);
        const status = document.createElement("div");
        status.className = "alert alert-danger py-2 mb-3";
        status.setAttribute("role", "alert");
        status.dataset.skuFilterError = "";
        status.textContent = "Penapis SKU gagal dimuatkan. Sila cuba lagi.";
        page.querySelector("[data-sku-filter-error]")?.remove();
        page.insertBefore(status, page.querySelector(".sku-table-card"));
        return false;
    } finally {
        if (skuFilterController === controller) {
            skuFilterController = null;
            page.querySelector(".sku-table-card")?.removeAttribute("aria-busy");
        }
    }
}

let budgetFilterTimer = null;
let budgetFilterController = null;
let restoringBudgetFilterControls = false;

async function updateBudgetFilterResults(target, { updateAddress = true, replaceHistory = false } = {}) {
    const form = document.querySelector("[data-budget-filter-form]");
    const page = form?.closest('[data-bpa-list-page="budget"]');
    const summary = page?.querySelector(".budget-summary-cards");
    const table = page?.querySelector(".budget-table-card");
    if (!form || !page || !summary || !table) {
        throw new Error("Budget filter results could not be found.");
    }

    budgetFilterController?.abort();
    const controller = new AbortController();
    budgetFilterController = controller;
    table.setAttribute("aria-busy", "true");

    try {
        const response = await fetch(`${target.pathname}${target.search}`, {
            signal: controller.signal,
            headers: { "X-Requested-With": "XMLHttpRequest" }
        });
        if (!response.ok) {
            throw new Error(`Budget filter request failed with status ${response.status}.`);
        }

        const markup = await response.text();
        const documentFromResponse = new DOMParser().parseFromString(markup, "text/html");
        const updatedPage = documentFromResponse.querySelector('[data-bpa-list-page="budget"]');
        const updatedForm = updatedPage?.querySelector("[data-budget-filter-form]");
        const updatedSummary = updatedPage?.querySelector(".budget-summary-cards");
        const updatedTable = updatedPage?.querySelector(".budget-table-card");
        const updatedTitle = updatedPage?.querySelector("[data-budget-year-title]");
        if (!updatedForm || !updatedSummary || !updatedTable || !updatedTitle) {
            throw new Error("Budget filter response did not contain updated results.");
        }
        if (controller.signal.aborted) return false;

        const scrollTop = page.scrollTop;
        page.querySelector("[data-budget-year-title]")?.replaceWith(updatedTitle.cloneNode(true));
        page.querySelector("[data-budget-filter-error]")?.remove();
        const currentSearch = form.querySelector("input[name='q']");
        const updatedSearch = updatedForm.querySelector("input[name='q']");
        if (currentSearch && updatedSearch) currentSearch.value = updatedSearch.value;

        restoringBudgetFilterControls = true;
        try {
            form.querySelectorAll("select").forEach(select => {
                const updatedSelect = Array.from(updatedForm.querySelectorAll("select"))
                    .find(option => option.name === select.name);
                if (!updatedSelect) return;

                select.replaceChildren(
                    ...Array.from(updatedSelect.options, option => option.cloneNode(true))
                );
                select.value = updatedSelect.value;
                select.dispatchEvent(new Event("change", { bubbles: true }));
            });
        } finally {
            restoringBudgetFilterControls = false;
        }

        summary.replaceWith(updatedSummary);
        animateBpaDashboardKpiNumbers(updatedSummary, ".summary-card .fs-5");
        updatedTable.classList.add("budget-table-enter");
        table.replaceWith(updatedTable);
        page.scrollTop = scrollTop;
        window.requestAnimationFrame(() => {
            if (page.isConnected) page.scrollTop = scrollTop;
        });
        if (updateAddress && target.href !== window.location.href) {
            updateHistory(target, replaceHistory);
        }
        return true;
    } catch (error) {
        if (error.name === "AbortError") return false;
        console.error("Budget filter error:", error);
        const status = document.createElement("div");
        status.className = "alert alert-danger py-2 mb-3";
        status.setAttribute("role", "alert");
        status.dataset.budgetFilterError = "";
        status.textContent = "Penapis bajet gagal dimuatkan. Sila cuba lagi.";
        page.querySelector("[data-budget-filter-error]")?.remove();
        page.insertBefore(status, page.querySelector(".budget-summary-cards"));
        return false;
    } finally {
        if (budgetFilterController === controller) {
            budgetFilterController = null;
            page.querySelector(".budget-table-card")?.removeAttribute("aria-busy");
        }
    }
}

function confirmBpaDelete({ titleText, messageText }) {
    return window.confirmBpaAction({
        titleText,
        messageText,
        confirmText: "Padam"
    });
}

async function deleteBudget(form) {
    if (!await confirmBpaDelete({
        titleText: "Padam bajet?",
        messageText: "Adakah anda pasti mahu memadam bajet ini? Tindakan ini tidak boleh dibuat asal."
    })) return;

    const submitButton = form.querySelector('button[type="submit"]');
    if (submitButton) submitButton.disabled = true;
    let deleted = false;

    try {
        const response = await fetch(form.action || window.location.href, {
            method: "POST",
            body: new FormData(form),
            headers: { "X-Requested-With": "XMLHttpRequest" }
        });
        const result = await response.json();
        if (!response.ok || !result.success) {
            throw new Error(result.message || "Gagal padam bajet.");
        }
        deleted = true;

        const refreshUrl = new URL(window.location.href);
        if (result.fallbackYear !== null && result.fallbackYear !== undefined) {
            refreshUrl.searchParams.set("tahun", String(result.fallbackYear));
        }
        const refreshed = await updateBudgetFilterResults(refreshUrl, {
            updateAddress: refreshUrl.href !== window.location.href
        });
        if (!refreshed) {
            throw new Error("Bajet berjaya dipadam, tetapi senarai gagal dikemas kini.");
        }
        showBpaAppAlert(result.message || "Bajet berjaya dipadam.", "success");
    } catch (error) {
        console.error("Budget delete error:", error);
        showBpaAppAlert(
            deleted
                ? "Bajet berjaya dipadam, tetapi senarai gagal dikemas kini."
                : error.message || "Gagal padam bajet.",
            "danger"
        );
    } finally {
        if (submitButton?.isConnected) submitButton.disabled = false;
    }
}

async function deleteSku(form) {
    if (!await confirmBpaDelete({
        titleText: "Padam SKU?",
        messageText: "Adakah anda pasti mahu memadam SKU ini? Tindakan ini tidak boleh dibuat asal."
    })) return;

    const submitButton = form.querySelector('button[type="submit"]');
    if (submitButton) submitButton.disabled = true;
    let deleted = false;

    try {
        const response = await fetch(form.action || window.location.href, {
            method: "POST",
            body: new FormData(form),
            headers: { "X-Requested-With": "XMLHttpRequest" }
        });
        const result = await response.json();
        if (!response.ok || !result.success) {
            throw new Error(result.message || "Gagal padam SKU.");
        }
        deleted = true;

        const refreshed = await updateSkuFilterResults(new URL(window.location.href), {
            updateAddress: false
        });
        if (!refreshed) {
            throw new Error("SKU berjaya dipadam, tetapi senarai gagal dikemas kini.");
        }
        showBpaAppAlert(result.message || "SKU berjaya dipadam.", "success");
    } catch (error) {
        console.error("SKU delete error:", error);
        showBpaAppAlert(
            deleted
                ? "SKU berjaya dipadam, tetapi senarai gagal dikemas kini."
                : error.message || "Gagal padam SKU.",
            "danger"
        );
    } finally {
        if (submitButton?.isConnected) submitButton.disabled = false;
    }
}

document.addEventListener("input", event => {
    const skuInput = event.target instanceof Element
        ? event.target.closest("[data-sku-filter-form] input[name='q']")
        : null;
    if (skuInput) {
        window.clearTimeout(skuFilterTimer);
        skuFilterTimer = window.setTimeout(() => {
            skuInput.form?.requestSubmit();
        }, 300);
        return;
    }

    const input = event.target instanceof Element
        ? event.target.closest("[data-budget-filter-form] input[name='q']")
        : null;
    if (!input) return;

    window.clearTimeout(budgetFilterTimer);
    budgetFilterTimer = window.setTimeout(() => {
        input.form?.requestSubmit();
    }, 300);
});

document.addEventListener("change", event => {
    const skuControl = event.target instanceof Element
        ? event.target.closest("[data-sku-filter-form] select")
        : null;
    if (skuControl) {
        if (restoringSkuFilterControls) return;
        window.clearTimeout(skuFilterTimer);
        skuControl.form?.requestSubmit();
        return;
    }

    if (restoringBudgetFilterControls) return;
    const control = event.target instanceof Element
        ? event.target.closest("[data-budget-filter-form] select")
        : null;
    if (!control) return;

    window.clearTimeout(budgetFilterTimer);
    control.form?.requestSubmit();
});

document.addEventListener("submit", event => {
    const form = event.target;
    if (form instanceof HTMLFormElement && form.matches("[data-sku-delete-form]")) {
        event.preventDefault();
        deleteSku(form);
        return;
    }

    if (form instanceof HTMLFormElement && form.matches("[data-budget-delete-form]")) {
        event.preventDefault();
        deleteBudget(form);
        return;
    }

    if (form instanceof HTMLFormElement && form.matches("[data-sku-filter-form]")) {
        event.preventDefault();
        window.clearTimeout(skuFilterTimer);
        const target = new URL(form.action || window.location.href, window.location.href);
        target.search = new URLSearchParams(new FormData(form)).toString();
        updateSkuFilterResults(target).catch(error => {
            console.error("SKU filter error:", error);
        });
        return;
    }

    if (!(form instanceof HTMLFormElement) || !form.matches("[data-budget-filter-form]")) return;

    event.preventDefault();
    window.clearTimeout(budgetFilterTimer);
    const target = new URL(form.action || window.location.href, window.location.href);
    target.search = new URLSearchParams(new FormData(form)).toString();
    updateBudgetFilterResults(target).catch(error => {
        console.error("Budget filter error:", error);
    });
});

window.addEventListener("popstate", () => {
    if (bpaAddModal) closeBpaAddModal();
    if (
        window.location.pathname.endsWith("/bpa/admin/sku_list") &&
        document.querySelector("[data-sku-filter-form]")
    ) {
        updateSkuFilterResults(new URL(window.location.href), { updateAddress: false }).catch(error => {
            console.error("SKU filter history error:", error);
        });
        return;
    }
    if (
        window.location.pathname.endsWith("/bpa/admin/bajet_list") &&
        document.querySelector("[data-budget-filter-form]")
    ) {
        updateBudgetFilterResults(new URL(window.location.href), { updateAddress: false }).catch(error => {
            console.error("Budget filter history error:", error);
        });
        return;
    }
    navigateTo(window.location.href, true).catch(error => {
        console.error("Page navigation error:", error);
    });
});

window.addEventListener("app:navigate", event => {
    if (event.detail?.url) {
        navigateTo(event.detail.url).catch(error => {
            console.error("Page navigation error:", error);
        });
    }
});

document.addEventListener("layout:ready", () => {
    layoutReady = true;
    revealInitialPage();
    showBpaPageAlerts();
    updateActiveNavigation(appPathname(window.location.pathname));
    initializeBpaDashboardSwitcher();
    initializeBpaProgramListSwitcher();
});

window.addEventListener("load", () => {
    documentLoaded = true;
    revealInitialPage();
    initializeBpaDashboardSwitcher();
    initializeBpaProgramListSwitcher();
});

beginPageLoading();
updateActiveNavigation(appPathname(window.location.pathname));
