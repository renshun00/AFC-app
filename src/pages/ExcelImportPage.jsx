import React, { useState } from 'react';
import * as XLSX from 'xlsx';
import { where } from 'firebase/firestore';
import { Upload, FileSpreadsheet, AlertTriangle, Check, X, RefreshCw } from 'lucide-react';
import { useFirestore } from '../hooks/useFirestore';
import { productService, inventoryTransactionService, payrollSummaryService } from '../services/firestoreService';

// ── Target field definitions per sheet type ─────────────────────────────────
// "key" is what we match/write on the Firestore side.
// "required" fields must be mapped before the user can move to review.
const MATERIAL_FIELDS = [
  { key: 'name',     label: 'Item name',        required: true  },
  { key: 'category', label: 'Category',         required: false },
  { key: 'unit',     label: 'Unit (kg/L/pcs…)', required: false },
  { key: 'cost',     label: 'Cost per unit',    required: false },
  { key: 'minStock', label: 'Minimum stock',    required: false },
  { key: 'supplier', label: 'Supplier',         required: false },
  { key: 'stock',    label: 'Stock quantity',   required: false }, // only written if opted in
];

const PAYROLL_FIELDS = [
  { key: 'staffName', label: 'Staff name',  required: true },
  { key: 'date',       label: 'Date',        required: true },
  { key: 'hours',      label: 'Hours worked',required: true },
  { key: 'wage',       label: 'Wage (RM)',   required: true },
];

const fieldsFor = (type) => (type === 'materials' ? MATERIAL_FIELDS : PAYROLL_FIELDS);

export default function ExcelImportPage() {
  const { data: products } = useFirestore('products', where('isInventoryItem', '==', true));
  const { data: staff }    = useFirestore('staff');

  const [step, setStep] = useState(1); // 1 upload, 2 map, 3 review, 4 done
  const [fileName, setFileName] = useState('');
  const [workbook, setWorkbook] = useState(null);
  const [sheetNames, setSheetNames] = useState([]);
  const [selectedSheet, setSelectedSheet] = useState('');
  const [sheetType, setSheetType] = useState('materials'); // 'materials' | 'payroll'
  const [rawRows, setRawRows] = useState([]);
  const [headers, setHeaders] = useState([]);
  const [columnMap, setColumnMap] = useState({});
  const [includeStock, setIncludeStock] = useState(false);
  const [diffRows, setDiffRows] = useState([]);
  const [checkedIds, setCheckedIds] = useState(new Set());
  const [committing, setCommitting] = useState(false);
  const [resultSummary, setResultSummary] = useState(null);
  const [parseError, setParseError] = useState('');

  // ── Step 1: upload ─────────────────────────────────────────────────────────
  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setParseError('');
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      setWorkbook(wb);
      setFileName(file.name);
      setSheetNames(wb.SheetNames);
      setSelectedSheet(wb.SheetNames[0] ?? '');
      setStep(2);
    } catch (err) {
      console.error('[ExcelImportPage] failed to read file:', err);
      setParseError("Couldn't read that file. Make sure it's a valid .xlsx or .xls workbook.");
    }
  };

  // ── Step 2: load a sheet's rows/headers whenever sheet or type changes ─────
  const loadSheet = (sheetName, type) => {
    if (!workbook) return;
    const ws = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
    setRawRows(rows);
    setHeaders(rows.length ? Object.keys(rows[0]) : []);
    // Best-effort auto-map: match target field label/key against header names
    const autoMap = {};
    fieldsFor(type).forEach(f => {
      const match = (rows.length ? Object.keys(rows[0]) : []).find(h =>
        h.toLowerCase().replace(/[^a-z0-9]/g, '') === f.key.toLowerCase().replace(/[^a-z0-9]/g, '')
      );
      if (match) autoMap[f.key] = match;
    });
    setColumnMap(autoMap);
  };

  const onSelectSheet = (name) => {
    setSelectedSheet(name);
    loadSheet(name, sheetType);
  };

  const onSelectType = (type) => {
    setSheetType(type);
    loadSheet(selectedSheet, type);
  };

  React.useEffect(() => {
    if (workbook && selectedSheet) loadSheet(selectedSheet, sheetType);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workbook]);

  const requiredFields = fieldsFor(sheetType).filter(f => f.required);
  const mappingComplete = requiredFields.every(f => columnMap[f.key]);

  // ── Step 3: build the diff between the sheet and current Firestore data ────
  const buildDiff = () => {
    const rows = rawRows.map((raw, idx) => {
      const mapped = {};
      Object.entries(columnMap).forEach(([targetKey, sourceCol]) => {
        mapped[targetKey] = raw[sourceCol];
      });
      return { rowIndex: idx, mapped };
    });

    if (sheetType === 'materials') {
      const result = rows.map(({ rowIndex, mapped }) => {
        const name = String(mapped.name ?? '').trim();
        const existing = products.find(p => (p.name ?? '').trim().toLowerCase() === name.toLowerCase());
        const changes = [];
        const fieldMap = { category: 'categoryId', unit: 'uomCode', cost: 'standardCost', minStock: 'minStock', supplier: 'supplier' };
        Object.entries(fieldMap).forEach(([uiKey, docKey]) => {
          if (mapped[uiKey] === undefined || mapped[uiKey] === '') return;
          const newVal = uiKey === 'cost' || uiKey === 'minStock' ? Number(mapped[uiKey]) : mapped[uiKey];
          const oldVal = existing ? existing[docKey] : undefined;
          if (String(oldVal ?? '') !== String(newVal ?? '')) {
            changes.push({ field: uiKey, from: oldVal, to: newVal });
          }
        });
        let stockChange = null;
        if (includeStock && mapped.stock !== undefined && mapped.stock !== '') {
          const newStock = Number(mapped.stock);
          const oldStock = existing ? existing.stock : 0;
          if (newStock !== oldStock) stockChange = { from: oldStock, to: newStock };
        }
        return {
          id: `row-${rowIndex}`,
          name,
          isNew: !existing,
          existingId: existing?.id ?? null,
          changes,
          stockChange,
          mapped,
          flagged: !name,
        };
      }).filter(r => r.name); // drop blank rows
      return result;
    }

    // payroll
    const result = rows.map(({ rowIndex, mapped }) => {
      const name = String(mapped.staffName ?? '').trim();
      const match = staff.find(s => (s.name ?? '').trim().toLowerCase() === name.toLowerCase());
      const hours = Number(mapped.hours ?? 0);
      const wage = Number(mapped.wage ?? 0);
      const dateStr = mapped.date instanceof Date
        ? mapped.date.toISOString().slice(0, 10)
        : String(mapped.date ?? '').trim();
      return {
        id: `row-${rowIndex}`,
        name,
        staffId: match?.id ?? null,
        date: dateStr,
        hours,
        wage,
        flagged: !name || !match || !dateStr,
        flagReason: !name ? 'Missing staff name' : !match ? 'No matching staff record' : !dateStr ? 'Missing date' : null,
      };
    }).filter(r => r.name);
    return result;
  };

  const goToReview = () => {
    const diff = buildDiff();
    setDiffRows(diff);
    // Default-check every row that isn't flagged as risky/unmatched
    setCheckedIds(new Set(diff.filter(r => !r.flagged).map(r => r.id)));
    setStep(3);
  };

  const toggleChecked = (id) => {
    setCheckedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  // ── Step 4: commit ───────────────────────────────────────────────────────
  const handleCommit = async () => {
    setCommitting(true);
    let created = 0, updated = 0, skipped = 0, failed = 0;
    try {
      for (const row of diffRows) {
        if (!checkedIds.has(row.id)) { skipped++; continue; }
        try {
          if (sheetType === 'materials') {
            const doc = {};
            if (row.mapped.category !== undefined && row.mapped.category !== '') doc.categoryId = row.mapped.category;
            if (row.mapped.unit !== undefined && row.mapped.unit !== '') doc.uomCode = row.mapped.unit;
            if (row.mapped.cost !== undefined && row.mapped.cost !== '') doc.standardCost = Number(row.mapped.cost);
            if (row.mapped.minStock !== undefined && row.mapped.minStock !== '') doc.minStock = Number(row.mapped.minStock);
            if (row.mapped.supplier !== undefined && row.mapped.supplier !== '') doc.supplier = row.mapped.supplier;

            if (row.isNew) {
              doc.name = row.name;
              doc.isInventoryItem = true;
              doc.showOnPos = false;
              if (row.stockChange) doc.stock = row.stockChange.to;
              const newId = await productService.create(doc);
              if (row.stockChange && row.stockChange.to > 0) {
                await inventoryTransactionService.logPurchase(newId, row.stockChange.to);
              }
              created++;
            } else {
              if (Object.keys(doc).length > 0) {
                await productService.update(row.existingId, doc);
              }
              if (row.stockChange) {
                await productService.update(row.existingId, { stock: row.stockChange.to });
                await inventoryTransactionService.log({
                  productId: row.existingId,
                  type: 'ADJUSTMENT',
                  qty: row.stockChange.to - row.stockChange.from,
                  referenceId: `excel-import:${fileName}`,
                });
              }
              updated++;
            }
          } else {
            // payroll
            await payrollSummaryService.upsert(row.staffId, row.date, row.hours, row.wage);
            updated++;
          }
        } catch (err) {
          console.error('[ExcelImportPage] row commit failed:', row, err);
          failed++;
        }
      }
      setResultSummary({ created, updated, skipped, failed });
      setStep(4);
    } finally {
      setCommitting(false);
    }
  };

  const reset = () => {
    setStep(1); setFileName(''); setWorkbook(null); setSheetNames([]); setSelectedSheet('');
    setRawRows([]); setHeaders([]); setColumnMap({}); setIncludeStock(false);
    setDiffRows([]); setCheckedIds(new Set()); setResultSummary(null); setParseError('');
  };

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div>
      {/* Step indicator */}
      <div style={{ display:'flex', gap:8, marginBottom:20, fontSize:12, fontWeight:600, color:'var(--text-3)' }}>
        {['Upload', 'Map columns', 'Review', 'Done'].map((label, i) => (
          <div key={label} style={{ display:'flex', alignItems:'center', gap:6 }}>
            <div style={{
              width:22, height:22, borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center',
              background: step > i ? 'var(--green)' : step === i+1 ? 'var(--primary)' : '#f0f0f0',
              color: step >= i+1 ? '#fff' : 'var(--text-3)', fontSize:11,
            }}>
              {step > i+1 ? <Check size={12}/> : i+1}
            </div>
            <span style={{ color: step === i+1 ? 'var(--text-1)' : 'var(--text-3)' }}>{label}</span>
            {i < 3 && <div style={{ width:20, height:1, background:'var(--border)' }} />}
          </div>
        ))}
      </div>

      {/* ── Step 1: Upload ── */}
      {step === 1 && (
        <div className="card" style={{ padding:32, textAlign:'center' }}>
          <FileSpreadsheet size={32} style={{ color:'var(--text-3)', marginBottom:12 }}/>
          <div style={{ fontSize:15, fontWeight:700, marginBottom:4 }}>Import from Excel</div>
          <div style={{ fontSize:13, color:'var(--text-3)', marginBottom:20, maxWidth:420, marginLeft:'auto', marginRight:'auto' }}>
            Upload a workbook containing material/inventory reference data or a payroll sheet.
            Nothing is written to your data until you review and confirm.
          </div>
          <label className="btn btn-primary" style={{ cursor:'pointer', display:'inline-flex' }}>
            <Upload size={14}/> Choose File
            <input type="file" accept=".xlsx,.xls" onChange={handleFile} style={{ display:'none' }}/>
          </label>
          {parseError && (
            <div style={{ marginTop:16, color:'#dc2626', fontSize:13, display:'flex', alignItems:'center', justifyContent:'center', gap:6 }}>
              <AlertTriangle size={14}/> {parseError}
            </div>
          )}
        </div>
      )}

      {/* ── Step 2: Map columns ── */}
      {step === 2 && (
        <div className="card" style={{ padding:20 }}>
          <div style={{ fontSize:13, color:'var(--text-3)', marginBottom:14 }}>
            File: <strong style={{ color:'var(--text-1)' }}>{fileName}</strong> · {rawRows.length} row{rawRows.length !== 1 ? 's' : ''} detected
          </div>

          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:18 }}>
            <div>
              <label style={{ display:'block', fontSize:12, fontWeight:600, color:'var(--text-2)', marginBottom:5 }}>Sheet</label>
              <select className="inp" value={selectedSheet} onChange={e => onSelectSheet(e.target.value)}>
                {sheetNames.map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
            <div>
              <label style={{ display:'block', fontSize:12, fontWeight:600, color:'var(--text-2)', marginBottom:5 }}>What does this sheet contain?</label>
              <select className="inp" value={sheetType} onChange={e => onSelectType(e.target.value)}>
                <option value="materials">Materials / inventory reference data</option>
                <option value="payroll">Payroll (hours &amp; wages)</option>
              </select>
            </div>
          </div>

          <div style={{ fontSize:13, fontWeight:700, marginBottom:10 }}>Map your columns</div>
          <div style={{ display:'flex', flexDirection:'column', gap:8, marginBottom:16 }}>
            {fieldsFor(sheetType).map(f => (
              <div key={f.key} style={{ display:'flex', alignItems:'center', gap:10 }}>
                <div style={{ width:170, fontSize:13, color:'var(--text-2)' }}>
                  {f.label}{f.required && <span style={{ color:'var(--primary)' }}> *</span>}
                </div>
                <select className="inp" value={columnMap[f.key] ?? ''} onChange={e => setColumnMap(m => ({ ...m, [f.key]: e.target.value }))}>
                  <option value="">— Not in this sheet —</option>
                  {headers.map(h => <option key={h} value={h}>{h}</option>)}
                </select>
              </div>
            ))}
          </div>

          {sheetType === 'materials' && (
            <label style={{ display:'flex', alignItems:'center', gap:8, marginBottom:18, fontSize:13, color:'var(--text-2)' }}>
              <input type="checkbox" checked={includeStock} onChange={e => setIncludeStock(e.target.checked)}
                style={{ width:16, height:16, accentColor:'var(--primary)' }}/>
              Also update stock quantities (creates a logged adjustment — off by default to protect live counts)
            </label>
          )}

          {/* Raw preview */}
          {rawRows.length > 0 && (
            <div style={{ marginBottom:18 }}>
              <div style={{ fontSize:12, fontWeight:600, color:'var(--text-3)', marginBottom:6 }}>Preview (first 3 rows)</div>
              <div style={{ overflowX:'auto', border:'1px solid var(--border)', borderRadius:'var(--radius-sm)' }}>
                <table className="data-table">
                  <thead><tr>{headers.map(h => <th key={h}>{h}</th>)}</tr></thead>
                  <tbody>
                    {rawRows.slice(0, 3).map((r, i) => (
                      <tr key={i}>{headers.map(h => <td key={h}>{String(r[h])}</td>)}</tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div style={{ display:'flex', gap:8 }}>
            <button className="btn btn-outline" onClick={reset}>Start Over</button>
            <button className="btn btn-primary" disabled={!mappingComplete} onClick={goToReview} style={{ opacity: mappingComplete ? 1 : 0.5 }}>
              Continue to Review
            </button>
          </div>
          {!mappingComplete && (
            <div style={{ fontSize:12, color:'var(--text-3)', marginTop:8 }}>
              Map all required (*) fields to continue.
            </div>
          )}
        </div>
      )}

      {/* ── Step 3: Review diff ── */}
      {step === 3 && (
        <div className="card" style={{ padding:20 }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14 }}>
            <div style={{ fontSize:13, color:'var(--text-3)' }}>
              {diffRows.length} row{diffRows.length !== 1 ? 's' : ''} found · {checkedIds.size} selected to import
            </div>
            <button className="btn btn-outline btn-sm" onClick={() => setStep(2)}>
              <RefreshCw size={13}/> Back to Mapping
            </button>
          </div>

          <div style={{ overflowX:'auto', border:'1px solid var(--border)', borderRadius:'var(--radius-sm)', marginBottom:18 }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ width:36 }}></th>
                  <th>{sheetType === 'materials' ? 'Item' : 'Staff'}</th>
                  <th>Status</th>
                  <th>Changes</th>
                </tr>
              </thead>
              <tbody>
                {diffRows.map(row => (
                  <tr key={row.id} style={{ opacity: row.flagged ? 0.7 : 1 }}>
                    <td>
                      <input type="checkbox" checked={checkedIds.has(row.id)} onChange={() => toggleChecked(row.id)}
                        style={{ width:16, height:16, accentColor:'var(--primary)' }}/>
                    </td>
                    <td style={{ fontWeight:600 }}>{row.name}</td>
                    <td>
                      {sheetType === 'materials' ? (
                        row.flagged
                          ? <span className="badge badge-red">Missing name</span>
                          : row.isNew
                            ? <span className="badge badge-blue">New item</span>
                            : (row.changes.length === 0 && !row.stockChange)
                              ? <span className="badge badge-gray">No change</span>
                              : <span className="badge badge-amber">Update</span>
                      ) : (
                        row.flagged
                          ? <span className="badge badge-red">{row.flagReason}</span>
                          : <span className="badge badge-amber">Import</span>
                      )}
                    </td>
                    <td style={{ fontSize:12, color:'var(--text-2)' }}>
                      {sheetType === 'materials' ? (
                        <>
                          {row.changes.map(c => (
                            <div key={c.field}>{c.field}: {String(c.from ?? '—')} → <strong>{String(c.to)}</strong></div>
                          ))}
                          {row.stockChange && (
                            <div style={{ color:'var(--primary)' }}>
                              stock: {row.stockChange.from} → <strong>{row.stockChange.to}</strong> (logged adjustment)
                            </div>
                          )}
                        </>
                      ) : (
                        !row.flagged && <div>{row.date} · {row.hours}h · RM{row.wage.toFixed(2)}</div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ display:'flex', gap:8 }}>
            <button className="btn btn-outline" onClick={reset}>Cancel Import</button>
            <button className="btn btn-primary" onClick={handleCommit} disabled={committing || checkedIds.size === 0}
              style={{ opacity: (committing || checkedIds.size === 0) ? 0.5 : 1 }}>
              {committing ? 'Importing…' : `Confirm Import (${checkedIds.size})`}
            </button>
          </div>
        </div>
      )}

      {/* ── Step 4: Done ── */}
      {step === 4 && resultSummary && (
        <div className="card" style={{ padding:32, textAlign:'center' }}>
          <div style={{ width:48, height:48, borderRadius:'50%', background:'var(--green-light)', color:'var(--green)', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 14px' }}>
            <Check size={22}/>
          </div>
          <div style={{ fontSize:16, fontWeight:700, marginBottom:6 }}>Import complete</div>
          <div style={{ fontSize:13, color:'var(--text-2)', marginBottom:20 }}>
            {resultSummary.created} created · {resultSummary.updated} updated · {resultSummary.skipped} skipped
            {resultSummary.failed > 0 && <> · <span style={{ color:'#dc2626' }}>{resultSummary.failed} failed</span></>}
          </div>
          <button className="btn btn-primary" onClick={reset}>Import Another File</button>
        </div>
      )}
    </div>
  );
}
