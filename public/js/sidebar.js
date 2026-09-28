document.addEventListener("DOMContentLoaded", async () => {

    const sidebarContainer =
        document.getElementById("sidebar-container");

    if (!sidebarContainer) {
        return;
    }


    // =========================
    // LOAD SIDEBAR
    // =========================

    try {

        let sidebarHTML =
            sessionStorage.getItem("sidebarHTML");


        if (!sidebarHTML) {

            const response =
                await fetch("/sidebar");

            if (!response.ok) {
                throw new Error(
                    "Failed to load sidebar"
                );
            }

            sidebarHTML =
                await response.text();

            sessionStorage.setItem(
                "sidebarHTML",
                sidebarHTML
            );
        }


        sidebarContainer.innerHTML =
            sidebarHTML;


        // =========================
        // CURRENT PAGE
        // =========================

        setActivePage();


        // =========================
        // SIDEBAR NAVIGATION
        // =========================

        sidebarContainer
            .querySelectorAll("a")
            .forEach(link => {

                link.addEventListener(
                    "click",
                    () => {

                        sessionStorage.setItem(
                            "sidebarHTML",
                            sidebarContainer.innerHTML
                        );

                    }
                );

            });


    }

    catch (error) {

        console.error(
            "Sidebar error:",
            error
        );

    }


    // =========================
    // SET ACTIVE PAGE
    // =========================

    function setActivePage() {

        const currentPath =
            window.location.pathname;

        let currentPage;


        if (
            currentPath === "/" ||
            currentPath === ""
        ) {

            currentPage =
                "dashboard";

        }

        else if (
            currentPath === "/upload"
        ) {

            currentPage =
                "upload";

        }

        else if (
            currentPath === "/data-set"
        ) {

            currentPage =
                "data-set";

        }

        else if (
            currentPath === "/tables"
        ) {

            currentPage =
                "tables";

        }

        else if (
            currentPath === "/crud"
        ) {

            currentPage =
                "crud";

        }

        else if (
            currentPath === "/settings"
        ) {

            currentPage =
                "settings";

        }


        // =========================
        // REMOVE ACTIVE
        // =========================

        sidebarContainer
            .querySelectorAll(".nav-item")
            .forEach(item => {

                item.classList.remove(
                    "active"
                );

            });


        // =========================
        // SET ACTIVE
        // =========================

        if (currentPage) {

            const activeItem =
                sidebarContainer.querySelector(
                    `[data-page="${currentPage}"]`
                );

            if (activeItem) {

                activeItem.classList.add(
                    "active"
                );

            }

        }

    }

});