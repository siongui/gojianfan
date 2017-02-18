# cannot use relative path in GOROOT, otherwise 6g not found. For example,
#   export GOROOT=../go  (=> 6g not found)
# it is also not allowed to use relative path in GOPATH
export GOROOT=$(realpath ../go)
export GOPATH=$(realpath .)
export PATH := $(GOROOT)/bin:$(GOPATH)/bin:$(PATH)

PKG=github.com/siongui/gojianfan

test: fmt
	@echo "\033[92mTest ...\033[0m"
	@go test -v

fmt:
	@echo "\033[92mGo fmt source code...\033[0m"
	@go fmt *.go
	@go fmt example/*.go

demo: local
	@go run example/usage.go

local:
	@[ -d src/${PKG}/ ] || mkdir -p src/${PKG}/
	@cp *.go src/${PKG}/
