import React from "react";

// simple color palette generator
function palette(n) {
  const arr = [];
  for (let i=0;i<n;i++){
    const hue = Math.round((360 * i)/n);
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
  labels.forEach((l,i)=> labelColor[l] = pal[i]);

  const gridStyle = {
    display: "grid",
    gridTemplateColumns: `repeat(${cols}, 44px)`,
    gridAutoRows: '44px',
    gap: 6
  };

  return (
    <div className="plate">
      <h3>Placa {plateId} — {rows}x{cols}</h3>
      <div style={gridStyle} className="well-grid">
        {wells.map((w, idx) => {
          const bg = w.assigned ? labelColor[w.assigned.label] : "#fff";
          return (
            <div key={idx} className="well" title={`${w.coord} ${w.assigned ? w.assigned.label : ''}`} style={{ background: bg }}>
              <div style={{fontSize:10, position:'absolute', marginTop:-18, left:8}}>{w.coord}</div>
              <div>{w.assigned ? w.assigned.label : ""}</div>
            </div>
          );
        })}
      </div>

      <div className="legend">
        {labels.map(l => (
          <div key={l} className="legend-item">
            <div className="color-box" style={{background: labelColor[l]}}></div>
            <div style={{fontSize:13}}>{l}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
