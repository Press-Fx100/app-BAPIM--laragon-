function initializeUserManagement() {
    const form = document.getElementById("managedUserForm");
    if (!form || form.dataset.initialized === "true") return;
    form.dataset.initialized = "true";

    const usernameInput = document.getElementById("managedUsername");
    const displayNameInput = document.getElementById("managedDisplayName");
    const accessLevelInput = document.getElementById("managedAccessLevel");
    const passwordInput = document.getElementById("managedPassword");
    const passwordHint = document.getElementById("managedPasswordHint");
    const formTitle = document.getElementById("managedUserFormTitle");
    const saveButton = document.getElementById("saveManagedUserButton");
    const cancelButton = document.getElementById("cancelManagedUserButton");
    const accessButton = document.getElementById("configureManagedAccessButton");
    const message = document.getElementById("managedUserMessage");
    const usersBody = document.getElementById("managedUsersBody");
    const accessOverlay = document.getElementById("managedUserAccessOverlay");
    const accessList = document.getElementById("managedUserAccessList");
    const pageDefinitions = [
        { key: "dashboard", label: "Papan Pemuka", editable: false },
        { key: "recipients", label: "Penerima Bantuan", editable: true, action: "Boleh sunting rekod" },
        { key: "participants", label: "Peserta Program", editable: true, action: "Boleh sunting rekod" },
        { key: "upload", label: "Muat Naik & Set Data", editable: true, action: "Boleh muat naik dan urus set data" },
        { key: "dataset", label: "Paparan Set Data", editable: true, action: "Boleh sunting set data" },
        { key: "activity", label: "Aktiviti Pengguna", editable: false },
        { key: "account", label: "Akaun Pengguna", editable: true, action: "Boleh kemas kini akaun" },
        { key: "updates", label: "Log Perisian", editable: false },
        { key: "manageUsers", label: "Pengguna Lain", editable: false }
    ];
    const pageKeys = new Set(pageDefinitions.map(page => page.key));
    let users = [];
    let editingUser = null;
    let accessTarget = null;
    let modalAccessLevel = Number(accessLevelInput.value);
    let draftPermissions = defaultPermissions(Number(accessLevelInput.value));
    let originalModalPermissions = null;

    function currentManagerLevel() {
        return Number(window.appCurrentUser?.accessLevel ?? 2);
    }

    function defaultPermissions(level) {
        const editable = level <= 2;
        return Object.fromEntries(pageDefinitions.map(page => [
            page.key,
            {
                access: page.key === "manageUsers" ? level <= 1 : true,
                edit: page.editable ? editable : page.key === "manageUsers" && level <= 1
            }
        ]));
    }

    function safePermissions(permissions, level) {
        const defaults = defaultPermissions(level);
        const result = {};
        pageDefinitions.forEach(page => {
            const provided = permissions?.[page.key];
            result[page.key] = {
                access: typeof provided?.access === "boolean" ? provided.access : defaults[page.key].access,
                edit: typeof provided?.edit === "boolean" ? provided.edit : defaults[page.key].edit
            };
        });
        if (level >= 2) result.manageUsers.access = false;
        if (level >= 3) pageDefinitions.forEach(page => { result[page.key].edit = false; });
        return result;
    }

    function showMessage(text, type = "error") {
        message.textContent = text;
        message.className = `message ${type}`;
        message.hidden = false;
    }

    function clearMessage() {
        message.hidden = true;
        message.textContent = "";
    }

    function resetForm() {
        editingUser = null;
        form.reset();
        usernameInput.readOnly = false;
        passwordInput.required = true;
        passwordHint.textContent = "(minimum 8 aksara)";
        formTitle.textContent = "Tambah Pengguna";
        saveButton.textContent = "Tambah Pengguna";
        cancelButton.hidden = true;
        accessLevelInput.disabled = false;
        accessButton.disabled = false;
        accessLevelInput.value = "2";
        accessLevelInput.querySelector('option[value="0"]').disabled = currentManagerLevel() !== 0;
        accessLevelInput.dispatchEvent(new Event("change", { bubbles: true }));
        draftPermissions = defaultPermissions(2);
        clearMessage();
    }

    function appendCell(row, text) {
        const cell = document.createElement("td");
        cell.textContent = text;
        row.appendChild(cell);
        return cell;
    }

    function levelLabel(level) {
        return ["Dev", "Admin", "Pengguna", "Viewer"][Number(level)] || "Pengguna";
    }

    function canManageTarget(user) {
        return currentManagerLevel() === 0 || Number(user.accessLevel) > 1;
    }

    function renderUsers() {
        usersBody.replaceChildren();
        if (!users.length) {
            const row = document.createElement("tr");
            const cell = appendCell(row, "Tiada pengguna.");
            cell.colSpan = 5;
            cell.className = "managed-users-empty";
            usersBody.appendChild(row);
            return;
        }

        users.forEach(user => {
            const row = document.createElement("tr");
            appendCell(row, user.username);
            appendCell(row, user.displayName);
            appendCell(row, `${user.accessLevel} - ${levelLabel(user.accessLevel)}`);
            const status = appendCell(row, Number(user.active) === 1 ? "Aktif" : "Tidak aktif");
            status.className = `managed-user-status ${Number(user.active) === 1 ? "is-active" : "is-inactive"}`;

            const actions = document.createElement("td");
            actions.className = "managed-user-actions";
            if (canManageTarget(user)) {
                const editButton = document.createElement("button");
                editButton.type = "button";
                editButton.className = "btn btn-sm btn-outline-primary";
                editButton.textContent = "Kemaskini";
                editButton.addEventListener("click", () => beginEdit(user));
                actions.appendChild(editButton);

                const permissionButton = document.createElement("button");
                permissionButton.type = "button";
                permissionButton.className = "btn btn-sm btn-outline-secondary";
                permissionButton.textContent = "Akses";
                permissionButton.addEventListener("click", () => openAccessModal(user));
                actions.appendChild(permissionButton);

                if (Number(user.accessLevel) > 1) {
                    const statusButton = document.createElement("button");
                    statusButton.type = "button";
                    statusButton.className = `btn btn-sm ${Number(user.active) === 1 ? "btn-outline-danger" : "btn-outline-success"}`;
                    statusButton.textContent = Number(user.active) === 1 ? "Nyahaktifkan" : "Aktifkan";
                    statusButton.addEventListener("click", () => toggleUserStatus(user));
                    actions.appendChild(statusButton);
                }
            } else {
                actions.textContent = "Akses terhad";
            }
            row.appendChild(actions);
            usersBody.appendChild(row);
        });
    }

    function beginEdit(user) {
        editingUser = user;
        usernameInput.value = user.username;
        usernameInput.readOnly = true;
        displayNameInput.value = user.displayName;
        accessLevelInput.value = String(user.accessLevel);
        accessLevelInput.disabled = currentManagerLevel() !== 0 && Number(user.accessLevel) <= 1;
        accessLevelInput.querySelector('option[value="0"]').disabled = currentManagerLevel() !== 0;
        accessLevelInput.dispatchEvent(new Event("change", { bubbles: true }));
        passwordInput.value = "";
        passwordInput.required = false;
        passwordHint.textContent = "(biarkan kosong untuk kekalkan)";
        formTitle.textContent = `Kemaskini Pengguna: ${user.username}`;
        saveButton.textContent = "Simpan Perubahan";
        cancelButton.hidden = false;
        accessButton.disabled = !canManageTarget(user);
        draftPermissions = safePermissions(user.permissions, Number(user.accessLevel));
        clearMessage();
        form.scrollIntoView({ behavior: "smooth", block: "start" });
        displayNameInput.focus();
    }

    async function request(url, options = {}) {
        const response = await fetch(url, {
            ...options,
            headers: {
                "Content-Type": "application/json",
                ...(options.headers || {})
            }
        });
        const data = await response.json();
        if (!response.ok || !data.success) {
            throw new Error(data.error || "Permintaan tidak dapat diselesaikan.");
        }
        return data;
    }

    async function loadUsers() {
        usersBody.innerHTML = '<tr><td colspan="5" class="managed-users-empty">Memuatkan pengguna...</td></tr>';
        try {
            const data = await request("/api/admin/users");
            users = data.users;
            renderUsers();
        } catch (error) {
            console.error("User list loading error:", error);
            usersBody.replaceChildren();
            const row = document.createElement("tr");
            const cell = appendCell(row, error.message);
            cell.colSpan = 5;
            cell.className = "managed-users-empty is-error";
            usersBody.appendChild(row);
        }
    }

    function renderAccessOptions() {
        const level = modalAccessLevel;
        accessList.replaceChildren();
        pageDefinitions.forEach(page => {
            const permission = draftPermissions[page.key];
            const row = document.createElement("div");
            row.className = "managed-user-access-row";

            const pageLabel = document.createElement("label");
            pageLabel.className = "managed-user-page-access";
            const checkbox = document.createElement("input");
            checkbox.type = "checkbox";
            checkbox.checked = permission.access;
            checkbox.disabled = (level === 0) || (level >= 2 && page.key === "manageUsers");
            checkbox.addEventListener("change", () => {
                permission.access = checkbox.checked;
                row.classList.toggle("is-disabled", !permission.access);
                actionSwitch.disabled = !page.editable || !permission.access || level >= 3;
            });
            const checkboxText = document.createElement("span");
            checkboxText.textContent = page.label;
            pageLabel.append(checkbox, checkboxText);
            row.appendChild(pageLabel);

            let actionSwitch;
            if (page.editable) {
                const actionLabel = document.createElement("label");
                actionLabel.className = "managed-user-page-action";
                const switchInput = document.createElement("input");
                switchInput.type = "checkbox";
                switchInput.setAttribute("role", "switch");
                switchInput.checked = permission.edit;
                switchInput.disabled = !permission.access || level >= 3 || level === 0;
                switchInput.setAttribute("aria-label", page.action);
                switchInput.addEventListener("change", () => {
                    permission.edit = switchInput.checked;
                });
                const actionText = document.createElement("span");
                actionText.textContent = page.action;
                actionLabel.append(switchInput, actionText);
                row.appendChild(actionLabel);
                actionSwitch = switchInput;
                checkbox.addEventListener("change", () => {
                    actionSwitch.disabled = !page.editable || !permission.access || level >= 3;
                });
            } else {
                const readOnly = document.createElement("span");
                readOnly.className = "managed-user-view-label";
                readOnly.textContent = "Paparan";
                row.appendChild(readOnly);
            }
            row.classList.toggle("is-disabled", !permission.access);
            accessList.appendChild(row);
        });
        const message = document.getElementById("managedUserAccessNote");
        if (message) {
            message.textContent = level === 0
                ? "Dev sentiasa mempunyai akses penuh. Tetapan halaman tidak boleh dihadkan."
                : level === 3
                    ? "Viewer hanya boleh melihat halaman. Suis suntingan tidak tersedia."
                    : level === 1
                        ? "Admin boleh mengurus pengguna dan mempunyai keupayaan pengguna."
                        : "Pengguna boleh menyunting jadual dan memuat naik set data, tetapi tidak boleh mengurus pengguna.";
        }
    }

    function openAccessModal(user = null) {
        accessTarget = user;
        modalAccessLevel = user ? Number(user.accessLevel) : Number(accessLevelInput.value);
        if (user) {
            draftPermissions = safePermissions(user.permissions, modalAccessLevel);
        }
        originalModalPermissions = safePermissions(draftPermissions, modalAccessLevel);
        document.getElementById("managedUserAccessError").hidden = true;
        document.getElementById("managedUserAccessError").textContent = "";
        renderAccessOptions();
        accessOverlay.hidden = false;
        document.getElementById("closeManagedUserAccess").focus();
    }

    function closeAccessModal() {
        accessOverlay.hidden = true;
        accessTarget = null;
        originalModalPermissions = null;
        accessButton.focus();
    }

    function cancelAccessModal() {
        if (originalModalPermissions) {
            draftPermissions = originalModalPermissions;
        }
        closeAccessModal();
    }

    async function saveAccessModal() {
        const accessLevel = modalAccessLevel;
        const permissions = safePermissions(draftPermissions, accessLevel);
        if (!accessTarget) {
            draftPermissions = permissions;
            closeAccessModal();
            showMessage("Tetapan akses akan disimpan bersama akaun.", "success");
            return;
        }

        const saveButton = document.getElementById("saveManagedUserAccess");
        saveButton.disabled = true;
        try {
            const targetUsername = accessTarget.username;
            await request(`/api/admin/users/${encodeURIComponent(accessTarget.id)}`, {
                method: "PUT",
                body: JSON.stringify({
                    csrfToken: form.dataset.csrfToken,
                    displayName: accessTarget.displayName,
                    accessLevel,
                    permissions,
                    active: Boolean(Number(accessTarget.active))
                })
            });
            closeAccessModal();
            showMessage(`Tetapan akses ${targetUsername} berjaya disimpan.`, "success");
            await loadUsers();
        } catch (error) {
            console.error("User access update error:", error);
            document.getElementById("managedUserAccessError").textContent = error.message;
            document.getElementById("managedUserAccessError").hidden = false;
        } finally {
            saveButton.disabled = false;
        }
    }

    async function toggleUserStatus(user) {
        const isActive = Number(user.active) === 1;
        if (isActive && !window.confirm(`Nyahaktifkan akaun ${user.username}? Rekod aktiviti akan dikekalkan.`)) return;
        clearMessage();
        try {
            await request(`/api/admin/users/${encodeURIComponent(user.id)}`, {
                method: "PUT",
                body: JSON.stringify({
                    csrfToken: form.dataset.csrfToken,
                    displayName: user.displayName,
                    accessLevel: user.accessLevel,
                    permissions: user.permissions,
                    active: !isActive
                })
            });
            showMessage(`Akaun ${user.username} berjaya ${isActive ? "dinyahaktifkan" : "diaktifkan"}.`, "success");
            await loadUsers();
        } catch (error) {
            console.error("User status update error:", error);
            showMessage(error.message);
        }
    }

    document.getElementById("newManagedUserButton").addEventListener("click", () => {
        resetForm();
        usernameInput.focus();
        form.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    cancelButton.addEventListener("click", resetForm);
    accessLevelInput.addEventListener("change", () => {
        const nextLevel = Number(accessLevelInput.value);
        if (nextLevel === 0 && currentManagerLevel() !== 0) {
            accessLevelInput.value = "2";
            showMessage("Hanya dev boleh memberikan tahap akses 0.");
            return;
        }
        draftPermissions = defaultPermissions(nextLevel);
        modalAccessLevel = nextLevel;
        clearMessage();
    });
    accessButton.addEventListener("click", () => openAccessModal());
    document.getElementById("closeManagedUserAccess").addEventListener("click", cancelAccessModal);
    document.getElementById("cancelManagedUserAccess").addEventListener("click", cancelAccessModal);
    document.getElementById("saveManagedUserAccess").addEventListener("click", saveAccessModal);
    accessOverlay.addEventListener("click", event => {
        if (event.target === accessOverlay) cancelAccessModal();
    });
    document.getElementById("managedUserAccessModal").addEventListener("keydown", event => {
        if (event.key === "Escape") cancelAccessModal();
    });

    form.addEventListener("submit", async event => {
        event.preventDefault();
        clearMessage();
        saveButton.disabled = true;
        const accessLevel = Number(accessLevelInput.value);
        const permissions = safePermissions(draftPermissions, accessLevel);
        const payload = {
            csrfToken: form.dataset.csrfToken,
            username: usernameInput.value.trim(),
            displayName: displayNameInput.value.trim(),
            accessLevel,
            permissions,
            password: passwordInput.value
        };
        try {
            let successMessage;
            if (editingUser) {
                await request(`/api/admin/users/${encodeURIComponent(editingUser.id)}`, {
                    method: "PUT",
                    body: JSON.stringify({
                        csrfToken: payload.csrfToken,
                        displayName: payload.displayName,
                        accessLevel: payload.accessLevel,
                        permissions: payload.permissions,
                        password: payload.password,
                        active: Boolean(Number(editingUser.active))
                    })
                });
                successMessage = `Akaun ${editingUser.username} berjaya dikemaskini.`;
            } else {
                await request("/api/admin/users", {
                    method: "POST",
                    body: JSON.stringify(payload)
                });
                successMessage = `Akaun ${payload.username} berjaya ditambah.`;
            }
            resetForm();
            await loadUsers();
            showMessage(successMessage, "success");
        } catch (error) {
            console.error("User save error:", error);
            showMessage(error.message);
        } finally {
            saveButton.disabled = false;
        }
    });

    document.getElementById("managedUserAccessError").hidden = true;
    request("/api/auth/me").then(data => {
        window.appCurrentUser = {
            username: data.username,
            displayName: data.displayName,
            accessLevel: Number(data.accessLevel),
            permissions: data.permissions || {}
        };
        accessLevelInput.querySelector('option[value="0"]').disabled = currentManagerLevel() !== 0;
        if (typeof window.applyAppPermissions === "function") window.applyAppPermissions();
        return loadUsers();
    }).catch(error => {
        console.error("Current user permission loading error:", error);
        showMessage(error.message);
    });
}

document.addEventListener("app:page-loaded", initializeUserManagement);
if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initializeUserManagement, { once: true });
} else {
    initializeUserManagement();
}
