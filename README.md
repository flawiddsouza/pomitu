# Pomitu

Pomitu is a simple process manager inspired by PM2

## Installation

To install Pomitu globally, run:

```sh
npm install -g pomitu
```

## Usage

Pomitu provides several commands to manage your applications:

### Start an application

```sh
pomitu start <config-file>
```

This command starts and daemonizes an app based on the configuration file provided.

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
```

## Development

If you want to contribute to Pomitu or run it in development mode:

1. Clone the repository
2. Install dependencies:
   ```sh
   npm install
   ```
3. Run in development mode:
   ```sh
   npm run dev
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

To build and run:
```sh
npm start
```

## License

[ISC License](LICENSE)
