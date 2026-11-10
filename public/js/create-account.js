const form = document.getElementById("createAccountForm");
const emailInput = document.getElementById("email");
const usernameInput = document.getElementById("username");
const displayNameInput = document.getElementById("displayName");
const passwordInput = document.getElementById("password");
const confirmPasswordInput = document.getElementById("confirmPassword");
const createAccountButton = document.getElementById("createAccountButton");
const message = document.getElementById("message");
const usernameHelp = document.querySelector(".username-help");

emailInput.addEventListener("keydown", event => {
    if (/\s/.test(event.key)) {
        event.preventDefault();
    }
});

emailInput.addEventListener("input", () => {
    const email = emailInput.value.replace(/\s/g, "");
    if (email !== emailInput.value) {
        emailInput.value = email;
    }
});

function updatePasswordMatchState() {
    const passwordsMatch = passwordInput.value !== "" &&
        confirmPasswordInput.value !== "" &&
        passwordInput.value === confirmPasswordInput.value;
    passwordInput.classList.toggle("password-match", passwordsMatch);
    confirmPasswordInput.classList.toggle("password-match", passwordsMatch);
}

if (usernameHelp) {
    usernameInput.addEventListener("input", () => {
        const caret = usernameInput.selectionStart;
        const value = usernameInput.value.toLowerCase();
        const username = value.replace(/[^a-z0-9._]/g, "");
        if (username !== usernameInput.value) {
            const cleanCaret = value.slice(0, caret ?? value.length).replace(/[^a-z0-9._]/g, "").length;
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

passwordInput.addEventListener("input", updatePasswordMatchState);
confirmPasswordInput.addEventListener("input", updatePasswordMatchState);

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

    const email = emailInput.value.trim();

    if (!email || !username || !displayName || !password) {
        showMessage(
            "Sila lengkapkan semua ruangan.",
            "error"
        );
        return;
    }

    if (!/^[a-z0-9._]{1,100}$/.test(username)) {
        showMessage(
            "Nama pengguna hanya boleh mengandungi huruf kecil, nombor, titik (.) dan garis bawah (_).",
            "error"
        );
        return;
    }

    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        showMessage("Sila masukkan alamat e-mel yang sah.", "error");
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
    createAccountButton.textContent = "Mencipta profil...";

    try {
        const response = await fetch(
            "/api/auth/create-account",
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    email,
                    username,
                    displayName,
                    password
                })
            }
        );

        const data = await response.json();

        if (!response.ok || !data.success) {
            showMessage(
                data.error || "Gagal mencipta profil.",
                "error"
            );

            return;
        }

        showMessage(
            "Profil berjaya dicipta. Sedang log masuk...",
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
        createAccountButton.textContent = "Cipta Profil";
    }
});