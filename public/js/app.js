const appPathname = pathname =>
    typeof window.appPathname === "function"
        ? window.appPathname(pathname)
        : pathname;

const pageContent =
    document.getElementById("page-content");
const dashboardNode =
    appPathname(window.location.pathname) === "/"
        ? pageContent?.firstElementChild
        : null;
const pageCache = new Map();
let documentLoaded = document.readyState === "complete";
let layoutReady = false;
let tableHeaderDrag = null;
let suppressTableHeaderClick = null;
const customSelectPortalMenus = new WeakMap();
const customSelectPortalPositions = new WeakMap();

document.addEventListener("click", event => {
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
            ".search-toolbar-group .audit-calendar-menu.show"
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
        wrapper.scrollWidth <= wrapper.clientWidth ||
        event.target.closest("button, input, select, textarea, a")
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
    menu.classList.remove("custom-select-menu-portal", "recipient-add-select-menu");
    menu.style.removeProperty("left");
    menu.style.removeProperty("top");
    menu.style.removeProperty("bottom");
    menu.style.removeProperty("width");
    menu.style.removeProperty("max-height");
    wrapper.insertBefore(menu, select);
}

function positionCustomSelectPortal(menu, button) {
    const bounds = button.getBoundingClientRect();
    const menuHeight = Math.min(260, menu.children.length * 34 + 12);
    const availableBelow = Math.max(0, window.innerHeight - bounds.bottom - 8);
    const availableAbove = Math.max(0, bounds.top - 8);
    const dropUp = availableBelow < menuHeight && availableAbove > availableBelow;
    const available = dropUp ? availableAbove : availableBelow;
    menu.style.left = `${bounds.left}px`;
    menu.style.width = `${bounds.width}px`;
    menu.style.maxHeight = `${Math.max(60, Math.min(260, available))}px`;
    menu.style.top = dropUp ? "auto" : `${bounds.bottom + 7}px`;
    menu.style.bottom = dropUp ? `${window.innerHeight - bounds.top + 7}px` : "auto";
}

function initializeCustomSelects() {

    document.querySelectorAll("select").forEach(select => {
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

        const menu = document.createElement("div");
        menu.className = "custom-select-menu";
        menu.setAttribute("role", "listbox");

        const syncButton = () => {
            const option = select.options[select.selectedIndex];
            button.textContent = option?.textContent || "";
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
            event.stopPropagation();
            document.querySelectorAll(".custom-select.show").forEach(open => {
                if (open !== wrapper) {
                    closeCustomSelect(open);
                }
            });
            const opening = !wrapper.classList.contains("show");
            if (!opening) {
                closeCustomSelect(wrapper);
                return;
            }
            wrapper.classList.add("show");
            button.setAttribute("aria-expanded", "true");
            if (wrapper.closest("#recipientAddCard")) {
                menu.classList.add("custom-select-menu-portal", "recipient-add-select-menu");
                document.body.appendChild(menu);
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
            } else {
                const card = wrapper.closest(".dataset-upload-card.dataset-add-card");
                if (card) {
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
            }
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

function revealInitialPage() {
    if (pageContent && documentLoaded && layoutReady) {
        pageContent.classList.add("is-visible");
    }
}

function wait(milliseconds) {
    return new Promise(resolve => window.setTimeout(resolve, milliseconds));
}

function nextFrame() {
    return new Promise(resolve => window.requestAnimationFrame(() => resolve()));
}

async function replacePageContent(update) {
    if (!pageContent) {
        update();
        return;
    }

    pageContent.classList.remove("is-visible");
    await wait(160);
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
                : pathname.startsWith("/data-set")
                    ? "upload"
                    : pathname === "/upload"
                        ? "upload"
                        : pathname === "/peserta-program"
                            ? "peserta-program"
                            : pathname === "/penerima-bantuan"
                                ? "penerima-bantuan"
                            : pathname === "/user"
                            ? "user"
                            : "";

        item.classList.toggle(
            "active",
            item.dataset.page === page
        );
    });
}

function updateHistory(target, replace) {
    if (replace) {
        window.history.replaceState({}, "", target.href);
    } else {
        window.history.pushState({}, "", target.href);
    }
}

async function notifyPageLoaded() {
    document.dispatchEvent(new Event("app:page-loaded"));
    initializeCustomSelects();

    if (typeof window.initHeader === "function") {
        await window.initHeader();
    }
}

async function navigateTo(url, replace = false) {
    const target = new URL(url, window.location.origin);
    if (
        window.APP_BASE_PATH &&
        target.origin === window.location.origin &&
        target.pathname !== window.APP_BASE_PATH &&
        !target.pathname.startsWith(`${window.APP_BASE_PATH}/`)
    ) {
        target.pathname = window.appUrl(target.pathname);
    }
    const targetPathname = appPathname(target.pathname);
    const supported =
        targetPathname === "/" ||
        targetPathname === "/data-set" ||
        targetPathname.startsWith("/data-set/") ||
        targetPathname === "/upload" ||
        targetPathname === "/peserta-program" ||
        targetPathname === "/penerima-bantuan" ||
        targetPathname === "/user" ||
        targetPathname === "/account" ||
        targetPathname === "/updates";

    if (
        target.origin !== window.location.origin ||
        !supported
    ) {
        window.location.assign(target.href);
        return;
    }

    if (typeof window.hasUnsavedTableChanges === "function" && window.hasUnsavedTableChanges()) {
        if (!window.confirm("Terdapat perubahan yang belum disimpan. Teruskan ke halaman lain?")) return;
        if (typeof window.resetTableState === "function") window.resetTableState();
    }

    if (targetPathname === "/" && dashboardNode) {
        await replacePageContent(() => pageContent.replaceChildren(dashboardNode));
        updateHistory(target, replace);
        updateActiveNavigation(targetPathname);
        await notifyPageLoaded();
        await revealPageContent();
        return;
    }

    const cacheKey = target.pathname + target.search;
    let markup = pageCache.get(cacheKey);

    if (!markup) {
        const response = await fetch(
            target.pathname + target.search,
            {
                headers: {
                    "X-App-Fragment": "true"
                }
            }
        );

        if (!response.ok) {
            throw new Error(`Page HTTP ${response.status}`);
        }

        const fragment = await response.text();
        const parsed = new DOMParser().parseFromString(
            fragment,
            "text/html"
        );
        const main = parsed.querySelector("main.main-content");

        if (!main) {
            throw new Error("Page fragment is missing main content.");
        }

        markup = main.innerHTML;
        pageCache.set(cacheKey, markup);
    }

    await replacePageContent(() => {
        pageContent.innerHTML = markup;
    });
    updateHistory(target, replace);
    updateActiveNavigation(targetPathname);

    await notifyPageLoaded();
    await revealPageContent();
}

document.addEventListener("click", event => {
    const link = event.target.closest("#sidebar a");

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

window.addEventListener("popstate", () => {
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
    updateActiveNavigation(appPathname(window.location.pathname));
});

window.addEventListener("load", () => {
    documentLoaded = true;
    revealInitialPage();
});

updateActiveNavigation(appPathname(window.location.pathname));
