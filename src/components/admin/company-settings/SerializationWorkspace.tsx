import { useState } from 'react';
import { Calendar, Check, ChevronRight, Hash, Info, RotateCcw, Save, Users } from 'lucide-react';
import type { SequenceSetting } from '../../../services/companySettingsService';
import { Button } from '../../ui/button';
import { Input, Select } from '../../ui/input';
import { MessageStrip } from '../../shared/MessageStrip';
import { TableSkeleton } from '../../shared/Skeleton';
import { SettingsField } from './SettingsField';
import { SEQUENCE_TYPES, resetFrequencyLabel, resolveSequenceTokens, sequenceChanges, sequenceErrors, sequencePreview } from './serializationModel';

export function SerializationWorkspace({ sequences, edits, loading, saving, error, canManage, assigning, onChange, onSave, onDiscard, onAssignSuppliers, onRetry }: {
  sequences: SequenceSetting[]; edits: Record<string, Partial<SequenceSetting>>; loading: boolean; saving: string | null; error: string | null;
  canManage: boolean; assigning: boolean; onChange: (entity: string, field: keyof SequenceSetting, value: string | number) => void;
  onSave: (entity: string) => void; onDiscard: (entity: string) => void; onAssignSuppliers: () => void; onRetry: () => void;
}) {
  const [selected, setSelected] = useState('SUPPLIER_CODE');
  const meta = SEQUENCE_TYPES.find(type => type.key === selected)!;
  const saved = sequences.find(row => row.entityType === selected);
  const edit = edits[selected] || {};
  const dirty = sequenceChanges(saved, edit);
  const errors = sequenceErrors(edit);
  const yearly = ['YEARLY', 'FISCAL_YEAR', 'CUSTOM_PERIOD'].includes(edit.resetFrequency || '');
  const disabled = !canManage || Boolean(saving) || !saved || assigning;
  const year = new Date().getFullYear();
  return <section className="settings-serialization cs-tab-panel" aria-labelledby="serialization-title">
    <header className="settings-section-intro"><h2 id="serialization-title"><Hash size={19}/>Document Serialization</h2><p>Configure auto-generated number formats for Supplier Codes, Purchase Orders, RFQs, Invoices, Contracts, and Payment Vouchers. Changes apply to newly created records; existing records are not affected.</p></header>
    {error && <MessageStrip type="error">{error} {!sequences.length && <Button variant="outline" size="sm" onClick={onRetry}>Retry</Button>}</MessageStrip>}
    {loading && !sequences.length ? <TableSkeleton rows={6}/> : <>
      <div className="settings-sequence-overview" role="group" aria-label="Document number formats">
        {SEQUENCE_TYPES.map(type => { const draft = edits[type.key]; const row = sequences.find(item => item.entityType === type.key); return <button type="button" key={type.key} aria-pressed={selected===type.key} onClick={()=>setSelected(type.key)} className="settings-sequence-choice">
          <span className="settings-sequence-choice__title"><Hash size={15}/>{type.label}<ChevronRight size={14}/></span>
          <code>{row && draft ? sequencePreview(draft) : 'Not loaded'}</code>
          <span>{draft && row ? `${resetFrequencyLabel(draft.resetFrequency || 'NEVER')} · ${Number.isSafeInteger(draft.nextNumber) && Number(draft.nextNumber) > 0 ? `Next ${draft.nextNumber}` : 'Counter required'}` : 'Configuration unavailable'}{row && draft && sequenceChanges(row,draft) && <strong> · Unsaved</strong>}</span>
        </button>; })}
      </div>
      {saved ? <section className="settings-sequence-editor" aria-label={`${meta.label} format settings`}>
        <header><div><h3>{meta.label}</h3><p>{meta.description}</p><span className="settings-key">{meta.key}</span></div><div className="settings-sequence-preview" aria-live="polite"><span>Live preview</span><code>{sequencePreview(edit)}</code></div></header>
        <fieldset disabled={disabled} className="settings-sequence-fields">
          <SettingsField><label>Prefix</label><Input value={edit.prefix ?? ''} placeholder="e.g. PO-{YYYY}-" onChange={event=>onChange(selected,'prefix',event.target.value)}/></SettingsField>
          <SettingsField><label>Suffix <span className="settings-muted">(optional)</span></label><Input value={edit.suffix ?? ''} placeholder="e.g. {YYYY}" onChange={event=>onChange(selected,'suffix',event.target.value)}/><span className="settings-hint">A hyphen is added before the suffix.</span></SettingsField>
          <div className="settings-sequence-tokens"><span>Add to prefix</span>{['{YYYY}','{YY}','{MM}','{DD}'].map(token=><Button key={token} type="button" variant="outline" size="sm" title={`Insert ${token} into prefix`} onClick={()=>onChange(selected,'prefix',`${edit.prefix || ''}${token}`)}><code>{token}</code><span>{resolveSequenceTokens(token)}</span></Button>)}</div>
          <SettingsField><label>Digit Padding</label><Select value={edit.paddingLength ?? 4} onChange={event=>onChange(selected,'paddingLength',Number(event.target.value))}>{![3,4,5,6].includes(Number(edit.paddingLength)) && <option value={edit.paddingLength}>{edit.paddingLength} digits (current)</option>}{[3,4,5,6].map(value=><option value={value} key={value}>{value} digits ({'1'.padStart(value,'0')})</option>)}</Select></SettingsField>
          <SettingsField><label>Next Counter Number</label><Input type="number" min={1} step={1} value={Number.isNaN(edit.nextNumber) ? '' : edit.nextNumber ?? ''} onChange={event=>onChange(selected,'nextNumber',event.target.value===''?NaN:Number(event.target.value))}/><span className="settings-hint">The next record will use this number.</span></SettingsField>
          <SettingsField><label>Reset Frequency</label><Select value={edit.resetFrequency ?? 'NEVER'} onChange={event=>onChange(selected,'resetFrequency',event.target.value)}><option value="NEVER">Never Reset</option><option value="MONTHLY">Reset Monthly</option><option value="YEARLY">Reset Yearly / Financial Year</option>{!['NEVER','MONTHLY','YEARLY'].includes(edit.resetFrequency || '') && <option value={edit.resetFrequency}>{resetFrequencyLabel(edit.resetFrequency || '')} (current)</option>}</Select></SettingsField>
          {yearly && <section className="settings-sequence-period" aria-label="Financial year and sequence dates"><h4><Calendar size={16}/>Financial Year &amp; Sequence Dates</h4><p>Choose a regional financial year or set custom opening and closing dates.</p><div className="settings-year-presets">{[
            {label:'Apr 01 – Mar 31',start:`${year}-04-01`,end:`${year+1}-03-31`,region:'India, UK, South Africa, Japan'},
            {label:'Jan 01 – Dec 31',start:`${year}-01-01`,end:`${year}-12-31`,region:'Calendar Year / Global Standard'},
            {label:'Oct 01 – Sep 30',start:`${year}-10-01`,end:`${year+1}-09-30`,region:'US Federal & Institutional FY'},
            {label:'Jul 01 – Jun 30',start:`${year}-07-01`,end:`${year+1}-06-30`,region:'Australia, Kenya, Egypt, NZ'},
          ].map(period=><button key={period.start} type="button" aria-pressed={edit.periodStartDate===period.start && edit.periodEndDate===period.end} onClick={()=>{onChange(selected,'periodStartDate',period.start);onChange(selected,'periodEndDate',period.end);}}><span>{period.label}</span><small>{period.region}</small><small>{period.start} → {period.end}</small></button>)}</div><div className="settings-two-fields"><SettingsField><label>Sequence Open Date (Start)</label><Input type="date" value={edit.periodStartDate || ''} onChange={event=>onChange(selected,'periodStartDate',event.target.value)}/></SettingsField><SettingsField><label>Sequence Close Date (End)</label><Input type="date" value={edit.periodEndDate || ''} onChange={event=>onChange(selected,'periodEndDate',event.target.value)}/></SettingsField></div><p>Active sequence period: <strong>{edit.periodStartDate || 'Not set'}</strong> to <strong>{edit.periodEndDate || 'Not set'}</strong>. The counter resets to <strong>#0001</strong> when the period closes.</p></section>}
        </fieldset>
        {errors.length>0 && <div className="settings-sequence-errors" role="alert">{errors.map(message=><p key={message}>{message}</p>)}</div>}
        <footer><span className="settings-save-state">{dirty ? 'Unsaved changes' : <><Check size={15}/>Saved configuration</>}</span><Button type="button" variant="outline" disabled={disabled || !dirty} onClick={()=>onDiscard(selected)}><RotateCcw size={15}/>Discard Changes</Button><Button type="button" disabled={disabled || !dirty || errors.length>0} onClick={()=>onSave(selected)} loading={saving===selected}><Save size={15}/>Save {meta.label}</Button></footer>
        {selected==='SUPPLIER_CODE' && <div className="settings-supplier-action"><div><h4>Existing suppliers</h4><p>Assign sequential codes to existing vendors that do not have one. New vendors continue from the next counter.</p></div><Button type="button" variant="outline" disabled={disabled || dirty} loading={assigning} onClick={onAssignSuppliers}><Users size={16}/>Assign Existing Vendors</Button>{dirty && <p>Save or discard format changes before assigning existing vendors.</p>}</div>}
      </section> : <div className="cs-empty">The selected configuration could not be loaded.<Button variant="outline" onClick={onRetry}>Reload formats</Button></div>}
      <p className="settings-info"><Info size={16}/>Changing the next counter does not affect existing records. Yearly and monthly resets apply at the start of the next period.</p>
    </>}
  </section>;
}
