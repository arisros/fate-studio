package fate

import (
	"encoding/json"
	"reflect"
)

// UIStateOf wraps a typed UIState function and auto-generates a JSON Schema
// for the return type U via reflection. It returns:
//   - fn:     func(*Ctx) any  — compatible with StateNodeConfig.UIState
//   - schema: json.RawMessage — a JSON Schema object describing the shape of U
//
// The schema is computed once at call time; it adds zero cost to snapshot
// computation. Pass both return values into StateNodeConfig:
//
//	fn, schema := fate.UIStateOf(func(ctx *MyCtx) ReviewUI {
//	    return ReviewUI{Score: ctx.Score, Status: ctx.Status}
//	})
//	StateNodeConfig{
//	    UIState:       fn,
//	    UIStateSchema: schema,
//	}
func UIStateOf[Ctx any, U any](fn func(*Ctx) U) (func(*Ctx) any, json.RawMessage) {
	wrapped := func(ctx *Ctx) any { return fn(ctx) }
	schemaObj := jsonSchemaFor(reflect.TypeOf((*U)(nil)).Elem())
	raw, _ := json.Marshal(schemaObj)
	return wrapped, raw
}

// jsonSchemaFor generates a minimal JSON Schema (draft-07 compatible subset)
// for the given reflect.Type. Uses stdlib reflect only — no external deps.
//
// Supported mappings:
//   - bool                     → {"type":"boolean"}
//   - int / uint / float family → {"type":"number"}
//   - string                   → {"type":"string"}
//   - struct                   → {"type":"object","properties":{...}} using json tags
//   - slice / array            → {"type":"array","items":{...}}
//   - pointer                  → unwrapped and re-evaluated
//   - all others               → {"type":"object"}
func jsonSchemaFor(t reflect.Type) map[string]any {
	// Unwrap pointer indirection.
	for t.Kind() == reflect.Pointer {
		t = t.Elem()
	}
	switch t.Kind() {
	case reflect.Bool:
		return map[string]any{"type": "boolean"}
	case reflect.Int, reflect.Int8, reflect.Int16, reflect.Int32, reflect.Int64,
		reflect.Uint, reflect.Uint8, reflect.Uint16, reflect.Uint32, reflect.Uint64,
		reflect.Float32, reflect.Float64:
		return map[string]any{"type": "number"}
	case reflect.String:
		return map[string]any{"type": "string"}
	case reflect.Slice, reflect.Array:
		return map[string]any{
			"type":  "array",
			"items": jsonSchemaFor(t.Elem()),
		}
	case reflect.Struct:
		properties := map[string]any{}
		required := []string{}
		for i := 0; i < t.NumField(); i++ {
			field := t.Field(i)
			if !field.IsExported() {
				continue
			}
			name := jsonFieldName(field)
			if name == "-" {
				continue
			}
			properties[name] = jsonSchemaFor(field.Type)
			// Only mark required when the field has no omitempty tag.
			if !hasOmitempty(field) {
				required = append(required, name)
			}
		}
		schema := map[string]any{
			"type":       "object",
			"properties": properties,
		}
		if len(required) > 0 {
			schema["required"] = required
		}
		return schema
	default:
		return map[string]any{"type": "object"}
	}
}

// jsonFieldName returns the JSON key for a struct field.
// Uses the first segment of the json struct tag when present; otherwise the field name.
func jsonFieldName(f reflect.StructField) string {
	tag := f.Tag.Get("json")
	if tag == "" {
		return f.Name
	}
	for i := 0; i < len(tag); i++ {
		if tag[i] == ',' {
			return tag[:i]
		}
	}
	return tag
}

// hasOmitempty reports whether the json tag includes "omitempty".
func hasOmitempty(f reflect.StructField) bool {
	tag := f.Tag.Get("json")
	for i := 0; i < len(tag); i++ {
		if tag[i] == ',' {
			rest := tag[i+1:]
			// simple scan for "omitempty" token
			for len(rest) > 0 {
				var tok string
				j := 0
				for j < len(rest) && rest[j] != ',' {
					j++
				}
				tok = rest[:j]
				if tok == "omitempty" {
					return true
				}
				if j >= len(rest) {
					break
				}
				rest = rest[j+1:]
			}
		}
	}
	return false
}
