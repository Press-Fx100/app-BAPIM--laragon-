const accountSelection =
    document.getElementById("accountSelection");

const accountList =
    document.getElementById("accountList");

const loginFormSection =
    document.getElementById("loginFormSection");

const loginForm =
    document.getElementById("loginForm");

const usernameInput =
    document.getElementById("username");

const passwordInput =
    document.getElementById("password");

const loginButton =
    document.getElementById("loginButton");

const showLoginButton =
    document.getElementById("showLoginButton");

const backToAccountsButton =
    document.getElementById("backToAccountsButton");

const message =
    document.getElementById("message");

let cachedUsers = [];


// ============================================================
// INITIALIZE
// ============================================================

document.addEventListener(
    "DOMContentLoaded",
    startLogin
);


// ============================================================
// START LOGIN
// ============================================================

async function startLogin() {
    clearMessage();

    console.log("[AUTH] Connecting...");

    try {
        const response = await fetch(
            "/api/auth/start",
            {
                method: "GET",
                cache: "no-store",
                headers: {
                    "Cache-Control": "no-cache"
                }
            }
        );

        if (!response.ok) {
            console.log(
                "[AUTH] Server connection failed."
            );

            showLoginForm();
            return;
        }

        const data =
            await response.json();

        if (!data.success) {
            console.log(
                "[AUTH] Authentication service unavailable."
            );

            showLoginForm();
            return;
        }

        console.log(
            "[AUTH] Connected."
        );

        console.log("[AUTH] Local MySQL authentication is available.");

        cachedUsers =
            Array.isArray(data.users)
                ? data.users
                : [];

        if (cachedUsers.length > 0) {
            console.log(
                `[AUTH] ${cachedUsers.length} cached account(s) found.`
            );

            showAccountSelection();
        } else {
            console.log(
                "[AUTH] No cached accounts found."
            );

            showLoginForm();
        }

    } catch (error) {
        console.error(
            "[AUTH] Connection error:",
            error
        );

        console.log(
            "[AUTH] Unable to connect to authentication service."
        );

        showLoginForm();
    }
}


// ============================================================
// SHOW ACCOUNT SELECTION
// ============================================================

function showAccountSelection() {
    if (!accountSelection || !loginFormSection) {
        return;
    }

    loginFormSection.hidden = true;
    accountSelection.hidden = false;

    if (backToAccountsButton) {
        backToAccountsButton.hidden = false;
    }

    renderAccounts();
}


// ============================================================
// SHOW LOGIN FORM
// ============================================================

function showLoginForm() {
    if (!accountSelection || !loginFormSection) {
        return;
    }

    accountSelection.hidden = true;
    loginFormSection.hidden = false;

    if (backToAccountsButton) {
        backToAccountsButton.hidden =
            cachedUsers.length === 0;
    }

    if (usernameInput) {
        usernameInput.focus();
    }
}


// ============================================================
// RENDER CACHED ACCOUNTS
// ============================================================

function renderAccounts() {
    if (!accountList) {
        return;
    }

    accountList.innerHTML = "";

    if (!cachedUsers.length) {
        showLoginForm();
        return;
    }

    cachedUsers.forEach(user => {
        const username =
            String(
                user.username || ""
            ).trim();

        const displayName =
            String(
                user.displayName ||
                username
            ).trim();

        if (!username) {
            return;
        }

        const accountButton =
            document.createElement("div");

        accountButton.className =
            "account-button";

        const initial =
            displayName
                .charAt(0)
                .toUpperCase() || "?";

        accountButton.innerHTML = `
            <span class="account-icon">
                ${escapeHtml(initial)}
            </span>

            <span class="account-details">
                <span class="account-name">
                    ${escapeHtml(displayName)}
                </span>

                <span class="account-username">
                    ${escapeHtml(username)}
                </span>
            </span>

            <button
                type="button"
                class="remove-account-button"
                title="Buang akaun"
                aria-label="Buang akaun ${escapeHtml(username)}"
            >
                <i class="bi bi-x-lg" aria-hidden="true"></i>
            </button>
        `;

        const removeButton =
            accountButton.querySelector(
                ".remove-account-button"
            );

        accountButton.addEventListener(
            "click",
            event => {
                if (
                    event.target.closest(
                        ".remove-account-button"
                    )
                ) {
                    return;
                }

                loginWithCachedAccount(
                    username,
                    accountButton
                );
            }
        );

        if (removeButton) {
            removeButton.addEventListener(
                "click",
                event => {
                    event.stopPropagation();

                    removeCachedAccount(
                        username,
                        accountButton,
                        removeButton
                    );
                }
            );
        }

        accountList.appendChild(
            accountButton
        );
    });
}


// ============================================================
// REMOVE CACHED ACCOUNT
// ============================================================

async function removeCachedAccount(
    username,
    accountElement,
    removeButton
) {
    if (!username) {
        return;
    }

    const confirmed =
        window.confirm(
            `Buang akaun "${username}" daripada komputer ini?`
        );

    if (!confirmed) {
        return;
    }

    if (removeButton) {
        removeButton.disabled = true;
    }

    console.log(
        `[AUTH] Removing cached account: ${username}`
    );

    try {
        const response = await fetch(
            `/api/auth/users/${encodeURIComponent(username)}`,
            {
                method: "DELETE",
                cache: "no-store"
            }
        );

        const data =
            await response.json();

        if (
            !response.ok ||
            !data.success
        ) {
            console.log(
                `[AUTH] Failed to remove account: ${username}`
            );

            showMessage(
                data.error ||
                "Gagal membuang akaun.",
                "error"
            );

            if (removeButton) {
                removeButton.disabled = false;
            }

            return;
        }

        console.log(
            `[AUTH] Account removed: ${username}`
        );

        cachedUsers =
            cachedUsers.filter(
                user =>
                    user.username !== username
            );

        if (accountElement) {
            accountElement.remove();
        }

        clearMessage();

        if (!cachedUsers.length) {
            showLoginForm();
        }

    } catch (error) {
        console.error(
            "[AUTH] Remove account error:",
            error
        );

        showMessage(
            "Tidak dapat membuang akaun.",
            "error"
        );

        if (removeButton) {
            removeButton.disabled = false;
        }
    }
}


// ============================================================
// LOGIN USING CACHED ACCOUNT
// ============================================================

async function loginWithCachedAccount(
    username,
    accountElement
) {
    if (!username) {
        return;
    }

    clearMessage();

    console.log(
        `[AUTH] Connecting as ${username}...`
    );

    setAccountButtonsDisabled(true);

    try {
        const response = await fetch(
            "/api/auth/offline-login",
            {
                method: "POST",
                cache: "no-store",
                headers: {
                    "Content-Type":
                        "application/json"
                },
                body: JSON.stringify({
                    username
                })
            }
        );

        const data =
            await response.json();

        if (
            !response.ok ||
            !data.success
        ) {
            console.log(
                `[AUTH] Login failed for ${username}.`
            );

            showMessage(
                data.error ||
                "Log masuk gagal.",
                "error"
            );

            setAccountButtonsDisabled(false);

            return;
        }

        if (data.online) {
            console.log(
                "[AUTH] Firestore connected."
            );
        } else {
            console.log(
                "[AUTH] Logged in using cached account."
            );
        }

        console.log(
            `[AUTH] Welcome ${data.displayName || username}.`
        );

        loginSuccess(data);

    } catch (error) {
        console.error(
            "[AUTH] Cached account login error:",
            error
        );

        showMessage(
            "Tidak dapat memproses log masuk.",
            "error"
        );

        setAccountButtonsDisabled(false);
    }
}


// ============================================================
// NORMAL LOGIN
// ============================================================

async function handleLogin(event) {
    event.preventDefault();

    clearMessage();

    const username =
        usernameInput
            ? usernameInput.value.trim()
            : "";

    const password =
        passwordInput
            ? passwordInput.value
            : "";

    if (!username || !password) {
        showMessage(
            "Sila masukkan nama pengguna dan kata laluan.",
            "error"
        );

        return;
    }

    if (loginButton) {
        loginButton.disabled = true;
        loginButton.textContent =
            "Log masuk...";
    }

    console.log(
        `[AUTH] Connecting as ${username}...`
    );

    try {
        const response = await fetch(
            "/api/auth/login",
            {
                method: "POST",
                cache: "no-store",
                headers: {
                    "Content-Type":
                        "application/json"
                },
                body: JSON.stringify({
                    username,
                    password
                })
            }
        );

        const data =
            await response.json();

        if (
            !response.ok ||
            !data.success
        ) {
            console.log(
                `[AUTH] Login failed for ${username}.`
            );

            showMessage(
                data.error ||
                "Nama pengguna atau kata laluan tidak sah.",
                "error"
            );

            if (loginButton) {
                loginButton.disabled = false;
                loginButton.textContent =
                    "Log Masuk";
            }

            return;
        }

        console.log(
            "[AUTH] Login successful."
        );

        console.log(
            `[AUTH] Welcome ${data.displayName || username}.`
        );

        loginSuccess(data);

    } catch (error) {
        console.error(
            "[AUTH] Login error:",
            error
        );

        showMessage(
            "Tidak dapat menyambung ke pelayan.",
            "error"
        );

        if (loginButton) {
            loginButton.disabled = false;
            loginButton.textContent =
                "Log Masuk";
        }
    }
}


// ============================================================
// LOGIN SUCCESS
// ============================================================

async function loginSuccess(data) {
    const username =
        data.username || "";

    const displayName =
        data.displayName ||
        username;

    if (!username) {
        showMessage(
            "Maklumat pengguna tidak sah.",
            "error"
        );
        return;
    }

    try {
        const response =
            await fetch("/api/auth/session", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    username
                })
            });

        const sessionData =
            await response.json();

        if (
            !response.ok ||
            !sessionData.success
        ) {
            showMessage(
                sessionData.error ||
                "Gagal mencipta sesi.",
                "error"
            );
            return;
        }

        localStorage.setItem(
            "loggedInUser",
            username
        );

        localStorage.setItem(
            "displayName",
            displayName
        );

        localStorage.setItem(
            "loginSession",
            "active"
        );

        console.log(
            `[AUTH] Welcome ${displayName}.`
        );

        window.location.replace(
            typeof window.appUrl === "function" ? window.appUrl("/") : "/"
        );

    } catch (error) {
        console.error(
            "[AUTH] Session error:",
            error
        );

        showMessage(
            "Gagal mencipta sesi log masuk.",
            "error"
        );
    }
}


// ============================================================
// DISABLE ACCOUNT BUTTONS
// ============================================================

function setAccountButtonsDisabled(
    disabled
) {
    if (accountList) {
        const buttons =
            accountList.querySelectorAll(
                ".account-button"
            );

        buttons.forEach(button => {
            button.style.pointerEvents =
                disabled ? "none" : "";

            button.style.opacity =
                disabled ? "0.6" : "";
        });
    }

    if (showLoginButton) {
        showLoginButton.disabled =
            disabled;
    }
}


// ============================================================
// MESSAGE
// ============================================================

function clearMessage() {
    if (!message) {
        return;
    }

    message.hidden = true;
    message.textContent = "";
    message.className = "message";
}


function showMessage(
    text,
    type = "error"
) {
    if (!message) {
        return;
    }

    message.textContent =
        text;

    message.className =
        `message ${type}`;

    message.hidden = false;
}


// ============================================================
// HTML ESCAPE
// ============================================================

function escapeHtml(value) {
    return String(value)
        .replace(
            /&/g,
            "&amp;"
        )
        .replace(
            /</g,
            "&lt;"
        )
        .replace(
            />/g,
            "&gt;"
        )
        .replace(
            /"/g,
            "&quot;"
        )
        .replace(
            /'/g,
            "&#039;"
        );
}


// ============================================================
// EVENT LISTENERS
// ============================================================

if (loginForm) {
    loginForm.addEventListener(
        "submit",
        handleLogin
    );
}


if (showLoginButton) {
    showLoginButton.addEventListener(
        "click",
        () => {
            clearMessage();
            showLoginForm();
        }
    );
}


if (backToAccountsButton) {
    backToAccountsButton.addEventListener(
        "click",
        () => {
            clearMessage();

            if (passwordInput) {
                passwordInput.value = "";
            }

            if (cachedUsers.length > 0) {
                showAccountSelection();
            }
        }
    );
}