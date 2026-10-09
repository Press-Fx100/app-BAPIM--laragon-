function initializeUserManagement() {
    const form = document.getElementById("managedUserForm");
    if (!form || form.dataset.initialized === "true") return;
    form.dataset.initialized = "true";

    const usernameInput = document.getElementById("managedUsername");
    const formAvatar = document.getElementById("managedUserFormAvatar");
    const usernameHelp = usernameInput.parentElement.querySelector(".username-help");
    const displayNameInput = document.getElementById("managedDisplayName");
    const accessLevelInput = document.getElementById("managedAccessLevel");
    const passwordInput = document.getElementById("managedPassword");
    const passwordHint = document.getElementById("managedPasswordHint");
    const saveButton = document.getElementById("saveManagedUserButton");
    const accessButton = document.getElementById("configureManagedAccessButton");
    const statusButton = document.getElementById("managedUserStatusButton");
    const message = document.getElementById("managedUserMessage");
    const usersBody = document.getElementById("managedUsersBody");
    const searchInput = document.getElementById("managedUserSearch");
    const accessFilterOptions = document.querySelectorAll('input[name="managedUserAccessFilter"]');
    const filterButton = document.getElementById("managedUserFilterButton");
    const filterMenu = document.getElementById("managedUserFilterMenu");
    const manageUsersPage = form.closest(".manage-users-page");
    const manageUsersLayout = form.closest(".manage-users-layout");
    const manageUsersCard = form.closest(".manage-users-card");
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
        { key: "manageUsers", label: "Pengurusan Pengguna", editable: false }
    ];
    const pageKeys = new Set(pageDefinitions.map(page => page.key));
    let users = [];
    let editingUser = null;
    let accessTarget = null;
    let modalAccessLevel = Number(accessLevelInput.value);
    let draftPermissions = defaultPermissions(Number(accessLevelInput.value));
    let originalModalPermissions = null;
    let isSyncingDerivedAccessLevel = false;

    function syncManagedUsersListHeight() {
        if (!manageUsersLayout || !manageUsersCard) return;
        if (window.matchMedia("(max-width: 900px)").matches) {
            manageUsersLayout.style.removeProperty("--managed-users-list-height");
            return;
        }
        manageUsersLayout.style.setProperty(
            "--managed-users-list-height",
            `${manageUsersCard.getBoundingClientRect().height}px`
        );
    }

    syncManagedUsersListHeight();
    new ResizeObserver(syncManagedUsersListHeight).observe(manageUsersCard);

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
    usernameInput.addEventListener("input", () => updateFormAvatar(usernameInput.value));
    usernameInput.addEventListener("invalid", () => {
        usernameHelp.hidden = false;
    });

    function currentManagerLevel() {
        return Number(window.appCurrentUser?.accessLevel ?? 2);
    }

    function updateFormAvatar(username) {
        const color = window.getInverseTextAverageColor(username || "");
        formAvatar.style.backgroundColor = window.getUserColorBackground(color);
        formAvatar.style.color = window.getUserColorText(color);
    }

    function updateCurrentUserHeader(user) {
        window.appCurrentUser = {
            ...window.appCurrentUser,
            username: user.username,
            displayName: user.displayName,
            accessLevel: Number(user.accessLevel),
            permissions: user.permissions
        };
        const headerDisplayName = document.getElementById("userDisplayName");
        const headerUsername = document.getElementById("userName");
        const headerIcon = document.getElementById("userIcon");
        if (headerDisplayName) headerDisplayName.textContent = user.displayName.toLocaleUpperCase();
        if (headerUsername) headerUsername.textContent = user.username;
        if (headerIcon) {
            const color = window.getInverseTextAverageColor(user.username);
            headerIcon.style.backgroundColor = window.getUserColorBackground(color);
            headerIcon.style.color = window.getUserColorText(color);
        }
        if (typeof window.applyAppPermissions === "function") window.applyAppPermissions();
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
        if (level === 0) return defaultPermissions(0);
        const defaults = defaultPermissions(level);
        const result = {};
        pageDefinitions.forEach(page => {
            const provided = permissions?.[page.key];
            const access = page.key === "dashboard"
                ? true
                : typeof provided?.access === "boolean" ? provided.access : defaults[page.key].access;
            result[page.key] = {
                access,
                edit: page.key === "manageUsers"
                    ? access
                    : page.editable && access && (typeof provided?.edit === "boolean" ? provided.edit : defaults[page.key].edit)
            };
        });
        return result;
    }

    function deriveAccessLevel(permissions, requestedLevel) {
        if (requestedLevel === 0) return 0;
        if (permissions.manageUsers.access) return 1;
        if (pageDefinitions.some(page => page.editable && permissions[page.key].access && permissions[page.key].edit)) {
            return 2;
        }
        return 3;
    }

    function setDerivedAccessLevel(level) {
        isSyncingDerivedAccessLevel = true;
        try {
            accessLevelInput.value = String(level);
            accessLevelInput.dispatchEvent(new Event("change", { bubbles: true }));
        } finally {
            isSyncingDerivedAccessLevel = false;
        }
    }

    function showMessage(text, type = "error") {
        showDatasetSaveConfirmation(text, type);
        clearMessage();
    }

    function clearMessage() {
        message.hidden = true;
        message.textContent = "";
    }

    function updateStatusButton(isActive) {
        statusButton.textContent = isActive ? "Nyahaktifkan Akaun" : "Aktifkan Akaun";
        statusButton.className = `btn ${isActive
            ? "btn-outline-danger managed-user-deactivate-button"
            : "btn-outline-primary"}`;
    }

    function resetForm() {
        editingUser = null;
        form.reset();
        usernameHelp.hidden = true;
        usernameInput.addEventListener("input", () => {
            usernameHelp.hidden = false;
        }, { once: true });
        usernameInput.readOnly = false;
        updateFormAvatar("");
        passwordInput.required = true;
        passwordHint.textContent = "";
        saveButton.textContent = "Tambah Pengguna";
        statusButton.hidden = true;
        accessLevelInput.disabled = false;
        accessButton.disabled = false;
        accessLevelInput.value = "2";
        accessLevelInput.querySelector('option[value="0"]').disabled = currentManagerLevel() !== 0;
        accessLevelInput.dispatchEvent(new Event("change", { bubbles: true }));
        draftPermissions = defaultPermissions(2);
        clearMessage();
    }

    function canManageTarget(user) {
        return currentManagerLevel() === 0
            || user.username === window.appCurrentUser?.username
            || Number(user.accessLevel) > 1;
    }

    function setFilterMenuOpen(isOpen) {
        filterMenu.classList.toggle("show", isOpen);
        filterButton.setAttribute("aria-expanded", String(isOpen));
        filterButton.closest(".managed-users-list-card").classList.toggle("filter-menu-open", isOpen);
    }

    function renderUsers() {
        usersBody.replaceChildren();
        const query = searchInput.value.trim().toLocaleLowerCase();
        const accessLevel = document.querySelector('input[name="managedUserAccessFilter"]:checked').value;
        const filteredUsers = users.filter(user =>
            `${user.displayName} ${user.username}`.toLocaleLowerCase().includes(query) &&
            (!accessLevel || Number(user.accessLevel) === Number(accessLevel))
        );
        if (!filteredUsers.length) {
            const empty = document.createElement("div");
            empty.className = "managed-user-list-empty";
            empty.textContent = users.length ? "Tiada pengguna sepadan." : "Tiada pengguna.";
            usersBody.appendChild(empty);
            return;
        }

        filteredUsers.forEach(user => {
            const level = Number(user.accessLevel);
            const accessDetails = {
                0: { label: "Dev", icon: "bi-code-slash" },
                1: { label: "Admin", icon: "bi-shield-lock" },
                2: { label: "Editor", icon: "bi-pencil-square" },
                3: { label: "Viewer", icon: "bi-eye" }
            }[level] || { label: "Tahap akses " + level, icon: "bi-person" };
            const row = document.createElement("div");
            row.className = "managed-user-list-row";
            row.setAttribute("role", "listitem");
            const item = document.createElement("button");
            item.type = "button";
            item.className = "managed-user-list-item";
            item.disabled = !canManageTarget(user);
            item.setAttribute(
                "aria-label",
                `Kemaskini ${user.displayName}, ${user.username}, akses ${accessDetails.label}${Number(user.active) === 1 ? "" : ", akaun dinyahaktifkan"}`
            );

            const userDetails = document.createElement("span");
            userDetails.className = "managed-user-list-details";
            const displayName = document.createElement("span");
            displayName.className = `managed-user-list-name${Number(user.active) === 1 ? "" : " is-inactive"}`;
            displayName.textContent = user.displayName.toLocaleUpperCase();
            const username = document.createElement("span");
            username.className = "managed-user-list-username";
            username.textContent = user.username;
            userDetails.append(displayName, username);
            const accessIcon = document.createElement("i");
            accessIcon.className = `bi ${accessDetails.icon} managed-user-access-icon`;
            accessIcon.dataset.accessLevel = String(level);
            accessIcon.title = accessDetails.label;
            accessIcon.setAttribute("aria-hidden", "true");
            const statusIcons = document.createElement("span");
            statusIcons.className = "managed-user-list-status-icons";
            if (Number(user.active) === 1) {
                statusIcons.appendChild(accessIcon);
            } else {
                const inactiveIcon = document.createElement("i");
                inactiveIcon.className = "bi bi-person-x-fill managed-user-inactive-icon";
                inactiveIcon.title = "Akaun dinyahaktifkan";
                inactiveIcon.setAttribute("aria-hidden", "true");
                statusIcons.appendChild(inactiveIcon);
            }
            const profileIcon = document.createElement("i");
            profileIcon.className = "bi bi-person-fill managed-user-profile-icon";
            const usernameColor = window.getInverseTextAverageColor(user.username);
            profileIcon.style.backgroundColor = window.getUserColorBackground(usernameColor);
            profileIcon.style.color = window.getUserColorText(usernameColor);
            profileIcon.setAttribute("aria-hidden", "true");
            item.append(profileIcon, userDetails, statusIcons);
            item.addEventListener("click", () => beginEdit(user));
            row.appendChild(item);
            usersBody.appendChild(row);
        });
    }

    function beginEdit(user) {
        editingUser = user;
        usernameInput.value = user.username;
        updateFormAvatar(user.username);
        usernameInput.readOnly = currentManagerLevel() !== 0;
        displayNameInput.value = user.displayName.toLocaleUpperCase();
        accessLevelInput.value = String(user.accessLevel);
        accessLevelInput.disabled = currentManagerLevel() !== 0 && Number(user.accessLevel) <= 1;
        accessLevelInput.querySelector('option[value="0"]').disabled = currentManagerLevel() !== 0;
        accessLevelInput.dispatchEvent(new Event("change", { bubbles: true }));
        passwordInput.value = "";
        passwordInput.required = false;
        passwordHint.textContent = "(biarkan kosong untuk kekalkan)";
        saveButton.textContent = "Simpan Perubahan";
        accessButton.disabled = !canManageTarget(user);
        statusButton.hidden = user.username === window.appCurrentUser?.username
            || (Number(user.accessLevel) <= 1 && currentManagerLevel() !== 0);
        updateStatusButton(Number(user.active) === 1);
        draftPermissions = safePermissions(user.permissions, Number(user.accessLevel));
        clearMessage();
        form.scrollIntoView({ behavior: "smooth", block: "start" });
        (usernameInput.readOnly ? displayNameInput : usernameInput).focus();
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
        usersBody.innerHTML = '<div class="managed-user-list-empty">Memuatkan pengguna...</div>';
        try {
            const data = await request("/api/admin/users");
            users = data.users;
            renderUsers();
        } catch (error) {
            console.error("User list loading error:", error);
            usersBody.replaceChildren();
            const empty = document.createElement("div");
            empty.className = "managed-user-list-empty is-error";
            empty.textContent = error.message;
            usersBody.appendChild(empty);
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
            checkbox.checked = page.key === "dashboard" || permission.access;
            checkbox.disabled = page.key === "dashboard" || level === 0;
            checkbox.addEventListener("change", () => {
                permission.access = checkbox.checked;
                row.classList.toggle("is-disabled", !permission.access);
                if (actionSwitch) actionSwitch.disabled = !page.editable || !permission.access || level === 0;
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
                switchInput.disabled = !permission.access || level === 0;
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
                    actionSwitch.disabled = !page.editable || !permission.access || level === 0;
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
        const permissions = safePermissions(draftPermissions, modalAccessLevel);
        const accessLevel = deriveAccessLevel(permissions, modalAccessLevel);
        if (!accessTarget) {
            draftPermissions = permissions;
            setDerivedAccessLevel(accessLevel);
            modalAccessLevel = accessLevel;
            closeAccessModal();
            showMessage("Kebenaran akan disimpan bersama akaun.", "success");
            return;
        }

        const saveButton = document.getElementById("saveManagedUserAccess");
        saveButton.disabled = true;
        try {
            const target = accessTarget;
            const targetUsername = target.username;
            await request(`/api/admin/users/${encodeURIComponent(target.id)}`, {
                method: "PUT",
                body: JSON.stringify({
                    csrfToken: form.dataset.csrfToken,
                    displayName: target.displayName,
                    accessLevel,
                    permissions,
                    active: Boolean(Number(target.active))
                })
            });
            if (editingUser?.id === target.id) {
                editingUser = { ...editingUser, accessLevel, permissions };
                setDerivedAccessLevel(accessLevel);
                accessLevelInput.disabled = currentManagerLevel() !== 0 && accessLevel <= 1;
                accessButton.disabled = !canManageTarget(editingUser);
                statusButton.hidden = editingUser.username === window.appCurrentUser?.username
                    || (accessLevel <= 1 && currentManagerLevel() !== 0);
                draftPermissions = permissions;
                modalAccessLevel = accessLevel;
                updateStatusButton(Number(editingUser.active) === 1);
            }
            closeAccessModal();
            showMessage(`Kebenaran ${targetUsername} berjaya disimpan.`, "success");
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
            user.active = isActive ? 0 : 1;
            if (editingUser?.id === user.id) {
                updateStatusButton(!isActive);
            }
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
    searchInput.addEventListener("input", renderUsers);
    filterButton.addEventListener("click", () => {
        setFilterMenuOpen(!filterMenu.classList.contains("show"));
    });
    accessFilterOptions.forEach(option => {
        option.addEventListener("change", () => {
            renderUsers();
            setFilterMenuOpen(false);
        });
    });
    manageUsersPage.addEventListener("click", event => {
        if (filterMenu.contains(event.target) || filterButton.contains(event.target)) return;
        setFilterMenuOpen(false);
    });
    manageUsersPage.addEventListener("keydown", event => {
        if (event.key !== "Escape" || !filterMenu.classList.contains("show")) return;
        setFilterMenuOpen(false);
        filterButton.focus();
    });
    statusButton.addEventListener("click", () => {
        if (editingUser) toggleUserStatus(editingUser);
    });
    accessLevelInput.addEventListener("change", () => {
        if (isSyncingDerivedAccessLevel) return;
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
        const selectedAccessLevel = Number(accessLevelInput.value);
        const permissions = safePermissions(draftPermissions, selectedAccessLevel);
        const accessLevel = deriveAccessLevel(permissions, selectedAccessLevel);
        setDerivedAccessLevel(accessLevel);
        modalAccessLevel = accessLevel;
        draftPermissions = permissions;
        const payload = {
            csrfToken: form.dataset.csrfToken,
            username: usernameInput.value,
            displayName: displayNameInput.value.trim().toLocaleUpperCase(),
            accessLevel,
            permissions,
            password: passwordInput.value
        };
        if (!editingUser || payload.username !== editingUser.username) {
            if (!/^[a-z0-9.]{1,100}$/.test(payload.username)) {
                showMessage("Nama pengguna hanya boleh mengandungi huruf kecil, nombor dan titik (.).");
                saveButton.disabled = false;
                return;
            }
        }
        try {
            let successMessage;
            if (editingUser) {
                const editedUser = editingUser;
                const isCurrentUser = editedUser.username === window.appCurrentUser?.username;
                const result = await request(`/api/admin/users/${encodeURIComponent(editedUser.id)}`, {
                    method: "PUT",
                    body: JSON.stringify({
                        csrfToken: payload.csrfToken,
                        username: payload.username,
                        displayName: payload.displayName,
                        accessLevel: payload.accessLevel,
                        permissions: payload.permissions,
                        password: payload.password,
                        active: Boolean(Number(editedUser.active))
                    })
                });
                successMessage = `Akaun ${payload.username} berjaya dikemaskini.`;
                editingUser = {
                    ...editedUser,
                    username: result.username || payload.username,
                    displayName: payload.displayName,
                    accessLevel: payload.accessLevel,
                    permissions: payload.permissions
                };
                if (isCurrentUser) updateCurrentUserHeader(editingUser);
                passwordInput.value = "";
                passwordInput.required = false;
                passwordHint.textContent = "(biarkan kosong untuk kekalkan)";
                usernameInput.value = editingUser.username;
                usernameInput.readOnly = currentManagerLevel() !== 0;
                updateFormAvatar(editingUser.username);
                displayNameInput.value = editingUser.displayName;
                accessLevelInput.value = String(editingUser.accessLevel);
                accessLevelInput.disabled = currentManagerLevel() !== 0 && Number(editingUser.accessLevel) <= 1;
                accessLevelInput.dispatchEvent(new Event("change", { bubbles: true }));
                accessButton.disabled = !canManageTarget(editingUser);
                statusButton.hidden = editingUser.username === window.appCurrentUser?.username
                    || (Number(editingUser.accessLevel) <= 1 && currentManagerLevel() !== 0);
                updateStatusButton(Number(editingUser.active) === 1);
                draftPermissions = safePermissions(editingUser.permissions, Number(editingUser.accessLevel));
            } else {
                await request("/api/admin/users", {
                    method: "POST",
                    body: JSON.stringify(payload)
                });
                successMessage = `Akaun ${payload.username} berjaya ditambah.`;
                resetForm();
            }
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
    const pageLoadTask = request("/api/auth/me").then(data => {
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
    window.registerAppPageLoadTask(pageLoadTask);
}

document.addEventListener("app:page-loaded", initializeUserManagement);
if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initializeUserManagement, { once: true });
} else {
    initializeUserManagement();
}
