// Package gojianfan provides Traditional and Simplified Chinese Conversion in
// Go.
//
// This is a primitive implementation of Chinese conversion, based on
// python-jianfan https://code.google.com/archive/p/python-jianfan/
// . If you need more advanced converter, please visit OpenCC
// https://github.com/BYVoid/OpenCC
// . Or pure Go implementation of OpenCC:
// https://github.com/liuzl/gocc and https://github.com/sgoby/opencc
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

// T2S converts Traditional Chinese to Simplified Chinese
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

// S2T converts Simplified Chinese to Traditional Chinese
func S2T(s string) string {
	// FIXME: 注 => 註 (Simplified => Traditional) for all cases
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
