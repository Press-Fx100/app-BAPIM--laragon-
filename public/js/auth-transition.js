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

    const prefersReducedMotion =
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const animation = card.animate(
        [
            { opacity: 1, transform: "translateY(0) scale(1)" },
            {
                opacity: 0,
                transform: prefersReducedMotion
                    ? "translateY(-10px)"
                    : "translateY(-24px) scale(.985)"
            }
        ],
        {
            duration: prefersReducedMotion ? 80 : 120,
            easing: "ease-in",
            fill: "forwards"
        }
    );

    const navigate = () => {
        window.location.assign(link.href);
    };
    animation.onfinish = navigate;
    animation.oncancel = navigate;
});
