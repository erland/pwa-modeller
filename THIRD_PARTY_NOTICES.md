# Third-Party Notices

This project is licensed under the MIT License (see `LICENSE`). It depends on third‑party open‑source components.
When redistributing this project (source or bundled builds), you must also comply with the licenses below.

> Note: In typical npm workflows, the full license texts for dependencies are present in `node_modules/<package>/LICENSE*`
> after installation. The notices below highlight the **non‑MIT** licenses in this repository’s dependency tree that
> commonly require special attention.

## elkjs — EPL-2.0

- Package: `elkjs`
- License: Eclipse Public License 2.0 (EPL‑2.0)
- Source / license: https://github.com/kieler/elkjs

**Practical consequence:** If you modify `elkjs` itself and distribute the modified version, EPL‑2.0 requires that you
make those modifications available under EPL‑2.0 terms. Using the unmodified library as a dependency is generally
compatible with MIT licensing for *your* code, but you still must preserve its license notice when redistributing.

## caniuse-lite — CC-BY-4.0

- Package: `caniuse-lite`
- License: Creative Commons Attribution 4.0 International (CC BY 4.0)
- Source / license: https://github.com/browserslist/caniuse-lite

**Attribution:** “Can I use” data (via `caniuse-lite`) is licensed under CC BY 4.0.
If you redistribute the data (directly or as part of a bundle), you must provide appropriate attribution and indicate
if changes were made, per CC BY 4.0.

---

If you want a complete dependency license inventory, you can generate one from `package-lock.json` (e.g. with tools like
`license-checker`, `oss-license-checker`, or by parsing the lockfile).
