type CsvPrimitive = string | number | boolean | null | undefined;

export type CsvRow = Record<string, CsvPrimitive>;

const escapeCsvValue = (value: CsvPrimitive): string => {
  const normalized = value === null || value === undefined ? '' : String(value);
  if (/[",\r\n]/.test(normalized)) {
    return `"${normalized.replace(/"/g, '""')}"`;
  }
  return normalized;
};

export const rowsToCsv = (rows: CsvRow[], headers?: string[]): string => {
  const columns = headers && headers.length > 0
    ? headers
    : Array.from(new Set(rows.flatMap((row) => Object.keys(row))));

  const lines = [
    columns.map(escapeCsvValue).join(','),
    ...rows.map((row) => columns.map((column) => escapeCsvValue(row[column])).join(',')),
  ];

  return `${lines.join('\r\n')}\r\n`;
};

export const downloadCsv = (filename: string, rows: CsvRow[], headers?: string[]) => {
  const csv = rowsToCsv(rows, headers);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
};

export const parseCsvText = (text: string): CsvRow[] => {
  const rows: string[][] = [];
  let field = '';
  let row: string[] = [];
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        field += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === ',' && !inQuotes) {
      row.push(field);
      field = '';
      continue;
    }

    if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && next === '\n') index += 1;
      row.push(field);
      if (row.some((cell) => cell.trim() !== '')) rows.push(row);
      row = [];
      field = '';
      continue;
    }

    field += char;
  }

  if (field !== '' || row.length > 0) {
    row.push(field);
    if (row.some((cell) => cell.trim() !== '')) rows.push(row);
  }

  const [headerRow, ...dataRows] = rows;
  if (!headerRow || headerRow.length === 0) return [];

  const headers = headerRow.map((header) => header.trim());
  return dataRows.map((dataRow) => {
    const record: CsvRow = {};
    headers.forEach((header, index) => {
      record[header] = dataRow[index]?.trim() ?? '';
    });
    return record;
  });
};
