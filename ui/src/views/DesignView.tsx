import { useState } from "react";
import { Checkbox, Field, Radio, Select, TextArea, TextInput } from "../forms";

// A reference page for the form controls, at /design. Nothing links to it.
export function DesignView() {
  const [name, setName] = useState("order");
  const [region, setRegion] = useState("payment");
  const [mode, setMode] = useState("live");
  const [edges, setEdges] = useState(true);
  return (
    <div className="design-view">
      <h1>Form controls</h1>
      <div className="design-grid">
        <section>
          <h2>Text input</h2>
          <Field label="Machine" hint="The name shown in the tab bar.">
            <TextInput value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Filter">
            <TextInput placeholder="Filter with a regex" />
          </Field>
          <Field label="Output" error="Not valid JSON: unexpected end of input.">
            <TextInput code invalid defaultValue='{"ok": tru' />
          </Field>
          <Field label="Snapshot directory">
            <TextInput disabled defaultValue="/snapshots" />
          </Field>
        </section>
        <section>
          <h2>Text area</h2>
          <Field label="Mock context" hint="JSON merged into the context before guards run.">
            <TextArea code rows={5} defaultValue={'{\n  "score": 65,\n  "status": "approved"\n}'} />
          </Field>
        </section>
        <section>
          <h2>Select</h2>
          <Field label="Region">
            <Select value={region} onChange={(e) => setRegion(e.target.value)}>
              <option value="fulfillment">fulfillment</option>
              <option value="payment">payment</option>
              <option value="support">support</option>
            </Select>
          </Field>
          <Field label="Layout">
            <Select disabled defaultValue="elk">
              <option value="elk">layered</option>
            </Select>
          </Field>
        </section>
        <section>
          <h2>Checkbox</h2>
          <div className="choice-group">
            <Checkbox label="Draw global events as edges" checked={edges} onChange={(e) => setEdges(e.target.checked)} />
            <Checkbox label="Follow the active state" defaultChecked />
            <Checkbox label="Watch the snapshot directory" disabled />
          </div>
        </section>
        <section>
          <h2>Radio</h2>
          <div className="choice-group">
            {[
              ["live", "Live simulator"],
              ["virtual", "Virtual simulator"],
              ["static", "Static chart"],
            ].map(([value, label]) => (
              <Radio key={value} name="mode" label={label} checked={mode === value} onChange={() => setMode(value)} />
            ))}
            <Radio name="mode" label="Remote proxy" disabled />
          </div>
        </section>
        <section>
          <h2>Buttons</h2>
          <div className="design-row">
            <button className="btn primary">Resolve</button>
            <button className="btn">Reset</button>
            <button className="btn danger">Reject</button>
            <button className="btn" disabled>
              Undo
            </button>
          </div>
          <div className="design-row">
            <button className="btn small primary">Fire</button>
            <button className="btn small">Reset</button>
            <button className="btn small danger">Reject</button>
          </div>
        </section>
      </div>
    </div>
  );
}
