package main

import "testing"

func TestProxyEnvKey(t *testing.T) {
	for name, want := range map[string]string{
		"counter":     "FATE_PROXY_COUNTER",
		"order-v2":    "FATE_PROXY_ORDER_V2",
		"billing.api": "FATE_PROXY_BILLING_API",
		"café":        "FATE_PROXY_CAF_",
	} {
		if got := proxyEnvKey(name); got != want {
			t.Errorf("%s: got %s want %s", name, got, want)
		}
	}
}
