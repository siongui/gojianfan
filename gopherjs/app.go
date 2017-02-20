package main

import (
	. "github.com/siongui/godom"
	"github.com/siongui/gojianfan"
)

func main() {
	i := Document.QuerySelector("#info")

	Document.QuerySelector("#tot").AddEventListener("click", func(e Event) {
		i.SetValue(gojianfan.S2T(i.Value()))
	})
	Document.QuerySelector("#tos").AddEventListener("click", func(e Event) {
		i.SetValue(gojianfan.T2S(i.Value()))
	})
}
