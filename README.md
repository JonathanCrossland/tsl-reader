# TSL Reader

**Talesmith Language** (`.tsl`) is a JSON ebook format for the web. One file carries page layout, typography, and content blocks—aimed at a simpler, sharper reading experience than EPUB in the browser. The same file is used to construct the editor, for a seamless experience.

## Quick start

Serve this folder statically (e.g. XAMPP) and open **`lab/index.html`**. The lab loads **`spec/tsl-spec.tsl`** by default and includes sample documents.

## Layout

| Path | Purpose |
|------|---------|
| `spec/` | Format specification (`tsl-spec.tsl`) |
| `player/` | Reference renderer (`talesmith.js`, `talesmith.css`) |
| `lab/` | Interactive player and reading-settings demo |
| `examples/` | Focused block demos (`rich-content.tsl`, `print-layout.tsl`) |

## License

MIT — see [LICENSE](LICENSE).
