window.getTextAverageColor = function getTextAverageColor(value) {
    const letters = Array.from(String(value || "").toUpperCase())
        .filter(character => character >= "A" && character <= "Z");
    if (!letters.length) return "#808080";

    const letterColors = letters.map(character => {
        const alphabetIndex = character.charCodeAt(0) - 65;
        const colorIndex = alphabetIndex <= 12
            ? alphabetIndex * 2
            : (25 - alphabetIndex) * 2 + 1;
        const hue = colorIndex / 26 * 6;
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
        return rgb;
    });
    const baseColor = letterColors[0];
    const hintColors = letterColors.slice(1);
    const channels = baseColor.map((channel, index) => {
        if (!hintColors.length) return channel;
        const hintAverage = hintColors.reduce((total, color) => total + color[index], 0) / hintColors.length;
        return Math.round(channel * 0.8 + hintAverage * 0.2);
    });

    return `#${channels
        .map(channel => channel.toString(16).padStart(2, "0"))
        .join("")
        .toUpperCase()}`;
};

window.getInverseTextAverageColor = function getInverseTextAverageColor(value) {
    const color = window.getTextAverageColor(value);

    return `#${color.slice(1).match(/.{2}/g)
        .map(channel =>
            (255 - Number.parseInt(channel, 16))
                .toString(16)
                .padStart(2, "0")
        )
        .join("")
        .toUpperCase()}`;
};
