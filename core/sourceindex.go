package core

import (
	"go/ast"
	"go/parser"
	"go/token"
	"os"
	"path"
	"path/filepath"
	"sort"
	"strconv"
	"strings"

	"github.com/arisros/fate/describe"
)

// sourceIndex finds the states and transitions of one machine in the Go
// package that defines it. A machine is a struct literal, so a state is a
// string key somewhere in that literal and a transition is its event name
// inside the state's value. The search reads the source the way a person
// would, by name and nesting, and prefers no answer over a doubtful one.
type sourceIndex struct {
	pkg    string // import path, for portable file names
	dir    string
	uses   []nameUse
	states map[string]*nameUse
	desc   describe.MachineDescriptor
}

// nameUse is one place a state or event name is written: a string literal or
// a string constant, and the map entry it keys when it is a key.
type nameUse struct {
	name     string
	file     string
	line     int
	pos, end token.Pos // the keyed entry, or the literal itself
	key      bool
	// ref marks a name written as a Target, Initial or Default: it points at a
	// state and so is never where that state is defined.
	ref bool
}

func indexSource(machine *describe.SourceLocation, desc describe.MachineDescriptor) *sourceIndex {
	idx := &sourceIndex{states: map[string]*nameUse{}, desc: desc}
	if machine == nil || !filepath.IsAbs(machine.Path) || !fileExists(machine.Path) {
		return idx
	}
	idx.pkg = path.Dir(machine.File)
	idx.dir = filepath.Dir(machine.Path)

	fset := token.NewFileSet()
	files := map[string]*ast.File{}
	entries, err := os.ReadDir(idx.dir)
	if err != nil {
		return idx
	}
	for _, e := range entries {
		name := e.Name()
		if e.IsDir() || !strings.HasSuffix(name, ".go") {
			continue
		}
		// A test file is skipped unless the machine itself lives in one.
		if strings.HasSuffix(name, "_test.go") && name != filepath.Base(machine.Path) {
			continue
		}
		f, err := parser.ParseFile(fset, filepath.Join(idx.dir, name), nil, parser.SkipObjectResolution)
		if err != nil {
			continue
		}
		files[name] = f
	}

	consts := stringConsts(files)
	for name, f := range files {
		idx.collect(fset, name, f, consts)
	}
	sort.Slice(idx.uses, func(i, j int) bool { return idx.uses[i].pos < idx.uses[j].pos })

	scopePos, scopeEnd := enclosingDecl(fset, files[filepath.Base(machine.Path)], machine.Line)
	idx.locateStates("", desc.States, scopePos, scopeEnd)
	return idx
}

// stringConsts maps package-level string constants to their values, so a state
// keyed by a constant is found like one keyed by a literal.
func stringConsts(files map[string]*ast.File) map[string]string {
	out := map[string]string{}
	for _, f := range files {
		for _, d := range f.Decls {
			gd, ok := d.(*ast.GenDecl)
			if !ok || gd.Tok != token.CONST {
				continue
			}
			for _, spec := range gd.Specs {
				vs := spec.(*ast.ValueSpec)
				for i, n := range vs.Names {
					if i >= len(vs.Values) {
						continue
					}
					if v, ok := stringValue(vs.Values[i], nil); ok {
						out[n.Name] = v
					}
				}
			}
		}
	}
	return out
}

func stringValue(e ast.Expr, consts map[string]string) (string, bool) {
	switch v := e.(type) {
	case *ast.BasicLit:
		if v.Kind == token.STRING {
			s, err := strconv.Unquote(v.Value)
			return s, err == nil
		}
	case *ast.Ident:
		s, ok := consts[v.Name]
		return s, ok
	case *ast.CallExpr:
		// A typed constant conversion such as State("idle").
		if len(v.Args) == 1 {
			return stringValue(v.Args[0], consts)
		}
	}
	return "", false
}

func (idx *sourceIndex) collect(fset *token.FileSet, file string, f *ast.File, consts map[string]string) {
	keys := map[ast.Expr]*ast.KeyValueExpr{}
	refs := map[ast.Expr]bool{}
	ast.Inspect(f, func(n ast.Node) bool {
		switch v := n.(type) {
		case *ast.GenDecl:
			// A constant's own declaration is not a use of it.
			return v.Tok != token.CONST
		case *ast.KeyValueExpr:
			keys[v.Key] = v
			if field, ok := v.Key.(*ast.Ident); ok {
				switch field.Name {
				case "Target", "Initial", "Default":
					refs[v.Value] = true
				}
			}
		case *ast.BasicLit, *ast.Ident:
			e := n.(ast.Expr)
			name, ok := stringValue(e, consts)
			if !ok {
				return true
			}
			u := nameUse{name: name, file: file, line: fset.Position(e.Pos()).Line, pos: e.Pos(), end: e.End(), ref: refs[e]}
			if kv, isKey := keys[e]; isKey {
				u.key, u.end = true, kv.End()
			}
			idx.uses = append(idx.uses, u)
		}
		return true
	})
}

// enclosingDecl returns the top-level declaration that holds line.
func enclosingDecl(fset *token.FileSet, f *ast.File, line int) (token.Pos, token.Pos) {
	if f == nil {
		return token.NoPos, token.NoPos
	}
	for _, d := range f.Decls {
		if fset.Position(d.Pos()).Line <= line && line <= fset.Position(d.End()).Line {
			return d.Pos(), d.End()
		}
	}
	return token.NoPos, token.NoPos
}

// locateStates finds each state as a key inside its parent's entry. A state
// built by a helper has no key there, so it falls back to a key that is unique
// in the package, and then to where the parent's entry names the state.
func (idx *sourceIndex) locateStates(prefix string, states map[string]describe.StateNodeDescriptor, pos, end token.Pos) {
	for name, st := range states {
		statePath := name
		if prefix != "" {
			statePath = prefix + "." + name
		}
		var found, named *nameUse
		var everywhere []*nameUse
		for i := range idx.uses {
			u := &idx.uses[i]
			if u.name != name || u.ref {
				continue
			}
			inside := pos != token.NoPos && u.pos >= pos && u.end <= end
			if !u.key {
				if named == nil && inside && prefix != "" {
					named = u
				}
				continue
			}
			everywhere = append(everywhere, u)
			if found == nil && inside {
				found = u
			}
		}
		if found == nil && len(everywhere) == 1 {
			found = everywhere[0]
		}
		if found == nil {
			found = named
		}
		if found == nil {
			continue
		}
		idx.states[statePath] = found
		if found.key {
			idx.locateStates(statePath, st.States, found.pos, found.end)
		}
	}
}

func (idx *sourceIndex) location(u *nameUse) *describe.SourceLocation {
	return &describe.SourceLocation{File: idx.pkg + "/" + u.file, Line: u.line, Path: filepath.Join(idx.dir, u.file)}
}

func (idx *sourceIndex) state(statePath string) *describe.SourceLocation {
	if u := idx.states[statePath]; u != nil {
		return idx.location(u)
	}
	return nil
}

// transition finds the i-th transition of event on a state: the event's name
// written inside the state's entry, outside any child state. When the name
// appears once per transition, each transition gets its own; otherwise they
// share the first.
func (idx *sourceIndex) transition(statePath, event string, i int) *describe.SourceLocation {
	st := idx.states[statePath]
	if st == nil {
		return nil
	}
	var children []*nameUse
	for p, u := range idx.states {
		if strings.HasPrefix(p, statePath+".") {
			children = append(children, u)
		}
	}
	var hits []*nameUse
	for j := range idx.uses {
		u := &idx.uses[j]
		if u.name != event || u.pos <= st.pos || u.pos >= st.end {
			continue
		}
		inChild := false
		for _, c := range children {
			inChild = inChild || (u.pos >= c.pos && u.pos < c.end)
		}
		if !inChild {
			hits = append(hits, u)
		}
	}
	if len(hits) == 0 {
		return nil
	}
	if i < len(hits) && len(hits) == idx.transitionCount(statePath, event) {
		return idx.location(hits[i])
	}
	return idx.location(hits[0])
}

func (idx *sourceIndex) transitionCount(statePath, event string) int {
	states := idx.desc.States
	var node describe.StateNodeDescriptor
	for _, seg := range strings.Split(statePath, ".") {
		n, ok := states[seg]
		if !ok {
			return 0
		}
		node, states = n, n.States
	}
	return len(node.On[event])
}
