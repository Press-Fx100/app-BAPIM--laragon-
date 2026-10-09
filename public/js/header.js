async function initHeader() {
    updatePageInfo();
    setupSidebarToggle();
    setupUserDropdown();
    setupTableTooltips();
    await loadCurrentUser();
}

window.appCurrentUser = window.appCurrentUser || null;

function canAccessAppPage(page) {
    const user = window.appCurrentUser;
    if (!user) return false;
    if (Number(user.accessLevel) === 0) return true;
    return user.permissions?.[page]?.access === true;
}

function canEditAppPage(page) {
    const user = window.appCurrentUser;
    if (!user) return false;
    if (Number(user.accessLevel) === 0) {
        return ["recipients", "participants", "upload", "dataset", "account", "manageUsers"].includes(page);
    }
    if (Number(user.accessLevel) >= 3) return false;
    return canAccessAppPage(page) && user.permissions?.[page]?.edit === true;
}

function pagePermissionForPath(path) {
    if (path === "/") return "dashboard";
    if (path === "/penerima-bantuan") return "recipients";
    if (path === "/peserta-program") return "participants";
    if (path === "/muat-naik") return "upload";
    if (path === "/set-data" || path.startsWith("/set-data/")) return "dataset";
    if (path === "/aktiviti-pengguna") return "activity";
    if (path === "/akaun-pengguna") return "account";
    if (path === "/log-perisian") return "updates";
    if (path === "/pengurusan-pengguna") return "manageUsers";
    return null;
}

function getPermissionTableCell(target) {
    if (!(target instanceof Element)) return null;
    return target.closest(
        ".dataset-table .excel-cell, .recipient-table td[data-row][data-col]"
    );
}

function applyAppPermissions() {
    if (!window.appCurrentUser) return;
    document.querySelectorAll("[data-access-page]").forEach(element => {
        element.hidden = !canAccessAppPage(element.dataset.accessPage);
    });
    document.querySelectorAll("[data-permission-edit]").forEach(element => {
        element.hidden = !canEditAppPage(element.dataset.permissionEdit);
    });
    document.querySelectorAll("[data-permission-upload]").forEach(element => {
        element.hidden = !canEditAppPage(element.dataset.permissionUpload);
    });
    const updateButton = document.querySelector("#sidebar .update-check-button");
    if (updateButton) {
        updateButton.hidden = Number(window.appCurrentUser.accessLevel) !== 0;
    }
    const path = typeof window.appPathname === "function"
        ? window.appPathname(window.location.pathname)
        : window.location.pathname;
    const page = pagePermissionForPath(path);
    const readOnly = page !== null && !canEditAppPage(page);
    document.body.classList.toggle("permission-read-only", readOnly);
    if (readOnly) {
        document.querySelectorAll(
            ".dataset-table td.selected-cell, .dataset-table td.active-cell"
        ).forEach(cell => cell.classList.remove("selected-cell", "active-cell"));
    }
}

window.canAccessAppPage = canAccessAppPage;
window.canEditAppPage = canEditAppPage;
window.applyAppPermissions = applyAppPermissions;
document.addEventListener("app:page-loaded", applyAppPermissions);
document.addEventListener("dblclick", event => {
    const cell = getPermissionTableCell(event.target);
    const path = typeof window.appPathname === "function"
        ? window.appPathname(window.location.pathname)
        : window.location.pathname;
    const page = pagePermissionForPath(path);
    if (!cell || !page || canEditAppPage(page)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
}, true);
document.addEventListener("mousedown", event => {
    const cell = getPermissionTableCell(event.target);
    const path = typeof window.appPathname === "function"
        ? window.appPathname(window.location.pathname)
        : window.location.pathname;
    const page = pagePermissionForPath(path);
    if (
        !cell ||
        !page ||
        canEditAppPage(page) ||
        event.target.closest("button, a, input, select, textarea")
    ) return;
    event.stopImmediatePropagation();
}, true);
document.addEventListener("keydown", event => {
    const cell = getPermissionTableCell(event.target);
    const path = typeof window.appPathname === "function"
        ? window.appPathname(window.location.pathname)
        : window.location.pathname;
    const page = pagePermissionForPath(path);
    if (!cell || !page || canEditAppPage(page)) return;
    event.stopImmediatePropagation();
}, true);
document.addEventListener("paste", event => {
    const cell = getPermissionTableCell(event.target);
    const path = typeof window.appPathname === "function"
        ? window.appPathname(window.location.pathname)
        : window.location.pathname;
    const page = pagePermissionForPath(path);
    if (!cell || !page || canEditAppPage(page)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
}, true);

function setupSidebarToggle() {
    const button = document.getElementById("sidebarToggle");

    if (!button || button.dataset.initialized === "true") {
        return;
    }

    button.dataset.initialized = "true";
    let stateTimer;
    let labelTimer;
    const collapsed = localStorage.getItem("sidebarCollapsed") === "true";

    document.body.classList.toggle("sidebar-collapsed", collapsed);
    document.body.classList.remove("sidebar-labels-hidden");
    button.setAttribute("aria-expanded", String(!collapsed));
    button.setAttribute("aria-label", collapsed ? "Buka menu" : "Tutup menu");

    button.addEventListener("click", () => {
        const isCollapsed =
            document.body.classList.contains("sidebar-collapsed");

        if (isCollapsed) {
            document.body.classList.add("sidebar-opening");
            document.body.classList.add("sidebar-labels-hidden");
            document.body.offsetWidth;
            document.body.classList.remove("sidebar-collapsed");
            localStorage.setItem("sidebarCollapsed", "false");
            button.setAttribute("aria-expanded", "true");
            button.setAttribute("aria-label", "Tutup menu");
            window.clearTimeout(stateTimer);
            window.clearTimeout(labelTimer);
            labelTimer = window.setTimeout(() => {
                document.body.classList.remove("sidebar-opening");
                document.body.classList.remove("sidebar-labels-hidden");
            }, 260);
            return;
        }

        document.body.classList.add("sidebar-labels-hidden");
        button.setAttribute("aria-expanded", "false");
        button.setAttribute("aria-label", "Buka menu");

        window.clearTimeout(stateTimer);
        window.clearTimeout(labelTimer);
        stateTimer = window.setTimeout(() => {
            if (
                document.body.classList.contains("sidebar-labels-hidden") &&
                !document.body.classList.contains("sidebar-collapsed")
            ) {
                document.body.classList.add("sidebar-collapsed");
                localStorage.setItem("sidebarCollapsed", "true");
            }
        }, 120);

        labelTimer = window.setTimeout(() => {
            document.body.classList.remove("sidebar-labels-hidden");
        }, 380);
    });
}

function setupTableTooltips() {
    document.addEventListener("mouseover", event => {
        const cell = event.target.closest(
            ".dataset-table td, .dashboard-table td, .analysis-table td"
        );

        if (!cell || cell.scrollWidth <= cell.clientWidth) {
            return;
        }

        cell.title = cell.textContent.trim();
    });
}

function updatePageInfo() {
    const path = typeof window.appPathname === "function"
        ? window.appPathname(window.location.pathname)
        : window.location.pathname;

    let title = "Papan Pemuka";
    const breadcrumb = "SISTEM PENGURUSAN DATA";

    if (path === "/") {
        title = "Papan Pemuka";
    } else if (path === "/muat-naik") {
        title = "Muat Naik";
    } else if (path === "/set-data") {
        title = "Set Data";
    } else if (path.startsWith("/set-data/")) {
        title = "Paparan Set Data";
    } else if (path === "/aktiviti-pengguna") {
        title = "Aktiviti Pengguna";
    } else if (path === "/akaun-pengguna") {
        title = "Akaun Pengguna";
    } else if (path === "/pengurusan-pengguna") {
        title = "Pengurusan Pengguna";
    } else if (path === "/log-perisian") {
        title = "Log Perisian";
    } else if (path === "/peserta-program") {
        title = "Peserta Program";
    } else if (path === "/penerima-bantuan") {
        title = "Penerima Bantuan";
    } else if (path === "/cipta-akaun") {
        title = "Cipta Akaun";
    }

    const titleElement =
        document.getElementById("pageTitle");

    const breadcrumbElement =
        document.getElementById("pageBreadcrumb");

    if (titleElement) {
        typeHeaderTitle(titleElement, title.toUpperCase());
    }

    if (breadcrumbElement) {
        breadcrumbElement.textContent = breadcrumb;
    }

    document.title = title;
}

function typeHeaderTitle(element, text) {
    if (!element || element.textContent === text) {
        return;
    }

    const run = Number(element.dataset.typingRun || "0") + 1;
    element.dataset.typingRun = String(run);
    element.classList.add("is-typing");
    element.textContent = "";

    let index = 0;
    const typeNextCharacter = () => {
        if (run !== Number(element.dataset.typingRun)) {
            return;
        }

        element.textContent = text.slice(0, index + 1);
        index += 1;

        if (index < text.length) {
            window.setTimeout(typeNextCharacter, 24);
        } else {
            element.classList.remove("is-typing");
        }
    };

    typeNextCharacter();
}


function getUserColorBackground(color) {
    return `#${[1, 3, 5].map(offset => {
        const channel = parseInt(color.slice(offset, offset + 2), 16);
        return Math.round(channel + (255 - channel) * 0.85)
            .toString(16)
            .padStart(2, "0");
    }).join("").toUpperCase()}`;
}

function getUserColorText(color) {
    return `#${[1, 3, 5].map(offset =>
        Math.round(parseInt(color.slice(offset, offset + 2), 16) * 0.72)
            .toString(16)
            .padStart(2, "0")
    ).join("").toUpperCase()}`;
}


/* ==========================================
   USER DROPDOWN
   ========================================== */

function setupUserDropdown() {
    const dropdown =
        document.getElementById("userDropdown");

    const button =
        document.getElementById("userDropdownButton");

    const accountButton =
        document.getElementById("accountButton");

    const manageUsersButton =
        document.getElementById("manageUsersButton");

    const updatesButton =
        document.getElementById("updatesButton");

    const logoutButton =
        document.getElementById("logoutButton");
    const menu =
        document.getElementById("userDropdownMenu");

    if (!dropdown || !button) {
        return;
    }

    if (button.dataset.dropdownBound === "true") {
        return;
    }

    button.dataset.dropdownBound = "true";

    const closeDropdown = () => {
        dropdown.classList.remove("open");
        button.setAttribute("aria-expanded", "false");
        menu?.setAttribute("aria-hidden", "true");
    };

    button.addEventListener("click", event => {
        event.stopPropagation();

        const isOpen = dropdown.classList.toggle("open");

        button.setAttribute("aria-expanded", String(isOpen));
        menu?.setAttribute("aria-hidden", String(!isOpen));
    });

    document.addEventListener("click", event => {
        if (!dropdown.contains(event.target)) {
            closeDropdown();
        }
    });

    dropdown.addEventListener("keydown", event => {
        if (event.key === "Escape" && dropdown.classList.contains("open")) {
            closeDropdown();
            button.focus();
        }
    });

    if (accountButton) {
        accountButton.addEventListener("click", () => {
            closeDropdown();
            const accountUrl = typeof window.appUrl === "function" ? window.appUrl("/akaun-pengguna") : "/akaun-pengguna";
            if (typeof window.appUrl === "function") {
                window.dispatchEvent(new CustomEvent("app:navigate", { detail: { url: accountUrl } }));
            } else {
                window.location.assign(accountUrl);
            }
        });
    }

    if (manageUsersButton) {
        manageUsersButton.addEventListener("click", () => {
            closeDropdown();
            const usersUrl = typeof window.appUrl === "function" ? window.appUrl("/pengurusan-pengguna") : "/pengurusan-pengguna";
            if (typeof window.appUrl === "function") {
                window.dispatchEvent(new CustomEvent("app:navigate", { detail: { url: usersUrl } }));
            } else {
                window.location.assign(usersUrl);
            }
        });
    }

    if (updatesButton) {
        updatesButton.addEventListener("click", () => {
            closeDropdown();
            const updatesUrl = typeof window.appUrl === "function" ? window.appUrl("/log-perisian") : "/log-perisian";
            if (typeof window.appUrl === "function") {
                window.dispatchEvent(new CustomEvent("app:navigate", { detail: { url: updatesUrl } }));
            } else {
                window.location.assign(updatesUrl);
            }
        });
    }

    if (logoutButton) {
        logoutButton.addEventListener("click", () => {
            closeDropdown();
            logout();
        });
    }
}


/* ==========================================
   LOGOUT
   ========================================== */

async function logout() {
    try {
        const response =
            await fetch("/api/auth/logout", {
                method: "POST"
            });

        if (!response.ok) {
            throw new Error("Logout failed");
        }

    } catch (error) {
        console.error(
            "Logout error:",
            error
        );
    }

    localStorage.removeItem("loggedInUser");
    localStorage.removeItem("displayName");

    window.location.href = typeof window.appUrl === "function"
        ? window.appUrl("/log-masuk")
        : "/log-masuk";
}


/* ==========================================
   LOAD CURRENT USER
   ========================================== */

async function loadCurrentUser() {
    const userDisplayName =
        document.getElementById("userDisplayName");

    const userName =
        document.getElementById("userName");

    const userIcon =
        document.getElementById("userIcon");

    try {
        const response =
            await fetch("/api/auth/me", {
                method: "GET",
                cache: "no-store"
            });

        if (!response.ok) {
            throw new Error("Not authenticated");
        }

        const data =
            await response.json();

        if (!data.success || !data.username) {
            throw new Error("Invalid session");
        }

        const displayName =
            data.displayName ||
            data.username;

        if (userDisplayName) {
            userDisplayName.textContent =
                displayName.toLocaleUpperCase();
        }

        if (userName) {
            userName.textContent =
                data.username;
        }

        window.appCurrentUser = {
            username: data.username,
            displayName: displayName.toLocaleUpperCase(),
            accessLevel: Number(data.accessLevel ?? 2),
            permissions: data.permissions || {}
        };
        applyAppPermissions();

        if (userIcon) {
            const color = window.getInverseTextAverageColor(data.username);
            userIcon.style.backgroundColor = getUserColorBackground(color);
            userIcon.style.color = getUserColorText(color);
        }

    } catch (error) {
        console.error(
            "Failed to load current user:",
            error
        );

        localStorage.removeItem("loggedInUser");
        localStorage.removeItem("displayName");
        localStorage.removeItem("loginSession");

        const path = typeof window.appPathname === "function"
            ? window.appPathname(window.location.pathname)
            : window.location.pathname;
        if (path !== "/log-masuk") {
            window.location.replace(
                typeof window.appUrl === "function"
                    ? window.appUrl("/log-masuk")
                    : "/log-masuk"
            );
        }
    }
}


window.initHeader = initHeader;
initHeader();