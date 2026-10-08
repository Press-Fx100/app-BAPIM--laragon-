const releaseNotes = [
    {
        date: "2026-10-08",
        items: [
            "Tetapan Akaun Pengguna kini menggunakan susun atur yang sepadan dengan Pengurusan Pengguna.",
            "Akses Papan Pemuka sentiasa dikekalkan, dan Admin boleh mengemas kini akaun sendiri tanpa mengurus akaun Admin lain.",
            "Warna pengguna dan carta diperhalus, legenda carta bar dijajarkan ke kiri, dan animasi tajuk halaman dipulihkan."
        ]
    },
    {
        date: "2026-10-06",
        items: [
            "Halaman Akaun Pengguna membolehkan nama paparan dan kata laluan dikemas kini.",
            "Menu pengguna kini mempunyai animasi yang lebih lancar."
        ]
    },
    {
        date: "2026-10-05",
        items: [
            "Penambahbaikan pada jadual penerima bantuan dan peserta program, termasuk eksport Excel dan pengurusan status pekerjaan.",
            "Halaman Aktiviti Pengguna dan warna pengguna dikemas kini supaya aktiviti lebih mudah dibaca."
        ]
    },
    {
        date: "2026-10-02",
        items: [
            "Carta aktiviti diperhalus untuk memudahkan semakan trend.",
            "Data contoh dikeluarkan daripada paparan carta."
        ]
    },
    {
        date: "2026-09-29",
        items: [
            "Penambahbaikan pada penyuntingan rekod penerima bantuan.",
            "Aplikasi boleh dijalankan dari subfolder web, termasuk pemasangan Laragon."
        ]
    }
];

let releaseNotesObserver = null;
let initializedReleaseNotesList = null;

function initializeReleaseNotes() {
    const list = document.getElementById("releaseNotesList");
    if (!list || list === initializedReleaseNotesList) {
        return;
    }

    const dateFormatter = new Intl.DateTimeFormat("ms-MY", {
        day: "numeric",
        month: "long",
        year: "numeric"
    });
    const sortedReleaseNotes = [...releaseNotes]
        .sort((first, second) => second.date.localeCompare(first.date));
    const pageSize = 10;
    let nextReleaseNoteIndex = 0;

    releaseNotesObserver?.disconnect();
    initializedReleaseNotesList = list;
    list.replaceChildren();

    const sentinel = document.createElement("li");
    sentinel.className = "release-note-sentinel";
    sentinel.style.height = "1px";
    sentinel.setAttribute("aria-hidden", "true");
    list.append(sentinel);

    const appendNextBatch = () => {
        const batch = sortedReleaseNotes.slice(
            nextReleaseNoteIndex,
            nextReleaseNoteIndex + pageSize
        );
        const entries = batch.map(release => {
            const entry = document.createElement("li");
            entry.className = "release-note";

            const date = document.createElement("time");
            date.className = "release-note-date";
            date.dateTime = release.date;
            date.textContent = dateFormatter.format(new Date(`${release.date}T12:00:00`));

            const changes = document.createElement("ul");
            changes.className = "release-note-changes";
            release.items.forEach(text => {
                const item = document.createElement("li");
                item.textContent = text;
                changes.append(item);
            });

            entry.append(date, changes);
            return entry;
        });

        sentinel.before(...entries);
        nextReleaseNoteIndex += batch.length;

        if (nextReleaseNoteIndex >= sortedReleaseNotes.length) {
            releaseNotesObserver?.disconnect();
            sentinel.remove();
        }
    };

    appendNextBatch();
    if (nextReleaseNoteIndex < sortedReleaseNotes.length) {
        const scrollContainer = list.closest(".main-content");
        releaseNotesObserver = new IntersectionObserver(entries => {
            if (entries.some(entry => entry.isIntersecting)) {
                appendNextBatch();
            }
        }, {
            root: scrollContainer,
            rootMargin: "0px 0px 120px 0px"
        });
        releaseNotesObserver.observe(sentinel);
    }
}

document.addEventListener("app:page-loaded", initializeReleaseNotes);
if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initializeReleaseNotes, { once: true });
} else {
    initializeReleaseNotes();
}
