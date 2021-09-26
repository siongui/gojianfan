# cannot use relative path in GOROOT, otherwise 6g not found. For example,
#   export GOROOT=../go  (=> 6g not found)
# it is also not allowed to use relative path in GOPATH
ifndef GOROOT
export GOROOT=$(realpath ../go)
export PATH := $(GOROOT)/bin:$(PATH)
endif

test: fmt
	@echo "\033[92mTest ...\033[0m"
	@go test -v -race

fmt:
	@echo "\033[92mGo fmt source code...\033[0m"
	@go fmt *.go
	@go fmt example/*.go

demo:
	@go run example/usage.go

modinit:
	go mod init github.com/siongui/gojianfan

modtidy:
	go mod tidy
