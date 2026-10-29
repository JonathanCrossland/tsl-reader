# TSL Reader

**Talesmith Language** (`.tsl`) is a JSON ebook format for the web. One file carries page layout, typography, and content blocks — aimed at a simpler, sharper reading experience than EPUB in the browser. The same file is used to construct the editor, for a seamless experience.

We want a single format to exist, capable of rendering in browser and elsewhere via a custom renderer. We are implementing the browser renderer here in the lab.

## Quick start

Serve this folder statically (e.g. XAMPP) and open **`lab/index.html`**. The lab loads **`spec/tsl-spec.tsl`** by default and includes sample documents.

**Talesmith Reader:** after lab looks correct, sync `player/` into the ientra repo with `php tooling/sync_tsl_reader_player.php` (from ientra root; requires this repo as `../tsl-reader`), rebuild the node, and test a published TSL reading copy in the Reader plugin.

## Layout

| Path | Purpose |
|------|---------|
| `spec/` | Format specification (`tsl-spec.tsl`) |
| `player/` | Reference renderer (`tsl.js`, `tsl.css`, `dropcap-glyphs.json`) |
| `lab/` | Interactive player and reading-settings demo — **prove player changes here first** |
| `examples/` | Focused block demos (`rich-content.tsl`, `print-layout.tsl`) |

## Synced

The project is now synced with the Talesmith Studio Writer/Reader.

## License

MIT — see [LICENSE](LICENSE).
