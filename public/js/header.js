async function initHeader() {
    updatePageInfo();
    setupSidebarToggle();
    setupUserDropdown();
    setupTableTooltips();
    await loadCurrentUser();
}

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
    } else if (path === "/upload") {
        title = "Muat Naik";
    } else if (path === "/data-set") {
        title = "Set Data";
    } else if (path.startsWith("/data-set/")) {
        title = "Paparan Set Data";
    } else if (path === "/user") {
        title = "Aktiviti Pengguna";
    } else if (path === "/account") {
        title = "Akaun Pengguna";
    } else if (path === "/updates") {
        title = "Log Perisian";
    } else if (path === "/peserta-program") {
        title = "Peserta Program";
    } else if (path === "/penerima-bantuan") {
        title = "Penerima Bantuan";
    } else if (path === "/create-account") {
        title = "Cipta Akaun";
    }

    const titleElement =
        document.getElementById("pageTitle");

    const breadcrumbElement =
        document.getElementById("pageBreadcrumb");

    if (titleElement) {
        titleElement.textContent = title.toUpperCase();
    }

    if (breadcrumbElement) {
        breadcrumbElement.textContent = breadcrumb;
    }

    document.title = title;
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

    const updatesButton =
        document.getElementById("updatesButton");

    const logoutButton =
        document.getElementById("logoutButton");

    if (!dropdown || !button) {
        return;
    }

    if (button.dataset.dropdownBound === "true") {
        return;
    }

    button.dataset.dropdownBound = "true";

    button.addEventListener("click", event => {
        event.stopPropagation();

        dropdown.classList.toggle("open");

        button.setAttribute(
            "aria-expanded",
            dropdown.classList.contains("open")
        );
    });

    document.addEventListener("click", event => {
        if (!dropdown.contains(event.target)) {
            dropdown.classList.remove("open");

            button.setAttribute(
                "aria-expanded",
                "false"
            );
        }
    });

    if (accountButton) {
        accountButton.addEventListener("click", () => {
            dropdown.classList.remove("open");
            const accountUrl = typeof window.appUrl === "function" ? window.appUrl("/account") : "/account";
            if (typeof window.appUrl === "function") {
                window.dispatchEvent(new CustomEvent("app:navigate", { detail: { url: accountUrl } }));
            } else {
                window.location.assign(accountUrl);
            }
        });
    }

    if (updatesButton) {
        updatesButton.addEventListener("click", () => {
            dropdown.classList.remove("open");
            const updatesUrl = typeof window.appUrl === "function" ? window.appUrl("/updates") : "/updates";
            if (typeof window.appUrl === "function") {
                window.dispatchEvent(new CustomEvent("app:navigate", { detail: { url: updatesUrl } }));
            } else {
                window.location.assign(updatesUrl);
            }
        });
    }

    if (logoutButton) {
        logoutButton.addEventListener("click", logout);
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
        ? window.appUrl("/login")
        : "/login";
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
                displayName;
        }

        if (userName) {
            userName.textContent =
                data.username;
        }

        if (userIcon) {
            const color = window.getTextAverageColor(displayName);
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
        if (path !== "/login") {
            window.location.replace(
                typeof window.appUrl === "function"
                    ? window.appUrl("/login")
                    : "/login"
            );
        }
    }
}


window.initHeader = initHeader;
initHeader();