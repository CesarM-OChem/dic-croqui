import React, { useState } from "react";
import { makeCombinations, allocateTreatments } from "./allocator";
import Plate from "./Plate";

function FieldSet({ idx, factor, onChange, onRemove }) {
  return (
    <div style={{ display:'flex', gap:8, alignItems:'flex-end', marginBottom:8 }}>
      <div style={{flex:1}}>
        <label>Nome do fator</label>
        <input type="text" value={factor.name} onChange={e=> onChange(idx, {...factor, name: e.target.value})} />
      </div>
      <div style={{width:140}}>
        <label># Níveis</label>
        <input type="number" min={1} value={factor.n} onChange={e=> onChange(idx, {...factor, n: Math.max(1, parseInt(e.target.value||1))})} />
      </div>
      <div>
        <button className="small-btn" onClick={()=> onRemove(idx)}>Remover</button>
      </div>
    </div>
  );
}

export default function App() {
  const [reps, setReps] = useState(4);
  const [plateSize, setPlateSize] = useState(24);
  const [factors, setFactors] = useState([]);
  const [factorLevelsInput, setFactorLevelsInput] = useState({}); // temporary storage keyed by factor index
  const [controlsCount, setControlsCount] = useState(1);
  const [controlsInput, setControlsInput] = useState([]); // parsed array of control names
  const [controlsRaw, setControlsRaw] = useState(""); // raw text shown in the input (fixes the comma problem)
  const [seed, setSeed] = useState(Math.floor(Math.random()*1000000));
  const [result, setResult] = useState(null);

  function addFactor() {
    setFactors([...factors, { name: `Fator${factors.length+1}`, n: 2 }]);
  }
  function updateFactor(i, val) {
    const arr = factors.slice(); arr[i] = val; setFactors(arr);
  }
  function removeFactor(i) {
    const arr = factors.slice(); arr.splice(i,1); setFactors(arr);
    const copy = {...factorLevelsInput}; delete copy[i]; setFactorLevelsInput(copy);
  }

  function setLevelsForFactor(i, levelsStr) {
    // levelsStr: textarea lines or comma-separated
    const items = levelsStr.split(/\r?\n|,/).map(s=>s.trim()).filter(Boolean);
    setFactorLevelsInput({...factorLevelsInput, [i]: items});
  }

  function updateControlNames(str) {
    // keep raw text so the input shows exactly what user types (commas included)
    setControlsRaw(str);
    // parse to array (used elsewhere)
    const items = str.split(",").map(s=>s.trim()).filter(Boolean);
    setControlsInput(items);
    setControlsCount(items.length || 0);
  }

  function handleGenerate() {
    // ensure we parse latest raw controls (in case user hasn't blurred)
    if (controlsRaw) updateControlNames(controlsRaw);

    // validate factors have levels
    const factorDefs = factors.map((f, i) => {
      const levels = factorLevelsInput[i] && factorLevelsInput[i].length >= 1 ? factorLevelsInput[i] : Array.from({length: f.n}, (_,k)=> `${f.name}_L${k+1}`);
      return { name: f.name, levels };
    });

    const combos = makeCombinations(factorDefs, controlsInput);
    // combos contains treatments (including controls at end)
    const { numPlates, plates, mapping } = allocateTreatments({ treatments: combos, reps, plateSize, seed: parseInt(seed||0) });

    setResult({ numPlates, plates, mapping, combos, factorDefs });
    window.scrollTo({ top: 99999, behavior: 'smooth' });
  }

  function downloadCSV() {
    if (!result) return;
    // header
    const header = ["Tratamento"].concat(result.factorDefs.map(f=>f.name));
    const rows = result.mapping.map(m => {
      const levels = result.factorDefs.map(f => m.levels[f.name] || "");
      return [m.id].concat(levels);
    });
    const csv = [header, ...rows].map(r => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "mapa_tratamentos.csv";
    a.click();
  }

  async function exportPDF() {
    if (!result) return;
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF("p", "mm", "a4");
    const platesEls = document.querySelectorAll(".plate");
    for (let i=0;i<platesEls.length;i++) {
      const canvas = await window.html2canvas(platesEls[i], { scale: 2 });
      const imgData = canvas.toDataURL("image/png");
      const pageWidth = pdf.internal.pageSize.getWidth();
      const imgProps = pdf.getImageProperties(imgData);
      const imgHeight = (imgProps.height * pageWidth) / imgProps.width;
      if (i>0) pdf.addPage();
      pdf.addImage(imgData, "PNG", 0, 0, pageWidth, imgHeight);
    }
    pdf.save("placas.pdf");
  }

  return (
    <div className="container">
      <h1>DIC Croqui — Gerador</h1>

      <div className="form-row">
        <div className="form-col">
          <label>Número de repetições</label>
          <input type="number" min={1} value={reps} onChange={e=> setReps(Math.max(1, parseInt(e.target.value||1)))} />
        </div>

        <div className="form-col">
          <label>Tamanho da placa</label>
          <select value={plateSize} onChange={e=> setPlateSize(parseInt(e.target.value))}>
            <option value={6}>6 (2x3)</option>
            <option value={24}>24 (4x6)</option>
            <option value={48}>48 (6x8)</option>
            <option value={96}>96 (8x12)</option>
            <option value={384}>384 (16x24)</option>
          </select>
        </div>

        <div className="form-col">
          <label>Seed (opcional)</label>
          <input type="number" value={seed} onChange={e=> setSeed(e.target.value)} />
        </div>
      </div>

      <hr />

      <h3>Fatores</h3>
      <div>
        {factors.map((f, idx) => (
          <div key={idx}>
            <FieldSet idx={idx} factor={f} onChange={updateFactor} onRemove={removeFactor} />
            <div style={{marginBottom:12}}>
              <label>Digite os níveis (separar por vírgula ou linha):</label>
              <textarea rows={2} style={{width:'100%'}} onChange={e=> setLevelsForFactor(idx, e.target.value)} placeholder={`Se vazio, serão criados ${f.n} níveis automáticos`} />
            </div>
          </div>
        ))}
        <div style={{marginTop:6}}>
          <button onClick={addFactor}>+ Adicionar fator</button>
        </div>
      </div>

      <hr />

      <h3>Controles</h3>
      <div className="form-row">
        <div className="form-col">
          <label>Número de controles (digite nomes separados por vírgula)</label>
          <input
            type="text"
            value={controlsRaw}
            onChange={e=> updateControlNames(e.target.value)}
            placeholder="CTRL, Branco, Solvente"
          />
        </div>
      </div>

      <div style={{marginTop:14}}>
        <button onClick={handleGenerate}>Gerar e Casualizar</button>
        <button className="small-btn" onClick={()=> { setSeed(Math.floor(Math.random()*1000000)); }}>Nova Seed</button>
      </div>

      {result && (
        <>
          <div style={{marginTop:18}} className="controls">
            <strong>Placas geradas:</strong> {result.numPlates}
            <button className="small-btn" onClick={downloadCSV}>Baixar mapeamento CSV</button>
            <button className="small-btn" onClick={exportPDF}>Exportar PDF</button>
          </div>

          {/* Plates visual */}
          {result.plates.map(p => <Plate key={p.plateId} plate={p} />)}

          {/* mapping table */}
          <h3>Gabarito (Tratamento | níveis)</h3>
          <table className="mapping-table">
            <thead>
              <tr>
                <th>Tratamento</th>
                {result.factorDefs.map(f=> <th key={f.name}>{f.name}</th>)}
              </tr>
            </thead>
            <tbody>
              {result.mapping.map(m => (
                <tr key={m.id}>
                  <td>{m.id}</td>
                  {result.factorDefs.map(f=> <td key={f.name}>{m.levels[f.name] || ""}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
