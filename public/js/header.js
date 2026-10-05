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
        title = "Aktiviti";
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

    typeHeaderTitle(titleElement, title.toUpperCase());

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


function getUserColor(name) {
    const characters = Array.from(String(name || ""));
    if (!characters.length) return "#808080";

    let hueX = 0;
    let hueY = 0;
    let lightness = 0;
    for (const character of String(name || "")) {
        const codePoint = character.codePointAt(0);
        const hue = (codePoint + 289.52682070142566) % 360;
        const saturation = 86 + (codePoint % 5) - 2;
        const radians = hue * Math.PI / 180;
        hueX += saturation * Math.cos(radians);
        hueY += saturation * Math.sin(radians);
        lightness += 57 + (codePoint % 13);
    }

    const blendedHue = (Math.atan2(hueY, hueX) * 180 / Math.PI + 360) % 360;
    const blendedSaturation = Math.hypot(hueX, hueY) / characters.length;
    const blendedLightness = lightness / characters.length;
    const chroma = (1 - Math.abs(2 * blendedLightness / 100 - 1)) * blendedSaturation / 100;
    const hueSegment = blendedHue / 60;
    const secondComponent = chroma * (1 - Math.abs(hueSegment % 2 - 1));
    const match = blendedLightness / 100 - chroma / 2;
    const channels = hueSegment < 1 ? [chroma, secondComponent, 0]
        : hueSegment < 2 ? [secondComponent, chroma, 0]
            : hueSegment < 3 ? [0, chroma, secondComponent]
                : hueSegment < 4 ? [0, secondComponent, chroma]
                    : hueSegment < 5 ? [secondComponent, 0, chroma]
                        : [chroma, 0, secondComponent];

    return `#${channels.map(channel =>
        Math.round((channel + match) * 255).toString(16).padStart(2, "0")
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

            console.log("Account clicked");
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
            userIcon.style.backgroundColor = getUserColor(displayName);
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