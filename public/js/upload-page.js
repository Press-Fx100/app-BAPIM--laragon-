let datasetUploadForm;
let datasetUploadFile;
let datasetUploadName;
let datasetUploadFileName;
let datasetUploadMessage;
let datasetUploadSubmit;

function setUploadMessage(message, type = "") {
    if (!datasetUploadMessage) {
        return;
    }

    datasetUploadMessage.textContent = message;
    datasetUploadMessage.hidden = !message;
    datasetUploadMessage.className =
        `upload-message ${type}`.trim();
}

function initializeUploadPage() {
    const uploadCard = document.getElementById("uploadFloatingCard");

    if (uploadCard) {
        return;
    }

    datasetUploadForm =
        document.getElementById("datasetUploadForm");
    datasetUploadFile =
        document.getElementById("datasetUploadFile");
    datasetUploadName =
        document.getElementById("datasetUploadName");
    datasetUploadFileName =
        document.getElementById("datasetUploadFileName");
    datasetUploadMessage =
        document.getElementById("datasetUploadMessage");
    datasetUploadSubmit =
        document.getElementById("datasetUploadSubmit");

    if (
        !datasetUploadForm ||
        datasetUploadForm.dataset.initialized === "true"
    ) {
        return;
    }

    datasetUploadForm.dataset.initialized = "true";

    datasetUploadFile.addEventListener("change", () => {
        const file = datasetUploadFile.files?.[0];

        if (!file) {
            datasetUploadFileName.textContent = "Tiada fail dipilih";
            return;
        }

        datasetUploadFileName.textContent =
            `${file.name} (${Math.ceil(file.size / 1024)} KB)`;

        if (!datasetUploadName.value.trim()) {
            datasetUploadName.value =
                file.name.replace(/\.(csv|xlsx|xls)$/i, "");
        }
    });

    datasetUploadForm.addEventListener("submit", async event => {
        event.preventDefault();

        const file = datasetUploadFile.files?.[0];

        if (!file) {
            setUploadMessage("Please choose a file first.", "error");
            return;
        }

        const formData = new FormData(datasetUploadForm);
        datasetUploadSubmit.disabled = true;
        setUploadMessage("Importing dataset...");

        try {
            const response = await fetch("/api/datasets", {
                method: "POST",
                body: formData
            });
            const result = await response.json();

            if (!response.ok || !result.success) {
                throw new Error(
                    result.error || "Unable to import dataset."
                );
            }

            setUploadMessage(
                "Dataset imported successfully.",
                "success"
            );

            window.setTimeout(() => {
                window.dispatchEvent(
                    new CustomEvent("app:navigate", {
                        detail: { url: "/set-data" }
                    })
                );
            }, 350);
        } catch (error) {
            console.error("Dataset upload error:", error);
            setUploadMessage(error.message, "error");
            datasetUploadSubmit.disabled = false;
        }
    });
}

if (document.readyState === "loading") {
    document.addEventListener(
        "DOMContentLoaded",
        initializeUploadPage,
        { once: true }
    );
} else {
    initializeUploadPage();
}

document.addEventListener(
    "app:page-loaded",
    initializeUploadPage
);
