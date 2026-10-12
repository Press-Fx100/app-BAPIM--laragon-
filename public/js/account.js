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

    function updateFormAvatar(username) {
        const color = window.getInverseTextAverageColor(username || "");
        formAvatar.style.backgroundColor = window.getUserColorBackground(color);
        formAvatar.style.color = window.getUserColorText(color);
    }

    function showMessage(text, type) {
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
    window.registerAppPageLoadTask(accountLoadTask);

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
