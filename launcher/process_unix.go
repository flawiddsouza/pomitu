//go:build !windows

package main

import (
	"errors"
	"fmt"
	"os"
	"os/signal"
	"path/filepath"
	"strings"
	"syscall"
)

// The logger leads a new session and process group, so closing the terminal that
// ran pomitu doesn't end it. The app joins that group, which pomitu signals to stop
// both.
func loggerAttrs() []*syscall.SysProcAttr {
	return []*syscall.SysProcAttr{{Setsid: true}}
}

func appAttrs(request) *syscall.SysProcAttr {
	return nil
}

// Looks a bare program name up on the PATH the app gets, the way Node does for
// the environment it is given. A path with a slash is used as it is, relative to
// the app's directory.
func resolveProgram(req request) (string, error) {
	if strings.Contains(req.File, "/") {
		return req.File, nil
	}
	path := ""
	for _, variable := range req.Env {
		if value, found := strings.CutPrefix(variable, "PATH="); found {
			path = value
		}
	}
	for _, dir := range filepath.SplitList(path) {
		if dir == "" {
			dir = "."
		}
		candidate := filepath.Join(dir, req.File)
		if !filepath.IsAbs(candidate) {
			candidate = filepath.Join(req.Cwd, candidate)
		}
		if info, err := os.Stat(candidate); err == nil && info.Mode().IsRegular() && info.Mode()&0o111 != 0 {
			return candidate, nil
		}
	}
	return "", fmt.Errorf("%s: %w", req.File, errors.New("not found on the PATH"))
}

// Stopping signals the whole group. The logger keeps running until the app exits,
// so it still records the app's last output and how it ended. Catching the signals
// rather than ignoring them leaves the app their default handling.
func keepRunningOnStop() {
	signal.Notify(make(chan os.Signal, 1), syscall.SIGTERM, syscall.SIGINT, syscall.SIGHUP)
}
