// Starts an app under a logger, prints the logger's pid and exits, leaving both
// running. The logger writes the app's output to the log files with the time in
// front of each line, writes when the app started and exited, and exits after the
// app does. Stopping the logger's process tree, or on Linux and macOS its process
// group, stops the app.
//
// On Windows the logger gets a hidden console of its own and the app shares it, so
// no console program the app starts opens a window. Node can't start a process this
// way. Without `detached` it kills the process when Node exits, and with `detached`
// the process gets no console at all, so each console program it runs opens a new
// visible one.
//
// Reads a JSON request on stdin. Go passes a process only the handles it is given,
// so neither the logger nor the app can hold pomitu's pipes open.
package main

import (
	"bufio"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"strconv"
	"strings"
	"sync"
	"time"
)

type request struct {
	// Program to run. On Linux and macOS a bare name is looked up on the PATH in Env.
	File string `json:"file"`
	// Arguments, the first being the program name
	Args []string `json:"args"`
	// Windows only: Args are already escaped for cmd.exe, so join them as they are
	Verbatim bool     `json:"verbatim"`
	Cwd      string   `json:"cwd"`
	Env      []string `json:"env"`
	Stdout   string   `json:"stdout"`
	Stderr   string   `json:"stderr"`
}

const (
	loggerFlag = "--logger"
	// How long the logger keeps copying output after the app exits, for programs
	// the app started that still write to it
	drainAfterExit = 2 * time.Second
	timeLayout     = "2006-01-02 15:04:05.000"
)

func main() {
	if len(os.Args) > 1 && os.Args[1] == loggerFlag {
		runLogger()
		return
	}
	pid, err := launch()
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	fmt.Print(pid)
}

// Starts the logger and waits for it to report whether the app started
func launch() (int, error) {
	req, err := io.ReadAll(os.Stdin)
	if err != nil {
		return 0, fmt.Errorf("could not read the request: %w", err)
	}
	self, err := os.Executable()
	if err != nil {
		return 0, err
	}

	var logger *exec.Cmd
	var reply io.ReadCloser
	for _, attrs := range loggerAttrs() {
		logger = exec.Command(self, loggerFlag)
		logger.SysProcAttr = attrs
		var stdin io.WriteCloser
		if stdin, err = logger.StdinPipe(); err != nil {
			return 0, err
		}
		if reply, err = logger.StdoutPipe(); err != nil {
			return 0, err
		}
		if err = logger.Start(); err == nil {
			stdin.Write(req)
			stdin.Close()
			break
		}
	}
	if err != nil {
		return 0, err
	}

	// The logger replies "ok" once the app has started, or the reason it couldn't
	line, _ := bufio.NewReader(reply).ReadString('\n')
	if line != "ok\n" {
		logger.Wait()
		if line == "" {
			return 0, errors.New("the logger exited without starting the app")
		}
		return 0, errors.New(strings.TrimSuffix(line, "\n"))
	}
	pid := logger.Process.Pid
	logger.Process.Release()
	return pid, nil
}

func runLogger() {
	fail := func(err error) {
		fmt.Fprintln(os.Stdout, err)
		os.Exit(1)
	}

	var req request
	if err := json.NewDecoder(os.Stdin).Decode(&req); err != nil {
		fail(fmt.Errorf("invalid request: %w", err))
	}
	program, err := resolveProgram(req)
	if err != nil {
		fail(err)
	}

	stdoutLog, err := os.OpenFile(req.Stdout, os.O_WRONLY|os.O_CREATE|os.O_APPEND, 0o644)
	if err != nil {
		fail(err)
	}
	stderrLog, err := os.OpenFile(req.Stderr, os.O_WRONLY|os.O_CREATE|os.O_APPEND, 0o644)
	if err != nil {
		fail(err)
	}
	stdoutRead, stdoutWrite, err := os.Pipe()
	if err != nil {
		fail(err)
	}
	stderrRead, stderrWrite, err := os.Pipe()
	if err != nil {
		fail(err)
	}

	keepRunningOnStop()
	app := &exec.Cmd{
		Path:        program,
		Args:        req.Args,
		Dir:         req.Cwd,
		Env:         req.Env,
		Stdout:      stdoutWrite,
		Stderr:      stderrWrite,
		SysProcAttr: appAttrs(req),
	}
	if err := app.Start(); err != nil {
		fail(err)
	}
	// The app holds its own copies, so the pipes close when it and everything it
	// started are done writing
	stdoutWrite.Close()
	stderrWrite.Close()

	stdout := &timestampedLog{file: stdoutLog, atLineStart: true}
	stderr := &timestampedLog{file: stderrLog, atLineStart: true}
	event := fmt.Sprintf("pomitu: started pid %d", app.Process.Pid)
	stdout.event(event)
	stderr.event(event)
	fmt.Fprintln(os.Stdout, "ok")
	os.Stdout.Close()

	var copying sync.WaitGroup
	copying.Add(2)
	go func() { defer copying.Done(); io.Copy(stdout, stdoutRead) }()
	go func() { defer copying.Done(); io.Copy(stderr, stderrRead) }()

	state, err := app.Process.Wait()
	switch {
	case err != nil:
		event = fmt.Sprintf("pomitu: lost track of the app: %v", err)
	case state.ExitCode() >= 0:
		event = "pomitu: exited with code " + strconv.Itoa(state.ExitCode())
	default:
		// Ended by a signal, on Linux and macOS
		event = "pomitu: exited, " + state.String()
	}

	copied := make(chan struct{})
	go func() { copying.Wait(); close(copied) }()
	select {
	case <-copied:
	case <-time.After(drainAfterExit):
	}
	stdout.event(event)
	stderr.event(event)
}

// Puts the time in front of each line written to the file
type timestampedLog struct {
	mu          sync.Mutex
	file        *os.File
	atLineStart bool
}

func (l *timestampedLog) Write(data []byte) (int, error) {
	l.mu.Lock()
	defer l.mu.Unlock()
	stamp := []byte(time.Now().Format(timeLayout) + " ")
	out := make([]byte, 0, len(data)+len(stamp)*2)
	for _, b := range data {
		if l.atLineStart {
			out = append(out, stamp...)
			l.atLineStart = false
		}
		out = append(out, b)
		if b == '\n' {
			l.atLineStart = true
		}
	}
	// Report the whole input as written, since a short write would end io.Copy
	// and the app would then block on a full pipe
	l.file.Write(out)
	return len(data), nil
}

// Writes a line of pomitu's own, on a line of its own
func (l *timestampedLog) event(message string) {
	l.mu.Lock()
	defer l.mu.Unlock()
	line := time.Now().Format(timeLayout) + " " + message + "\n"
	if !l.atLineStart {
		line = "\n" + line
		l.atLineStart = true
	}
	l.file.WriteString(line)
}
