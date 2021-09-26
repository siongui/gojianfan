====================================================
Traditional and Simplified Chinese Conversion in Go_
====================================================

.. image:: https://img.shields.io/badge/Language-Go-blue.svg
   :target: https://golang.org/

.. image:: https://godoc.org/github.com/siongui/gojianfan?status.svg
   :target: https://godoc.org/github.com/siongui/gojianfan

.. image:: https://github.com/siongui/gojianfan/workflows/ci/badge.svg
    :target: https://github.com/siongui/gojianfan/blob/master/.github/workflows/ci.yml

.. image:: https://goreportcard.com/badge/github.com/siongui/gojianfan
   :target: https://goreportcard.com/report/github.com/siongui/gojianfan

.. image:: https://img.shields.io/badge/license-Unlicense-blue.svg
   :target: https://raw.githubusercontent.com/siongui/gojianfan/master/UNLICENSE

.. image:: https://img.shields.io/twitter/url/https/github.com/siongui/gojianfan.svg?style=social
   :target: https://twitter.com/intent/tweet?text=Wow:&url=%5Bobject%20Object%5D

Convert Traditional Chinese to/from Simplified Chinese in Go_.
This implementation is based on `python-jianfan`_, and is very primitive.
If you need advanced converter, visit OpenCC_ project, or pure Go implementation
of OpenCC [13]_.


Install
+++++++

.. code-block:: bash

  $ go get -u github.com/siongui/gojianfan


Usage
+++++

.. code-block:: go

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

Tested on:

  - `Go 1.17.1`_


UNLICENSE
+++++++++

Released in public domain. See UNLICENSE_.


References
++++++++++

.. [1] `Jianfan - A python library for translation between traditional and simplified chinese <https://code.google.com/archive/p/python-jianfan/>`_
.. [2] | `golang two way map - Google search <https://www.google.com/search?q=golang+two+way+map>`_
       | `golang map - Google search <https://www.google.com/search?q=golang+map>`_
.. [3] | `golang unicode - Google search <https://www.google.com/search?q=golang+unicode>`_
       | `Strings, bytes, runes and characters in Go - The Go Blog <https://blog.golang.org/strings>`_
       | `[Golang] Iterate Over UTF-8 Strings (non-ASCII strings) <https://siongui.github.io/2016/02/03/go-iterate-over-utf8-non-ascii-string/>`_
.. [4] | `golang const string - Google search <https://www.google.com/search?q=golang+const+string>`_
.. [5] | `golang package init - Google search <https://www.google.com/search?q=golang+package+init>`_
.. [6] `開放中文轉換 Open Chinese Convert (OpenCC) <http://opencc.byvoid.com/>`_
       (`source code <https://github.com/BYVoid/OpenCC>`__,
       `online doc <http://byvoid.github.io/OpenCC/>`__)
.. [7] `stevenyao/go-opencc · GitHub <https://github.com/stevenyao/go-opencc>`_
       (OpenCC wrapper for Golang, |godoc1|)
.. [8] `[Golang] Converter for Traditional and Simplified Chinese <https://siongui.github.io/2017/02/19/go-converter-of-traditional-and-simplified-chinese/>`_
.. [9] `godoctricks - GoDoc <https://godoc.org/github.com/fluhus/godoc-tricks>`_
.. [10] | `responsive textarea - Google search <https://www.google.com/search?q=responsive+textarea>`_
        | `responsive textarea - DuckDuckGo search <https://duckduckgo.com/?q=responsive+textarea>`_
        | `responsive textarea - Ecosia search <https://www.ecosia.org/search?q=responsive+textarea>`_
        | `responsive textarea - Bing search <https://www.bing.com/search?q=responsive+textarea>`_
        | `responsive textarea - Yahoo search <https://search.yahoo.com/search?p=responsive+textarea>`_
        | `responsive textarea - Baidu search <https://www.baidu.com/s?wd=responsive+textarea>`_
        | `responsive textarea - Yandex search <https://www.yandex.com/search/?text=responsive+textarea>`_
.. [11] `Go Report Card | Go project code quality report cards <https://goreportcard.com/>`_
.. [12] `Shields.io: Quality metadata badges for open source projects  <https://shields.io/>`_
.. [13] | `GitHub - liuzl/gocc: Golang version OpenCC 繁簡轉換 <https://github.com/liuzl/gocc>`_
        | `GitHub - sgoby/opencc: 基于OpenCC中文简繁体转换的golang开发包 <https://github.com/sgoby/opencc>`_

.. _Go: https://golang.org/
.. _python-jianfan: https://code.google.com/archive/p/python-jianfan/
.. _OpenCC: https://github.com/BYVoid/OpenCC
.. _Go 1.17.1: https://golang.org/dl/
.. _UNLICENSE: https://unlicense.org/

.. |godoc1| image:: https://godoc.org/github.com/stevenyao/go-opencc?status.png
   :target: https://godoc.org/github.com/stevenyao/go-opencc
