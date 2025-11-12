window.jsPDF = window.jspdf.jsPDF;

// === Cálculo checksum EAN-13 ===
function ean13Checksum(code12) {
  const digits = code12.split('').map(Number);
  const sum = digits.reduce((acc, d, i) => acc + d * (i % 2 ? 3 : 1), 0);
  const mod = sum % 10;
  return mod === 0 ? 0 : 10 - mod;
}

// === Agregar fila con validación ===
function addRow() {
  const tbody = document.querySelector("#tabla tbody");
  const filas = tbody.rows;

  // Si no hay filas, simplemente crea la primera
  if (filas.length === 0) {
    crearFila(tbody);
    return;
  }

  // Validar última fila antes de agregar una nueva
  const lastRow = filas[filas.length - 1];
  const cells = lastRow.querySelectorAll("td[contenteditable='true']");

  let incompleta = false;
  for (let cell of cells) {
    if (!cell.innerText.trim()) {
      incompleta = true;
      break;
    }
  }

  if (incompleta) {
    lastRow.classList.add("row-error");
    alert("⚠️ Complete todos los campos antes de agregar una nueva fila.");
    return;
  }

  lastRow.classList.remove("row-error");
  crearFila(tbody);
}

// === Función auxiliar para crear una nueva fila con placeholders ===
function crearFila(tbody) {
  const row = tbody.insertRow();
  const placeholders = [
    "Ingrese Sucursal",
    "Ingrese Área",
    "Ingrese O/C",
    "Ingrese Código",
    "Cantidad"
  ];

  for (let i = 0; i < placeholders.length; i++) {
    const cell = row.insertCell();
    cell.contentEditable = "true";
    cell.setAttribute("data-placeholder", placeholders[i]);
  }

  const del = row.insertCell();
  del.innerHTML = '<button onclick="deleteRow(this)">✖</button>';
}

// === Eliminar fila ===
function deleteRow(btn) {
  btn.closest("tr").remove();
}

// === Limpiar errores visuales ===
function clearRowErrors() {
  document.querySelectorAll("#tabla tbody tr").forEach(tr => {
    tr.classList.remove("row-error");
  });
}

// === Validación del código de barras según formato ===
function validateCode(code, format) {
  if (!format) return "Debe seleccionar un formato de código.";
  if (!code) return "El código está vacío.";

  const isNumeric = /^\d+$/.test(code);

  if (isNumeric && code.length === 14 && format !== "ITF14") {
    return 'El código tiene 14 dígitos. Seleccione el formato "EAN-14 (ITF-14)".';
  }

  if (["EAN13", "EAN8", "ITF14", "UPC"].includes(format)) {
    if (!isNumeric) return `${format} solo acepta números.`;
    if (format === "EAN13" && ![12, 13].includes(code.length)) return "EAN-13 requiere 12 o 13 dígitos.";
    if (format === "EAN8" && ![7, 8].includes(code.length)) return "EAN-8 requiere 7 u 8 dígitos.";
    if (format === "ITF14" && code.length !== 14) return "EAN-14 (ITF-14) requiere 14 dígitos.";
    if (format === "UPC" && code.length !== 12) return "UPC requiere 12 dígitos.";
  }

  return null;
}

// === Generar PDF ===
async function generatePDF() {
  clearRowErrors();

  const formato = document.getElementById("barcodeType").value;
  if (!formato) {
    alert("❌ Por favor seleccione un formato de código de barras antes de generar el PDF.");
    return;
  }

  // === NUEVO: Obtener el título desde el input ===
  const titulo = document.getElementById("tituloCompania").value.trim() || " ";

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: "cm", format: "a4" });

  const margenIzq = 1.5, margenSup = 0.5;
  const etiquetaW = 9.0, etiquetaH = 5.65;
  const cols = 2, rowsPerPage = 5;
  const etiquetasPorHoja = cols * rowsPerPage;

  let x = margenIzq, y = margenSup, contador = 0;
  const canvas = document.getElementById("barcodeCanvas");
  const filas = Array.from(document.querySelectorAll("#tabla tbody tr"));

  if (filas.length === 0) {
    alert("❌ No hay filas en la tabla. Agregue al menos una etiqueta.");
    return;
  }

  for (let i = 0; i < filas.length; i++) {
    const tr = filas[i];
    const celdas = tr.querySelectorAll("td");
    const sucursal = celdas[0].innerText.trim();
    const area = celdas[1].innerText.trim();
    const oc = celdas[2].innerText.trim();
    let codigo = celdas[3].innerText.trim();
    const cantidadVal = celdas[4].innerText.trim();
    const cantidad = parseInt(cantidadVal, 10);

    if (!sucursal || !area || !oc || !codigo || !cantidadVal || isNaN(cantidad) || cantidad <= 0) {
      tr.classList.add("row-error");
      alert(`❌ Fila ${i + 1}: Complete todos los campos correctamente.`);
      return;
    }

    const err = validateCode(codigo, formato);
    if (err) {
      tr.classList.add("row-error");
      alert(`❌ Fila ${i + 1}: ${err}`);
      return;
    }

    if (formato === "EAN13" && /^\d{12}$/.test(codigo))
      codigo += ean13Checksum(codigo);

    for (let c = 0; c < cantidad; c++) {
      try {
        JsBarcode(canvas, codigo, {
          format: formato,
          displayValue: false,
          width: 2,
          height: 60,
          margin: 0
        });
      } catch (errGen) {
        tr.classList.add("row-error");
        alert(`❌ Fila ${i + 1}: Error al generar código "${codigo}" (${formato}).`);
        return;
      }

      await new Promise(r => setTimeout(r, 50));
      const barcodeImg = canvas.toDataURL("image/png", 1.0);

      // === Marco ===
      doc.setDrawColor(160);
      doc.setLineWidth(0.05);
      doc.rect(x, y, etiquetaW, etiquetaH);

      // === Encabezado (TÍTULO DINÁMICO) ===
      doc.setFont("helvetica", "bold");
      doc.setFontSize(13);
      doc.text(titulo, x + etiquetaW / 2, y + 0.9, { align: "center" });

      // === Sucursal y O/C ===
      doc.setFontSize(10);
      doc.text("SUCURSAL:", x + 0.6, y + 1.9);
      doc.setFont("helvetica", "normal");
      doc.text(sucursal, x + 2.8, y + 1.9);

      doc.setFont("helvetica", "bold");
      doc.text("O/C:", x + etiquetaW - 2.6, y + 1.9);
      doc.setFont("helvetica", "normal");
      doc.text(oc, x + etiquetaW - 0.5, y + 1.9, { align: "right" });

      // === Área (más arriba) ===
      doc.setFont("helvetica", "bold");
      doc.text("ÁREA:", x + 0.6, y + 2.45);
      doc.setFont("helvetica", "normal");
      doc.text(area, x + 2.8, y + 2.45);

      // === Código de barras ===
      const imgWidth = etiquetaW - 1.4;
      const imgX = x + (etiquetaW - imgWidth) / 2;
      const barcodeY = y + 2.8;
      doc.addImage(barcodeImg, "PNG", imgX, barcodeY, imgWidth, 1.8);

      // === Número debajo ===
      doc.setFont("helvetica", "normal");
      doc.setFontSize(13);
      doc.text(codigo, x + etiquetaW / 2, barcodeY + 2.35, { align: "center" });

      // === Posición siguiente ===
      contador++;
      if (contador % cols === 0) {
        x = margenIzq;
        y += etiquetaH;
      } else {
        x += etiquetaW;
      }

      // === Nueva página si corresponde ===
      if (contador % etiquetasPorHoja === 0 && (i < filas.length - 1 || c < cantidad - 1)) {
        doc.addPage();
        x = margenIzq;
        y = margenSup;
      }
    }
  }

  // === Guardar el PDF final ===
  doc.save(`etiquetas_${formato}.pdf`);
}