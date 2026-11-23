(function () {
    const transitionDuration = 220;

    function animateAuthPageTransition(element, direction = "exit") {
        if (!element || typeof element.animate !== "function") {
            return Promise.resolve();
        }

        const entering = direction === "enter";
        const animation = element.animate(
            entering
                ? [
                    { opacity: 0 },
                    { opacity: 1 }
                ]
                : [
                    { opacity: 1 },
                    { opacity: 0 }
                ],
            {
                duration: transitionDuration,
                easing: entering ? "ease-out" : "ease-in",
                fill: entering ? "both" : "forwards"
            }
        );

        return new Promise(resolve => {
            let finished = false;
            const finish = () => {
                if (finished) return;
                finished = true;
                window.clearTimeout(timeout);
                resolve();
            };
            const timeout = window.setTimeout(finish, transitionDuration + 100);
            animation.addEventListener("finish", finish, { once: true });
            animation.addEventListener("cancel", finish, { once: true });
        });
    }

    window.animateAuthPageTransition = animateAuthPageTransition;

    document.addEventListener("app:initial-page-ready", () => {
        try {
            if (sessionStorage.getItem("authTransition") !== "login") {
                return;
            }
            sessionStorage.removeItem("authTransition");
        } catch (error) {
            console.error("Could not read the login transition state:", error);
            return;
        }
        animateAuthPageTransition(
            document.querySelector(".app-wrapper"),
            "enter"
        );
        document.body.classList.remove("auth-login-transition");
    }, { once: true });
})();

document.addEventListener("click", event => {
    const link = event.target.closest(
        ".login-card .back-login a, .create-account-card .back-login a"
    );
    if (
        !link ||
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey ||
        link.target ||
        link.hasAttribute("download")
    ) {
        return;
    }

    const card = link.closest(".login-card, .create-account-card");
    if (!card || typeof card.animate !== "function") {
        return;
    }
    if (link.dataset.transitioning === "true") return;

    event.preventDefault();
    link.dataset.transitioning = "true";
    link.setAttribute("aria-disabled", "true");

    const navigate = () => {
        window.location.assign(link.href);
    };
    window.animateAuthPageTransition(card).then(navigate);
});
