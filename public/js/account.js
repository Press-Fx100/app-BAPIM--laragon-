function initializeAccountSettings() {
    const form = document.getElementById("accountSettingsForm");
    if (!form || form.dataset.initialized === "true") {
        return;
    }
    form.dataset.initialized = "true";

    const usernameInput = document.getElementById("accountUsername");
    const displayNameInput = document.getElementById("accountDisplayName");
    const currentPasswordInput = document.getElementById("accountCurrentPassword");
    const newPasswordInput = document.getElementById("accountNewPassword");
    const confirmPasswordInput = document.getElementById("accountConfirmPassword");
    const saveButton = document.getElementById("accountSaveButton");
    const message = document.getElementById("accountSettingsMessage");

    function showMessage(text, type) {
        message.textContent = text;
        message.className = `message ${type}`;
        message.hidden = false;
    }

    async function loadAccount() {
        const response = await fetch("/api/auth/me");
        const data = await response.json();
        if (!response.ok || !data.success) {
            throw new Error(data.error || "Tidak dapat memuatkan maklumat akaun.");
        }
        usernameInput.value = data.username;
        displayNameInput.value = data.displayName.toLocaleUpperCase();
        saveButton.disabled = false;
    }

    loadAccount().catch(error => {
        console.error("Account details loading error:", error);
        showMessage(error.message, "error");
    });

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
                    currentPassword: currentPasswordInput.value,
                    newPassword,
                    confirmPassword: confirmPasswordInput.value
                })
            });
            const data = await response.json();
            if (!response.ok || !data.success) {
                showMessage(data.error || "Tidak dapat menyimpan perubahan akaun.", "error");
                return;
            }

            displayNameInput.value = data.displayName.toLocaleUpperCase();
            currentPasswordInput.value = "";
            newPasswordInput.value = "";
            confirmPasswordInput.value = "";
            showMessage("Perubahan akaun berjaya disimpan.", "success");
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
