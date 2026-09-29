(function () {
    "use strict";

    function getUsername() {
        return localStorage.getItem("loggedInUser") || "";
    }

    function getDisplayName() {
        return (
            localStorage.getItem("displayName") ||
            getUsername()
        );
    }

    function isLoggedIn() {
        const username = getUsername();
        const session =
            localStorage.getItem("loginSession");

        return Boolean(
            username &&
            session === "active"
        );
    }

    function requireLogin() {
        if (isLoggedIn()) {
            console.log(
                `[AUTH] Session active: ${getUsername()}`
            );

            return true;
        }

        console.log(
            "[AUTH] No active session. Redirecting to login."
        );

        window.location.replace(
            typeof window.appUrl === "function" ? window.appUrl("/login") : "/login"
        );

        return false;
    }

    function getCurrentUser() {
        if (!isLoggedIn()) {
            return null;
        }

        return {
            username: getUsername(),
            displayName: getDisplayName()
        };
    }

    function logout() {
        const username = getUsername();

        console.log(
            `[AUTH] Logging out: ${username}`
        );

        localStorage.removeItem(
            "loggedInUser"
        );

        localStorage.removeItem(
            "displayName"
        );

        localStorage.removeItem(
            "loginSession"
        );

        window.location.replace(
            typeof window.appUrl === "function" ? window.appUrl("/login") : "/login"
        );
    }

    window.Auth = {
        isLoggedIn,
        requireLogin,
        getCurrentUser,
        getUsername,
        getDisplayName,
        logout
    };
})();