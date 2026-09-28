document.addEventListener("DOMContentLoaded", async () => {
    const sidebarContainer =
        document.getElementById("sidebar");

    const headerContainer =
        document.getElementById("header");

    function initCustomScrollbar() {
        if (!document.querySelector(".main-content") ||
            document.querySelector(".custom-scrollbar")) {
            return;
        }

        const scrollbar = document.createElement("div");
        scrollbar.className = "custom-scrollbar";
        scrollbar.innerHTML = '<div class="custom-scrollbar-thumb"></div>';
        document.body.appendChild(scrollbar);

        const thumb = scrollbar.firstElementChild;
        let observedMain = null;
        const update = () => {
            const main = document.querySelector(".main-content");
            if (!main) {
                scrollbar.hidden = true;
                return;
            }
            if (observedMain !== main) {
                observedMain = main;
                main.addEventListener("scroll", update, { passive: true });
            }

            const scrollable = main.scrollHeight - main.clientHeight;
            const trackHeight = scrollbar.clientHeight;
            const thumbHeight = scrollable > 0
                ? Math.max(32, trackHeight * main.clientHeight / main.scrollHeight)
                : trackHeight;
            const maxTop = trackHeight - thumbHeight;
            thumb.style.height = `${thumbHeight}px`;
            thumb.style.transform =
                `translateY(${scrollable > 0 ? maxTop * main.scrollTop / scrollable : 0}px)`;
            scrollbar.hidden = scrollable <= 0;
        };

        window.addEventListener("resize", update);
        document.addEventListener("app:page-loaded", update);
        new MutationObserver(update).observe(document.body, {
            childList: true,
            subtree: true
        });
        update();
    }

    try {
        if (sidebarContainer) {
            const response =
                await fetch("/sidebar");

            if (!response.ok) {
                throw new Error(
                    `Sidebar HTTP ${response.status}`
                );
            }

            sidebarContainer.innerHTML =
                await response.text();
        }

        if (headerContainer) {
            const response =
                await fetch("/header");

            if (!response.ok) {
                throw new Error(
                    `Header HTTP ${response.status}`
                );
            }

            headerContainer.innerHTML =
                await response.text();

            if (typeof window.initHeader === "function") {
                await window.initHeader();
            }
        }

        document.dispatchEvent(new Event("layout:ready"));
        initCustomScrollbar();
    }
    catch (error) {
        console.error(
            "Layout loading error:",
            error
        );
        document.dispatchEvent(new Event("layout:ready"));
    }
});