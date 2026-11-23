function initializeAccountSettings() {
    const form = document.getElementById("accountSettingsForm");
    if (!form || form.dataset.initialized === "true") {
        return;
    }
    form.dataset.initialized = "true";

    const usernameInput = document.getElementById("accountUsername");
    const formAvatar = document.getElementById("accountSettingsAvatar");
    const displayNameInput = document.getElementById("accountDisplayName");
    const emailInput = document.getElementById("accountEmail");
    const unitInput = document.getElementById("accountUnit");
    const currentPasswordInput = document.getElementById("accountCurrentPassword");
    const newPasswordInput = document.getElementById("accountNewPassword");
    const confirmPasswordInput = document.getElementById("accountConfirmPassword");
    const saveButton = document.getElementById("accountSaveButton");
    const message = document.getElementById("accountSettingsMessage");
    const logList = document.getElementById("accountUserLogList");
    const profileCard = document.querySelector(".account-profile-card");
    const logCard = document.querySelector(".account-user-log-card");
    const logHeader = logCard?.querySelector(".account-settings-header");

    function syncUserLogHeight() {
        if (!profileCard || !logCard || !logList) return;
        if (window.matchMedia("(max-width: 900px)").matches) {
            logCard.style.removeProperty("height");
            logList.style.removeProperty("height");
            return;
        }
        const profileHeight = profileCard.getBoundingClientRect().height;
        const headerHeight = logHeader?.getBoundingClientRect().height || 80;
        logCard.style.height = `${profileHeight}px`;
        logList.style.height = `${Math.max(240, profileHeight - headerHeight)}px`;
    }

    function escapeHtml(value) {
        const element = document.createElement("span");
        element.textContent = String(value ?? "");
        return element.innerHTML;
    }

    function actionIcon(action) {
        const normalized = String(action || "").toLowerCase();
        if (
            normalized.includes("delete") ||
            normalized.includes("padam")
        ) {
            return {
                className: "account-user-log-icon is-delete",
                icon: "bi bi-trash3"
            };
        }
        if (
            normalized.includes("add") ||
            normalized.includes("create") ||
            normalized.includes("tambah")
        ) {
            return {
                className: "account-user-log-icon is-add",
                icon: "bi bi-plus-lg"
            };
        }
        return {
            className: "account-user-log-icon is-edit",
            icon: "bi bi-pencil"
        };
    }

    function activityLocation(activity) {
        if (activity.dataset_id != null) {
            const types = {
                peserta: "Peserta Program",
                penerima: "Penerima Bantuan"
            };
            const type = types[String(activity.dataset_type || activity.column_name || "").toLowerCase()];
            if (type) return type;
            const datasetName = String(activity.dataset_name || "").toLowerCase();
            if (datasetName.includes("peserta")) return "Peserta Program";
            if (datasetName.includes("penerima") || datasetName.includes("bantuan")) return "Penerima Bantuan";
            if (["dataset_create", "dataset_delete"].includes(activity.action)) return "Set data";
            return String(activity.dataset_name || "Set data");
        }
        return String(activity.column_name || "Aplikasi");
    }

    function activityDetails(activity) {
        if (activity.dataset_id != null) {
            if (["dataset_create", "dataset_delete"].includes(activity.action)) {
                return {
                    variable: String(activity.dataset_name || "Set data"),
                    change: ""
                };
            }
            if (String(activity.column_name || "").toLowerCase() === "metadata") {
                try {
                    const oldMetadata = JSON.parse(activity.old_value || "{}");
                    const newMetadata = JSON.parse(activity.new_value || "{}");
                    const labels = {
                        name: "Nama set data",
                        datasetType: "Jenis set data",
                        unitInCharge: "Unit bertanggungjawab"
                    };
                    const keys = new Set([
                        ...Object.keys(oldMetadata),
                        ...Object.keys(newMetadata)
                    ]);
                    const changed = [...keys]
                        .filter(key => JSON.stringify(oldMetadata[key]) !== JSON.stringify(newMetadata[key]))
                        .map(key => ({
                            variable: labels[key] || key,
                            change: `${formatActivityValue(oldMetadata[key])} → ${formatActivityValue(newMetadata[key])}`
                        }));
                    if (changed.length) {
                        return {
                            variable: changed.map(item => item.variable).join(", "),
                            change: changed.map(item => item.change).join("; ")
                        };
                    }
                } catch (error) {
                    console.warn("Unable to read activity metadata:", error);
                }
            }
            if (["UPDATE", "status_change"].includes(activity.action)) {
                return {
                    variable: String(activity.column_name || "Medan"),
                    change: `${formatActivityValue(activity.old_value)} → ${formatActivityValue(activity.new_value)}`
                };
            }
            return {
                variable: String(activity.column_name || activity.dataset_name || "Set data"),
                change: ""
            };
        }
        const appEditLabels = {
            program_update: "Nama program",
            sku_update: "Nama SKU",
            bajet_update: "Ringkasan bajet"
        };
        if (appEditLabels[activity.action]) {
            const oldValue = activity.old_value == null
                ? "-"
                : formatActivityValue(activity.old_value);
            return {
                variable: appEditLabels[activity.action],
                change: `${oldValue} → ${formatActivityValue(activity.new_value)}`
            };
        }
        return {
            variable: String(activity.new_value || activity.dataset_name || "Aplikasi"),
            change: ""
        }
    }

    function formatActivityValue(value) {
        if (value == null || value === "") return "-";
        return typeof value === "object" ? JSON.stringify(value) : String(value);
    }

    function formatLogDate(value) {
        const date = new Date(String(value || "").replace(" ", "T"));
        if (Number.isNaN(date.getTime())) return String(value || "-");
        return date.toLocaleString("ms-MY", {
            day: "2-digit",
            month: "short",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit"
        });
    }

    async function loadUserLog() {
        if (!logList) return;
        try {
            const response = await fetch("/api/user/activity?limit=100", {
                credentials: "same-origin",
                cache: "no-store"
            });
            const data = await response.json();
            if (!response.ok || !Array.isArray(data.activities)) {
                throw new Error(data.error || "Tidak dapat memuatkan log pengguna.");
            }
            if (!data.activities.length) {
                logList.innerHTML = '<div class="managed-user-list-empty">Tiada tindakan direkodkan.</div>';
                return;
            }
            logList.innerHTML = data.activities.map(activity => {
                const location = activityLocation(activity);
                const details = activityDetails(activity);
                const actionIconData = actionIcon(activity.action);
                return `
                    <div class="account-user-log-row" role="listitem">
                        <div class="${actionIconData.className}" aria-hidden="true"><i class="${actionIconData.icon}"></i></div>
                        <div class="account-user-log-content">
                            <strong title="${escapeHtml(location)}">${escapeHtml(location)}</strong>
                            <span class="account-user-log-variable" title="${escapeHtml(details.variable)}">${escapeHtml(details.variable)}</span>
                            ${details.change ? `<span class="account-user-log-change" title="${escapeHtml(details.change)}">${escapeHtml(details.change)}</span>` : ""}
                            <div class="account-user-log-time">
                                <i class="bi bi-clock-history" aria-hidden="true"></i>
                                <time>${escapeHtml(formatLogDate(activity.created_at))}</time>
                            </div>
                        </div>
                    </div>
                `;
            }).join("");
        } catch (error) {
            console.error("User log loading error:", error);
            logList.innerHTML = '<div class="managed-user-list-empty is-error">Log pengguna tidak dapat dimuatkan.</div>';
        }
        requestAnimationFrame(syncUserLogHeight);
    }

    function updateFormAvatar(username) {
        const color = window.getInverseTextAverageColor(username || "");
        formAvatar.style.backgroundColor = window.getUserColorBackground(color);
        formAvatar.style.color = window.getUserColorText(color);
    }

    function showMessage(text, type) {
        if (type === "success" && typeof window.showAppAlert === "function") {
            window.showAppAlert(text, "success");
            message.hidden = true;
            return;
        }
        message.textContent = text;
        message.className = `message ${type}`;
        message.hidden = false;
    }

    function updatePasswordMatchState() {
        const passwordsMatch = newPasswordInput.value !== "" &&
            confirmPasswordInput.value !== "" &&
            newPasswordInput.value === confirmPasswordInput.value;
        newPasswordInput.classList.toggle("password-match", passwordsMatch);
        confirmPasswordInput.classList.toggle("password-match", passwordsMatch);
    }

    async function loadAccount() {
        const response = await fetch("/api/auth/me");
        const data = await response.json();
        if (!response.ok || !data.success) {
            throw new Error(data.error || "Tidak dapat memuatkan maklumat profil.");
        }
        usernameInput.value = data.username;
        updateFormAvatar(data.username);
        displayNameInput.value = data.displayName.toLocaleUpperCase();
        emailInput.value = data.email || "";
        unitInput.value = data.unit || "Tiada unit";
        saveButton.disabled = false;
    }

    const accountLoadTask = loadAccount().catch(error => {
        console.error("Account details loading error:", error);
        showMessage(error.message, "error");
    });
    window.registerAppPageLoadTask(Promise.all([accountLoadTask, loadUserLog()]));

    window.addEventListener("resize", syncUserLogHeight);

    newPasswordInput.addEventListener("input", updatePasswordMatchState);
    confirmPasswordInput.addEventListener("input", updatePasswordMatchState);

    form.addEventListener("submit", async event => {
        event.preventDefault();
        message.hidden = true;

        const newPassword = newPasswordInput.value;
        if (newPassword !== confirmPasswordInput.value) {
            showMessage("Pengesahan kata laluan baharu tidak sepadan.", "error");
            return;
        }
        if (newPassword && !currentPasswordInput.value) {
            showMessage("Masukkan kata laluan semasa untuk menukarnya.", "error");
            currentPasswordInput.focus();
            return;
        }
        saveButton.disabled = true;
        try {
            const response = await fetch("/api/auth/account", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    csrfToken: form.dataset.csrfToken,
                    displayName: displayNameInput.value.trim().toLocaleUpperCase(),
                    email: emailInput.value.trim(),
                    currentPassword: currentPasswordInput.value,
                    newPassword,
                    confirmPassword: confirmPasswordInput.value
                })
            });
            const data = await response.json();
            if (!response.ok || !data.success) {
                showMessage(data.error || "Tidak dapat menyimpan perubahan profil.", "error");
                return;
            }

            displayNameInput.value = data.displayName.toLocaleUpperCase();
            emailInput.value = data.email || "";
            unitInput.value = data.unit || "Tiada unit";
            currentPasswordInput.value = "";
            newPasswordInput.value = "";
            confirmPasswordInput.value = "";
            updatePasswordMatchState();
            showMessage("Perubahan profil berjaya disimpan.", "success");
            const headerDisplayName = document.getElementById("userDisplayName");
            const headerIcon = document.getElementById("userIcon");
            if (headerDisplayName) {
                headerDisplayName.textContent = data.displayName.toLocaleUpperCase();
            }
            if (
                headerIcon &&
                typeof window.getInverseTextAverageColor === "function" &&
                typeof window.getUserColorBackground === "function" &&
                typeof window.getUserColorText === "function"
            ) {
                const username = window.appCurrentUser?.username || data.username;
                const color = window.getInverseTextAverageColor(username || data.displayName);
                headerIcon.style.backgroundColor = window.getUserColorBackground(color);
                headerIcon.style.color = window.getUserColorText(color);
            }
        } catch (error) {
            console.error("Account update error:", error);
            showMessage("Tidak dapat menyambung ke pelayan. Sila cuba lagi.", "error");
        } finally {
            saveButton.disabled = false;
        }
    });
}

document.addEventListener("app:page-loaded", initializeAccountSettings);
if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initializeAccountSettings, { once: true });
} else {
    initializeAccountSettings();
}
