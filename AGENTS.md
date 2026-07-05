# Repository Guidelines

## Project Structure & Module Organization

`opcut` is a Tauri 2 macOS tray app with a React/Vite frontend. Frontend code lives in `client/src`: reusable UI is in `client/src/components`, hooks in `client/src/hooks`, shared helpers in `client/src/lib`, and app-wide types in `client/src/types.ts`. Rust backend code lives in `src-tauri/src`, with command handlers in `commands.rs`, configuration in `config.rs`, and app integration in `app_manager.rs`. Tauri configuration and permissions are in `src-tauri/tauri.conf.json` and `src-tauri/capabilities/default.json`. Static assets include `logo.svg` and Tauri icons under `src-tauri/icons`.

## Build, Test, and Development Commands

Use Bun for JavaScript dependencies and scripts:

- `bun install`: install frontend and Tauri CLI dependencies.
- `bun run dev`: start the Tauri app with Vite hot reload.
- `bun run dev:client`: run only the Vite frontend.
- `bun run build`: type-check TypeScript and build the web assets.
- `bun run lint`: run ESLint over TypeScript and React files.
- `bun run tauri build`: build the packaged macOS app; output is under `src-tauri/target/release/bundle/macos/`.

## Coding Style & Naming Conventions

TypeScript and React use ES modules, functional components, and hooks. Keep components in PascalCase files such as `SearchBar.tsx`; hooks should start with `use`, such as `useKeyboardNav.ts`; utility modules use lower camel case names such as `parseQuery.ts`. Follow the existing two-space indentation style in TSX/CSS and four-space Rust formatting. Run `bun run lint` before submitting frontend changes and `cargo fmt --manifest-path src-tauri/Cargo.toml` before submitting Rust changes.

## Testing Guidelines

There is currently no dedicated automated test script in `package.json`. For now, validate changes with `bun run lint`, `bun run build`, and targeted manual checks in `bun run dev`. For Rust-only changes, also run `cargo check --manifest-path src-tauri/Cargo.toml`. If adding tests, colocate frontend tests near the relevant component or helper and name them after the unit under test, for example `parseQuery.test.ts`.

## Commit & Pull Request Guidelines

Recent history uses short Conventional Commit-style subjects such as `feat: shell mode ui and result row` and `fix: route opt+digit to slot assign when launcher open`. Keep commit messages imperative, scoped, and lowercase after the type. Pull requests should include a clear behavior summary, verification commands run, linked issues if applicable, and screenshots or short recordings for UI changes.

## Security & Configuration Tips

Be careful when changing global shortcut behavior, shell command execution, or Tauri capabilities. Keep permission changes minimal and document why any new capability is required.
