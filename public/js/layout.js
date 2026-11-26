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
                if (!await window.confirmBpaAction({
                    titleText: "Kemas kini tersedia",
                    messageText: "Muat turun dan pasang kemas kini? Data dan konfigurasi tempatan akan dikekalkan, dan migrasi pangkalan data akan dijalankan jika disertakan.",
                    confirmText: "Pasang kemas kini"
                })) {
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
                const migrationCount = install.databaseMigrations?.length || 0;
                status.textContent = migrationCount
                    ? `${migrationCount} migrasi pangkalan data selesai. Memuat semula...`
                    : "Memuat semula aplikasi...";
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
        const main = document.querySelector(".main-content");
        if (main && !document.querySelector(".custom-scrollbar")) {
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

        const trackedTargets = new Map();
        let refreshFrame = 0;
        let positionFrame = 0;
        const resizeObserver = typeof ResizeObserver === "function"
            ? new ResizeObserver(scheduleRefresh)
            : null;

        function scheduleRefresh() {
            if (refreshFrame) return;
            refreshFrame = requestAnimationFrame(() => {
                refreshFrame = 0;
                refresh();
            });
        }

        function schedulePositions() {
            if (positionFrame) return;
            positionFrame = requestAnimationFrame(() => {
                positionFrame = 0;
                trackedTargets.forEach(targetRecords => {
                    targetRecords.forEach(updateTrack);
                });
            });
        }

        function createTrack(target, axis, targetRecords) {
            const track = document.createElement("div");
            track.className = `overlay-scrollbar overlay-scrollbar--${axis}`;
            const thumb = document.createElement("div");
            thumb.className = "overlay-scrollbar-thumb";
            track.appendChild(thumb);
            document.body.appendChild(track);

            const record = { target, axis, track, thumb };
            targetRecords.set(axis, record);
            trackedTargets.set(target, targetRecords);
            target.classList.add("overlay-scrollbar-hidden");
            resizeObserver?.observe(target);

            let pointerStart = 0;
            let scrollStart = 0;
            thumb.addEventListener("pointerdown", event => {
                if (event.button !== 0) return;
                event.preventDefault();
                pointerStart = axis === "vertical" ? event.clientY : event.clientX;
                scrollStart = axis === "vertical" ? target.scrollTop : target.scrollLeft;
                thumb.setPointerCapture(event.pointerId);
            });
            thumb.addEventListener("pointermove", event => {
                if (!thumb.hasPointerCapture(event.pointerId)) return;
                const trackSize = axis === "vertical"
                    ? target.clientHeight
                    : target.clientWidth;
                const thumbSize = axis === "vertical"
                    ? thumb.offsetHeight
                    : thumb.offsetWidth;
                const scrollSize = axis === "vertical"
                    ? target.scrollHeight - target.clientHeight
                    : target.scrollWidth - target.clientWidth;
                const maxThumbOffset = trackSize - thumbSize;
                if (maxThumbOffset <= 0 || scrollSize <= 0) return;

                const pointer = axis === "vertical" ? event.clientY : event.clientX;
                const scrollPosition = scrollStart
                    + (pointer - pointerStart) / maxThumbOffset * scrollSize;
                if (axis === "vertical") {
                    target.scrollTop = scrollPosition;
                } else {
                    target.scrollLeft = scrollPosition;
                }
            });

            return record;
        }

        function removeTrack(target, axis, targetRecords) {
            const record = targetRecords.get(axis);
            if (!record) return;
            record.track.remove();
            targetRecords.delete(axis);
            if (targetRecords.size === 0) {
                target.classList.remove("overlay-scrollbar-hidden");
                trackedTargets.delete(target);
                resizeObserver?.unobserve(target);
            }
        }

        function updateTrack(record) {
            const { target, axis, track, thumb } = record;
            if (!target.isConnected) {
                track.remove();
                return;
            }

            const isVertical = axis === "vertical";
            const rect = target.getBoundingClientRect();
            const trackSize = isVertical ? target.clientHeight : target.clientWidth;
            const scrollSize = isVertical
                ? target.scrollHeight - target.clientHeight
                : target.scrollWidth - target.clientWidth;
            if (trackSize <= 0 || scrollSize <= 0) {
                track.hidden = true;
                return;
            }

            track.hidden = false;
            const thumbSize = Math.min(
                trackSize,
                Math.max(32, trackSize * trackSize / (trackSize + scrollSize))
            );
            const maxThumbOffset = trackSize - thumbSize;
            const scrollPosition = isVertical ? target.scrollTop : target.scrollLeft;
            const offset = scrollSize > 0
                ? maxThumbOffset * scrollPosition / scrollSize
                : 0;

            if (isVertical) {
                track.style.left = `${rect.left + target.clientLeft + target.clientWidth - 8}px`;
                track.style.top = `${rect.top + target.clientTop}px`;
                track.style.width = "8px";
                track.style.height = `${trackSize}px`;
                thumb.style.width = "8px";
                thumb.style.height = `${thumbSize}px`;
                thumb.style.transform = `translateY(${offset}px)`;
            } else {
                track.style.left = `${rect.left + target.clientLeft}px`;
                track.style.top = `${rect.top + target.clientTop + target.clientHeight - 8}px`;
                track.style.width = `${trackSize}px`;
                track.style.height = "8px";
                thumb.style.width = `${thumbSize}px`;
                thumb.style.height = "8px";
                thumb.style.transform = `translateX(${offset}px)`;
            }
        }

        function refresh() {
            const elements = new Set(document.querySelectorAll("body *"));
            if (document.scrollingElement) {
                elements.add(document.scrollingElement);
            }

            elements.forEach(target => {
                if (
                    target.matches(".custom-scrollbar, .overlay-scrollbar") ||
                    (target.matches(".main-content") && window.innerWidth > 768) ||
                    (target === document.body && target !== document.scrollingElement)
                ) {
                    return;
                }

                const style = getComputedStyle(target);
                const targetRecords = trackedTargets.get(target) || new Map();
                const canScrollVertically = ["auto", "scroll", "overlay"].includes(style.overflowY)
                    && target.scrollHeight > target.clientHeight + 1;
                const canScrollHorizontally = ["auto", "scroll", "overlay"].includes(style.overflowX)
                    && target.scrollWidth > target.clientWidth + 1;

                if (canScrollVertically) {
                    const record = targetRecords.get("vertical")
                        || createTrack(target, "vertical", targetRecords);
                    updateTrack(record);
                } else {
                    removeTrack(target, "vertical", targetRecords);
                }

                if (canScrollHorizontally) {
                    const record = targetRecords.get("horizontal")
                        || createTrack(target, "horizontal", targetRecords);
                    updateTrack(record);
                } else {
                    removeTrack(target, "horizontal", targetRecords);
                }
            });

            [...trackedTargets.keys()].forEach(target => {
                if (target.isConnected) return;
                trackedTargets.get(target).forEach(record => record.track.remove());
                trackedTargets.delete(target);
            });
        }

        document.addEventListener("scroll", schedulePositions, true);
        window.addEventListener("resize", scheduleRefresh);
        document.addEventListener("app:page-loaded", scheduleRefresh);
        const mutationObserver = new MutationObserver(records => {
            if (records.some(record => !record.target.closest?.(".overlay-scrollbar"))) {
                scheduleRefresh();
            }
        });
        mutationObserver.observe(document.body, {
            attributes: true,
            attributeFilter: ["class", "style"],
            childList: true,
            characterData: true,
            subtree: true
        });
        scheduleRefresh();
    }

    try {
        if (sidebarContainer) {
            const response =
                await fetch("/sidebar", {
                    headers: { "X-App-Component": "true" }
                });

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
                await fetch("/header", {
                    headers: { "X-App-Component": "true" }
                });

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