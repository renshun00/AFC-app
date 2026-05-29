import React, { useState } from 'react';
import { Plus, Edit2, ChevronDown, ChevronUp, DollarSign, Users } from 'lucide-react';
import { staffList, TASK_RATES, calcWage } from '../data/placeholder';
import { Modal, FormRow } from '../components/Layout';

export default function StaffPayrollPage({ isMobile }) {
  const [staff, setStaff] = useState(staffList);
  const [expanded, setExpanded] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [showEdit, setShowEdit] = useState(null); // staff id
  const [newStaff, setNewStaff] = useState({ name:'', role:'Cashier', status:'active', tasks:[] });
  const [newTask, setNewTask] = useState({ task: Object.keys(TASK_RATES)[0], qty:1, bonus:0 });

  const totalWages = staff.reduce((s,m)=>s+calcWage(m).total,0);
  const totalBonus = staff.reduce((s,m)=>s+calcWage(m).bonus,0);

  const addTaskToNew = () => {
    setNewStaff(f=>({ ...f, tasks: [...f.tasks, { ...newTask, qty:Number(newTask.qty), bonus:Number(newTask.bonus) }] }));
    setNewTask({ task: Object.keys(TASK_RATES)[0], qty:1, bonus:0 });
  };

  const removeTaskFromNew = (idx) => {
    setNewStaff(f=>({ ...f, tasks: f.tasks.filter((_,i)=>i!==idx) }));
  };

  const saveNewStaff = () => {
    setStaff(prev=>[...prev,{id:Date.now(),...newStaff}]);
    setNewStaff({ name:'',role:'Cashier',status:'active',tasks:[] });
    setShowAdd(false);
  };

  // Edit existing staff tasks
  const [editData, setEditData] = useState(null);
  const openEditStaff = (s) => {
    setEditData({ ...s, tasks: s.tasks.map(t=>({...t})) });
    setShowEdit(s.id);
  };
  const saveEditStaff = () => {
    setStaff(prev=>prev.map(s=>s.id===editData.id ? editData : s));
    setShowEdit(null);
    setEditData(null);
  };

  return (
    <div>
      {/* Summary cards */}
      <div style={{ display:'grid',gridTemplateColumns:`repeat(${isMobile?2:4},1fr)`,gap:10,marginBottom:14 }}>
        {[
          { label:'Total Staff', value:staff.length, icon: Users },
          { label:'Total Wages Today', value:`RM${totalWages.toFixed(2)}`, highlight:true },
          { label:'Total Bonus', value:`RM${totalBonus.toFixed(2)}` },
          { label:'Avg. Wage/Staff', value:`RM${(totalWages/staff.length).toFixed(2)}` },
        ].map(s=>(
          <div key={s.label} className="card" style={{ padding:'14px 16px', background: s.highlight?'var(--green)':'var(--card)', border: s.highlight?'none':'1px solid var(--border)' }}>
            <div style={{ fontSize:11,fontWeight:600,color:s.highlight?'rgba(255,255,255,.65)':'var(--text-3)',textTransform:'uppercase',letterSpacing:'.05em',marginBottom:4 }}>{s.label}</div>
            <div style={{ fontSize:22,fontWeight:700,color:s.highlight?'#fff':'var(--text-1)' }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Wage formula info box */}
      <div style={{ background:'var(--indigo-light)',borderRadius:'var(--radius)',border:'1px solid #dde4ff',padding:'12px 16px',marginBottom:14,fontSize:13 }}>
        <strong>📐 Wage Formula:</strong> Each task has a fixed rate per unit (shift/hour/run/session) + individual bonus.
        <span style={{ color:'var(--text-2)' }}> Total = Σ(task_rate × qty) + bonus_amount</span>
      </div>

      {/* Toolbar */}
      <div style={{ display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12 }}>
        <div style={{ fontSize:14,fontWeight:600 }}>Staff Roster — {new Date().toLocaleDateString('en-MY',{dateStyle:'medium'})}</div>
        <button className="btn btn-primary btn-sm" onClick={()=>setShowAdd(true)}>
          <Plus size={13}/> Add New Staff
        </button>
      </div>

      {/* Staff cards */}
      <div style={{ display:'flex',flexDirection:'column',gap:10 }}>
        {staff.map(member=>{
          const wage = calcWage(member);
          const isExpanded = expanded === member.id;
          return (
            <div key={member.id} className="card" style={{ overflow:'hidden' }}>
              {/* Header row */}
              <div
                style={{ display:'flex',alignItems:'center',gap:14,padding:'14px 16px',cursor:'pointer' }}
                onClick={()=>setExpanded(isExpanded ? null : member.id)}
              >
                <div style={{ width:38,height:38,borderRadius:'50%',background:'var(--primary-light)',display:'flex',alignItems:'center',justifyContent:'center',fontWeight:700,fontSize:15,color:'var(--primary)',flexShrink:0 }}>
                  {member.name.split(' ').map(n=>n[0]).join('').slice(0,2)}
                </div>
                <div style={{ flex:1,minWidth:0 }}>
                  <div style={{ fontWeight:700,fontSize:14 }}>{member.name}</div>
                  <div style={{ fontSize:12,color:'var(--text-3)' }}>{member.role} · {member.tasks.length} task{member.tasks.length!==1?'s':''}</div>
                </div>
                <div style={{ textAlign:'right',flexShrink:0,marginRight:8 }}>
                  <div style={{ fontWeight:700,fontSize:15 }}>RM{wage.total.toFixed(2)}</div>
                  {wage.bonus > 0 && <div style={{ fontSize:11,color:'var(--green)',fontWeight:600 }}>+RM{wage.bonus.toFixed(2)} bonus</div>}
                </div>
                <button onClick={e=>{e.stopPropagation();openEditStaff(member);}} style={{ background:'none',border:'none',cursor:'pointer',color:'var(--text-3)',padding:4 }}>
                  <Edit2 size={14}/>
                </button>
                {isExpanded ? <ChevronUp size={16} style={{ color:'var(--text-3)',flexShrink:0 }}/> : <ChevronDown size={16} style={{ color:'var(--text-3)',flexShrink:0 }}/>}
              </div>

              {/* Expanded task breakdown */}
              {isExpanded && (
                <div style={{ borderTop:'1px solid var(--border)',background:'#fafafa',padding:'12px 16px' }}>
                  <table className="data-table" style={{ fontSize:12 }}>
                    <thead>
                      <tr>
                        <th>Task</th>
                        <th>Rate</th>
                        <th>Qty</th>
                        <th>Subtotal</th>
                        <th>Bonus</th>
                        <th>Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {member.tasks.map((t,i)=>{
                        const r = TASK_RATES[t.task];
                        const sub = r ? r.rate * t.qty : 0;
                        return (
                          <tr key={i}>
                            <td style={{ fontWeight:600 }}>{t.task}</td>
                            <td style={{ color:'var(--text-2)' }}>RM{r?.rate}/{r?.unit}</td>
                            <td>{t.qty}</td>
                            <td style={{ fontWeight:600 }}>RM{sub.toFixed(2)}</td>
                            <td style={{ color:'var(--green)',fontWeight:600 }}>{t.bonus > 0 ? `+RM${t.bonus.toFixed(2)}` : '—'}</td>
                            <td style={{ fontWeight:700 }}>RM{(sub+t.bonus).toFixed(2)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  <div style={{ display:'flex',justifyContent:'flex-end',gap:16,marginTop:8,paddingTop:8,borderTop:'1px solid var(--border)',fontSize:13 }}>
                    <span>Base: <strong>RM{wage.base.toFixed(2)}</strong></span>
                    <span>Bonus: <strong style={{ color:'var(--green)' }}>RM{wage.bonus.toFixed(2)}</strong></span>
                    <span style={{ fontWeight:700,color:'var(--primary)' }}>Total: RM{wage.total.toFixed(2)}</span>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Add Staff Modal */}
      {showAdd && (
        <Modal title="Add New Staff" onClose={()=>setShowAdd(false)} maxWidth={520}>
          <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:10 }}>
            <FormRow label="Full Name">
              <input className="inp" placeholder="e.g. Ali Hassan" value={newStaff.name} onChange={e=>setNewStaff(f=>({...f,name:e.target.value}))}/>
            </FormRow>
            <FormRow label="Role">
              <select className="inp" value={newStaff.role} onChange={e=>setNewStaff(f=>({...f,role:e.target.value}))}>
                {['Cashier','Kitchen','Supervisor','Driver','Cleaner'].map(r=><option key={r}>{r}</option>)}
              </select>
            </FormRow>
          </div>

          {/* Add tasks */}
          <div style={{ background:'#f9f9f9',borderRadius:'var(--radius-sm)',border:'1px solid var(--border)',padding:'12px',marginBottom:14 }}>
            <div style={{ fontWeight:600,fontSize:13,marginBottom:10 }}>Assign Tasks</div>
            <div style={{ display:'grid',gridTemplateColumns:'2fr 1fr 1fr auto',gap:8,alignItems:'end' }}>
              <div>
                <label style={{ fontSize:11,fontWeight:600,color:'var(--text-2)',display:'block',marginBottom:4 }}>Task</label>
                <select className="inp" value={newTask.task} onChange={e=>setNewTask(t=>({...t,task:e.target.value}))}>
                  {Object.keys(TASK_RATES).map(k=><option key={k}>{k}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize:11,fontWeight:600,color:'var(--text-2)',display:'block',marginBottom:4 }}>Qty</label>
                <input className="inp" type="number" min="1" value={newTask.qty} onChange={e=>setNewTask(t=>({...t,qty:e.target.value}))}/>
              </div>
              <div>
                <label style={{ fontSize:11,fontWeight:600,color:'var(--text-2)',display:'block',marginBottom:4 }}>Bonus (RM)</label>
                <input className="inp" type="number" min="0" value={newTask.bonus} onChange={e=>setNewTask(t=>({...t,bonus:e.target.value}))}/>
              </div>
              <button className="btn btn-primary btn-sm" onClick={addTaskToNew} style={{ marginBottom:0 }}>
                <Plus size={13}/>
              </button>
            </div>

            {newStaff.tasks.length > 0 && (
              <div style={{ marginTop:12 }}>
                {newStaff.tasks.map((t,i)=>{
                  const r = TASK_RATES[t.task];
                  return (
                    <div key={i} style={{ display:'flex',justifyContent:'space-between',alignItems:'center',padding:'6px 0',borderBottom:'1px solid var(--border-soft)',fontSize:12 }}>
                      <span style={{ fontWeight:600 }}>{t.task}</span>
                      <span style={{ color:'var(--text-2)' }}>{t.qty} × RM{r?.rate} + RM{t.bonus} bonus = <strong>RM{(r?.rate*t.qty+t.bonus).toFixed(2)}</strong></span>
                      <button onClick={()=>removeTaskFromNew(i)} style={{ background:'none',border:'none',cursor:'pointer',color:'#dc2626',padding:'0 4px' }}>✕</button>
                    </div>
                  );
                })}
                <div style={{ textAlign:'right',marginTop:8,fontWeight:700,fontSize:13 }}>
                  Total: RM{newStaff.tasks.reduce((s,t)=>s+(TASK_RATES[t.task]?.rate*t.qty||0)+t.bonus,0).toFixed(2)}
                </div>
              </div>
            )}
          </div>

          <div style={{ display:'flex',gap:8 }}>
            <button className="btn btn-outline" style={{ flex:1,justifyContent:'center' }} onClick={()=>setShowAdd(false)}>Cancel</button>
            <button className="btn btn-primary" style={{ flex:1,justifyContent:'center' }} onClick={saveNewStaff}>
              <DollarSign size={14}/> Add Staff Member
            </button>
          </div>
        </Modal>
      )}

      {/* Edit Staff Modal */}
      {showEdit && editData && (
        <Modal title={`Edit Tasks — ${editData.name}`} onClose={()=>{ setShowEdit(null); setEditData(null); }} maxWidth={520}>
          <div style={{ marginBottom:14 }}>
            {editData.tasks.map((t,i)=>{
              const r = TASK_RATES[t.task];
              return (
                <div key={i} style={{ display:'grid',gridTemplateColumns:'2fr 1fr 1fr auto',gap:8,marginBottom:8,alignItems:'center' }}>
                  <select className="inp" value={t.task} onChange={e=>setEditData(d=>({ ...d, tasks:d.tasks.map((tt,ii)=>ii===i?{...tt,task:e.target.value}:tt) }))}>
                    {Object.keys(TASK_RATES).map(k=><option key={k}>{k}</option>)}
                  </select>
                  <input className="inp" type="number" min="1" value={t.qty} onChange={e=>setEditData(d=>({ ...d, tasks:d.tasks.map((tt,ii)=>ii===i?{...tt,qty:Number(e.target.value)}:tt) }))}/>
                  <input className="inp" type="number" min="0" value={t.bonus} placeholder="Bonus" onChange={e=>setEditData(d=>({ ...d, tasks:d.tasks.map((tt,ii)=>ii===i?{...tt,bonus:Number(e.target.value)}:tt) }))}/>
                  <button onClick={()=>setEditData(d=>({ ...d, tasks:d.tasks.filter((_,ii)=>ii!==i) }))} style={{ background:'var(--red-soft)',border:'none',borderRadius:6,padding:'8px',cursor:'pointer',color:'#dc2626' }}>✕</button>
                </div>
              );
            })}
            <button className="btn btn-outline btn-sm" style={{ marginTop:4 }} onClick={()=>setEditData(d=>({ ...d, tasks:[...d.tasks,{ task:Object.keys(TASK_RATES)[0],qty:1,bonus:0 }] }))}>
              <Plus size={12}/> Add Task
            </button>
          </div>
          <div style={{ display:'flex',gap:8 }}>
            <button className="btn btn-outline" style={{ flex:1,justifyContent:'center' }} onClick={()=>{ setShowEdit(null); setEditData(null); }}>Cancel</button>
            <button className="btn btn-primary" style={{ flex:1,justifyContent:'center' }} onClick={saveEditStaff}>Save Changes</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
