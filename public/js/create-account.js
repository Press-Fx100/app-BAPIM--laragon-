const form = document.getElementById("createAccountForm");
const usernameInput = document.getElementById("username");
const displayNameInput = document.getElementById("displayName");
const passwordInput = document.getElementById("password");
const confirmPasswordInput = document.getElementById("confirmPassword");
const createAccountButton = document.getElementById("createAccountButton");
const message = document.getElementById("message");

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

    const username = usernameInput.value.trim();
    const displayName = displayNameInput.value.trim();
    const password = passwordInput.value;
    const confirmPassword = confirmPasswordInput.value;

    if (!username || !displayName || !password) {
        showMessage(
            "Please fill in all fields.",
            "error"
        );
        return;
    }

    if (password.length < 8) {
        showMessage(
            "Password must be at least 8 characters.",
            "error"
        );
        return;
    }

    if (password !== confirmPassword) {
        showMessage(
            "Passwords do not match.",
            "error"
        );
        return;
    }

    createAccountButton.disabled = true;
    createAccountButton.textContent = "Creating...";

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
                data.error || "Failed to create account.",
                "error"
            );

            return;
        }

        showMessage(
            "Account created successfully. Signing you in...",
            "success"
        );

        window.location.replace(
            typeof window.appUrl === "function" ? window.appUrl("/") : "/"
        );

    } catch (error) {
        console.error(error);

        showMessage(
            "Unable to connect to the server.",
            "error"
        );
    } finally {
        createAccountButton.disabled = false;
        createAccountButton.textContent = "Create Account";
    }
});