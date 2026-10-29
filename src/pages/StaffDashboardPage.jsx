import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Package, Truck, Flame, PackageOpen, MoreHorizontal,
  CalendarDays, Save, Send, ChevronDown, ChevronRight,
  Loader, CheckCircle2, AlertCircle, Clock, ArrowRight,
  ArrowLeft, ClipboardList, FileDown, History,
  LogIn, LogOut, KeyRound, Eye, EyeOff, Lock, Check,
  Calculator, RotateCcw, AlertTriangle, Sparkles, Info,
  TrendingUp, CheckCircle, PackageCheck,
} from 'lucide-react';
import { dailyInventoryService, staffShiftService, staffService, salesOrderService } from '../services/firestoreService';
import {
  CATEGORIES,
  CATEGORY_PRODUCTS,
  buildEmptyDayData,
} from '../data/dailyInventoryTemplate';
import { useAuth } from '../context/AuthContext';
import {
  getFriedAndSoldQuantities,
  calculateBroughtToStall,
  calculateFriedLeftoverPenalty,
  computeAutoRemainders,
  getPreviousTradingDate,
  getMalaysiaDate,
  shiftDate,
  FRIED_ITEMS,
  NON_FRIED_ITEMS,
} from '../utils/dailyFlowCalculator';
import { auth } from '../firebase';
import StallOpeningSection from '../components/StallOpeningSection';
import { loadStallDay, reconcileStallOpening } from '../utils/stallOpening.js';
import { signInWithEmailAndPassword, reauthenticateWithCredential, EmailAuthProvider } from 'firebase/auth';

// ── Helpers ─────────────────────────────────────────────────────────────────

function todayStr() {
  return getMalaysiaDate();
}

function formatDateDisplay(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-MY', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });
}

const CATEGORY_ICONS = {
  raw_materials: Package,
  brought_to_stall: Truck,
  remaining_fried: Flame,
  remaining_unfried: PackageOpen,
  other_remaining: MoreHorizontal,
};

// ── Stat card for the top summary ────────────────────────────────────────────

function SummaryCard({ label, value, icon: Icon, color, sub, loading, highlight }) {
  return (
    <div style={{
      background: '#fff', borderRadius: 'var(--radius)', border: `1px solid ${highlight ? color : 'var(--border)'}`,
      padding: '16px 18px', flex: 1, minWidth: 140,
      boxShadow: highlight ? `0 0 0 2px ${color}20` : 'var(--shadow-sm)',
      transition: 'transform 0.15s, box-shadow 0.15s',
    }}
      onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = 'var(--shadow)'; }}
      onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = highlight ? `0 0 0 2px ${color}20` : 'var(--shadow-sm)'; }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <div style={{
          width: 36, height: 36, borderRadius: 10,
          background: color + '18', display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: color, flexShrink: 0,
        }}>
          <Icon size={17} />
        </div>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', color: 'var(--text-3)' }}>{label}</div>
      </div>
      <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--text-1)', lineHeight: 1.1 }}>
        {loading ? <Loader size={18} style={{ animation: 'spin 1s linear infinite' }} /> : value}
      </div>
      {sub && <div style={{ fontSize: 12, color: highlight ? color : 'var(--text-3)', fontWeight: highlight ? 600 : 400, marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

// ── Category accordion section ──────────────────────────────────────────────

function CategorySection({
  category,
  products,
  values,
  onChange,
  isOpen,
  onToggle,
  isSubmitted,
  isAdmin,
  isSaturday,
  isSunday,
  prevTradingDate,
  prevDayData,
  rawMaterials,
  onRecalculateBrought,
  onSendStockToInventory,
  stockReceivedSynced,
  stockSending,
  friedPenalty,
  chickenCutYield,
  onCutYieldChange,
  busy = false,
}) {
  const CatIcon = CATEGORY_ICONS[category.key] || Package;
  const filledCount = products.filter(p => (values[p.key] ?? 0) > 0).length;

  return (
    <div style={{
      background: '#fff', borderRadius: 'var(--radius)',
      border: `1.5px solid ${isOpen ? category.color + '60' : 'var(--border)'}`,
      boxShadow: isOpen ? `0 0 0 3px ${category.color}12` : 'var(--shadow-sm)',
      transition: 'all 0.2s ease', overflow: 'hidden', marginBottom: 12,
    }}>
      {/* Header */}
      <button
        type="button"
        onClick={onToggle}
        style={{
          display: 'flex', alignItems: 'center', gap: 12, width: '100%',
          padding: '16px 18px', border: 'none', background: 'transparent',
          cursor: 'pointer', fontFamily: 'var(--font)', textAlign: 'left',
        }}
      >
        <div style={{
          width: 38, height: 38, borderRadius: 10,
          background: category.color + '15', display: 'flex', alignItems: 'center',
          justifyContent: 'center', color: category.color, flexShrink: 0,
          transition: 'transform 0.2s',
          transform: isOpen ? 'scale(1.05)' : 'scale(1)',
        }}>
          <CatIcon size={18} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-1)' }}>{category.label}</span>
            <span style={{ fontSize: 12, color: 'var(--text-3)', fontStyle: 'italic' }}>({category.labelMy})</span>
            <span style={{
              fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 99,
              background: filledCount > 0 ? category.color + '15' : '#f4f4f5',
              color: filledCount > 0 ? category.color : 'var(--text-3)',
            }}>
              {filledCount}/{products.length}
            </span>
            {category.key === 'brought_to_stall' && (
              <span style={{ fontSize: 9, fontWeight: 700, color: '#7c3aed', background: '#f5f3ff', border: '1px solid #ddd6fe', padding: '1px 6px', borderRadius: 4 }}>
                Formula Automated
              </span>
            )}
            {category.key === 'remaining_fried' && friedPenalty?.qualifiesForPenalty && (
              <span style={{ fontSize: 9, fontWeight: 700, color: '#dc2626', background: '#fef2f2', border: '1px solid #fecaca', padding: '1px 6px', borderRadius: 4 }}>
                ⚠️ RM {friedPenalty.totalCharge.toFixed(2)} Penalty
              </span>
            )}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>{category.description}</div>
        </div>
        <div style={{
          color: 'var(--text-3)', transition: 'transform 0.2s',
          transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)',
        }}>
          <ChevronRight size={18} />
        </div>
      </button>

      {/* Accordion content */}
      {isOpen && (
        <div style={{
          padding: '0 18px 16px', borderTop: '1px solid var(--border-soft)',
          animation: 'fadeIn 0.15s ease',
        }}>
          {/* ── Context Notice Banner for Category ── */}
          {category.key === 'brought_to_stall' && (
            <div style={{
              marginTop: 12, marginBottom: 12, padding: '10px 14px', borderRadius: 8,
              background: isSaturday ? '#fef2f2' : (isSunday ? '#eff6ff' : '#f8fafc'),
              border: `1px solid ${isSaturday ? '#fecaca' : (isSunday ? '#bfdbfe' : '#e2e8f0')}`,
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8,
            }}>
              <div style={{ fontSize: 12, color: isSaturday ? '#dc2626' : (isSunday ? '#1d4ed8' : 'var(--text-2)'), display: 'flex', alignItems: 'center', gap: 6 }}>
                {isSaturday ? <AlertTriangle size={15} /> : <Calculator size={15} color="var(--primary)" />}
                <span>
                  {isSaturday
                    ? 'Saturday Closed: Stall is closed today. Brought to stall pieces are formula-set to 0.'
                    : (isSunday
                      ? `Sunday Trading: Automatically carrying over Friday's unfried leftovers (${prevTradingDate || 'Friday'}).`
                      : 'Excel Formula Flow: Chicken & Carcass Brought to Stall = Yesterday\'s Unfried + Today\'s Received.')}
                </span>
              </div>
              {!isSubmitted ? (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    onClick={onRecalculateBrought}
                    className="btn btn-outline btn-sm"
                    style={{ fontSize: 11, padding: '4px 10px', gap: 5, background: '#fff' }}
                    title="Re-run Excel formulas to prefill brought items"
                  >
                    <RotateCcw size={12} /> Re-sync Formulas
                  </button>
                  <button
                    type="button"
                    onClick={onSendStockToInventory}
                    disabled={stockSending}
                    className="btn btn-sm"
                    style={{
                      fontSize: 11, padding: '4px 10px', gap: 5,
                      background: stockReceivedSynced ? '#15803d' : '#0284c7',
                      color: '#fff', border: 'none', fontWeight: 700,
                      cursor: 'pointer',
                    }}
                    title="Send today's received raw materials and brought stock to inventory for live POS deduction"
                  >
                    {stockSending ? (
                      <Loader size={12} style={{ animation: 'spin 1s linear infinite' }} />
                    ) : stockReceivedSynced ? (
                      <PackageCheck size={12} />
                    ) : (
                      <Truck size={12} />
                    )}
                    {stockReceivedSynced ? 'Stock Sent to Inventory ✓' : 'Send to Inventory'}
                  </button>
                </div>
              ) : (
                <span style={{ fontSize: 11, fontWeight: 700, color: '#15803d', background: '#dcfce7', padding: '3px 8px', borderRadius: 6 }}>
                  ✓ Stock Finalized
                </span>
              )}
            </div>
          )}

          {/* ── Baki Dah Goreng Harian Penalty Box ── */}
          {category.key === 'remaining_fried' && friedPenalty && (
            <div style={{
              marginTop: 12, marginBottom: 14, padding: '12px 14px', borderRadius: 8,
              background: friedPenalty.qualifiesForPenalty ? '#fff1f2' : '#f0fdf4',
              border: `1.5px solid ${friedPenalty.qualifiesForPenalty ? '#fecdd3' : '#bbf7d0'}`,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6, flexWrap: 'wrap', gap: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, fontSize: 13, color: friedPenalty.qualifiesForPenalty ? '#e11d48' : '#15803d' }}>
                  {friedPenalty.qualifiesForPenalty ? <AlertTriangle size={15} /> : <CheckCircle2 size={15} />}
                  Baki Dah Goreng Harian (Fried Leftover Penalty)
                </div>
                <span style={{
                  fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 99,
                  background: friedPenalty.qualifiesForPenalty ? '#ffe4e6' : '#dcfce7',
                  color: friedPenalty.qualifiesForPenalty ? '#be123c' : '#166534',
                }}>
                  {friedPenalty.qualifiesForPenalty ? `Penalty: RM ${friedPenalty.totalCharge.toFixed(2)}` : 'Exempt (RM 0.00)'}
                </span>
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-2)', lineHeight: 1.4, marginBottom: 8 }}>
                <strong>Policy:</strong> If daily leftover fried pieces (Chicken + Carcass) reach <strong>5 or more</strong>, a waste deduction of <strong>RM 5.00 / piece</strong> applies to all leftover pieces that day, split 50/50 between on-duty staff (<strong>RM 2.50 / pc</strong> each). Leftovers under 5 pieces are exempt (RM 0.00).
              </div>
              <div style={{ fontSize: 12, fontWeight: 600, color: friedPenalty.qualifiesForPenalty ? '#be123c' : '#15803d', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
                <span>Total Leftover Fried: <strong>{friedPenalty.totalFriedLeft} pcs</strong> (Chicken: {friedPenalty.ayamFriedLeft}, Carcass: {friedPenalty.rangkaFriedLeft})</span>
                <span>
                  {friedPenalty.qualifiesForPenalty
                    ? `Payslip Deduction (50% share): −RM ${friedPenalty.perStaffDeduction.toFixed(2)}`
                    : `✓ Safe (< 5 pieces): RM 0.00 deduction`}
                </span>
              </div>
            </div>
          )}

          {/* ── Remaining Unfried Policy Box ── */}
          {category.key === 'remaining_unfried' && (
            <div style={{
              marginTop: 12, marginBottom: 12, padding: '9px 12px', borderRadius: 8,
              background: '#fffbeb', border: '1px solid #fef3c7', fontSize: 12, color: '#92400e',
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <Info size={15} style={{ flexShrink: 0, color: '#d97706' }} />
              <span>
                <strong>Carryover Rule:</strong> Only uncooked items carry over to the next operating day's Brought to Stall. Fried leftovers do not carry forward.
              </span>
            </div>
          )}

          {/* Column headers */}
          <div style={{
            display: 'grid', gridTemplateColumns: '1fr 80px 90px',
            gap: 8, padding: '8px 0',
            fontSize: 10, fontWeight: 700, letterSpacing: '.06em',
            textTransform: 'uppercase', color: 'var(--text-3)',
          }}>
            <div>Product & Details</div>
            <div style={{ textAlign: 'center' }}>UoM</div>
            <div style={{ textAlign: 'right' }}>Qty</div>
          </div>

          {products.map((prod, idx) => {
            // Helper formula computation for brought_to_stall rows:
            let formulaInfo = null;
            if (category.key === 'brought_to_stall' && prod.isCalculated) {
              if (prod.key === 'chicken_pcs') {
                const prevUnfried = Number(prevDayData?.remaining_unfried?.chicken_pcs || 0);
                const rawReceived = Number(rawMaterials?.chicken_pcs || 0) || (Number(rawMaterials?.chicken_whole || 0) * 9);
                const expectedVal = isSaturday ? 0 : prevUnfried + rawReceived;
                const currentVal = Number(values[prod.key] ?? 0);
                formulaInfo = {
                  expectedVal,
                  text: isSaturday ? 'Stall closed (= 0)' : `Unfried (${prevUnfried}) + Received (${rawReceived}) = ${expectedVal}`,
                  isOverridden: currentVal !== expectedVal,
                };
              } else if (prod.key === 'carcass_pcs') {
                const prevUnfried = Number(prevDayData?.remaining_unfried?.carcass_pcs || 0);
                const rawReceived = Number(rawMaterials?.carcass_pcs || 0);
                const expectedVal = isSaturday ? 0 : prevUnfried + rawReceived;
                const currentVal = Number(values[prod.key] ?? 0);
                formulaInfo = {
                  expectedVal,
                  text: isSaturday ? 'Stall closed (= 0)' : `Unfried (${prevUnfried}) + Received (${rawReceived}) = ${expectedVal}`,
                  isOverridden: currentVal !== expectedVal,
                };
              } else if (prod.key === 'chicken_neck_set') {
                const rawNeck = Number(rawMaterials?.neck || 0);
                const expectedVal = Math.floor(rawNeck / 4);
                const currentVal = Number(values[prod.key] ?? 0);
                formulaInfo = {
                  expectedVal,
                  text: `Raw Neck (${rawNeck} pcs) ÷ 4 = ${expectedVal}`,
                  isOverridden: currentVal !== expectedVal,
                };
              }
            }

            const isAdminBillKgField = category.key === 'raw_materials' && (prod.key === 'chicken_kg' || prod.key === 'carcass_kg');
            const isDisabled = busy || (isSubmitted && !(isAdmin && isAdminBillKgField));

            return (
              <div
                key={prod.key}
                style={{
                  display: 'grid', gridTemplateColumns: '1fr 80px 90px',
                  gap: 8, alignItems: 'center',
                  padding: '10px 0',
                  borderBottom: idx < products.length - 1 ? '1px solid var(--border-soft)' : 'none',
                }}
              >
                <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-1)', display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 5 }}>
                    <span>{prod.label}</span>
                    {prod.adminOnly && (
                      <span style={{
                        fontSize: 9, fontWeight: 700,
                        color: isSubmitted && isAdmin ? '#92400e' : '#b45309',
                        background: '#fef3c7',
                        border: isSubmitted && isAdmin ? '1px solid #fde68a' : 'none',
                        padding: '1px 5px', borderRadius: 4
                      }}>
                        {isSubmitted && isAdmin ? 'Admin Bill KG (Editable)' : 'Admin Bill KG'}
                      </span>
                    )}
                    {category.key === 'raw_materials' && prod.key === 'chicken_whole' && !isSubmitted && (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginLeft: 4 }}>
                        <span style={{ fontSize: 10, color: 'var(--text-3)', fontWeight: 600 }}>Yield:</span>
                        <button
                          type="button"
                          onClick={() => onCutYieldChange?.(9)}
                          style={{
                            fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 4,
                            background: (chickenCutYield || 9) === 9 ? '#2563eb' : '#f4f4f5',
                            color: (chickenCutYield || 9) === 9 ? '#fff' : 'var(--text-2)',
                            border: '1px solid ' + ((chickenCutYield || 9) === 9 ? '#1d4ed8' : '#d4d4d8'),
                            cursor: 'pointer'
                          }}
                          title="Standard 9 pieces per whole chicken"
                        >
                          9 pcs
                        </button>
                        <button
                          type="button"
                          onClick={() => onCutYieldChange?.(8)}
                          style={{
                            fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 4,
                            background: (chickenCutYield || 9) === 8 ? '#d97706' : '#f4f4f5',
                            color: (chickenCutYield || 9) === 8 ? '#fff' : 'var(--text-2)',
                            border: '1px solid ' + ((chickenCutYield || 9) === 8 ? '#b45309' : '#d4d4d8'),
                            cursor: 'pointer'
                          }}
                          title="Alternative 8 pieces per whole chicken"
                        >
                          8 pcs
                        </button>
                      </span>
                    )}
                    {category.key === 'raw_materials' && prod.key === 'chicken_pcs' && (
                      <span style={{ fontSize: 9, fontWeight: 700, color: '#3b82f6', background: '#eff6ff', padding: '1px 5px', borderRadius: 4 }}>
                        {Number(rawMaterials?.chicken_whole || 0) > 0 && Number(values[prod.key] || 0) > 0
                          ? `${(Number(values[prod.key]) / Number(rawMaterials.chicken_whole)).toFixed(1).replace('.0', '')} pcs/whole (Editable)`
                          : `${chickenCutYield || 9} pcs/whole (Editable)`}
                      </span>
                    )}
                    {prod.isCalculated && (
                      <span style={{ fontSize: 9, fontWeight: 700, color: '#7c3aed', background: '#f5f3ff', border: '1px solid #ddd6fe', padding: '1px 5px', borderRadius: 4, display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                        <Sparkles size={10} /> Auto
                      </span>
                    )}
                  </div>
                  {formulaInfo && (
                    <div style={{ fontSize: 11, color: 'var(--text-3)', display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
                      <span>Formula: {formulaInfo.text}</span>
                      {formulaInfo.isOverridden && !isSubmitted && (
                        <button
                          type="button"
                          onClick={() => onChange(prod.key, formulaInfo.expectedVal)}
                          style={{
                            background: '#f4f4f5', border: '1px solid #d4d4d8', borderRadius: 4,
                            padding: '1px 5px', color: 'var(--primary)', cursor: 'pointer',
                            fontSize: 10, fontWeight: 700,
                          }}
                          title="Restore calculated formula value"
                        >
                          ↺ Reset ({formulaInfo.expectedVal})
                        </button>
                      )}
                    </div>
                  )}
                </div>
                <div style={{
                  textAlign: 'center', fontSize: 11, fontWeight: 600,
                  color: 'var(--text-3)', background: '#f4f4f5',
                  borderRadius: 6, padding: '4px 0',
                }}>
                  {prod.uomLabel}
                </div>
                <div>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    value={values[prod.key] ?? ''}
                    onChange={e => onChange(prod.key, e.target.value === '' ? 0 : parseFloat(e.target.value))}
                    disabled={isDisabled}
                    placeholder="0"
                    style={{
                      width: '100%', padding: '7px 8px',
                      border: `1.5px solid ${formulaInfo && !formulaInfo.isOverridden ? '#c4b5fd' : (isAdminBillKgField && isSubmitted && isAdmin ? '#f59e0b' : 'var(--border)')}`,
                      borderRadius: 8, fontSize: 13, fontWeight: 600,
                      textAlign: 'right', fontFamily: 'var(--font)',
                      color: 'var(--text-1)', background: isDisabled ? '#fafafa' : (formulaInfo && !formulaInfo.isOverridden ? '#faf5ff' : '#fff'),
                      outline: 'none', transition: 'border-color 0.15s',
                    }}
                    onFocus={e => { if (!isDisabled) e.target.style.borderColor = category.color; }}
                    onBlur={e => { e.target.style.borderColor = formulaInfo && !formulaInfo.isOverridden ? '#c4b5fd' : (isAdminBillKgField && isSubmitted && isAdmin ? '#f59e0b' : 'var(--border)'); }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Daily Reconciliation (ProductInventory) Panel ──────────────────────────

function DailyReconciliationPanel({ formData, isMobile, posSummary, onAutofillFromPos, isSubmitted }) {
  const brought = formData.brought_to_stall || {};
  const remFried = formData.remaining_fried || {};
  const [isOpen, setIsOpen] = useState(true);

  const hasPos = (posSummary?.orderCount || 0) > 0;
  const posSold = posSummary?.soldBreakdown || {};

  return (
    <div style={{
      background: '#fff', borderRadius: 'var(--radius)', border: '1px solid var(--border)',
      boxShadow: 'var(--shadow-sm)', overflow: 'hidden', marginBottom: 16,
    }}>
      <button
        type="button"
        onClick={() => setIsOpen(o => !o)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 18px', background: 'transparent', border: 'none', cursor: 'pointer',
          textAlign: 'left', fontFamily: 'var(--font)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 34, height: 34, borderRadius: 8,
            background: hasPos ? 'rgba(37, 99, 235, 0.12)' : 'rgba(22, 163, 74, 0.12)',
            color: hasPos ? '#2563eb' : '#16a34a',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <TrendingUp size={18} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-1)' }}>
                Live POS Reconciliation & Carryover Audit
              </span>
              <span style={{
                fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 99,
                background: hasPos ? '#dbeafe' : '#f1f5f9',
                color: hasPos ? '#1d4ed8' : '#64748b',
              }}>
                {hasPos ? `POS Live Connected (${posSummary.orderCount} orders)` : 'Awaiting POS Orders'}
              </span>
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>
              {hasPos
                ? `POS Sales: RM ${posSummary.totalRevenue.toFixed(2)} · ${posSummary.soldBreakdown?.chicken_pcs || 0} chicken pcs sold · Raw carryover auto-calculated`
                : 'Raw Uncooked Carryover = Brought − POS Sold − Unsold Fried (Waste)'}
            </div>
          </div>
        </div>
        <div style={{ color: 'var(--text-3)', transition: 'transform 0.2s', transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)' }}>
          <ChevronRight size={18} />
        </div>
      </button>

      {isOpen && (
        <div style={{ padding: '0 18px 16px', borderTop: '1px solid var(--border-soft)' }}>
          {/* POS Status Banner */}
          {hasPos ? (
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10,
              padding: '10px 14px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8,
              marginTop: 12, marginBottom: 14,
            }}>
              <div style={{ fontSize: 12, color: '#166534', display: 'flex', alignItems: 'center', gap: 6 }}>
                <CheckCircle2 size={16} style={{ color: '#16a34a', flexShrink: 0 }} />
                <span>
                  <strong>POS Live Linked ({posSummary.orderCount} orders):</strong> Chicken sold on POS is auto-deducted. Evening staff only counts <strong>Baki Dah Goreng (Unsold Fried)</strong>; raw uncooked pieces automatically carry over to tomorrow.
                </span>
              </div>
              {!isSubmitted && (
                <button
                  type="button"
                  onClick={onAutofillFromPos}
                  className="btn btn-sm"
                  style={{
                    background: '#16a34a', color: '#fff', border: 'none', fontWeight: 700,
                    fontSize: 11, padding: '5px 12px', borderRadius: 6, display: 'inline-flex', alignItems: 'center', gap: 5,
                    cursor: 'pointer',
                  }}
                  title="Re-sync raw carryover and non-fried remainders from latest POS orders"
                >
                  <Sparkles size={13} /> Re-sync Remainders
                </button>
              )}
            </div>
          ) : (
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10,
              padding: '10px 14px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8,
              marginTop: 12, marginBottom: 14,
            }}>
              <div style={{ fontSize: 12, color: '#1e40af', display: 'flex', alignItems: 'center', gap: 6 }}>
                <Info size={16} style={{ color: '#2563eb', flexShrink: 0 }} />
                <span>
                  <strong>Morning Setup Mode:</strong> No POS sales recorded yet for today. Prepared stock is ready; once orders are rung up, live sales will reconcile here automatically.
                </span>
              </div>
            </div>
          )}

          {/* Fried Items Reconciliation Table */}
          <div style={{ overflowX: 'auto', marginTop: 8 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: '1.5px solid var(--border)', color: 'var(--text-3)', textAlign: 'right' }}>
                  <th style={{ textAlign: 'left', padding: '8px 6px', fontWeight: 700 }}>Item</th>
                  <th style={{ padding: '8px 6px', fontWeight: 700 }}>Brought to Stall</th>
                  <th style={{ padding: '8px 6px', fontWeight: 700, color: '#2563eb' }}>POS Sold</th>
                  <th style={{ padding: '8px 6px', fontWeight: 700, color: '#7c3aed' }}>Total Remainder</th>
                  <th style={{ padding: '8px 6px', fontWeight: 700, color: '#dc2626' }}>Unsold Fried (Waste)</th>
                  <th style={{ padding: '8px 6px', fontWeight: 700, color: '#16a34a' }}>Raw Uncooked (Carryover)</th>
                  <th style={{ padding: '8px 6px', fontWeight: 700, textAlign: 'center' }}>Waste Status</th>
                </tr>
              </thead>
              <tbody>
                {FRIED_ITEMS.map((item) => {
                  const broughtQty = Number(brought[item.broughtKey] || 0);
                  const posKey = item.key === 'neck' ? 'chicken_neck_set' : item.key;
                  const soldCount = Number(posSold[posKey] || 0);
                  const totalRem = Math.max(0, broughtQty - soldCount);
                  const leftFriedQty = Number(remFried[item.remainingKey] || 0);
                  const unfriedQty = Math.max(0, totalRem - leftFriedQty);

                  return (
                    <tr key={item.key} style={{ borderBottom: '1px solid var(--border-soft)', textAlign: 'right' }}>
                      <td style={{ textAlign: 'left', padding: '8px 6px', fontWeight: 600, color: 'var(--text-1)' }}>
                        {item.label} <span style={{ fontSize: 10, color: 'var(--text-3)' }}>({item.unit})</span>
                      </td>
                      <td style={{ padding: '8px 6px', color: 'var(--text-2)', fontWeight: 600 }}>{broughtQty}</td>
                      <td style={{ padding: '8px 6px', color: '#2563eb', fontWeight: 700 }}>− {soldCount}</td>
                      <td style={{ padding: '8px 6px', color: '#7c3aed', fontWeight: 700 }}>= {totalRem}</td>
                      <td style={{ padding: '8px 6px', color: leftFriedQty > 0 ? '#dc2626' : 'var(--text-3)', fontWeight: 700 }}>
                        {leftFriedQty}
                      </td>
                      <td style={{ padding: '8px 6px', color: '#16a34a', fontWeight: 700 }}>
                        {unfriedQty} <span style={{ fontSize: 9, color: 'var(--text-3)' }}>({item.unit})</span>
                      </td>
                      <td style={{ padding: '8px 6px', textAlign: 'center' }}>
                        {leftFriedQty >= 5 && (item.key === 'chicken_pcs' || item.key === 'carcass_pcs') ? (
                          <span style={{ fontSize: 10, fontWeight: 700, color: '#dc2626', background: '#fee2e2', padding: '2px 6px', borderRadius: 4 }} title="Leftover fried chicken ≥ 5 pcs incurs payroll penalty (RM 2.50/staff)">
                            ⚠️ ≥5 Penalty
                          </span>
                        ) : leftFriedQty > 0 ? (
                          <span style={{ fontSize: 10, fontWeight: 600, color: '#d97706', background: '#fef3c7', padding: '2px 6px', borderRadius: 4 }}>
                            {leftFriedQty} waste
                          </span>
                        ) : (
                          <span style={{ fontSize: 10, fontWeight: 700, color: '#15803d', background: '#dcfce7', padding: '2px 6px', borderRadius: 4 }}>
                            ✓ 0 Waste
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Non-fried items section */}
          <div style={{
            marginTop: 14, padding: '10px 12px', borderRadius: 8,
            background: '#f8fafc', border: '1px solid #e2e8f0',
            fontSize: 11, color: 'var(--text-2)', display: 'flex', alignItems: 'center',
            justifyContent: 'space-between', flexWrap: 'wrap', gap: 8,
          }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Info size={13} color="var(--primary)" />
              Non-fried goods (Butter Rice & Sauces) auto-deducted via POS sales:
            </span>
            <span style={{ fontWeight: 600, color: 'var(--text-1)' }}>
              Nasi: {brought.butter_rice || 0} brought − {posSold.butter_rice || 0} sold = {Math.max(0, Number(brought.butter_rice || 0) - Number(posSold.butter_rice || 0))} remain &nbsp;|&nbsp;
              Sauces: {(Number(brought.cheese_sauce || 0) + Number(brought.korean_sauce || 0) + Number(brought.green_sauce || 0) + Number(brought.bbq_sauce || 0))} brought − {(Number(posSold.cheese_sauce || 0) + Number(posSold.korean_sauce || 0) + Number(posSold.green_sauce || 0) + Number(posSold.bbq_sauce || 0))} sold = {
                Math.max(0, Number(brought.cheese_sauce || 0) - Number(posSold.cheese_sauce || 0)) +
                Math.max(0, Number(brought.korean_sauce || 0) - Number(posSold.korean_sauce || 0)) +
                Math.max(0, Number(brought.green_sauce || 0) - Number(posSold.green_sauce || 0)) +
                Math.max(0, Number(brought.bbq_sauce || 0) - Number(posSold.bbq_sauce || 0))
              } remain
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Auto-filled POS Remainders & Carryover Section ──────────────────────────

function AutoRemaindersSection({ formData, posSummary, onAutofillFromPos, isSubmitted }) {
  const [isOpen, setIsOpen] = useState(true);
  const brought = formData.brought_to_stall || {};
  const remFried = formData.remaining_fried || {};
  const hasPos = (posSummary?.orderCount || 0) > 0;
  const posSold = posSummary?.soldBreakdown || {};

  const liveAuto = computeAutoRemainders(brought, remFried, posSold);
  const remUnfried = hasPos ? liveAuto.remaining_unfried : (formData.remaining_unfried || liveAuto.remaining_unfried);
  const otherRem = hasPos ? liveAuto.other_remaining : (formData.other_remaining || liveAuto.other_remaining);

  return (
    <div style={{
      background: '#fff', borderRadius: 'var(--radius)',
      border: '1.5px solid #16a34a40',
      boxShadow: isOpen ? '0 0 0 3px rgba(22, 163, 74, 0.08)' : 'var(--shadow-sm)',
      transition: 'all 0.2s ease', overflow: 'hidden', marginBottom: 16,
    }}>
      {/* Header */}
      <button
        type="button"
        onClick={() => setIsOpen(o => !o)}
        style={{
          display: 'flex', alignItems: 'center', gap: 12, width: '100%',
          padding: '16px 18px', border: 'none', background: 'transparent',
          cursor: 'pointer', fontFamily: 'var(--font)', textAlign: 'left',
        }}
      >
        <div style={{
          width: 38, height: 38, borderRadius: 10,
          background: 'rgba(22, 163, 74, 0.12)', display: 'flex', alignItems: 'center',
          justifyContent: 'center', color: '#16a34a', flexShrink: 0,
        }}>
          <Sparkles size={20} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-1)' }}>
              Auto-filled POS Remainders & Carryover
            </span>
            <span style={{ fontSize: 12, color: 'var(--text-3)', fontStyle: 'italic' }}>
              (Baki Auto dari POS)
            </span>
            <span style={{
              fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 99,
              background: '#dcfce7', color: '#15803d', border: '1px solid #bbf7d0',
              display: 'inline-flex', alignItems: 'center', gap: 4,
            }}>
              <CheckCircle2 size={11} /> Auto-Calculated
            </span>
            {hasPos && (
              <span style={{
                fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 99,
                background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe',
              }}>
                POS Synced ({posSummary.orderCount} order{posSummary.orderCount > 1 ? 's' : ''})
              </span>
            )}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>
            Unsold raw pieces carry over to tomorrow's Brought to Stall; unsold sauces & rice remain in stall.
          </div>
        </div>
        <div style={{ color: 'var(--text-3)', transition: 'transform 0.2s', transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)' }}>
          <ChevronRight size={18} />
        </div>
      </button>

      {isOpen && (
        <div style={{ padding: '0 18px 18px', borderTop: '1px solid var(--border-soft)' }}>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10,
            padding: '10px 14px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8,
            marginTop: 12, marginBottom: 16,
          }}>
            <div style={{ fontSize: 12, color: '#166534', display: 'flex', alignItems: 'center', gap: 6 }}>
              <Info size={16} style={{ color: '#16a34a', flexShrink: 0 }} />
              <span>
                <strong>Automated End-of-Day Remainders:</strong> Deducted live via POS sales. No manual counting needed for raw carryover, rice, or sauces.
              </span>
            </div>
            {!isSubmitted && (
              <button
                type="button"
                onClick={onAutofillFromPos}
                className="btn btn-sm"
                style={{
                  background: '#16a34a', color: '#fff', border: 'none', fontWeight: 700,
                  fontSize: 11, padding: '5px 12px', borderRadius: 6, display: 'inline-flex', alignItems: 'center', gap: 5,
                  cursor: 'pointer',
                }}
                title="Recalculate remainders with latest POS sales"
              >
                <Sparkles size={13} /> Re-sync from POS
              </button>
            )}
          </div>

          {/* Subheading: Raw Uncooked Carryover */}
          <div style={{ marginBottom: 16 }}>
            <div style={{
              fontSize: 12, fontWeight: 700, color: '#15803d', textTransform: 'uppercase',
              letterSpacing: '0.05em', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6
            }}>
              <span>🍗 Raw Uncooked Stock (Carryover to Tomorrow's Stall)</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
              {/* Chicken Pieces */}
              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '10px 12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>Chicken (Pieces)</span>
                  <span style={{ fontSize: 16, fontWeight: 800, color: '#16a34a' }}>
                    {remUnfried.chicken_pcs ?? 0} <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)' }}>pcs</span>
                  </span>
                </div>
                <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 4 }}>
                  {brought.chicken_pcs || 0} brought − {posSold.chicken_pcs || 0} sold {Number(remFried.chicken_pcs || 0) > 0 ? `− ${remFried.chicken_pcs} fried waste` : ''}
                </div>
              </div>

              {/* Carcass */}
              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '10px 12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>Carcass</span>
                  <span style={{ fontSize: 16, fontWeight: 800, color: '#16a34a' }}>
                    {remUnfried.carcass_pcs ?? 0} <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)' }}>pcs</span>
                  </span>
                </div>
                <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 4 }}>
                  {brought.carcass_pcs || 0} brought − {posSold.carcass_pcs || 0} sold {Number(remFried.carcass_pcs || 0) > 0 ? `− ${remFried.carcass_pcs} fried waste` : ''}
                </div>
              </div>

              {/* Neck */}
              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '10px 12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>Chicken Neck (4 pcs)</span>
                  <span style={{ fontSize: 16, fontWeight: 800, color: '#16a34a' }}>
                    {remUnfried.neck ?? 0} <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)' }}>set</span>
                  </span>
                </div>
                <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 4 }}>
                  {brought.chicken_neck_set || 0} brought − {posSold.chicken_neck_set || 0} sold
                </div>
              </div>

              {/* Mushroom */}
              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '10px 12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>Mushroom</span>
                  <span style={{ fontSize: 16, fontWeight: 800, color: '#16a34a' }}>
                    {remUnfried.mushroom ?? 0} <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)' }}>set</span>
                  </span>
                </div>
                <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 4 }}>
                  {brought.mushroom || 0} brought − {posSold.mushroom || 0} sold
                </div>
              </div>
            </div>
          </div>

          {/* Subheading: Non-Fried Goods Remaining */}
          <div>
            <div style={{
              fontSize: 12, fontWeight: 700, color: '#2563eb', textTransform: 'uppercase',
              letterSpacing: '0.05em', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6
            }}>
              <span>🍚 Non-Fried Inventory (Remaining in Stall)</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
              {/* Butter Rice */}
              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '10px 12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>Butter Rice</span>
                  <span style={{ fontSize: 15, fontWeight: 800, color: '#2563eb' }}>
                    {otherRem.butter_rice ?? 0} <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-3)' }}>set</span>
                  </span>
                </div>
                <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 4 }}>
                  {brought.butter_rice || 0} brought − {posSold.butter_rice || 0} sold
                </div>
              </div>

              {/* Cheese Sauce */}
              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '10px 12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>Cheese Sauce</span>
                  <span style={{ fontSize: 15, fontWeight: 800, color: '#2563eb' }}>
                    {otherRem.cheese_sauce ?? 0} <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-3)' }}>pcs</span>
                  </span>
                </div>
                <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 4 }}>
                  {brought.cheese_sauce || 0} brought − {posSold.cheese_sauce || 0} sold
                </div>
              </div>

              {/* Korean Sauce */}
              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '10px 12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>Korean Sauce</span>
                  <span style={{ fontSize: 15, fontWeight: 800, color: '#2563eb' }}>
                    {otherRem.korean_sauce ?? 0} <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-3)' }}>pcs</span>
                  </span>
                </div>
                <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 4 }}>
                  {brought.korean_sauce || 0} brought − {posSold.korean_sauce || 0} sold
                </div>
              </div>

              {/* Green Sauce */}
              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '10px 12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>Green Sauce</span>
                  <span style={{ fontSize: 15, fontWeight: 800, color: '#2563eb' }}>
                    {otherRem.green_sauce ?? 0} <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-3)' }}>pcs</span>
                  </span>
                </div>
                <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 4 }}>
                  {brought.green_sauce || 0} brought − {posSold.green_sauce || 0} sold
                </div>
              </div>

              {/* BBQ Sauce */}
              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '10px 12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>BBQ Sauce</span>
                  <span style={{ fontSize: 15, fontWeight: 800, color: '#2563eb' }}>
                    {otherRem.bbq_sauce ?? 0} <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-3)' }}>pcs</span>
                  </span>
                </div>
                <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 4 }}>
                  {brought.bbq_sauce || 0} brought − {posSold.bbq_sauce || 0} sold
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Recent entries sidebar widget ───────────────────────────────────────────

function RecentEntries({ entries, currentDate, onSelect, loading }) {
  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text-3)' }}>
        <Loader size={16} style={{ animation: 'spin 1s linear infinite' }} />
      </div>
    );
  }

  return (
    <div style={{
      background: '#fff', borderRadius: 'var(--radius)', border: '1px solid var(--border)',
      padding: '16px 18px', boxShadow: 'var(--shadow-sm)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <History size={15} style={{ color: 'var(--text-3)' }} />
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)' }}>Recent Entries</span>
      </div>

      {entries.length === 0 ? (
        <div style={{ fontSize: 12, color: 'var(--text-3)', textAlign: 'center', padding: '12px 0' }}>
          No entries yet. Start by filling in today's data.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {entries.slice(0, 7).map(entry => {
            const isActive = entry.date === currentDate;
            const dateObj = new Date(entry.date + 'T00:00:00');
            const dayLabel = dateObj.toLocaleDateString('en-MY', { weekday: 'short', month: 'short', day: 'numeric' });

            return (
              <button
                key={entry.date}
                onClick={() => onSelect(entry.date)}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '9px 12px', borderRadius: 8, border: 'none',
                  background: isActive ? 'var(--primary-light)' : 'transparent',
                  cursor: 'pointer', fontFamily: 'var(--font)', textAlign: 'left',
                  transition: 'background 0.12s',
                }}
                onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = '#f4f4f5'; }}
                onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}
              >
                <span style={{
                  fontSize: 13, fontWeight: isActive ? 600 : 500,
                  color: isActive ? 'var(--primary)' : 'var(--text-2)',
                }}>
                  {dayLabel}
                </span>
                <span style={{
                  fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 99,
                  background: entry.status === 'submitted' ? 'var(--green-light)' : 'var(--amber-light)',
                  color: entry.status === 'submitted' ? '#15803d' : '#b45309',
                }}>
                  {entry.status === 'submitted' ? 'Submitted' : 'Draft'}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Main Dashboard Page ─────────────────────────────────────────────────────

export default function StaffDashboardPage({ isMobile }) {
  const { profile } = useAuth();
  const isAdminUser = profile?.role === 'Admin';
  const [selectedDate, setSelectedDate] = useState(todayStr());
  const [formData, setFormData] = useState(buildEmptyDayData());
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState('draft');       // 'draft' | 'submitted'
  const [openCategories, setOpenCategories] = useState({ raw_materials: true, brought_to_stall: true });
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState(null);         // { type, text }
  const [loadingState, setLoading] = useState(true);
  const [loadedDate, setLoadedDate] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [openingInventory, setOpeningInventory] = useState({ balances: {}, warnings: [] });
  const loading = loadingState || loadedDate !== selectedDate;
  const [recentEntries, setRecentEntries] = useState([]);
  const [recentLoading, setRecentLoading] = useState(true);
  const [prevDayData, setPrevDayData] = useState(null); // for carry-forward
  const [chickenCutYield, setChickenCutYield] = useState(9); // 9 or 8 pcs per whole chicken
  const [posSummary, setPosSummary] = useState(null);
  const [posLoading, setPosLoading] = useState(false);
  const [stockReceivedSynced, setStockReceivedSynced] = useState(false);
  const [stockSending, setStockSending] = useState(false);

  const isToday = selectedDate === todayStr();
  const isSubmitted = status === 'submitted';

  // ─── Attendance / Shift State ──────────────────────────────────────────
  const [activeShift, setActiveShift] = useState(null);
  const [shiftLoading, setShiftLoading] = useState(true);
  const [attendanceModal, setAttendanceModal] = useState(null); // 'checkIn' | 'checkOut' | null
  const [verifyPassword, setVerifyPassword] = useState('');
  const [showVerifyPassword, setShowVerifyPassword] = useState(false);
  const [verifyError, setVerifyError] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [attendanceMsg, setAttendanceMsg] = useState(null);

  // Load staff member's shift for today
  const loadStaffShift = useCallback(async () => {
    if (!profile?.id || isAdminUser) {
      setShiftLoading(false);
      return;
    }
    try {
      setShiftLoading(true);
      // First check if there is an active open shift
      const active = await staffShiftService.getActiveShift(profile.id);
      if (active) {
        setActiveShift(active);
      } else {
        // Check if there is already a completed or past shift today
        const todayShift = await staffShiftService.getTodayShift(profile.id);
        setActiveShift(todayShift);
      }
    } catch (err) {
      console.warn('[StaffDashboardPage] error loading shift:', err);
    } finally {
      setShiftLoading(false);
    }
  }, [profile?.id]);

  useEffect(() => {
    loadStaffShift();
  }, [loadStaffShift]);

  // Execute Check In / Check Out after password verification
  const handleConfirmAttendance = async (e) => {
    if (e) e.preventDefault();
    if (!verifyPassword) {
      setVerifyError('Please enter your password.');
      return;
    }
    setVerifying(true);
    setVerifyError('');

    try {
      const email = auth.currentUser?.email || profile?.email;
      let authenticated = false;

      // 1. Try Firebase Auth reauthentication / signIn
      if (auth.currentUser && email) {
        try {
          const cred = EmailAuthProvider.credential(email, verifyPassword);
          await reauthenticateWithCredential(auth.currentUser, cred);
          authenticated = true;
        } catch (authErr) {
          try {
            await signInWithEmailAndPassword(auth, email, verifyPassword);
            authenticated = true;
          } catch (innerErr) {
            console.warn('[Auth recheck] standard auth failed, checking Firestore record...');
          }
        }
      }

      // 2. Fallback check against staff record in Firestore (e.g. if created via admin manager)
      if (!authenticated && profile?.id) {
        const staffDoc = await staffService.getById(profile.id);
        if (staffDoc && staffDoc.password && staffDoc.password === verifyPassword) {
          authenticated = true;
        }
      }

      if (!authenticated) {
        setVerifyError('Incorrect password. Please re-enter your account password.');
        setVerifying(false);
        return;
      }

      // Format current time HH:MM
      const now = new Date();
      const timeStr = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });

      if (attendanceModal === 'checkIn') {
        const shiftId = await staffShiftService.clockIn(profile.id, profile.outletId || 'outlet-1');

        // Also update staff profile's checkIn
        await staffService.update(profile.id, { checkIn: timeStr });

        setAttendanceMsg({ type: 'success', text: `Checked in successfully at ${timeStr}!` });
      } else if (attendanceModal === 'checkOut') {
        if (activeShift?.id) {
          await staffShiftService.clockOut(activeShift.id);
        } else {
          // If no open shift doc was tracked, clock in & immediately close
          const newId = await staffShiftService.clockIn(profile.id, profile.outletId || 'outlet-1');
          await staffShiftService.clockOut(newId);
        }

        // Also update staff profile's checkOut
        await staffService.update(profile.id, { checkOut: timeStr });

        setAttendanceMsg({ type: 'success', text: `Checked out successfully at ${timeStr}!` });
      }

      // Refresh shift data
      await loadStaffShift();

      // Reset modal state
      setAttendanceModal(null);
      setVerifyPassword('');
      setShowVerifyPassword(false);
      setTimeout(() => setAttendanceMsg(null), 5000);
    } catch (err) {
      console.error('[Attendance] error:', err);
      setVerifyError('Failed to process: ' + (err.message || 'Unknown error'));
    } finally {
      setVerifying(false);
    }
  };

  // ─── Load recent entries ────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const recent = await dailyInventoryService.getRecent(14);
        if (!cancelled) setRecentEntries(recent);
      } catch (err) {
        console.error('[Dashboard] recent entries error:', err);
      } finally {
        if (!cancelled) setRecentLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [saveMsg]); // refresh after save

  // Load every opening-stock dependency together, regardless of request completion order.
  const dayOfWeek = new Date(selectedDate + 'T00:00:00Z').getUTCDay();
  const isSaturday = dayOfWeek === 6;
  const isSunday = dayOfWeek === 0;
  const prevTradingDate = getPreviousTradingDate(selectedDate);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setPosLoading(true);
    setLoadError(null);
    setPrevDayData(null);
    setPosSummary(null);
    setFormData(buildEmptyDayData());
    loadStallDay(selectedDate, {
      getDay: dailyInventoryService.getByDate,
      getSales: salesOrderService.getDailySummary,
      getInventory: dailyInventoryService.getOpeningInventory,
    }).then(({ record, previous, sales, inventory, data }) => {
      if (cancelled) return;
      setFormData(data);
      setPrevDayData(previous?.data || null);
      setPosSummary(sales);
      setOpeningInventory(inventory);
      setNotes(record?.notes || '');
      setStatus(record?.status || 'draft');
      setStockReceivedSynced(!!(record?.stockReceivedSynced || record?.status === 'submitted'));
      const whole = Number(data.raw_materials?.chicken_whole || 0);
      const pieces = Number(data.raw_materials?.chicken_pcs || 0);
      setChickenCutYield(whole > 0 && Math.round(pieces / whole) === 8 ? 8 : 9);
    }).catch(err => {
      if (!cancelled) setLoadError('Could not load opening stock: ' + err.message);
    }).finally(() => {
      if (!cancelled) {
        setLoadedDate(selectedDate);
        setLoading(false);
        setPosLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, [selectedDate, reloadKey]);

  // Refresh live dependencies before saving while retaining unsaved receipt inputs.
  const refreshOpeningData = useCallback(async (data) => {
    const [previous, inventory, sales] = await Promise.all([
      dailyInventoryService.getByDate(prevTradingDate),
      dailyInventoryService.getOpeningInventory(selectedDate),
      salesOrderService.getDailySummary(selectedDate),
    ]);
    setPrevDayData(previous?.data || null);
    setOpeningInventory(inventory);
    setPosSummary(sales);
    return reconcileStallOpening(data, previous?.data, inventory, selectedDate, sales?.soldBreakdown);
  }, [selectedDate, prevTradingDate]);

  // Every draft edit uses the same model as loading and saving.
  const handleChange = useCallback((categoryKey, productKey, value) => {
    if (loading || loadError || saving || stockSending) return;
    setFormData(prev => {
      const category = { ...prev[categoryKey], [productKey]: value };
      if (categoryKey === 'raw_materials' && productKey === 'chicken_whole') {
        category.chicken_pcs = Math.round((Number(value) || 0) * chickenCutYield);
      }
      const next = { ...prev, [categoryKey]: category };
      return isSubmitted ? next : reconcileStallOpening(next, prevDayData, openingInventory, selectedDate, posSummary?.soldBreakdown);
    });
  }, [loading, loadError, saving, stockSending, chickenCutYield, isSubmitted, prevDayData, openingInventory, selectedDate, posSummary]);

  const toggleCategory = useCallback((catKey) => {
    setOpenCategories(prev => ({ ...prev, [catKey]: !prev[catKey] }));
  }, []);

  const handleRecalculateBrought = useCallback(async () => {
    if (loading || loadError || isSubmitted || saving || stockSending) return;
    setSaving(true);
    try {
      setFormData(await refreshOpeningData(formData));
      setSaveMsg({ type: 'success', text: 'Carryover, received stock and POS remainders refreshed.' });
    } catch (err) {
      setSaveMsg({ type: 'error', text: 'Refresh failed: ' + err.message });
    } finally { setSaving(false); }
  }, [loading, loadError, isSubmitted, saving, stockSending, refreshOpeningData, formData]);

  const handleMarkSaturdayClosed = useCallback(() => {
    setFormData(prev => reconcileStallOpening(prev, prevDayData, openingInventory, selectedDate, posSummary?.soldBreakdown));
    setNotes(prev => prev.includes('Saturday') ? prev : `${prev} (Stall closed on Saturday)`.trim());
  }, [prevDayData, openingInventory, selectedDate, posSummary]);

  const handleSyncPreviousDay = handleRecalculateBrought;

  const handleCutYieldChange = useCallback((newYield) => {
    if (isSubmitted || loading || saving || stockSending) return;
    setChickenCutYield(newYield);
    setFormData(prev => {
      const whole = Number(prev.raw_materials?.chicken_whole || 0);
      const next = whole > 0 ? { ...prev, raw_materials: { ...prev.raw_materials, chicken_pcs: Math.round(whole * newYield) } } : prev;
      return reconcileStallOpening(next, prevDayData, openingInventory, selectedDate, posSummary?.soldBreakdown);
    });
  }, [isSubmitted, loading, saving, stockSending, prevDayData, openingInventory, selectedDate, posSummary]);

  const handleAutofillFromPos = handleRecalculateBrought;

  // ─── Re-apply a submitted day to inventory (reverses prior, applies again) ───
  const handleReapplyInventory = useCallback(async () => {
    if (!window.confirm(`Re-apply ${selectedDate} to inventory? Any stock changes previously made for this date will be reversed first, then applied again.`)) return;
    setSaving(true);
    setSaveMsg(null);
    try {
      const autoRem = computeAutoRemainders(
        formData.brought_to_stall,
        formData.remaining_fried,
        posSummary?.soldBreakdown || {}
      );
      const dataToSync = {
        ...formData,
        remaining_unfried: autoRem.remaining_unfried,
        other_remaining: autoRem.other_remaining,
      };
      const result = await dailyInventoryService.syncInventoryFromDailyData(selectedDate, dataToSync, { force: true });
      const n = result?.updated?.length || 0;
      const miss = result?.unmatched?.length ? ` (no inventory item for: ${result.unmatched.join(', ')})` : '';
      setSaveMsg({ type: 'success', text: `Re-applied: ${n} inventory movement(s)${miss}` });
    } catch (err) {
      console.error('[Dashboard] re-apply failed:', err);
      setSaveMsg({ type: 'error', text: `Re-apply failed: ${err.message}` });
    } finally {
      setSaving(false);
      setTimeout(() => setSaveMsg(null), 6000);
    }
  }, [selectedDate, formData, posSummary]);

  // ─── Admin Save KG updates after submission ──────────────────────────────
  const handleSaveAdminKg = useCallback(async () => {
    setSaving(true);
    setSaveMsg(null);
    try {
      const staffName = profile?.name || profile?.username || 'Admin';
      await dailyInventoryService.save(
        selectedDate,
        formData,
        staffName,
        'submitted',
        notes,
      );
      setSaveMsg({ type: 'success', text: 'Chicken & Carcass KG updated successfully!' });
      setTimeout(() => setSaveMsg(null), 5000);
    } catch (err) {
      console.error('[Dashboard] save KG error:', err);
      setSaveMsg({ type: 'error', text: `Save failed: ${err.message}` });
    } finally {
      setSaving(false);
    }
  }, [selectedDate, formData, notes, profile]);

  // ─── Save as draft or final submit ──────────────────────────────────────
  const handleSave = useCallback(async (finalSubmit = false) => {
    if (loading || loadError || saving || stockSending) return;
    if (isSubmitted) {
      setSaveMsg({ type: 'error', text: 'This day report has already been submitted and cannot be resubmitted.' });
      return;
    }
    setSaving(true);
    setSaveMsg(null);
    try {
      const staffName = profile?.name || profile?.username || 'Unknown';
      const dataToSave = await refreshOpeningData(formData);
      setFormData(dataToSave);
      await dailyInventoryService.save(
        selectedDate,
        dataToSave,
        staffName,
        'draft',
        notes,
      );
      if (!finalSubmit) {
        setSaveMsg({ type: 'success', text: 'Draft saved!' });
      } else {
        // Receipts may have changed since the morning send. Apply their delta first.
        const receiptResult = await dailyInventoryService.sendReceivedStockToInventory(selectedDate, dataToSave);
        if (receiptResult.unmatched?.length) {
          throw new Error(`Draft saved. Match these inventory items before submitting: ${receiptResult.unmatched.join(', ')}`);
        }
        const syncResult = await dailyInventoryService.syncInventoryFromDailyData(selectedDate, dataToSave);
        if (syncResult.unmatched?.length) {
          throw new Error(`Draft saved. Closing stock has unmatched inventory items: ${syncResult.unmatched.join(', ')}`);
        }
        await dailyInventoryService.submit(selectedDate);
        setStatus('submitted');
        setStockReceivedSynced(true);
        setSaveMsg({ type: 'success', text: syncResult.skipped
          ? 'Submitted. Closing stock was already applied for this date.'
          : `Submitted and ${syncResult.updated.length} closing movement(s) applied.` });
      }
      setTimeout(() => setSaveMsg(null), 6000);
    } catch (err) {
      console.error('[Dashboard] save error:', err);
      setSaveMsg({ type: 'error', text: `Save failed: ${err.message}` });
    } finally {
      setSaving(false);
    }
  }, [selectedDate, formData, notes, profile, isSubmitted, refreshOpeningData, loading, loadError, saving, stockSending]);

  // ─── Send Raw Materials & Brought Stock into Central Inventory ──────────
  const handleSendStockToInventory = useCallback(async () => {
    if (loading || loadError || saving || stockSending) return;
    if (isSubmitted) {
      setSaveMsg({ type: 'error', text: 'This day report has already been submitted and locked.' });
      return;
    }
    setStockSending(true);
    setSaveMsg(null);
    try {
      const staffName = profile?.name || profile?.username || 'Unknown';
      const dataToSave = await refreshOpeningData(formData);
      setFormData(dataToSave);

      // Save draft with current numbers first
      await dailyInventoryService.save(
        selectedDate,
        dataToSave,
        staffName,
        'draft',
        notes,
      );

      // Send received stock to products
      const result = await dailyInventoryService.sendReceivedStockToInventory(selectedDate, dataToSave);
      setStockReceivedSynced(!result?.unmatched?.length);
      const n = result?.updated?.length || 0;
      const miss = result?.unmatched?.length ? ` (no inventory item for: ${result.unmatched.join(', ')})` : '';
      setSaveMsg({ type: 'success', text: `Stock sent to inventory! ${n} item(s) credited${miss}` });
      setTimeout(() => setSaveMsg(null), 5000);
    } catch (err) {
      console.error('[Dashboard] send stock error:', err);
      setSaveMsg({ type: 'error', text: `Failed to send stock: ${err.message}` });
    } finally {
      setStockSending(false);
    }
  }, [selectedDate, formData, notes, profile, isSubmitted, refreshOpeningData, loading, loadError, saving, stockSending]);

  // ─── Summary computations ──────────────────────────────────────────────
  const summaryStats = useMemo(() => {
    const rawTotal = Object.values(formData.raw_materials || {}).reduce((s, v) => s + (v || 0), 0);
    const stallTotal = Object.values(formData.brought_to_stall || {}).reduce((s, v) => s + (v || 0), 0);
    const friedTotal = Object.values(formData.remaining_fried || {}).reduce((s, v) => s + (v || 0), 0);
    const unfriedTotal = Object.values(formData.remaining_unfried || {}).reduce((s, v) => s + (v || 0), 0);
    const otherTotal = Object.values(formData.other_remaining || {}).reduce((s, v) => s + (v || 0), 0);

    return { rawTotal, stallTotal, friedTotal, unfriedTotal, otherTotal };
  }, [formData]);

  // ─── Fried / Sold reconciliation (Excel ProductInventory logic) ────────
  const friedAndSold = useMemo(
    () => getFriedAndSoldQuantities(formData),
    [formData]
  );
  const chickenSoldToday = friedAndSold.sold.chicken_pcs || 0;
  const carcassSoldToday = friedAndSold.sold.carcass_pcs || 0;

  // ─── Baki Dah Goreng Harian (Fried Leftover Penalty) ───────────────────
  const friedLeftoverPenalty = useMemo(() => {
    return calculateFriedLeftoverPenalty(formData);
  }, [formData]);

  // ─── Render ────────────────────────────────────────────────────────────
  // Format check in / out times for display
  const clockInDisplay = activeShift?.clockIn?.toDate
    ? activeShift.clockIn.toDate().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
    : (profile?.checkIn || null);
  const clockOutDisplay = activeShift?.clockOut?.toDate
    ? activeShift.clockOut.toDate().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
    : null;
  const isShiftOpen = activeShift && !activeShift.clockOut;

  return (
    <div>
      {/* ──── Top Staff Attendance (Check In / Check Out) Banner ──── */}
      {!isAdminUser && (
        <div style={{
        background: '#fff',
        borderRadius: 'var(--radius)',
        border: '1px solid var(--border)',
        padding: '16px 20px',
        marginBottom: 20,
        boxShadow: 'var(--shadow-sm)',
        display: 'flex',
        flexDirection: isMobile ? 'column' : 'row',
        alignItems: isMobile ? 'stretch' : 'center',
        justifyContent: 'space-between',
        gap: 16,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{
            width: 44, height: 44, borderRadius: 12,
            background: isShiftOpen ? 'var(--green-light)' : 'var(--primary-light)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: isShiftOpen ? '#15803d' : 'var(--primary)',
            flexShrink: 0
          }}>
            <Clock size={22} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-1)' }}>
                {profile?.name || 'Staff Member'}
              </span>
              <span style={{
                fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 99,
                background: isShiftOpen ? '#dcfce7' : '#f4f4f5',
                color: isShiftOpen ? '#15803d' : '#71717a'
              }}>
                {isShiftOpen ? '● On Duty' : '○ Not Clocked In'}
              </span>
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span>Shift: <strong>{clockInDisplay || 'Not checked in'}</strong> {clockOutDisplay ? `→ ${clockOutDisplay}` : (isShiftOpen ? '→ Active' : '')}</span>
              {isShiftOpen && activeShift?.clockIn?.toDate && (
                <span style={{ color: '#16a34a', fontWeight: 600 }}>
                  (Started {activeShift.clockIn.toDate().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })})
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            type="button"
            className="btn"
            disabled={isShiftOpen || shiftLoading}
            onClick={() => {
              setAttendanceModal('checkIn');
              setVerifyPassword('');
              setVerifyError('');
              setShowVerifyPassword(false);
            }}
            style={{
              background: isShiftOpen ? '#f4f4f5' : '#16a34a',
              color: isShiftOpen ? '#a1a1aa' : '#fff',
              border: 'none',
              padding: '10px 18px',
              fontWeight: 700,
              fontSize: 13,
              borderRadius: 'var(--radius-sm)',
              cursor: isShiftOpen ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              boxShadow: isShiftOpen ? 'none' : '0 2px 6px rgba(22, 163, 74, 0.25)',
              transition: 'all 0.15s ease',
            }}
          >
            <LogIn size={16} /> Check In
          </button>

          <button
            type="button"
            className="btn"
            disabled={!isShiftOpen || shiftLoading}
            onClick={() => {
              setAttendanceModal('checkOut');
              setVerifyPassword('');
              setVerifyError('');
              setShowVerifyPassword(false);
            }}
            style={{
              background: !isShiftOpen ? '#f4f4f5' : '#dc2626',
              color: !isShiftOpen ? '#a1a1aa' : '#fff',
              border: 'none',
              padding: '10px 18px',
              fontWeight: 700,
              fontSize: 13,
              borderRadius: 'var(--radius-sm)',
              cursor: !isShiftOpen ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              boxShadow: !isShiftOpen ? 'none' : '0 2px 6px rgba(220, 38, 38, 0.25)',
              transition: 'all 0.15s ease',
            }}
          >
            <LogOut size={16} /> Check Out
          </button>
        </div>
      </div>
      )}

      {/* Attendance Notification banner if available */}
      {!isAdminUser && attendanceMsg && (
        <div style={{
          background: attendanceMsg.type === 'success' ? '#f0fdf4' : '#fef2f2',
          border: `1px solid ${attendanceMsg.type === 'success' ? '#bbf7d0' : '#fecaca'}`,
          color: attendanceMsg.type === 'success' ? '#15803d' : '#dc2626',
          padding: '10px 16px',
          borderRadius: 'var(--radius-sm)',
          marginBottom: 16,
          fontSize: 13,
          fontWeight: 600,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}>
          {attendanceMsg.type === 'success' ? <Check size={16} /> : <AlertCircle size={16} />}
          {attendanceMsg.text}
        </div>
      )}

      {/* ──── Password Verification Modal for Check In / Out ──── */}
      {!isAdminUser && attendanceModal && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          background: 'rgba(0, 0, 0, 0.5)',
          backdropFilter: 'blur(3px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 16,
        }}>
          <div style={{
            background: '#fff',
            borderRadius: 14,
            width: '100%',
            maxWidth: 420,
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
            overflow: 'hidden',
          }}>
            {/* Modal Header */}
            <div style={{
              padding: '16px 20px',
              borderBottom: '1px solid var(--border)',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              background: attendanceModal === 'checkIn' ? '#f0fdf4' : '#fef2f2',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{
                  width: 32, height: 32, borderRadius: 8,
                  background: attendanceModal === 'checkIn' ? '#dcfce7' : '#fee2e2',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: attendanceModal === 'checkIn' ? '#16a34a' : '#dc2626',
                }}>
                  {attendanceModal === 'checkIn' ? <LogIn size={17} /> : <LogOut size={17} />}
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--text-1)' }}>
                    Confirm {attendanceModal === 'checkIn' ? 'Check In' : 'Check Out'}
                  </h3>
                  <p style={{ margin: 0, fontSize: 11, color: 'var(--text-3)' }}>
                    Please verify your account password to continue
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => { setAttendanceModal(null); setVerifyPassword(''); setVerifyError(''); }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', fontSize: 18, lineHeight: 1 }}
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <form onSubmit={handleConfirmAttendance} style={{ padding: '20px' }}>
              <div style={{
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: 8,
                padding: '10px 12px',
                marginBottom: 16,
                fontSize: 12,
                color: 'var(--text-2)'
              }}>
                <div>Staff: <strong>{profile?.name}</strong> {profile?.username ? `(@${profile.username})` : ''}</div>
                <div>Time: <strong>{new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}</strong> ({todayStr()})</div>
              </div>

              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-2)', marginBottom: 6 }}>
                  Re-enter Password
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    type={showVerifyPassword ? 'text' : 'password'}
                    className="inp"
                    autoFocus
                    placeholder="Enter your login password"
                    value={verifyPassword}
                    onChange={e => setVerifyPassword(e.target.value)}
                    style={{
                      width: '100%',
                      paddingRight: 40,
                      boxSizing: 'border-box',
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowVerifyPassword(!showVerifyPassword)}
                    style={{
                      position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                      background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 0
                    }}
                  >
                    {showVerifyPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              {verifyError && (
                <div style={{
                  background: '#fef2f2', border: '1px solid #fecaca',
                  borderRadius: 6, padding: '8px 12px', fontSize: 12, color: '#dc2626',
                  marginBottom: 16, display: 'flex', alignItems: 'center', gap: 6
                }}>
                  <AlertCircle size={14} style={{ flexShrink: 0 }} />
                  {verifyError}
                </div>
              )}

              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => { setAttendanceModal(null); setVerifyPassword(''); setVerifyError(''); }}
                  disabled={verifying}
                  style={{ flex: 1, justifyContent: 'center' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn"
                  disabled={verifying}
                  style={{
                    flex: 1,
                    justifyContent: 'center',
                    background: attendanceModal === 'checkIn' ? '#16a34a' : '#dc2626',
                    color: '#fff',
                    border: 'none',
                    fontWeight: 700,
                  }}
                >
                  {verifying ? (
                    <><Loader size={14} style={{ animation: 'spin 1s linear infinite' }} /> Verifying...</>
                  ) : (
                    <>Confirm {attendanceModal === 'checkIn' ? 'Check In' : 'Check Out'}</>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ──── Date Navigation & Status ──── */}
      <div style={{
        display: 'flex', flexDirection: isMobile ? 'column' : 'row',
        alignItems: isMobile ? 'stretch' : 'center', justifyContent: 'space-between',
        gap: 12, marginBottom: 20,
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          background: '#fff', borderRadius: 'var(--radius)',
          border: '1px solid var(--border)', padding: '6px 8px',
          boxShadow: 'var(--shadow-sm)',
        }}>
          <button
            onClick={() => setSelectedDate(d => shiftDate(d, -1))}
            disabled={saving || stockSending}
            className="btn btn-ghost btn-sm"
            style={{ padding: '6px 8px' }}
          >
            <ArrowLeft size={16} />
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 8px' }}>
            <CalendarDays size={16} style={{ color: 'var(--primary)', flexShrink: 0 }} />
            <input
              type="date"
              value={selectedDate}
              onChange={e => { if (e.target.value) setSelectedDate(e.target.value); }}
              disabled={saving || stockSending}
              max={todayStr()}
              style={{
                border: 'none', background: 'transparent', fontFamily: 'var(--font)',
                fontSize: 14, fontWeight: 600, color: 'var(--text-1)', cursor: 'pointer',
                outline: 'none', width: isMobile ? 140 : 'auto',
              }}
            />
          </div>

          <button
            onClick={() => { if (selectedDate < todayStr()) setSelectedDate(d => shiftDate(d, 1)); }}
            className="btn btn-ghost btn-sm"
            style={{ padding: '6px 8px', opacity: selectedDate >= todayStr() ? 0.3 : 1 }}
            disabled={saving || stockSending || selectedDate >= todayStr()}
          >
            <ArrowRight size={16} />
          </button>

          {!isToday && (
            <button
              onClick={() => setSelectedDate(todayStr())}
              disabled={saving || stockSending}
              className="btn btn-ghost btn-sm"
              style={{ fontSize: 11, fontWeight: 700, color: 'var(--primary)' }}
            >
              Today
            </button>
          )}
        </div>

        {/* Status badge + actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            fontSize: 12, fontWeight: 700, padding: '6px 12px', borderRadius: 99,
            background: isSubmitted ? 'var(--green-light)' : 'var(--amber-light)',
            color: isSubmitted ? '#15803d' : '#b45309',
          }}>
            {isSubmitted ? <CheckCircle2 size={13} /> : <Clock size={13} />}
            {isSubmitted ? 'Submitted' : 'Draft'}
          </div>

          {prevDayData && !isSubmitted && (
            <button
              onClick={handleSyncPreviousDay}
              className="btn btn-outline btn-sm"
              style={{ fontSize: 12, gap: 5 }}
              title={`Carrying over from ${formatDateDisplay(prevTradingDate)}`}
            >
              <RotateCcw size={13} /> Sync from {isSunday ? 'Friday' : 'Previous Day'}
            </button>
          )}
        </div>
      </div>

      {/* ──── Date display ──── */}
      <div style={{ fontSize: isMobile ? 14 : 16, fontWeight: 600, color: 'var(--text-2)', marginBottom: 16 }}>
        <ClipboardList size={16} style={{ verticalAlign: -3, marginRight: 6, color: 'var(--primary)' }} />
        {formatDateDisplay(selectedDate)}
      </div>

      {/* ──── Summary Cards ──── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(7, 1fr)',
        gap: 10, marginBottom: 20,
      }}>
        <SummaryCard
          label="Raw Materials" value={summaryStats.rawTotal.toFixed(1)} icon={Package}
          color="#3b82f6" sub="Items logged" loading={loading}
        />
        <SummaryCard
          label="To Stall" value={summaryStats.stallTotal.toFixed(1)} icon={Truck}
          color="#8b5cf6" sub="Auto calculated" loading={loading}
        />
        <SummaryCard
          label="Left Fried" value={friedLeftoverPenalty.totalFriedLeft} icon={Flame}
          color={friedLeftoverPenalty.qualifiesForPenalty ? '#ef4444' : '#16a34a'}
          highlight={friedLeftoverPenalty.qualifiesForPenalty}
          sub={friedLeftoverPenalty.qualifiesForPenalty
            ? `⚠️ RM ${friedLeftoverPenalty.perStaffDeduction.toFixed(2)} / staff`
            : (friedLeftoverPenalty.totalFriedLeft > 0 ? '✓ Safe (<5 pcs)' : '0 unsold')}
          loading={loading}
        />
        <SummaryCard
          label="Left Unfried" value={summaryStats.unfriedTotal.toFixed(1)} icon={PackageOpen}
          color="#f59e0b" sub="Carries over" loading={loading}
        />
        <SummaryCard
          label="Chicken Sold"
          value={posSummary && posSummary.orderCount > 0 ? (posSummary.soldBreakdown?.chicken_pcs || 0) : chickenSoldToday.toFixed(1)}
          icon={CheckCircle2}
          color="#16a34a"
          sub={posSummary && posSummary.orderCount > 0 ? `${posSummary.orderCount} POS orders` : 'Pcs today'}
          loading={loading || posLoading}
        />
        <SummaryCard
          label="Carcass Sold"
          value={posSummary && posSummary.orderCount > 0 ? (posSummary.soldBreakdown?.carcass_pcs || 0) : carcassSoldToday.toFixed(1)}
          icon={CheckCircle2}
          color="#16a34a"
          sub={posSummary && posSummary.orderCount > 0 ? `${posSummary.orderCount} POS orders` : 'Pcs today'}
          loading={loading || posLoading}
        />
        <SummaryCard
          label="Waste Charge"
          value={`RM ${friedLeftoverPenalty.totalCharge.toFixed(2)}`}
          icon={AlertTriangle}
          color={friedLeftoverPenalty.qualifiesForPenalty ? '#dc2626' : '#71717a'}
          highlight={friedLeftoverPenalty.qualifiesForPenalty}
          sub={friedLeftoverPenalty.qualifiesForPenalty ? `RM ${friedLeftoverPenalty.perStaffDeduction.toFixed(2)} staff share` : 'RM 0.00 (<5 pcs safe)'}
          loading={loading}
        />
      </div>

      {/* ──── Main content grid ──── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: isMobile ? '1fr' : '1fr 260px',
        gap: 16,
      }}>
        {/* Left: Category forms + Reconciliation table */}
        <div>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--text-3)' }}>
              <Loader size={24} style={{ animation: 'spin 1s linear infinite' }} />
              <div style={{ marginTop: 8, fontSize: 13 }}>Loading inventory data…</div>
            </div>
          ) : loadError ? (
            <div role="alert" className="card" style={{ padding: 20, color: '#b91c1c' }}>
              {loadError}
              <button type="button" className="btn btn-outline" onClick={() => setReloadKey(value => value + 1)} style={{ marginTop: 12 }}>Retry loading stock</button>
            </div>
          ) : (
            <>
              {/* POS Live Connected Banner */}
              {posSummary && posSummary.orderCount > 0 && (
                <div style={{
                  background: 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)',
                  border: '1.5px solid #bfdbfe',
                  borderRadius: 'var(--radius)',
                  padding: '12px 16px',
                  marginBottom: 14,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: 10,
                  boxShadow: 'var(--shadow-sm)'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{
                      width: 36, height: 36, borderRadius: 10,
                      background: '#2563eb', color: '#fff',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
                    }}>
                      <TrendingUp size={18} />
                    </div>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#1e40af', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span>POS Orders Connected: {posSummary.orderCount} order{posSummary.orderCount > 1 ? 's' : ''}</span>
                        <span style={{ fontSize: 10, fontWeight: 700, background: '#2563eb', color: '#fff', padding: '1px 6px', borderRadius: 4 }}>
                          RM {posSummary.totalRevenue.toFixed(2)}
                        </span>
                      </div>
                      <div style={{ fontSize: 11, color: '#1e3a8a', marginTop: 2 }}>
                        {posSummary.soldBreakdown?.chicken_pcs || 0} chicken pcs sold · {posSummary.soldBreakdown?.carcass_pcs || 0} carcass · {posSummary.soldBreakdown?.butter_rice || 0} rice sets · Deducted from live inventory
                      </div>
                    </div>
                  </div>
                  {!isSubmitted && (
                    <button
                      type="button"
                      onClick={handleAutofillFromPos}
                      className="btn btn-sm"
                      style={{
                        background: '#2563eb', color: '#fff', border: 'none', fontWeight: 700,
                        fontSize: 11, padding: '6px 12px', borderRadius: 6, display: 'inline-flex', alignItems: 'center', gap: 6,
                        cursor: 'pointer'
                      }}
                      title="Sync closing remainder with POS sales"
                    >
                      <Sparkles size={13} /> Auto-fill Remainder from POS
                    </button>
                  )}
                </div>
              )}

              {CATEGORIES.map(cat => cat.key === 'brought_to_stall' ? (
                <StallOpeningSection key={cat.key} data={formData} previousDate={formData.opening_stock?.previousDate || prevTradingDate}
                  hasPreviousDay={!!prevDayData} inventoryWarnings={openingInventory.warnings} isSaturday={isSaturday}
                  isSubmitted={isSubmitted} isOpen={!!openCategories[cat.key]} onToggle={() => toggleCategory(cat.key)}
                  onReceivedChange={(key, value) => handleChange('stock_received', key, value)}
                  onRefresh={handleRecalculateBrought} onSend={handleSendStockToInventory}
                  busy={saving || stockSending || loading} stockReceivedSynced={stockReceivedSynced} />
              ) : (
                <CategorySection
                  key={cat.key}
                  category={cat}
                  products={CATEGORY_PRODUCTS[cat.key].filter(p => isAdminUser || !p.adminOnly)}
                  values={formData[cat.key] || {}}
                  onChange={(prodKey, val) => handleChange(cat.key, prodKey, val)}
                  isOpen={!!openCategories[cat.key]}
                  onToggle={() => toggleCategory(cat.key)}
                  isSubmitted={isSubmitted}
                  isAdmin={isAdminUser}
                  isSaturday={isSaturday}
                  isSunday={isSunday}
                  prevTradingDate={prevTradingDate}
                  prevDayData={prevDayData}
                  rawMaterials={formData.raw_materials}
                  onRecalculateBrought={handleRecalculateBrought}
                  onSendStockToInventory={handleSendStockToInventory}
                  stockReceivedSynced={stockReceivedSynced}
                  stockSending={stockSending}
                  friedPenalty={friedLeftoverPenalty}
                  chickenCutYield={chickenCutYield}
                  busy={saving || stockSending}
                  onCutYieldChange={handleCutYieldChange}
                />
              ))}

              {/* ──── Auto-filled POS Remainders & Carryover Section ──── */}
              <AutoRemaindersSection
                formData={formData}
                posSummary={posSummary}
                onAutofillFromPos={handleAutofillFromPos}
                isSubmitted={isSubmitted}
              />

              {/* ──── Live Sales & Fried Reconciliation (Excel ProductInventory) ──── */}
              <DailyReconciliationPanel
                formData={formData}
                isMobile={isMobile}
                posSummary={posSummary}
                onAutofillFromPos={handleAutofillFromPos}
                isSubmitted={isSubmitted}
              />

              {/* Notes */}
              <div style={{
                background: '#fff', borderRadius: 'var(--radius)',
                border: '1px solid var(--border)', padding: '16px 18px',
                boxShadow: 'var(--shadow-sm)', marginBottom: 16,
              }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)', marginBottom: 10 }}>
                  Daily Notes (Optional)
                </div>
                <textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  disabled={isSubmitted || saving || stockSending}
                  placeholder="Any special notes for today (e.g. weather impact, supplier issues, equipment problems…)"
                  rows={3}
                  className="inp"
                  style={{
                    resize: 'vertical', fontSize: 13, lineHeight: 1.5,
                    background: isSubmitted ? '#fafafa' : '#fff',
                  }}
                />
              </div>

              {/* Action buttons */}
              <div style={{
                display: 'flex', gap: 10,
                justifyContent: 'flex-end', flexWrap: 'wrap',
                position: 'sticky', bottom: 0,
                background: 'linear-gradient(to top, var(--main-bg) 60%, transparent)',
                padding: '16px 0 8px',
              }}>
                {/* Save message */}
                {saveMsg && (
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    fontSize: 12, fontWeight: 600, padding: '8px 14px',
                    borderRadius: 8,
                    background: saveMsg.type === 'success' ? 'var(--green-light)' : 'var(--red-soft)',
                    color: saveMsg.type === 'success' ? '#15803d' : '#dc2626',
                    animation: 'fadeIn 0.2s ease',
                  }}>
                    {saveMsg.type === 'success' ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
                    {saveMsg.text}
                  </div>
                )}

                {!isSubmitted ? (
                  <>
                    <button
                      type="button"
                      className="btn btn-outline"
                      onClick={() => handleSave(false)}
                      disabled={saving || stockSending}
                      style={{ gap: 6 }}
                    >
                      {saving ? <Loader size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Save size={14} />}
                      Save Draft
                    </button>
                    <button
                      type="button"
                      className="btn"
                      onClick={handleSendStockToInventory}
                      disabled={saving || stockSending}
                      style={{
                        gap: 6, fontWeight: 700,
                        background: stockReceivedSynced ? '#059669' : '#0284c7',
                        borderColor: stockReceivedSynced ? '#059669' : '#0284c7',
                        color: '#fff',
                      }}
                      title="Send today's received raw materials and brought stock to inventory for live POS deduction"
                    >
                      {stockSending ? (
                        <Loader size={14} style={{ animation: 'spin 1s linear infinite' }} />
                      ) : stockReceivedSynced ? (
                        <PackageCheck size={14} />
                      ) : (
                        <Truck size={14} />
                      )}
                      {stockReceivedSynced ? 'Update Sent Stock' : 'Send Stock to Inventory'}
                    </button>
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={() => {
                        if (window.confirm("Submit this day's inventory? Once submitted, this day cannot be edited or resubmitted.")) {
                          handleSave(true);
                        }
                      }}
                      disabled={saving || stockSending}
                      style={{ gap: 6, background: '#16a34a', borderColor: '#16a34a' }}
                    >
                      {saving ? <Loader size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Send size={14} />}
                      Submit
                    </button>
                  </>
                ) : (
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    fontSize: 13, fontWeight: 700, color: '#15803d',
                    padding: '8px 16px', borderRadius: 8,
                    background: '#dcfce7', border: '1px solid #86efac',
                  }}>
                    <Lock size={15} color="#16a34a" />
                    <span>Submitted & Locked · Cannot be resubmitted</span>
                  </div>
                )}

                {isSubmitted && isAdminUser && (
                  <>
                    <button
                      className="btn btn-primary"
                      onClick={handleSaveAdminKg}
                      disabled={saving}
                      style={{ gap: 6 }}
                      title="Save updated KG values for Chicken and Carcass"
                    >
                      {saving ? <Loader size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Save size={14} />}
                      Save KG Updates
                    </button>
                    <button
                      className="btn btn-outline"
                      onClick={handleReapplyInventory}
                      disabled={saving}
                      style={{ gap: 6 }}
                      title="Reverse what was previously applied for this date and apply it again"
                    >
                      {saving ? <Loader size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <RotateCcw size={14} />}
                      Re-apply to Inventory
                    </button>
                  </>
                )}
              </div>
            </>
          )}
        </div>

        {/* Right: Recent entries */}
        {!isMobile && (
          <div>
            <RecentEntries
              entries={recentEntries}
              currentDate={selectedDate}
              onSelect={date => { if (!saving && !stockSending) setSelectedDate(date); }}
              loading={recentLoading}
            />
          </div>
        )}
      </div>
    </div>
  );
}