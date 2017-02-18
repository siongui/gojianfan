package gojianfan

import (
	"unicode/utf8"
)

var t2sMapping = make(map[rune]rune)
var s2tMapping = make(map[rune]rune)

func init() {
	if len(ChT) != len(ChS) {
		panic("cht and chs data length not equal")
	}

	for index, runeValueT := range ChT {
		runeValueS, _ := utf8.DecodeRuneInString(ChS[index:])
		t2sMapping[runeValueT] = runeValueS
		s2tMapping[runeValueS] = runeValueT
	}
}

func T2S(s string) string {
	var chs []rune
	for _, runeValue := range s {
		v, ok := t2sMapping[runeValue]
		if ok {
			chs = append(chs, v)
		} else {
			chs = append(chs, runeValue)
		}
	}
	return string(chs)
}

func S2T(s string) string {
	var cht []rune
	for _, runeValue := range s {
		v, ok := s2tMapping[runeValue]
		if ok {
			cht = append(cht, v)
		} else {
			cht = append(cht, runeValue)
		}
	}
	return string(cht)
}
