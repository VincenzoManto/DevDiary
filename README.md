# Dev Diary

Dev Diary is the ultimate local developer diary for automatic code time tracking. It provides a dashboard and programmer profile to help developers monitor their productivity and coding habits.

## Features

- **Automatic Code Time Tracking**: Tracks the time spent coding automatically.
- **Dashboard**: Displays a detailed view of your coding activity.
- **Status Bar Integration**: Shows today's coding time directly in the VS Code status bar.
- **Customizable Commands**: Includes a command to open the dashboard.

## Installation

1. Clone this repository or download the source code.
2. Run `npm install` to install dependencies.
3. Build the extension using `npm run compile`.
4. Open the project in VS Code and press `F5` to launch the extension in a new Extension Development Host window.

## Usage

- **Show Dashboard**: Use the command `Dev Diary: Show Dev Diary Dashboard` from the Command Palette (`Ctrl+Shift+P` or `Cmd+Shift+P` on macOS).
- **Status Bar**: View your daily coding time in the VS Code status bar.

## Development

### Prerequisites

- Node.js (latest LTS version recommended)
- VS Code
- TypeScript

### Scripts

- `npm run compile`: Compiles the TypeScript code.
- `npm run watch`: Watches for changes and recompiles the code.
- `npm run lint`: Lints the code using ESLint.
- `npm test`: Runs the tests.

### File Structure

- **`src/extension.ts`**: Main entry point for the extension.
- **`package.json`**: Extension metadata and configuration.
- **`media/`**: Contains assets like icons.

## Contributing

Contributions are welcome! Feel free to open issues or submit pull requests.

## License

This project is licensed under the MIT License. See the `LICENSE` file for details.

## Acknowledgments

- Built with the VS Code API.
- Inspired by the need for better developer productivity tools.  