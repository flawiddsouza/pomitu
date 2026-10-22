// Windows only. Starts an app with a hidden console of its own, prints its pid and
// exits, leaving the app running. Every console program the app starts shares that
// console, so none of them opens a window.
//
// Node can't start a process this way. Without `detached` it kills the process when
// Node exits, and with `detached` the process gets no console at all, so each console
// program it runs opens a new visible one.
//
// Reads a JSON request on stdin. Go passes the app only the handles it is given,
// unlike a plain CreateProcess, so the app can't hold pomitu's pipes open.
package main

import (
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"strings"
	"syscall"
)

type request struct {
	// Path of the program to run
	File string `json:"file"`
	// Arguments, the first being the program name
	Args []string `json:"args"`
	// Args are already escaped for cmd.exe, so join them as they are
	Verbatim bool     `json:"verbatim"`
	Cwd      string   `json:"cwd"`
	Env      []string `json:"env"`
	Stdout   string   `json:"stdout"`
	Stderr   string   `json:"stderr"`
}

const (
	createNoWindow         = 0x08000000
	createBreakawayFromJob = 0x01000000
)

func main() {
	pid, err := run()
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	fmt.Print(pid)
}

func run() (int, error) {
	var req request
	if err := json.NewDecoder(os.Stdin).Decode(&req); err != nil {
		return 0, fmt.Errorf("invalid request: %w", err)
	}

	stdout, err := os.OpenFile(req.Stdout, os.O_WRONLY|os.O_CREATE|os.O_APPEND, 0o644)
	if err != nil {
		return 0, err
	}
	defer stdout.Close()
	stderr, err := os.OpenFile(req.Stderr, os.O_WRONLY|os.O_CREATE|os.O_APPEND, 0o644)
	if err != nil {
		return 0, err
	}
	defer stderr.Close()

	start := func(creationFlags uint32) (int, error) {
		cmd := &exec.Cmd{
			Path:   req.File,
			Args:   req.Args,
			Dir:    req.Cwd,
			Env:    req.Env,
			Stdout: stdout,
			Stderr: stderr,
			SysProcAttr: &syscall.SysProcAttr{
				CreationFlags: creationFlags,
			},
		}
		if req.Verbatim {
			cmd.SysProcAttr.CmdLine = strings.Join(req.Args, " ")
		}
		if err := cmd.Start(); err != nil {
			return 0, err
		}
		pid := cmd.Process.Pid
		cmd.Process.Release()
		return pid, nil
	}

	// Leave any job pomitu runs in, so that whatever closes that job can't take the
	// app down with it
	pid, err := start(createNoWindow | createBreakawayFromJob)
	if err != nil {
		// A job that doesn't allow leaving it refuses the start, so stay in it
		pid, err = start(createNoWindow)
	}
	return pid, err
}
