<p align="center">
  <img src="logo.svg" width="120" />
</p>

<h1 align="center">opcut</h1>

<p align="center">
  A lightweight macOS tray app for getting more cuts from your <kbd>Option</kbd> (aka <kbd>Alt</kbd>) key
</p>

<p align="center">
  <img src="https://img.shields.io/github/license/notkearash/opcut?style=flat-square" />
  <img src="https://img.shields.io/github/v/release/notkearash/opcut?style=flat-square" />
</p>

---

## Build

Prerequisites: [Rust](https://rustup.rs/), [Bun](https://bun.sh/)

```bash
bun install
bun run build
```

The bundled `.app` will be in `src-tauri/target/release/bundle/macos/`.

## Development

```bash
bun run dev
```

This starts Vite and the Tauri dev window with hot reload.
