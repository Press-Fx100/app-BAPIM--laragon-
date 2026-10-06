window.getTextAverageColor = function getTextAverageColor(value) {
    const letters = Array.from(String(value || "").toUpperCase())
        .filter(character => character >= "A" && character <= "Z");
    if (!letters.length) return "#808080";

    const channels = letters.reduce((totals, character) => {
        const hue = (character.charCodeAt(0) - 65) / 26 * 6;
        const sector = Math.floor(hue);
        const fraction = hue - sector;
        const descending = Math.round(255 * (1 - fraction));
        const ascending = Math.round(255 * fraction);
        const rgb = [
            [255, ascending, 0],
            [descending, 255, 0],
            [0, 255, ascending],
            [0, descending, 255],
            [ascending, 0, 255],
            [255, 0, descending]
        ][sector];

        totals[0] += rgb[0];
        totals[1] += rgb[1];
        totals[2] += rgb[2];
        return totals;
    }, [0, 0, 0]);

    return `#${channels
        .map(channel => Math.round(channel / letters.length).toString(16).padStart(2, "0"))
        .join("")
        .toUpperCase()}`;
};
