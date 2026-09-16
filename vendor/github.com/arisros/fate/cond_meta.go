package fate

import "encoding/json"

// CondMeta annotates a TransitionConfig.Guard with informational metadata about
// the context fields the guard checks. The studio renders it as a live "Gate"
// panel showing whether each condition passes against the current actor context.
//
// CondMeta does NOT affect whether a transition fires — Guard/Cond remain the
// sole runtime predicates. It is purely for human inspection and tooling.
type CondMeta struct {
	Fields []CondField     `json:"fields,omitempty"`
	Sample json.RawMessage `json:"sample,omitempty"` // example Ctx JSON that passes the guard
}

// CondField describes one predicate that a Guard checks on the actor context.
type CondField struct {
	// Path is a JSONPath-style selector for a field in the Ctx struct.
	// Only simple dot-paths are supported: "$.score" or "$.customer.name".
	Path string `json:"path"`

	// Op is the comparison operator:
	// "eq"|"neq"|"gt"|"gte"|"lt"|"lte"|"in"|"truthy"|"falsy"
	Op string `json:"op"`

	// Value is the expected value for comparison operators (nil for truthy/falsy).
	Value any `json:"value,omitempty"`

	// Label overrides the display text in the studio. Defaults to "path op value".
	Label string `json:"label,omitempty"`
}

// GatesBuilder is the fluent builder returned by Gates(). Call Sample() or
// Build() to obtain the final *CondMeta.
type GatesBuilder struct {
	fields []CondField
}

// Gates starts building a CondMeta from one or more CondField entries.
//
//	TransitionConfig{
//	    Guard:    myGuard,
//	    CondMeta: fate.Gates(
//	        fate.Field("$.score").Gt(60),
//	        fate.Field("$.status").Eq("approved"),
//	    ).Sample(`{"score": 65, "status": "approved"}`),
//	}
func Gates(fields ...CondField) *GatesBuilder {
	return &GatesBuilder{fields: fields}
}

// Sample attaches a raw-JSON sample context and returns the built *CondMeta.
// The rawJSON argument must be a valid JSON object literal; it is stored verbatim.
func (b *GatesBuilder) Sample(rawJSON string) *CondMeta {
	return &CondMeta{Fields: b.fields, Sample: json.RawMessage(rawJSON)}
}

// Build returns a *CondMeta with no sample attached.
func (b *GatesBuilder) Build() *CondMeta {
	return &CondMeta{Fields: b.fields}
}

// CondFieldBuilder is the fluent builder returned by Field().
type CondFieldBuilder struct {
	path  string
	label string
}

// Field starts building a CondField for the given JSONPath selector.
// Only simple dot-paths are supported in v1: "$.score", "$.customer.name".
func Field(path string) *CondFieldBuilder {
	return &CondFieldBuilder{path: path}
}

// WithLabel attaches a human-readable display label to the field.
func (f *CondFieldBuilder) WithLabel(label string) *CondFieldBuilder {
	f.label = label
	return f
}

// Eq asserts ctx[path] == value.
func (f *CondFieldBuilder) Eq(value any) CondField {
	return CondField{Path: f.path, Op: "eq", Value: value, Label: f.label}
}

// Neq asserts ctx[path] != value.
func (f *CondFieldBuilder) Neq(value any) CondField {
	return CondField{Path: f.path, Op: "neq", Value: value, Label: f.label}
}

// Gt asserts ctx[path] > value (numeric comparison).
func (f *CondFieldBuilder) Gt(value any) CondField {
	return CondField{Path: f.path, Op: "gt", Value: value, Label: f.label}
}

// Gte asserts ctx[path] >= value (numeric comparison).
func (f *CondFieldBuilder) Gte(value any) CondField {
	return CondField{Path: f.path, Op: "gte", Value: value, Label: f.label}
}

// Lt asserts ctx[path] < value (numeric comparison).
func (f *CondFieldBuilder) Lt(value any) CondField {
	return CondField{Path: f.path, Op: "lt", Value: value, Label: f.label}
}

// Lte asserts ctx[path] <= value (numeric comparison).
func (f *CondFieldBuilder) Lte(value any) CondField {
	return CondField{Path: f.path, Op: "lte", Value: value, Label: f.label}
}

// In asserts ctx[path] is one of the given values.
func (f *CondFieldBuilder) In(values ...any) CondField {
	return CondField{Path: f.path, Op: "in", Value: values, Label: f.label}
}

// Truthy asserts ctx[path] is truthy (non-zero, non-empty, non-false).
func (f *CondFieldBuilder) Truthy() CondField {
	return CondField{Path: f.path, Op: "truthy", Label: f.label}
}

// Falsy asserts ctx[path] is falsy (zero, empty, false, or nil).
func (f *CondFieldBuilder) Falsy() CondField {
	return CondField{Path: f.path, Op: "falsy", Label: f.label}
}
