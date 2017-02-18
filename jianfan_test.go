package gojianfan

import (
	"testing"
)

var testMapping = map[string]string{
	"臺灣": "台湾",
	"高雄": "高雄",
	"橋頭": "桥头",
	"橋エキサイトIDで、翻訳をもっと便利に頭": "桥エキサイトIDで、翻訳をもっと便利に头",
	"臺灣 taiwan":            "台湾 taiwan",
	"臺灣 No. 1":             "台湾 No. 1",
	"Taiwan No. 1":         "Taiwan No. 1",
	//"臺灣 taiwan 台湾":         "台湾 taiwan 台湾",
}

func TestGoJianfan(t *testing.T) {
	for cht, chs := range testMapping {
		if T2S(cht) != chs {
			t.Error(cht + "(" + chs + ")" + "->" + T2S(cht))
		}
		if S2T(chs) != cht {
			t.Error(chs + "(" + cht + ")" + "->" + S2T(chs))
		}
	}
}
