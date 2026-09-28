document.addEventListener("DOMContentLoaded", async () => {
    const sidebarContainer =
        document.getElementById("sidebar");

    const headerContainer =
        document.getElementById("header");

    function initAppUpdateButton() {
        const button = sidebarContainer?.querySelector(".update-check-button");
        if (!button) {
            return;
        }

        const status = button.querySelector(".status-text");
        const title = button.querySelector(".status-title");
        const icon = button.querySelector(".update-check-icon i");
        if (!status || !title || !icon) {
            throw new Error("Update button is missing its status elements.");
        }

        button.addEventListener("click", async () => {
            button.disabled = true;
            button.classList.remove("has-update");
            title.textContent = "Menyemak Kemas Kini";
            status.textContent = "Menghubungi GitHub...";
            icon.className = "bi bi-arrow-repeat";

            try {
                const checkResponse = await fetch("/api/app-update/check", {
                    headers: { "Accept": "application/json" },
                    cache: "no-store"
                });
                const check = await checkResponse.json();
                if (!checkResponse.ok || !check.success) {
                    throw new Error(check.error || `Semakan gagal (HTTP ${checkResponse.status}).`);
                }

                if (!check.available) {
                    title.textContent = "Aplikasi Terkini";
                    status.textContent = `Versi ${check.latestCommit.slice(0, 7)} sudah digunakan`;
                    icon.className = "bi bi-check-circle";
                    return;
                }

                button.classList.add("has-update");
                title.textContent = "Kemas Kini Tersedia";
                status.textContent = `Versi ${check.latestCommit.slice(0, 7)} tersedia`;
                icon.className = "bi bi-cloud-arrow-down";
                if (!window.confirm("Kemas kini tersedia. Muat turun dan pasang sekarang? Database, muat naik dan konfigurasi tempatan akan dikekalkan.")) {
                    return;
                }

                title.textContent = "Memasang Kemas Kini";
                status.textContent = "Muat turun dan ganti fail aplikasi...";
                icon.className = "bi bi-arrow-repeat";
                const installResponse = await fetch("/api/app-update/install", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "Accept": "application/json"
                    },
                    body: JSON.stringify({
                        commit: check.latestCommit,
                        csrfToken: button.dataset.csrfToken
                    })
                });
                const install = await installResponse.json();
                if (!installResponse.ok || !install.success) {
                    throw new Error(install.error || `Pemasangan gagal (HTTP ${installResponse.status}).`);
                }

                title.textContent = "Kemas Kini Selesai";
                status.textContent = "Memuat semula aplikasi...";
                window.setTimeout(() => window.location.reload(), 900);
            } catch (error) {
                console.error("App update failed:", error);
                title.textContent = "Kemas Kini Gagal";
                status.textContent = error.message || "Tidak dapat menyemak kemas kini.";
                icon.className = "bi bi-exclamation-circle";
            } finally {
                button.disabled = false;
            }
        });
    }

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
            initAppUpdateButton();
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