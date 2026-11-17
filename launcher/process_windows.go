package main

import (
	"strings"
	"syscall"
)

const (
	createNoWindow         = 0x08000000
	createBreakawayFromJob = 0x01000000
)

// Ways to start the logger, in order of preference. The first leaves any job
// pomitu runs in, so that whatever closes that job can't take the app down with
// it. A job that doesn't allow leaving it refuses that start, so the second stays
// in it.
func loggerAttrs() []*syscall.SysProcAttr {
	return []*syscall.SysProcAttr{
		{CreationFlags: createNoWindow | createBreakawayFromJob},
		{CreationFlags: createNoWindow},
	}
}

// The app shares the logger's hidden console and its job
func appAttrs(req request) *syscall.SysProcAttr {
	attrs := &syscall.SysProcAttr{}
	if req.Verbatim {
		attrs.CmdLine = strings.Join(req.Args, " ")
	}
	return attrs
}

// pomitu resolves the program on Windows already
func resolveProgram(req request) (string, error) {
	return req.File, nil
}

// taskkill /F ends the logger without a signal, so nothing to do
func keepRunningOnStop() {}
