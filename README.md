# Pomitu

Pomitu is a simple process manager inspired by PM2

## Installation

To install Pomitu globally, run:

```sh
npm install -g pomitu
```

## Usage

Pomitu provides several commands to manage your applications:

Pomitu works with one config at a time. `pomitu start` sets it, and every other command uses it.

Apps run in the background. They keep running after the command or the TUI exits. On Windows, console programs they run don't open windows.

### Start the apps in a config

```sh
pomitu start <config-file>
```

This command starts every app in the config in the background. Apps already running are left alone. To switch to a different config, stop the running apps first with `pomitu stop all`.

#### Options

- `--clear-logs` - Clear the log files of the apps it starts

### Interactive mode (TUI)

```sh
pomitu tui
```

Opens a Terminal User Interface for the apps in the config, which allows you to:
- View the status of all apps in real-time
- Start, stop, and restart individual apps
- Navigate with arrow keys
- Press `r` to reload the config file
- Press `q` to quit. The apps keep running

### Restart an application

```sh
pomitu restart <name>
```

This command restarts an app with its current entry in the config, or starts it if it is stopped.

### Reload the config

```sh
pomitu reload
```

This command rereads the config file, the same as pressing `r` in the TUI. Running apps that are no longer in the config are stopped. It exits with an error if the config is invalid. An open TUI shows config changes only after you press `r` in it.

### Stop an application

```sh
pomitu stop <name>
```

This command stops a running app. Use `pomitu stop all` to stop all running apps.

### List running applications

```sh
pomitu ls
```

This command lists all currently running applications managed by Pomitu.

### Flush logs

```sh
pomitu flush [name]
```

This command flushes the logs for all apps or a specific app if a name is provided.

## Configuration

Pomitu uses a YAML configuration file to define the applications you want to manage. Here's an example structure:

```yaml
apps:
  - name: "App 1"
    cwd: "/path/to/app1"
    run: "npm start"
  - name: "App 2"
    cwd: "/path/to/app2"
    run: "node server.js"
    env:
      PORT: 3000
```

`env` sets environment variables for that app.

On Windows, an app gets the environment variables stored in Windows for your account and the system, the same ones a program opened from Explorer gets, plus its `env`. Variables set only in the shell that runs pomitu don't reach it, so an app behaves the same whoever starts it. On Linux and macOS, an app gets the environment of the shell that runs pomitu, plus its `env`.

## Development

If you want to contribute to Pomitu or run it in development mode:

1. Clone the repository
2. Install dependencies, plus [Go](https://go.dev/dl/) for building the Windows launcher:
   ```sh
   npm install
   ```
3. Build once, since starting apps on Windows needs `dist/launcher.exe`:
   ```sh
   npm run build
   ```
4. Run in development mode:
   ```sh
   npm run dev
   ```

Dev installation test:

```sh
npm run build && npm pack && npm install -g pomitu-1.6.0.tgz && rm pomitu-1.6.0.tgz
```

### Linting

To lint the code:
```sh
npm run lint
```

To lint and auto-fix:
```sh
npm run lint-fix
```

### Building

To build the project:
```sh
npm run build
```

This also builds `launcher/main.go` into `dist/launcher.exe`. On Windows, pomitu starts each app through it, because Node can't start a process that both outlives it and has a hidden console. The launcher starts the app and exits, so it doesn't stay running.

To build and run:
```sh
npm start
```

## License

[ISC License](LICENSE)
