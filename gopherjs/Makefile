# cannot use relative path in GOROOT, otherwise 6g not found. For example,
#   export GOROOT=../go  (=> 6g not found)
# it is also not allowed to use relative path in GOPATH
export GOROOT=$(realpath ../../go)
export GOPATH=$(realpath .)
export PATH := $(GOROOT)/bin:$(GOPATH)/bin:$(PATH)

PKG="github.com/siongui/gojianfan"
GO_VERSION=1.8
DEV_DIR=../
OUTPUTSITE=website/

devserver: fmt local js
	@echo "\033[92mDevelopment Server Running ...\033[0m"
	@go run devserver/server.go -dir=.

js:
	@echo "\033[92mGenerating JavaScript ...\033[0m"
	@gopherjs build app.go -o app.js

fmt:
	@echo "\033[92mGo fmt source code...\033[0m"
	@go fmt *.go
	@go fmt devserver/*.go

local:
	@[ -d src/${PKG}/ ] || mkdir -p src/${PKG}/
	@cp ../*.go src/${PKG}/

install:
	@echo "\033[92mInstalling GopherJS ...\033[0m"
	go get -u github.com/gopherjs/gopherjs
	@echo "\033[92mInstalling godom ...\033[0m"
	go get -u github.com/siongui/godom

clean:
	rm -rf bin/ pkg/ src/

gensite: js
	@echo "\033[92mOutput website ...\033[0m"
	@[ -d ${OUTPUTSITE} ] || mkdir -p ${OUTPUTSITE}
	mv app.js app.js.map ${OUTPUTSITE}
	cp index.html ${OUTPUTSITE}
	cp -r zh/ ${OUTPUTSITE}
