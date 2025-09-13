import React from "react";

// simple color palette generator
function palette(n) {
  const arr = [];
  for (let i = 0; i < n; i++) {
    const hue = Math.round((360 * i) / n);
    arr.push(`hsl(${hue} 70% 55%)`);
  }
  return arr;
}

export default function Plate({ plate }) {
  const { rows, cols, wells, plateId } = plate;

  // collect unique labels for legend and assign colors
  const labels = [];
  wells.forEach(w => {
    if (w.assigned) {
      if (!labels.includes(w.assigned.label)) labels.push(w.assigned.label);
    }
  });
  const pal = palette(Math.max(1, labels.length));
  const labelColor = {};
  labels.forEach((l, i) => (labelColor[l] = pal[i]));

  // calcular tamanho dos poços com base no número de caracteres do maior texto
  let charNumber = 0;
  let maxLines = 1;
  let minHeight = 0;
  let minWidth = 36;

  wells.forEach(w => {
    const displayLabel = w.assigned?.label?.replace(/\|/g, "\n") || "";
    const text = `${w.coord}${displayLabel}`;
    const lines = text.split("\n");

    if (lines.length > maxLines) maxLines = lines.length;

    const maxLineLength = Math.max(...lines.map(l => l.length));
    if (maxLineLength > charNumber) charNumber = maxLineLength;
  });

  minWidth = charNumber * 8 + 20;
  minHeight = maxLines * 12 + 36;

  const gridStyle = {
    display: "grid",
    gridTemplateColumns: `repeat(${cols}, 44px)`,
    gridAutoRows: "44px",
    columnGap: 6 + minWidth / 1.25,
    rowGap: minHeight
  };

  return (
    <div className="plate">
      <h3>
        Placa {plateId} — {rows}x{cols}
      </h3>
      <div className="plate-content">
        <div style={gridStyle} className="well-grid">
          {wells.map((w, idx) => {
            const displayLabel = w.assigned?.label?.replace(/\|/g, "\n") || "";
            const bg = w.assigned ? labelColor[w.assigned.label] : "#fff";
            return (
              <div
                key={idx}
                className="well"
                title={`${w.coord} ${w.assigned ? w.assigned.label : ""}`}
                style={{
                  background: bg,
                  minHeight: `${minHeight}px`,
                  minWidth: `${minWidth}px`
                }}
              >
                <div style={{ whiteSpace: "pre-line" }}>{displayLabel}</div>
              </div>
            );
          })}
        </div>

        <div className="legend">
          {labels.map(l => (
            <div key={l} className="legend-item">
              <div
                className="color-box"
                style={{ background: labelColor[l] }}
              ></div>
              <div style={{ fontSize: 13 }}>{l}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
