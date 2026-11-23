(() => {
    const rootElement = document.scrollingElement || document.documentElement;
    const records = new Map();
    const thickness = 5;
    const hideDelay = 800;
    let updateFrame = 0;

    const resizeObserver = typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(scheduleUpdateAll);

    function isRoot(element) {
        return element === rootElement;
    }

    function isOverflowContainer(element) {
        if (!element || element.nodeType !== Node.ELEMENT_NODE) return false;
        if (element.classList.contains("app-overlay-scrollbar") || element.classList.contains("app-overlay-scrollbar-thumb")) {
            return false;
        }
        if (isRoot(element)) return true;
        const style = window.getComputedStyle(element);
        return ["auto", "scroll", "overlay"].includes(style.overflowX)
            || ["auto", "scroll", "overlay"].includes(style.overflowY);
    }

    function getAxes(element) {
        const root = isRoot(element);
        const style = window.getComputedStyle(element);
        const horizontal = element.scrollWidth > element.clientWidth + 1
            && (root || ["auto", "scroll", "overlay"].includes(style.overflowX));
        const vertical = element.scrollHeight > element.clientHeight + 1
            && (root || ["auto", "scroll", "overlay"].includes(style.overflowY));
        return { horizontal, vertical };
    }

    function scheduleUpdateAll() {
        if (updateFrame) return;
        updateFrame = window.requestAnimationFrame(() => {
            updateFrame = 0;
            records.forEach(updateRecord);
        });
    }

    function scheduleHide(record) {
        window.clearTimeout(record.hideTimer);
        record.hideTimer = window.setTimeout(() => {
            if (record.dragging) return;
            Object.values(record.tracks).forEach(track => track.classList.remove("is-visible"));
        }, hideDelay);
    }

    function showRecord(record) {
        updateRecord(record);
        Object.values(record.tracks).forEach(track => {
            if (track.style.display !== "none") track.classList.add("is-visible");
        });
        if (record.dragging) {
            window.clearTimeout(record.hideTimer);
        } else {
            scheduleHide(record);
        }
    }

    function scrollFromPointer(record, axis, event, track, thumb, offset) {
        const isVertical = axis === "vertical";
        const trackLength = isVertical ? track.clientHeight : track.clientWidth;
        const thumbLength = isVertical ? thumb.offsetHeight : thumb.offsetWidth;
        const thumbRange = trackLength - thumbLength;
        const scrollRange = isVertical
            ? record.element.scrollHeight - record.element.clientHeight
            : record.element.scrollWidth - record.element.clientWidth;
        if (thumbRange <= 0 || scrollRange <= 0) return;

        const rect = track.getBoundingClientRect();
        const pointerPosition = isVertical ? event.clientY - rect.top : event.clientX - rect.left;
        const thumbPosition = Math.max(0, Math.min(thumbRange, pointerPosition - offset));
        const progress = thumbPosition / thumbRange;
        if (isVertical) {
            record.element.scrollTop = progress * scrollRange;
        } else {
            record.element.scrollLeft = progress * scrollRange;
        }
    }

    function createTrack(record, axis) {
        const track = document.createElement("div");
        track.className = `app-overlay-scrollbar is-${axis}`;
        track.setAttribute("aria-hidden", "true");
        const thumb = document.createElement("div");
        thumb.className = "app-overlay-scrollbar-thumb";
        track.appendChild(thumb);
        document.body.appendChild(track);

        track.addEventListener("pointerenter", event => {
            if (event.pointerType === "mouse" || event.pointerType === "pen") {
                showRecord(record);
            }
        });
        track.addEventListener("pointerleave", event => {
            if (event.pointerType === "mouse" || event.pointerType === "pen") {
                scheduleHide(record);
            }
        });

        let pointerDown = false;
        let dragOffset = 0;
        track.addEventListener("pointerdown", event => {
            if (event.button !== 0 || track.style.display === "none") return;
            const rect = thumb.getBoundingClientRect();
            const isVertical = axis === "vertical";
            const pointer = isVertical ? event.clientY : event.clientX;
            const start = isVertical ? rect.top : rect.left;
            const end = isVertical ? rect.bottom : rect.right;
            dragOffset = pointer >= start && pointer <= end
                ? pointer - start
                : (isVertical ? rect.height : rect.width) / 2;
            pointerDown = true;
            record.dragging = true;
            track.classList.add("is-visible", "is-dragging");
            track.setPointerCapture(event.pointerId);
            scrollFromPointer(record, axis, event, track, thumb, dragOffset);
            event.preventDefault();
        });
        track.addEventListener("pointermove", event => {
            if (pointerDown) {
                scrollFromPointer(record, axis, event, track, thumb, dragOffset);
            } else if (event.pointerType === "mouse" || event.pointerType === "pen") {
                showRecord(record);
            }
        });
        const endDrag = event => {
            if (!pointerDown) return;
            pointerDown = false;
            record.dragging = false;
            track.classList.remove("is-dragging");
            if (track.hasPointerCapture(event.pointerId)) track.releasePointerCapture(event.pointerId);
            scheduleHide(record);
        };
        track.addEventListener("pointerup", endDrag);
        track.addEventListener("pointercancel", endDrag);
        return track;
    }

    function createRecord(element) {
        const record = {
            element,
            tracks: {},
            dragging: false,
            hideTimer: 0
        };
        record.tracks.vertical = createTrack(record, "vertical");
        record.tracks.horizontal = createTrack(record, "horizontal");
        element.classList.add("has-app-overlay-scrollbar");
        records.set(element, record);
        resizeObserver?.observe(element);
        updateRecord(record);
    }

    function destroyRecord(element, record) {
        window.clearTimeout(record.hideTimer);
        resizeObserver?.unobserve(element);
        element.classList.remove("has-app-overlay-scrollbar");
        Object.values(record.tracks).forEach(track => track.remove());
        records.delete(element);
    }

    function syncElement(element) {
        const record = records.get(element);
        if (isOverflowContainer(element)) {
            if (!record) createRecord(element);
            else updateRecord(record);
        } else if (record) {
            destroyRecord(element, record);
        }
    }

    function scanSubtree(node) {
        if (!node || node.nodeType !== Node.ELEMENT_NODE) return;
        syncElement(node);
        node.querySelectorAll("*").forEach(syncElement);
    }

    function detachSubtree(node) {
        if (!node || node.nodeType !== Node.ELEMENT_NODE) return;
        const elements = [node, ...node.querySelectorAll("*")];
        elements.forEach(element => {
            const record = records.get(element);
            if (record) destroyRecord(element, record);
        });
    }

    function updateRecord(record) {
        const { element, tracks } = record;
        const axes = getAxes(element);
        const root = isRoot(element);
        const rect = root
            ? { top: 0, right: window.innerWidth, bottom: window.innerHeight, left: 0, width: window.innerWidth, height: window.innerHeight }
            : element.getBoundingClientRect();
        const offscreen = rect.bottom <= 0 || rect.top >= window.innerHeight || rect.right <= 0 || rect.left >= window.innerWidth;

        ["vertical", "horizontal"].forEach(axis => {
            const track = tracks[axis];
            const thumb = track.firstElementChild;
            const active = axis === "vertical" ? axes.vertical : axes.horizontal;
            if (!active || offscreen) {
                track.style.display = "none";
                track.classList.remove("is-visible");
                return;
            }
            track.style.display = "block";
            if (axis === "vertical") {
                const length = Math.max(0, rect.height - (axes.horizontal ? thickness : 0));
                const thumbLength = Math.min(length, Math.max(24, length * element.clientHeight / element.scrollHeight));
                const range = element.scrollHeight - element.clientHeight;
                const thumbRange = Math.max(0, length - thumbLength);
                const offset = range > 0 ? (element.scrollTop / range) * thumbRange : 0;
                track.style.left = `${rect.right - thickness}px`;
                track.style.top = `${rect.top}px`;
                track.style.width = `${thickness}px`;
                track.style.height = `${length}px`;
                thumb.style.width = "100%";
                thumb.style.height = `${thumbLength}px`;
                thumb.style.transform = `translateY(${offset}px)`;
            } else {
                const length = Math.max(0, rect.width - (axes.vertical ? thickness : 0));
                const thumbLength = Math.min(length, Math.max(24, length * element.clientWidth / element.scrollWidth));
                const range = element.scrollWidth - element.clientWidth;
                const thumbRange = Math.max(0, length - thumbLength);
                const offset = range > 0 ? (element.scrollLeft / range) * thumbRange : 0;
                track.style.left = `${rect.left}px`;
                track.style.top = `${rect.bottom - thickness}px`;
                track.style.width = `${length}px`;
                track.style.height = `${thickness}px`;
                thumb.style.height = "100%";
                thumb.style.width = `${thumbLength}px`;
                thumb.style.transform = `translateX(${offset}px)`;
            }
        });
    }

    function handleScroll(event) {
        const target = event.target === document ? rootElement : event.target;
        const record = records.get(target);
        if (record) showRecord(record);
        scheduleUpdateAll();
    }

    function handlePointerMove(event) {
        if (event.pointerType !== "mouse" && event.pointerType !== "pen") return;
        let element = event.target instanceof Element ? event.target : null;
        while (element) {
            const record = records.get(element);
            if (record) {
                const axes = getAxes(element);
                if (axes.horizontal || axes.vertical) {
                    showRecord(record);
                    return;
                }
            }
            element = element.parentElement;
        }
    }

    function initialize() {
        scanSubtree(document.documentElement);
        document.addEventListener("scroll", handleScroll, { capture: true, passive: true });
        document.addEventListener("pointermove", handlePointerMove, { passive: true });
        window.addEventListener("resize", scheduleUpdateAll, { passive: true });

        const observer = new MutationObserver(mutations => {
            let needsUpdate = false;
            mutations.forEach(mutation => {
                if (mutation.type === "attributes") {
                    if (!mutation.target.classList.contains("app-overlay-scrollbar")
                        && !mutation.target.classList.contains("app-overlay-scrollbar-thumb")) {
                        syncElement(mutation.target);
                        needsUpdate = true;
                    }
                    return;
                }
                if (mutation.type === "characterData") {
                    needsUpdate = true;
                    return;
                }
                mutation.addedNodes.forEach(scanSubtree);
                mutation.removedNodes.forEach(detachSubtree);
                needsUpdate = true;
            });
            if (needsUpdate) scheduleUpdateAll();
        });
        observer.observe(document.documentElement, {
            attributes: true,
            attributeFilter: ["class", "style"],
            characterData: true,
            childList: true,
            subtree: true
        });
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initialize, { once: true });
    } else {
        initialize();
    }
})();
