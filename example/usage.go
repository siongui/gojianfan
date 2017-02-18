package main

import (
	"fmt"
	"github.com/siongui/gojianfan"
)

func main() {
	// Traditional Chinese to Simplified Chinese
	fmt.Println(gojianfan.T2S("橋頭"))

	// Simplified Chinese to Traditional Chinese
	fmt.Println(gojianfan.S2T("桥头"))
}
