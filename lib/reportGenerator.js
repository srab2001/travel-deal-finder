const fs = require('node:fs/promises');
const path = require('node:path');

const HEADER = ['date', 'origin', 'destination', 'departDate', 'returnDate', 'price', 'currency', 'carrier'];

function toCsv(rows) {
  const lines = [HEADER.join(',')];
  for (const row of rows) {
    lines.push(HEADER.map((k) => csvEscape(row[k])).join(','));
  }
  return lines.join('\n') + '\n';
}

function csvEscape(value) {
  if (value === undefined || value === null) return '';
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

async function writeReport(rows, { outDir = process.cwd(), date = new Date() } = {}) {
  const stamp = date.toISOString().slice(0, 10);
  const file = path.join(outDir, `results_${stamp}.csv`);
  await fs.writeFile(file, toCsv(rows));
  return file;
}

module.exports = { writeReport, toCsv, HEADER };
