const form = document.getElementById("createAccountForm");
const usernameInput = document.getElementById("username");
const displayNameInput = document.getElementById("displayName");
const passwordInput = document.getElementById("password");
const confirmPasswordInput = document.getElementById("confirmPassword");
const createAccountButton = document.getElementById("createAccountButton");
const message = document.getElementById("message");
const usernameHelp = document.querySelector(".username-help");

if (usernameHelp) {
    usernameInput.addEventListener("input", () => {
        const caret = usernameInput.selectionStart;
        const value = usernameInput.value.toLowerCase();
        const username = value.replace(/[^a-z0-9.]/g, "");
        if (username !== usernameInput.value) {
            const cleanCaret = value.slice(0, caret ?? value.length).replace(/[^a-z0-9.]/g, "").length;
            usernameInput.value = username;
            usernameInput.setSelectionRange(cleanCaret, cleanCaret);
        }
    });
    usernameInput.addEventListener("input", () => {
        usernameHelp.hidden = false;
    }, { once: true });
    usernameInput.addEventListener("invalid", () => {
        usernameHelp.hidden = false;
    });
}

function showMessage(text, type) {
    message.textContent = text;
    message.className = `message ${type}`;
    message.hidden = false;
}

function hideMessage() {
    message.hidden = true;
    message.textContent = "";
}

form.addEventListener("submit", async event => {
    event.preventDefault();

    hideMessage();

    const username = usernameInput.value;
    const displayName = displayNameInput.value.trim().toLocaleUpperCase();
    const password = passwordInput.value;
    const confirmPassword = confirmPasswordInput.value;

    if (!username || !displayName || !password) {
        showMessage(
            "Sila lengkapkan semua ruangan.",
            "error"
        );
        return;
    }

    if (!/^[a-z0-9.]{1,100}$/.test(username)) {
        showMessage(
            "Nama pengguna hanya boleh mengandungi huruf kecil, nombor dan titik (.).",
            "error"
        );
        return;
    }

    if (password !== confirmPassword) {
        showMessage(
            "Pengesahan kata laluan tidak sepadan.",
            "error"
        );
        return;
    }

    createAccountButton.disabled = true;
    createAccountButton.textContent = "Mencipta akaun...";

    try {
        const response = await fetch(
            "/api/auth/create-account",
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    username,
                    displayName,
                    password
                })
            }
        );

        const data = await response.json();

        if (!response.ok || !data.success) {
            showMessage(
                data.error || "Gagal mencipta akaun.",
                "error"
            );

            return;
        }

        showMessage(
            "Akaun berjaya dicipta. Sedang log masuk...",
            "success"
        );

        window.location.replace(
            typeof window.appUrl === "function" ? window.appUrl("/") : "/"
        );

    } catch (error) {
        console.error(error);

        showMessage(
            "Tidak dapat menyambung ke pelayan.",
            "error"
        );
    } finally {
        createAccountButton.disabled = false;
        createAccountButton.textContent = "Cipta Akaun";
    }
});