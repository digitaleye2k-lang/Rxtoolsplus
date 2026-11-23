# Rx Tools Max+

Offline pharmacy dispensing helpers, as an Android app and a web app.

| Tool | What it does |
|---|---|
| **Labels** | Searchable list of label instructions. Edit, copy or print as an 80×40mm label or A4. Save your own custom labels, and export/import them. |
| **Prednisolone** | Two-phase reducing chart (e.g. 40mg → 10mg by 5mg weekly, then 1mg weekly). Editable steps, tablet breakdown for 5mg / 2.5mg / 1mg, total tablets needed, printable patient chart. |
| **Sulfasalazine** | 500mg titration chart up to 1–3g daily, printable. |
| **Eye drops** | Bottle/unit supply calculator (allows for one or both eyes and the 28-day discard), plus a printable 7-day tick chart for several drops. |

Everything runs on the device — no internet connection and no data leaves the phone.

## Install on Android
Open the **[Releases](../../releases/latest)** page on your phone, download the `.apk` and open it. Each push to `main` builds a new release, and new versions install as updates over the old one.

## Use in a browser
Once GitHub Pages is on (Settings → Pages → Source: **GitHub Actions**), the app is at `https://digitaleye2k-lang.github.io/Rxtoolsplus/` and can be installed to the home screen.

## Project layout
```
web/        the app (HTML/CSS/JS, no build step, no CDN)
  js/logic.js   all dose calculations (pure functions)
  js/data.js    built-in label instructions — edit to add/change labels
android/    WebView wrapper that bundles web/ as assets (print, copy, file save)
tests/      node --test tests/logic.test.js
```

> For use by pharmacy professionals. Always check every output against the prescription before dispensing.
