package demos

import (
	"fmt"

	"github.com/arisros/fate"

	studio "github.com/arisros/fate-studio"
)

// Event is a plain named event, for demos whose events carry no payload.
type Event string

// EventName implements the engine's event naming.
func (e Event) EventName() string { return string(e) }

// namedDispatch accepts exactly the event names the machine declares.
func namedDispatch[C any](build func() *fate.Machine[C, Event]) func(string) (Event, error) {
	known := declaredEvents(build().Describe().States)
	return func(name string) (Event, error) {
		if !known[name] {
			return "", studio.ErrUnknownEvent{Name: name}
		}
		return Event(name), nil
	}
}

func on[C any](pairs ...any) map[string][]fate.TransitionConfig[C, Event] {
	out := map[string][]fate.TransitionConfig[C, Event]{}
	for i := 0; i < len(pairs); i += 2 {
		ev := pairs[i].(string)
		switch t := pairs[i+1].(type) {
		case string:
			out[ev] = append(out[ev], fate.TransitionConfig[C, Event]{Target: t})
		case fate.TransitionConfig[C, Event]:
			out[ev] = append(out[ev], t)
		default:
			panic(fmt.Sprintf("demos: event %s has target of type %T", ev, t))
		}
	}
	return out
}

// ----- order: parallel regions with a self-loop and several final states -----

// OrderCtx counts status updates received while an order is in flight.
type OrderCtx struct {
	Updates int `json:"updates"`
}

func statusUpdate() fate.TransitionConfig[OrderCtx, Event] {
	return fate.TransitionConfig[OrderCtx, Event]{
		Internal: true,
		Actions: []fate.Action[OrderCtx, Event]{
			fate.Assign(func(c OrderCtx, _ Event) OrderCtx { c.Updates++; return c }),
		},
	}
}

// Order runs payment, fulfillment, and support as parallel regions.
func Order() *fate.Machine[OrderCtx, Event] {
	type S = fate.StateNodeConfig[OrderCtx, Event]
	return must(fate.CreateMachine(fate.MachineConfig[OrderCtx, Event]{
		ID:      "order",
		Initial: "order",
		States: map[string]S{
			"order": {
				Type: fate.NodeParallel,
				States: map[string]S{
					"payment": {
						Initial: "pending",
						States: map[string]S{
							"pending":    {On: on[OrderCtx]("AUTHORIZE", "authorized", "DECLINE", "declined", "CANCEL", "voided")},
							"authorized": {On: on[OrderCtx]("CAPTURE", "captured", "STATUS_UPDATE", statusUpdate())},
							"declined":   {On: on[OrderCtx]("RETRY", "pending")},
							"captured":   {Type: fate.NodeFinal},
							"voided":     {Type: fate.NodeFinal},
						},
					},
					"fulfillment": {
						Initial: "picking",
						States: map[string]S{
							"picking":   {On: on[OrderCtx]("PICKED", "packing")},
							"packing":   {On: on[OrderCtx]("PACKED", "shipped", "STATUS_UPDATE", statusUpdate())},
							"shipped":   {On: on[OrderCtx]("DELIVERED", "delivered")},
							"delivered": {Type: fate.NodeFinal},
						},
					},
					"support": {
						Initial: "idle",
						States: map[string]S{
							"idle": {On: on[OrderCtx]("OPEN_TICKET", "open")},
							"open": {On: on[OrderCtx]("RESOLVE", "idle")},
						},
					},
				},
			},
		},
	}))
}

// ----- ticket: a backbone chain plus convergent and divergent events -----

// TicketCtx holds the category a triaged ticket is routed by and the
// approvals its review has collected.
type TicketCtx struct {
	Category  string `json:"category"`
	Approvals int    `json:"approvals"`
}

func categorize(category string) fate.TransitionConfig[TicketCtx, Event] {
	return fate.TransitionConfig[TicketCtx, Event]{
		Internal: true,
		Actions: []fate.Action[TicketCtx, Event]{
			fate.Assign(func(c TicketCtx, _ Event) TicketCtx { c.Category = category; return c }),
		},
	}
}

func routeTo(target, category string) fate.TransitionConfig[TicketCtx, Event] {
	t := fate.TransitionConfig[TicketCtx, Event]{Target: target}
	if category != "" {
		t.Guard = func(c TicketCtx, _ Event) bool { return c.Category == category }
	}
	return t
}

// Ticket is a support ticket. NEXT walks the main chain, CANCEL leaves from
// every open step, and ROUTE fans out from triage to one of three queues. In
// review, NEXT closes the ticket on the second approval and otherwise records
// one and stays.
func Ticket() *fate.Machine[TicketCtx, Event] {
	type S = fate.StateNodeConfig[TicketCtx, Event]
	step := func(pairs ...any) S {
		return S{On: on[TicketCtx](append(pairs, "CANCEL", "cancelled")...)}
	}
	return must(fate.CreateMachine(fate.MachineConfig[TicketCtx, Event]{
		ID:      "ticket",
		Initial: "new",
		States: map[string]S{
			"new": step("NEXT", "triaged",
				"MARK_BILLING", categorize("billing"),
				"MARK_TECHNICAL", categorize("technical")),
			"triaged": step(
				"ROUTE", routeTo("billing", "billing"),
				"ROUTE", routeTo("technical", "technical"),
				"ROUTE", routeTo("general", "")),
			"billing":     step("NEXT", "in_progress"),
			"technical":   step("NEXT", "in_progress"),
			"general":     step("NEXT", "in_progress"),
			"in_progress": step("NEXT", "review"),
			"review": step(
				"NEXT", fate.TransitionConfig[TicketCtx, Event]{
					Target: "closed",
					Guard:  func(c TicketCtx, _ Event) bool { return c.Approvals >= 1 },
				},
				"NEXT", fate.TransitionConfig[TicketCtx, Event]{
					Internal: true,
					Actions: []fate.Action[TicketCtx, Event]{
						fate.Assign(func(c TicketCtx, _ Event) TicketCtx { c.Approvals++; return c }),
					},
				},
				"REOPEN", "in_progress"),
			"closed":    {Type: fate.NodeFinal},
			"cancelled": {Type: fate.NodeFinal},
		},
	}))
}

func declaredEvents(states map[string]fate.StateNodeDescriptor) map[string]bool {
	out := map[string]bool{}
	for _, s := range states {
		for ev := range s.On {
			out[ev] = true
		}
		for ev := range declaredEvents(s.States) {
			out[ev] = true
		}
	}
	return out
}
